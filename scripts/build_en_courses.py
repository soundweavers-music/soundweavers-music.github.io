#!/usr/bin/env python3
"""Build every English course page under /en/.

One builder for all of them, because the Chinese side grew four separate
builders (build_vocal_extra, build_static_site, build_mandolin, build_courses)
and porting each one's chrome to English would mean maintaining the same
templates twice. The English edition uses the plain course layout: an index
with the lesson list, one page per lesson, prev/next, and a landing page at
/en/.

Content lives in content/en/<slug>/*.md. A lesson file starts with
`# Chapter 7: <title>` or `# Lesson 7: <title>`; that first line is the only
thing the parser needs. Courses with no English content are skipped silently,
so this can run before the translation is finished.

Output:
  outputs/world-instruments-static/en/<slug>/index.html
  outputs/world-instruments-static/en/<slug>/ch07/index.html
  outputs/world-instruments-static/en/index.html

Run AFTER build_vocal_extra.py (it reuses that module's page() template).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

import build_vocal_extra as bve  # noqa: E402

CONTENT = BASE_DIR / "content" / "en"

# (slug, folder, name, eyebrow, icon, lead, practice factor, groups)
# groups: [(label, first chapter, last chapter)] — ours only split the two big
# courses into beginner/advanced, the rest are one list.
COURSES = [
    {
        # 樂理在 build_vocal_extra.py 裡建（一頁一章、有階段頁），這裡只負責讓
        # /en/ 的落地頁也列出它，所以 landing_only。
        "slug": "theory", "name": "Music Theory", "eyebrow": "Theory", "icon": "🎼",
        "lead": "Five stages, twenty chapters: where sound comes from, how rhythm works, "
                "how to read the staff, how instruments make their sound, and how ensembles fit together.",
        "factor": 2.0, "groups": [], "landing_only": True,
    },
    {
        "slug": "vocal", "name": "Voice and Singing", "eyebrow": "Voice", "icon": "🎤",
        "lead": "Fifty lessons from the first breath to a finished performance: "
                "support, resonance, range, diction, and how to practise without hurting yourself.",
        "factor": 2.0,
        "groups": [("Beginner", 1, 15), ("Advanced", 16, 50)],
    },
    {
        "slug": "digitalmusic", "name": "Recording and Mixing", "eyebrow": "Recording", "icon": "🎧",
        "lead": "From a bedroom setup to a finished master: tracking, editing, EQ, compression, "
                "reverb, and what each genre actually needs.",
        # 1.75 而不是 2.0：英文稿比中文長，用 2.0 會算出 20 小時，中文站寫的是 17.5
        "factor": 1.75,
        "groups": [("Foundations", 1, 15), ("Advanced", 16, 30)],
    },
    {
        "slug": "songwriting", "name": "Songwriting for Pop Songs", "eyebrow": "Songwriting", "icon": "✍️",
        "lead": "Six lessons that take a song from listening to finished: structure, lyrics, "
                "melody, chords, words over music, and getting it out of your head.",
        "factor": 5.0,
        "groups": [],
        "unit": "Lesson",
    },
    {
        "slug": "guitar", "name": "Pop Guitar for Singers", "eyebrow": "Guitar", "icon": "🎸",
        "lead": "From choosing a guitar and tuning to strumming patterns and singing while you play.",
        "factor": 2.0,
        "groups": [],
    },
    {
        "slug": "ukulele", "name": "Ukulele: Strumming and Fingerstyle", "eyebrow": "Ukulele", "icon": "🎶",
        "lead": "Everything about four strings: tuning, chord families, strumming patterns, "
                "fingerstyle and percussion.",
        "factor": 2.0,
        "groups": [],
    },
    {
        "slug": "mandolin", "name": "Mandolin", "eyebrow": "Mandolin", "icon": "🎻",
        "lead": "The instrument, the holding position, the tunings and the repertoire — "
                "a complete course for a small instrument with a long history.",
        # 中文站曼陀林用 2.5 的倍率（技法章節練得更久），英文版跟著用同一個
        "factor": 2.5,
        "groups": [],
    },
    {
        "slug": "dawcourse", "name": "Producing in a DAW", "eyebrow": "Production", "icon": "🎛",
        "lead": "Twenty-four hands-on lessons in the browser studio on this site: "
                "arranging, MIDI, virtual instruments, mixing and export.",
        "cta": ("/tools/daw/", "Open the studio"),
        "factor": 2.0,
        "groups": [],
        "unit": "Lesson",
    },
]

HEAD_RE = re.compile(r"(?i)^#\s*(?:chapter|lesson)\s+(\d+)\s*[:：]\s*(.+)$")
WORDS_PER_MIN = 185
CJK = re.compile(r"[一-鿿]")


def words(text: str) -> int:
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)      # images
    text = re.sub(r"[#*_`>|\-]", " ", text)
    return len(re.findall(r"[A-Za-z][A-Za-z'’\-]*", text))


def study_hours(word_count: int, factor: float) -> float:
    """Same shape as course_hours.study_hours, but counted in words.

    Chinese runs about 300 characters a minute and English about 185 words a
    minute, so the two numbers land on the same estimate for the same lesson —
    which matters, because the homepage adds the Chinese and English totals
    separately and nobody should see 6 hours in one language and 4 in the other.
    Round up to the next half hour, minimum half an hour.
    """
    minutes = word_count / WORDS_PER_MIN * factor
    return max(1, -(-int(minutes) // 30)) / 2


def load_chapters(slug: str) -> list[dict]:
    folder = CONTENT / slug
    if not folder.exists():
        return []
    out = []
    for path in sorted(folder.glob("*.md")):
        if path.name.startswith("_"):
            continue
        text = path.read_text(encoding="utf-8")
        first = next((ln for ln in text.splitlines() if ln.startswith("# ")), "")
        m = HEAD_RE.match(first.strip())
        if not m:
            continue
        num = int(m.group(1))
        title = m.group(2).strip().strip("*")
        n = words(text)
        out.append({"num": num, "title": title, "path": path, "slug": "ch%02d" % num,
                    "words": n, "hours": study_hours(n, 1.0)})
    # 練習倍率要套在整章上，先算好再乘
    return out


def theory_chapters() -> list[dict]:
    """樂理的章數：一個檔案一個階段，章要再按 `## Chapter N` 切（跟
    build_vocal_extra.build_theory_pages 用同一個切法）。"""
    folder = CONTENT / "musictheory"
    if not folder.exists():
        return []
    out = []
    for path in sorted(folder.glob("*.md")):
        for part in re.split(r"(?m)^##\s+", path.read_text(encoding="utf-8"))[1:]:
            head = part.partition("\n")[0]
            m = re.search(r"(?i)chapter\s+(\d+)", head)
            if m:
                out.append({"num": int(m.group(1)), "title": head.strip()})
    return sorted(out, key=lambda c: c["num"])


def missing_assets(chapters: list[dict]) -> list[str]:
    """這一套課程引用的圖，有沒有缺的。

    翻譯跟截圖是分開做的，常常文字好了、圖還沒。缺圖就整門課先不要建，
    不然線上會出現一堆破圖的頁面——寧可少一門，也不要半套。
    """
    gone = set()
    for c in chapters:
        text = c["path"].read_text(encoding="utf-8")
        for path in re.findall(r"/assets/[^\s\"')]+", text):
            if not (BASE_DIR / path.lstrip("/")).exists():
                gone.add(path)
    return sorted(gone)


def build_course(conf: dict) -> list[dict]:
    slug = conf["slug"]
    chapters = load_chapters(slug)
    if not chapters:
        return []
    gone = missing_assets(chapters)
    if gone:
        print("  en/%s: 還缺 %d 張圖，先跳過（%s…）" % (slug, len(gone), gone[0]))
        return []
    factor = conf.get("factor", 2.0)
    for c in chapters:
        c["hours"] = study_hours(c["words"], factor)
    out_dir = bve.OUTPUT_DIR / "en" / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    idx = out_dir / "index.html"

    def row(c):
        return (f'<li class="chapter-item has-link">'
                f'<a href="{bve.resolve_url(idx, "/en/%s/%s/" % (slug, c["slug"]))}">'
                f'<span class="ch-num done">{c["num"]}</span>'
                f'<span class="ch-title">{bve.escape(c["title"])}</span>'
                f'<span class="ch-status ch-status-done">about {c["hours"]:g} h</span>'
                f'</a></li>')

    by_num = {c["num"]: c for c in chapters}
    extra_links = build_extras(conf)
    blocks = []
    if conf["groups"]:
        for label, first, last in conf["groups"]:
            got = [by_num[n] for n in range(first, last + 1) if n in by_num]
            if got:
                blocks.append('<h2 class="en-group">%s</h2><ol class="chapter-list">%s</ol>'
                              % (bve.escape(label), "".join(row(c) for c in got)))
    if not blocks:
        blocks = ['<ol class="chapter-list">%s</ol>' % "".join(row(c) for c in chapters)]

    total = sum(c["hours"] for c in chapters)
    # 有對應工具站的課程（DAW）多一顆按鈕：讀完就能直接開軟體
    cta = ""
    if conf.get("cta"):
        cta = ('<p style="margin:22px 0 0"><a class="btn-primary" href="%s">%s</a></p>'
               % (bve.resolve_url(idx, conf["cta"][0]), bve.escape(conf["cta"][1])))
    body = f"""<main>
  <section class="vocal-hero">
    <p class="eyebrow">{bve.escape(conf["eyebrow"])}</p>
    <h1>{bve.escape(conf["name"])}</h1>
    <p class="lead">{bve.escape(conf["lead"])}</p>
    <p class="hero-stats" style="text-align:left;margin-top:20px">
      <span><strong>{len(chapters)}</strong> lessons</span>
      <span>about <strong>{total:g}</strong> hours</span>
    </p>
    {cta}
  </section>
  <div class="vocal-page">
    {extra_links}
    {''.join(blocks)}
  </div>
</main>"""
    bve.write(idx, bve.page(conf["name"], body, idx, extra_head=GROUP_CSS,
                            meta_description=conf["lead"], lang="en"))

    build_chapter_pages(conf, chapters)
    return chapters


EXTRAS = [("preface.md", "preface", "Preface"), ("contents.md", "contents", "Contents")]


def build_extras(conf: dict) -> str:
    """前言 / 目錄：有稿就建，回傳課程頁上要放的連結。"""
    slug = conf["slug"]
    folder = CONTENT / slug
    out_dir = bve.OUTPUT_DIR / "en" / slug
    idx = out_dir / "index.html"
    made = []
    for fname, page_slug, label in EXTRAS:
        path = folder / fname
        if not path.exists():
            continue
        d = out_dir / page_slug
        d.mkdir(parents=True, exist_ok=True)
        page_path = d / "index.html"
        html_body = bve.relativize(bve.markdown_to_html(path.read_text(encoding="utf-8")),
                                   page_path)
        body = f"""<main class="vocal-detail-page">
  <div class="vocal-detail-header">
    <div class="breadcrumb">
      <a href="{bve.resolve_url(page_path, "/en/%s/" % slug)}">← {bve.escape(conf["name"])}</a>
    </div>
    <h1>{label}</h1>
  </div>
  <div class="vocal-content markdown-body">{html_body}</div>
  <a class="back-link" href="{bve.resolve_url(page_path, "/en/%s/" % slug)}">← Back to the course</a>
</main>"""
        bve.write(page_path, bve.page("%s · %s" % (label, conf["name"]), body, page_path,
                                      meta_description="%s of %s" % (label, conf["name"]),
                                      lang="en"))
        made.append((page_slug, label))
    if not made:
        return ""
    links = "".join(
        f'<a href="{bve.resolve_url(idx, "/en/%s/%s/" % (slug, s))}">{bve.escape(t)}</a>'
        for s, t in made)
    return '<p class="course-extras">%s</p>' % links


def build_chapter_pages(conf: dict, chapters: list[dict]) -> None:
    slug = conf["slug"]
    out_dir = bve.OUTPUT_DIR / "en" / slug
    index_url = "/en/%s/" % slug
    lookup = {c["num"]: c for c in chapters}
    for c in chapters:
        ch_dir = out_dir / c["slug"]
        ch_dir.mkdir(parents=True, exist_ok=True)
        page_path = ch_dir / "index.html"
        html_body = bve.relativize(
            bve.markdown_to_html(c["path"].read_text(encoding="utf-8")), page_path)
        prev_c, next_c = lookup.get(c["num"] - 1), lookup.get(c["num"] + 1)
        prev_link = (f'<a class="vocal-nav-link" href="{bve.resolve_url(page_path, "/en/%s/%s/" % (slug, prev_c["slug"]))}">← {bve.escape(prev_c["title"])}</a>'
                     if prev_c else '<span class="vocal-nav-link disabled">← Previous</span>')
        next_link = (f'<a class="vocal-nav-link" href="{bve.resolve_url(page_path, "/en/%s/%s/" % (slug, next_c["slug"]))}">{bve.escape(next_c["title"])} →</a>'
                     if next_c else '<span class="vocal-nav-link disabled">Next →</span>')
        unit = conf.get("unit", "Chapter")
        detail = f"""<main class="vocal-detail-page">
  <div class="vocal-detail-header">
    <div class="breadcrumb">
      <a href="{bve.resolve_url(page_path, index_url)}">← {bve.escape(conf["name"])}</a>
      <span>/</span><span>{unit} {c["num"]}</span>
    </div>
    <h1>{bve.escape(c["title"])}</h1>
    <p class="level-name">{unit} {c["num"]}・about {c["hours"]:g} h</p>
  </div>
  <div class="vocal-content markdown-body">{html_body}</div>
  <div class="vocal-nav-links">{prev_link}{next_link}</div>
  <a class="back-link" href="{bve.resolve_url(page_path, index_url)}">← Back to the course</a>
</main>"""
        bve.write(page_path, bve.page("%s · %s" % (c["title"], conf["name"]), detail,
                                      page_path, meta_description=c["title"], lang="en"))
    print("  en/%s: index + %d lesson pages" % (slug, len(chapters)))


def build_landing(built: list[tuple[dict, list[dict]]]) -> None:
    out = bve.OUTPUT_DIR / "en" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    cards = "\n".join(
        f'      <a class="portal-card" href="{bve.resolve_url(out, "/en/" + conf["slug"] + "/")}">'
        f'<div class="card-icon">{conf["icon"]}</div>'
        f'<div class="card-label">{bve.escape(conf["name"])}</div>'
        f'<div class="card-desc">{bve.escape(conf["lead"])}</div>'
        f'<span class="card-badge badge-ready">{len(chapters)} lessons</span></a>'
        for conf, chapters in built)
    body = f"""<main>
  <section class="portal-hero hero-banner">
    <div class="hero-scene" role="img" aria-label="A wooden room with instruments and a microphone"></div>
    <div class="hero-inner">
      <p class="hero-eyebrow">Voice · Recording · Theory · Songwriting · Guitar · Ukulele · Mandolin</p>
      <h1>World Sound</h1>
      <p class="hero-sub">Follow the sound into the room it came from</p>
      <p class="hero-stats"><span>Courses in English: <strong>{len(built)}</strong></span></p>
    </div>
  </section>
  <p class="portal-intro">The instrument encyclopedia and the music tools are in Chinese for now.
  These courses are fully translated; the rest are on the way.</p>
  <div class="portal-grid">
{cards}
  </div>
</main>"""
    bve.write(out, bve.page("World Sound — English courses", body, out,
                            meta_description="English editions of the World Sound music courses.",
                            lang="en"))
    print("  en/: landing page with %d courses" % len(built))


GROUP_CSS = """<style>
.en-group { font-size:15px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--muted); margin:34px 0 10px; font-weight:700; }
.en-group:first-child { margin-top:22px; }
</style>"""


def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    built = []
    print("Building English course pages...")
    for conf in COURSES:
        if only and conf["slug"] != only:
            continue
        if conf.get("landing_only"):
            chapters = theory_chapters()
            if chapters:
                built.append((conf, chapters))
            continue
        chapters = build_course(conf)
        if chapters:
            built.append((conf, chapters))
        else:
            print("  en/%s: no English content yet, skipped" % conf["slug"])
    if not only:
        build_landing(built)


if __name__ == "__main__":
    main()
