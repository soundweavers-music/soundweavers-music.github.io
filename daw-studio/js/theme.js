// 配色主題：canvas 讀 CSS 自訂屬性（有快取，切換主題時清掉並通知重畫）
// 主題本身定義在 daw.css 的 [data-theme=...]；第一次繪製前由 theme-boot.js 套用
export const THEMES = [
  { id: 'pro', name: '專業深色' },
  { id: 'wood-dark', name: '世界聲音・木質深色' },
  { id: 'wood-light', name: '世界聲音・木質淺色' },
];
const KEY = 'zhiyin-daw-theme';
const cache = new Map();

export function cssVar(name) {
  let v = cache.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    cache.set(name, v);
  }
  return v;
}

// 前景色的半透明版本：深色主題是白色、淺色主題是深棕色（淺色時透明度自動加重）
export function ink(a) {
  const k = parseFloat(cssVar('--cv-ink-k')) || 1;
  return `rgba(${cssVar('--cv-ink')},${Math.min(1, a * k)})`;
}

export function currentTheme() {
  const t = document.documentElement.dataset.theme;
  return THEMES.some(x => x.id === t) ? t : 'wood-dark';
}

export function setTheme(id) {
  if (!THEMES.some(x => x.id === id)) id = 'pro';
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(KEY, id); } catch { /* 無痕模式等情況存不了就算了 */ }
  cache.clear();
  window.dispatchEvent(new CustomEvent('daw-theme', { detail: { id } }));
}

// 保險：theme-boot.js 沒載到時也照樣套用
if (!document.documentElement.dataset.theme) {
  try {
    const s = localStorage.getItem(KEY);
    if (THEMES.some(x => x.id === s)) document.documentElement.dataset.theme = s;
  } catch { /* ignore */ }
}
