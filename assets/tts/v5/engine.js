/* GPT-SoVITS V5 瀏覽器端推論引擎
 *
 * 依序載入九張 ONNX、用完即丟，控制記憶體峰值。
 * 對照來源：GPT_SoVITS/TTS_infer_pack/TTS.py 的 using_vocoder_synthesis
 */
(function (root) {
  "use strict";

  var ORT = null, SESS = {}, CFG = null;

  // models_v5.py 的常數
  var V5 = { TEMP: 0.875, REF: 500, MAX_TGT: 640, TOTAL: 1000, TAIL: 32, STEPS: 4, CFG_RATE: 0.0 };
  // TTS.py 的頻譜常數
  var SPEC = { MIN: -12, MAX: 2, FILTER: 2048, HOP: 640, WIN: 2048, SR: 32000 };

  function log(msg) { if (CFG && CFG.onLog) CFG.onLog(msg); }

  async function session(name, path, opts) {
    if (SESS[name]) return SESS[name];
    if (CFG && CFG.sessionProvider) {          // 由呼叫端提供（例如從瀏覽器模型倉庫）
      SESS[name] = await CFG.sessionProvider(name);
      return SESS[name];
    }
    const t0 = performance.now();
    const buf = new Uint8Array(await (await fetch(path)).arrayBuffer());
    log(`載入 ${name} ${(buf.length / 1e6).toFixed(0)} MB`);
    SESS[name] = await ORT.InferenceSession.create(buf, Object.assign({ executionProviders: ['wasm'] }, opts || {}));
    log(`  ${name} 就緒 ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    return SESS[name];
  }

  function dispose(name) { delete SESS[name]; if (root.gc) root.gc(); }

  // ── 文字 → BERT 特徵 ─────────────────────────────────
  function tokenize(text, vocab) {
    const ids = [101];
    for (const ch of text) {
      const id = vocab[ch];
      ids.push(id === undefined ? 100 : id);      // 100 = [UNK]
    }
    ids.push(102);
    return ids;
  }

  async function bertFeatures(text, word2ph, paths) {
    const vocab = await (await fetch(paths.vocab)).json();
    const ids = tokenize(text, vocab);
    const s = await session('roberta', paths.roberta);
    const out = await s.run({
      input_ids: new ORT.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      attention_mask: new ORT.Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]),
    });
    const hidden = out.hidden;                    // [1, T, 1024]
    const T = hidden.dims[1] - 2, D = hidden.dims[2];   // 去掉 [CLS] / [SEP]
    if (T !== word2ph.length) throw new Error(`BERT 長度 ${T} 與 word2ph ${word2ph.length} 不符`);
    const P = word2ph.reduce((a, b) => a + b, 0);
    const feat = new Float32Array(D * P);          // 維度在前：[1024, P]，同 Python 的 .T
    let o = 0;
    for (let i = 0; i < T; i++) {
      const off = (i + 1) * D;
      for (let r = 0; r < word2ph[i]; r++) {
        for (let d = 0; d < D; d++) feat[d * P + o] = hidden.data[off + d];
        o++;
      }
    }
    return { data: feat, dim: D, len: o, ids: ids };
  }

  // ── 參考音：HuBERT → 語意碼；線性頻譜 → 音色向量 ──────
  async function refEncode(ssl, refPhones, spec, paths) {
    const sh = await session('extract_latent', paths.extractLatent);
    const lat = await sh.run({ ssl: new ORT.Tensor('float32', ssl, [1, 768, ssl.length / 768]) });
    const codes = lat.codes;                       // [1,1,N]

    const sr = await session('refenc', paths.refenc);
    const ge = (await sr.run({ refer: new ORT.Tensor('float32', spec, [1, 1025, spec.length / 1025]) })).ge;
    return { codes, ge };
  }

  async function decodeEncp(codes, phones, ge, paths) {
    const s = await session('decode_encp', paths.decodeEncp);
    const out = await s.run({
      codes: new ORT.Tensor('int64', BigInt64Array.from(codes.map(BigInt)), [1, 1, codes.length]),
      text: new ORT.Tensor('int64', BigInt64Array.from(phones.map(BigInt)), [1, phones.length]),
      ge: ge,
    });
    return out.fea;                                // [1,512,T]
  }

  // ── AR：語意碼產生 ────────────────────────────────────
  async function arLoop(bertIn, allPhones, refCodes, paths, maxSteps) {
    const se = await session('ar_enc', paths.arEnc);
    const sf = await session('ar_fsdec', paths.arFsdec);
    const ss = await session('ar_sdec', paths.arSdec);
    const e = await se.run({
      ref_seq: new ORT.Tensor('int64', BigInt64Array.from(allPhones.ref.map(BigInt)), [1, allPhones.ref.length]),
      text_seq: new ORT.Tensor('int64', BigInt64Array.from(allPhones.tgt.map(BigInt)), [1, allPhones.tgt.length]),
      ref_bert: new ORT.Tensor('float32', bertIn.ref, [allPhones.ref.length, 1024]),
      text_bert: new ORT.Tensor('float32', bertIn.tgt, [allPhones.tgt.length, 1024]),
      ssl_content: new ORT.Tensor('float32', bertIn.ssl, [1, 768, bertIn.ssl.length / 768]),
    });
    let st = await sf.run({
      x: e.x, prompts: new ORT.Tensor('int64', BigInt64Array.from(refCodes.map(BigInt)), [1, refCodes.length]),
    });
    const toks = [];
    for (let i = 0; i < (maxSteps || 1500); i++) {
      const o = await ss.run({ iy: st.y, ik: st.k, iv: st.v, iy_emb: st.y_emb, ix_example: st.x_example });
      const t = Number(o.samples.data[0]);
      if (t === 1024) break;                       // EOS
      toks.push(t);
      st = o;
    }
    return toks;
  }

  // ── CFM：分塊 ＋ 4 步 Euler ──────────────────────────
  async function cfm(feaRef, feaTodo, refMel, paths) {
    const s = await session('dit', paths.dit);
    const D = feaRef.dims[1];
    const refFrames0 = Math.min(refMel.dims[2], feaRef.dims[2]);
    const slice = (t, from, to) => {
      // [1,C,T] 切片（回傳新的 Float32Array）
      const d = t.dims, C = d[1], out = new Float32Array(C * (to - from));
      for (let c = 0; c < C; c++)
        for (let i = from; i < to; i++) out[c * (to - from) + (i - from)] = t.data[c * d[2] + i];
      return { data: out, dims: [1, C, to - from] };
    };
    const tailSlice = (t, n) => slice(t, t.dims[2] - n, t.dims[2]);
    const cat = (a, b) => {
      const C = a.dims[1], n1 = a.dims[2], n2 = b.dims[2], out = new Float32Array(C * (n1 + n2));
      for (let c = 0; c < C; c++) {
        out.set(a.data.subarray(c * n1, c * n1 + n1), c * (n1 + n2));
        out.set(b.data.subarray(c * n2, c * n2 + n2), c * (n1 + n2) + n1);
      }
      return { data: out, dims: [1, C, n1 + n2] };
    };

    let refMelC = slice(refMel, 0, refFrames0);
    let refFeaC = slice(feaRef, 0, refFrames0);
    const rf = Math.min(V5.REF, refMelC.dims[2]);
    let oMel = tailSlice(refMelC, rf), oFea = tailSlice(refFeaC, rf);
    let rMel = oMel, rFea = oFea;
    const chunk = Math.min(V5.TOTAL - rf, V5.MAX_TGT);
    const results = [];

    for (let start = 0, idx = 0; start < feaTodo.dims[2]; start += chunk, idx++) {
      const tgt = slice(feaTodo, start, Math.min(start + chunk, feaTodo.dims[2]));
      let prompt, feats;
      if (idx === 0) { prompt = oMel; feats = oFea; }
      else {
        const tail = Math.min(V5.TAIL, rf, rMel.dims[2], rFea.dims[2]);
        const pre = rf - tail;
        prompt = cat(slice(oMel, 0, pre), tailSlice(rMel, tail));
        feats = cat(slice(oFea, 0, pre), tailSlice(rFea, tail));
      }
      const mu = cat(feats, tgt);                  // [1,D,T]
      const T = mu.dims[2], pl = prompt.dims[2];

      // 初始雜訊（前端固定種子以利重現）
      const x = new Float32Array(100 * T);
      for (let i = 0; i < x.length; i++) x[i] = (CFG.rand() * 2 - 1) * V5.TEMP;
      for (let c = 0; c < 100; c++) for (let i = 0; i < pl; i++) x[c * T + i] = 0;
      const px = new Float32Array(100 * T);
      for (let c = 0; c < 100; c++) px.set(prompt.data.subarray(c * pl, c * pl + pl), c * T);

      const d = 1 / V5.STEPS;
      for (let j = 0; j < V5.STEPS; j++) {
        const v = (await s.run({
          x: new ORT.Tensor('float32', x, [1, 100, T]),
          prompt_x: new ORT.Tensor('float32', px, [1, 100, T]),
          x_lens: new ORT.Tensor('int64', BigInt64Array.from([BigInt(T)]), [1]),
          time: new ORT.Tensor('float32', Float32Array.from([j * d]), [1]),
          mu: new ORT.Tensor('float32', mu.data, [1, D, T]),
        })).v;
        const vd = v.data;                          // [1,T,100]
        for (let c = 0; c < 100; c++)
          for (let i = 0; i < T; i++) x[c * T + i] += d * vd[i * 100 + c];
        for (let c = 0; c < 100; c++) for (let i = 0; i < pl; i++) x[c * T + i] = 0;
      }
      const gen = { data: new Float32Array(100 * (T - pl)), dims: [1, 100, T - pl] };
      for (let c = 0; c < 100; c++) gen.data.set(x.subarray(c * T + pl, c * T + T), c * (T - pl));
      results.push(gen);
      rMel = tailSlice(gen, Math.min(rf, gen.dims[2]));
      rFea = tailSlice(tgt, Math.min(rf, tgt.dims[2]));
    }
    // 串接各塊
    const total = results.reduce((a, r) => a + r.dims[2], 0);
    const out = new Float32Array(100 * total);
    let off = 0;
    for (const r of results) {
      for (let c = 0; c < 100; c++) { out.set(r.data.subarray(c * r.dims[2], c * r.dims[2] + r.dims[2]), c * total + off); }
      off += r.dims[2];
    }
    return { data: out, dims: [1, 100, total] };
  }

  async function vocode(mel, paths) {
    // 反正規化：(x+1)/2*(MAX-MIN)+MIN
    const y = new Float32Array(mel.data.length);
    const k = (SPEC.MAX - SPEC.MIN) / 2;
    for (let i = 0; i < mel.data.length; i++) y[i] = (mel.data[i] + 1) * k + SPEC.MIN;
    const s = await session('vocoder', paths.vocoder);
    const out = await s.run({ mel: new ORT.Tensor('float32', y, mel.dims) });
    return out.wav.data;                            // 48 kHz
  }

  root.V5Engine = {
    V5: V5,
    init: function (opts) { ORT = opts.ort; CFG = opts; },
    tokenize: tokenize,
    bertFeatures: bertFeatures,
    refEncode: refEncode,
    decodeEncp: decodeEncp,
    arLoop: arLoop,
    cfm: cfm,
    vocode: vocode,
    session: session,
    dispose: dispose,
    sessions: function () { return Object.keys(SESS); },
  };
})(typeof window !== "undefined" ? window : globalThis);
