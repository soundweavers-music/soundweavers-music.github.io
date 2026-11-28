// 音色示意圖總覽（測試用）：?p=頁碼（大圖每頁 24 張）、?small=1 小圖
import { ZY_PATCHES } from './js/zy-patches.js';
import { zyArt, hasArt } from './js/zy-art.js';
const q = new URLSearchParams(location.search);
const small = q.get('small'), page = +(q.get('p') || 0), per = small ? 240 : 24;
const miss = ZY_PATCHES.filter(p => !hasArt(p.id)).map(p => p.id);
const errs = [];
const oe = console.error; console.error = (...a) => { errs.push(String(a[1]) + ':' + String(a[2] && a[2].message)); oe(...a); };
const ids = q.get('ids');
const list = ids ? ids.split(',').map(id => ZY_PATCHES.find(p => p.id === id) || { id, name: '?' }) : ZY_PATCHES.slice(page * per, page * per + per);
const W = +(q.get('w') || 0);
const out = document.getElementById('out');
out.innerHTML = `<div id="err">total ${ZY_PATCHES.length} missing ${miss.length} ${miss.join(',')}</div><div class="g ${small ? 'small' : W ? 'free' : 'big'}">` +
  list.map(p => `<div class="c">${W ? zyArt(p.id).replace('<svg ', `<svg width="${W}" height="${W * 0.625}" `) : zyArt(p.id)}<div>${p.name}<br>${p.id}</div></div>`).join('') + '</div>';
if (errs.length) document.getElementById('err').textContent += ' ERR ' + errs.join(',');
document.title = `zyart missing=${miss.length} err=${errs.length}`;
