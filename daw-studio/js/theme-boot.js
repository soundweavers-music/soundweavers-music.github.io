// 在第一次繪製前套用使用者選的配色。CSP 不允許 inline script，所以獨立成檔案、在 <head> 同步載入。
(function () {
  try {
    var t = localStorage.getItem('zhiyin-daw-theme');
    if (t === 'pro' || t === 'wood-dark' || t === 'wood-light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* ignore */ }
})();
