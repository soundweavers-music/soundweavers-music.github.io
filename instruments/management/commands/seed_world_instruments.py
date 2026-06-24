from __future__ import annotations

import time
from dataclasses import dataclass
import hashlib
from html import unescape
import re
from urllib.parse import quote
from urllib.parse import unquote

import requests
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from instruments.models import Category, Instrument


USER_AGENT = "WorldMusicalInstrumentEncyclopedia/0.1 (local Django seed command)"
WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
WIKIPEDIA_SUMMARY_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
WIKIPEDIA_API_ENDPOINT = "https://en.wikipedia.org/w/api.php"


TAXONOMY = [
    {
        "name": "體鳴樂器",
        "slug": "idiophones",
        "description": "以樂器本體振動發聲的樂器，對應 Hornbostel-Sachs idiophones。",
        "children": [
            ("敲擊體鳴樂器", "struck-idiophones"),
            ("撥奏體鳴樂器", "plucked-idiophones"),
            ("摩擦體鳴樂器", "friction-idiophones"),
            ("吹奏體鳴樂器", "blown-idiophones"),
        ],
    },
    {
        "name": "膜鳴樂器",
        "slug": "membranophones",
        "description": "以繃緊的膜振動發聲的樂器，包含多數鼓類與膜鳴裝置。",
        "children": [
            ("敲擊膜鳴樂器", "struck-membranophones"),
            ("撥奏膜鳴樂器", "plucked-membranophones"),
            ("摩擦膜鳴樂器", "friction-membranophones"),
            ("歌唱膜鳴樂器", "singing-membranes"),
        ],
    },
    {
        "name": "弦鳴樂器",
        "slug": "chordophones",
        "description": "以弦振動發聲的樂器，包含撥弦、擦弦、擊弦等形式。",
        "children": [
            ("撥弦樂器", "plucked-strings"),
            ("擦弦樂器", "bowed-strings"),
            ("擊弦樂器", "struck-strings"),
            ("鍵盤弦鳴樂器", "keyboard-chordophones"),
        ],
    },
    {
        "name": "氣鳴樂器",
        "slug": "aerophones",
        "description": "主要以空氣柱或氣流振動發聲的樂器，包含笛、簧管、號角等。",
        "children": [
            ("自由氣鳴樂器", "free-aerophones"),
            ("邊棱吹奏樂器", "edge-blown-aerophones"),
            ("簧鳴樂器", "reed-aerophones"),
            ("唇振氣鳴樂器", "brass-aerophones"),
        ],
    },
    {
        "name": "電鳴樂器",
        "slug": "electrophones",
        "description": "以電子方式產生或作為主要聲源的樂器。",
        "children": [
            ("電子合成樂器", "electronic-synthesizers"),
            ("電子鍵盤樂器", "electronic-keyboards"),
            ("電子控制器", "electronic-controllers"),
            ("電聲混合樂器", "electro-acoustic-instruments"),
        ],
    },
    {
        "name": "複合與未分類樂器",
        "slug": "mixed-unclassified",
        "description": "跨分類、資料來源尚未明確對應或暫待人工整理的樂器。",
        "children": [
            ("複合樂器", "mixed-instruments"),
            ("未分類樂器", "uncategorized-instruments"),
        ],
    },
]


CLASSIFICATION_KEYWORDS = [
    ("electrophones", ["synthesizer", "electronic", "theremin", "ondes", "sampler", "drum machine"]),
    ("chordophones", ["string", "lute", "guitar", "violin", "fiddle", "zither", "harp", "lyre", "cello", "bass", "banjo", "mandolin"]),
    ("membranophones", ["drum", "membranophone", "tambourine", "timpani", "tabla", "djembe", "bongo", "conga"]),
    ("aerophones", ["flute", "pipe", "horn", "trumpet", "trombone", "clarinet", "oboe", "saxophone", "reed", "whistle", "organ"]),
    ("idiophones", ["idiophone", "xylophone", "marimba", "bell", "cymbal", "gong", "rattle", "mbira", "kalimba", "triangle"]),
]

WIKIPEDIA_LIST_SOURCES = [
    ("List of idiophones by Hornbostel–Sachs number", "idiophones"),
    ("List of membranophones by Hornbostel–Sachs number", "membranophones"),
    ("List of chordophones by Hornbostel–Sachs number", "chordophones"),
    ("List of aerophones by Hornbostel–Sachs number", "aerophones"),
    ("List of percussion instruments", "idiophones"),
    ("List of string instruments", "chordophones"),
    ("List of woodwind instruments", "aerophones"),
    ("List of musical instruments", ""),
]

EXCLUDED_TITLE_PARTS = [
    " identifier",
    "music theory",
    "classification",
    "conservatory",
    "wayback machine",
    "outline of",
    "history of",
    "music of",
    "musician",
    "orchestra",
    "band (music)",
    "album",
    "song",
    "overture",
    "country",
    "region",
    "autonomous community",
    "ancient ",
]

EXCLUDED_EXACT_TITLES = {
    "Aerophone",
    "Chordophone",
    "Hornbostel-Sachs",
    "Hornbostel–Sachs",
    "Idiophone",
    "Membranophone",
    "Musical instrument",
    "Musical instrument classification",
    "Percussion instrument",
    "String instrument",
    "Woodwind instrument",
    "Acoustics",
    "Ancient Greece",
    "Bow (music)",
    "Bridge (instrument)",
    "Flange",
    "Tension ligature",
    "Tension loop",
}


@dataclass(frozen=True)
class WikidataInstrument:
    qid: str
    label: str
    description: str
    article_url: str
    image_url: str
    audio_url: str
    source_group: str = ""

    @property
    def wikidata_url(self) -> str:
        return f"https://www.wikidata.org/wiki/{self.qid}"


class Command(BaseCommand):
    help = "Create taxonomy and verified instrument seed records from Wikidata/Wikipedia."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=500)
        parser.add_argument("--create-admin", action="store_true", help="Create or update a Django superuser.")
        parser.add_argument("--username", help="Superuser username. Required with --create-admin.")
        parser.add_argument("--password", help="Superuser password. Required with --create-admin.")
        parser.add_argument("--skip-fetch", action="store_true", help="Only create admin and taxonomy.")
        parser.add_argument("--clear-seeded", action="store_true", help="Delete previously seeded records that have a Wikidata ID.")

    def handle(self, *args, **options):
        if options["create_admin"]:
            if not options["username"] or not options["password"]:
                raise CommandError("--username and --password are required with --create-admin.")
            self.create_admin(options["username"], options["password"])
        categories = self.create_taxonomy()

        if options["clear_seeded"]:
            deleted, _ = Instrument.objects.exclude(wikidata_id__isnull=True).delete()
            self.stdout.write(f"Deleted {deleted} previously seeded records with Wikidata IDs.")

        if options["skip_fetch"]:
            self.stdout.write(self.style.SUCCESS("Created taxonomy."))
            return

        records = self.fetch_wikipedia_instrument_pages(limit=options["limit"])
        if len(records) < options["limit"]:
            records = self.extend_with_wikipedia_list_links(records, limit=options["limit"])
        self.stdout.write(f"Fetched {len(records)} verified instrument pages from Wikipedia/Wikidata.")
        created, updated = self.import_instruments(records, categories)
        self.stdout.write(self.style.SUCCESS(f"Seed complete: {created} created, {updated} updated."))

    def create_admin(self, username: str, password: str):
        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()
        verb = "Created" if created else "Updated"
        self.stdout.write(f"{verb} admin user: {username}")

    def create_taxonomy(self):
        categories = {}
        for parent_data in TAXONOMY:
            parent, _ = Category.objects.update_or_create(
                slug=parent_data["slug"],
                defaults={
                    "name": parent_data["name"],
                    "description": parent_data["description"],
                    "parent": None,
                },
            )
            categories[parent.slug] = parent
            for child_name, child_slug in parent_data["children"]:
                child, _ = Category.objects.update_or_create(
                    slug=child_slug,
                    defaults={
                        "name": child_name,
                        "description": f"{parent.name}的子分類。",
                        "parent": parent,
                    },
                )
                categories[child.slug] = child
        return categories

    def fetch_wikidata_instruments(self, limit: int):
        query = f"""
        SELECT DISTINCT ?instrument ?instrumentLabel ?instrumentDescription ?article ?image ?audio WHERE {{
          ?instrument wdt:P31/wdt:P279* wd:Q34379.
          OPTIONAL {{ ?instrument wdt:P18 ?image. }}
          OPTIONAL {{ ?instrument wdt:P51 ?audio. }}
          OPTIONAL {{
            ?article schema:about ?instrument;
              schema:isPartOf <https://en.wikipedia.org/>.
          }}
          SERVICE wikibase:label {{
            bd:serviceParam wikibase:language "zh,en".
            ?instrument rdfs:label ?instrumentLabel.
            ?instrument schema:description ?instrumentDescription.
          }}
        }}
        ORDER BY ?instrumentLabel
        LIMIT {limit}
        """
        response = requests.get(
            WIKIDATA_SPARQL_ENDPOINT,
            params={"query": query, "format": "json"},
            headers={"User-Agent": USER_AGENT},
            timeout=60,
        )
        response.raise_for_status()
        bindings = response.json()["results"]["bindings"]
        records = []
        seen = set()
        for item in bindings:
            entity_url = item["instrument"]["value"]
            qid = entity_url.rsplit("/", 1)[-1]
            label = item.get("instrumentLabel", {}).get("value", "").strip()
            if not label or qid in seen:
                continue
            seen.add(qid)
            records.append(
                WikidataInstrument(
                    qid=qid,
                    label=label,
                    description=item.get("instrumentDescription", {}).get("value", "").strip(),
                    article_url=item.get("article", {}).get("value", ""),
                    image_url=item.get("image", {}).get("value", ""),
                    audio_url=item.get("audio", {}).get("value", ""),
                )
            )
        return records

    def extend_with_wikipedia_list_links(self, records: list[WikidataInstrument], limit: int):
        seen_labels = {record.label for record in records}
        seen_qids = {record.qid for record in records}
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT})

        for list_title, source_group in WIKIPEDIA_LIST_SOURCES:
            response = session.get(
                f"https://en.wikipedia.org/wiki/{quote(list_title.replace(' ', '_'), safe='()_–')}",
                timeout=30,
            )
            if response.status_code == 429:
                self.stdout.write("Wikipedia HTML request was rate limited; using records gathered so far.")
                break
            response.raise_for_status()
            for href_title in re.findall(r'href="/wiki/([^"#:]+)"', response.text):
                title = unquote(href_title).replace("_", " ")
                title = unescape(title)
                if not self.looks_like_instrument_title(title) or title in seen_labels:
                    continue
                synthetic_id = f"ENWIKI-{hashlib.sha1(title.encode('utf-8')).hexdigest()[:10]}"
                if synthetic_id in seen_qids:
                    continue
                seen_labels.add(title)
                seen_qids.add(synthetic_id)
                article_url = f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'), safe='()_,–')}"
                records.append(
                    WikidataInstrument(
                        qid=synthetic_id,
                        label=title,
                        description=(
                            f"{title} is listed as a musical instrument on Wikipedia's curated instrument lists. "
                            "This seed entry uses the linked article and list page as verifiable starting sources."
                        ),
                        article_url=article_url,
                        image_url="",
                        audio_url="",
                        source_group=source_group,
                    )
                )
                if len(records) >= limit:
                    return records
            time.sleep(0.5)
        return records

    def fetch_wikipedia_instrument_pages(self, limit: int):
        titles_by_group = {}
        ordered_titles = []
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT})

        for list_title, source_group in WIKIPEDIA_LIST_SOURCES:
            response = self.get_with_rate_limit(
                session,
                WIKIPEDIA_API_ENDPOINT,
                params={
                    "action": "parse",
                    "page": list_title,
                    "prop": "links",
                    "format": "json",
                },
                timeout=30,
            )
            links = response.json().get("parse", {}).get("links", [])
            time.sleep(0.35)
            for link in links:
                if link.get("ns") != 0:
                    continue
                title = link.get("*", "").strip()
                if not self.looks_like_instrument_title(title):
                    continue
                if title not in titles_by_group:
                    ordered_titles.append(title)
                    titles_by_group[title] = source_group
                elif not titles_by_group[title] and source_group:
                    titles_by_group[title] = source_group
                if len(ordered_titles) >= limit * 6:
                    break
            if len(ordered_titles) >= limit * 6:
                break

        records = []
        seen_qids = set()
        for batch in self.chunks(ordered_titles, 50):
            try:
                page_data = self.fetch_page_metadata(session, batch)
            except requests.HTTPError as exc:
                if exc.response is not None and exc.response.status_code == 429:
                    self.stdout.write("Wikipedia metadata limit persisted; switching to list-link fallback.")
                    break
                raise
            time.sleep(0.25)
            for page in page_data:
                qid = page.get("pageprops", {}).get("wikibase_item", "")
                title = page.get("title", "")
                if not qid or qid in seen_qids:
                    continue
                extract = (page.get("extract") or "").strip()
                if not extract or not self.looks_like_instrument_summary(title, extract):
                    continue
                seen_qids.add(qid)
                image_url = page.get("thumbnail", {}).get("source", "")
                records.append(
                    WikidataInstrument(
                        qid=qid,
                        label=title,
                        description=extract,
                        article_url=f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'), safe='()_,')}",
                        image_url=image_url,
                        audio_url="",
                        source_group=titles_by_group.get(title, ""),
                    )
                )
                if len(records) >= limit:
                    return records
        return records

    def fetch_page_metadata(self, session, titles):
        params = {
            "action": "query",
            "titles": "|".join(titles),
            "prop": "extracts|pageprops|pageimages",
            "exintro": 1,
            "explaintext": 1,
            "redirects": 1,
            "pithumbsize": 900,
            "format": "json",
        }
        response = self.get_with_rate_limit(session, WIKIPEDIA_API_ENDPOINT, params=params, timeout=30)
        pages = response.json().get("query", {}).get("pages", {})
        return [page for page in pages.values() if "missing" not in page]

    def get_with_rate_limit(self, session, url, **kwargs):
        for attempt in range(7):
            response = session.get(url, **kwargs)
            if response.status_code != 429:
                response.raise_for_status()
                return response
            wait_seconds = 2 * (attempt + 1)
            self.stdout.write(f"Wikipedia rate limited request; waiting {wait_seconds}s...")
            time.sleep(wait_seconds)
        response.raise_for_status()

    def chunks(self, values, size):
        for index in range(0, len(values), size):
            yield values[index : index + size]

    def looks_like_instrument_title(self, title: str):
        if not title or title in EXCLUDED_EXACT_TITLES:
            return False
        lowered = title.lower()
        if ":" in title or title.startswith(("List of", "Category:", "File:", "Help:", "Portal:")):
            return False
        if any(part in lowered for part in EXCLUDED_TITLE_PARTS):
            return False
        return True

    def looks_like_instrument_summary(self, title: str, extract: str):
        lowered = f"{title} {extract}".lower()
        positive_terms = [
            "instrument",
            "idiophone",
            "membranophone",
            "chordophone",
            "aerophone",
            "percussion",
            "stringed",
            "woodwind",
            "brass",
            "drum",
            "flute",
            "horn",
            "guitar",
            "lute",
            "fiddle",
            "violin",
            "clarinet",
            "oboe",
            "saxophone",
            "trumpet",
            "trombone",
            "accordion",
            "bagpipe",
            "harp",
            "zither",
            "bell",
            "gong",
            "synthesizer",
        ]
        negative_terms = [
            "software",
            "identifier",
            "village",
            "town",
            "province",
            "album",
            "song",
            "composer",
            "musician",
            "record label",
        ]
        return any(term in lowered for term in positive_terms) and not any(term in lowered for term in negative_terms)

    @transaction.atomic
    def import_instruments(self, records: list[WikidataInstrument], categories):
        created = 0
        updated = 0
        fallback_category = categories["uncategorized-instruments"]
        for index, record in enumerate(records, start=1):
            if index % 25 == 0:
                self.stdout.write(f"Importing {index}/{len(records)}...")

            category = self.choose_category(record, categories) or fallback_category
            introduction_md = self.build_introduction(record)
            history_md = self.build_history(record)
            defaults = {
                "name": record.label[:160],
                "category": category,
                "introduction_md": introduction_md,
                "history_md": history_md,
                "exploded_view_image": record.image_url[:500],
                "timbre_description": self.build_timbre(record, category),
                "listen_link": record.audio_url[:500],
                "source_url": (record.article_url or record.wikidata_url)[:500],
            }
            _, was_created = Instrument.objects.update_or_create(
                wikidata_id=record.qid,
                defaults=defaults,
            )
            created += int(was_created)
            updated += int(not was_created)
            time.sleep(0.03)
        return created, updated

    def fetch_wikipedia_summary(self, article_url: str):
        if not article_url:
            return {}
        title = article_url.rstrip("/").rsplit("/", 1)[-1]
        response = requests.get(
            WIKIPEDIA_SUMMARY_ENDPOINT.format(title=quote(title)),
            headers={"User-Agent": USER_AGENT},
            timeout=20,
        )
        if response.status_code != 200:
            return {}
        data = response.json()
        return {
            "title": data.get("title", ""),
            "extract": data.get("extract", ""),
            "description": data.get("description", ""),
        }

    def choose_category(self, record: WikidataInstrument, categories):
        if record.source_group and record.source_group in categories:
            return categories[record.source_group]
        haystack = f"{record.label} {record.description}".lower()
        for slug, keywords in CLASSIFICATION_KEYWORDS:
            if any(keyword in haystack for keyword in keywords):
                return categories[slug]
        return categories["mixed-unclassified"]

    def build_introduction(self, record: WikidataInstrument):
        extract = record.description or "此樂器目前可查證的公開摘要較少，已先建立條目供後續管理員補充。"
        source = record.article_url or record.wikidata_url
        lines = [
            f"# {record.label}",
            "",
            extract,
            "",
            "## 可查證來源",
            "",
            f"- Wikidata：{record.wikidata_url}",
        ]
        if record.article_url:
            lines.append(f"- Wikipedia：{record.article_url}")
        if record.image_url:
            lines.append(f"- 圖像檔案：{record.image_url}")
        if record.audio_url:
            lines.append(f"- 聲音檔案：{record.audio_url}")
        lines.append(f"- 主要來源：{source}")
        return "\n".join(lines)

    def build_history(self, record: WikidataInstrument):
        source = record.article_url or record.wikidata_url
        return "\n".join(
            [
                f"## {record.label} 的歷史背景",
                "",
                "此預設條目以 Wikidata/Wikipedia 的公開結構化資料建立。若需要精確年代、地域流變、演奏流派與製作工藝，可再根據專書、博物館資料或民族音樂學研究補充。",
                "",
                f"來源：{source}",
            ]
        )

    def build_timbre(self, record: WikidataInstrument, category: Category):
        templates = {
            "體鳴樂器": "音色多由材質本體振動決定，常呈現清晰、短促或具有明顯泛音的聲響。",
            "膜鳴樂器": "音色由鼓膜張力、腔體形狀與敲擊方式影響，常具有明確起音與節奏性。",
            "弦鳴樂器": "音色由弦長、張力、共鳴箱與演奏法影響，可呈現撥奏、擦奏或擊弦的不同質感。",
            "氣鳴樂器": "音色由氣流、管體、簧片或唇振控制，常具有延展性強的旋律線條。",
            "電鳴樂器": "音色由電子振盪、取樣、濾波或放大系統塑造，可高度調變。",
        }
        root = category
        while root.parent:
            root = root.parent
        return templates.get(root.name, "音色特徵待管理員依來源補充；本條目已先建立可查證的名稱與來源資料。")
