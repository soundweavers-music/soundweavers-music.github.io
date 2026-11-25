/* V5 進階引擎接進「織音 AI 配音剪輯」的接線
 *
 * 對外只給三個東西：
 *   V5Integration.enabled()            現在該不該走 V5
 *   V5Integration.setRef(file, text)   設定參考音與它的文字稿
 *   V5Integration.run(text)           一句話 → Float32Array @ 44.1 kHz（介面同 MeloTTS 的 ttsRun）
 *
 * 模型從瀏覽器倉庫（ZhiyinModels）一張一張取，用完就放掉，控制記憶體。
 */
(function (root) {
  "use strict";

  var ASSET = new URL("v5/", document.currentScript ? document.currentScript.src : document.baseURI).href;
  var SAMPLE_RATE = 44100;

  var S = {
    lib: null, ref: null, sess: {}, vocab: null, melBasis: null, queue: Promise.resolve(),
    model: {
      roberta: "v5-roberta", hubert: "v5-hubert", extract_latent: "v5-latent", refenc: "v5-refenc",
      decode_encp: "v5-decode", ar_enc: "v5-ar-enc", ar_fsdec: "v5-ar-fsdec",
      ar_sdec: "v5-ar-sdec", dit: "v5-dit", vocoder: "v5-vocoder"
    }
  };

  function loadScript(href) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + href + '"]')) return res();
      var s = document.createElement("script");
      s.src = href; s.onload = function () { res(); }; s.onerror = function () { rej(new Error("載入失敗 " + href)); };
      document.head.appendChild(s);
    });
  }
  function getJSON(p) { return fetch(p).then(function (r) { return r.json(); }); }

  function lib() {
    if (S.lib) return S.lib;
    S.lib = loadScript(ASSET.replace(/v5\/$/, "") + "model-store.js")
      .then(function () { return loadScript(ASSET + "g2p.js"); })
      .then(function () { return loadScript(ASSET + "audio.js"); })
      .then(function () { return loadScript(ASSET + "engine.js"); })
      .then(function () {
        return Promise.all([getJSON(ASSET + "symbols2.json"), getJSON(ASSET + "opencpop.json"),
          getJSON(ASSET + "zh-t2s.json").catch(function () { return {}; }),
          getJSON(ASSET + "polyphones.json"), getJSON(ASSET + "sandhi_words.json"),
          getJSON(ASSET + "char_pinyin.json"), getJSON(ASSET + "vocab.json"),
          fetch(ASSET + "zh-t2s.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
          fetch(ASSET + "mel_basis.bin").then(function (r) { return r.arrayBuffer(); })]);
      })
      .then(function (a) {
        root.G2P.init({ symbols: a[0].symbols, opencpop: a[1], t2s: Object.keys(a[2]).length ? a[2] : a[7],
                        polyphones: a[3], sandhiWords: a[4], charPinyin: a[5] });
        root.V5Engine.init({ ort: root.ort, rand: Math.random, sessionProvider: provide });
        S.vocab = a[6];
        S.melBasis = new Float32Array(a[8]);
        return true;
      });
    return S.lib;
  }

  // 引擎要模型時，從瀏覽器倉庫取（引擎自己快取，用完由 drop 放掉）
  function provide(name) {
    var key = S.model[name];
    if (!key) return Promise.reject(new Error("引擎要了不認得的模型：" + name));
    return root.ZhiyinModels.get(key).then(function (rec) {
      if (!rec || !rec.buf) throw new Error("模型「" + key + "」還沒安裝");
      return root.ort.InferenceSession.create(new Uint8Array(rec.buf), { executionProviders: ["wasm"] });
    });
  }
  function session(name) { return root.V5Engine.session(name); }
  function drop(names) { names.forEach(function (n) { root.V5Engine.dispose(n); }); }

  // Float32 → fp16（模型是 fp16）
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

  function bertOf(text) {
    // BERT 的輸入：每個字一個 id（中文逐字），頭尾加 [CLS]/[SEP]
    var ids = [101], i;
    for (i = 0; i < text.length; i++) ids.push(S.vocab[text[i]] === undefined ? 100 : S.vocab[text[i]]);
    ids.push(102);
    return session("roberta").then(function (s) {
      return s.run({ input_ids: new root.ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]) });
    }).then(function (o) {
      var T = o.hidden.dims[1] - 2, D = o.hidden.dims[2];
      return { hidden: o.hidden.data, T: T, D: D };
    });
  }

  // 逐字重複成音素級：[D, P]
  function expand(h, word2ph) {
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
    return lib().then(function () { return file.arrayBuffer(); })
      .then(function (buf) {
        var Ctx = root.AudioContext || root.webkitAudioContext;
        return new Ctx().decodeAudioData(buf);
      })
      .then(function (ab) {
        var n = ab.length, ch = ab.numberOfChannels;
        var mono = new Float32Array(n);
        for (var c = 0; c < ch; c++) {
          var d = ab.getChannelData(c);
          for (var i = 0; i < n; i++) mono[i] += d[i] / ch;
        }
        var w16 = root.V5Audio.resample(mono, ab.sampleRate, 16000);
        var w32 = root.V5Audio.resample(mono, ab.sampleRate, 32000);
        S.ref = { text: text, w32: w32 };
        return session("hubert").then(function (s) {
          return s.run({ wav: new root.ort.Tensor("float16", toF16(w16), [1, w16.length]) });
        }).then(function (o) {
          S.ref.ssl = o.hidden.data; S.ref.sslDims = o.hidden.dims;
          drop(["hubert"]);
          return session("extract_latent");
        }).then(function (s) {
          return s.run({ ssl: new root.ort.Tensor("float16", S.ref.ssl, S.ref.sslDims) });
        }).then(function (o) {
          S.ref.codes = Array.from(o.codes.data).map(Number);
          drop(["extract_latent"]);
          var spec = root.V5Audio.stftMag(w32, 2048, 640);
          S.ref.spec = { data: spec.data, dims: [1, spec.bins, spec.frames] };
          return session("refenc");
        }).then(function (s) {
          return s.run({ refer: new root.ort.Tensor("float16", toF16(S.ref.spec.data), S.ref.spec.dims) });
        }).then(function (o) {
          S.ref.ge = o.ge;
          drop(["refenc"]);
          return bertOf(text);
        }).then(function (h) {
          var g = root.G2P.run(text);
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
    var tgt = g.ids, feaRef, feaTodo, mel;

    return bertOf(g.norm).then(function (h) {
      var tgtBert = expand(h, g.word2ph);
      drop(["roberta"]);
      return root.V5Engine.arLoop(
        { ref: S.ref.bert.data, tgt: tgtBert.data, ssl: S.ref.ssl },
        { ref: S.ref.phones, tgt: tgt },
        S.ref.codes, null, 400);
    }).then(function (tokens) {
      if (!tokens.length) throw new Error("V5 沒有產生語音：參考音和它的文字稿可能對不上");
      return root.V5Engine.decodeEncp(S.ref.codes, S.ref.phones, S.ref.ge)
        .then(function (fr) { feaRef = fr; return root.V5Engine.decodeEncp(tokens, tgt, S.ref.ge); });
    }).then(function (ft) {
      feaTodo = ft;
      var melRef = root.V5Audio.melSpectrogram(S.ref.w32, S.melBasis, 100, 641);
      var norm = root.V5Audio.normSpec(melRef.data);
      return root.V5Engine.cfm(feaRef, feaTodo, { data: norm, dims: melRef.dims });
    }).then(function (m) {
      mel = m;
      return root.V5Engine.vocode(mel);
    }).then(function (wav48) {
      drop(["decode_encp", "dit", "vocoder"]);
      // 48 kHz → 44.1 kHz，交給下游的 ttsTrim / ttsPlace
      return root.V5Audio.resample(wav48, 48000, SAMPLE_RATE);
    });
  }

  root.V5Integration = {
    enabled: function () { return !!(S.on && S.ref); },
    setEngine: function (on) { S.on = !!on; },
    setRef: setRef,
    run: run,
    hasRef: function () { return !!S.ref; },
    loadMelBasis: function () {
      // mel 濾波器組（100×641）跟著 audio.js 一起用；沒有就從資料檔載入
      if (S.melBasis) return Promise.resolve(S.melBasis);
      return fetch(ASSET + "mel_basis.bin").then(function (r) {
        if (!r.ok) throw new Error("缺 mel_basis.bin");
        return r.arrayBuffer();
      }).then(function (b) { S.melBasis = new Float32Array(b); return S.melBasis; });
    }
  };
})(window);
