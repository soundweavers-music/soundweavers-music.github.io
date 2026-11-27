"""織音合成器介面的煙霧測試：開得起來、有音色清單、沒有 JS 錯誤，順便截一張圖。

由 daw-studio/index.html 產生 daw-studio/_zyshot.html（底線開頭，建置時跳過），
多掛一段 harness 開啟音色瀏覽器，再用無頭 Chrome 截圖。

用法
----
    python scripts/daw_shots/synth_ui_check.py
輸出
----
    work/daw-shots/synth-picker.png
"""
import os
import pathlib
import re
import subprocess
import sys
import tempfile

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SRC = BASE / "daw-studio" / "index.html"
EN = os.environ.get("DAW_SHOT_LANG") == "en"
OUT = BASE / "work" / "daw-shots" / ("synth-picker-en.png" if EN else "synth-picker.png")

HARNESS = """import './_zyshot-lang.js';
import './js/main.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__errs.push(String(e.reason && e.reason.message || e.reason)));
(async () => {
  for (let i = 0; i < 100 && !window.__zyOpen; i++) await sleep(50);
  if (!window.__zyOpen) { document.title = 'NO HOOK ' + JSON.stringify(window.__errs); return; }
  // 先選第三條軌（預設專案裡的 MIDI 鋼琴軌），再開音色瀏覽器
  const th = document.querySelectorAll('.thead')[2];
  th?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 8, clientY: 8 }));
  await sleep(500);
  window.__zyOpen();
  await sleep(500);
  const items = document.querySelectorAll('#dlgSynth .zy-item');
  items[3]?.click();                    // 選一個音色並試聽
  await sleep(300);
  document.getElementById('zyUse')?.click();
  await sleep(600);
  const list = items.length;
  const cats = document.querySelectorAll('#dlgSynth .zy-cats button').length;
  const macros = document.querySelectorAll('.zy-macros input').length;
  document.title = `OK ${list} items / ${cats} cats / ${macros} macros / err ${window.__errs.length}`;
})();
"""


def main():
    html = SRC.read_text(encoding="utf-8")
    html = html.replace('<script type="module" src="js/main.js"></script>', "")
    html = html.replace("</body>", '<script type="module" src="_zyshot.js"></script>\n</body>')
    (BASE / "daw-studio" / "_zyshot.html").write_text(html, encoding="utf-8")
    lang = os.environ.get("DAW_SHOT_LANG", "zh")
    # 語言要在 main.js 之前設定，而且 CSP 擋行內腳本，所以放成另一個模組（先 import 先執行）
    (BASE / "daw-studio" / "_zyshot-lang.js").write_text(
        "try { localStorage.setItem('zhiyin-daw-lang', '%s'); } catch (e) {}\n" % lang, encoding="utf-8")
    (BASE / "daw-studio" / "_zyshot.js").write_text(HARNESS, encoding="utf-8")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    profile = tempfile.mkdtemp(prefix="zyshot")
    cmd = [
        CHROME, "--headless=new", "--disable-gpu", "--mute-audio",
        "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files",
        f"--user-data-dir={profile}", "--window-size=1400,940",
        "--virtual-time-budget=12000",
        f"--screenshot={OUT}",
        (BASE / "daw-studio" / "_zyshot.html").as_uri(),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    title = ""
    for line in (r.stderr or "").splitlines():
        m = re.search(r"<title>(.*?)</title>", line)
        if m:
            title = m.group(1)
    print("title:", title or "(沒有抓到)")
    print("errors:", (r.stderr or "").count("Uncaught") + (r.stderr or "").count("error"))
    print("screenshot:", OUT if OUT.exists() else "（沒有產生）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
