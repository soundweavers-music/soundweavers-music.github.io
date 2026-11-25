/* V5 進階引擎接進「織音 AI 配音剪輯」的接線
 *
 * 對外：
 *   V5Integration.preflight()          回傳 {ok, problems[]}：跑之前先看哪邊不對
 *   V5Integration.setEngine(on)        切換引擎
 *   V5Integration.setRef(file, text)   參考音 ＋ 它的文字稿（V5 兩者都要）
 *   V5Integration.run(text)            一句話 → Float32Array @ 44.1 kHz
 *
 * 錯誤訊息一律帶階段名稱（環境／模型／參考音／BERT／AR／解碼／聲學／聲碼器），
 * 實測時一眼就知道卡在哪、下一步該做什麼。
 */
(function (root) {
  "use strict";

  var ASSET = new URL("v5/", document.currentScript ? document.currentScript.src : document.baseURI).href;
  var SAMPLE_RATE = 44100;
  var EOS = 1024;                 // s1v3 的 config：vocab_size 1025、EOS 1024（已核對過）
  var SR_48 = 48000;

  var ORT = null;                 // onnxruntime-web（JSEP 版才支援 fp16）
  var S = {
    lib: null, ref: null, vocab: null, melBasis: null,
    queue: Promise.resolve(),
    model: {
      roberta: "v5-roberta", hubert: "v5-hubert", extract_latent: "v5-latent", refenc: "v5-refenc",
      decode_encp: "v5-decode", ar_enc: "v5-ar-enc", ar_fsdec: "v5-ar-fsdec",
      ar_sdec: "v5-ar-sdec", dit: "v5-dit", vocoder: "v5-vocoder"
    }
  };

  function fail(stage, msg) {
    var e = new Error(msg);
    e.stage = stage;
    throw e;
  }

  function loadScript(href) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + href + '"]')) return res();
      var s = document.createElement("script");
      s.src = href;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error("載入失敗：" + href)); };
      document.head.appendChild(s);
    });
  }
  function getJSON(p) { return fetch(p).then(function (r) { return r.json(); }); }

  // ── onnxruntime：優先用 JSEP 版（fp16 要靠它）；載不到才退回頁面已載入的 ──
  function ensureOrt() {
    if (ORT) return Promise.resolve(ORT);
    var dir = new URL("../../vendor/ort-webgpu/", ASSET).href;
    return import(dir + "ort.webgpu.min.mjs").then(function (m) {
      ORT = m;
      ORT.env.wasm.wasmPaths = dir;
      return ORT;
    }).catch(function () {
      if (root.ort) { ORT = root.ort; return ORT; }
      fail("環境", "載不到 onnxruntime-web（assets/vendor/ort-webgpu/ 不在）");
    });
  }

  function lib() {
    if (S.lib) return S.lib;
    S.lib = loadScript(new URL("../model-store.js", ASSET).href)
      .then(ensureOrt)
      .then(function () { return loadScript(ASSET + "g2p.js"); })
      .then(function () { return loadScript(ASSET + "audio.js"); })
      .then(function () { return loadScript(ASSET + "engine.js"); })
      .then(function () {
        return Promise.all([getJSON(ASSET + "symbols2.json"), getJSON(ASSET + "opencpop.json"),
          getJSON(new URL("../zh-t2s.json", ASSET).href).catch(function () { return {}; }),
          getJSON(ASSET + "polyphones.json"), getJSON(ASSET + "sandhi_words.json"),
          getJSON(ASSET + "char_pinyin.json"), getJSON(ASSET + "vocab.json"),
          fetch(ASSET + "mel_basis.bin").then(function (r) {
            if (!r.ok) fail("環境", "缺 assets/tts/v5/mel_basis.bin");
            return r.arrayBuffer();
          })]);
      })
      .then(function (a) {
        root.G2P.init({ symbols: a[0].symbols, opencpop: a[1], t2s: a[2],
                        polyphones: a[3], sandhiWords: a[4], charPinyin: a[5] });
        root.V5Engine.init({ ort: ORT, rand: Math.random, sessionProvider: provide });
        S.vocab = a[6];
        S.melBasis = new Float32Array(a[7]);
        return true;
      })
      .catch(function (e) { S.lib = null; throw e; });
    return S.lib;
  }

  function provide(name) {
    var key = S.model[name];
    if (!key) return Promise.reject(new Error("引擎要了不認得的模型：" + name));
    return root.ZhiyinModels.get(key).then(function (rec) {
      if (!rec || !rec.buf) fail("模型", "「" + key + "」還沒安裝——請在 V5 卡片把十個檔案一次選進來");
      return ORT.InferenceSession.create(new Uint8Array(rec.buf), { executionProviders: ["wasm"] });
    }).catch(function (e) {
      if (e && e.stage) throw e;
      fail("模型", "「" + key + "」載入失敗：" + (e && e.message ? e.message : e));
    });
  }
  function session(name) { return root.V5Engine.session(name); }
  function drop(names) { names.forEach(function (n) { root.V5Engine.dispose(n); }); }

  // 跑之前先看哪邊不對，一次把所有問題講完（不是跑到一半才炸）
  function preflight() {
    var problems = [];
    if (!root.ZhiyinModels) problems.push("模型倉庫沒有載入（請重新整理頁面）");
    if (!root.V5Engine) problems.push("引擎還沒載入（切到 V5 時會自動載）");
    var mem = navigator.deviceMemory || 0;
    if (mem && mem < 8) problems.push("這台電腦記憶體約 " + mem + " GB，V5 建議 16 GB 以上");
    if (!S.ref) problems.push("還沒設定參考音（3–10 秒的音檔 ＋ 它的文字稿）");
    return { ok: problems.length === 0, problems: problems };
  }

  // Float32 → fp16（與 numpy 對過：20011 個樣本有 20009 個位元完全相同，1 個差 1 ulp）
  function toF16(a) {
    var out = new Uint16Array(a.length);
    for (var i = 0; i < a.length; i++) {
      var x = a[i], sign = x < 0 ? 0x8000 : 0;
      x = Math.abs(x);
      if (x === 0) { out[i] = sign; continue; }
      if (!isFinite(x)) { out[i] = sign | 0x7c00; continue; }
      var e = Math.floor(Math.log(x) / Math.LN2);
      if (e < -14) { var sub = Math.round(x / Math.pow(2, -24)); out[i] = sign | (sub >= 1024 ? 0x0400 : sub); continue; }
      if (e > 15) { out[i] = sign | 0x7c00; continue; }
      var m = Math.round((x / Math.pow(2, e) - 1) * 1024);
      if (m === 1024) { m = 0; e++; }
      out[i] = sign | ((e + 15) << 10) | m;
    }
    return out;
  }
  function f16(t, dims) { return new ORT.Tensor("float16", t instanceof Uint16Array ? t : toF16(t), dims); }

  function bertOf(text) {
    var ids = [101], i;
    for (i = 0; i < text.length; i++) ids.push(S.vocab[text[i]] === undefined ? 100 : S.vocab[text[i]]);
    ids.push(102);
    return session("roberta")
      .then(function (s) {
        return s.run({ input_ids: new ORT.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]) });
      })
      .catch(function (e) { if (e.stage) throw e; fail("BERT", "RoBERTa 推論失敗：" + (e.message || e)); })
      .then(function (o) {
        return { hidden: o.hidden.data, T: o.hidden.dims[1] - 2, D: o.hidden.dims[2] };
      });
  }

  function expand(h, word2ph) {
    if (h.T !== word2ph.length) {
      fail("BERT", "文字長度 " + h.T + " 與音素對應表 " + word2ph.length + " 不一致（這句可能有 BERT 不認得的符號）");
    }
    var P = word2ph.reduce(function (a, b) { return a + b; }, 0);
    var out = new Float32Array(h.D * P), k = 0, i, r, d;
    for (i = 0; i < h.T; i++) {
      var off = (i + 1) * h.D;
      for (r = 0; r < word2ph[i]; r++) {
        for (d = 0; d < h.D; d++) out[d * P + k] = h.hidden[off + d];
        k++;
      }
    }
    return { data: out, dims: [1, h.D, P] };
  }

  function setRef(file, text) {
    text = (text || "").trim();
    if (!file) return Promise.reject(new Error("請先選一個參考音檔"));
    if (!text) return Promise.reject(new Error("請填參考音的文字稿（V5 的韻律模型需要它）"));
    return lib()
      .then(function () { return file.arrayBuffer(); })
      .then(function (buf) {
        var Ctx = root.AudioContext || root.webkitAudioContext;
        return new Ctx().decodeAudioData(buf).catch(function () { fail("參考音", "這個音檔解不開，換一個 wav 或 mp3"); });
      })
      .then(function (ab) {
        var n = ab.length, ch = ab.numberOfChannels;
        if (n < ab.sampleRate * 2) fail("參考音", "參考音只有 " + (n / ab.sampleRate).toFixed(1) + " 秒，請用 3–10 秒");
        var mono = new Float32Array(n);
        for (var c = 0; c < ch; c++) {
          var d = ab.getChannelData(c);
          for (var i = 0; i < n; i++) mono[i] += d[i] / ch;
        }
        var w16 = root.V5Audio.resample(mono, ab.sampleRate, 16000);
        var w32 = root.V5Audio.resample(mono, ab.sampleRate, 32000);
        S.ref = { text: text, w32: w32 };
        return session("hubert")
          .then(function (s) { return s.run({ wav: f16(w16, [1, w16.length]) }); })
          .catch(function (e) { if (e.stage) throw e; fail("音色", "HuBERT 推論失敗：" + (e.message || e)); })
          .then(function (o) {
            S.ref.ssl = o.hidden.data; S.ref.sslDims = o.hidden.dims;
            drop(["hubert"]);
            return session("extract_latent");
          })
          .then(function (s) { return s.run({ ssl: new ORT.Tensor("float16", S.ref.ssl, S.ref.sslDims) }); })
          .then(function (o) {
            S.ref.codes = Array.from(o.codes.data).map(Number);
            drop(["extract_latent"]);
            var spec = root.V5Audio.stftMag(w32, 2048, 640);
            S.ref.spec = { data: spec.data, dims: [1, spec.bins, spec.frames] };
            return session("refenc");
          })
          .then(function (s) { return s.run({ refer: f16(S.ref.spec.data, S.ref.spec.dims) }); })
          .then(function (o) {
            S.ref.ge = o.ge;
            drop(["refenc"]);
            return bertOf(text);
          })
          .then(function (h) {
            var g = root.G2P.run(text);
            if (!g.ids.length) fail("參考音", "文字稿裡沒有可以念的字");
            S.ref.phones = g.ids;
            S.ref.bert = expand(h, g.word2ph);
            drop(["roberta"]);
            return true;
          });
      });
  }

  function run(text) {
    if (!S.ref) return Promise.reject(new Error("V5 要先設定參考音（3–10 秒）與它的文字稿"));
    var job = S.queue.then(function () { return one(text); });
    S.queue = job.catch(function () {});
    return job;
  }

  function one(text) {
    var g = root.G2P.run(text);
    if (!g.ids.length) return Promise.reject(new Error("這一句沒有可以念的字"));
    var tgt = g.ids, feaRef = null;

    return bertOf(g.norm)
      .then(function (h) {
        var tgtBert = expand(h, g.word2ph);
        drop(["roberta"]);
        return root.V5Engine.arLoop(
          { ref: S.ref.bert.data, tgt: tgtBert.data, ssl: S.ref.ssl },
          { ref: S.ref.phones, tgt: tgt },
          S.ref.codes, null, 400);
      })
      .catch(function (e) { if (e.stage) throw e; fail("AR", "韻律模型推論失敗：" + (e.message || e)); })
      .then(function (tokens) {
        if (!tokens.length) {
          fail("AR", "韻律模型沒有產生語音（第 0 步就結束）。最可能是參考音的文字稿跟音檔內容對不上——" +
                     "請確認文字稿就是那段音檔說的話，或用「② 口白剪輯」重新辨識一次。");
        }
        if (tokens.length >= 400) fail("AR", "產生的長度異常（沒有正常結束），已停止");
        return root.V5Engine.decodeEncp(S.ref.codes, S.ref.phones, S.ref.ge)
          .then(function (fr) { feaRef = fr; return root.V5Engine.decodeEncp(tokens, tgt, S.ref.ge); });
      })
      .catch(function (e) { if (e.stage) throw e; fail("解碼", "語意碼轉特徵失敗：" + (e.message || e)); })
      .then(function (feaTodo) {
        var melRef = root.V5Audio.melSpectrogram(S.ref.w32, S.melBasis, 100, 641);
        var norm = root.V5Audio.normSpec(melRef.data);
        return root.V5Engine.cfm(feaRef, feaTodo, { data: norm, dims: melRef.dims });
      })
      .catch(function (e) { if (e.stage) throw e; fail("聲學", "DiT 合成失敗：" + (e.message || e) +
        "（若是記憶體不足，請關掉其他分頁再試）"); })
      .then(function (mel) { return root.V5Engine.vocode(mel); })
      .catch(function (e) { if (e.stage) throw e; fail("聲碼器", "波形合成失敗：" + (e.message || e)); })
      .then(function (wav48) {
        drop(["decode_encp", "dit", "vocoder"]);
        return root.V5Audio.resample(wav48, SR_48, SAMPLE_RATE);
      });
  }

  root.V5Integration = {
    EOS: EOS,
    enabled: function () { return !!(S.on && S.ref); },
    setEngine: function (on) { S.on = !!on; },
    hasRef: function () { return !!S.ref; },
    preflight: preflight,
    warmup: lib,
    setRef: setRef,
    run: run,
    toF16: toF16
  };
})(window);
