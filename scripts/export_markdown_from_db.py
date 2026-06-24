#!/usr/bin/env python
from __future__ import annotations

import os
import re
import sys
import textwrap
import time
import json
import hashlib
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import quote

import requests
from django.utils.text import slugify


BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
CACHE_DIR = BASE_DIR / "work" / "cache"
USER_AGENT = "WorldMusicalInstrumentEncyclopediaStaticExporter/0.1"
ENWIKI_API = "https://en.wikipedia.org/w/api.php"
ZHWIKI_API = "https://zh.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
FETCH_WIKI_HISTORY_SECTIONS = os.environ.get("FETCH_WIKI_HISTORY_SECTIONS") == "1"


CATEGORY_MAP = {
    "弦鳴樂器": "弦樂器",
    "撥弦樂器": "弦樂器",
    "擦弦樂器": "弦樂器",
    "擊弦樂器": "弦樂器",
    "鍵盤弦鳴樂器": "鍵盤樂器",
    "膜鳴樂器": "打擊樂器",
    "敲擊膜鳴樂器": "打擊樂器",
    "體鳴樂器": "打擊樂器",
    "敲擊體鳴樂器": "打擊樂器",
    "摩擦體鳴樂器": "打擊樂器",
    "撥奏體鳴樂器": "打擊樂器",
    "氣鳴樂器": "管樂器",
    "邊棱吹奏樂器": "管樂器",
    "簧鳴樂器": "管樂器",
    "唇振氣鳴樂器": "管樂器",
    "自由氣鳴樂器": "管樂器",
    "電鳴樂器": "電子樂器",
}

COMMON_ZH_NAMES = {
    "accordion": "手風琴",
    "acoustic bass guitar": "原聲貝斯吉他",
    "acoustic guitar": "原聲吉他",
    "bagpipe": "風笛",
    "balalaika": "巴拉萊卡琴",
    "bandoneon": "班多鈕手風琴",
    "banjo": "班卓琴",
    "bass clarinet": "低音單簧管",
    "bass drum": "大鼓",
    "bass guitar": "貝斯吉他",
    "bassoon": "低音管",
    "bell": "鐘",
    "bongo": "邦哥鼓",
    "cello": "大提琴",
    "clarinet": "單簧管",
    "conga": "康加鼓",
    "cymbal": "鈸",
    "djembe": "金貝鼓",
    "double bass": "低音提琴",
    "drum": "鼓",
    "electric guitar": "電吉他",
    "flute": "長笛",
    "gong": "鑼",
    "guitar": "吉他",
    "harmonica": "口琴",
    "harp": "豎琴",
    "horn": "號角",
    "koto": "箏",
    "lute": "魯特琴",
    "mandolin": "曼陀林",
    "marimba": "馬林巴琴",
    "oboe": "雙簧管",
    "oud": "烏德琴",
    "piano": "鋼琴",
    "pipa": "琵琶",
    "saxophone": "薩氏管",
    "sitar": "西塔琴",
    "snare drum": "小鼓",
    "synthesizer": "合成器",
    "tabla": "塔布拉鼓",
    "taiko": "太鼓",
    "tambourine": "鈴鼓",
    "theremin": "特雷門",
    "timpani": "定音鼓",
    "trombone": "長號",
    "trumpet": "小號",
    "ukulele": "烏克麗麗",
    "viola": "中提琴",
    "violin": "小提琴",
    "xylophone": "木琴",
}

COUNTRY_HINTS = [
    ("中國", "中國"),
    ("China", "中國"),
    ("Chinese", "中國"),
    ("日本", "日本"),
    ("Japan", "日本"),
    ("Japanese", "日本"),
    ("韓國", "韓國"),
    ("Korea", "韓國"),
    ("Korean", "韓國"),
    ("印度", "印度"),
    ("India", "印度"),
    ("Indian", "印度"),
    ("印尼", "印尼"),
    ("印度尼西亞", "印尼"),
    ("Indonesia", "印尼"),
    ("Javanese", "印尼"),
    ("非洲", "非洲"),
    ("Africa", "非洲"),
    ("African", "非洲"),
    ("巴西", "巴西"),
    ("Brazil", "巴西"),
    ("古巴", "古巴"),
    ("Cuba", "古巴"),
    ("愛爾蘭", "愛爾蘭"),
    ("Irish", "愛爾蘭"),
    ("蘇格蘭", "蘇格蘭"),
    ("Scotland", "蘇格蘭"),
    ("Scottish", "蘇格蘭"),
    ("西班牙", "西班牙"),
    ("Spain", "西班牙"),
    ("Spanish", "西班牙"),
    ("義大利", "義大利"),
    ("意大利", "義大利"),
    ("Italy", "義大利"),
    ("Italian", "義大利"),
    ("法國", "法國"),
    ("France", "法國"),
    ("French", "法國"),
    ("德國", "德國"),
    ("Germany", "德國"),
    ("German", "德國"),
    ("土耳其", "土耳其"),
    ("Turkey", "土耳其"),
    ("Turkish", "土耳其"),
    ("伊朗", "伊朗"),
    ("Persia", "伊朗"),
    ("Persian", "伊朗"),
    ("美國", "美國"),
    ("United States", "美國"),
    ("American", "美國"),
    ("菲律賓", "菲律賓"),
    ("Philippine", "菲律賓"),
    ("Philippines", "菲律賓"),
]

COUNTRY_NORMALIZATION = {
    "中華人民共和國": "中國",
    "中华人民共和国": "中國",
    "印度尼西亞": "印尼",
    "印度尼西亚": "印尼",
    "美利堅合眾國": "美國",
    "美国": "美國",
}

NON_INSTRUMENT_TITLES = {
    "Acoustics",
    "Ancient Greece",
    "Benin",
    "Bow (music)",
    "Bridge (instrument)",
    "Cameroon",
    "Central Europe",
    "Inuit",
    "JSTOR (identifier)",
    "Keyboard instrument",
    "Korea",
    "Longitudinal wave",
    "Madagascar",
    "Melde's experiment",
    "Mersenne's laws",
    "Middle East",
    "Mongolia",
    "Musical keyboard",
    "Node (physics)",
    "Nut (string instrument)",
    "Overtone",
    "Piano wire",
    "Plectrum",
    "Tension ligature",
    "Tension loop",
}

NON_INSTRUMENT_PARTS = [
    "identifier",
    "region",
    "country",
    "physics",
    "law",
    "experiment",
]

ERA_HINTS = [
    (r"公元前|BCE|BC", "古代"),
    (r"\b1st century\b|1世紀|一世紀", "1 世紀"),
    (r"\b2nd century\b|2世紀|二世紀", "2 世紀"),
    (r"\b3rd century\b|3世紀|三世紀", "3 世紀"),
    (r"\b4th century\b|4世紀|四世紀", "4 世紀"),
    (r"\b5th century\b|5世紀|五世紀", "5 世紀"),
    (r"\b6th century\b|6世紀|六世紀", "6 世紀"),
    (r"\b7th century\b|7世紀|七世紀", "7 世紀"),
    (r"\b8th century\b|8世紀|八世紀", "8 世紀"),
    (r"\b9th century\b|9世紀|九世紀", "9 世紀"),
    (r"\b10th century\b|10世紀|十世紀", "10 世紀"),
    (r"\b11th century\b|11世紀|十一世紀", "11 世紀"),
    (r"\b12th century\b|12世紀|十二世紀", "12 世紀"),
    (r"\b13th century\b|13世紀|十三世紀", "13 世紀"),
    (r"\b14th century\b|14世紀|十四世紀", "14 世紀"),
    (r"\b15th century\b|15世紀|十五世紀", "15 世紀"),
    (r"\b16th century\b|16世紀|十六世紀", "16 世紀"),
    (r"\b17th century\b|17世紀|十七世紀", "17 世紀"),
    (r"\b18th century\b|18世紀|十八世紀", "18 世紀"),
    (r"\bancient\b|古代|Ancient", "古代"),
    (r"\bmedieval\b|Middle Ages|中世紀", "中世紀"),
    (r"\bRenaissance\b|文藝復興", "文藝復興"),
    (r"\bBaroque\b|巴洛克", "巴洛克"),
    (r"\bClassical period\b|古典時期", "古典時期"),
    (r"\b19th century\b|十九世紀", "19 世紀"),
    (r"\b20th century\b|二十世紀", "20 世紀"),
    (r"\b21st century\b|二十一世紀", "21 世紀"),
    (r"\belectronic\b|synthesizer|digital|電子", "現代"),
]

CHINESE_NUMERAL_CENTURIES = {
    "一": "1",
    "二": "2",
    "三": "3",
    "四": "4",
    "五": "5",
    "六": "6",
    "七": "7",
    "八": "8",
    "九": "9",
    "十": "10",
    "十一": "11",
    "十二": "12",
    "十三": "13",
    "十四": "14",
    "十五": "15",
    "十六": "16",
    "十七": "17",
    "十八": "18",
    "十九": "19",
    "二十": "20",
    "二十一": "21",
}

HISTORY_SECTION_KEYWORDS = [
    "歷史",
    "沿革",
    "起源",
    "發展",
    "由來",
    "history",
    "origin",
    "origins",
    "development",
    "evolution",
]

CATEGORY_DESCRIPTIONS = {
    "弦樂器": "主要靠弦的振動發聲，常透過撥、拉、彈、擊等方式演奏。",
    "打擊樂器": "通常透過敲擊、搖動、摩擦或刮奏產生聲音，常負責節奏與音色層次。",
    "管樂器": "主要靠氣流與管體、簧片或吹口產生聲音，音色會受吹奏方式與管身構造影響。",
    "鍵盤樂器": "以鍵盤作為主要操作介面，演奏者透過按鍵控制發聲機構或電子聲源。",
    "電子樂器": "以電子振盪、取樣、放大或數位處理塑造聲音，音色變化空間很大。",
}


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "table", "sup"}:
            self.skip_depth += 1
        if tag in {"p", "div", "section", "li", "br", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "table", "sup"} and self.skip_depth:
            self.skip_depth -= 1
        if tag in {"p", "div", "section", "li"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip_depth:
            self.parts.append(data)


def setup_django():
    sys.path.insert(0, str(BASE_DIR))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "world_instruments.settings")
    import django

    django.setup()


def chunks(values, size):
    for index in range(0, len(values), size):
        yield values[index : index + size]


def wiki_url(site, title):
    return f"https://{site}.wikipedia.org/wiki/{quote(title.replace(' ', '_'), safe='()_,%')}"


def request_json(session, url, params, timeout=30):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.sha1(json.dumps([url, params], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    cache_path = CACHE_DIR / f"{cache_key}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    response = None
    for attempt in range(4):
        response = session.get(url, params=params, timeout=timeout)
        if response.status_code != 429:
            response.raise_for_status()
            data = response.json()
            cache_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        time.sleep(2 * (attempt + 1))
    response.raise_for_status()


def fetch_wikidata_enrichment(instruments):
    qids = [item.wikidata_id for item in instruments if item.wikidata_id and item.wikidata_id.startswith("Q")]
    enrichment = {}
    country_qids = set()
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    for batch in chunks(qids, 50):
        data = request_json(
            session,
            WIKIDATA_API,
            params={
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "labels|sitelinks|claims",
                "languages": "zh-hant|zh|en",
                "sitefilter": "zhwiki",
                "format": "json",
            },
        )
        entities = data.get("entities", {})
        for qid, entity in entities.items():
            lang_labels = entity.get("labels", {})
            claims = entity.get("claims", {})
            country_id = first_entity_claim(claims, ["P495"])
            inception = first_time_claim(claims, ["P571", "P580", "P575"])
            if country_id:
                country_qids.add(country_id)
            zhwiki_title = entity.get("sitelinks", {}).get("zhwiki", {}).get("title", "")
            enrichment[qid] = {
                "zh_label": lang_labels.get("zh-hant", {}).get("value") or lang_labels.get("zh", {}).get("value") or "",
                "zhwiki_title": zhwiki_title,
                "country_qid": country_id,
                "inception": inception,
            }
        time.sleep(0.2)

    country_labels = fetch_wikidata_labels(country_qids)
    for data in enrichment.values():
        data["country"] = country_labels.get(data.get("country_qid", ""), "")
    return enrichment


def fetch_wikidata_labels(qids):
    if not qids:
        return {}
    labels = {}
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    for batch in chunks(sorted(qids), 50):
        data = request_json(
            session,
            WIKIDATA_API,
            params={
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "labels",
                "languages": "zh-hant|zh|en",
                "format": "json",
            },
        )
        for qid, entity in data.get("entities", {}).items():
            lang_labels = entity.get("labels", {})
            labels[qid] = (
                lang_labels.get("zh-hant", {}).get("value")
                or lang_labels.get("zh", {}).get("value")
                or lang_labels.get("en", {}).get("value")
                or ""
            )
        time.sleep(0.2)
    return labels


def first_entity_claim(claims, property_ids):
    for property_id in property_ids:
        for claim in claims.get(property_id, []):
            value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
            entity_id = value.get("id")
            if entity_id:
                return entity_id
    return ""


def first_time_claim(claims, property_ids):
    for property_id in property_ids:
        for claim in claims.get(property_id, []):
            value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
            time_value = value.get("time", "")
            if time_value:
                return time_value
    return ""


def fetch_enwiki_langlinks(instruments):
    titles = []
    title_by_name = {}
    for instrument in instruments:
        if instrument.wikidata_id and instrument.wikidata_id.startswith("Q"):
            continue
        title = instrument.source_url.rstrip("/").rsplit("/", 1)[-1].replace("_", " ") if instrument.source_url else instrument.name
        titles.append(title)
        title_by_name[instrument.name] = title

    result = {}
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    for batch in chunks(titles, 50):
        data = request_json(
            session,
            ENWIKI_API,
            params={
                "action": "query",
                "titles": "|".join(batch),
                "prop": "langlinks",
                "lllang": "zh",
                "redirects": 1,
                "format": "json",
            },
        )
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            en_title = page.get("title", "")
            langlinks = page.get("langlinks", [])
            if langlinks:
                result[en_title] = langlinks[0].get("*", "")
        time.sleep(0.2)

    by_instrument_name = {}
    for instrument_name, en_title in title_by_name.items():
        if en_title in result:
            by_instrument_name[instrument_name] = result[en_title]
    return by_instrument_name


def fetch_zh_extracts(zh_titles):
    extracts = {}
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    for batch in chunks([title for title in zh_titles if title], 50):
        data = request_json(
            session,
            ZHWIKI_API,
            params={
                "action": "query",
                "titles": "|".join(batch),
                "prop": "extracts|pageimages",
                "exintro": 1,
                "explaintext": 1,
                "redirects": 1,
                "pithumbsize": 900,
                "format": "json",
                "variant": "zh-hant",
            },
        )
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            title = page.get("title", "")
            extract = (page.get("extract") or "").strip()
            thumbnail = page.get("thumbnail", {}).get("source", "")
            if title and extract:
                extracts[title] = {"extract": extract, "image": thumbnail}
        time.sleep(0.2)
    return extracts


def fetch_history_sections(site, titles):
    api_url = ZHWIKI_API if site == "zh" else ENWIKI_API
    histories = {}
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    for title in [item for item in titles if item]:
        section_index = find_history_section(session, api_url, title, site)
        if section_index is None:
            continue
        text = fetch_section_text(session, api_url, title, section_index, site)
        if text:
            histories[title] = text
        time.sleep(0.15)
    return histories


def find_history_section(session, api_url, title, site):
    params = {
        "action": "parse",
        "page": title,
        "prop": "sections",
        "redirects": 1,
        "format": "json",
    }
    if site == "zh":
        params["variant"] = "zh-hant"
    try:
        data = request_json(session, api_url, params=params)
    except requests.HTTPError:
        return None
    sections = data.get("parse", {}).get("sections", [])
    best = None
    for section in sections:
        line = section.get("line", "").strip().lower()
        if any(keyword in line for keyword in HISTORY_SECTION_KEYWORDS):
            best = section.get("index")
            break
    return best


def fetch_section_text(session, api_url, title, section_index, site):
    params = {
        "action": "parse",
        "page": title,
        "section": section_index,
        "prop": "text",
        "redirects": 1,
        "format": "json",
    }
    if site == "zh":
        params["variant"] = "zh-hant"
    try:
        data = request_json(session, api_url, params=params)
    except requests.HTTPError:
        return ""
    html = data.get("parse", {}).get("text", {}).get("*", "")
    return clean_plain_text(strip_html(html))


def strip_html(html):
    parser = TextExtractor()
    parser.feed(html or "")
    return "".join(parser.parts)


def clean_plain_text(text):
    text = re.sub(r"\[[^\]]*\]", "", text or "")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([，。；：、,.!?])", r"\1", text)
    return text.strip()


def split_sentences(text, limit=4):
    text = clean_plain_text(text)
    if not text:
        return []
    parts = re.split(r"(?<=[。！？.!?])\s+", text)
    sentences = [part.strip() for part in parts if len(part.strip()) > 8]
    return sentences[:limit]


def translate_name(name, qid, wikidata_data, enwiki_langlinks):
    if qid in wikidata_data:
        zh_label = wikidata_data[qid].get("zh_label")
        zhwiki_title = wikidata_data[qid].get("zhwiki_title")
        if zhwiki_title:
            return zhwiki_title
        if zh_label:
            return zh_label
    if name in enwiki_langlinks:
        return enwiki_langlinks[name]
    key = name.lower().strip()
    if key in COMMON_ZH_NAMES:
        return COMMON_ZH_NAMES[key]
    for english, zh in sorted(COMMON_ZH_NAMES.items(), key=lambda item: len(item[0]), reverse=True):
        if english in key:
            return name.replace(english.title(), zh).replace(english, zh)
    return f"{name}（暫譯）"


def map_category(instrument):
    text = f"{instrument.name} {instrument.introduction_md} {instrument.timbre_description}".lower()
    if any(term in text for term in ["piano", "keyboard", "organ", "celesta", "harpsichord", "clavichord"]):
        return "鍵盤樂器"
    if any(term in text for term in ["electronic", "synthesizer", "digital", "theremin"]):
        return "電子樂器"
    category = instrument.category
    names = []
    while category:
        names.append(category.name)
        category = category.parent
    for name in names:
        if name in CATEGORY_MAP:
            return CATEGORY_MAP[name]
    if any(term in text for term in ["drum", "gong", "bell", "xylophone", "marimba", "percussion"]):
        return "打擊樂器"
    if any(term in text for term in ["flute", "horn", "trumpet", "clarinet", "oboe", "saxophone", "pipe"]):
        return "管樂器"
    if any(term in text for term in ["guitar", "violin", "string", "harp", "lute", "zither"]):
        return "弦樂器"
    if any(term in text for term in ["electronic", "synthesizer", "digital"]):
        return "電子樂器"
    return "其他"


def infer_country(text, wikidata_data=None):
    if wikidata_data and wikidata_data.get("country"):
        country = wikidata_data["country"]
        return COUNTRY_NORMALIZATION.get(country, country)
    candidates = []
    for hint, country in COUNTRY_HINTS:
        position = text.lower().find(hint.lower())
        if position >= 0:
            candidates.append((position, country))
    if candidates:
        return sorted(candidates, key=lambda item: item[0])[0][1]
    return "待考"


def is_exportable_instrument(instrument):
    name = instrument.name.strip()
    lowered = name.lower()
    if name in NON_INSTRUMENT_TITLES:
        return False
    if any(part in lowered for part in NON_INSTRUMENT_PARTS):
        return False
    return True


def infer_era(text, wikidata_data=None):
    if wikidata_data and wikidata_data.get("inception"):
        era = era_from_wikidata_time(wikidata_data["inception"])
        if era:
            return era
    century = re.search(r"([一二三四五六七八九十]{1,3}|\d{1,2})世紀", text)
    if century:
        value = CHINESE_NUMERAL_CENTURIES.get(century.group(1), century.group(1))
        return f"{value} 世紀"
    for pattern, era in ERA_HINTS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return era
    return "傳統／年代待考"


def era_from_wikidata_time(time_value):
    match = re.match(r"([+-]\d{1,})", time_value)
    if not match:
        return ""
    year = int(match.group(1))
    if year <= 0:
        return "古代"
    if year <= 500:
        return "古代"
    if year <= 1500:
        return "中世紀"
    if year >= 1901:
        century = ((year - 1) // 100) + 1
        return f"{century} 世紀"
    century = ((year - 1) // 100) + 1
    return f"{century} 世紀"


def yaml_quote(value):
    escaped = str(value or "").replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def clean_markdown(md_text):
    lines = []
    for line in (md_text or "").splitlines():
        if line.strip().startswith("- Wikidata：") or line.strip().startswith("- Wikipedia："):
            continue
        lines.append(line.rstrip())
    return textwrap.dedent("\n".join(lines)).strip()


def build_intro(instrument, zh_title, zh_extract, zh_name, category, country, era):
    if zh_extract:
        source = wiki_url("zh", zh_title)
        intro = friendly_zh_summary(zh_name, zh_extract, category, country, era)
        return "\n\n".join(
            [
                f"# {zh_title}",
                intro,
                "## 可查證來源",
                f"- 中文維基百科：{source}",
                f"- 原始來源：{instrument.source_url or source}",
            ]
        )
    return build_friendly_intro_from_source(instrument, zh_name, category, country, era)


def friendly_zh_summary(zh_name, extract, category, country, era):
    sentences = split_sentences(extract, limit=4)
    base = []
    if sentences:
        first = sentences[0]
        base.append(f"{zh_name}是一種{category}。{first}")
        if len(sentences) > 1:
            base.append("簡單來說，" + " ".join(sentences[1:3]))
    else:
        base.append(f"{zh_name}是一種{category}，適合從聲音特色、演奏方式與文化脈絡一起理解。")
    if country != "待考":
        base.append(f"在地域脈絡上，它和{country}的音樂文化有關。")
    if era != "傳統／年代待考":
        base.append(f"年代上可暫歸在「{era}」相關脈絡中理解。")
    return "\n\n".join(deduplicate_sentences(base))


def build_friendly_intro_from_source(instrument, zh_name, category, country, era):
    source_text = clean_markdown(instrument.introduction_md)
    english_extract = remove_markdown_noise(source_text)
    details = []
    details.append(f"# {zh_name}")
    details.append(f"{zh_name}（原名：{instrument.name}）是一種{category}。{CATEGORY_DESCRIPTIONS.get(category, '它的聲音特色與演奏方式，會隨地區傳統和樂器構造而變化。')}")
    if country != "待考":
        details.append(f"目前可查資料顯示，它與{country}的音樂文化或演奏傳統有關。")
    if era != "傳統／年代待考":
        details.append(f"若從年代脈絡看，這項樂器可先放在「{era}」中理解。")
    details.append(source_based_chinese_note(instrument.name, english_extract, category))
    details.append("## 可查證來源")
    if instrument.source_url:
        details.append(f"- Wikipedia / Wikidata 來源：{instrument.source_url}")
    if instrument.wikidata_id:
        details.append(f"- Wikidata ID：{instrument.wikidata_id}")
    return "\n\n".join(item for item in details if item)


def source_based_chinese_note(original_name, english_extract, category):
    lowered = english_extract.lower()
    notes = []
    if any(term in lowered for term in ["used", "played", "perform"]):
        notes.append("英文資料中特別提到它的使用或演奏情境，因此理解這項樂器時，不只要看外形，也要看它在樂曲、儀式或合奏中的角色。")
    if any(term in lowered for term in ["bamboo", "wood", "metal", "skin", "string"]):
        notes.append("材料與構造是它音色的重要線索；不同材質會讓聲音呈現更明亮、厚實或有共鳴感的差異。")
    if any(term in lowered for term in ["traditional", "folk", "ceremony", "ritual"]):
        notes.append("它常被放在傳統或民俗音樂脈絡中討論，代表它不只是發聲工具，也承載地方文化記憶。")
    if any(term in lowered for term in ["modern", "electronic", "amplified"]):
        notes.append("近現代的演出環境也影響了它的使用方式，尤其在錄音、舞台擴音或電子聲響中更容易出現新的變化。")
    if not notes:
        notes.append(f"目前中文資料較少，因此本條目先依英文維基與 Wikidata 的可查資料整理。後續可再補充 {original_name} 的製作方式、代表曲目與地方流派。")
    return "\n\n".join(deduplicate_sentences(notes[:3]))


def build_history(zh_name, original_name, category, country, era, zh_history, en_history, source_url):
    if zh_history:
        sentences = split_sentences(zh_history, limit=5)
        if sentences:
            body = " ".join(sentences)
            return "\n\n".join(
                [
                    f"{zh_name}的歷史可以從它的使用場合、製作材料和演奏傳統來看。",
                    f"根據中文維基百科的歷史相關段落，可整理為：{body}",
                    history_context_sentence(category, country, era),
                    f"來源：{source_url}" if source_url else "",
                ]
            ).strip()
    if en_history:
        return build_history_from_english(zh_name, original_name, category, country, era, en_history, source_url)
    return build_contextual_history(zh_name, original_name, category, country, era, source_url)


def build_history_from_english(zh_name, original_name, category, country, era, en_history, source_url):
    lowered = en_history.lower()
    notes = [f"{zh_name}（{original_name}）的英文資料有歷史相關段落；以下以平易中文整理其重點。"]
    century = find_century(en_history)
    if century:
        notes.append(f"資料中出現的年代線索顯示，它至少可放在「{century}」前後的脈絡中觀察。")
    elif era != "傳統／年代待考":
        notes.append(f"目前可先把它放在「{era}」的歷史脈絡下理解。")
    if country != "待考":
        notes.append(f"地域上，它和{country}的音樂傳統、工藝或演奏場合有關。")
    if any(term in lowered for term in ["evolved", "developed", "derived", "descended", "introduced"]):
        notes.append("它的形制並不是一次定型，而是在既有樂器、地方材料與演奏需求之間逐步演變。")
    if any(term in lowered for term in ["court", "church", "ceremony", "ritual", "folk", "dance"]):
        notes.append("歷史上，它也常和特定社會場合相連，例如宮廷、宗教儀式、民俗活動或舞蹈伴奏。")
    if any(term in lowered for term in ["modern", "century", "popular", "revival"]):
        notes.append("進入近現代後，演奏形式、舞台需求與跨文化交流，也讓它有了新的使用方式。")
    notes.append(history_context_sentence(category, country, era))
    if source_url:
        notes.append(f"來源：{source_url}")
    return "\n\n".join(deduplicate_sentences(notes))


def build_contextual_history(zh_name, original_name, category, country, era, source_url):
    notes = [f"{zh_name}（{original_name}）的歷史背景可先從可查來源、樂器分類與流傳地區三個方向理解。"]
    if country != "待考":
        notes.append(f"它可以先放在{country}相關音樂文化中理解，後續可再補代表樂派、演奏場合與製作工藝。")
    if era != "傳統／年代待考":
        notes.append(f"年代線索暫時指向「{era}」，可作為閱讀時的時間定位。")
    notes.append(history_context_sentence(category, country, era))
    notes.append(category_history_note(category))
    notes.append("閱讀這類樂器的歷史時，可以特別留意三件事：它最早被用在什麼場合、製作材料如何取得，以及它是否隨著遷徙、貿易、宗教或舞台表演而改變。這些線索通常比單一年份更能說明樂器如何被保存與傳播。")
    if source_url:
        notes.append(f"來源：{source_url}")
    return "\n\n".join(deduplicate_sentences(notes))


def history_context_sentence(category, country, era):
    parts = [f"作為{category}，它的歷史通常會和材料取得、演奏技法、合奏需求以及地方審美一起變化。"]
    if country != "待考":
        parts.append(f"若要深入研究，可優先查找{country}的博物館、民族音樂學資料或地方樂器圖錄。")
    if era != "傳統／年代待考":
        parts.append(f"「{era}」可作為初步年代標籤，但實際流傳時間仍應以專門資料校正。")
    return " ".join(parts)


def category_history_note(category):
    notes = {
        "弦樂器": "弦樂器的歷史常和弦材、共鳴箱、調音方式與演奏技法的演變有關。從民間伴奏到獨奏舞台，許多弦樂器都會因音量需求、音域擴張或樂曲風格改變而改良形制。",
        "打擊樂器": "打擊樂器通常和節奏、信號、祭儀、舞蹈或群體活動關係密切。它們的歷史不一定只寫在樂譜裡，也常出現在節慶、宗教、軍事或地方生活的脈絡中。",
        "管樂器": "管樂器的發展常和吹口、簧片、管身長度與開孔方式有關。隨著材料與製作工藝變化，音準、音域和音量都可能逐漸穩定，進而進入宮廷、宗教、軍樂或現代樂團。",
        "鍵盤樂器": "鍵盤樂器的歷史多半和機械結構、調律系統與演奏場域有關。從早期的撥弦、擊弦或管風琴機構，到現代舞台與錄音室，鍵盤介面讓複音演奏變得更容易。",
        "電子樂器": "電子樂器的歷史和錄音技術、電路、合成器、取樣與數位控制密不可分。它們常在短時間內快速變化，也更容易跨越古典、流行、實驗與影像配樂等領域。",
    }
    return notes.get(category, "這項樂器的歷史可以從使用者、製作材料、地方風格與演奏場合四個方向繼續補充。")


def remove_markdown_noise(text):
    text = re.sub(r"#+\s*", "", text or "")
    text = re.sub(r"-\s*(Wikidata|Wikipedia|主要來源|圖像檔案).*", "", text)
    return clean_plain_text(text)


def find_century(text):
    for pattern, era in ERA_HINTS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return era
    return ""


def deduplicate_sentences(items):
    seen = set()
    result = []
    for item in items:
        item = clean_plain_text(item)
        if item and item not in seen:
            result.append(item)
            seen.add(item)
    return result


def unique_slug(value, used):
    base = slugify(value, allow_unicode=False) or slugify(re.sub(r"[^\w]+", "-", value)) or "instrument"
    slug = base
    suffix = 2
    while slug in used:
        slug = f"{base}-{suffix}"
        suffix += 1
    used.add(slug)
    return slug


def main():
    setup_django()
    from instruments.models import Instrument

    instruments = [
        instrument
        for instrument in Instrument.objects.select_related("category", "category__parent").order_by("name")
        if is_exportable_instrument(instrument)
    ]
    wikidata_enrichment = fetch_wikidata_enrichment(instruments)
    enwiki_langlinks = fetch_enwiki_langlinks(instruments)
    zh_titles = []
    for instrument in instruments:
        data = wikidata_enrichment.get(instrument.wikidata_id or "", {})
        if data.get("zhwiki_title"):
            zh_titles.append(data["zhwiki_title"])
        elif instrument.name in enwiki_langlinks:
            zh_titles.append(enwiki_langlinks[instrument.name])
    zh_extracts = fetch_zh_extracts(sorted(set(zh_titles)))
    if FETCH_WIKI_HISTORY_SECTIONS:
        zh_histories = fetch_history_sections("zh", sorted(set(zh_titles)))
    else:
        zh_histories = {}
    en_title_by_name = {
        instrument.name: instrument.source_url.rstrip("/").rsplit("/", 1)[-1].replace("_", " ")
        for instrument in instruments
        if instrument.source_url and "en.wikipedia.org/wiki/" in instrument.source_url
    }
    if FETCH_WIKI_HISTORY_SECTIONS:
        en_histories = fetch_history_sections("en", sorted(set(en_title_by_name.values())))
    else:
        en_histories = {}
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)

    for old_file in CONTENT_DIR.glob("*.md"):
        old_file.unlink()

    used_slugs = set()
    for instrument in instruments:
        item_wikidata = wikidata_enrichment.get(instrument.wikidata_id or "", {})
        zh_title = item_wikidata.get("zhwiki_title") or enwiki_langlinks.get(instrument.name, "")
        zh_name = translate_name(instrument.name, instrument.wikidata_id or "", wikidata_enrichment, enwiki_langlinks)
        zh_extract_data = zh_extracts.get(zh_title, {})
        full_text = " ".join(
            [
                zh_name,
                zh_extract_data.get("extract", ""),
                instrument.name,
                instrument.introduction_md,
                instrument.history_md,
                instrument.timbre_description,
            ]
        )
        category = map_category(instrument)
        country = infer_country(full_text, item_wikidata)
        era = infer_era(full_text, item_wikidata)
        slug = unique_slug(instrument.name, used_slugs)
        intro = build_intro(instrument, zh_title or zh_name, zh_extract_data.get("extract", ""), zh_name, category, country, era)
        source_url = wiki_url("zh", zh_title) if zh_title else instrument.source_url
        history = build_history(
            zh_name=zh_name,
            original_name=instrument.name,
            category=category,
            country=country,
            era=era,
            zh_history=zh_histories.get(zh_title, ""),
            en_history=en_histories.get(en_title_by_name.get(instrument.name, ""), ""),
            source_url=source_url,
        )
        image = instrument.exploded_view_image or zh_extract_data.get("image", "")
        body = "\n\n".join(
            [
                "## 介紹",
                intro,
                "## 歷史背景",
                history,
                "## 音色描述",
                textwrap.dedent(instrument.timbre_description or "待管理員補充。").strip(),
            ]
        ).strip()
        frontmatter = "\n".join(
            [
                "---",
                f"title: {yaml_quote(zh_name)}",
                f"original_name: {yaml_quote(instrument.name)}",
                f"category: {yaml_quote(category)}",
                f"country: {yaml_quote(country)}",
                f"era: {yaml_quote(era)}",
                f"image: {yaml_quote(image)}",
                f"listen_link: {yaml_quote(instrument.listen_link)}",
                f"source_url: {yaml_quote(source_url)}",
                f"wikidata_id: {yaml_quote(instrument.wikidata_id)}",
                "---",
                "",
            ]
        )
        (CONTENT_DIR / f"{slug}.md").write_text(frontmatter + body + "\n", encoding="utf-8")

    print(f"Exported {len(instruments)} markdown files to {CONTENT_DIR}")


if __name__ == "__main__":
    main()
