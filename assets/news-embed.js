/* 音樂新聞：把隔壁織音人的子網站（soundweavers-musicnews）嵌進 /news/
 *
 * 做法：抓子網站的 HTML → 塞進同源 iframe 的 srcdoc → 只留內容、藏掉它的站頭站尾。
 * 為什麼要自己改字串：srcdoc 文件的 <base> 在 Chrome 不會生效，
 * 相對網址會被解析成主站的網址（實測 styles.css 會 404）。
 */
(function () {
  "use strict";

  var box = document.getElementById("newsFrameBox");
  if (!box) return;
  var status = document.getElementById("newsStatus");
  var NEWS = box.getAttribute("data-src");
  if (!NEWS) return;
  var ORIGIN = NEWS.replace(/[^/]*$/, "");        // …/news/

  function isAbsolute(u) {
    if (!u) return true;
    var head = u.slice(0, 8).toLowerCase();
    if (u.slice(0, 1) === "#") return true;
    if (u.slice(0, 2) === "//") return true;
    return head.indexOf("http:") === 0 || head.indexOf("https:") === 0 ||
           head.indexOf("data:") === 0 || head.indexOf("blob:") === 0 ||
           head.indexOf("mailto:") === 0 || head.indexOf("javascri") === 0;
  }

  // 把 HTML 裡「相對」的 href / src 改成子網站的絕對網址
  function absolutize(html) {
    var out = html.replace(/\b(href|src|poster|data-src)\s*=\s*"([^"]*)"/g, function (m, attr, val) {
      if (isAbsolute(val)) return m;
      try { return attr + '="' + new URL(val, ORIGIN).href + '"'; }
      catch (e) { return m; }
    });
    return out.replace(/\b(href|src|poster|data-src)\s*=\s*'([^']*)'/g, function (m, attr, val) {
      if (isAbsolute(val)) return m;
      try { return attr + '="' + new URL(val, ORIGIN).href + '"'; }
      catch (e) { return m; }
    });
  }

  // 子網站的程式若自己抓相對路徑的資料，也導回它的站
  var PATCH = "<script>(function(){var O=" + JSON.stringify(ORIGIN) + ";" +
    "function abs(u){if(typeof u!=='string')return u;if(u.slice(0,1)==='#'||u.slice(0,2)==='//')return u;" +
    "var h=u.slice(0,8).toLowerCase();" +
    "if(h.indexOf('http:')===0||h.indexOf('https:')===0||h.indexOf('data:')===0||h.indexOf('blob:')===0)return u;" +
    "try{return new URL(u,O).href}catch(e){return u}}" +
    "var of=window.fetch;window.fetch=function(u,o){return of.call(this,abs(u),o)};" +
    "var oo=XMLHttpRequest.prototype.open;" +
    "XMLHttpRequest.prototype.open=function(m,u){arguments[1]=abs(u);return oo.apply(this,arguments)};" +
    "})();<\/script>";

  var HIDE = "<style>" +
    "header.site-header,.site-header,nav.site-nav,footer.site-footer,.site-footer{display:none!important}" +
    "body{padding-top:0!important;margin:0;background:transparent}" +
    "main.container{max-width:100%!important}" +
    "</style>";

  fetch(NEWS, { credentials: "omit" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then(function (html) {
      var injected = absolutize(html).replace(/<head([^>]*)>/i, function (m) {
        return m + PATCH + '<base href="' + ORIGIN + '">' + HIDE;
      });
      var f = document.createElement("iframe");
      f.title = "音樂新聞";
      f.setAttribute("loading", "lazy");
      f.style.cssText = "width:100%;max-width:1040px;margin:0 auto;border:0;display:block;min-height:800px";
      f.srcdoc = injected;

      var fit = function () {
        try {
          var d = f.contentDocument;
          if (!d || !d.body) return;
          var h = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight);
          if (h > 100) f.style.height = (h + 24) + "px";
        } catch (e) { /* 量不到就維持預設 */ }
      };
      // 子網站的程式若用 JS 設了相對的影片／圖片路徑，會解析成主站網址（404）。
      // 這裡把「指向我們自己 /news/ 的」改回子網站。
      var OUR_PATH = location.pathname;
      function fixOne(el, attr) {
        var v = el.getAttribute(attr);
        if (!v) return;
        try {
          if (!isAbsolute(v)) { el.setAttribute(attr, new URL(v, ORIGIN).href); return; }
          if (v.indexOf(location.origin) === 0) {
            var rel = v.slice(location.origin.length);
            if (rel.indexOf(OUR_PATH) === 0) el.setAttribute(attr, ORIGIN + rel.slice(OUR_PATH.length));
          }
        } catch (e) { /* 忽略 */ }
      }
      function fixTree(root) {
        var sel = "img,video,source,audio,link,script,a,iframe";
        var list = root.querySelectorAll ? root.querySelectorAll(sel) : [];
        for (var i = 0; i < list.length; i++) {
          fixOne(list[i], "src"); fixOne(list[i], "href"); fixOne(list[i], "poster");
        }
      }

      f.addEventListener("load", function () {
        try {
          fixTree(f.contentDocument);
          new MutationObserver(function () { fixTree(f.contentDocument); })
            .observe(f.contentDocument.documentElement, { childList: true, subtree: true, attributes: true,
              attributeFilter: ["src", "href", "poster"] });
        } catch (e) { /* 跨網域就跳過 */ }
        fit();
        // 內部的篩選／月份切換會改變高度，隔一段時間再量
        var n = 0;
        var timer = setInterval(function () { fit(); if (++n > 12) clearInterval(timer); }, 700);
      });
      if (status && status.parentNode) status.parentNode.removeChild(status);
      box.appendChild(f);
    })
    .catch(function (e) {
      if (status) status.textContent = "載入失敗（" + e.message + "），請直接開原網站。";
    });
})();
