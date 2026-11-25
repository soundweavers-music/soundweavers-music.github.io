// 本機 AI 模型倉庫（IndexedDB）
//  - 模型檔不進 repo（GitHub 有大小限制、Pages 也有 1 GB 上限），由使用者自己下載一次，
//    選進這個頁面後驗證 sha256、存進瀏覽器；之後工具直接從這裡讀，不會再連到任何伺服器。
//  - 用法：ZhiyinModels.mount(containerEl, 'funasr-nano')
//    chord-ai.js 也會用 ZhiyinModels.get('funasr-nano') 優先讀這裡的模型。
(function () {
  "use strict";
  var DB_NAME = "zhiyin-ai-models", STORE = "models", VERSION = 1;
  var BASE = document.currentScript ? new URL(".", document.currentScript.src) : new URL("/assets/", location.origin);
  var MANIFEST = new URL("ai-models.json", BASE);
  var dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode) {
    return db().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); });
  }
  function get(name) {
    return tx("readonly").then(function (s) {
      return new Promise(function (res, rej) {
        var q = s.get(name);
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  function put(name, buf, meta) {
    return tx("readwrite").then(function (s) {
      return new Promise(function (res, rej) {
        var q = s.put({ buf: buf, meta: meta || {}, at: Date.now() }, name);
        q.onsuccess = function () { res(true); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  function del(name) {
    return tx("readwrite").then(function (s) {
      return new Promise(function (res, rej) {
        var q = s.delete(name);
        q.onsuccess = function () { res(true); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }
  function sha256(buf) {
    return crypto.subtle.digest("SHA-256", buf).then(hex);
  }
  // 存著的模型是不是舊版：清單的 sha256 換了（模型修正後重新上傳），而存的那份記錄的雜湊不一樣
  function isStale(rec, entry) {
    return !!(rec && entry && entry.sha256 && rec.meta && rec.meta.sha256 && rec.meta.sha256 !== entry.sha256);
  }
  function manifest() {
    return fetch(MANIFEST).then(function (r) { return r.ok ? r.json() : {}; });
  }

  // ── 介面 ──
  var CSS = '' +
    '.zmodel{border:1px solid var(--line,#e5e0d8);border-radius:10px;background:var(--surface,#fff);padding:14px 16px;margin:14px 0;font-size:13.5px;color:var(--ink2,#4c443a)}' +
    '.zmodel-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}' +
    '.zmodel-top b{color:var(--ink,#2e2820)}' +
    '.zmodel-meta{color:var(--muted,#6b6257);font-size:12px}' +
    '.zmodel-state{margin-left:auto;font-size:12px;border-radius:999px;padding:2px 10px;background:var(--soft,#f4efe6);color:var(--muted,#6b6257)}' +
    '.zmodel-state.ok{background:#e8f6ec;color:#2f6b3f}' +
    '.zmodel-state.busy{background:#fdf2dc;color:#8a5a12}' +
    '.zmodel-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
    '.zmodel-btn,.zmodel-a{font-size:13px;border-radius:7px;padding:7px 12px;border:1px solid var(--line2,#d6cfc2);background:var(--soft,#f8f5ef);color:var(--ink,#2e2820);text-decoration:none;cursor:pointer}' +
    '.zmodel-btn.primary,.zmodel-a.primary{background:var(--accent,#a0522d);border-color:var(--accent,#a0522d);color:#fff}' +
    '.zmodel-btn[disabled]{opacity:.45;cursor:not-allowed}' +
    '.zmodel-list{list-style:none;margin:10px 0 0;padding:0;font-size:12.5px}' +
    '.zmodel-item{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px dashed var(--line,#e5e0d8)}' +
    '.zmodel-item:last-child{border-bottom:0}' +
    '.zmodel-item-state{color:var(--muted,#6b6257)}' +
    '.zmodel-item-state.ok{color:#2f6b3f}' +
    '.zmodel-note{margin:10px 0 0;font-size:12px;color:var(--muted,#6b6257);line-height:1.6}';
  var styled = false;
  function style() {
    if (styled) return;
    styled = true;
    var s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function fmtSize(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  }

  // 生成一張「模型卡」：狀態、下載連結、選檔、移除
  function mount(el, key) {
    if (!el) return Promise.resolve(null);
    style();
    el.classList.add("zmodel");
    el.innerHTML = '' +
      '<div class="zmodel-top"><b class="zmodel-name">模型</b><span class="zmodel-meta"></span>' +
      '<span class="zmodel-state">檢查中…</span></div>' +
      '<div class="zmodel-act">' +
      '  <a class="zmodel-a primary zmodel-get" target="_blank" rel="noopener" hidden>下載模型</a>' +
      '  <button type="button" class="zmodel-btn zmodel-pick">選擇已下載的檔案…</button>' +
      '  <button type="button" class="zmodel-btn zmodel-del" hidden>移除模型</button>' +
      '</div>' +
      '<p class="zmodel-note"></p>' +
      '<input type="file" class="zmodel-file" accept=".onnx,application/octet-stream" hidden>';

    var q = function (s) { return el.querySelector(s); };
    var stateEl = q(".zmodel-state"), nameEl = q(".zmodel-name"), metaEl = q(".zmodel-meta");
    var getA = q(".zmodel-get"), pick = q(".zmodel-pick"), delB = q(".zmodel-del");
    var note = q(".zmodel-note"), fileIn = q(".zmodel-file");
    var entry = null;

    function setState(txt, cls) {
      stateEl.textContent = txt;
      stateEl.className = "zmodel-state" + (cls ? " " + cls : "");
    }
    function render(has, stale) {
      if (!entry) return;
      if (has && stale) {
        setState("要更新", "busy");
        delB.hidden = false;
        pick.classList.add("primary");
        if (entry.url) { getA.hidden = false; getA.href = entry.url; getA.textContent = "下載新版（" + fmtSize(entry.size) + "）"; }
        note.innerHTML = "這個瀏覽器裡的是<b>舊版</b>模型（已修正錯誤）。請按上面的連結下載新版，再按「選擇已下載的檔案…」選進來，會直接取代舊版。";
        return;
      }
      setState(has ? "已安裝" : "未安裝", has ? "ok" : "");
      delB.hidden = !has;
      pick.classList.toggle("primary", !has);
      if (entry.url) { getA.hidden = false; getA.href = entry.url; getA.textContent = "下載模型（" + fmtSize(entry.size) + "）"; }
      note.innerHTML = has
        ? "模型存在這個瀏覽器裡（IndexedDB），下次開啟不用再下載。要換版本或清空間可以按「移除模型」。"
        : "第一次使用時下載一次就好：按上面的連結下載，再按「選擇已下載的檔案…」選進來。" +
          (entry.sha256 ? "<br>檔案驗證：SHA-256 必須是 <code>" + entry.sha256.slice(0, 16) + "…</code>，不符會拒絕安裝。" : "") +
          (entry.note ? "<br>" + entry.note : "");
    }

    return manifest().then(function (all) {
      entry = all[key];
      if (!entry) { setState("沒有這個模型", ""); note.textContent = "ai-models.json 裡找不到 " + key; return null; }
      nameEl.textContent = entry.name || key;
      metaEl.textContent = [entry.size ? fmtSize(entry.size) : "", entry.license || ""].filter(Boolean).join("・");
      return get(key).then(function (rec) {
        render(!!rec, isStale(rec, entry));
        pick.onclick = function () { fileIn.click(); };
        delB.onclick = function () {
          if (!confirm("要把這個模型從瀏覽器移除嗎？下次使用要重新下載。")) return;
          setState("移除中…", "busy");
          del(key).then(function () { render(false); document.dispatchEvent(new CustomEvent("zhiyin-model-changed", { detail: { key: key, installed: false } })); });
        };
        fileIn.onchange = function () {
          var f = fileIn.files && fileIn.files[0];
          fileIn.value = "";
          if (!f) return;
          if (entry.size && f.size !== entry.size) {
            alert("檔案大小不對：拿到 " + fmtSize(f.size) + "，應該是 " + fmtSize(entry.size) + "。\n請確認下載完整（或不要解壓縮）。");
            return;
          }
          setState("驗證中…", "busy");
          var fr = new FileReader();
          fr.onerror = function () { setState("讀取失敗", ""); };
          fr.onload = function () {
            var buf = fr.result;
            sha256(buf).then(function (h) {
              if (entry.sha256 && h !== entry.sha256) {
                setState("驗證不符", "");
                alert("SHA-256 不符，這個檔案不是預期的模型（或下載壞了）。\n預期：" + entry.sha256 + "\n拿到：" + h);
                return;
              }
              setState("安裝中…", "busy");
              put(key, buf, { size: buf.byteLength, sha256: h }).then(function () {
                render(true);
                document.dispatchEvent(new CustomEvent("zhiyin-model-changed", { detail: { key: key, installed: true } }));
              }).catch(function (e) {
                setState("安裝失敗", "");
                alert("存不進瀏覽器（可能是空間不足）：" + (e && e.message ? e.message : e));
              });
            });
          };
          fr.readAsArrayBuffer(f);
        };
        return { get: get, entry: entry };
      });
    });
  }

  // 一次裝一整組模型（例如 V5 的十張圖）：一份清單、一次選檔、逐檔對到清單裡的名字
  function mountSet(el, group, opts) {
    if (!el) return Promise.resolve(null);
    style();
    el.classList.add("zmodel");
    el.innerHTML = '' +
      '<div class="zmodel-top"><b class="zmodel-name">' + ((opts && opts.title) || "模型組") + '</b>' +
      '<span class="zmodel-meta"></span><span class="zmodel-state zmodel-set-state">檢查中…</span></div>' +
      '<ul class="zmodel-list"></ul>' +
      '<div class="zmodel-act">' +
      '  <button type="button" class="zmodel-btn primary zmodel-pick-set">選擇已下載的檔案（可多選）…</button>' +
      '  <button type="button" class="zmodel-btn zmodel-del-set" hidden>全部移除</button>' +
      '</div>' +
      '<p class="zmodel-note"></p>' +
      '<input type="file" class="zmodel-file-set" multiple accept=".onnx" hidden>';

    var q = function (s) { return el.querySelector(s); };
    var stateEl = q(".zmodel-set-state"), listEl = q(".zmodel-list"), noteEl = q(".zmodel-note");
    var pickB = q(".zmodel-pick-set"), delB = q(".zmodel-del-set"), fileIn = q(".zmodel-file-set");
    var entries = {}, keys = [];

    function fmt(n) { return n >= 1048576 ? (n / 1048576).toFixed(0) + " MB" : Math.round(n / 1024) + " KB"; }

    function refresh() {
      var have = 0, bytes = 0, totalBytes = 0;
      listEl.innerHTML = "";
      keys.forEach(function (k) {
        var e = entries[k], rec = null;
        totalBytes += e.size || 0;
        var li = document.createElement("li");
        li.className = "zmodel-item";
        li.innerHTML = '<span class="zmodel-item-name"></span><span class="zmodel-item-state"></span>';
        li.querySelector(".zmodel-item-name").textContent = e.name || k;
        listEl.appendChild(li);
        get(k).then(function (r) {
          var ok = !!r, stale = isStale(r, e);
          if (ok && !stale) { have++; bytes += e.size || 0; }
          var st = li.querySelector(".zmodel-item-state");
          st.textContent = ok ? (stale ? "舊版" : "已安裝") : "缺";
          st.className = "zmodel-item-state" + (ok && !stale ? " ok" : "");
          if (have + 1 === 0) return;
          stateEl.textContent = have === keys.length ? "已就緒" : ("缺 " + (keys.length - have) + " 個");
          stateEl.className = "zmodel-state zmodel-set-state" + (have === keys.length ? " ok" : "");
        });
      });
      Promise.all(keys.map(function (k) { return get(k); })).then(function (recs) {
        var done = recs.filter(function (r, i) { return r && !isStale(r, entries[keys[i]]); }).length;
        stateEl.textContent = done === keys.length ? "已就緒" : ("缺 " + (keys.length - done) + " 個");
        stateEl.className = "zmodel-state zmodel-set-state" + (done === keys.length ? " ok" : "");
        delB.hidden = done === 0;
        noteEl.innerHTML = done === keys.length
          ? "整組都在這個瀏覽器裡（IndexedDB），下次開啟不用再下載。總共 " + fmt(totalBytes) + "。"
          : "第一次要下載 " + keys.length + " 個檔案（共 " + fmt(totalBytes) + "）。到 Release 頁面全部下載後，" +
            "按上面的按鈕一次全選進來即可。";
        document.dispatchEvent(new CustomEvent("zhiyin-model-changed", { detail: { group: group, ready: done === keys.length } }));
      });
    }

    return manifest().then(function (all) {
      keys = Object.keys(all).filter(function (k) { return all[k].group === group; });
      if (!keys.length) { stateEl.textContent = "找不到這組模型"; return null; }
      keys.forEach(function (k) { entries[k] = all[k]; });
      refresh();

      pickB.onclick = function () { fileIn.click(); };
      fileIn.onchange = function () {
        var files = Array.prototype.slice.call(fileIn.files || []);
        fileIn.value = "";
        if (!files.length) return;
        stateEl.textContent = "安裝中…";
        var chain = Promise.resolve(), done = 0, skipped = 0;
        files.forEach(function (f) {
          chain = chain.then(function () {
            var key = keys.filter(function (k) { return entries[k].file === f.name; })[0];
            if (!key) { skipped++; return; }
            var e = entries[key];
            if (e.size && f.size !== e.size) { alert(f.name + " 大小不對：" + fmt(f.size) + "，應該是 " + fmt(e.size)); return; }
            return new Promise(function (res) {
              var fr = new FileReader();
              fr.onload = function () {
                sha256(fr.result).then(function (h) {
                  if (e.sha256 && h !== e.sha256) { alert(f.name + " 的 SHA-256 不符，跳過。"); res(); return; }
                  put(key, fr.result, { size: f.size, sha256: h }).then(function () { done++; res(); });
                });
              };
              fr.onerror = function () { res(); };
              fr.readAsArrayBuffer(f);
            });
          });
        });
        chain.then(function () {
          refresh();
          if (skipped) alert("有 " + skipped + " 個檔案不在這組清單裡，已忽略。");
        });
      };
      delB.onclick = function () {
        if (!confirm("要把整組模型從瀏覽器移除嗎？下次使用要重新下載。")) return;
        Promise.all(keys.map(function (k) { return del(k); })).then(refresh);
      };
      return { keys: keys };
    });
  }

  window.ZhiyinModels = { get: get, put: put, del: del, sha256: sha256, manifest: manifest, mount: mount, mountSet: mountSet, isStale: isStale };
})();
