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
// 每條規則都帶一個 sample：scripts/daw_i18n_test.py 會自動拿它去驗，
// 新加規則就自動有測試（忘了寫 sample 的話測試會提示）。
const RULES = [
  { re: /^音量 (-?\d+(?:\.\d+)? dB)$/, fn: (m, v) => `Volume ${v}`, sample: '音量 -12.0 dB' },
  { re: /^音訊 (\d+)$/, fn: (m, v) => `Audio ${v}`, sample: '音訊 3' },
  { re: /^已暫存 (上午|下午)(\d{1,2}):(\d{2})$/, sample: '已暫存 下午09:12',
    fn: (m, ap, h, mi) => `Saved ${Number(h)}:${mi} ${ap === '上午' ? 'AM' : 'PM'}` },
  { re: /^已暫存 (.+)$/, fn: (m, v) => `Saved ${v.replace('上午', 'AM ').replace('下午', 'PM ')}`, sample: '已暫存 昨天' },
  { re: /^([AB]) 殘響：(關|-?\d+(?:\.\d+)? dB)$/, sample: 'A 殘響：-13.0 dB',
    fn: (m, b, v) => `Reverb ${b}: ${v === '關' ? 'off' : v}` },
  { re: /^([A-G][♭♯]?\d) 以下$/, fn: (m, n) => `Below ${n}`, sample: 'C♯3 以下' },
  { re: /^([A-G][♭♯]?) 大調$/, fn: (m, r) => `${r} major`, sample: 'F♯ 大調' },
  { re: /^([A-G][♭♯]?) 小調$/, fn: (m, r) => `${r} minor`, sample: 'E♭ 小調' },
  { re: /^(.+?)・(\d+) 個音符・(\d+) 小節$/, sample: '弦樂合奏・28 個音符・24 小節',
    fn: (m, name, n, b) => `${t(name)} · ${n} notes · ${b} bars` },
  { re: /^MIDI 輸入移調 ([-+]?\d+) 半音$/, fn: (m, n) => `MIDI transpose ${n} semitones`, sample: 'MIDI 輸入移調 +1 半音' },
  { re: /^([−＋+-]?\d+)\s*度$/, fn: (m, n) => `${n.replace('＋', '+')} oct`, sample: '＋8度' },
  { re: /^示範：(.+)$/, sample: '示範：卡農（D 大調）', fn: (m, name) => {
    const mm = name.match(/^(.+?)（(.+?)(?:・(.+))?\s*(大調|小調)）$/);
    if (mm) {
      const extra = mm[3] ? `, ${t(mm[3])}` : '';
      return `Demo: ${t(mm[1].replace('卡農', 'Canon'))} (${mm[2]} ${mm[4] === '大調' ? 'major' : 'minor'}${extra})`;
    }
    return `Demo: ${t(name.replace('卡農', 'Canon'))}`;
  } },
  { re: /^♪ (.+)$/, fn: (m, name) => `♪ ${t(name)}`, sample: '♪ 小提琴 1（主旋律）' },
  { re: /^・(\d+) 個音色・(.+)$/, fn: (m, n, size) => `· ${n} instruments · ${size}`, sample: '・3 個音色・7.3 MB' },
  { re: /^(\d+) = 用風格自己的長度$/, fn: (m, n) => `${n} = use the style's own length`, sample: '0 = 用風格自己的長度' },
  // 輸出時的進度：混音算圖中…／WAV 編碼中…／已用 12 秒　剩約 34 秒　57%
  { re: /^(.+?)編碼中…$/, fn: (m, label) => `${label.trim()} encoding…`, sample: 'WAV 編碼中…' },
  { re: /^已用 (\d+) 秒　剩約 (.+?) 秒　(\d+)%$/, sample: '已用 7 秒　剩約 不到 1 秒　99%',
    fn: (m, a, b, c) => `Elapsed ${a}s · ${b === '不到 1' ? '<1' : b}s left · ${c}%` },
  { re: /^已用 (\d+) 秒　(\d+)%$/, fn: (m, a, c) => `Elapsed ${a}s · ${c}%`, sample: '已用 12 秒　57%' },
  // 段落軌：段落選單與摘要（都是「動詞＋段落名」組出來的）
  { re: /^(\d+) 段$/, fn: (m, n) => `${n} sections`, sample: '4 段' },
  { re: /^段落軌有 (\d+) 段$/, fn: (m, n) => `Section track has ${n} sections`, sample: '段落軌有 4 段' },
  { re: /^目前：(.+)$/, fn: (m, name) => `Current: ${t(name)}`, sample: '目前：副歌 1' },
  { re: /^改成 (.+)$/, fn: (m, name) => `Change to ${t(name)}`, sample: '改成 副歌 1' },
  { re: /^新增 (.+)（從這裡開始）$/, fn: (m, name) => `Add ${t(name)} (from here)`, sample: '新增 主歌 A（從這裡開始）' },
  { re: /^在第 (\d+) 小節新增段落$/, fn: (m, n) => `Add a section at bar ${n}`, sample: '在第 3 小節新增段落' },
  { re: /^已排好 (\d+) 段並寫進段落軌；要改就在尺規下方的段落軌上點$/, sample: '已排好 5 段並寫進段落軌；要改就在尺規下方的段落軌上點',
    fn: (m, n) => `Planned ${n} sections and wrote them into the section track — click a section to change it` },
  { re: /^已把 (\d+) 段寫進段落軌$/, fn: (m, n) => `Wrote ${n} sections into the section track`, sample: '已把 5 段寫進段落軌' },
];

// 給 scripts/daw_i18n_test.py 用：字典的鍵與每條規則的樣本
export function dictKeys() {
  return Object.keys(EN).filter(k => CJK.test(k));
}
export function ruleSamples() {
  return RULES.map(r => r.sample).filter(Boolean);
}

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
  for (const { re, fn } of RULES) {
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
