#!/usr/bin/env python
from __future__ import annotations

import os
import re
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
DEFAULT_XLSX = Path("/Users/timmychi/Downloads/隔壁家的世界聲音旅圖_完整企劃總表_全樂器資料庫720版.xlsx")
XLSX_PATH = Path(os.environ.get("INSTRUMENT_DATABASE_XLSX", DEFAULT_XLSX))
SHEET_NAME = "10_全樂器資料庫"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

FIELD_MAP = {
    "清單狀態": "database_status",
    "旅圖段落": "journey",
    "旅圖段落名稱": "journey_name",
    "章節編號": "chapter_number",
    "章節名稱": "chapter_name",
    "章節副標／主分類": "chapter_subtitle",
    "原聲音地景": "soundscape",
    "專業發聲大類": "sound_class",
    "Hornbostel–Sachs近似分類": "hs_class",
    "家族／支系": "family",
    "演奏方式": "playing_method",
    "身體／聽覺關聯": "body_listening",
    "地區類型": "region_type",
    "地區查證狀態": "region_verification",
    "文章篇型": "article_type",
    "優先級": "priority",
    "製作狀態": "production_status",
    "圖片／文件規格": "image_spec",
    "來源基底": "source_basis",
    "備註": "database_note",
}

CATEGORY_BY_SOUND_CLASS = [
    ("鍵盤", "鍵盤樂器"),
    ("電鳴", "電子樂器"),
    ("弦鳴", "弦樂器"),
    ("氣鳴", "管樂器"),
    ("膜鳴", "打擊樂器"),
    ("體鳴", "打擊樂器"),
]

SECTION_HEADING = "## 旅圖分類與補充說明"


def column_index(cell_ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    value = 0
    for letter in letters:
        value = value * 26 + (ord(letter) - ord("A") + 1)
    return value - 1


def shared_strings(zip_file: zipfile.ZipFile) -> list[str]:
    try:
        raw = zip_file.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(raw)
    strings = []
    for item in root.findall("main:si", NS):
        parts = [node.text or "" for node in item.findall(".//main:t", NS)]
        strings.append("".join(parts))
    return strings


def sheet_path(zip_file: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(zip_file.read("xl/workbook.xml"))
    rels = ET.fromstring(zip_file.read("xl/_rels/workbook.xml.rels"))
    rel_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("pkgrel:Relationship", NS)
    }
    for sheet in workbook.findall(".//main:sheet", NS):
        if sheet.attrib.get("name") == sheet_name:
            rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
            target = rel_targets[rel_id]
            target = target.lstrip("/")
            return target if target.startswith("xl/") else "xl/" + target
    raise ValueError(f"找不到工作表：{sheet_name}")


def read_sheet_rows(path: Path, sheet_name: str) -> list[list[str]]:
    with zipfile.ZipFile(path) as zip_file:
        strings = shared_strings(zip_file)
        sheet = ET.fromstring(zip_file.read(sheet_path(zip_file, sheet_name)))
        rows = []
        for row in sheet.findall(".//main:sheetData/main:row", NS):
            values = []
            for cell in row.findall("main:c", NS):
                index = column_index(cell.attrib.get("r", "A1"))
                while len(values) <= index:
                    values.append("")
                cell_type = cell.attrib.get("t")
                value_node = cell.find("main:v", NS)
                inline_node = cell.find("main:is/main:t", NS)
                value = ""
                if cell_type == "s" and value_node is not None:
                    value = strings[int(value_node.text or "0")]
                elif inline_node is not None:
                    value = inline_node.text or ""
                elif value_node is not None:
                    value = value_node.text or ""
                values[index] = clean_cell(value)
            rows.append(values)
    return rows


def clean_cell(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def read_database(path: Path) -> list[dict[str, str]]:
    rows = read_sheet_rows(path, SHEET_NAME)
    header = rows[3]
    records = []
    for row in rows[4:]:
        record = {
            header[index]: row[index] if index < len(row) else ""
            for index in range(len(header))
            if index < len(header) and header[index]
        }
        if record.get("樂器／主題中文名"):
            records.append(record)
    return records


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text.strip()
    _, frontmatter, body = text.split("---", 2)
    meta = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        meta[key.strip()] = value
    return meta, body.strip()


def format_frontmatter(meta: dict[str, str]) -> str:
    preferred = [
        "title",
        "original_name",
        "category",
        "country",
        "era",
        "journey",
        "journey_name",
        "chapter_number",
        "chapter_name",
        "chapter_subtitle",
        "sound_class",
        "hs_class",
        "family",
        "playing_method",
        "body_listening",
        "soundscape",
        "region_type",
        "region_verification",
        "article_type",
        "priority",
        "production_status",
        "image_spec",
        "source_basis",
        "database_status",
        "database_note",
        "image",
        "listen_link",
        "source_url",
        "wikidata_id",
    ]
    keys = [key for key in preferred if meta.get(key)] + sorted(
        key for key in meta if key not in preferred and meta.get(key)
    )
    lines = ["---"]
    for key in keys:
        value = meta[key].replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'{key}: "{value}"')
    lines.append("---")
    return "\n".join(lines)


def normalize_key(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "").lower().strip()
    text = re.sub(r"（.*?）|\(.*?\)", "", text)
    text = re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", text)
    return text


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "").strip().lower()
    text = re.sub(r"（.*?）|\(.*?\)", "", text)
    text = re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "-", text)
    return text.strip("-") or "unknown"


def category_from_record(record: dict[str, str]) -> str:
    source = "／".join(
        record.get(key, "")
        for key in ["專業發聲大類", "Hornbostel–Sachs近似分類", "章節副標／主分類", "家族／支系"]
    )
    for needle, category in CATEGORY_BY_SOUND_CLASS:
        if needle in source:
            return category
    return "其他"


def row_names(record: dict[str, str]) -> list[str]:
    title = record.get("樂器／主題中文名", "")
    original = record.get("英文／原文", "")
    names = [title, original]
    if not original and re.search(r"[A-Za-z]", title):
        names.append(title)
    return [name for name in names if name]


def existing_content():
    files = {}
    index = {}
    for path in CONTENT_DIR.glob("*.md"):
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        files[path] = (meta, body)
        for value in [path.stem, meta.get("title", ""), meta.get("original_name", "")]:
            key = normalize_key(value)
            if key:
                index.setdefault(key, path)
    return files, index


def pick_path(record: dict[str, str], index: dict[str, Path]) -> tuple[Path, bool]:
    for name in row_names(record):
        key = normalize_key(name)
        if key in index:
            return index[key], True
    base_slug = slugify(record.get("英文／原文") or record.get("樂器／主題中文名", "unknown"))
    path = CONTENT_DIR / f"{base_slug}.md"
    suffix = 2
    while path.exists():
        path = CONTENT_DIR / f"{base_slug}-{suffix}.md"
        suffix += 1
    for name in row_names(record):
        key = normalize_key(name)
        if key:
            index[key] = path
    return path, False


def remove_section(body: str, heading: str) -> str:
    pattern = re.compile(rf"\n*{re.escape(heading)}\n.*?(?=\n## |\Z)", re.S)
    return pattern.sub("", body).strip()


def bullet(label: str, value: str) -> str:
    return f"- **{label}**：{value}" if value else ""


def supplemental_section(record: dict[str, str]) -> str:
    lines = [
        SECTION_HEADING,
        "",
        bullet("旅圖段落", join_label(record.get("旅圖段落"), record.get("旅圖段落名稱"))),
        bullet("章節", join_label(record.get("章節編號"), record.get("章節名稱"))),
        bullet("章節主分類", record.get("章節副標／主分類", "")),
        bullet("原聲音地景", record.get("原聲音地景", "")),
        bullet("專業發聲大類", record.get("專業發聲大類", "")),
        bullet("Hornbostel–Sachs 近似分類", record.get("Hornbostel–Sachs近似分類", "")),
        bullet("家族／支系", record.get("家族／支系", "")),
        bullet("演奏方式", record.get("演奏方式", "")),
        bullet("身體／聽覺關聯", record.get("身體／聽覺關聯", "")),
        bullet("主要地區／國家", record.get("主要地區／國家（初稿）", "")),
        bullet("地區類型", record.get("地區類型", "")),
        bullet("資料狀態", record.get("地區查證狀態", "")),
    ]
    note = build_note(record)
    if note:
        lines += ["", "### 讀者導覽", "", note]
    lines = [line for line in lines if line]
    return "\n".join(lines)


def join_label(code: str, name: str) -> str:
    if code and name:
        return f"{code}｜{name}"
    return code or name


def build_note(record: dict[str, str]) -> str:
    title = record.get("樂器／主題中文名", "")
    family = record.get("家族／支系", "")
    playing = record.get("演奏方式", "")
    listening = record.get("身體／聽覺關聯", "")
    soundscape = record.get("原聲音地景", "")
    parts = []
    if family or playing:
        parts.append(f"閱讀 {title} 時，可以先從「{family or '樂器家族'}」與「{playing or '演奏手勢'}」切入，觀察它如何把材料、手勢與共鳴連在一起。")
    if listening:
        parts.append(f"聲音感受上，資料庫把它連到「{listening}」，適合在聆聽時留意身體哪個部位先被聲音碰到。")
    if soundscape:
        parts.append(f"在旅圖敘事裡，它被放進「{soundscape}」這條聲音路線，可作為後續寫文章、選圖與找聆聽範例的方向。")
    return "\n\n".join(parts)


def new_body(record: dict[str, str], category: str, country: str) -> str:
    title = record.get("樂器／主題中文名", "")
    original = record.get("英文／原文", "")
    sound_class = record.get("專業發聲大類", "")
    family = record.get("家族／支系", "")
    playing = record.get("演奏方式", "")
    listening = record.get("身體／聽覺關聯", "")
    chapter = join_label(record.get("章節編號", ""), record.get("章節名稱", ""))
    intro_name = f"{title}（{original}）" if original and original != title else title
    return "\n\n".join(
        part
        for part in [
            "## 介紹",
            f"{intro_name} 是收錄在《隔壁家的世界聲音旅圖》資料庫中的{category}。目前資料庫將它歸在「{sound_class or category}」脈絡下，主要可從{family or '樂器家族'}、{playing or '演奏方式'}與聲音地景來認識。",
            f"初步地區標註為「{country}」。這個欄位仍屬企劃初稿，後續可依博物館、百科條目、民族音樂學資料或演奏者資料逐篇核對。",
            "## 歷史背景",
            f"{intro_name} 的歷史背景目前先以資料庫分類建立閱讀入口。它位於「{chapter or record.get('旅圖段落', '旅圖')}」的脈絡中，代表這件樂器可以和氣息、材料、身體動作、地方儀式或現代舞台之間的關係一起閱讀。",
            f"如果要補寫成正式百科條目，建議優先查證三個方向：一是它最早出現或被記錄的地區，二是{family or '同一家族樂器'}的形制演變，三是{playing or '演奏方式'}如何影響音色、用途與傳播。",
            "## 音色描述",
            f"資料庫把它的身體／聽覺關聯標為「{listening or '待補'}」。實際音色仍需要搭配可信錄音或現場演奏資料補充。",
        ]
    )


def apply_record(record: dict[str, str], path: Path, existed: bool, files: dict[Path, tuple[dict[str, str], str]]):
    if existed:
        meta, body = files[path]
    else:
        meta, body = {}, ""
    title = record.get("樂器／主題中文名", "")
    original = record.get("英文／原文", "") or (title if re.search(r"[A-Za-z]", title) else "")
    category = category_from_record(record)
    country = record.get("主要地區／國家（初稿）", "") or meta.get("country", "待考")

    meta.setdefault("title", title)
    if not existed or not meta.get("original_name"):
        meta["original_name"] = original
    meta["category"] = category or meta.get("category", "其他")
    meta["country"] = country
    meta.setdefault("era", "傳統／年代待考")
    meta.setdefault("image", "")
    meta.setdefault("listen_link", "")
    meta.setdefault("source_url", "")
    meta.setdefault("wikidata_id", "")
    for source_key, target_key in FIELD_MAP.items():
        value = record.get(source_key, "")
        if value:
            meta[target_key] = value

    if not body:
        body = new_body(record, meta["category"], meta["country"])
    body = remove_section(body, SECTION_HEADING)
    body = body.rstrip() + "\n\n" + supplemental_section(record) + "\n"
    path.write_text(format_frontmatter(meta) + "\n" + body, encoding="utf-8")


def main():
    if not XLSX_PATH.exists():
        raise SystemExit(f"找不到 Excel 資料庫：{XLSX_PATH}")
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    records = read_database(XLSX_PATH)
    files, index = existing_content()
    created = 0
    updated = 0
    for record in records:
        path, existed = pick_path(record, index)
        apply_record(record, path, existed, files)
        if existed:
            updated += 1
        else:
            created += 1
            files[path] = parse_frontmatter(path.read_text(encoding="utf-8"))
    print(f"Imported {len(records)} rows from {XLSX_PATH.name}: {updated} updated, {created} created.")


if __name__ == "__main__":
    main()
