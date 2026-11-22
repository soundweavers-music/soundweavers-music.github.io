// 配色主題：canvas 讀 CSS 自訂屬性（有快取，切換主題時清掉並通知重畫）
// 主題本身定義在 daw.css 的 [data-theme=...]；第一次繪製前由 theme-boot.js 套用
// sw：選單右邊的色票（背景、主色、文字），一眼看出這個配色長什麼樣
export const THEMES = [
  { id: 'wood-light', name: '世界聲音・木質淺色', sw: ['#F7F3EE', '#A67C52', '#3D3229'] },
  { id: 'wood-dark', name: '世界聲音・木質深色', sw: ['#2B2521', '#D4A574', '#EFE7DF'] },
  { id: 'pro', name: '專業深色', sw: ['#232429', '#4F9DFF', '#E9EAEE'] },
  { id: 'midnight', name: '午夜藍', sw: ['#1a1e2c', '#8f9dff', '#dfe3ff'] },
  { id: 'forest', name: '森林綠', sw: ['#1a211b', '#8cc46a', '#dcefd0'] },
  { id: 'sunset', name: '夕陽橙', sw: ['#241a1c', '#f08a5d', '#ffe0d2'] },
  { id: 'graphite', name: '石墨灰', sw: ['#1e2023', '#c6ccd4', '#f0f2f5'] },
  { id: 'sakura', name: '櫻花粉', sw: ['#fdf0f3', '#c25b83', '#3f2b32'] },
  { id: 'ocean', name: '海洋藍', sw: ['#eef8ff', '#2b7fb8', '#22323d'] },
  { id: 'mint', name: '薄荷綠', sw: ['#eefaf3', '#2f9d78', '#22352f'] },
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
  return THEMES.some(x => x.id === t) ? t : 'wood-light';
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
