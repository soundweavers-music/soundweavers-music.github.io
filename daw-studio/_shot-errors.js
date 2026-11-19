// 在 App 載入前先掛錯誤收集器，模組初始化時的錯也抓得到
window.__ERRS = [];
window.addEventListener('error', function (e) {
  window.__ERRS.push('error: ' + (e.message || '(no message)') + ' @' +
    String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0));
});
window.addEventListener('unhandledrejection', function (e) {
  var r = e.reason;
  window.__ERRS.push('reject: ' + ((r && (r.stack || r.message)) || String(r)));
});
// App 把很多失敗吞進 console.warn（例如 worklet 載入失敗），一般使用者看不到
['warn', 'error'].forEach(function (k) {
  var orig = console[k].bind(console);
  console[k] = function () {
    try {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        parts.push(a && a.stack ? a.stack : (typeof a === 'object' ? JSON.stringify(a) : String(a)));
      }
      window.__ERRS.push('console.' + k + ': ' + parts.join(' ').slice(0, 400));
    } catch (e) { /* ignore */ }
    orig.apply(console, arguments);
  };
});
