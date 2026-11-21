/* 英文頁的即時翻譯。
 *
 * 工具頁有一半的字是 JS 事後塞進畫面的（選單選項、狀態列、錯誤訊息），
 * 靜態換字換不到。這支在載入後把字典套到整份文件，並且盯著 DOM 的變化，
 * 之後才長出來的節點也一併翻。字典本身由 scripts/page_i18n.py build 內嵌在
 * 頁面裡（window.__PAGE_I18N），所以每一頁只帶自己那幾條。
 *
 * 只對 <html lang="en"> 的頁面生效——中文頁不受影響。
 */
(function () {
  'use strict';
  if (!(document.documentElement.lang || '').toLowerCase().startsWith('en')) return;
  var T = window.__PAGE_I18N || {};

  // 長的字串先比：選項文字常是「吉他 · EADGBE」這種「詞 + 補充資訊」，
  // 整串比對不到時，把裡面認得的詞換掉就好（前後的字保留）
  var KEYS = Object.keys(T).sort(function (a, b) { return b.length - a.length; });

  function tr(text) {
    var k = text.trim();
    if (!k) return null;
    if (Object.prototype.hasOwnProperty.call(T, k)) return T[k];
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (key.length >= 2 && k.indexOf(key) !== -1) return k.split(key).join(T[key]);
    }
    return null;
  }

  function swapText(node) {
    var v = node.nodeValue;
    if (!v || !/\S/.test(v)) return;
    var out = tr(v);
    if (out === null) return;
    // 保留原本前後的空白，版面靠它對齊
    var lead = v.slice(0, v.length - v.replace(/^\s+/, '').length);
    var trail = v.slice(v.replace(/\s+$/, '').length);
    node.nodeValue = lead + out + trail;
  }

  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function swapAttrs(el) {
    if (!el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      var v = el.getAttribute(a);
      if (!v) continue;
      var out = tr(v);
      if (out !== null) el.setAttribute(a, out);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { swapText(root); return; }
    if (root.nodeType !== 1) return;
    swapAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) swapText(n);
    if (root.querySelectorAll) {
      var els = root.querySelectorAll('[placeholder],[title],[aria-label],[alt]');
      for (var j = 0; j < els.length; j++) swapAttrs(els[j]);
    }
  }

  function start() {
    walk(document.body);
    // 動態內容：只處理新長出來的節點，避免每次變動都重掃整頁
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) walk(added[j]);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
