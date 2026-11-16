"""Sync the A1–A4 taxonomy and instrument categories from content/*.md.

The Django app still uses an older Hornbostel-Sachs category tree
(弦鳴樂器 → 撥弦樂器 …) that no instrument's frontmatter refers to, so every
subcategory page on the Django site rendered empty. The Markdown files are the
source of truth now (class_code + subcategory + frontend_class).

This command:
  1. creates/updates the four A1–A4 parent categories plus one child per
     subcategory actually used in the Markdown
  2. reassigns each instrument to its subcategory (matched by title_original /
     title_zh against Instrument.name)
  3. optionally deactivates the legacy tree with --prune-legacy (only removes
     categories that have no instruments left)

Usage:
  python manage.py sync_taxonomy_from_markdown [--dry-run] [--prune-legacy]
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
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


CLASS_NAMES = {
    "A1": "吹奏與氣息樂器",
    "A2": "弦樂器",
    "A3": "鼓與打擊樂器",
    "A4": "電子與電聲樂器",
    "A9": "待分類／偵錯暫存",
}
CLASS_DESC = {
    "A1": "靠氣流、管身、簧片、唇振、風箱或風管系統發聲。對應 H-S 4 氣鳴樂器。",
    "A2": "靠弦震動發聲；鍵盤、輪弦、鍵控只作操作方式，不作主分類。對應 H-S 3 弦鳴樂器。",
    "A3": "膜鳴與體鳴；鼓、鑼鐘、木石竹、沙鈴、舌片與手邊共鳴同區處理。對應 H-S 1／2。",
    "A4": "電子合成、取樣、電聲改造與數位控制器。對應 H-S 5 電鳴樂器。",
    "A9": "分類待查或非單一樂器的暫存區。",
}


class Command(BaseCommand):
    help = "以 content/instruments 的 class_code／subcategory 重建 Django 分類樹"

    def add_arguments(self, parser):
        parser.add_argument("--markdown-dir", default="content/instruments")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--prune-legacy", action="store_true",
                            help="刪除已無樂器使用的舊分類")

    def handle(self, *args, **options):
        md_dir = Path(settings.BASE_DIR) / options["markdown_dir"]
        dry = options["dry_run"]

        entries = []
        for path in sorted(md_dir.glob("*.md")):
            fm = parse_frontmatter(path.read_text(encoding="utf-8"))
            if not fm.get("class_code") and not fm.get("title_original"):
                continue
            entries.append({
                "slug": path.stem,
                "title_zh": fm.get("title_zh", ""),
                "title_original": fm.get("title_original", ""),
                "class_code": fm.get("class_code", ""),
                "frontend_class": fm.get("frontend_class", ""),
                "subcategory": fm.get("subcategory", ""),
            })
        self.stdout.write(f"讀取 {len(entries)} 筆 Markdown")

        # 1. category tree
        used: dict[tuple[str, str], int] = Counter()
        for e in entries:
            if e["class_code"] and e["subcategory"]:
                used[(e["class_code"], e["subcategory"])] += 1

        with transaction.atomic():
            parents: dict[str, Category] = {}
            for code, name in CLASS_NAMES.items():
                if not any(k[0] == code for k in used):
                    continue
                cat, made = Category.objects.get_or_create(
                    slug=slugify(name),
                    defaults={"name": name, "description": CLASS_DESC.get(code, "")},
                )
                if not made and (cat.name != name):
                    cat.name = name
                    cat.save(update_fields=["name"])
                parents[code] = cat
            self.stdout.write(f"主分類：{len(parents)} 個"
                              + ("（dry-run 不寫入）" if dry else ""))

            children: dict[tuple[str, str], Category] = {}
            for (code, sub), n in sorted(used.items()):
                parent = parents.get(code)
                if not parent:
                    continue
                base_slug = f"{slugify(sub) or 'sub'}"
                cat, made = Category.objects.get_or_create(
                    slug=base_slug,
                    defaults={"name": sub, "parent": parent},
                )
                if not made and (cat.name != sub or cat.parent_id != parent.id):
                    cat.name, cat.parent = sub, parent
                    cat.save(update_fields=["name", "parent"])
                children[(code, sub)] = cat
            self.stdout.write(f"子分類：{len(children)} 個（{sum(used.values())} 筆歸屬）")

            # 2. reassign instruments
            by_name = {}
            for inst in Instrument.objects.all():
                by_name[inst.name.strip().lower()] = inst
            matched = unmatched = 0
            for e in entries:
                target = children.get((e["class_code"], e["subcategory"]))
                if not target:
                    continue
                inst = (by_name.get(e["title_original"].strip().lower())
                        or by_name.get(e["title_zh"].strip().lower()))
                if not inst:
                    unmatched += 1
                    continue
                if inst.category_id != target.id:
                    if not dry:
                        inst.category = target
                        inst.save(update_fields=["category"])
                    matched += 1
            self.stdout.write(f"重新歸類：{matched} 筆；資料庫查無對應：{unmatched} 筆")

            # 3. prune legacy categories with no instruments
            if options["prune_legacy"]:
                removed = 0
                for cat in list(Category.objects.all()):
                    if cat.id in {c.id for c in children.values()} | {c.id for c in parents.values()}:
                        continue
                    if cat.instruments.exists() or cat.children.exists():
                        continue
                    if not dry:
                        cat.delete()
                    removed += 1
                self.stdout.write(f"移除無用舊分類：{removed} 個")

        if dry:
            self.stdout.write(self.style.WARNING("dry-run：未寫入資料庫"))
        else:
            self.stdout.write(self.style.SUCCESS("分類同步完成"))
