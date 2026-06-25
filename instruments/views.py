import bleach
import markdown
import re

from django.core.paginator import Paginator
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, render

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


def home(request):
    categories = (
        Category.objects.filter(parent__isnull=True)
        .annotate(instrument_count=Count("instruments"))
        .prefetch_related("children")
    )
    featured_instruments = Instrument.objects.select_related("category")[:8]
    return render(
        request,
        "instruments/home.html",
        {
            "categories": categories,
            "featured_instruments": featured_instruments,
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
