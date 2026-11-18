/* Two-page PDF reader with our own navigation.
 *
 * The browser's built-in PDF viewer cannot do a true spread and always shows a
 * download button, so the reader renders pages to a canvas with PDF.js instead.
 * Pages are drawn two-up (like an open book); prev/next move by spread.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-pdf-reader]');
  if (!root) { return; }

  // If PDF.js did not initialise, fall back to the browser's inline viewer so
  // the article is still readable instead of sitting on「載入中…」forever.
  function fallback() {
    root.innerHTML = '<iframe class="doc-frame" title="PDF" src="' +
      root.getAttribute('data-src') + '#view=FitH"></iframe>';
  }
  if (typeof pdfjsLib === 'undefined') { fallback(); return; }

  var canvas = root.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var label = root.querySelector('[data-pdf-label]');
  var prev = root.querySelector('[data-pdf-prev]');
  var next = root.querySelector('[data-pdf-next]');
  var pdf = null;
  var total = 0;
  var spread = 0;

  pdfjsLib.GlobalWorkerOptions.workerSrc = root.getAttribute('data-worker');

  function pagesShown() { return 2; }
  function spreadCount() { return Math.max(1, Math.ceil(total / pagesShown())); }

  function updateButtons() {
    prev.disabled = spread <= 0;
    next.disabled = spread >= spreadCount() - 1;
  }

  function render() {
    if (!pdf) { return; }
    var first = spread * pagesShown() + 1;
    var second = first + 1;
    var wantSecond = second <= total;

    Promise.all([
      pdf.getPage(first),
      wantSecond ? pdf.getPage(second) : Promise.resolve(null)
    ]).then(function (pages) {
      var p1 = pages[0];
      var p2 = pages[1];
      var v1 = p1.getViewport({ scale: 1 });
      var v2 = p2 ? p2.getViewport({ scale: 1 }) : null;

      var availW = root.clientWidth - 8;
      var availH = Math.max(320, window.innerHeight - 260);
      var naturalW = v1.width + (v2 ? v2.width : 0);
      var naturalH = Math.max(v1.height, v2 ? v2.height : 0);
      var scale = Math.min(availW / naturalW, availH / naturalH);

      var s1 = p1.getViewport({ scale: scale });
      var s2 = v2 ? p2.getViewport({ scale: scale }) : null;

      canvas.width = Math.floor(s1.width + (s2 ? s2.width : 0));
      canvas.height = Math.floor(Math.max(s1.height, s2 ? s2.height : 0));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      p1.render({ canvasContext: ctx, viewport: s1 }).promise.then(function () {
        if (!s2) { return null; }
        ctx.save();
        ctx.translate(s1.width, 0);
        var done = p2.render({ canvasContext: ctx, viewport: s2 }).promise;
        return done.then(function () { ctx.restore(); });
      }).then(function () {
        label.textContent = s2 ? (first + '–' + second + ' / ' + total)
                               : (first + ' / ' + total);
        updateButtons();
      });
    });
  }

  prev.addEventListener('click', function () {
    if (spread > 0) { spread -= 1; render(); }
  });
  next.addEventListener('click', function () {
    if (spread < spreadCount() - 1) { spread += 1; render(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { prev.click(); }
    if (e.key === 'ArrowRight') { next.click(); }
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 160);
  });

  pdfjsLib.getDocument(root.getAttribute('data-src')).promise.then(function (doc) {
    pdf = doc;
    total = doc.numPages;
    render();
  }).catch(function () {
    label.textContent = '改用內建檢視器';
    fallback();
  });
})();
