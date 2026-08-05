#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate chord fingering markdown files from CHORD_LIBRARY data.

Reads scripts/_chord_library.js and writes content/chord/<instrument>.md
files documenting every validated chord shape — by each chord, with
per-string fret & finger details.

Also generates CHORD_INDEX.md for web page lookup reference.
"""

import json, os, re

# ---- note / quality helpers ----
NOTE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

QUAL_NAME = {
    'maj': '大三和弦', 'm': '小三和弦', '7': '屬七和弦',
    'maj7': '大七和弦', 'm7': '小七和弦', 'aug': '增三和弦',
    'dim': '減三和弦', 'dim7': '減七和弦', 'm7b5': '半減七和弦',
    '6': '大六和弦', 'm6': '小六和弦', '9': '屬九和弦',
    'sus2': '掛留二和弦', 'sus4': '掛留四和弦', 'add9': '加九和弦',
}

QUAL_SUFFIX = {
    'maj': '', 'm': 'm', '7': '7', 'maj7': 'maj7', 'm7': 'm7',
    'aug': 'aug', 'dim': 'dim', 'dim7': 'dim7', 'm7b5': 'm7b5',
    '6': '6', 'm6': 'm6', '9': '9', 'sus2': 'sus2', 'sus4': 'sus4', 'add9': 'add9',
}

QUAL_ORDER = ['maj', 'm', '7', 'maj7', 'm7', '6', 'm6', '9', 'sus2', 'sus4',
              'add9', 'aug', 'dim', 'dim7', 'm7b5']

INSTRUMENT_META = {
    "0": {
        "file": "guitar",
        "name": "吉他 Guitar",
        "tuning_name": "標準調弦 Standard",
        "tuning_notes": ["E4", "B3", "G3", "D3", "A2", "E2"],
        "string_labels": ["第1弦 (E4)", "第2弦 (B3)", "第3弦 (G3)", "第4弦 (D3)", "第5弦 (A2)", "第6弦 (E2)"],
    },
    "2": {
        "file": "ukulele",
        "name": "烏克麗麗 Ukulele",
        "tuning_name": "標準 (高音 GCEA)",
        "tuning_notes": ["A4", "E4", "C4", "G4"],
        "string_labels": ["第1弦 (A4)", "第2弦 (E4)", "第3弦 (C4)", "第4弦 (g4)"],
    },
    "3": {
        "file": "banjo",
        "name": "班卓琴 Banjo",
        "tuning_name": "標準 Open G (5弦)",
        "tuning_notes": ["D4", "B3", "G3", "D3", "G4"],
        "string_labels": ["第1弦 (D4)", "第2弦 (B3)", "第3弦 (G3)", "第4弦 (D3)", "第5弦 (g4)"],
    },
    "4": {
        "file": "mandolin",
        "name": "曼陀林 Mandolin",
        "tuning_name": "標準",
        "tuning_notes": ["E5", "A4", "D4", "G3"],
        "string_labels": ["第1弦 (E5)", "第2弦 (A4)", "第3弦 (D4)", "第4弦 (G3)"],
    },
}

# ── helpers ──────────────────────────────────────────────────────────

def parse_chord_library(js_path):
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()
    m = re.search(r'var\s+CHORD_LIBRARY\s*=\s*(\{.+?\});\s*$', content, re.DOTALL)
    if not m:
        raise ValueError("Could not find CHORD_LIBRARY in JS file")
    return json.loads(m.group(1))


def note_to_midi(n):
    m = re.match(r'^([A-G][♯♭#]?)(\d)$', n)
    if not m:
        raise ValueError(f"Invalid note: {n}")
    name, octave = m.group(1).replace('♯', '#').replace('♭', 'b'), int(m.group(2))
    semitones = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
                 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
                 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
    return semitones.get(name, 0) + (octave + 1) * 12


def fret_symbol(f):
    """Show fret position in a compact readable form."""
    if f == -1:
        return '✕ 悶音'
    elif f == 0:
        return '○ 空弦'
    else:
        return f'第{f}格'


def finger_symbol(f):
    return {0: '—', 1: '食指①', 2: '中指②', 3: '無名指③', 4: '小指④'}.get(f, str(f))


# ── per-instrument markdown ──────────────────────────────────────────

def generate_instrument_md(inst_idx, tuning_data, meta):
    inst = meta[inst_idx]
    base_midi = [note_to_midi(n) for n in inst["tuning_notes"]]
    labels = inst["string_labels"]
    q_rev = {v: k for k, v in QUAL_SUFFIX.items()}  # not really needed; we keep QUAL_SUFFIX

    # Group entries by root_note
    by_root = {}
    for key, entry in tuning_data.items():
        parts = key.split(':')
        root_pc = int(parts[0])
        quality = parts[1]
        by_root.setdefault(root_pc, {})[quality] = entry

    lines = []
    lines.append(f"# {inst['name']} — 和弦指法表")
    lines.append("")
    lines.append(f"> **調弦：{inst['tuning_name']}**")
    lines.append(f"> 各弦音高：{' · '.join(inst['tuning_notes'])}")
    lines.append(f"> 弦序：第1弦（最高音）～ 第{len(labels)}弦（最低音）")
    lines.append("")
    lines.append("本文檔記錄了已驗證的和弦指型資料，每組和弦列出各弦的按格位置、對應手指與發出音名。")
    lines.append("")
    lines.append("---")
    lines.append("")

    for root_pc in range(12):
        root_note = NOTE[root_pc]
        lines.append(f"## {root_note}")
        lines.append("")

        root_data = by_root.get(root_pc, {})
        if not root_data:
            lines.append(f"_{root_note} 調性無收錄指型。_")
            lines.append("")
            continue

        for q in QUAL_ORDER:
            entry = root_data.get(q)
            if entry is None:
                continue

            frets = entry["frets"]
            fingers = entry["fingers"]
            barre = entry.get("barre")

            # Chord name
            suffix = QUAL_SUFFIX.get(q, q)
            chord_name = f"{root_note}{suffix}"
            qual_desc = QUAL_NAME.get(q, q)
            lines.append(f"### {chord_name}（{qual_desc}）")
            lines.append("")

            # Notes sounding
            sounding_notes = []
            note_set = []
            for s, f in enumerate(frets):
                if f >= 0:
                    midi = base_midi[s] + f
                    n = NOTE[midi % 12]
                    sounding_notes.append(n)
                    note_set.append(n)
                else:
                    sounding_notes.append('—')
                    note_set.append('—')
            notes_unique = []
            seen = set()
            for n in sounding_notes:
                if n != '—' and n not in seen:
                    seen.add(n)
                    notes_unique.append(n)
            notes_str = ' · '.join(notes_unique)

            # Barre info
            barre_str = ""
            if barre:
                barre_str = f"封閉：第{barre['from']+1}～{barre['to']+1}弦 第{barre['fret']}格"
            else:
                barre_str = "封閉：無"

            # Table of per-string details
            lines.append(f"**組成音：** {notes_str}")
            lines.append("")
            lines.append(f"| 弦 | 按格 | 手指 | 發音 |")
            lines.append(f"|---|------|------|------|")
            for s in range(len(frets)):
                fret_txt = fret_symbol(frets[s])
                fng_txt = finger_symbol(fingers[s])
                note_txt = sounding_notes[s] if sounding_notes[s] != '—' else '—'
                lines.append(f"| {labels[s]} | {fret_txt} | {fng_txt} | {note_txt} |")

            lines.append("")
            if barre:
                lines.append(f"📌 {barre_str}")
                lines.append("")
            lines.append("")

    lines.append("---")
    lines.append(f"> 資料來源：`scripts/_chord_library.js`")
    lines.append(f"> 最後更新：{__import__('datetime').datetime.now().strftime('%Y-%m-%d')}")
    lines.append("")

    return '\n'.join(lines)


# ── CHORD_INDEX.md ───────────────────────────────────────────────────

def generate_index_md(meta, library):
    lines = []
    lines.append("# 和弦指法資料庫索引 Chord Library Index")
    lines.append("")
    lines.append("網頁可參考此索引及各樂器 `.md` 檔，確認某和弦是否已在資料庫中。")
    lines.append("")
    lines.append("## 收錄樂器")
    lines.append("")

    for inst_idx in sorted(meta.keys()):
        inst = meta[inst_idx]
        tuning_tables = library.get(inst_idx, {}).get(inst['tuning_name'], {})
        total = len(tuning_tables)
        roots = set()
        quals = set()
        for key in tuning_tables:
            parts = key.split(':')
            roots.add(int(parts[0]))
            quals.add(parts[1])

        lines.append(f"- [{inst['name']}]({inst['file']}.md) — {total} 個指型")
        lines.append(f"  - 調弦：{inst['tuning_name']}")
        lines.append(f"  - 收錄根音：{' · '.join(NOTE[r] for r in sorted(roots))}")
        lines.append(f"  - 收錄和弦類型：{' · '.join(sorted(quals))}")
        lines.append("")

    lines.append("## 和弦類型代碼對照")
    lines.append("")
    lines.append("| 代碼 | 中文名稱 | 後綴 |")
    lines.append("|------|---------|------|")
    for q in QUAL_ORDER:
        lines.append(f"| `{q}` | {QUAL_NAME[q]} | {QUAL_SUFFIX[q]} |")
    # Fix last line — I embed the suffix directly
    lines.append("")

    now = __import__('datetime').datetime.now().strftime('%Y-%m-%d')
    lines.append("> 最後更新：{}".format(now))
    lines.append("")

    return '\n'.join(lines)


# ── main ─────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(__file__)
    js_path = os.path.join(script_dir, '_chord_library.js')
    out_dir = os.path.join(os.path.dirname(script_dir), 'content', 'chord')
    os.makedirs(out_dir, exist_ok=True)

    library = parse_chord_library(js_path)

    for inst_idx, meta in INSTRUMENT_META.items():
        fallback = library.get(inst_idx)
        if not fallback:
            print(f"// WARN: no data for instrument {inst_idx}")
            continue
        # The library only has one tuning per instrument in this version
        # First available tuning
        tuning_name = list(fallback.keys())[0]
        tuning_data = fallback[tuning_name]
        # Override tuning_name in meta so it's accurate
        meta['tuning_name'] = tuning_name

        md = generate_instrument_md(inst_idx, tuning_data, INSTRUMENT_META)
        file_path = os.path.join(out_dir, f"{meta['file']}.md")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(md)
        print(f"// wrote {file_path}  ({len(tuning_data)} chords)")

    index_md = generate_index_md(INSTRUMENT_META, library)
    index_path = os.path.join(out_dir, "CHORD_INDEX.md")
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(index_md)
    print(f"// wrote {index_path}")

    # Also write a small lookup JSON that web pages can fetch
    lookup = {}
    for inst_idx, meta in INSTRUMENT_META.items():
        tuning_data = library.get(inst_idx, {}).get(meta['tuning_name'], {})
        keys = set(tuning_data.keys())
        lookup[meta['file']] = sorted(keys)
    json_path = os.path.join(out_dir, "chord_lookup.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(lookup, f, ensure_ascii=False, separators=(',', ':'))
    print(f"// wrote {json_path}")

    print("// Done.")


if __name__ == '__main__':
    main()
