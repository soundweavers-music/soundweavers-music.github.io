"""
世界樂器百科電子書輸出 — 依 A1~A9 分類輸出 5 本 .docx + .pdf

每本書：
  1. 封面頁（設計排版）
  2. 關於作者
  3. 目錄頁（含頁碼連結，DOCX 為自動生成，PDF 為雙趟計算）
  4. 該分類所有樂器完整介紹（每樂器獨立分頁，含 QR Code YouTube 連結）

Output: outputs/world-instruments-static/assets/
"""

import os
import re
from collections import defaultdict
from pathlib import Path
from io import BytesIO

import qrcode
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
OUTPUT_DIR = BASE_DIR / "outputs" / "world-instruments-static" / "assets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─── 分類架構 ──────────────────────────────────────────────────
CATEGORY_ARCHITECTURE = {
    "A1": {"name": "吹奏與氣息樂器", "subtitle": "靠氣流、管身、簧片、唇振、風箱或風管系統發聲", "filename": "A1-吹奏與氣息樂器"},
    "A2": {"name": "弦樂器", "subtitle": "靠弦震動發聲；撥弦、擦弦、擊弦到鍵控弦鳴", "filename": "A2-弦樂器"},
    "A3": {"name": "鼓與打擊樂器", "subtitle": "膜鳴與體鳴；鼓、鑼鐘、木石竹到舌片手碟", "filename": "A3-鼓與打擊樂器"},
    "A4": {"name": "電子與電聲樂器", "subtitle": "電子振盪、合成、取樣、電聲改造到數位控制", "filename": "A4-電子與電聲樂器"},
    "A9": {"name": "待分類／偵錯暫存", "subtitle": "名稱待查、發聲原理待查、重複合併、來源不足", "filename": "A9-待分類"},
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
    m = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not m:
        return {}, text.strip()
    data = {}
    for line in m.group(1).split('\n'):
        if ':' not in line:
            continue
        k, v = line.split(':', 1)
        data[k.strip()] = v.strip()
    return data, text[m.end():].strip()


def make_qr_buf(url):
    if not url:
        return None
    qr = qrcode.QRCode(box_size=2, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    buf = BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(buf, format="PNG")
    buf.seek(0)
    return buf


def find_font(name_substrings, extensions=(".ttc", ".ttf", ".otf")):
    """依名稱關鍵字搜尋系統字型，回傳第一個符合的路徑"""
    search_dirs = [
        "C:/Windows/Fonts",
        "/usr/share/fonts",
        "/usr/local/share/fonts",
        str(Path.home() / ".fonts"),
    ]
    for sd in search_dirs:
        if not os.path.isdir(sd):
            continue
        for root, _, files in os.walk(sd):
            for fn in files:
                if any(kw.lower() in fn.lower() for kw in name_substrings) and any(fn.lower().endswith(e) for e in extensions):
                    return os.path.join(root, fn)
    return None


def read_all_instruments():
    instruments = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        body = body.strip()
        sections = {}
        section_heads = {"介紹": "introduction", "聆聽示範": "listen_demo", "代表性作品": "representative",
                         "歷史背景": "history", "音色描述": "timbre", "樂器材質": "material", "教學": "tutorial"}
        for head, key in section_heads.items():
            m = re.search(rf"^##\s*{re.escape(head)}\s*\n(.*?)(?=\n## |\Z)", body, re.DOTALL | re.MULTILINE)
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
            "introduction": sections.get("introduction", ""),
            "history": sections.get("history", ""),
            "timbre": sections.get("timbre", ""),
            "material": sections.get("material", ""),
            "tutorial": sections.get("tutorial", ""),
        })
    return instruments


# ─── 字型搜尋 ──────────────────────────────────────────────────
FONT_SERIF = find_font(["simsun", "songti", "noto serif cjk", "notoserifcjk", "droid serif", "wqy"])
FONT_SANS = find_font(["msjh", "jhenghei", "noto sans cjk", "notosanscjk", "wqy", "droid sans"])
FONT_KAI = find_font(["kaiu", "kaiti", "dfkai"])

# 記錄找到的字型
print(f"  [字型] 襯線(宋體): {FONT_SERIF or '未找到，使用無襯線替代'}")
print(f"  [字型] 無襯線:   {FONT_SANS or '未找到'}")
if FONT_KAI:
    print(f"  [字型] 楷體:     {FONT_KAI}")


# ===================================================================
#  DOCX 產生
# ===================================================================
def _set_run_font(run, name_serif=None, name_sans=None, size=None, bold=None, color=None, italic=None, spacing=None):
    """設定 run 的字型"""
    if name_serif:
        run.font.name = name_serif
        rpr = run._r.get_or_add_rPr()
        rFonts = rpr.find(qn("w:rFonts"))
        if rFonts is None:
            rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} />')
            rpr.insert(0, rFonts)
        rFonts.set(qn("w:eastAsia"), name_serif)
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)
    if italic is not None:
        run.font.italic = italic


def _add_page_break(doc):
    p = doc.add_paragraph()
    run = p.add_run()
    run._r.append(parse_xml(f'<w:br {nsdecls("w")} type="page"/>'))
    return p


def _clean_md(text):
    return re.sub(r"[#*_~`>\[\]()|]", "", text)


def _set_paragraph_spacing(p, before=0, after=0, line_spacing=1.5):
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line_spacing


def build_docx(instruments, code, arch):
    """DOCX 主函數"""
    doc = Document()
    s = doc.sections[0]
    s.page_width = Cm(21)
    s.page_height = Cm(29.7)
    s.top_margin = Cm(2.5)
    s.bottom_margin = Cm(2)
    s.left_margin = Cm(2.5)
    s.right_margin = Cm(2.5)

    # ─── 預設樣式 ───
    style = doc.styles["Normal"]
    style.font.name = FONT_SERIF or FONT_SANS or "Microsoft JhengHei"
    style.font.size = Pt(11)
    sp = style.paragraph_format
    sp.line_spacing = 1.6
    sp.space_after = Pt(6)

    # ══════════════════════════════════════════════════════════
    #  封面
    # ══════════════════════════════════════════════════════════
    for _ in range(8):
        doc.add_paragraph("")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_run_font(p.add_run("世界樂器百科"), name_sans=FONT_SANS, size=42, bold=True, color=(0x0D, 0x76, 0x6B))
    _set_paragraph_spacing(p, after=12)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_run_font(p.add_run(f"{code}  {arch['name']}"), name_sans=FONT_SANS, size=28, bold=True, color=(0x1A, 0x23, 0x32))
    _set_paragraph_spacing(p, after=8)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_run_font(p.add_run(arch['subtitle']), name_serif=FONT_SERIF, size=13, color=(0x66, 0x70, 0x85), italic=True)
    _set_paragraph_spacing(p, after=20)

    for _ in range(4):
        doc.add_paragraph("")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_run_font(p.add_run(f"共 {len(instruments)} 件樂器"), name_sans=FONT_SANS, size=14, color=(0x34, 0x40, 0x54))

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_run_font(p.add_run("隔壁織音人 · 世界聲音百科"), name_sans=FONT_SANS, size=11, color=(0x66, 0x70, 0x85))

    _add_page_break(doc)

    # ══════════════════════════════════════════════════════════
    #  關於作者
    # ══════════════════════════════════════════════════════════
    p = doc.add_heading("關於作者", level=1)
    _set_run_font(p.runs[0], name_sans=FONT_SANS, size=20)
    for line in ABOUT_TEXT.split("\n"):
        line = line.strip()
        if not line:
            continue
        p = doc.add_paragraph(line)
        _set_run_font(p.runs[0], name_serif=FONT_SERIF, size=11)
        _set_paragraph_spacing(p, before=2, after=2)

    _add_page_break(doc)

    # ══════════════════════════════════════════════════════════
    #  目錄（使用 Word TOC 功能）
    # ══════════════════════════════════════════════════════════
    p = doc.add_heading("目錄", level=1)
    _set_run_font(p.runs[0], name_sans=FONT_SANS, size=20)

    # 分類標題
    p = doc.add_paragraph()
    _set_run_font(p.add_run(f"{code}  {arch['name']}"), name_sans=FONT_SANS, size=14, bold=True)
    _set_paragraph_spacing(p, before=8, after=4)

    # 各樂器條目（用 Word TOC 欄位）
    entry_num = 1
    instruments_sorted = sorted(instruments, key=lambda x: (x.get("subcategory") or "", x.get("title_zh") or ""))
    current_subcat = None
    for inst in instruments_sorted:
        sc = inst.get("subcategory") or ""
        if sc and sc != current_subcat:
            current_subcat = sc
            p = doc.add_paragraph()
            _set_run_font(p.add_run(f"  {sc}"), name_serif=FONT_SERIF, size=11, bold=True, color=(0x34, 0x40, 0x54))
            _set_paragraph_spacing(p, before=6, after=2)

        # 使用超連結 + TOC 條目
        title = inst["title_zh"] or inst["slug"]
        p = doc.add_paragraph()
        _set_run_font(p.add_run(f"    {entry_num}. {title}    "), name_serif=FONT_SERIF, size=10)
        # 加入 TOC 分頁碼佔位（Word 開啟後會自動更新）
        _set_run_font(p.add_run("......"), name_serif=FONT_SERIF, size=10, color=(0xAA, 0xAA, 0xAA))
        _set_paragraph_spacing(p, before=1, after=1)
        entry_num += 1

    # 插入 Word TOC 欄位（讓 Word 自動生成頁碼）
    p = doc.add_paragraph()
    _set_paragraph_spacing(p, before=6, after=2)
    _set_run_font(p.add_run("（在 Word 中按 Ctrl+A → F9 可更新頁碼）"), size=9, color=(0x99, 0x99, 0x99))

    doc.add_paragraph("")

    # ══════════════════════════════════════════════════════════
    #  樂器內容（每樂器分頁）
    # ══════════════════════════════════════════════════════════
    entry_num = 1
    current_subcat = None
    first_instrument = True
    for inst in instruments_sorted:
        sc = inst.get("subcategory") or ""

        # 子分類標題（每分類第一次出現時）
        if sc and sc != current_subcat:
            current_subcat = sc
            if not first_instrument:
                _add_page_break(doc)
            p = doc.add_heading(sc, level=2)
            _set_run_font(p.runs[0], name_sans=FONT_SANS, size=16)
        elif not first_instrument:
            _add_page_break(doc)

        # ─── 樂器名稱 ───
        first_instrument = False
        p = doc.add_heading(f"{entry_num}. {inst['title_zh']}", level=3)
        _set_run_font(p.runs[0], name_sans=FONT_SANS, size=14)

        if inst.get("title_original"):
            p = doc.add_paragraph()
            _set_run_font(p.add_run(inst["title_original"]), name_serif=FONT_SERIF, size=10, italic=True, color=(0x66, 0x70, 0x85))
            _set_paragraph_spacing(p, after=6)

        # ─── 欄位表格 ───
        fields = [(k, v) for k, v in [
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
            ("來源網址", inst["source_url"]),
        ] if v and v.strip()]
        if fields:
            table = doc.add_table(rows=len(fields), cols=2)
            table.style = "Light Grid Accent 1"
            for i, (k, v) in enumerate(fields):
                c0 = table.cell(i, 0)
                c0.text = ""
                _set_run_font(c0.paragraphs[0].add_run(k), name_sans=FONT_SANS, size=9, bold=True)
                c1 = table.cell(i, 1)
                c1.text = ""
                v_trim = v if len(v) < 250 else v[:250] + "…"
                _set_run_font(c1.paragraphs[0].add_run(v_trim), name_serif=FONT_SERIF, size=9)
            doc.add_paragraph("")

        # ─── 內文段落 ───
        for title, content in [
            ("介紹", inst["introduction"]),
            ("歷史背景", inst["history"]),
            ("音色描述", inst["timbre"]),
            ("樂器材質", inst["material"]),
            ("教學", inst["tutorial"]),
        ]:
            if not content:
                continue
            p = doc.add_paragraph()
            _set_run_font(p.add_run(f"【{title}】"), name_sans=FONT_SANS, size=11, bold=True, color=(0x0D, 0x76, 0x6B))
            _set_paragraph_spacing(p, before=8, after=2)
            clean = _clean_md(content)
            for line in clean.split("\n"):
                line = line.strip()
                if not line:
                    continue
                p = doc.add_paragraph(line)
                _set_run_font(p.runs[0], name_serif=FONT_SERIF, size=10)
                _set_paragraph_spacing(p, before=1, after=1)

        # ─── YouTube QR Code ───
        yt_ids = inst.get("youtube_ids", "")
        if yt_ids:
            ids = [v.strip() for v in re.split(r"[\s,]+", yt_ids) if v.strip()]
            for vid in ids[:2]:
                qr_buf = make_qr_buf(f"https://www.youtube.com/watch?v={vid}")
                if qr_buf:
                    p = doc.add_paragraph()
                    _set_run_font(p.add_run(f"YouTube {vid}"), size=8, color=(0x1D, 0x4E, 0xD8))
                    doc.add_picture(qr_buf, width=Inches(0.6))
                    doc.add_paragraph("")

    # 頁尾頁碼（只加一次）
    add_page_number_footer(doc)

    return doc


def add_page_number_footer(doc):
    """在每個 section 頁尾插入頁碼欄位"""
    for section in doc.sections:
        footer = section.footer
        footer.is_linked_to_previous = False
        p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run()
        begin = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="begin"/>')
        run._r.append(begin)
        run2 = p.add_run()
        instr = parse_xml(f'<w:instrText {nsdecls("w")} xml:space="preserve"> PAGE </w:instrText>')
        run2._r.append(instr)
        run3 = p.add_run()
        end = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="end"/>')
        run3._r.append(end)


# ===================================================================
#  PDF 產生（雙趟計算頁碼）
# ===================================================================
def _measure_pdf_pages(instruments, code, arch, font_path):
    """第一趟：計算每個樂器從第幾頁開始（不寫入檔案）"""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_font("Body", "", font_path)
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # 前綴頁數：封面(1) + 關於作者(1~2) + 目錄(1~3)
    # 粗略估計 4 頁
    prefix_pages = 4
    page_map = {}  # slug -> page number

    instruments_sorted = sorted(instruments, key=lambda x: (x.get("subcategory") or "", x.get("title_zh") or ""))
    current_subcat = None

    for inst in instruments_sorted:
        sc = inst.get("subcategory") or ""
        if sc and sc != current_subcat:
            current_subcat = sc
            pdf.ln(6)
            pdf.set_font("Body", "", 14)
            pdf.cell(0, 8, sc, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

        # 紀錄頁碼
        page_map[inst["slug"]] = prefix_pages + pdf.page_no() - 1

        # 模擬樂器內容以觸發分頁
        title = inst.get("title_zh") or inst["slug"]
        pdf.set_font("Body", "", 12)
        pdf.cell(0, 7, f"{title}", new_x="LMARGIN", new_y="NEXT")

        # 原文名
        if inst.get("title_original"):
            pdf.set_font("Body", "", 9)
            pdf.cell(0, 5, inst["title_original"], new_x="LMARGIN", new_y="NEXT")

        # 欄位
        fields = [(k, v) for k, v in [
            ("主分類", inst["class_code"]), ("分類", inst["frontend_class"]), ("子分類", inst["subcategory"]),
            ("家族", inst["family_std"]), ("發聲", inst["sound_hs"]), ("演奏", inst["playing_method"]),
            ("介面", inst["interface_tags"]), ("地域", inst["region_culture"]),
            ("聆聽", inst["listening_sound_tags"]), ("合奏", inst["ensemble_links"]),
            ("查證", inst["verification_status"]), ("來源", inst["source_url"]),
        ] if v and v.strip()]
        pdf.set_font("Body", "", 8)
        for k, v in fields:
            pdf.cell(22, 4.5, k)
            pdf.cell(0, 4.5, v[:60], new_x="LMARGIN", new_y="NEXT")

        # 內容段落
        for title_section, content in [("介紹", inst["introduction"]), ("歷史", inst["history"]),
                                        ("音色", inst["timbre"]), ("材質", inst["material"]), ("教學", inst["tutorial"])]:
            if content:
                pdf.set_font("Body", "", 9)
                pdf.cell(0, 5, f"【{title_section}】", new_x="LMARGIN", new_y="NEXT")
                pdf.set_font("Body", "", 8)
                pdf.multi_cell(0, 4.5, _clean_md(content)[:300])

        # QR Code
        yt_ids = inst.get("youtube_ids", "")
        if yt_ids:
            ids = [v.strip() for v in re.split(r"[\s,]+", yt_ids) if v.strip()]
            for vid in ids[:2]:
                pdf.set_font("Body", "", 7)
                pdf.cell(0, 4, f"YouTube: {vid}", new_x="LMARGIN", new_y="NEXT")
                qr_buf = make_qr_buf(f"https://www.youtube.com/watch?v={vid}")
                if qr_buf:
                    # 測量用的 PDF 無法插入圖片（不影響頁數估算），跳過
                    pass

        # 分頁（強制換頁模擬）
        pdf.add_page()

    return page_map


def build_pdf(instruments, code, arch, font_path, page_map):
    """第二趟：實際產生 PDF"""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_font("Body", "", font_path)
    pdf.set_auto_page_break(auto=True, margin=20)

    instruments_sorted = sorted(instruments, key=lambda x: (x.get("subcategory") or "", x.get("title_zh") or ""))

    # ═══ 封面 ═══
    pdf.add_page()
    pdf.ln(50)
    pdf.set_font("Body", "", 36)
    pdf.set_text_color(0x0D, 0x76, 0x6B)
    pdf.cell(0, 18, "世界樂器百科", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)
    pdf.set_font("Body", "", 26)
    pdf.set_text_color(0x1A, 0x23, 0x32)
    pdf.cell(0, 14, f"{code}  {arch['name']}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("Body", "", 12)
    pdf.set_text_color(0x66, 0x70, 0x85)
    pdf.multi_cell(0, 8, arch["subtitle"], align="C")
    pdf.ln(20)
    pdf.set_font("Body", "", 14)
    pdf.set_text_color(0x34, 0x40, 0x54)
    pdf.cell(0, 10, f"共 {len(instruments)} 件樂器", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Body", "", 10)
    pdf.set_text_color(0x66, 0x70, 0x85)
    pdf.cell(0, 10, "隔壁織音人 · 世界聲音百科", align="C", new_x="LMARGIN", new_y="NEXT")

    # ═══ 關於作者 ═══
    pdf.add_page()
    pdf.set_font("Body", "", 20)
    pdf.set_text_color(0x1A, 0x23, 0x32)
    pdf.cell(0, 14, "關於作者", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("Body", "", 10)
    pdf.set_text_color(0x34, 0x40, 0x54)
    for line in ABOUT_TEXT.split("\n"):
        line = line.strip()
        if not line:
            pdf.ln(4)
            continue
        pdf.multi_cell(0, 6, line)
        pdf.ln(2)

    # ═══ 目錄 ═══
    pdf.add_page()
    pdf.set_font("Body", "", 20)
    pdf.set_text_color(0x1A, 0x23, 0x32)
    pdf.cell(0, 14, "目錄", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Body", "", 12)
    pdf.set_text_color(0x0D, 0x76, 0x6B)
    pdf.cell(0, 8, f"{code}  {arch['name']}", new_x="LMARGIN", new_y="NEXT")

    entry_num = 1
    current_subcat = None
    for inst in instruments_sorted:
        sc = inst.get("subcategory") or ""
        if sc and sc != current_subcat:
            current_subcat = sc
            pdf.set_font("Body", "", 10)
            pdf.set_text_color(0x34, 0x40, 0x54)
            pdf.cell(0, 6, f"  {sc}", new_x="LMARGIN", new_y="NEXT")

        pg = page_map.get(inst["slug"], "")
        title = inst["title_zh"] or inst["slug"]
        pdf.set_font("Body", "", 9)
        pdf.set_text_color(0x1A, 0x23, 0x32)
        # 條目名稱 + 右對齊頁碼
        text = f"    {entry_num}. {title}"
        pdf.cell(150, 5, text)
        pdf.set_text_color(0x66, 0x70, 0x85)
        pdf.cell(0, 5, str(pg), align="R", new_x="LMARGIN", new_y="NEXT")
        entry_num += 1

        # 分頁防護（每頁約 30 行）
        if pdf.get_y() > 250:
            pdf.add_page()

    # ═══ 樂器內容 ═══
    entry_num = 1
    current_subcat = None
    for inst in instruments_sorted:
        sc = inst.get("subcategory") or ""

        if sc and sc != current_subcat:
            current_subcat = sc
            pdf.add_page()
            pdf.set_font("Body", "", 16)
            pdf.set_text_color(0x0D, 0x76, 0x6B)
            pdf.cell(0, 10, sc, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(4)
        else:
            pdf.add_page()

        # 樂器名稱
        pdf.set_font("Body", "", 14)
        pdf.set_text_color(0x1A, 0x23, 0x32)
        pdf.cell(0, 9, f"{entry_num}. {inst['title_zh']}", new_x="LMARGIN", new_y="NEXT")
        entry_num += 1

        if inst.get("title_original"):
            pdf.set_font("Body", "", 9)
            pdf.set_text_color(0x66, 0x70, 0x85)
            pdf.cell(0, 5, inst["title_original"], new_x="LMARGIN", new_y="NEXT")

        # 欄位
        fields = [(k, v) for k, v in [
            ("主分類", inst["class_code"]), ("分類", inst["frontend_class"]), ("子分類", inst["subcategory"]),
            ("家族", inst["family_std"]), ("發聲", inst["sound_hs"]), ("演奏", inst["playing_method"]),
            ("介面", inst["interface_tags"]), ("地域", inst["region_culture"]),
            ("聆聽", inst["listening_sound_tags"]), ("合奏", inst["ensemble_links"]),
            ("查證", inst["verification_status"]), ("來源", inst["source_url"]),
        ] if v and v.strip()]
        pdf.ln(3)
        pdf.set_font("Body", "", 8)
        for k, v in fields:
            pdf.set_text_color(0x34, 0x40, 0x54)
            pdf.cell(20, 4.5, k)
            v_trim = v if len(v) < 70 else v[:70] + "…"
            pdf.set_text_color(0x1A, 0x23, 0x32)
            pdf.cell(0, 4.5, v_trim, new_x="LMARGIN", new_y="NEXT")

        # 內容
        for title_section, content in [("介紹", inst["introduction"]), ("歷史背景", inst["history"]),
                                        ("音色描述", inst["timbre"]), ("樂器材質", inst["material"]), ("教學", inst["tutorial"])]:
            if not content:
                continue
            pdf.ln(2)
            pdf.set_font("Body", "", 10)
            pdf.set_text_color(0x0D, 0x76, 0x6B)
            pdf.cell(0, 5, f"【{title_section}】", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Body", "", 8.5)
            pdf.set_text_color(0x34, 0x40, 0x54)
            pdf.multi_cell(0, 5, _clean_md(content)[:800])

        # QR Code
        yt_ids = inst.get("youtube_ids", "")
        if yt_ids:
            ids = [v.strip() for v in re.split(r"[\s,]+", yt_ids) if v.strip()]
            for vid in ids[:2]:
                qr_buf = make_qr_buf(f"https://www.youtube.com/watch?v={vid}")
                if qr_buf:
                    pdf.ln(2)
                    pdf.set_font("Body", "", 7)
                    pdf.set_text_color(0x1D, 0x4E, 0xD8)
                    pdf.cell(0, 4, f"YouTube: {vid}", new_x="LMARGIN", new_y="NEXT")
                    pdf.image(qr_buf, w=15)
                    pdf.ln(2)

        # 頁碼在 footer 自動產生
        pdf.set_y(-15)
        pdf.set_font("Body", "", 8)
        pdf.set_text_color(0x99, 0x99, 0x99)
        pdf.cell(0, 10, str(pdf.page_no()), align="C")

    return pdf


# ===================================================================
#  主流程
# ===================================================================
def main():
    print("讀取樂器資料...")
    all_instruments = read_all_instruments()
    print(f"  共 {len(all_instruments)} 件樂器")

    code_groups = defaultdict(list)
    for inst in all_instruments:
        code_groups[inst["class_code"] or "A9"].append(inst)

    # 找字型
    font_path = FONT_SERIF or FONT_SANS
    body_font_name = "宋體" if FONT_SERIF else "無襯線字型"
    if font_path:
        print(f"  使用字型: {font_path}")
    else:
        print("  [WARN] 找不到中文字型")

    for code, arch in CATEGORY_ARCHITECTURE.items():
        instruments = code_groups.get(code, [])
        if not instruments:
            print(f"\n{code} {arch['name']}: 無樂器資料")
            continue

        instruments.sort(key=lambda x: (x["subcategory"] or "", x["title_zh"] or ""))
        print(f"\n{code} {arch['name']}: {len(instruments)} 件樂器")

        # ─── DOCX ───
        docx_path = OUTPUT_DIR / f"{arch['filename']}.docx"
        try:
            doc = build_docx(instruments, code, arch)
            doc.save(str(docx_path))
            size = os.path.getsize(docx_path) / 1024
            print(f"  [OK] DOCX: {docx_path.name} ({size:.0f} KB)")
        except Exception as e:
            print(f"  [FAIL] DOCX: {e}")

        # ─── PDF (雙趟) ───
        if font_path:
            pdf_path = OUTPUT_DIR / f"{arch['filename']}.pdf"
            try:
                # 第一趟：測量頁碼
                print(f"  ... 計算頁碼中")
                page_map = _measure_pdf_pages(instruments, code, arch, font_path)
                # 第二趟：實際輸出
                pdf = build_pdf(instruments, code, arch, font_path, page_map)
                pdf.output(str(pdf_path))
                size = os.path.getsize(pdf_path) / 1024
                print(f"  [OK] PDF:  {pdf_path.name} ({size:.0f} KB)")
            except Exception as e:
                print(f"  [FAIL] PDF: {e}")

    print(f"\n[OK] 全部完成!")
    print(f"   輸出資料夾: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
