#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sync a manual chord .md file back into the chord library database.

Usage: python scripts/sync_chord_md.py <instrument_file>

Examples:
  python scripts/sync_chord_md.py guitar    # sync content/chord/guitar.md
  python scripts/sync_chord_md.py mandolin  # sync content/chord/mandolin.md
"""

import json, os, re, sys

# ---- Instrument definitions ----
INSTRUMENTS = {
    "guitar": {
        "idx": "0",
        "tuning": "標準調弦 Standard",
        "file": "guitar.md",
        "base_midi": [64, 59, 55, 50, 45, 40],  # E4 B3 G3 D3 A2 E2
        "name": "吉他 Guitar",
    },
    "ukulele": {
        "idx": "2",
        "tuning": "標準 (高音 GCEA)",
        "file": "ukulele.md",
        "base_midi": [69, 64, 60, 67],  # A4 E4 C4 G4
        "name": "烏克麗麗 Ukulele",
    },
    "banjo": {
        "idx": "3",
        "tuning": "標準 Open G (5弦)",
        "file": "banjo.md",
        "base_midi": [62, 59, 55, 50, 67],  # D4 B3 G3 D3 G4
        "name": "班卓琴 Banjo",
    },
    "mandolin": {
        "idx": "4",
        "tuning": "標準",
        "file": "mandolin.md",
        "base_midi": [76, 69, 62, 55],  # E5 A4 D4 G3
        "name": "曼陀林 Mandolin",
    },
}

NOTE_MAP = {n:i for i,n in enumerate(['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'])}
NOTE_UNICODE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

QUAL_PATTERNS = [
    (r'(.+?)（大三和弦', 'maj'),
    (r'(.+?)（小三和弦', 'm'),
    (r'(.+?)（屬七和弦', '7'),
    (r'(.+?)（大七和弦', 'maj7'),
    (r'(.+?)（小七和弦', 'm7'),
    (r'(.+?)（大六和弦', '6'),
    (r'(.+?)（小六和弦', 'm6'),
    (r'(.+?)（屬九和弦', '9'),
    (r'(.+?)（掛留二和弦', 'sus2'),
    (r'(.+?)（掛留四和弦', 'sus4'),
    (r'(.+?)（加九和弦', 'add9'),
    (r'(.+?)（增三和弦', 'aug'),
    (r'(.+?)（減三和弦', 'dim'),
    (r'(.+?)（減七和弦', 'dim7'),
    (r'(.+?)（半減七和弦', 'm7b5'),
]

QUAL_TONES = {
    'maj': {0, 4, 7}, 'm': {0, 3, 7}, '7': {0, 4, 7, 10},
    'maj7': {0, 4, 7, 11}, 'm7': {0, 3, 7, 10},
    'aug': {0, 4, 8}, 'dim': {0, 3, 6}, 'dim7': {0, 3, 6, 9},
    'm7b5': {0, 3, 6, 10}, '6': {0, 4, 7, 9}, 'm6': {0, 3, 7, 9},
    '9': {0, 4, 7, 10, 2}, 'sus2': {0, 2, 7}, 'sus4': {0, 5, 7},
    'add9': {0, 4, 7, 2},
}
ESSENTIAL = {
    'maj': {0, 4, 7}, 'm': {0, 3, 7}, '7': {0, 4, 10},
    'maj7': {0, 4, 11}, 'm7': {0, 3, 10},
    'aug': {0, 4, 8}, 'dim': {0, 3, 6}, 'dim7': {0, 3, 6, 9},
    'm7b5': {0, 3, 10}, '6': {0, 4, 9}, 'm6': {0, 3, 9},
    '9': {0, 4, 10, 2}, 'sus2': {0, 2, 7}, 'sus4': {0, 5, 7},
    'add9': {0, 4, 2},
}

# ---- helpers ----

def note_to_root(note_str):
    s = note_str.strip()
    s = s.replace('♯', '#').replace('♭', 'b')
    # Check 2-char accidental notes first
    for two_ch in ['C#', 'D#', 'F#', 'G#', 'A#']:
        if s.startswith(two_ch):
            return NOTE_MAP[two_ch]
    # Then 1-char natural notes
    if s[:1] in NOTE_MAP:
        return NOTE_MAP[s[:1]]
    return None

def parse_fret(s):
    s = s.strip()
    if s.startswith('○'):
        return 0
    if s.startswith('✕'):
        return -1
    m = re.match(r'第(\d+)格', s)
    if m:
        return int(m.group(1))
    raise ValueError(f"Cannot parse fret: {s}")

def parse_finger(s):
    s = s.strip()
    if s == '—':
        return 0
    m = re.search(r'(食指|中指|無名指|小指)', s)
    if m:
        return {'食指': 1, '中指': 2, '無名指': 3, '小指': 4}[m.group(1)]
    return 0

def assign_fingers(frets):
    """Auto-assign fingers based on fret positions. Returns (fingers_list, barre_or_None)."""
    n = len(frets)
    fingers = [0] * n
    pressed = [(s, f) for s, f in enumerate(frets) if f > 0]
    if not pressed:
        return fingers, None

    f0 = min(f for _, f in pressed)
    at0 = [s for s, f in pressed if f == f0]

    barre = None
    if len(at0) >= 2:
        lo, hi = min(at0), max(at0)
        valid_barre = all(frets[s] < 0 or frets[s] == f0 for s in range(lo, hi + 1))
        if valid_barre:
            barre = {'fret': f0, 'from': lo, 'to': hi}
            for s in at0:
                fingers[s] = 1
            rest = sorted([(s, f) for s, f in pressed if f > f0], key=lambda x: (x[1], x[0]))
            fmap, nf = {}, 2
            for s, f in rest:
                if f not in fmap:
                    fmap[f] = min(4, nf)
                    nf += 1
                fingers[s] = fmap[f]
            return fingers, barre

    order = sorted(set(f for _, f in pressed))
    fmap = {fr: min(4, i + 1) for i, fr in enumerate(order)}
    for s, f in pressed:
        fingers[s] = fmap[f]
    return fingers, None

# ---- parser ----

def parse_md(filepath, inst_name):
    """Parse an instrument .md file and return {key: {frets, fingers}} dict."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    chords = {}
    sections = re.split(r'^###\s+', content, flags=re.MULTILINE)

    for section in sections:
        if not section.strip():
            continue
        lines = section.strip().split('\n')
        h3_text = lines[0].strip()
        is_complex = '複雜' in h3_text

        matched = False
        for pattern, quality in QUAL_PATTERNS:
            m = re.match(pattern, h3_text)
            if m:
                chord_name = m.group(1).strip()
                matched = True
                break
        if not matched:
            continue

        root_pc = note_to_root(chord_name)
        if root_pc is None:
            continue

        # Find the table in the section
        table_lines = []
        in_table = False
        for line in lines[1:]:
            ls = line.strip()
            if ls.startswith('| 弦 |'):
                in_table = True
                continue
            if in_table and ls.startswith('|---'):
                continue
            if in_table and ls.startswith('|') and ls.endswith('|'):
                table_lines.append(ls)
            elif in_table and not ls.startswith('|') and table_lines:
                break

        if not table_lines:
            continue

        frets = []
        fingers = []
        for row in table_lines:
            cells = [c.strip() for c in row.split('|')[1:-1]]
            if len(cells) >= 3:
                frets.append(parse_fret(cells[1]))
                fingers.append(parse_finger(cells[2]))

        if len(frets) == 0:
            continue

        key = f"{root_pc}:{quality}"
        if is_complex:
            key = f"{root_pc}:{quality}:alt"

        chords[key] = {'frets': frets, 'fingers': fingers}

    # Prefer simple over alt
    final = {}
    for k in chords:
        if not k.endswith(':alt'):
            final[k] = chords[k]
    for k in chords:
        if k.endswith(':alt'):
            base = k[:-4]
            if base not in final:
                final[base] = chords[k]
    return final

# ---- validation ----

def validate(fingerings, inst):
    """Validate chord shapes and assign fingers/barre."""
    base = inst['base_midi']
    result = {}
    for key, entry in fingerings.items():
        frets = entry['frets']
        fingers = entry.get('fingers', [])
        if not fingers or all(f == 0 for f in fingers):
            fingers, barre = assign_fingers(frets)
        else:
            _, barre = assign_fingers(frets)

        parts = key.split(':')
        root_pc = int(parts[0])
        quality = parts[1]

        if quality in QUAL_TONES:
            pcs = {(base[s] + f) % 12 for s, f in enumerate(frets) if f >= 0}
            allowed = {(root_pc + i) % 12 for i in QUAL_TONES[quality]}
            essential = {(root_pc + i) % 12 for i in ESSENTIAL[quality]}

            foreign = pcs - allowed
            missing = essential - pcs
            if foreign:
                print(f"  !! FOREIGN notes {[NOTE_UNICODE[p] for p in foreign]} in {key} — included anyway")
            if missing:
                print(f"  !! MISSING essential {[NOTE_UNICODE[p] for p in missing]} in {key} — included anyway")

        result[key] = {
            "frets": frets,
            "fingers": fingers,
            "barre": barre,
        }
    return result

# ---- database update ----

def update_js_library(js_path, inst, tuning_data):
    """Update the CHORD_LIBRARY in _chord_library.js."""
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()
    m = re.search(r'var\s+CHORD_LIBRARY\s*=\s*(\{.+?\});', content, re.DOTALL)
    if not m:
        raise ValueError("Could not find CHORD_LIBRARY in JS file")
    full_lib = json.loads(m.group(1))
    # Replace this instrument's data
    if inst['idx'] not in full_lib:
        full_lib[inst['idx']] = {}
    full_lib[inst['idx']][inst['tuning']] = tuning_data
    new_js = "var CHORD_LIBRARY = " + json.dumps(full_lib, ensure_ascii=False, separators=(',', ':')) + ";"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(new_js)
    print(f"// Updated {js_path}")
    return full_lib

def update_html(html_path, full_lib):
    """Update the CHORD_LIBRARY in the HTML."""
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()
    lib_json = json.dumps(full_lib, ensure_ascii=False, separators=(',', ':'))
    new_js = f"var CHORD_LIBRARY = {lib_json};"
    content = re.sub(r'var\s+CHORD_LIBRARY\s*=\s*\{.+?\};', new_js, content, count=1, flags=re.DOTALL)
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"// Updated {html_path}")

def update_lookup(lookup_path, inst, tuning_data):
    """Update chord_lookup.json."""
    if os.path.exists(lookup_path):
        with open(lookup_path, 'r', encoding='utf-8') as f:
            lookup = json.load(f)
    else:
        lookup = {}
    lookup[os.path.splitext(inst['file'])[0]] = sorted(tuning_data.keys())
    with open(lookup_path, 'w', encoding='utf-8') as f:
        json.dump(lookup, f, ensure_ascii=False, separators=(',', ':'))
    print(f"// Updated {lookup_path}")

# ---- main ----

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/sync_chord_md.py <instrument>")
        print(f"Available: {', '.join(INSTRUMENTS.keys())}")
        sys.exit(1)

    inst_name = sys.argv[1]
    if inst_name not in INSTRUMENTS:
        print(f"Unknown instrument '{inst_name}'. Available: {', '.join(INSTRUMENTS.keys())}")
        sys.exit(1)

    inst = INSTRUMENTS[inst_name]
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    md_path = os.path.join(repo_root, 'content', 'chord', inst['file'])
    js_path = os.path.join(repo_root, 'scripts', '_chord_library.js')
    html_path = os.path.join(repo_root, 'tools', 'fretboard', 'index.html')
    lookup_path = os.path.join(repo_root, 'content', 'chord', 'chord_lookup.json')

    print(f"=== Syncing {inst['name']} ({inst['file']}) ===")
    print(f"  Parsing {md_path}...")
    fingerings = parse_md(md_path, inst_name)
    print(f"  Found {len(fingerings)} chord entries")

    print(f"  Validating & assigning fingers...")
    tuning_data = validate(fingerings, inst)
    print(f"  {len(tuning_data)} chords ready")

    print(f"  Updating chord library...")
    full_lib = update_js_library(js_path, inst, tuning_data)

    print(f"  Updating HTML...")
    update_html(html_path, full_lib)

    print(f"  Updating chord_lookup.json...")
    update_lookup(lookup_path, inst, tuning_data)

    print(f"=== Done! {inst['name']} synced to database and web page. ===")
    print(f"NOTE: {inst['file']} was kept as-is (your manual edits preserved).")


if __name__ == '__main__':
    main()
