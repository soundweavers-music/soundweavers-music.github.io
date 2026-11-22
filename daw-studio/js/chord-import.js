// 匯入「自動抓和弦」匯出的 .zychords.json → 專案的和弦軌（＋段落軌）
// 檔案格式：{ app:'zhiyin-chords', bpm, sigNum, key:{root,minor}, chords:[{t:拍, d:拍, root:0-11, q}],
//            sections?:[{t:拍, d:拍, sec:'verse1'|'主歌'…}] }
import { store } from './state.js';
import { toast } from './util.js';
import { normSec, sectionsOf, writePlanToSections } from './section-ui.js';
import { autoPlan, planWithBars, chordRange } from './ai-arrange.js';

const $ = id => document.getElementById(id);

// 抓和弦工具用的和弦品質寫法 → 編曲工具的和弦軌用語
const Q_MAP = {
  m: 'min', min: 'min', min7: 'm7', m7: 'm7', m6: 'm6', m7b5: 'm7b5', m9: 'm7', dim: 'dim', dim7: 'dim7',
  maj: 'maj', M: 'maj', M7: 'maj7', maj7: 'maj7', maj9: 'maj7', '': 'maj',
  '7': '7', '9': '7', '6': '6', sus2: 'sus2', sus4: 'sus4', aug: 'aug', '7sus4': '7',
};

export const normQ = q => Q_MAP[q] ?? Q_MAP[String(q ?? '').replace(/[^a-zA-Z0-9]/g, '')] ?? 'maj';

export async function importChordFile(file) {
  const text = await file.text();
  let doc;
  try { doc = JSON.parse(text); } catch (_) {
    throw new Error('不是和弦檔（要在「自動抓和弦」按「給編曲工具」下載 .zychords.json）');
  }
  if (!Array.isArray(doc.chords) || !doc.chords.length) throw new Error('檔案裡沒有和弦');

  const p = store.project;
  const srcBpm = Number(doc.bpm) || p.bpm;
  // 和弦位置是用「拍」算的：速度不同會整體位移，所以先問要不要套用來源速度
  if (Math.abs(srcBpm - p.bpm) > 0.01) {
    const go = confirm(`這份和弦是 ${srcBpm} BPM 抓的，目前專案是 ${p.bpm} BPM。\n要把專案速度改成 ${srcBpm} BPM 嗎？（取消＝維持目前速度，和弦可能對不上音檔）`);
    if (go) {
      store.checkpoint();
      p.bpm = srcBpm;
      const bpmEl = $('bpm'); if (bpmEl) bpmEl.value = String(srcBpm);
    }
  }

  store.checkpoint();
  p.chords = doc.chords.map(c => ({
    t: Math.max(0, Number(c.t) || 0),
    d: Math.max(0.25, Number(c.d) || 4),
    root: ((Math.round(Number(c.root) || 0) % 12) + 12) % 12,
    q: normQ(c.q),
  }));
  if (doc.key && typeof doc.key.root === 'number') {
    p.chordKey = { key: ((Math.round(doc.key.root) % 12) + 12) % 12, minor: !!doc.key.minor };
  }
  if (doc.name) p.chordName = doc.name;
  p.showChords = true;
  $('btnChords')?.classList.add('on');

  // 段落軌：檔案有帶段落就照檔案，沒有就依和弦樣式排一份（已經有段落的不覆蓋）
  let nSec = 0;
  const bpb = p.sigNum || 4;
  if (Array.isArray(doc.sections) && doc.sections.length) {
    p.sections = doc.sections.map(s => ({
      t: Math.max(0, Number(s.t) || 0),
      d: Math.max(0.25, Number(s.d) || bpb),
      sec: normSec(s.sec ?? s.label ?? s.name) || 'verse1',
    })).sort((a, b) => a.t - b.t);
    p.showSections = true;
    nSec = p.sections.length;
  } else if (!sectionsOf().length) {
    nSec = writePlanToSections(planWithBars(autoPlan(chordRange(), {}), 'cballad'), bpb, false);
  }
  $('btnSections')?.classList.toggle('on', !!p.showSections);

  store.changed('structure');
  store.emit('chords', {});
  store.emit('sections', {});
  toast(`已匯入 ${p.chords.length} 個和弦${doc.name ? `（${doc.name}）` : ''}，和弦軌已打開`
    + (nSec ? `；段落軌也排了 ${nSec} 段（可以再加減）` : ''));
}
