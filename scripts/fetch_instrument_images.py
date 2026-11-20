"""把站上 800 多個樂器的主圖抓下來，打包成 zip。

圖片原本是熱連結 Wikimedia，沒有存進 repo。`upload.wikimedia.org` 在這台機器
會被 429，但同一份縮圖在 `thumb.wikimedia.org` 可以正常抓，所以下載前先換網域。

可續傳：已存在的檔案會跳過，中斷後重跑不會重下。
用法：python scripts/fetch_instrument_images.py [--delay 2.5]
"""
import argparse
import pathlib
import re
import sys
import time
import urllib.request
import zipfile

BASE = pathlib.Path(__file__).resolve().parent.parent
PAGES = BASE / "outputs" / "world-instruments-static" / "instruments"
CACHE = BASE / "work" / "inst-images"
ZIP = BASE / "world-instruments-images.zip"
UA = "WorldInstrumentsBot/1.0 (site owner archiving its own thumbnails)"


def collect():
    out = {}
    for p in sorted(PAGES.glob("*/index.html")):
        h = p.read_text(encoding="utf-8", errors="replace")
        m = re.search(r'<img class="instrument-image" src="([^"]+)"', h)
        if not m:
            continue
        u = m.group(1)
        if not u.startswith("http"):
            continue
        u = u.replace("upload.wikimedia.org", "thumb.wikimedia.org")
        ext = pathlib.Path(u.split("?")[0]).suffix.lower() or ".jpg"
        out[p.parent.name] = (u, ext)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=2.5)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    items = list(collect().items())
    if args.limit:
        items = items[:args.limit]
    print(f"共 {len(items)} 張，延遲 {args.delay}s", flush=True)
    ok = skip = fail = 0
    for i, (slug, (url, ext)) in enumerate(items, 1):
        target = CACHE / f"{slug}{ext}"
        if target.exists() and target.stat().st_size > 1000:
            skip += 1
        else:
            for attempt in range(3):
                try:
                    r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30)
                    target.write_bytes(r.read())
                    ok += 1
                    break
                except Exception as e:
                    if attempt == 2:
                        fail += 1
                        print(f"FAIL {slug} {type(e).__name__} {str(e)[:40]}", flush=True)
                    else:
                        time.sleep(args.delay * (attempt + 2))
            time.sleep(args.delay)
        if i % 50 == 0:
            print(f"  {i}/{len(items)}  ok={ok} skip={skip} fail={fail}", flush=True)
    files = [p for p in sorted(CACHE.iterdir()) if p.is_file() and p.stat().st_size > 1000]
    print(f"下載完成：{len(files)} 張（新抓 {ok}、跳過 {skip}、失敗 {fail}）", flush=True)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in files:
            z.write(p, arcname=f"world-instruments-images/{p.name}")
    print(f"已打包 {ZIP.name}：{ZIP.stat().st_size/1048576:.1f} MB", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
