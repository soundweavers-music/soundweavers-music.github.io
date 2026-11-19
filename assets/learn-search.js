// /learn/ 的內容搜尋：抓 assets/learn-index.json（由 scripts/build_learn_index.py 產生），
// 比對課程／章節標題、摘要與各級小標，把符合的章節列出來。
// 索引是在第一次動到搜尋框時才抓，平常不影響載入速度。
(function () {
  var input = document.getElementById('learnSearch');
  if (!input) return;
  var statusEl = document.getElementById('learnSearchStatus');
  var resultsEl = document.getElementById('learnResults');
  var cards = document.getElementById('learnCards');
  var note = document.getElementById('learnNote');
  var MAX = 60;
  document.documentElement.setAttribute('data-learn-search', 'ready');

  var index = null;      // null = 還沒抓
  var loading = false;
  var timer = 0;

  function load() {
    if (index || loading) return;
    // 測試或離線預載可以先放 window.__learnIndex，就不用等 fetch
    if (window.__learnIndex) { index = window.__learnIndex; run(); return; }
    loading = true;
    var url = input.getAttribute('data-index') || '../assets/learn-index.json';
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) { index = Array.isArray(d) ? d : []; })
      .catch(function () { index = []; })
      .then(function () { loading = false; run(); });
  }

  function norm(s) { return (s || '').toLowerCase(); }

  function tokens(q) {
    return norm(q).split(/[\s,，、;；]+/).filter(function (t) { return t.length > 0; });
  }

  // 每個關鍵字都要命中；標題命中權重最高，其次小標、摘要、課程名
  function score(item, ts) {
    var t = norm(item.t);
    var h = norm((item.h || []).join(' '));
    var d = norm(item.d);
    var c = norm(item.c);
    var s = 0;
    for (var i = 0; i < ts.length; i++) {
      var tok = ts[i];
      if (t.indexOf(tok) >= 0) s += 6;
      else if (h.indexOf(tok) >= 0) s += 3;
      else if (d.indexOf(tok) >= 0) s += 2;
      else if (c.indexOf(tok) >= 0) s += 1;
      else return -1;
    }
    return s;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  function mark(text, ts) {
    var out = esc(text);
    for (var i = 0; i < ts.length; i++) {
      var tok = esc(ts[i]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!tok) continue;
      out = out.replace(new RegExp(tok, 'gi'), function (m) { return '<mark>' + m + '</mark>'; });
    }
    return out;
  }

  // 摘要優先顯示「命中的那個小標」，讓使用者一眼看到為什麼這頁符合
  function snippet(item, ts) {
    var heads = item.h || [];
    for (var i = 0; i < ts.length; i++) {
      for (var j = 0; j < heads.length; j++) {
        var h = heads[j];
        // 標題本身就命中的話，再顯示一次沒有意義，改抓小標或摘要
        if (h !== item.t && norm(h).indexOf(ts[i]) >= 0) return '§ ' + h;
      }
    }
    if (item.d && item.d !== item.t) return item.d;
    return '';
  }

  function render(items, ts, query) {
    if (!items.length) {
      resultsEl.innerHTML = '<p class="learn-empty">找不到「' + esc(query) + '」相關的內容。<br>'
        + '試試更短的關鍵字，例如「共鳴」「混音」「六線譜」「拍號」。</p>';
      resultsEl.hidden = false;
      return;
    }
    var html = items.slice(0, MAX).map(function (it) {
      return '<a class="learn-result" href="' + esc(it.u) + '">'
        + '<span class="lr-title">' + mark(it.t, ts) + '</span>'
        + '<span class="lr-course">' + esc(it.c) + '</span>'
        + '<span class="lr-snip">' + mark(snippet(it, ts), ts) + '</span>'
        + '</a>';
    }).join('');
    resultsEl.innerHTML = html;
    resultsEl.hidden = false;
  }

  function run() {
    var q = input.value.trim();
    var ts = tokens(q);
    if (!ts.length) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      statusEl.textContent = '';
      if (cards) cards.classList.remove('learn-hide');
      if (note) note.classList.remove('learn-hide');
      return;
    }
    if (!index) { load(); return; }          // 索引到了會再跑一次
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var s = score(index[i], ts);
      if (s >= 0) hits.push({ s: s, it: index[i] });
    }
    hits.sort(function (a, b) { return b.s - a.s || a.it.t.localeCompare(b.it.t); });
    var items = hits.map(function (h) { return h.it; });
    if (cards) cards.classList.add('learn-hide');
    if (note) note.classList.add('learn-hide');
    statusEl.textContent = items.length
      ? '找到 ' + items.length + ' 個相關章節' + (items.length > MAX ? '（顯示前 ' + MAX + ' 個）' : '')
      : '';
    render(items, ts, q);
  }

  function debounce() { clearTimeout(timer); timer = setTimeout(run, 120); }

  input.addEventListener('focus', load);
  input.addEventListener('input', function () { load(); debounce(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.value = '';
      run();
      input.blur();
    } else if (e.key === 'Enter') {
      var first = resultsEl.querySelector('.learn-result');
      if (first) first.click();
    }
  });

  // 按「/」直接跳到搜尋框（正在輸入時不搶）
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    input.focus();
  });
})();
