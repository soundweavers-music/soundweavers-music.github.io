"""AI 配音的端到端驗證：真的把 MeloTTS 模型灌進瀏覽器、合成一段語音、量長度與音量。

跟 dub_check.py 不同的地方
--------------------------
那段 251 MB／170 MB 的模型不在 repo 裡，一般測試沒有它。這支測試從本機的
work/models/tts/vits-melo-tts-zh_en/model.onnx 把模型餵給無頭 Chrome，寫進 IndexedDB，
再呼叫頁面的 __dubbing.ttsRun()，所以驗的是「真的跑得動」，不是只有函式對不對。

用法
----
    python scripts/daw_shots/tts_check.py            # 跑驗證
    python scripts/daw_shots/tts_check.py --keep     # 順便把合成的音檔留在 work/models/tts/
"""
from __future__ import annotations

import argparse
import http.server
import pathlib
import re
import socketserver
import subprocess
import sys
import threading

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = BASE / "outputs" / "world-instruments-static"
MODEL = BASE / "work" / "models" / "tts" / "vits-melo-tts-zh_en" / "model.onnx"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8798
WAIT = threading.Event()
SAVED: list[pathlib.Path] = []

PAGE = """<!doctype html><meta charset="utf-8"><title>tts check</title>
<style>body{background:#0b0c10;color:#dfe1e6;font:12px ui-monospace,monospace;padding:16px}pre{white-space:pre-wrap;line-height:1.6}.pass{color:#7df0cd}.fail{color:#ff8a8a}</style>
<pre id="out">running…</pre>
<iframe src="/tools/dubbing/" style="width:2px;height:2px;opacity:0;border:0"></iframe>
<img src="/__SLOW__" width="1" height="1" alt="" style="position:absolute;left:-9px;top:-9px">
<script>
(async function () {
  var out = document.getElementById('out'), rows = [], fails = 0;
  function log(cls, s) { rows.push('<span class="' + cls + '">' + s + '</span>'); out.innerHTML = rows.join('\\n'); }
  function check(name, ok, detail) { if (!ok) fails++; log(ok ? 'pass' : 'fail', (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : '')); }
  var frame = document.querySelector('iframe');
  await new Promise(function (r) { frame.onload = r; setTimeout(r, 20000); });
  var W = frame.contentWindow, D = W && W.__dubbing;
  if (!D) { log('fail', 'FAIL  頁面沒有載入'); fetch('/__READY__'); return; }

  // 1. 把模型灌進模型倉庫（等同使用者手動選檔安裝）
  var t0 = performance.now();
  var buf = await (await fetch('/__MODEL__')).arrayBuffer();
  await W.ZhiyinModels.put('melotts-zh', buf, { size: buf.byteLength });
  check('模型：下載並存進瀏覽器', buf.byteLength > 100 * 1024 * 1024, (buf.byteLength / 1048576).toFixed(0) + ' MB、' + ((performance.now() - t0) / 1000).toFixed(1) + ' s');

  // 2. 合成一句（Python 參考實作 + sherpa-onnx 對照是 3.09 / 3.15 秒）
  t0 = performance.now();
  var r = await D.ttsRun('歡迎來到織音，這是一段中文配音測試。', 1);
  var a = r.data, secs = a.length / D.TTS_SR, rms = 0, peak = 0;
  for (var i = 0; i < a.length; i++) { rms += a[i] * a[i]; peak = Math.max(peak, Math.abs(a[i])); }
  rms = Math.sqrt(rms / a.length);
  check('合成：跑得動', a.length > 0, ((performance.now() - t0) / 1000).toFixed(1) + ' s 推論時間');
  check('合成：長度與 Python 參考一致（3.09 秒 ±20%）', secs > 2.4 && secs < 3.8, secs.toFixed(2) + ' 秒');
  check('合成：不是靜音', rms > 0.01 && peak > 0.05, 'RMS ' + rms.toFixed(4) + '、峰值 ' + peak.toFixed(3));

  // 2b. 暖機後一句要多久（第一次包含模型載入與 wasm 編譯）
  t0 = performance.now();
  var warm = await D.ttsRun('這一段用來量速度，字幕越長就越久。', 1);
  var warmSecs = (performance.now() - t0) / 1000;
  check('速度：暖機後一句（' + (warm.data.length / D.TTS_SR).toFixed(1) + ' 秒音檔）',
    warmSecs < 60, warmSecs.toFixed(1) + ' s');

  // 3. 語速：length_scale 越大越慢（重新合成，不是變速播放）
  var slow = await D.ttsRun('今天天氣很好', 1.4), fast = await D.ttsRun('今天天氣很好', 0.8);
  check('語速：length_scale 1.4 比 0.8 長', slow.data.length > fast.data.length * 1.4,
    (slow.data.length / D.TTS_SR).toFixed(2) + ' s vs ' + (fast.data.length / D.TTS_SR).toFixed(2) + ' s');

  // 4. 把音檔傳回本機，方便人耳比對
  var blob = new Blob([D.wav(a, D.TTS_SR)], { type: 'audio/wav' });
  await fetch('/__SAVE__?name=browser.wav', { method: 'POST', body: blob });
  log('info', '(音檔已存到 work/models/tts/browser.wav，可以直接聽)');

  log('info', fails ? '\\n共 ' + fails + ' 項失敗' : '\\n全部通過');
  document.title = fails ? 'FAIL' : 'PASS';
  fetch('/__READY__').catch(function () {});
})();
</script>
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(OUT), **kw)

    def do_GET(self):  # noqa: N802
        if self.path == "/__SLOW__":
            WAIT.wait(600)
            gif = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Length", str(len(gif)))
            self.end_headers()
            self.wfile.write(gif)
            return
        if self.path == "/__READY__":
            WAIT.set()
            self.send_response(204)
            self.end_headers()
            return
        if self.path == "/__MODEL__":
            if not MODEL.exists():
                self.send_error(404, "no model")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(MODEL.stat().st_size))
            self.end_headers()
            with MODEL.open("rb") as f:
                while True:
                    chunk = f.read(1 << 20)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            return
        return super().do_GET()

    def do_POST(self):  # noqa: N802
        if self.path.startswith("/__SAVE__"):
            name = re.search(r"name=([\w.\-]+)", self.path)
            n = int(self.headers.get("Content-Length") or 0)
            data = self.rfile.read(n)
            dst = MODEL.parent.parent / (name.group(1) if name else "browser.wav")
            dst.write_bytes(data)
            SAVED.append(dst)
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    def log_message(self, *args):
        pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="保留合成出來的音檔")
    args = ap.parse_args()

    if not MODEL.exists():
        print(f"找不到模型：{MODEL}\n先解開 work/models/tts/ 裡的模型包（見 scripts/build_tts_assets.py）")
        return 2
    if not (OUT / "tools" / "dubbing" / "index.html").exists():
        print("找不到建置產物，先跑 python scripts/build_static_site.py")
        return 2

    test_page = OUT / "tools" / "dubbing" / "_ttscheck.html"
    test_page.write_text(PAGE, encoding="utf-8")

    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        proc = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--mute-audio",
             "--dump-dom", f"http://127.0.0.1:{PORT}/tools/dubbing/_ttscheck.html"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900,
        )
    finally:
        srv.shutdown()
        try:
            test_page.unlink()
        except OSError:
            pass

    dom = proc.stdout or ""
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    if not m:
        print("找不到測試輸出，Chrome 的 stderr：")
        print((proc.stderr or "")[-3000:])
        return 2
    body = re.sub(r"<[^>]+>", "", m.group(1)).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").strip()
    print(body)
    fails = len(re.findall(r"^FAIL", body, re.M))
    print()
    print(f"失敗 {fails} 項" if fails else "全部通過")
    if not args.keep:
        for p in SAVED:
            try:
                p.unlink()
            except OSError:
                pass
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
