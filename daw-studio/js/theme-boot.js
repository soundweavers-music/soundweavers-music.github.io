// 在第一次繪製前套用使用者選的配色。CSP 不允許 inline script，所以獨立成檔案、在 <head> 同步載入。
// 沒選過的人預設用「世界聲音・木質深色」，跟網站的木質調一致。
(function () {
  var def = 'wood-light';
  var ok = ['pro', 'wood-dark', 'wood-light', 'midnight', 'forest', 'sunset', 'graphite', 'sakura', 'ocean', 'mint'];
  try {
    var t = localStorage.getItem('zhiyin-daw-theme');
    if (ok.indexOf(t) >= 0) def = t;
  } catch (e) { /* ignore */ }
  document.documentElement.setAttribute('data-theme', def);
})();
