// 智慧編曲視窗：① 旋律配和弦（主旋律 → 和弦軌，2～3 個版本）② 一鍵編曲（和弦軌 + 段落 → 各聲部 MIDI）
import { store } from './state.js';
import { engine } from './engine.js';
import { STYLES, SECTIONS, styleById } from './arranger-styles.js';
import { PARTS } from './arranger.js';
import { melodyOf, melodyKey, suggestChords, keyName, progressionText } from './ai-chords.js';
import { chordRange, autoPlan, generate, applyArrangement, removeArrangement } from './ai-arrange.js';
import { ROOTS } from './chords.js';
import { toast } from './util.js';
import { compose, applyComposition, FORMS, SEC_LABEL } from './ai-compose.js';
import { chordName } from './chords.js';

const KEY = 'zhiyin-daw-ai';
const SEC_NAME = Object.fromEntries(SECTIONS.map(s => [s.id, s.name]));
const SEC_CHOICES = SECTIONS;
let S = { tab: 'chords', perBar: 1, styleId: 'cballad', variation: 0.5, level: 0.8, intro: true, ending: true, parts: Object.fromEntries(PARTS.map(p => [p.id, true])), keyMode: 'auto' };
try { S = { ...S, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) { /* noop */ }
const save = () => { const { plan, ...rest } = S; localStorage.setItem(KEY, JSON.stringify(rest)); };

let root = null, open = false, sugg = null, chosen = -1, plan = null, seed = 1, melTrack = null;
const $ = s => root.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function build() {
  root = document.createElement('div');
  root.className = 'aiw hidden';
  root.innerHTML = `
  <div class="aiw-win" role="dialog" aria-label="智慧編曲">
    <div class="aiw-head"><b>智慧編曲</b><span class="aiw-sub">全部在這台電腦上計算：旋律 → 和弦 → 整首伴奏 MIDI</span>
      <div class="spacer"></div><button type="button" class="tbtn ghost aiw-x" title="關閉">✕</button></div>
    <div class="aiw-tabs">
      <button type="button" data-tab="chords">① 旋律配和弦</button>
      <button type="button" data-tab="arrange">② 一鍵編曲</button>
      <button type="button" data-tab="compose">③ 智慧創作</button>
    </div>
    <section class="aiw-pane" data-pane="chords">
      <p class="note">選主唱（音訊）或旋律（MIDI）那一軌，系統會找出調性，再用和弦機率模型（HMM／Viterbi）配出最順的和弦進行，偏好華語流行常見的走法。挑一個版本寫進和弦軌，之後可以在和弦軌上逐格修改。</p>
      <div class="aiw-row">
        <label class="f">旋律軌 <select class="aiw-mel"></select></label>
        <label class="f">換和弦的密度 <select class="aiw-per"><option value="1">每小節 1 個</option><option value="2">每小節 2 個</option></select></label>
        <label class="f">調性 <select class="aiw-key"><option value="auto">自動判斷</option>${ROOTS.map((r, i) => `<option value="${i}M">${r} 大調</option>`).join('')}${ROOTS.map((r, i) => `<option value="${i}m">${r} 小調</option>`).join('')}</select></label>
        <button type="button" class="tbtn primary aiw-analyze">分析旋律</button>
      </div>
      <div class="aiw-info note"></div>
      <div class="aiw-opts"></div>
      <div class="aiw-row aiw-after" hidden>
        <button type="button" class="tbtn aiw-play">▶ 從頭播放</button>
        <button type="button" class="tbtn primary aiw-next">下一步：用這組和弦一鍵編曲 →</button>
      </div>
    </section>
    <section class="aiw-pane" data-pane="compose">
      <p class="note">從零寫一首歌的骨架：用華語流行最常見的和弦進行（卡農、1-5-6-4、4-5-3-6 王道…）排出主歌、導歌、副歌，再配一條<b>好唱、安全</b>的主旋律——正拍落在和弦音、多級進、動機重複、句尾落在穩定音。寫進和弦軌與「智慧主旋律」軌之後，可以接著用 ② 一鍵編曲配上伴奏。</p>
      <div class="aiw-row">
        <label class="f">調性 <select class="aic-key">${ROOTS.map((r, i) => `<option value="${i}M">${r} 大調</option>`).join('')}${ROOTS.map((r, i) => `<option value="${i}m">${r} 小調</option>`).join('')}</select></label>
        <label class="f">速度 <input type="number" class="aic-bpm" min="50" max="180" step="1" style="width:64px"></label>
        <label class="f">曲式 <select class="aic-form">${FORMS.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select></label>
        <label class="f">音域 <select class="aic-reg"><option value="-1">低（男聲）</option><option value="0">中</option><option value="1">高（女聲）</option></select></label>
        <label class="f">旋律變化 <span class="aiw-rng"><input type="range" class="aic-var" min="0" max="100" step="5"><b class="aic-varv"></b></span></label>
        <label class="f">旋律音色 <select class="aic-inst"><option value="lead">方波 Lead</option><option value="piano">鋼琴</option><option value="epiano">電鋼琴</option><option value="strings">弦樂</option><option value="marimba">木琴</option></select></label>
      </div>
      <div class="aiw-row">
        <button type="button" class="tbtn primary aic-new">✦ 寫一首新的</button>
        <button type="button" class="tbtn aic-mel" title="和弦不變，只換一條旋律">只換旋律</button>
        <button type="button" class="tbtn aic-prog" title="曲式與旋律風格不變，換一組和弦進行">只換和弦進行</button>
        <button type="button" class="tbtn aic-play">▶ 從頭播放</button>
        <span class="note aic-status"></span>
      </div>
      <div class="aic-sum"></div>
      <div class="aiw-row aic-after" hidden>
        <button type="button" class="tbtn primary aic-next">下一步：配上伴奏（② 一鍵編曲）→</button>
      </div>
    </section>
    <section class="aiw-pane" data-pane="arrange">
      <p class="note">依<b>和弦軌</b>與下面的<b>段落表</b>，用自動伴奏的風格把整首編成鼓、貝斯、鋼琴、吉他、弦樂、琶音的 MIDI 片段（放進「伴奏-」各軌）。換段落前一小節自動打過門。不喜歡就按「重新產生」換一個版本；每次都可以 Ctrl+Z 復原。</p>
      <div class="aiw-row">
        <label class="f">風格 <select class="aiw-style">${STYLES.map(s => `<option value="${s.id}">${esc(s.name)}　${s.bpm} BPM</option>`).join('')}</select></label>
        <label class="f">變化 <span class="aiw-rng"><input type="range" class="aiw-var" min="0" max="100" step="5"><b class="aiw-varv"></b></span></label>
        <label class="f">伴奏音量 <span class="aiw-rng"><input type="range" class="aiw-lvl" min="50" max="100" step="5"><b class="aiw-lvlv"></b></span></label>
      </div>
      <div class="aiw-parts"></div>
      <div class="aiw-plan-h"><b>段落表</b><span class="note aiw-range"></span><div class="spacer"></div>
        <label class="aiw-chk"><input type="checkbox" class="aiw-intro"> 加前奏</label>
        <label class="aiw-chk"><input type="checkbox" class="aiw-ending"> 加尾奏</label>
        <button type="button" class="tbtn ghost aiw-auto" title="依和弦軌重複的樣式自動判斷主歌、導歌、副歌">自動排段落</button>
        <button type="button" class="tbtn ghost aiw-addsec">＋ 一段</button></div>
      <div class="aiw-plan"></div>
      <div class="aiw-row">
        <button type="button" class="tbtn primary aiw-gen">產生編曲</button>
        <button type="button" class="tbtn aiw-regen" title="同樣的設定，換一組過門、經過音與 Voicing">重新產生（換一版）</button>
        <button type="button" class="tbtn aiw-play2">▶ 從頭播放</button>
        <button type="button" class="tbtn ghost aiw-del">移除智慧編曲</button>
        <span class="note aiw-status"></span>
      </div>
    </section>
  </div>`;
  document.body.appendChild(root);
  root.addEventListener('pointerdown', e => { if (e.target === root) toggleAI(false); });
  $('.aiw-x').onclick = () => toggleAI(false);
  root.querySelectorAll('.aiw-tabs button').forEach(b => { b.onclick = () => { S.tab = b.dataset.tab; save(); renderTab(); }; });
  // ① 旋律配和弦
  $('.aiw-per').value = String(S.perBar);
  $('.aiw-per').onchange = e => { S.perBar = Number(e.target.value); save(); if (sugg) analyze(); };
  $('.aiw-key').value = S.keyMode;
  $('.aiw-key').onchange = e => { S.keyMode = e.target.value; save(); if (sugg) analyze(); };
  $('.aiw-mel').onchange = e => { melTrack = e.target.value; sugg = null; renderOpts(); };
  $('.aiw-analyze').onclick = () => analyze();
  $('.aiw-play').onclick = () => playFrom(sugg?.range?.[0] ?? 0);
  $('.aiw-next').onclick = () => { S.tab = 'arrange'; save(); plan = null; renderTab(); };
  // ② 一鍵編曲
  $('.aiw-style').value = S.styleId;
  $('.aiw-style').onchange = e => { S.styleId = e.target.value; save(); plan = null; renderPlan(); };
  $('.aiw-var').value = String(Math.round(S.variation * 100));
  $('.aiw-var').oninput = e => { S.variation = Number(e.target.value) / 100; save(); renderVals(); };
  $('.aiw-lvl').value = String(Math.round(S.level * 100));
  $('.aiw-lvl').oninput = e => { S.level = Number(e.target.value) / 100; save(); renderVals(); };
  $('.aiw-intro').checked = S.intro; $('.aiw-ending').checked = S.ending;
  $('.aiw-intro').onchange = e => { S.intro = e.target.checked; save(); plan = null; renderPlan(); };
  $('.aiw-ending').onchange = e => { S.ending = e.target.checked; save(); plan = null; renderPlan(); };
  $('.aiw-auto').onclick = () => { plan = null; renderPlan(); toast('已依和弦軌重新排段落'); };
  $('.aiw-addsec').onclick = () => { ensurePlan(); const at = plan.findIndex(s => s.post); plan.splice(at < 0 ? plan.length : at, 0, { sec: 'verse1', bars: 4, int: 0 }); renderPlan(); };
  $('.aiw-gen').onclick = () => runGenerate(false);
  $('.aiw-regen').onclick = () => runGenerate(true);
  $('.aiw-play2').onclick = () => playFrom(lastStart ?? 0);
  $('.aiw-del').onclick = () => { if (removeArrangement()) { toast('已移除智慧編曲的片段（Ctrl+Z 可以復原）'); status(''); } else toast('目前沒有智慧編曲的片段', 'warn'); };
  // ③ 智慧創作
  $('.aic-key').value = S.cKey || '0M';
  $('.aic-key').onchange = e => { S.cKey = e.target.value; save(); };
  $('.aic-bpm').value = String(S.cBpm || 80);
  $('.aic-bpm').onchange = e => { S.cBpm = Math.max(50, Math.min(180, Number(e.target.value) || 80)); save(); };
  $('.aic-form').value = S.cForm || 'std';
  $('.aic-form').onchange = e => { S.cForm = e.target.value; save(); };
  $('.aic-reg').value = String(S.cReg ?? 0);
  $('.aic-reg').onchange = e => { S.cReg = Number(e.target.value); save(); };
  $('.aic-var').value = String(Math.round((S.cVar ?? 0.4) * 100));
  $('.aic-var').oninput = e => { S.cVar = Number(e.target.value) / 100; save(); $('.aic-varv').textContent = e.target.value + '%'; };
  $('.aic-varv').textContent = Math.round((S.cVar ?? 0.4) * 100) + '%';
  $('.aic-inst').value = S.cInst || 'lead';
  $('.aic-inst').onchange = e => { S.cInst = e.target.value; save(); const t = store.project.tracks.find(x => x.aiMelody); if (t) { t.instrument = S.cInst; store.changed('structure'); } };
  const newSeed = () => (Math.random() * 2 ** 31) >>> 0 || 5;
  $('.aic-new').onclick = () => runCompose(newSeed(), newSeed());
  $('.aic-mel').onclick = () => runCompose(comp?.progSeed ?? newSeed(), newSeed());
  $('.aic-prog').onclick = () => runCompose(newSeed(), comp?.melSeed ?? newSeed());
  $('.aic-play').onclick = () => playFrom(comp ? Math.max(0, comp.res.startBar - 0) * 4 : 0);
  $('.aic-next').onclick = () => { S.tab = 'arrange'; save(); plan = comp?.res.plan.map(x => ({ ...x })) || null; renderTab(); };
  store.on('change', ({ kind }) => { if (open && kind === 'structure') { fillTracks(); if (S.tab === 'arrange') renderRange(); } });
  document.addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.stopPropagation(); toggleAI(false); } }, true);
}

let lastStart = null, comp = null;
function runCompose(progSeed, melSeed) {
  const p = store.project;
  if ((p.sigNum || 4) !== 4) { toast('智慧創作目前只支援 4/4 拍，請先把拍號改成 4/4', 'warn'); return; }
  const k = S.cKey || '0M';
  // 放在第 5 小節開始，前面留 4 小節給前奏
  const res = compose({ key: parseInt(k, 10), minor: k.endsWith('m'), form: S.cForm || 'std', register: S.cReg ?? 0, variation: S.cVar ?? 0.4, startBar: 4, progSeed, melSeed });
  const r = applyComposition(res, { bpm: S.cBpm || 80, instrument: S.cInst || 'lead' });
  if (r.err) { toast(r.err, 'warn'); return; }
  comp = { res, progSeed, melSeed };
  $('.aic-status').textContent = `已寫入：${res.sections.length} 段、${res.endBar - res.startBar} 小節、旋律 ${r.notes} 個音（#${progSeed % 1000}-${melSeed % 1000}）`;
  $('.aic-sum').innerHTML = res.sections.map(sec => {
    const cs = res.chords.filter(c => c.t + c.d > sec.bar * 4 && c.t < (sec.bar + sec.bars) * 4);   // 跨段落延續的和弦也算
    return `<div class="aic-sec"><b>${SEC_LABEL[sec.type]}${sec.round ? ' ' + (sec.round + 1) : ''}</b><span class="aiw-bar">${sec.bar + 1}–${sec.bar + sec.bars}</span><span class="note">${esc(sec.prog)}</span><span class="aiw-prog">${esc(cs.map(chordName).join(' – '))}</span></div>`;
  }).join('');
  $('.aic-after').hidden = false;
  toast('智慧創作完成：和弦軌與「智慧主旋律」軌都寫好了，按播放聽聽看（Ctrl+Z 可以復原）');
}
function status(t) { $('.aiw-status').textContent = t; }
async function playFrom(beat) {
  await engine.ensure();
  if (engine.playing) engine.stop();
  engine.seek(beat * 60 / store.project.bpm);
  engine.play();
}

// ---------------- ① 旋律配和弦 ----------------
function fillTracks() {
  const sel = $('.aiw-mel'), tracks = store.project.tracks.filter(t => t.clips.length && !t.arrPart && !t.hqOf);
  if (!melTrack || !tracks.some(t => t.id === melTrack)) {
    const cur = store.track(store.selection.trackId);
    melTrack = cur && tracks.includes(cur) ? cur.id
      : (tracks.find(t => /主唱|人聲|vocal|旋律|melody|lead/i.test(t.name)) || tracks.find(t => t.kind === 'midi') || tracks[0])?.id || null;
  }
  sel.innerHTML = tracks.length ? tracks.map(t => `<option value="${t.id}">${t.kind === 'midi' ? '♪ ' : '〜 '}${esc(t.name)}</option>`).join('') : '<option value="">（還沒有任何片段）</option>';
  if (melTrack) sel.value = melTrack;
}

function analyze() {
  if (!melTrack) { toast('先錄主唱或在 MIDI 軌寫旋律', 'warn'); return; }
  const t = store.track(melTrack);
  $('.aiw-info').textContent = t.kind === 'midi' ? '分析中…' : '分析中…（音訊要先把每一個音抓出來，長的歌需要幾秒）';
  setTimeout(() => {
    const mel = melodyOf(melTrack);
    if (mel.length < 4) { $('.aiw-info').textContent = '抓不到足夠的旋律音：音訊請用乾淨的主唱（沒有伴奏），或改用 MIDI 旋律。'; sugg = null; renderOpts(); return; }
    let key = null;
    if (S.keyMode !== 'auto') key = { key: parseInt(S.keyMode, 10), minor: S.keyMode.endsWith('m') };
    sugg = suggestChords(mel, { perBar: S.perBar, key });
    if (!sugg) { $('.aiw-info').textContent = '無法判斷調性，請手動選調性再試一次。'; renderOpts(); return; }
    const auto = melodyKey(mel);
    const bpb = store.project.sigNum || 4;
    $('.aiw-info').innerHTML = `旋律 ${mel.length} 個音，第 ${sugg.range[0] / bpb + 1}–${sugg.range[1] / bpb} 小節；調性：<b>${keyName(sugg.key)}</b>${S.keyMode === 'auto' && auto ? `（把握度 ${Math.round(auto.confidence * 100)}%，不對的話右上角可以手動選）` : ''}`;
    chosen = -1;
    renderOpts();
  }, 30);
}

function renderOpts() {
  const box = $('.aiw-opts');
  $('.aiw-after').hidden = !sugg || chosen < 0;
  if (!sugg) { box.innerHTML = ''; return; }
  box.innerHTML = sugg.options.map((o, i) => `
    <div class="aiw-opt${i === chosen ? ' on' : ''}" data-i="${i}">
      <div class="aiw-opt-h"><b>${esc(o.name)}</b><span class="aiw-fit" title="旋律音落在和弦音上的比例（依音長加權）">旋律貼合 ${Math.round(o.fit * 100)}%</span>
        <div class="spacer"></div><button type="button" class="tbtn ${i === chosen ? '' : 'primary'} aiw-use">${i === chosen ? '已寫入和弦軌' : '用這個版本'}</button></div>
      <div class="aiw-prog">${esc(progressionText(o.chords, 24))}</div>
      <div class="note">${esc(o.desc)}　共 ${o.chords.length} 個和弦</div>
    </div>`).join('');
  box.querySelectorAll('.aiw-opt').forEach(el => {
    el.querySelector('.aiw-use').onclick = () => useOption(Number(el.dataset.i));
  });
}

function useOption(i) {
  const o = sugg.options[i]; if (!o) return;
  store.checkpoint();
  const p = store.project;
  const [a, z] = sugg.range;
  // 只取代旋律涵蓋的範圍，範圍外原本的和弦保留
  p.chords = (p.chords || []).filter(c => c.t + c.d <= a + 1e-6 || c.t >= z - 1e-6).concat(o.chords.map(c => ({ ...c }))).sort((x, y) => x.t - y.t);
  p.chordKey = { ...sugg.key };
  p.showChords = true;
  store.changed('structure');
  store.emit('chords', {});
  chosen = i;
  renderOpts();
  toast(`和弦軌已寫入「${o.name}」（${o.chords.length} 個和弦），可以直接播放聽聽看`);
}

// ---------------- ② 一鍵編曲 ----------------
function ensurePlan() {
  if (!plan) plan = autoPlan(chordRange(), { intro: S.intro, ending: S.ending });
  return plan;
}
function renderRange() {
  const r = chordRange(), bpb = store.project.sigNum || 4;
  $('.aiw-range').textContent = r ? `和弦軌：第 ${r[0] + 1}–${r[1]} 小節（${r[1] - r[0]} 小節）` : '和弦軌是空的：先到「① 旋律配和弦」，或按時間軸左上的「和弦」自動偵測';
  const used = (plan || []).filter(s => !s.pre && !s.post).reduce((n, s) => n + s.bars, 0);
  if (r && plan && used !== r[1] - r[0]) $('.aiw-range').textContent += `；段落表中間共 ${used} 小節${used < r[1] - r[0] ? '（後面的和弦不會編到）' : '（超過和弦軌的部分延用最後一個和弦）'}`;
  if (r && S.intro && r[0] < 2) $('.aiw-range').textContent += '；和弦軌從第 1 小節開始，前面沒有空小節放前奏（要前奏的話先把整首往後挪）';
  void bpb;
}
function renderVals() {
  $('.aiw-varv').textContent = `${Math.round(S.variation * 100)}%`;
  $('.aiw-lvlv').textContent = `${Math.round(S.level * 100)}%`;
}
function renderParts() {
  $('.aiw-parts').innerHTML = PARTS.map(p => `<label class="aiw-part" style="--c:${p.color}"><input type="checkbox" data-p="${p.id}"${S.parts[p.id] !== false ? ' checked' : ''}> ${p.name}</label>`).join('');
  $('.aiw-parts').querySelectorAll('input').forEach(el => { el.onchange = () => { S.parts[el.dataset.p] = el.checked; save(); }; });
}
function renderPlan() {
  ensurePlan();
  const style = styleById(S.styleId);
  const box = $('.aiw-plan');
  if (!plan.length) { box.innerHTML = '<div class="aiw-empty">和弦軌是空的，沒有段落可以排。</div>'; renderRange(); return; }
  let bar = (chordRange()?.[0] ?? 0) - plan.filter(s => s.pre).reduce((n, s) => n + s.bars, 0);
  box.innerHTML = plan.map((s, i) => {
    const S2 = style.sections[s.sec];
    const nb = s.bars || (S2?.chords ? S2.chords.length + (s.sec === 'ending' ? 1 : 0) : 4);
    const from = Math.max(0, bar) + 1; bar += nb;
    return `<div class="aiw-seg" data-i="${i}">
      <span class="aiw-bar">${from}–${from + nb - 1}</span>
      <select class="aiw-sec">${SEC_CHOICES.map(x => `<option value="${x.id}"${x.id === s.sec ? ' selected' : ''}>${x.name}</option>`).join('')}</select>
      <label>小節 <input type="number" class="aiw-bars" min="${s.post ? 0 : 1}" max="64" value="${s.bars}" title="${s.post ? '0 = 用風格自己的長度' : ''}"></label>
      <select class="aiw-int"><option value="-1"${s.int < 0 ? ' selected' : ''}>弱（拿掉吉他、琶音）</option><option value="0"${!s.int ? ' selected' : ''}>正常</option><option value="1"${s.int > 0 ? ' selected' : ''}>強（加弦樂、力度大）</option></select>
      <button type="button" class="tbtn ghost aiw-up" title="往上移">↑</button>
      <button type="button" class="tbtn ghost aiw-rm" title="刪掉這一段">✕</button>
    </div>`;
  }).join('');
  box.querySelectorAll('.aiw-seg').forEach(el => {
    const i = Number(el.dataset.i);
    el.querySelector('.aiw-sec').onchange = e => { plan[i].sec = e.target.value; renderPlan(); };
    el.querySelector('.aiw-bars').onchange = e => { plan[i].bars = Math.max(plan[i].post ? 0 : 1, Math.min(64, Math.round(Number(e.target.value) || 0))); renderPlan(); };
    el.querySelector('.aiw-int').onchange = e => { plan[i].int = Number(e.target.value); };
    el.querySelector('.aiw-up').onclick = () => { if (i > 0) { [plan[i - 1], plan[i]] = [plan[i], plan[i - 1]]; renderPlan(); } };
    el.querySelector('.aiw-rm').onclick = () => { plan.splice(i, 1); renderPlan(); };
  });
  renderRange();
}

function runGenerate(newSeed) {
  if (!chordRange()) { toast('和弦軌是空的：先到「① 旋律配和弦」產生和弦，或用「和弦」按鈕自動偵測', 'warn'); return; }
  ensurePlan();
  if (newSeed || seed === 1) seed = (Math.random() * 2 ** 31) >>> 0 || 7;
  const style = styleById(S.styleId);
  const res = generate({ styleId: S.styleId, plan, variation: S.variation, seed, parts: S.parts, level: S.level });
  if (!res || !Object.keys(res.clips).length) { toast('沒有產生任何音符：檢查段落表與聲部勾選', 'warn'); return; }
  const n = applyArrangement(res, { seed, styleId: S.styleId, styleName: style.name.replace(/（.*$/, '') });
  lastStart = res.startBar * (store.project.sigNum || 4);
  const p = store.project;
  const bpmNote = Math.abs(p.bpm - style.bpm) > 12 ? `；這個風格建議 ${style.bpm} BPM，專案是 ${p.bpm} BPM（不會自動改速度）` : '';
  if ((style.sig || 4) !== (p.sigNum || 4)) toast(`注意：這個風格是 ${style.sig}/4 拍，專案是 ${p.sigNum}/4，小節會對不上`, 'warn');
  status(`已產生 ${res.bars} 小節、${n} 個音（版本 #${seed % 10000}）${bpmNote}`);
  toast(`智慧編曲完成：${res.bars} 小節、${Object.keys(res.clips).length} 個聲部`);
}

function renderTab() {
  root.querySelectorAll('.aiw-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  root.querySelectorAll('.aiw-pane').forEach(el => { el.hidden = el.dataset.pane !== S.tab; });
  if (S.tab === 'chords') { fillTracks(); renderOpts(); }
  else if (S.tab === 'arrange') { renderVals(); renderParts(); renderPlan(); }
}

export function toggleAI(force) {
  if (!root) build();
  open = force ?? !open;
  root.classList.toggle('hidden', !open);
  if (open) renderTab();
}
export const aiOpen = () => open;
// 頂列的「智慧編曲」按鈕（不經過 main.js）
document.getElementById('btnAI')?.addEventListener('click', () => toggleAI());
// 給測試用
export const _ai = { get plan() { return plan; }, get sugg() { return sugg; }, analyze, useOption, runGenerate, renderPlan, runCompose, get comp() { return comp; }, SEC_NAME };
