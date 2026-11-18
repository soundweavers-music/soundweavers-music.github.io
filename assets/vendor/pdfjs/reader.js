/* Book reader for 聲音旅圖.
 *
 * Pages are pre-rendered to images at build time (LibreOffice → PDF → PNG), so
 * this only has to swap <img> sources: no PDF.js, no worker, nothing for a
 * strict CSP to block. Our own arrows and page counter replace the browser's
 * PDF viewer (and its download button).
 *
 * Two layouts: a wide spread (two pages side by side, like an open book) and a
 * single page. Phones start on single, desktops on the spread; whichever the
 * reader picks is remembered in localStorage, and until they pick, the layout
 * follows the viewport.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-pdf-reader]');
  if (!root) { return; }

  var pages = [];
  try { pages = JSON.parse(root.getAttribute('data-pages') || '[]'); } catch (e) { pages = []; }

  function fallback() {
    var src = root.getAttribute('data-src');
    if (!src) { return; }
    root.innerHTML = '<iframe class="doc-frame" title="PDF" src="' + src + '#view=FitH"></iframe>';
  }
  if (!pages.length) { fallback(); return; }

  var book = root.querySelector('.doc-book') || root;
  var left = root.querySelector('[data-pdf-left]');
  var right = root.querySelector('[data-pdf-right]');
  var label = root.querySelector('[data-pdf-label]');
  var prev = root.querySelector('[data-pdf-prev]');
  var next = root.querySelector('[data-pdf-next]');
  var singleBtn = root.querySelector('[data-pdf-mode="single"]');
  var spreadBtn = root.querySelector('[data-pdf-mode="spread"]');

  var STORE = 'sound-journey-reader-mode';
  var wideQuery = window.matchMedia('(min-width: 900px)');

  function storedMode() {
    try { return localStorage.getItem(STORE); } catch (e) { return null; }
  }
  function rememberMode(value) {
    try { localStorage.setItem(STORE, value); } catch (e) { /* private mode */ }
  }

  var mode = storedMode() || (wideQuery.matches ? 'spread' : 'single');
  var index = 0;            // 0-based index of the first visible page

  function clampIndex() {
    var last = pages.length - 1;
    if (index > last) { index = last; }
    if (index < 0) { index = 0; }
    // a spread always starts on a left-hand (even) page
    if (mode === 'spread' && index % 2) { index -= 1; }
  }

  function render() {
    clampIndex();
    book.setAttribute('data-mode', mode);
    if (singleBtn) { singleBtn.setAttribute('aria-pressed', mode === 'single' ? 'true' : 'false'); }
    if (spreadBtn) { spreadBtn.setAttribute('aria-pressed', mode === 'spread' ? 'true' : 'false'); }

    left.src = pages[index];
    left.alt = '第 ' + (index + 1) + ' 頁';

    if (mode === 'spread' && pages[index + 1]) {
      right.src = pages[index + 1];
      right.alt = '第 ' + (index + 2) + ' 頁';
      right.hidden = false;
      label.textContent = (index + 1) + '–' + (index + 2) + ' / ' + pages.length;
    } else {
      right.hidden = true;
      right.removeAttribute('src');
      label.textContent = (index + 1) + ' / ' + pages.length;
    }

    prev.disabled = index <= 0;
    next.disabled = mode === 'single'
      ? index >= pages.length - 1
      : index + 2 >= pages.length;
  }

  function step(delta) {
    index += delta;
    render();
  }

  prev.addEventListener('click', function () { step(mode === 'single' ? -1 : -2); });
  next.addEventListener('click', function () { step(mode === 'single' ? 1 : 2); });

  function setMode(next_) {
    if (!next_ || next_ === mode) { return; }
    mode = next_;
    rememberMode(mode);
    render();
  }
  if (singleBtn) { singleBtn.addEventListener('click', function () { setMode('single'); }); }
  if (spreadBtn) { spreadBtn.addEventListener('click', function () { setMode('spread'); }); }

  // Until the reader chooses, follow the window: phone → single, desktop → spread.
  function onViewportChange(event) {
    if (storedMode()) { return; }
    mode = event.matches ? 'spread' : 'single';
    render();
  }
  if (wideQuery.addEventListener) {
    wideQuery.addEventListener('change', onViewportChange);
  } else if (wideQuery.addListener) {
    wideQuery.addListener(onViewportChange);
  }

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { return; }
    if (e.key === 'ArrowLeft') { prev.click(); }
    if (e.key === 'ArrowRight') { next.click(); }
  });

  render();
})();
