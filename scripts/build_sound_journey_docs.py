#!/usr/bin/env python3
"""Sound-journey reader: serve the Word originals as PDF, layout untouched.

The 聲音旅圖 articles used to be hand-maintained Markdown. The source of truth
is now content/sound-journey/doc/*.docx — Word files whose layout must survive
verbatim, so the build converts them to PDF with LibreOffice and shows them in
an embedded reader instead of re-rendering them as HTML.

The conversion happens on CI (libreoffice-writer is installed there). Without
LibreOffice the script still builds the pages and links the original .docx, so
the section never breaks — it just asks the reader to download.

Output:
    outputs/world-instruments-static/sound-journey/index.html      (list)
    outputs/world-instruments-static/sound-journey/read/<slug>/    (reader)
    outputs/world-instruments-static/sound-journey/doc/<slug>.pdf
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

import build_vocal_extra as bve  # noqa: E402

SRC = BASE_DIR / "content" / "sound-journey" / "doc"
OUT = bve.OUTPUT_DIR / "sound-journey"
DOC_OUT = OUT / "doc"


def soffice() -> str | None:
    for name in ("soffice", "libreoffice"):
        path = shutil.which(name)
        if path:
            return path
    for win in (r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"):
        if Path(win).exists():
            return win
    return None


def title_of(docx: Path) -> str:
    """First non-empty text run of the document, used as the card title."""
    import zipfile
    try:
        with zipfile.ZipFile(docx) as z:
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
    except Exception:
        return docx.stem
    for para in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", para))
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > 4:
            return text[:60]
    return docx.stem


def convert(docx: Path, office: str) -> Path | None:
    DOC_OUT.mkdir(parents=True, exist_ok=True)
    target = DOC_OUT / (docx.stem + ".pdf")
    if target.exists() and target.stat().st_mtime >= docx.stat().st_mtime:
        return target
    try:
        subprocess.run([office, "--headless", "--convert-to", "pdf",
                        "--outdir", str(DOC_OUT), str(docx)],
                       check=True, capture_output=True, timeout=180)
    except Exception as exc:
        print(f"  ! {docx.name}: {exc}")
        return None
    produced = DOC_OUT / (docx.stem + ".pdf")
    return produced if produced.exists() else None


def main() -> None:
    if not SRC.exists():
        print("  sound-journey/doc not found, skipped")
        return
    docs = sorted(p for p in SRC.glob("*.docx") if not p.name.startswith("~$"))
    if not docs:
        print("  no .docx in sound-journey/doc, skipped")
        return

    office = soffice()
    OUT.mkdir(parents=True, exist_ok=True)
    # the Markdown-era article pages are gone; drop their build output so
    # nothing links to a retired layout
    for stale in OUT.glob("journey-*"):
        if stale.is_dir():
            shutil.rmtree(stale, ignore_errors=True)
        else:
            stale.unlink(missing_ok=True)
    cards, readers = [], []
    for i, docx in enumerate(docs, 1):
        slug = re.sub(r"[^a-z0-9]+", "-", docx.stem.lower()).strip("-") or f"doc{i}"
        title = title_of(docx)
        pdf = convert(docx, office) if office else None

        if pdf:
            href = bve.resolve_url(OUT / "index.html", f"/sound-journey/read/{slug}/")
            meta = f"第 {i} 篇・PDF 版"
        else:
            href = bve.resolve_url(OUT / "index.html", f"/sound-journey/doc/{docx.name}")
            meta = f"第 {i} 篇・Word 原檔（此環境未安裝 LibreOffice）"
        cards.append(
            f'      <a class="hub-card" href="{href}">'
            f'<span class="hub-icon">🗺</span><h2>{bve.escape(title)}</h2>'
            f'<p>{meta}</p><span class="hub-meta">開始閱讀 →</span></a>'
        )

        if pdf:
            rdir = OUT / "read" / slug
            rdir.mkdir(parents=True, exist_ok=True)
            pdf_url = bve.resolve_url(rdir / "index.html", f"/sound-journey/doc/{pdf.name}")
            body = f"""<main>
  <div class="doc-reader">
    <div class="doc-reader-bar">
      <a href="{bve.resolve_url(rdir / "index.html", "/sound-journey/")}">← 聲音旅圖</a>
      <span>{bve.escape(title)}</span>
      <a href="{pdf_url}" target="_blank" rel="noopener">另開 PDF</a>
    </div>
    <object data="{pdf_url}" type="application/pdf" class="doc-frame">
      <p>你的瀏覽器無法內嵌 PDF，請 <a href="{pdf_url}">點此下載</a>。</p>
    </object>
  </div>
</main>"""
            bve.write(rdir / "index.html", bve.page(
                title, body, rdir / "index.html",
                meta_description=f"聲音旅圖：{title}"))

    body = f"""<main>
  <section class="vocal-hero">
    <p class="eyebrow">Sound Journey</p>
    <h1>聲音旅圖</h1>
    <p class="lead">循著聲音走進不同文化的現場。文章以原始排版呈現——Word 原稿轉成 PDF，版面與圖片位置完全保留。</p>
  </section>
  <div class="hub-page">
    <div class="hub-grid">
{chr(10).join(cards)}
    </div>
  </div>
</main>"""
    bve.write(OUT / "index.html", bve.page(
        "聲音旅圖", body, OUT / "index.html",
        meta_description="聲音旅圖：以原始排版閱讀的世界音樂現場紀錄。"))
    print(f"  聲音旅圖: index + {len(cards)} 篇（PDF 轉檔：{'開' if office else '關'}）")


if __name__ == "__main__":
    main()
