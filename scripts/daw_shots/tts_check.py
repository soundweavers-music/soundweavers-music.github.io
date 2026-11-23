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
OV = BASE / "work" / "models" / "openvoice"
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

  // 2a. 合成時主執行緒會不會被卡住（卡住 = 使用者以為當機）
  var gaps = [], ticks = 0, last = performance.now();
  var timer = setInterval(function () { var n = performance.now(); gaps.push(n - last); last = n; ticks++; }, 50);
  await D.ttsRun('這一句專門用來量主執行緒會不會被卡住。', 1);
  clearInterval(timer);
  var maxGap = gaps.length ? Math.max.apply(null, gaps) : Infinity;
  var secs2 = (performance.now() - last) / 1000;
  check('介面：合成時主執行緒最長停頓 < 0.5 秒', maxGap < 500,
    gaps.length ? '計時器跑了 ' + ticks + ' 次、最長停頓 ' + maxGap.toFixed(0) + ' ms' : '整段都沒跑到計時器（畫面會像當機）');

  // 2a2. 中英混排（英文走模型內建的英文詞典）
  var mixed = await D.ttsRun('這一段有 APP 和 OK 兩個英文字。', 1);
  var mixedSecs = mixed.data.length / D.TTS_SR;
  var mixedRms = 0; for (var mi = 0; mi < mixed.data.length; mi++) mixedRms += mixed.data[mi] * mixed.data[mi];
  mixedRms = Math.sqrt(mixedRms / mixed.data.length);
  check('英文：中英混排合成得出來（不會跳過英文字）', mixedSecs > 1.0 && mixedSecs < 8 && mixedRms > 0.01,
    mixedSecs.toFixed(2) + ' 秒、RMS ' + mixedRms.toFixed(3));

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

  // 3b. 按下去有反應：進度會動、可以取消
  var doc = frame.contentDocument;
  D.tts.cues = [
    { start: 0, end: 2.0, text: '第一句話' },
    { start: 2.0, end: 4.0, text: '第二句話' },
    { start: 4.0, end: 6.0, text: '第三句話' }
  ];
  var renderBtn = doc.getElementById('ttsRender'), stopBtn = doc.getElementById('ttsStop');
  renderBtn.disabled = false;
  D.ttsAI.cancel = false;
  renderBtn.click();
  await new Promise(function (r) { setTimeout(r, 1500); });
  var midStatus = doc.getElementById('ttsStatus').textContent;
  var busyText = renderBtn.textContent;
  check('反應：按下去馬上顯示進度與已用時間', /已用/.test(midStatus), midStatus);
  check('反應：按鈕變成「產生中」', /產生中/.test(busyText), busyText);
  stopBtn.click();
  await new Promise(function (r) { setTimeout(r, 800); });
  var endStatus = doc.getElementById('ttsStatus').textContent;
  check('反應：按「停止」可以取消，不會卡在那裡', /已取消/.test(endStatus) && !renderBtn.classList.contains('busy'),
    endStatus);

  // 3b2. 每句音量一致：各句自己合成會差到 10 dB（第二句突然變小聲），貼進去前要拉齊
  D.tts.cues = [
    { start: 0, end: 3, text: '大家好，歡迎收看今天的節目。' },
    { start: 3, end: 6, text: '今天要介紹的是傳統樂器。' },
    { start: 6, end: 8, text: '好。' }
  ];
  D.ttsAI.cancel = false; D.ttsAI.out = null; renderBtn.disabled = false; renderBtn.click();
  for (var wk = 0; wk < 600 && (!D.ttsAI.out || renderBtn.classList.contains('busy')); wk++) await new Promise(function (r) { setTimeout(r, 500); });
  var mix = D.ttsAI.out, lv = [];
  [[0, 3], [3, 6], [6, 8]].forEach(function (seg) {
    var e = 0, n = 0;
    for (var q = Math.round(seg[0] * D.TTS_SR); q < Math.min(mix.length, Math.round(seg[1] * D.TTS_SR)); q++) if (Math.abs(mix[q]) > 0.01) { e += mix[q] * mix[q]; n++; }
    lv.push(10 * Math.log10(e / Math.max(1, n)));
  });
  var spread = Math.max.apply(null, lv) - Math.min.apply(null, lv);
  check('音量：每句一樣大（差距 < 3 dB）', spread < 3, lv.map(function (v) { return v.toFixed(1); }).join(' / ') + ' dB');

  // 3c. 換音色（OpenVoice）：先把兩個模型灌進倉庫，再抽音色、轉一段
  var refBytes = await (await fetch('/__OV_REF__')).arrayBuffer();
  var convBytes = await (await fetch('/__OV_CONV__')).arrayBuffer();
  await W.ZhiyinModels.put('openvoice-refenc', refBytes, { size: refBytes.byteLength });
  await W.ZhiyinModels.put('openvoice-conv', convBytes, { size: convBytes.byteLength });
  check('音色：兩個模型都裝進瀏覽器', refBytes.byteLength > 1e6 && convBytes.byteLength > 5e7,
    (refBytes.byteLength / 1048576).toFixed(1) + ' MB + ' + (convBytes.byteLength / 1048576).toFixed(0) + ' MB');

  // 頻譜：440 Hz 正弦在 22.05 kHz 下，能量應該集中在 440*1024/22050 ≈ 20 號 bin
  var sine = new Float32Array(22050);
  for (var s = 0; s < sine.length; s++) sine[s] = Math.sin(2 * Math.PI * 440 * s / 22050) * 0.3;
  var sp = D.ovSpec(sine);
  var bestBin = 0, bestVal = 0;
  for (var bi = 0; bi < 513; bi++) {
    var v = sp.spec[bi * sp.T + 40];
    if (v > bestVal) { bestVal = v; bestBin = bi; }
  }
  check('音色：|STFT| 算得對（440 Hz → 第 20 個 bin）', Math.abs(bestBin - 20) <= 1, 'bin ' + bestBin + '、' + sp.T + ' 格');

  var gTgt = await D.ovExtractSE(sine, 22050);
  check('音色：抽得出 256 維音色向量', gTgt && gTgt.length === 256 && Math.max.apply(null, Array.from(gTgt)) !== 0,
    '前三個 ' + Array.from(gTgt).slice(0, 3).map(function (x) { return x.toFixed(3); }).join(', '));

  var srcAudio = a;                          // 剛剛合成的那一句（44.1 kHz）
  var gSrc = await D.ovExtractSE(srcAudio, D.TTS_SR);
  D.ov.gSrc = gSrc; D.ov.gTgt = gTgt;
  var tConv = performance.now();
  var conv = await D.ovConvert(srcAudio, D.TTS_SR);
  var convSecs = (performance.now() - tConv) / 1000;
  function centroidBin(x, sr) {   // 用頁面自己的 |STFT| 算頻譜重心（單位：bin）
    var s = D.ovSpec(D.ovResample(x, sr, 22050));
    var num = 0, den = 0;
    for (var t = 0; t < s.T; t++) {
      for (var b = 0; b < 513; b++) { var v = s.spec[b * s.T + t]; num += v * b; den += v; }
    }
    return den ? num / den : 0;
  }
  var sameLen = Math.abs(conv.length - srcAudio.length) / srcAudio.length < 0.02;
  var rmsConv = 0; for (var r2 = 0; r2 < conv.length; r2++) rmsConv += conv[r2] * conv[r2];
  rmsConv = Math.sqrt(rmsConv / conv.length);
  var rmsSrc = 0; for (var r3 = 0; r3 < srcAudio.length; r3++) rmsSrc += srcAudio[r3] * srcAudio[r3];
  rmsSrc = Math.sqrt(rmsSrc / srcAudio.length);
  check('音色：轉完長度不變', sameLen, (conv.length / D.TTS_SR).toFixed(2) + ' s vs ' + (srcAudio.length / D.TTS_SR).toFixed(2) + ' s');
  check('音色：轉完不是靜音、音量接近', rmsConv > 0.01 && Math.abs(rmsConv - rmsSrc) / rmsSrc < 0.5,
    'RMS ' + rmsSrc.toFixed(4) + ' → ' + rmsConv.toFixed(4));
  var cSrc = centroidBin(srcAudio, D.TTS_SR), cConv = centroidBin(conv, D.TTS_SR);
  check('音色：音色真的往目標移動（目標是低沉的 440 Hz 正弦 → 重心要下降）',
    cConv < cSrc * 0.9 && convSecs < 120,
    '重心 ' + cSrc.toFixed(1) + ' → ' + cConv.toFixed(1) + ' bin、轉換 ' + convSecs.toFixed(1) + ' s');
  // 第二句：worker（proxy）會把傳進去的 ArrayBuffer 搬走，以前第一句轉完 gSrc／gTgt 就變長度 0，
  // 第二句丟「Tensor's size(256) does not match data length(0)」。單句測不到，所以要連轉兩句。
  var conv2err = '';
  try { await D.ovConvert(srcAudio, D.TTS_SR); } catch (e) { conv2err = (e && e.message) || String(e); }
  check('音色：連續轉第二句不會壞（音色向量沒有被 worker 搬空）',
    !conv2err && D.ov.gSrc.length === 256 && D.ov.gTgt.length === 256,
    conv2err || ('gSrc ' + D.ov.gSrc.length + '、gTgt ' + D.ov.gTgt.length));
  // 長句：舊版 ONNX 把長度凍在 200 格（2.32 秒），之後整段變成固定音量的噪音。3 秒的句子量不出來，要 8 秒的。
  var longR = await D.ttsRun('今天我們要來介紹世界各地的傳統樂器，從印度的西塔琴到非洲的卡林巴琴，每一種都有自己獨特的聲音和故事。', 1);
  var longC = await D.ovConvert(longR.data, D.TTS_SR);
  function envCorr(x, y) {   // 0.25 秒一格的音量起伏，轉換前後要跟著走
    var w = Math.round(D.TTS_SR * 0.25), ex = [], ey = [], p, q;
    for (p = Math.round(D.TTS_SR * 2.5); p + w <= Math.min(x.length, y.length); p += w) {
      var a = 0, b = 0; for (q = p; q < p + w; q++) { a += x[q] * x[q]; b += y[q] * y[q]; }
      ex.push(Math.sqrt(a / w)); ey.push(Math.sqrt(b / w));
    }
    var mx = ex.reduce(function (s, v) { return s + v; }, 0) / ex.length, my = ey.reduce(function (s, v) { return s + v; }, 0) / ey.length;
    var sxy = 0, sxx = 0, syy = 0;
    for (p = 0; p < ex.length; p++) { sxy += (ex[p] - mx) * (ey[p] - my); sxx += (ex[p] - mx) * (ex[p] - mx); syy += (ey[p] - my) * (ey[p] - my); }
    return sxy / Math.sqrt(sxx * syy + 1e-12);
  }
  var lc = envCorr(longR.data, longC);
  check('音色：長句（' + (longR.data.length / D.TTS_SR).toFixed(1) + ' 秒）2.5 秒之後還是人聲，不會變噪音',
    longR.data.length / D.TTS_SR > 6 && lc > 0.6, '2.5 秒後音量起伏相關 ' + lc.toFixed(2) + '（舊版約 0）');
  var convBlob = new Blob([D.wav(conv, D.TTS_SR)], { type: 'audio/wav' });
  await fetch('/__SAVE__?name=cloned.wav', { method: 'POST', body: convBlob });

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
        if self.path in ("/__OV_REF__", "/__OV_CONV__"):
            f = OV / ("openvoice_refenc.onnx" if "REF" in self.path else "openvoice_conv.onnx")
            if not f.exists():
                self.send_error(404, "no model")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(f.stat().st_size))
            self.end_headers()
            with f.open("rb") as fh:
                while True:
                    chunk = fh.read(1 << 20)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
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
