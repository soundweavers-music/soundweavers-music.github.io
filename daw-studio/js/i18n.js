// 介面語言：繁體中文（預設）或英文。
// 設定裡可以選「自動／中文／English」；自動模式在非中文語系就切英文。
// 翻譯字典由 scripts/daw_i18n_translate.py 產生（i18n-dict.js）。
import { EN } from './i18n-dict.js';

const KEY = 'zhiyin-daw-lang';          // auto | zh | en
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const CJK = /[㐀-鿿]/;

export function langPref() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch (_) { return 'auto'; }
}

export function detectLang() {
  const pref = langPref();
  if (pref === 'zh' || pref === 'en') return pref;
  const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
  // 只要介面語言裡有一個是中文就用中文，其餘一律英文
  return list.some(l => /^zh\b/i.test(l)) ? 'zh' : 'en';
}

export const LANG = detectLang();
export const isEN = () => LANG === 'en';

export function setLang(v) {
  try { localStorage.setItem(KEY, v); } catch (_) { /* ignore */ }
  location.reload();
}

// 單一字串翻譯（給 JS 內動態組字用）
export function t(zh) {
  if (LANG !== 'en') return zh;
  return EN[zh] || zh;
}

// 帶數字、名稱的字串（音量 -12.0 dB、音訊 3、已暫存 下午09:12…）不可能逐條收進字典，
// 用規則現算。
const RULES = [
  [/^音量 (-?\d+(?:\.\d+)? dB)$/, (m, v) => `Volume ${v}`],
  [/^音訊 (\d+)$/, (m, v) => `Audio ${v}`],
  [/^已暫存 (.+)$/, (m, v) => `Saved ${v.replace('上午', 'AM ').replace('下午', 'PM ')}`],
  [/^([AB]) 殘響：(關|-?\d+(?:\.\d+)? dB)$/, (m, b, v) => `Reverb ${b}: ${v === '關' ? 'off' : v}`],
  [/^([A-G][♭♯]?\d) 以下$/, (m, n) => `Below ${n}`],
  [/^([A-G][♭♯]?) 大調$/, (m, r) => `${r} major`],
  [/^([A-G][♭♯]?) 小調$/, (m, r) => `${r} minor`],
  [/^(.+?)・(\d+) 個音符・(\d+) 小節$/, (m, name, n, b) => `${t(name)} · ${n} notes · ${b} bars`],
  [/^MIDI 輸入移調 ([-+]?\d+) 半音$/, (m, n) => `MIDI transpose ${n} semitones`],
  [/^([−＋+-]?\d+)\s*度$/, (m, n) => `${n.replace('＋', '+')} oct`],
  [/^示範：(.+)$/, (m, name) => `Demo: ${name.replace(/（(.+?) 大調）$/, ' ($1 major)').replace(/（(.+?) 小調）$/, ' ($1 minor)')}`],
];

function tr(text) {
  const s = text.trim();
  if (!s) return null;
  // 已經翻過的就不再處理，避免 MutationObserver 自己觸發自己
  if (!CJK.test(s)) return null;
  if (EN[s]) return EN[s];
  // 選單會在前面加「✓ 」或全角空白表示目前選項：拆掉再查，查到了再放回去
  const m = s.match(/^([✓　\s]+)(.+)$/);
  if (m && EN[m[2].trim()]) return m[1] + EN[m[2].trim()];
  const bare = m ? m[2].trim() : s;
  for (const [re, fn] of RULES) {
    const hit = bare.match(re);
    if (hit) return (m ? m[1] : '') + fn(...hit);
  }
  return null;
}

function translateText(node) {
  const out = tr(node.nodeValue);
  if (!out) return;
  const lead = node.nodeValue.match(/^\s*/)[0];
  const tail = node.nodeValue.match(/\s*$/)[0];
  // 「輸入移調：」這種標籤後面常常直接接一個節點，補一個空格才不會黏在一起
  node.nodeValue = lead + out.replace(/([:：;；])$/, '$1 ') + tail;
}

function translateAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute && el.getAttribute(a);
    if (!v) continue;
    const out = tr(v);
    if (out) el.setAttribute(a, out);
  }
  // 軌道名稱、專案名稱是可編輯的文字框：預設名稱也要翻（使用者自己改過的中文不受影響，
  // 因為只有完全對到字典的才會換）
  if (el.tagName === 'INPUT' && el.type === 'text') {
    const out = tr(el.value);
    if (out) el.value = out;
  }
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

// 有些說明文字是「一句話拆在好幾個 <b> 之間」，逐段翻會變成破英文。
// 這種元素整塊換掉：先把它組成一句（片段之間補空格）再查字典。
const INLINE = new Set(['B', 'I', 'EM', 'STRONG', 'SPAN', 'SMALL', 'KBD', 'BR', 'A', 'U', 'SUP', 'SUB', 'MARK']);
const NO_WHOLE = /^(BUTTON|A|LABEL|SELECT|OPTION|TEXTAREA|INPUT)$/;

export function flatText(el) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeType === 1 && INLINE.has(n.tagName)) out += ' ' + flatText(n) + ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

// 這個元素適不適合整塊翻譯？適合就回傳組成好的句子，否則 null。
export function wholeText(el) {
  if (!el.childElementCount || NO_WHOLE.test(el.tagName)) return null;
  if (el.querySelector('i,svg,img,canvas,input,select,button')) return null;
  for (const c of el.children) if (!INLINE.has(c.tagName)) return null;
  const full = flatText(el);
  if (full.length < 4 || full.length > 160 || !CJK.test(full)) return null;
  // 換行多的區塊（例如 MIDI 輸入說明）整塊換會變成一整段難讀的文字，
  // 那種就交給逐句翻譯，保留原本的排版。
  if (el.getElementsByTagName('br').length > 2) return null;
  return full;
}

export function collectWholeTexts(root) {
  const out = [];
  for (const el of (root || document).querySelectorAll('*')) {
    const s = wholeText(el);
    if (s) out.push(s);
  }
  return out;
}

// 少數幾塊是「一句話拆在很多 <b> 之間」的說明文字，逐段替換會變成破英文，
// 這裡整塊換掉。
const HTML_EN = {
  emptyHint: 'Drag audio files into an <b>audio track</b>, or arm a track with <b>R</b> and press <b>Record</b><br>'
    + 'On a <b>MIDI track</b> (♪) <b>double-click</b> to add a clip, then arrange with the Piano Roll or a MIDI keyboard<br>'
    + 'Space to play · Ctrl+S saves the project to your computer',
};
function applyHtmlEn() {
  for (const [id, html] of Object.entries(HTML_EN)) {
    const el = document.getElementById(id);
    if (el && CJK.test(el.textContent)) el.innerHTML = html;
  }
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1) return;
  if (SKIP.has(root.tagName)) return;
  translateAttrs(root);
  const whole = wholeText(root);
  if (whole) {
    const out = tr(whole);
    if (out) { root.textContent = out; return; }
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n) {
      if (n.nodeType === 1 && SKIP.has(n.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n = w.nextNode();
  while (n) {
    if (n.nodeType === 3) { translateText(n); n = w.nextNode(); continue; }
    translateAttrs(n);
    const ws = wholeText(n);
    const wo = ws && tr(ws);
    if (wo) { n.textContent = wo; }
    n = w.nextNode();
  }
}

// 把整個介面換成英文，並持續處理之後才產生的節點（選單、對話框、提示）
export function translateDom() {
  if (LANG !== 'en') return;
  document.documentElement.lang = 'en';
  const ttl = EN[document.title];
  if (ttl) document.title = ttl;
  applyHtmlEn();
  walk(document.body);
  const pending = new Set();
  let queued = false;
  const flush = () => {
    queued = false;
    const nodes = [...pending];
    pending.clear();
    applyHtmlEn();
    for (const n of nodes) if (n.isConnected) walk(n);
  };
  // 專案／軌道名稱是程式直接設定 value，不會觸發 MutationObserver，另外看顧一下
  setInterval(() => {
    for (const el of document.querySelectorAll('input[type=text]')) {
      const v = el.value;
      if (!v || !CJK.test(v)) continue;
      const o = tr(v);
      if (o) el.value = o;
    }
  }, 1000);

  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') pending.add(r.target);
      else for (const n of r.addedNodes) pending.add(n);
    }
    if (pending.size && !queued) { queued = true; requestAnimationFrame(flush); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
