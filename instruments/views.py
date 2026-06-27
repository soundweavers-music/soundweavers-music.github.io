import bleach
import json
import markdown
import random
import re

from django.core.paginator import Paginator
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, render, redirect
from django.urls import reverse

from .models import Category, Instrument


ALLOWED_TAGS = bleach.sanitizer.ALLOWED_TAGS.union(
    {
        "p",
        "pre",
        "code",
        "h1",
        "h2",
        "h3",
        "h4",
        "ul",
        "ol",
        "li",
        "blockquote",
        "strong",
        "em",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "hr",
        "br",
        "img",
    }
)

ALLOWED_ATTRIBUTES = {
    **bleach.sanitizer.ALLOWED_ATTRIBUTES,
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title"],
}


def strip_wiki_links(html):
    if not html:
        return html
    link_pattern = re.compile(
        r'<a\b[^>]*href=["\'](?:https?://)?(?:[^/]+\.)?(?:wikipedia|wikidata|wikimedia)\.org[^"\']*["\'][^>]*>(.*?)</a>',
        flags=re.IGNORECASE | re.DOTALL,
    )
    url_pattern = re.compile(
        r"https?://(?:[^/\s]+\.)?(?:wikipedia|wikidata|wikimedia)\.org[^\s<>\"']*",
        flags=re.IGNORECASE,
    )
    while True:
        new_html = link_pattern.sub(lambda m: m.group(1), html)
        if new_html == html:
            break
        html = new_html
    return url_pattern.sub("", html)


def extract_introduction_section(markdown_text):
    if not markdown_text:
        return ""
    match = re.search(
        r"(^#{1,6}\s*介紹\b.*?$)(.*?)(?=^#{1,6}\s*\S|\Z)",
        markdown_text,
        flags=re.MULTILINE | re.DOTALL,
    )
    if not match:
        return ""
    return match.group(1).strip()


def render_markdown(md_text):
    raw_html = markdown.markdown(
        extract_introduction_section(md_text) or "",
        extensions=["extra", "toc", "tables", "fenced_code", "nl2br"],
        output_format="html5",
    )
    safe_html = bleach.clean(
        raw_html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=["http", "https", "mailto"],
        strip=True,
    )
    return strip_wiki_links(safe_html)


# Country → approximate lat/lng for map markers
COUNTRY_COORDS = {
    "全球": (20.0, 0.0),
    "全球／多地": (20.0, 0.0),
    "跨文化／多地": (20.0, 0.0),
    "非洲": (5.0, 20.0),
    "非洲／多地": (5.0, 20.0),
    "非洲／西非": (8.0, -5.0),
    "非洲／中非": (0.0, 20.0),
    "非洲／東非": (0.0, 35.0),
    "非洲／南非": (-25.0, 25.0),
    "非洲／北非": (25.0, 10.0),
    "非洲／辛巴威": (-19.0, 30.0),
    "亞洲": (35.0, 100.0),
    "亞洲／東亞": (35.0, 115.0),
    "亞洲／東南亞": (10.0, 105.0),
    "亞洲／南亞": (20.0, 78.0),
    "亞洲／中亞": (45.0, 65.0),
    "亞洲／西亞": (30.0, 45.0),
    "亞洲／中東": (28.0, 45.0),
    "歐洲": (50.0, 10.0),
    "歐洲／西歐": (50.0, 0.0),
    "歐洲／南歐": (42.0, 12.0),
    "歐洲／北歐": (60.0, 15.0),
    "歐洲／中歐": (50.0, 10.0),
    "歐洲／東歐": (52.0, 25.0),
    "歐洲／巴爾幹": (44.0, 22.0),
    "美洲": (40.0, -100.0),
    "美洲／北美": (45.0, -100.0),
    "美洲／中美": (15.0, -90.0),
    "美洲／南美": (-15.0, -60.0),
    "美洲／加勒比": (20.0, -75.0),
    "大洋洲": (-25.0, 135.0),
    "大洋洲／澳洲": (-25.0, 135.0),
    "大洋洲／太平洋島嶼": (-10.0, 160.0),
    "大洋洲／玻里尼西亞": (-15.0, -140.0),
    "大洋洲／夏威夷": (20.0, -157.0),
    "中東": (28.0, 45.0),
    "印度": (20.0, 78.0),
    "中國": (35.0, 105.0),
    "日本": (36.0, 138.0),
    "韓國": (37.0, 127.5),
    "臺灣": (23.5, 121.0),
    "台灣": (23.5, 121.0),
    "印尼": (-5.0, 120.0),
    "印度尼西亞": (-5.0, 120.0),
    "泰國": (15.0, 101.0),
    "越南": (16.0, 108.0),
    "菲律賓": (12.0, 122.0),
    "緬甸": (22.0, 96.0),
    "柬埔寨": (12.0, 105.0),
    "寮國": (18.0, 104.0),
    "馬來西亞": (4.0, 102.0),
    "尼泊爾": (28.0, 84.0),
    "西藏": (30.0, 90.0),
    "蒙古": (46.0, 105.0),
    "斯里蘭卡": (7.5, 80.5),
    "土耳其": (39.0, 35.0),
    "伊朗": (32.0, 53.0),
    "伊拉克": (33.0, 44.0),
    "阿拉伯": (24.0, 45.0),
    "以色列": (31.0, 35.0),
    "亞美尼亞": (40.0, 45.0),
    "喬治亞": (42.0, 43.0),
    "俄羅斯": (60.0, 40.0),
    "希臘": (39.0, 22.0),
    "義大利": (42.0, 12.0),
    "西班牙": (40.0, -3.0),
    "葡萄牙": (39.5, -8.0),
    "法國": (46.0, 2.0),
    "德國": (51.0, 10.0),
    "英國": (55.0, -3.0),
    "愛爾蘭": (53.0, -8.0),
    "荷蘭": (52.0, 5.0),
    "比利時": (50.5, 4.5),
    "瑞士": (47.0, 8.0),
    "奧地利": (47.5, 14.0),
    "波蘭": (52.0, 20.0),
    "捷克": (50.0, 15.0),
    "匈牙利": (47.0, 20.0),
    "羅馬尼亞": (46.0, 25.0),
    "保加利亞": (43.0, 25.0),
    "塞爾維亞": (44.0, 21.0),
    "克羅埃西亞": (45.0, 16.0),
    "北歐": (60.0, 15.0),
    "挪威": (62.0, 10.0),
    "瑞典": (62.0, 15.0),
    "丹麥": (56.0, 10.0),
    "芬蘭": (64.0, 26.0),
    "冰島": (65.0, -18.0),
    "埃及": (27.0, 30.0),
    "摩洛哥": (32.0, -6.0),
    "阿爾及利亞": (28.0, 3.0),
    "突尼西亞": (34.0, 9.0),
    "利比亞": (26.0, 17.0),
    "衣索比亞": (9.0, 38.0),
    "肯亞": (0.0, 38.0),
    "坦尚尼亞": (-6.0, 35.0),
    "奈及利亞": (8.0, 8.0),
    "迦納": (8.0, -2.0),
    "塞內加爾": (14.0, -14.0),
    "馬利": (17.0, -4.0),
    "剛果": (-3.0, 24.0),
    "剛果民主共和國": (-3.0, 24.0),
    "南非": (-30.0, 25.0),
    "馬達加斯加": (-20.0, 47.0),
    "澳洲": (-25.0, 135.0),
    "紐西蘭": (-41.0, 174.0),
    "加拿大": (56.0, -106.0),
    "美國": (40.0, -100.0),
    "墨西哥": (23.0, -102.0),
    "巴西": (-14.0, -53.0),
    "阿根廷": (-38.0, -63.0),
    "祕魯": (-9.0, -75.0),
    "哥倫比亞": (4.0, -73.0),
    "古巴": (22.0, -79.0),
    "牙買加": (18.0, -77.0),
    "波多黎各": (18.0, -66.5),
    "巴布亞紐幾內亞": (-6.0, 147.0),
    "西亞": (30.0, 45.0),
    "南亞": (20.0, 78.0),
    "東亞": (35.0, 115.0),
    "東南亞": (10.0, 105.0),
    "中亞": (45.0, 65.0),
    "北美": (45.0, -100.0),
    "中美": (15.0, -90.0),
    "南美": (-15.0, -60.0),
    "西非": (8.0, -5.0),
    "東非": (0.0, 35.0),
    "北非": (25.0, 10.0),
    "南非地區": (-25.0, 25.0),
    "中非": (0.0, 20.0),
}


def get_region_coords(country_str):
    """Parse a country field and return (lat, lng) or None."""
    if not country_str:
        return None
    parts = [p.strip() for p in country_str.replace("／", "/").split("/")]
    for part in parts:
        if part in COUNTRY_COORDS:
            return COUNTRY_COORDS[part]
    for part in parts:
        for key, coord in COUNTRY_COORDS.items():
            if part in key or key in part:
                return coord
    return None


GLOBAL_KEYWORDS = {"全球", "全球／多地", "跨文化／多地", "全球現代", "多地", "國際"}


def build_map_data():
    """Build GeoJSON-like data for the world map from instrument country data."""
    instruments = Instrument.objects.exclude(country="").exclude(country__isnull=True)
    region_counts = {}
    region_instruments = {}
    for inst in instruments:
        # Skip global/international entries that don't map to a specific region
        if inst.country in GLOBAL_KEYWORDS:
            continue
        # Also skip if the country starts with a global keyword
        skip = False
        for gk in GLOBAL_KEYWORDS:
            if inst.country.startswith(gk):
                skip = True
                break
        if skip:
            continue
        coords = get_region_coords(inst.country)
        if not coords:
            continue
        key = (round(coords[0], 1), round(coords[1], 1))
        if key not in region_counts:
            region_counts[key] = 0
            region_instruments[key] = []
        region_counts[key] += 1
        if len(region_instruments[key]) < 5:
            region_instruments[key].append(inst.name)
    features = []
    for (lat, lng), count in sorted(region_counts.items(), key=lambda x: -x[1]):
        samples = region_instruments.get((lat, lng), [])
        features.append({
            "lat": lat,
            "lng": lng,
            "count": count,
            "samples": samples[:5],
        })
    return features


def home(request):
    categories = (
        Category.objects.filter(parent__isnull=True)
        .annotate(instrument_count=Count("instruments"))
        .prefetch_related("children")
    )
    featured_instruments = Instrument.objects.select_related("category")[:8]
    map_features = build_map_data()
    popular_count = Instrument.objects.filter(is_popular=True).count()
    uncommon_count = Instrument.objects.filter(is_uncommon=True).count()
    return render(
        request,
        "instruments/home.html",
        {
            "categories": categories,
            "featured_instruments": featured_instruments,
            "map_features_json": json.dumps(map_features, ensure_ascii=False),
            "popular_count": popular_count,
            "uncommon_count": uncommon_count,
        },
    )


def instrument_list(request):
    query = request.GET.get("q", "").strip()
    category_slug = request.GET.get("category", "").strip()
    instruments = Instrument.objects.select_related("category")

    selected_category = None
    if category_slug:
        selected_category = get_object_or_404(Category, slug=category_slug)
        category_ids = [selected_category.id, *selected_category.get_descendant_ids()]
        instruments = instruments.filter(category_id__in=category_ids)

    if query:
        instruments = instruments.filter(
            Q(name__icontains=query)
            | Q(category__name__icontains=query)
            | Q(introduction_md__icontains=query)
            | Q(history_md__icontains=query)
            | Q(timbre_description__icontains=query)
        )

    paginator = Paginator(instruments, 12)
    page_obj = paginator.get_page(request.GET.get("page"))

    return render(
        request,
        "instruments/instrument_list.html",
        {
            "page_obj": page_obj,
            "query": query,
            "categories": Category.objects.all(),
            "selected_category": selected_category,
        },
    )


def category_detail(request, slug):
    category = get_object_or_404(Category, slug=slug)
    category_ids = [category.id, *category.get_descendant_ids()]
    instruments = Instrument.objects.select_related("category").filter(category_id__in=category_ids)
    paginator = Paginator(instruments, 12)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(
        request,
        "instruments/category_detail.html",
        {
            "category": category,
            "page_obj": page_obj,
        },
    )


def instrument_detail(request, pk):
    instrument = get_object_or_404(Instrument.objects.select_related("category"), pk=pk)
    return render(
        request,
        "instruments/instrument_detail.html",
        {
            "instrument": instrument,
            "introduction_html": render_markdown(instrument.introduction_md),
        },
    )


def popular_instruments(request):
    instruments = Instrument.objects.filter(is_popular=True).select_related("category")
    paginator = Paginator(instruments, 12)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(
        request,
        "instruments/instrument_list.html",
        {
            "page_obj": page_obj,
            "query": "",
            "categories": Category.objects.all(),
            "selected_category": None,
            "list_title": "熱門樂器",
        },
    )


def uncommon_instruments(request):
    instruments = Instrument.objects.filter(is_uncommon=True).select_related("category")
    paginator = Paginator(instruments, 12)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(
        request,
        "instruments/instrument_list.html",
        {
            "page_obj": page_obj,
            "query": "",
            "categories": Category.objects.all(),
            "selected_category": None,
            "list_title": "冷門樂器",
        },
    )


def random_instrument(request):
    count = Instrument.objects.count()
    if count == 0:
        return redirect("home")
    random_pk = random.choice(Instrument.objects.values_list("pk", flat=True))
    return redirect(reverse("instrument_detail", kwargs={"pk": random_pk}))


def about(request):
    return render(request, "instruments/about.html")


def theory(request):
    return render(request, "instruments/theory.html")
