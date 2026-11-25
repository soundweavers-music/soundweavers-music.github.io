/* 中文 G2P（GPT-SoVITS v2/v5 文字前端）的 JS 版
 *
 * 對照來源：GPT_SoVITS/text/chinese2.py ＋ tone_sandhi.py
 * 四層：① 正規化（含數字）② 拼音＋多音字詞表 ③ 變調／輕聲 ④ 音素表
 * 與 Python 版刻意的差異：用「字＋多音字詞表」取代 jieba 斷詞，拿掉詞性（POS）條件。
 */
(function (root) {
  "use strict";

  var SYMBOLS, SYM_ID = {}, OPEN, T2S, POLY = null, POLY_MAX = 1, CHARPY = null;
  var SANDHI_WORDS = {};        // must_neural / must_not_neural
  var PUNCT = ["!", "?", "…", ",", ".", "-"];
  var REP_MAP = { "：": ",", "；": ",", "，": ",", "。": ".", "！": "!", "？": "?", "\n": ".", "·": ",", "、": ",", "$": ".", "/": ",", "—": "-", "~": "…", "～": "…" };
  var V_REP = { uei: "ui", iou: "iu", uen: "un" };
  var PINYIN_REP = { ing: "ying", i: "yi", in: "yin", u: "wu" };
  var SINGLE_REP = { v: "yu", e: "e", i: "y", u: "w" };
  var INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];
  var NUM_UNITS = "元个個页頁万萬章次分秒岁歲倍成人张張件年月日號号米斤克升天周週期课課条條只支首";
  var DIGIT_WISE = { "0": "零", "1": "幺", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七", "8": "八", "9": "九" };
  var DIGIT_PLAIN = { "0": "零", "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七", "8": "八", "9": "九" };
  var CN_DIGIT = "零一二三四五六七八九";
  var CN_UNIT = ["", "十", "百", "千"];

  function init(a) {
    SYMBOLS = a.symbols;
    SYM_ID = {};
    for (var i = 0; i < SYMBOLS.length; i++) SYM_ID[SYMBOLS[i]] = i;
    OPEN = a.opencpop;
    T2S = a.t2s || {};
    POLY = a.polyphones || {};
    CHARPY = a.charPinyin || {};
    POLY_MAX = 1;
    for (var k in POLY) if (k.length > POLY_MAX) POLY_MAX = k.length;
    SANDHI_WORDS = a.sandhiWords || {};
  }

  // ── ① 正規化 ────────────────────────────────────────────
  function toSimp(text) {
    var out = "";
    for (var i = 0; i < text.length; i++) out += (T2S[text[i]] || text[i]);
    return out;
  }

  function readProper(s) {                     // "350" → "三百五十"
    if (!s) return "";
    var neg = s[0] === "-";
    if (neg) s = s.slice(1);
    s = s.replace(/^0+(?=\d)/, "");
    if (s === "0") return "零";
    var parts = [], sec = 0, out = "";
    var SEC_UNIT = ["", "万", "亿"];
    for (var end = s.length; end > 0; end -= 4, sec++) {
      var chunk = s.slice(Math.max(0, end - 4), end);
      var str = fourDigit(chunk);
      if (str) parts.unshift(str + SEC_UNIT[sec]);
      else if (out) out = out;
    }
    out = parts.join("");
    out = out.replace(/零+/g, "零").replace(/零$/, "");
    return (neg ? "负" : "") + out;
  }

  function fourDigit(chunk) {                  // "0105" → "一百零五"
    var out = "", zero = false;
    for (var i = 0; i < chunk.length; i++) {
      var d = +chunk[i], pos = chunk.length - 1 - i;
      if (d === 0) { zero = true; continue; }
      if (zero && out) out += "零";
      zero = false;
      if (!(d === 1 && pos === 1 && !out)) out += CN_DIGIT[d];
      out += CN_UNIT[pos];
    }
    return out;
  }

  function readDigits(s) {                     // "120" → "幺二零"
    var out = "";
    for (var i = 0; i < s.length; i++) out += DIGIT_WISE[s[i]];
    return out;
  }

  function readDecimal(s) {                    // "3.5" → "三点五"
    var p = s.split(".");
    var out = readProper(p[0]) + "点";
    for (var i = 0; i < p[1].length; i++) out += DIGIT_PLAIN[p[1][i]];
    return out;
  }

  function normalizeNumbers(text) {
    return text.replace(/(\d+(?:\.\d+)?)\s*(%?)/g, function (m, num, pct, idx, all) {
      var after = all.slice(idx + m.length);
      var next = after.replace(/^\s+/, "").slice(0, 1);
      var out;
      if (num.indexOf(".") >= 0) out = readDecimal(num);
      else if (num.length === 4 && next === "年") out = readDigits(num);
      else if (num.length >= 3 && NUM_UNITS.indexOf(next) < 0) out = readDigits(num);
      else out = readProper(num);
      return (pct ? "百分之" + out.replace(/^幺/, "一") : out);
    });
  }

  function replaceConsecutive(text) {
    var esc = PUNCT.map(function (p) { return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("");
    return text.replace(new RegExp("([" + esc + "])([" + esc + "])+", "g"), "$1");
  }

  function normalize(text) {
    text = toSimp(text);
    text = text.replace(/嗯/g, "恩").replace(/呣/g, "母");
    text = text.replace(/[a-zA-Z]+/g, "");
    text = normalizeNumbers(text);
    text = text.replace(/(\d[\d.]*)\s*%/g, "$1%");
    text = text.replace(/(\d+(?:\.\d+)?)(?=\s*年)/g, function (n) {
      return n.length === 4 ? "@@Y" + n + "@@" : n;
    });
    text = text.replace(/(\d+(?:\.\d+)?)%/g, function (m, n) { return "@@P" + n + "@@"; });
    text = text.replace(/\d+(?:\.\d+)?/g, function (n, idx, all) {
      var after = all.slice(idx + n.length).replace(/^\s+/, "");
      var next = after.slice(0, 1);
      if (n.indexOf(".") >= 0) return "@@N" + n + "@@";
      if (NUM_UNITS.indexOf(next) >= 0) return "@@N" + n + "@@";
      if (n.length >= 3) return "@@D" + n + "@@";
      return "@@N" + n + "@@";
    });
    text = text.replace(/：|；|，|。|！|？|\n|·|、|\$|\/|—|～|~/g, function (m) { return REP_MAP[m]; });
    text = text.replace(/\.\.\./g, "…");
    text = text.replace(new RegExp("[^\\u4e00-\\u9fa5" + PUNCT.join("") + "@@NPDY0123456789.]+", "g"), "");
    return replaceConsecutive(text);
  }

  // ── ② 拼音 ─────────────────────────────────────────────
  function splitSyllable(py) {                 // "yue4" → {initial:"y", final:"ue", tone:"4"}
    var tone = "5", m = py.match(/([1-5])$/);
    if (m) { tone = m[1]; py = py.slice(0, -1); }
    for (var i = 0; i < INITIALS.length; i++) {
      var ini = INITIALS[i];
      if (py.length > ini.length && py.indexOf(ini) === 0) return { initial: ini, final: py.slice(ini.length), tone: tone };
    }
    return { initial: "", final: py, tone: tone };
  }

  function charPinyin(ch) {
    if (CHARPY && CHARPY[ch]) return splitSyllable(CHARPY[ch]);
    var pp = root.pinyinPro;
    var ini = (pp.pinyin(ch, { pattern: "initial", toneType: "none", type: "array" })[0] || "");
    var fin = (pp.pinyin(ch, { pattern: "final", toneType: "none", type: "array" })[0] || "").replace(/ü/g, "v");
    var num = pp.pinyin(ch, { pattern: "num", type: "array", toneType: "num" })[0];
    if (num === 0 || num === "" || num === undefined || num === null) num = 5;
    return { initial: ini, final: fin, tone: String(num) };
  }

  // 用多音字詞表做最長匹配，切出「詞」；沒對到的就一個字一個詞
  function segment(text) {
    var out = [], i = 0;
    while (i < text.length) {
      if (PUNCT.indexOf(text[i]) >= 0) { out.push(text[i]); i++; continue; }
      var hit = null;
      for (var len = Math.min(POLY_MAX, text.length - i); len >= 1; len--) {
        var w = text.substr(i, len);
        if (POLY[w]) { hit = w; break; }
      }
      if (hit) { out.push(hit); i += hit.length; }
      else { out.push(text[i]); i++; }
    }
    return out;
  }

  function syllableOf(word, idx, ch) {
    if (POLY[word] && POLY[word][idx]) return splitSyllable(POLY[word][idx]);
    return charPinyin(ch);
  }

  function setTone(f, t) { return f.slice(0, -1) + t; }

  // ── ③ 變調 / 輕聲 ───────────────────────────────────────
  function sandhiWords(list) {
    var words = [];   // [{w, ini:[], fin:[], pos:[]}]
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (PUNCT.indexOf(w) >= 0) { words.push({ w: w, ini: [w], fin: [w] }); continue; }
      var ini = [], fin = [];
      for (var j = 0; j < w.length; j++) {
        var s = syllableOf(w, j, w[j]);
        ini.push(s.initial); fin.push(s.final + s.tone);
      }
      words.push({ w: w, ini: ini, fin: fin });
    }
    return words;
  }

  function mergePairs(words) {                 // 不/一 黏到後一個詞
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var cur = words[i];
      if ((cur.w === "不" || cur.w === "一") && i + 1 < words.length && PUNCT.indexOf(words[i + 1].w) < 0) {
        var nx = words[i + 1];
        out.push({ w: cur.w + nx.w, ini: cur.ini.concat(nx.ini), fin: cur.fin.concat(nx.fin) });
        i++;
      } else out.push(cur);
    }
    return out;
  }

  function applyNeuralWords(words, mustNeural) {
    // 把非標點的詞串起來，記下每個字對應的 (詞索引, 音節索引)
    var idxs = [], text = "";
    for (var i = 0; i < words.length; i++) {
      if (PUNCT.indexOf(words[i].w) >= 0) continue;
      for (var j = 0; j < words[i].w.length; j++) { text += words[i].w[j]; idxs.push([i, j]); }
    }
    var maxLen = 4;
    for (var s = 0; s < text.length; s++) {
      for (var len = Math.min(maxLen, text.length - s); len >= 1; len--) {
        if (mustNeural[text.substr(s, len)]) {
          var ref = idxs[s + len - 1];
          words[ref[0]].fin[ref[1]] = setTone(words[ref[0]].fin[ref[1]], "5");
          break;
        }
      }
    }
  }

  function applySandhi(words) {
    var mustNeural = SANDHI_WORDS.must || {};
    var mustNot = SANDHI_WORDS.mustNot || {};
    applyNeuralWords(words, mustNeural);
    for (var k = 0; k < words.length; k++) {
      var w = words[k].w, fin = words[k].fin;
      if (PUNCT.indexOf(w) >= 0) continue;

      // ── 不 ──
      if (w.indexOf("不") >= 0) {
        if (w.length === 3 && w[1] === "不") fin[1] = setTone(fin[1], "5");
        else for (var i = 0; i < w.length; i++)
          if (w[i] === "不" && i + 1 < w.length && fin[i + 1].slice(-1) === "4") fin[i] = setTone(fin[i], "2");
      }
      // ── 一 ──
      if (w.indexOf("一") >= 0) {
        var allNum = true;
        for (var q = 0; q < w.length; q++) if (w[q] !== "一" && "0123456789".indexOf(w[q]) < 0) allNum = false;
        if (!(w.indexOf("一") >= 0 && allNum)) {
          if (w.length === 3 && w[1] === "一" && w[0] === w[2]) fin[1] = setTone(fin[1], "5");
          else if (w.indexOf("第一") === 0) fin[1] = setTone(fin[1], "1");
          else for (var j = 0; j < w.length; j++)
            if (w[j] === "一" && j + 1 < w.length && !(j === 0 && k > 0 && words[k - 1].w === "第")) {
              if (fin[j + 1].slice(-1) === "4") fin[j] = setTone(fin[j], "2");
              else if (PUNCT.indexOf(w[j + 1]) < 0) fin[j] = setTone(fin[j], "4");
            }
        }
      }
      // ── 輕聲 ──
      if (mustNot[w] === undefined) {
        if ("吧呢哈啊呐噻嘛吖嗨哦哒额滴哩哟喽啰耶喔诶".indexOf(w.slice(-1)) >= 0 ||
            "的地得".indexOf(w.slice(-1)) >= 0) {
          fin[fin.length - 1] = setTone(fin[fin.length - 1], "5");
          if ("的地得".indexOf(w.slice(-1)) >= 0) fin[fin.length - 1] = "e5";
        }
        else if (w.length > 1 && "们子".indexOf(w.slice(-1)) >= 0) fin[fin.length - 1] = setTone(fin[fin.length - 1], "5");
        else if (w.length > 1 && "上下里".indexOf(w.slice(-1)) >= 0) fin[fin.length - 1] = setTone(fin[fin.length - 1], "5");
        else if (w.length > 1 && "来去".indexOf(w.slice(-1)) >= 0 && "上下进出回过起开".indexOf(w[w.length - 2]) >= 0)
          fin[fin.length - 1] = setTone(fin[fin.length - 1], "5");
        else {
          var ge = w.indexOf("个");
          if ((ge >= 1 && ("0123456789一几有两半多各整每做是".indexOf(w[ge - 1]) >= 0)) || w === "个")
            fin[ge] = setTone(fin[ge], "5");
          else if (mustNeural[w] || (w.length > 1 && mustNeural[w.slice(-2)])) fin[fin.length - 1] = setTone(fin[fin.length - 1], "5");
        }
      }
    }
    // ── 三聲連讀：整串掃描，連續的三聲除了最後一個都變二聲 ──
    var seq = [];
    for (var a = 0; a < words.length; a++) for (var b = 0; b < words[a].fin.length; b++) seq.push([a, b]);
    var run = [];
    function flush() {
      for (var r = 0; r < run.length - 1; r++) {
        var ref = run[r];
        words[ref[0]].fin[ref[1]] = setTone(words[ref[0]].fin[ref[1]], "2");
      }
      run = [];
    }
    for (var q = 0; q < seq.length; q++) {
      var ref2 = seq[q], f = words[ref2[0]].fin[ref2[1]];
      if (PUNCT.indexOf(words[ref2[0]].w) >= 0) { flush(); continue; }
      if (f.slice(-1) === "3") run.push(ref2);
      else flush();
    }
    flush();
    return words;
  }

  // ── ④ 音素表 ────────────────────────────────────────────
  function toPhone(initial, finalWithTone) {
    var tone = finalWithTone.slice(-1), v = finalWithTone.slice(0, -1);
    if (initial === v) return [initial];
    var pinyin;
    if (initial) pinyin = initial + (V_REP[v] || v);
    else {
      pinyin = v;
      if (PINYIN_REP[pinyin]) pinyin = PINYIN_REP[pinyin];
      else if (SINGLE_REP[pinyin[0]]) pinyin = SINGLE_REP[pinyin[0]] + pinyin.slice(1);
    }
    var sym = OPEN[pinyin];
    if (!sym) return null;
    var p = sym.split(" ");
    return [p[0], p[1] + tone];
  }

  function run(text, opts) {
    opts = opts || {};
    var norm = opts.alreadyNormalized ? text : normalize(text);
    var words = applySandhi(mergePairs(sandhiWords(segment(norm))));
    var phones = [], missing = [], word2ph = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (PUNCT.indexOf(w.w) >= 0) { phones.push(w.w); word2ph.push(1); continue; }
      for (var j = 0; j < w.w.length; j++) {
        var ph = toPhone(w.ini[j], w.fin[j]);
        if (!ph) { missing.push(w.w[j] + ":" + w.ini[j] + w.fin[j]); continue; }
        phones.push.apply(phones, ph);
        word2ph.push(ph.length);
      }
    }
    return { src: text, norm: norm, phones: phones, word2ph: word2ph,
             ids: phones.map(function (s) { return SYM_ID[s]; }), missing: missing };
  }

  root.G2P = { init: init, run: run, normalize: normalize, toSimp: toSimp, segment: segment };
})(typeof window !== "undefined" ? window : globalThis);
