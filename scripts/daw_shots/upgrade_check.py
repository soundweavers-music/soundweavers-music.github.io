"""音色庫更新的檢查：已經下載過「大小一樣、內容不同」的舊版（例如 2026-11-28 走音那一版）的人，
下一次開頁面會不會換成新版，而且只換一次。

  第 1 次：舊程式＋舊音色庫＋舊格式 banks.json（git 的 HEAD 版本，在另一個資料夾）→ 存進瀏覽器
  第 2 次：新程式＋新音色庫（同一個瀏覽器設定檔）→ 應該重新下載鋼琴 1 次
  第 3 次：再開一次 → 應該 0 次

    python scripts/daw_shots/upgrade_check.py <舊版資料夾（git worktree）>
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

NEW = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT, DBG = 8790, 9334


def serve(root):
    hits = {"sf2": []}

    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(root), **kw)

        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path.split("?")[0].endswith(".sf2"):
                hits["sf2"].append(self.path)
            return super().do_GET()

        def end_headers(self):
            # 不讓瀏覽器把「舊程式」快取起來：換資料夾之後要真的跑到新程式
            # （線上 GitHub Pages 是 max-age=600，最多 10 分鐘就會換成新程式）
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, hits


def visit(root, profile):
    import websocket
    srv, hits = serve(root)
    p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
                          f"--remote-debugging-port={DBG}", f"--user-data-dir={profile}", "about:blank"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{DBG}/json"))
                ws = websocket.create_connection(next(t for t in tabs if t["type"] == "page")["webSocketDebuggerUrl"], timeout=60)
                break
            except Exception:
                time.sleep(0.2)
        n = 0

        def call(method, **params):
            nonlocal n
            n += 1
            ws.send(json.dumps({"id": n, "method": method, "params": params}))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == n:
                    return m.get("result", {})

        call("Page.navigate", url=f"http://127.0.0.1:{PORT}/daw-studio/index.html")
        # 等內建音色庫都就緒：鋼琴那份 ready 而且沒有還在跑的載入
        expr = ("(()=>{const b=(window.__daw&&1)&&[...document.querySelectorAll('x')];"
                "const L=window.__dawLoading?window.__dawLoading.list():[];"
                "return JSON.stringify({run:L.filter(j=>j.state==='run').length,n:L.length})})()")
        t0, last = time.time(), None
        while time.time() - t0 < 120:
            time.sleep(1)
            r = call("Runtime.evaluate", expression=expr, returnByValue=True).get("result", {}).get("value")
            last = json.loads(r) if r else None
            if last and last["run"] == 0 and time.time() - t0 > 6:
                break
        # 讀這台電腦存的鋼琴：大小、版本
        stored = call("Runtime.evaluate", awaitPromise=True, returnByValue=True, expression="""
          new Promise(res => { const r = indexedDB.open('zhiyin-daw-banks', 1);
            r.onsuccess = () => { const t = r.result.transaction('banks').objectStore('banks').getAll();
              t.onsuccess = () => res(JSON.stringify(t.result.filter(x => /Salamander/.test(x.name))
                .map(x => ({ id: x.id, size: x.size, version: x.version || '', c4root: new Uint8Array(x.data).length }))));
              t.onerror = () => res('[]'); };
            r.onerror = () => res('[]'); })""").get("result", {}).get("value")
        return [h for h in hits["sf2"] if "piano" in h], json.loads(stored or "[]")
    finally:
        p.terminate()
        srv.shutdown()
        time.sleep(0.6)


def main():
    old = pathlib.Path(sys.argv[1])
    prof = tempfile.mkdtemp(prefix="dawup")
    r1 = visit(old, prof)
    print("第 1 次（舊程式、走音版）：下載鋼琴", len(r1[0]), "次；存的", r1[1])
    r2 = visit(NEW, prof)
    print("第 2 次（新程式、修正版）：下載鋼琴", len(r2[0]), "次", r2[0], "；存的", r2[1])
    r3 = visit(NEW, prof)
    print("第 3 次：下載鋼琴", len(r3[0]), "次；存的", r3[1])
    ok = len(r2[0]) == 1 and len(r3[0]) == 0 and len(r3[1]) == 1 and r3[1][0]["version"]
    print("\n結果：", "OK" if ok else "有問題")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
