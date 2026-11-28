// 載入進度：任何「要等一下」的事（下載音色庫、從瀏覽器還原、解析、啟動音訊）都在這裡登記，
// 右下角的小面板會說「正在做什麼、做到哪裡」。不擋操作——載入的時候照樣可以編曲。
//
//   const job = loading.begin('內建鋼琴', '下載中');
//   job.progress(0.4, '23 / 60 MB');
//   job.step('解析中');            // 換階段（進度不明時顯示流動條）
//   job.done();  或  job.fail('連不上網路，先用合成音色');
import { t, registerTerms } from './i18n.js';

registerTerms({
  '正在準備音色': 'Preparing sounds', '有些音色沒載入': 'Some sounds didn’t load', '音色都準備好了': 'All sounds ready',
  '內建鋼琴': 'Built-in piano', '內建弦樂': 'Built-in strings', '內建音色庫（GM）': 'Built-in GM sounds',
  '下載中': 'Downloading', '解開音色中': 'Unpacking', '從這台電腦讀出來': 'Reading from this computer',
  '好了': 'Ready', '下載失敗，先用合成音色': 'Download failed — using synth sounds for now',
  '檔案讀不出來': 'File could not be read', '讀不出來': 'Could not be read', '沒有載入': 'Not loaded',
  '啟動音訊引擎': 'Starting audio engine', '排隊中': 'Waiting', '這台電腦已經有了': 'Already on this computer', '沒有載入，先用合成音色': 'Not loaded — using synth sounds for now',
});

const jobs = new Map();
let seq = 0;
let box = null, hideTimer = 0;

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'loadPanel';
  box.className = 'load-panel';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  document.body.appendChild(box);
  return box;
}

const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0);
export const bytesText = (got, total) => (total ? `${mb(got)} / ${mb(total)} MB` : `${mb(got)} MB`);

function render() {
  const el = ensureBox();
  const list = [...jobs.values()];
  if (!list.length) { el.classList.remove('on'); return; }
  clearTimeout(hideTimer);
  el.classList.add('on');
  const active = list.filter(j => j.state === 'run');
  const head = active.length
    ? t('正在準備音色') + `（${list.filter(j => j.state !== 'run').length}/${list.length}）`
    : (list.some(j => j.state === 'fail') ? t('有些音色沒載入') : t('音色都準備好了'));
  el.innerHTML = `<b>${head}</b>` + list.map(j => {
    const pct = j.frac == null ? null : Math.round(j.frac * 100);
    const bar = j.state === 'done' ? '<i class="lp-bar"><i style="width:100%"></i></i>'
      : j.state === 'fail' ? ''
        : j.stepText === t('排隊中') ? '<i class="lp-bar"><i style="width:0"></i></i>'
          : pct == null ? '<i class="lp-bar lp-indet"><i></i></i>'
          : `<i class="lp-bar"><i style="width:${pct}%"></i></i>`;
    const mark = j.state === 'done' ? '✓' : j.state === 'fail' ? '!' : pct == null ? '' : pct + '%';
    return `<div class="lp-row lp-${j.state}"><span class="lp-name">${j.label}</span><span class="lp-pct">${mark}</span>
      ${bar}<span class="lp-step">${j.stepText}${j.detail ? ' · ' + j.detail : ''}</span></div>`;
  }).join('');
  // 全部結束：成功的 2.5 秒後收起來；有失敗的留久一點讓人看得到
  if (!active.length) {
    const fail = list.some(j => j.state === 'fail');
    hideTimer = setTimeout(() => {
      for (const [id, j] of jobs) if (j.state !== 'run') jobs.delete(id);
      render();
    }, fail ? 8000 : 2500);
  }
}

let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

export const loading = {
  begin(label, stepText = '') {
    const id = ++seq;
    const j = { id, label: t(label), stepText: t(stepText), detail: '', frac: null, state: 'run' };
    jobs.set(id, j);
    schedule();
    return {
      progress(frac, detail) { j.frac = frac == null ? null : Math.max(0, Math.min(1, frac)); if (detail != null) j.detail = detail; schedule(); },
      step(text, frac = null) { j.stepText = t(text); j.frac = frac; j.detail = ''; schedule(); },
      done(text = '好了') { j.state = 'done'; j.stepText = t(text); j.frac = 1; j.detail = ''; schedule(); },
      fail(text) { if (j.state !== 'run') return; j.state = 'fail'; j.stepText = t(text || '沒有載入'); j.detail = ''; schedule(); },
    };
  },
  // 給測試用：目前的工作
  list: () => [...jobs.values()].map(j => ({ ...j })),
};

// 一邊下載一邊回報進度（Content-Length 有的話就有百分比）
// knownSize：檔案真正的大小。伺服器用 gzip 傳的時候，Content-Length 是壓縮後的，
// 但讀到的是解壓後的位元組 → 用 Content-Length 當分母會超過 100%，所以有真實大小就用真實大小。
export async function fetchWithProgress(url, job, opts = {}, knownSize = 0) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const gz = /gzip|br|deflate/i.test(res.headers.get('Content-Encoding') || '');
  const total = knownSize || (gz ? 0 : Number(res.headers.get('Content-Length')) || 0);
  if (!res.body || !res.body.getReader) {
    job.progress(null, total ? bytesText(0, total) : '');
    return res.arrayBuffer();
  }
  const reader = res.body.getReader();
  const parts = [];
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    const now = performance.now();
    if (now - last > 120) { last = now; job.progress(total ? got / total : null, bytesText(got, total)); }
  }
  job.progress(1, bytesText(got, total || got));
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

globalThis.__dawLoading = loading;
