"""Rebuild the instrument table from content/instruments/*.md.

The site's source of truth is the Markdown corpus. The DB had drifted (501
rows, names from an old Wikidata import, categories from a retired H-S tree),
which is why Django category pages showed almost nothing.

This command upserts one Instrument per Markdown file, keyed by
title_original (falling back to the slug), and files it under the matching
A1–A4 subcategory.

Usage:
  python manage.py import_from_markdown [--dry-run]
                                        [--prune-stale]
                                        [--markdown-dir content/instruments]
"""
from __future__ import annotations

import hashlib
import re
from collections import Counter
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from instruments.models import Category, Instrument


def parse_frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    data = {}
    for line in parts[1].splitlines():
        if ":" in line and not line.startswith((" ", "\t")):
            k, v = line.split(":", 1)
            data[k.strip()] = v.strip()
    return data


def section(body: str, name: str) -> str:
    m = re.search(rf"^## {re.escape(name)}[ \t]*\n(.*?)(?=^## |\Z)", body, re.S | re.M)
    return m.group(1).strip() if m else ""


CLASS_NAMES = {
    "A1": "吹奏與氣息樂器", "A2": "弦樂器", "A3": "鼓與打擊樂器",
    "A4": "電子與電聲樂器", "A9": "待分類／偵錯暫存",
}
CLASS_DESC = {
    "A1": "靠氣流、管身、簧片、唇振、風箱或風管系統發聲。對應 H-S 4 氣鳴樂器。",
    "A2": "靠弦震動發聲；鍵盤、輪弦、鍵控只作操作方式，不作主分類。對應 H-S 3 弦鳴樂器。",
    "A3": "膜鳴與體鳴；鼓、鑼鐘、木石竹、沙鈴、舌片與手邊共鳴同區處理。對應 H-S 1／2。",
    "A4": "電子合成、取樣、電聲改造與數位控制器。對應 H-S 5 電鳴樂器。",
    "A9": "分類待查或非單一樂器的暫存區。",
}


def cat_slug(code: str, name: str) -> str:
    """Stable, unique slug. Django's slugify() returns '' for CJK text, which
    made every Chinese subcategory collide on the same slug."""
    ascii_part = slugify(name)
    digest = hashlib.sha1(f"{code}:{name}".encode("utf-8")).hexdigest()[:8]
    return f"{code.lower()}-{ascii_part + '-' if ascii_part else ''}{digest}"


class Command(BaseCommand):
    help = "以 content/instruments/*.md 重建 Django 樂器資料"

    def add_arguments(self, parser):
        parser.add_argument("--markdown-dir", default="content/instruments")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--prune-stale", action="store_true",
                            help="刪除 Markdown 中已不存在的樂器")

    def handle(self, *args, **options):
        md_dir = Path(settings.BASE_DIR) / options["markdown_dir"]
        dry = options["dry_run"]

        parsed = []
        for path in sorted(md_dir.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            fm = parse_frontmatter(text)
            body = text.split("\n---\n", 1)[1] if "\n---\n" in text else ""
            parsed.append({
                "slug": path.stem,
                "fm": fm,
                "intro": section(body, "介紹"),
                "history": section(body, "歷史背景"),
                "timbre": section(body, "音色描述"),
            })
        self.stdout.write(f"讀取 {len(parsed)} 筆 Markdown")

        # taxonomy: A1–A4 parents + used subcategories
        used = Counter((p["fm"].get("class_code", ""), p["fm"].get("subcategory", ""))
                       for p in parsed
                       if p["fm"].get("class_code") and p["fm"].get("subcategory"))

        created = updated = 0
        with transaction.atomic():
            parents: dict[str, Category] = {}
            for code, name in CLASS_NAMES.items():
                if not any(k[0] == code for k in used):
                    continue
                cat, _ = Category.objects.get_or_create(
                    slug=cat_slug(code, name),
                    defaults={"name": name, "description": CLASS_DESC.get(code, "")})
                if cat.name != name:
                    cat.name = name
                    cat.save(update_fields=["name"])
                parents[code] = cat

            children: dict[tuple[str, str], Category] = {}
            for (code, sub) in sorted(used):
                parent = parents.get(code)
                if not parent:
                    continue
                cat, _ = Category.objects.get_or_create(
                    slug=cat_slug(code, sub),
                    defaults={"name": sub, "parent": parent})
                if cat.name != sub or cat.parent_id != parent.id:
                    cat.name, cat.parent = sub, parent
                    cat.save(update_fields=["name", "parent"])
                children[(code, sub)] = cat
            self.stdout.write(f"分類：{len(parents)} 主類、{len(children)} 子類")

            existing = {i.wikidata_id: i for i in Instrument.objects.all() if i.wikidata_id}
            seen_keys = set()
            for p in parsed:
                fm = p["fm"]
                key = f"MD-{p['slug']}"          # stable identity for markdown-sourced rows
                seen_keys.add(key)
                target = children.get((fm.get("class_code", ""), fm.get("subcategory", "")))
                if not target:
                    continue
                name = fm.get("title_original") or fm.get("title_zh") or p["slug"]
                src = fm.get("source_url", "")
                img = fm.get("image", "")
                fields = {
                    "name": name,
                    "category": target,
                    "introduction_md": p["intro"],
                    "history_md": p["history"],
                    "timbre_description": p["timbre"],
                    "country": fm.get("region_culture", ""),
                    "source_url": src if src.startswith("http") else "",
                    "exploded_view_image": img,
                    "image_source": "Wikimedia Commons" if "upload.wikimedia" in img else "",
                }
                inst = existing.get(key)
                if inst is None:
                    if not dry:
                        Instrument.objects.create(wikidata_id=key, **fields)
                    created += 1
                else:
                    if not dry:
                        for k, v in fields.items():
                            setattr(inst, k, v)
                        inst.save()
                    updated += 1

            pruned = 0
            if options["prune_stale"]:
                stale = Instrument.objects.exclude(wikidata_id__in=seen_keys)
                if not dry:
                    pruned, _ = stale.delete()
                else:
                    pruned = stale.count()

        if dry:
            self.stdout.write(self.style.WARNING("dry-run：未寫入"))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"完成：新增 {created}、更新 {updated}"
                + (f"、刪除 {pruned}" if options["prune_stale"] else "")))
