// 配色主題：canvas 讀 CSS 自訂屬性（有快取，切換主題時清掉並通知重畫）
// 主題本身定義在 daw.css 的 [data-theme=...]；第一次繪製前由 theme-boot.js 套用
// sw：選單右邊的色票（背景、主色、文字），一眼看出這個配色長什麼樣
// en：英文介面用的名字（theme.js 不走 i18n 字典，直接選字）
export const THEMES = [
  { id: 'wood-light', name: '世界聲音・木質淺色', en: 'World Sounds · Wood Light', sw: ['#FFFFFF', '#A67C52', '#3D3229'] },
  { id: 'wood-dark', name: '世界聲音・木質深色', en: 'World Sounds · Wood Dark', sw: ['#1D1815', '#D4A574', '#EFE7DF'] },
  { id: 'pro', name: '專業深色', en: 'Pro Dark', sw: ['#232429', '#4F9DFF', '#E9EAEE'] },
  { id: 'midnight', name: '午夜藍', en: 'Midnight Blue', sw: ['#10131c', '#8f9dff', '#EBEDFF'] },
  { id: 'forest', name: '森林綠', en: 'Forest Green', sw: ['#101611', '#8cc46a', '#EAF4E4'] },
  { id: 'sunset', name: '夕陽橙', en: 'Sunset Orange', sw: ['#1a1214', '#f08a5d', '#FCEAE2'] },
  { id: 'graphite', name: '石墨灰', en: 'Graphite', sw: ['#131416', '#c6ccd4', '#F5F6F7'] },
  { id: 'sakura', name: '櫻花粉', en: 'Sakura Pink', sw: ['#fff7f8', '#c25b83', '#4B3037'] },
  { id: 'ocean', name: '海洋藍', en: 'Ocean Blue', sw: ['#f3faff', '#2b7fb8', '#2A3843'] },
  { id: 'mint', name: '薄荷綠', en: 'Mint', sw: ['#f4fbf7', '#2f9d78', '#2B3F35'] },
  { id: 'wine', name: '夜酒紅', en: 'Wine Red', sw: ['#1a1014', '#e2687f', '#FAE4E8'] },
  { id: 'teal', name: '深海青', en: 'Deep Teal', sw: ['#0e1718', '#45c8c0', '#DEF5F4'] },
  { id: 'violet', name: '夜幕紫', en: 'Night Violet', sw: ['#15111f', '#a58cf5', '#EFEAFD'] },
  { id: 'olive', name: '橄欖綠', en: 'Olive', sw: ['#14160f', '#b6c463', '#F2F4E3'] },
  { id: 'amber', name: '琥珀金', en: 'Amber Gold', sw: ['#1a150e', '#e3a455', '#FAEFE0'] },
  { id: 'lavender', name: '薰衣草紫', en: 'Lavender', sw: ['#f9f6ff', '#7a5ad0', '#3C3048'] },
  { id: 'peach', name: '蜜桃橘', en: 'Peach', sw: ['#fff5ef', '#d96a3f', '#503328'] },
  { id: 'stone', name: '冷石灰', en: 'Cool Stone', sw: ['#f6f7f9', '#5f6c7a', '#363435'] },
  { id: 'sage', name: '鼠尾草綠', en: 'Sage Green', sw: ['#f5f9f2', '#5f8f43', '#363C29'] },
  { id: 'rose', name: '玫瑰粉', en: 'Rose', sw: ['#fff5f7', '#c04a63', '#4B2C30'] },
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
