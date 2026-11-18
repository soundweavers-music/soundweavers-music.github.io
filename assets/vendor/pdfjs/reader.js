/* Two-page book reader.
 *
 * Pages are pre-rendered to images at build time (LibreOffice → PDF → PNG), so
 * this only has to swap <img> sources: no PDF.js, no worker, nothing for a
 * strict CSP to block. Two pages show side by side like an open book, with our
 * own arrows and page counter — the browser's PDF viewer (and its download
 * button) is never used.
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

  var left = root.querySelector('[data-pdf-left]');
  var right = root.querySelector('[data-pdf-right]');
  var label = root.querySelector('[data-pdf-label]');
  var prev = root.querySelector('[data-pdf-prev]');
  var next = root.querySelector('[data-pdf-next]');
  var spread = 0;
  var spreads = Math.ceil(pages.length / 2);

  function show() {
    var i = spread * 2;
    left.src = pages[i];
    left.alt = '第 ' + (i + 1) + ' 頁';
    if (pages[i + 1]) {
      right.src = pages[i + 1];
      right.alt = '第 ' + (i + 2) + ' 頁';
      right.hidden = false;
      label.textContent = (i + 1) + '–' + (i + 2) + ' / ' + pages.length;
    } else {
      right.removeAttribute('src');
      right.hidden = true;
      label.textContent = (i + 1) + ' / ' + pages.length;
    }
    prev.disabled = spread <= 0;
    next.disabled = spread >= spreads - 1;
  }

  prev.addEventListener('click', function () { if (spread > 0) { spread--; show(); } });
  next.addEventListener('click', function () { if (spread < spreads - 1) { spread++; show(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { prev.click(); }
    if (e.key === 'ArrowRight') { next.click(); }
  });

  show();
})();
