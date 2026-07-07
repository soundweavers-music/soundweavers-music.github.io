"""
世界樂器百科電子書輸出 — 依 A1~A9 分類輸出 5 本 .docx + .pdf

每本書：
  1. 封面頁（世界樂器百科）
  2. 關於作者
  3. 目錄頁（含頁碼）
  4. 該分類所有樂器完整介紹（含 QR Code YouTube 連結）

Output: outputs/world-instruments-static/assets/
  - A1-吹奏與氣息樂器.docx / .pdf
  - A2-弦樂器.docx / .pdf
  - A3-鼓與打擊樂器.docx / .pdf
  - A4-電子與電聲樂器.docx / .pdf
  - A9-待分類.docx / .pdf
"""

import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from html import escape

import qrcode
from io import BytesIO
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
OUTPUT_DIR = BASE_DIR / "outputs" / "world-instruments-static" / "assets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─── 分類架構（與 build_static_site.py 一致） ────────────────
CATEGORY_ARCHITECTURE = {
    "A1": {
        "name": "吹奏與氣息樂器",
        "subtitle": "靠氣流、管身、簧片、唇振、風箱或風管系統發聲",
        "filename": "A1-吹奏與氣息樂器",
    },
    "A2": {
        "name": "弦樂器",
        "subtitle": "靠弦震動發聲；撥弦、擦弦、擊弦到鍵控弦鳴",
        "filename": "A2-弦樂器",
    },
    "A3": {
        "name": "鼓與打擊樂器",
        "subtitle": "膜鳴與體鳴；鼓、鑼鐘、木石竹到舌片手碟",
        "filename": "A3-鼓與打擊樂器",
    },
    "A4": {
        "name": "電子與電聲樂器",
        "subtitle": "電子振盪、合成、取樣、電聲改造到數位控制",
        "filename": "A4-電子與電聲樂器",
    },
    "A9": {
        "name": "待分類／偵錯暫存",
        "subtitle": "名稱待查、發聲原理待查、重複合併、來源不足",
        "filename": "A9-待分類",
    },
}

ABOUT_TEXT = (
    "世界聲音百科由「隔壁織音人」團隊整理，致力於建立一個兼具知識性、"
    "可讀性與探索感的世界樂器百科平台。我們將世界各地的樂器整理為系統化"
    "的知識體系，讓讀者能像翻閱地圖般，循著聲音的軌跡，走進不同文化的現場。\n\n"
    "作者：隔壁織音人 (Next Door Sound Weavers)\n"
    "網站：https://soundweavers-music.github.io/\n"
    "YouTube：https://www.youtube.com/@NextDoorSoundWeavers/\n"
    "電子郵件：nextdoor.soundweavers@gmail.com\n\n"
    "服務項目：編曲製作、詞曲訂製、後期處理、人聲錄製、混音母帶。"
)


def parse_frontmatter(text):
    """解析 YAML frontmatter"""
    m = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not m:
        return {}, text.strip()
    data = {}
    for line in m.group(1).split('\n'):
        if ':' not in line:
            continue
        key, value = line.split(':', 1)
        data[key.strip()] = value.strip()
    return data, text[m.end():].strip()


def slugify(value):
    """產生 URL-safe slug"""
    value = value.replace("（", "_").replace("）", "")
    slug = re.sub(r"[^a-zA-Z0-9一-鿿_]+", "-", value).strip("-_").lower()
    return slug or "unknown"


def make_qr_code(url, size=60):
    """產生 QR Code 並回傳 BytesIO"""
    if not url:
        return None
    qr = qrcode.QRCode(box_size=2, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def read_all_instruments():
    """讀取所有 .md 檔案的 frontmatter 與 body"""
    instruments = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        body = body.strip()

        # 解析 body sections
        sections = {}
        section_heads = {
            "介紹": "introduction",
            "聆聽示範": "listen_demo",
            "代表性作品": "representative",
            "歷史背景": "history",
            "音色描述": "timbre",
            "樂器材質": "material",
            "教學": "tutorial",
        }
        for head, key in section_heads.items():
            pat = re.compile(
                rf"^##\s*{re.escape(head)}\s*\n(.*?)(?=\n## |\Z)",
                re.DOTALL | re.MULTILINE,
            )
            m = pat.search(body)
            if m:
                sections[key] = m.group(1).strip()

        instruments.append({
            "slug": path.stem,
            "class_code": meta.get("class_code", ""),
            "frontend_class": meta.get("frontend_class", ""),
            "subcategory": meta.get("subcategory", ""),
            "title_zh": meta.get("title_zh", path.stem),
            "title_original": meta.get("title_original", ""),
            "family_std": meta.get("family_std", ""),
            "sound_hs": meta.get("sound_hs", ""),
            "playing_method": meta.get("playing_method", ""),
            "interface_tags": meta.get("interface_tags", ""),
            "region_culture": meta.get("region_culture", ""),
            "listening_sound_tags": meta.get("listening_sound_tags", ""),
            "ensemble_links": meta.get("ensemble_links", ""),
            "verification_status": meta.get("verification_status", ""),
            "issue_note": meta.get("issue_note", ""),
            "source_url": meta.get("source_url", ""),
            "image": meta.get("image", ""),
            "youtube_ids": meta.get("youtube_ids", ""),
            # Body sections
            "introduction": sections.get("introduction", ""),
            "history": sections.get("history", ""),
            "timbre": sections.get("timbre", ""),
            "material": sections.get("material", ""),
            "tutorial": sections.get("tutorial", ""),
        })
    return instruments


# ===================================================================
#  DOCX 產生器
# ===================================================================

def add_page_number(doc):
    """在頁尾加入頁碼"""
    for section in doc.sections:
        footer = section.footer
        footer.is_linked_to_previous = False
        p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run()
        fld_char_begin = run._r.makeelement(qn("w:fldChar"), {qn("w:fldCharType"): "begin"})
        run._r.append(fld_char_begin)

        instr = run._r.makeelement(qn("w:instrText"), {})
        instr.text = " PAGE "
        run._r.append(instr)

        fld_char_end = run._r.makeelement(qn("w:fldChar"), {qn("w:fldCharType"): "end"})
        run._r.append(fld_char_end)


def set_cell_shading(cell, color):
    """設定儲存格底色"""
    shading = cell._tc.get_or_add_tcPr().makeelement(
        qn("w:shd"),
        {qn("w:fill"): color, qn("w:val"): "clear"},
    )
    cell._tc.get_or_add_tcPr().append(shading)


def build_docx(instruments, code, arch, toc_entries):
    """為一個分類建立 .docx 檔案"""
    doc = Document()

    # ─── 頁面設定 ───
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)

    style = doc.styles["Normal"]
    style.font.name = "Microsoft JhengHei"
    style.font.size = Pt(10.5)
    style.paragraph_format.line_spacing = 1.5

    # ================================================================
    #  1. 封面頁
    # ================================================================
    for _ in range(6):
        doc.add_paragraph("")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("世界樂器百科")
    run.font.size = Pt(28)
    run.font.bold = True
    run.font.color.rgb = RGBColor(0x0D, 0x76, 0x6B)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"{code} {arch['name']}")
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = RGBColor(0x1A, 0x23, 0x32)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(arch["subtitle"])
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(0x66, 0x70, 0x85)

    for _ in range(4):
        doc.add_paragraph("")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"共 {len(instruments)} 件樂器")
    run.font.size = Pt(14)
    run.font.color.rgb = RGBColor(0x34, 0x40, 0x54)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("隔壁織音人 · 世界聲音百科")
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor(0x66, 0x70, 0x85)

    doc.add_page_break()

    # ================================================================
    #  2. 關於作者
    # ================================================================
    p = doc.add_heading("關於作者", level=1)
    for line in ABOUT_TEXT.split("\n"):
        line = line.strip()
        if not line:
            continue
        p = doc.add_paragraph(line)
        p.style.font.name = "Microsoft JhengHei"
        p.paragraph_format.line_spacing = 1.5

    doc.add_page_break()

    # ================================================================
    #  3. 目錄頁
    # ================================================================
    p = doc.add_heading("目錄", level=1)

    toc = doc.add_paragraph()
    toc.paragraph_format.line_spacing = 1.8

    run = toc.add_run(f"{code} {arch['name']}\n")
    run.font.bold = True
    run.font.size = Pt(12)

    # 按子分類分組
    subcat_order = [
        "無簧吹管", "簧片樂器", "號角與唇振樂器", "風袋與風箱樂器",
        "風管與鍵控氣鳴",
        "撥弦與抱持弦樂", "平放弦與齊特琴類", "擊弦樂器",
        "豎琴里拉與開放弦", "擦弦樂器", "鍵控輪弦與特殊弦鳴",
        "鼓皮與鼓類", "鑼鐘與金屬敲擊", "木琴石琴竹琴",
        "沙鈴刮器與小打擊", "舌片手碟與手邊共鳴",
        "電子振盪", "合成器", "取樣與磁帶", "鼓機與節奏機",
        "電聲改造樂器", "控制器與數位介面", "待確認",
    ]

    grouped = defaultdict(list)
    for inst in instruments:
        grouped[inst["subcategory"] or "其他"].append(inst)

    page_num = 4  # 封面+關於+目錄本身已佔 3 頁，內容從第 4 頁開始
    entry_num = 1

    for sc_name in subcat_order:
        items = grouped.get(sc_name, [])
        if not items:
            continue
        run = toc.add_run(f"\n  {sc_name}\n")
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x34, 0x40, 0x54)
        for inst in items:
            toc_entry = toc_entries.get(inst["slug"], {})
            pn = toc_entry.get("page", page_num)
            title = inst["title_zh"] or inst["slug"]
            run = toc.add_run(f"    {entry_num}. {title}")
            run.font.size = Pt(9)
            run = toc.add_run(f"  … {pn}")
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0x66, 0x70, 0x85)
            toc.add_run("\n")
            entry_num += 1

    toc.add_run("\n")
    doc.add_page_break()

    # ================================================================
    #  4. 樂器內容
    # ================================================================
    entry_counter = 1
    for sc_name in subcat_order:
        items = grouped.get(sc_name, [])
        if not items:
            continue

        # 子分類標題
        p = doc.add_heading(sc_name, level=2)
        for inst in items:
            _add_instrument_to_docx(doc, inst, entry_counter)
            entry_counter += 1

    # 頁碼
    add_page_number(doc)

    return doc


def _add_instrument_to_docx(doc, inst, num):
    """將一件樂器的所有資訊加入 docx"""
    # 樂器名稱
    p = doc.add_heading(f"{num}. {inst['title_zh']}", level=3)

    # 原文名
    if inst["title_original"]:
        p = doc.add_paragraph()
        run = p.add_run(f"{inst['title_original']}")
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x66, 0x70, 0x85)
        run.font.italic = True

    # 欄位表格
    fields = [
        ("主分類代碼", inst["class_code"]),
        ("前台主分類", inst["frontend_class"]),
        ("子分類", inst["subcategory"]),
        ("樂器家族", inst["family_std"]),
        ("發聲原理／H-S", inst["sound_hs"]),
        ("演奏方式", inst["playing_method"]),
        ("操作介面", inst["interface_tags"]),
        ("地域／文化", inst["region_culture"]),
        ("聆聽與聲音標籤", inst["listening_sound_tags"]),
        ("常見合奏／編制", inst["ensemble_links"]),
        ("查證狀態", inst["verification_status"]),
        ("核實／修正備註", inst["issue_note"]),
        ("來源網址", inst["source_url"]),
    ]
    # 過濾掉空白欄位
    fields = [(k, v) for k, v in fields if v and v.strip()]

    if fields:
        table = doc.add_table(rows=len(fields), cols=2)
        table.style = "Light Grid Accent 1"
        for i, (key, val) in enumerate(fields):
            c0 = table.cell(i, 0)
            c0.text = key
            for paragraph in c0.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(9)
                    run.font.bold = True

            c1 = table.cell(i, 1)
            c1.text = val if len(val) < 200 else val[:200] + "…"
            for paragraph in c1.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(9)
        doc.add_paragraph("")  # spacing

    # 介紹內容
    body_sections = [
        ("介紹", inst["introduction"]),
        ("歷史背景", inst["history"]),
        ("音色描述", inst["timbre"]),
        ("樂器材質", inst["material"]),
        ("教學", inst["tutorial"]),
    ]
    for title, content in body_sections:
        if content:
            p = doc.add_paragraph()
            run = p.add_run(f"【{title}】")
            run.font.bold = True
            run.font.size = Pt(10)
            # Clean markdown formatting
            clean = re.sub(r"[#*_~`>\[\]()|]", "", content)
            # Multiple lines
            for line in clean.split("\n"):
                line = line.strip()
                if line:
                    p = doc.add_paragraph(line)
                    p.paragraph_format.line_spacing = 1.4
                    for run in p.runs:
                        run.font.size = Pt(10)

    # YouTube QR Code
    youtube_ids = inst.get("youtube_ids", "")
    if youtube_ids:
        ids = [v.strip() for v in re.split(r"[\s,]+", youtube_ids) if v.strip()]
        for vid in ids[:2]:  # 最多 2 個 QR Code
            yt_url = f"https://www.youtube.com/watch?v={vid}"
            qr_buf = make_qr_code(yt_url)
            if qr_buf:
                p = doc.add_paragraph()
                run = p.add_run(f"YouTube {vid}")
                run.font.size = Pt(8)
                run.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)
                doc.add_picture(qr_buf, width=Inches(0.6))
                doc.add_paragraph("")  # spacing

    # 分隔線
    doc.add_paragraph("─" * 40)


# ===================================================================
#  PDF 產生器（使用 fpdf2）
# ===================================================================

def build_pdf(instruments, code, arch, toc_entries, font_path):
    """為一個分類建立 PDF 檔案"""
    from fpdf import FPDF

    class PDF(FPDF):
        def header(self):
            if self.page_no() > 3:  # 封面和關於不顯示頁首
                self.set_font("Zh", "", 8)
                self.set_text_color(0x66, 0x70, 0x85)
                self.cell(0, 8, f"世界樂器百科 - {code} {arch['name']}", align="L")
                self.ln(4)

        def footer(self):
            if self.page_no() > 3:
                self.set_y(-15)
                self.set_font("Zh", "", 8)
                self.set_text_color(0x66, 0x70, 0x85)
                self.cell(0, 10, str(self.page_no()), align="C")

    pdf = PDF()
    pdf.add_font("Zh", "", font_path)
    pdf.set_auto_page_break(auto=True, margin=20)

    # ─── 封面 ───
    pdf.add_page()
    pdf.ln(60)
    pdf.set_font("Zh", "", 28)
    pdf.set_text_color(0x0D, 0x76, 0x6B)
    pdf.cell(0, 15, "世界樂器百科", align="C", ln=True)
    pdf.set_font("Zh", "", 20)
    pdf.set_text_color(0x1A, 0x23, 0x32)
    pdf.cell(0, 12, f"{code} {arch['name']}", align="C", ln=True)
    pdf.set_font("Zh", "", 11)
    pdf.set_text_color(0x66, 0x70, 0x85)
    pdf.cell(0, 10, arch["subtitle"], align="C", ln=True)
    pdf.ln(20)
    pdf.set_font("Zh", "", 13)
    pdf.set_text_color(0x34, 0x40, 0x54)
    pdf.cell(0, 10, f"共 {len(instruments)} 件樂器", align="C", ln=True)
    pdf.set_font("Zh", "", 10)
    pdf.set_text_color(0x66, 0x70, 0x85)
    pdf.cell(0, 10, "隔壁織音人 · 世界聲音百科", align="C", ln=True)

    # ─── 關於作者 ───
    pdf.add_page()
    pdf.set_font("Zh", "", 16)
    pdf.set_text_color(0x1A, 0x23, 0x32)
    pdf.cell(0, 12, "關於作者", ln=True)
    pdf.ln(4)
    pdf.set_font("Zh", "", 10)
    pdf.set_text_color(0x34, 0x40, 0x54)
    pdf.multi_cell(0, 6, ABOUT_TEXT)

    # ─── 目錄 ───
    pdf.add_page()
    pdf.set_font("Zh", "", 16)
    pdf.cell(0, 12, "目錄", ln=True)
    pdf.ln(4)

    grouped = defaultdict(list)
    for inst in instruments:
        grouped[inst["subcategory"] or "其他"].append(inst)

    subcat_order = [
        "無簧吹管", "簧片樂器", "號角與唇振樂器", "風袋與風箱樂器",
        "風管與鍵控氣鳴",
        "撥弦與抱持弦樂", "平放弦與齊特琴類", "擊弦樂器",
        "豎琴里拉與開放弦", "擦弦樂器", "鍵控輪弦與特殊弦鳴",
        "鼓皮與鼓類", "鑼鐘與金屬敲擊", "木琴石琴竹琴",
        "沙鈴刮器與小打擊", "舌片手碟與手邊共鳴",
        "電子振盪", "合成器", "取樣與磁帶", "鼓機與節奏機",
        "電聲改造樂器", "控制器與數位介面", "待確認",
    ]

    pdf.set_font("Zh", "", 11)
    pdf.set_text_color(0x1A, 0x23, 0x32)
    pdf.cell(0, 8, f"{code} {arch['name']}", ln=True)
    entry_num = 1
    for sc_name in subcat_order:
        items = grouped.get(sc_name, [])
        if not items:
            continue
        pdf.set_font("Zh", "", 9)
        pdf.set_text_color(0x34, 0x40, 0x54)
        pdf.cell(0, 6, f"  {sc_name}", ln=True)
        pdf.set_font("Zh", "", 8)
        pdf.set_text_color(0x1A, 0x23, 0x32)
        for inst in items:
            toc_entry = toc_entries.get(inst["slug"], {})
            pn = toc_entry.get("page", "")
            title = inst["title_zh"] or inst["slug"]
            pdf.set_text_color(0x1A, 0x23, 0x32)
            pdf.cell(0, 5, f"    {entry_num}. {title}", ln=True)
            entry_num += 1

    # ─── 樂器內容 ───
    entry_counter = 1
    for sc_name in subcat_order:
        items = grouped.get(sc_name, [])
        if not items:
            continue

        pdf.add_page()
        pdf.set_font("Zh", "", 14)
        pdf.set_text_color(0x0D, 0x76, 0x6B)
        pdf.cell(0, 10, sc_name, ln=True)
        pdf.ln(4)

        for inst in items:
            pdf.set_font("Zh", "", 12)
            pdf.set_text_color(0x1A, 0x23, 0x32)
            pdf.cell(0, 8, f"{entry_counter}. {inst['title_zh']}", ln=True)
            entry_counter += 1

            if inst["title_original"]:
                pdf.set_font("Zh", "", 9)
                pdf.set_text_color(0x66, 0x70, 0x85)
                pdf.cell(0, 5, inst["title_original"], ln=True)

            # 欄位
            fields = [
                ("主分類", inst["class_code"]),
                ("分類", inst["frontend_class"]),
                ("子分類", inst["subcategory"]),
                ("家族", inst["family_std"]),
                ("發聲", inst["sound_hs"]),
                ("演奏", inst["playing_method"]),
                ("介面", inst["interface_tags"]),
                ("地域", inst["region_culture"]),
                ("聆聽", inst["listening_sound_tags"]),
                ("合奏", inst["ensemble_links"]),
                ("查證", inst["verification_status"]),
                ("備註", inst["issue_note"]),
                ("來源", inst["source_url"]),
            ]
            fields = [(k, v) for k, v in fields if v and v.strip()]
            if fields:
                pdf.set_font("Zh", "", 8)
                for k, v in fields:
                    pdf.set_text_color(0x34, 0x40, 0x54)
                    pdf.cell(22, 5, k)
                    pdf.set_text_color(0x1A, 0x23, 0x32)
                    v_display = v if len(v) < 80 else v[:80] + "…"
                    pdf.cell(0, 5, v_display, ln=True)

            # 內容
            body_sections = [
                ("介紹", inst["introduction"]),
                ("歷史", inst["history"]),
                ("音色", inst["timbre"]),
                ("材質", inst["material"]),
                ("教學", inst["tutorial"]),
            ]
            for title, content in body_sections:
                if content:
                    pdf.ln(2)
                    pdf.set_font("Zh", "", 9)
                    pdf.set_text_color(0x0D, 0x76, 0x6B)
                    pdf.cell(0, 5, f"【{title}】", ln=True)
                    pdf.set_font("Zh", "", 8)
                    pdf.set_text_color(0x34, 0x40, 0x54)
                    clean = re.sub(r"[#*_~`>\[\]()|]", "", content)
                    pdf.multi_cell(0, 4.5, clean[:500])  # 限制長度

            # QR Code
            youtube_ids = inst.get("youtube_ids", "")
            if youtube_ids:
                ids = [v.strip() for v in re.split(r"[\s,]+", youtube_ids) if v.strip()]
                for vid in ids[:2]:
                    yt_url = f"https://www.youtube.com/watch?v={vid}"
                    qr_buf = make_qr_code(yt_url)
                    if qr_buf:
                        pdf.ln(2)
                        pdf.set_font("Zh", "", 7)
                        pdf.set_text_color(0x1D, 0x4E, 0xD8)
                        pdf.cell(0, 4, f"YouTube: {vid}", ln=True)
                        # fpdf2 image from BytesIO
                        pdf.image(qr_buf, w=15)
                        pdf.ln(2)

            # 分隔
            pdf.ln(3)
            pdf.set_draw_color(0xE4, 0xE7, 0xEC)
            pdf.line(20, pdf.get_y(), 190, pdf.get_y())
            pdf.ln(3)

    return pdf


# ===================================================================
#  主流程
# ===================================================================
def main():
    print("讀取樂器資料...")
    all_instruments = read_all_instruments()
    print(f"  共 {len(all_instruments)} 件樂器")

    # 依 class_code 分組
    code_groups = defaultdict(list)
    for inst in all_instruments:
        code = inst["class_code"] or "A9"
        code_groups[code].append(inst)

    # 找尋中文字型（支援 Windows 與 Linux / GitHub Actions）
    font_candidates = [
        # Windows
        "C:/Windows/Fonts/msjh.ttc",
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/msjhl.ttc",
        "C:/Windows/Fonts/simsun.ttc",
        "C:/Windows/Fonts/simfang.ttf",
        # Linux (GitHub Actions)
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    ]
    font_path = None
    for fp in font_candidates:
        if os.path.exists(fp):
            font_path = fp
            break

    if not font_path:
        # 嘗試自動尋找（Linux）
        for search_root in ["/usr/share/fonts"]:
            for dirpath, _, filenames in os.walk(search_root):
                for fn in filenames:
                    if any(kw in fn.lower() for kw in ["noto", "cjk", "wqy", "chinese", "hans", "sc"]):
                        fp = os.path.join(dirpath, fn)
                        if fp.lower().endswith((".ttc", ".ttf", ".otf")):
                            font_path = fp
                            break
                if font_path:
                    break
            if font_path:
                break

    if not font_path:
        # 嘗試下載 Noto Sans CJK（GitHub Actions 沒安裝字型時的備援）
        print("  中文字型不存在，嘗試下載 Noto Sans SC...")
        import urllib.request
        import zipfile
        font_dir = Path(os.environ.get("FONT_CACHE_DIR", str(BASE_DIR / "work" / "fonts")))
        font_dir.mkdir(parents=True, exist_ok=True)
        font_download = font_dir / "NotoSansSC-Regular.otf"
        if not font_download.exists():
            try:
                url = "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansSC-Regular.otf"
                urllib.request.urlretrieve(url, str(font_download))
                font_path = str(font_download)
                print(f"  已下載字型: {font_download}")
            except Exception as e:
                print(f"  下載字型失敗: {e}")
        else:
            font_path = str(font_download)

    if font_path:
        print(f"  使用字型: {font_path}")
    else:
        print("  ⚠️ 找不到中文字型，PDF 中文可能無法顯示")

    # 處理每個分類
    for code, arch in CATEGORY_ARCHITECTURE.items():
        instruments = code_groups.get(code, [])
        if not instruments:
            print(f"\n{code} {arch['name']}: 無樂器資料，跳過")
            continue

        # 按子分類/名稱排序
        instruments.sort(key=lambda x: (x["subcategory"] or "", x["title_zh"] or ""))

        # 先建立簡易的 toc_entries（計算頁數用）
        # 實際上頁碼要在 docx 產生後才能知道，這裡用頁碼佔位
        toc_entries = {inst["slug"]: {"page": i + 1} for i, inst in enumerate(instruments)}

        print(f"\n{code} {arch['name']}: {len(instruments)} 件樂器")

        # ─── DOCX ───
        docx_path = OUTPUT_DIR / f"{arch['filename']}.docx"
        try:
            doc = build_docx(instruments, code, arch, toc_entries)
            doc.save(str(docx_path))
            size = os.path.getsize(docx_path) / 1024
            print(f"  [OK] DOCX: {docx_path.name} ({size:.0f} KB)")
        except Exception as e:
            print(f"  [FAIL] DOCX: {e}")

        # ─── PDF ───
        if font_path:
            pdf_path = OUTPUT_DIR / f"{arch['filename']}.pdf"
            try:
                pdf = build_pdf(instruments, code, arch, toc_entries, font_path)
                pdf.output(str(pdf_path))
                size = os.path.getsize(pdf_path) / 1024
                print(f"  [OK] PDF:  {pdf_path.name} ({size:.0f} KB)")
            except Exception as e:
                print(f"  [FAIL] PDF: {e}")
        else:
            print(f"  ⏭️ PDF 跳過（無中文字型）")

    print(f"\n[OK] 全部完成!")
    print(f"   輸出資料夾: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
