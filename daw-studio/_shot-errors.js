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
