#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Parse mandolin.md and update chord library data for Mandolin (inst index 4).

Then re-writes _chord_library.js, gen_chord_library.py overrides,
and the embedded chord data in tools/fretboard/index.html.
"""

import json, os, re, sys

NOTE_MAP = {n:i for i,n in enumerate(['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'])}
NOTE_UNICODE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

# Quality detection patterns from h3 text
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

# String labels per instrument in order 1st..last
INST_STRINGS = {
    'mandolin': ['第1弦', '第2弦', '第3弦', '第4弦'],
}

def note_to_root(note_str):
    """Extract root PC from chord name like 'C', 'Cm', 'C♯', 'C♯m', etc."""
    # Use Unicode codepoints to avoid encoding issues
    s = note_str.strip()
    s = s.replace('♯', '#').replace('♭', 'b')  # normalize Unicode sharps/flats
    # Handle the case where .md might use different sharp/flat characters
    # Check known 2-char accidental notes first
    for two_ch in ['C#', 'D#', 'F#', 'G#', 'A#']:
        if s.startswith(two_ch):
            return NOTE_MAP[two_ch]
    # Then 1-char natural notes
    if s[:1] in NOTE_MAP:
        return NOTE_MAP[s[:1]]
    return None


def parse_fret(s):
    """Parse '○ 空弦' → 0, '✕ 悶音' → -1, '第3格' → 3"""
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
    """Parse '—' → 0, '食指①' → 1, etc."""
    s = s.strip()
    if s == '—':
        return 0
    m = re.search(r'(食指|中指|無名指|小指)', s)
    if m:
        return {'食指': 1, '中指': 2, '無名指': 3, '小指': 4}[m.group(1)]
    return 0


def parse_mandolin_md(filepath):
    """Parse mandolin.md and extract all chord shapes.

    Returns: dict mapping "root_pc:quality" → {"frets": [...], "fingers": [...]}
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    chords = {}
    # Split by h3 headings (###)
    # Each section starts with ### name and contains a table
    sections = re.split(r'^###\s+', content, flags=re.MULTILINE)

    for section in sections:
        if not section.strip():
            continue

        lines = section.strip().split('\n')
        h3_text = lines[0].strip()

        # Determine if this is a complex variant
        is_complex = '複雜' in h3_text

        # Extract chord name and quality
        matched = False
        for pattern, quality in QUAL_PATTERNS:
            m = re.match(pattern, h3_text)
            if m:
                chord_name = m.group(1).strip()
                matched = True
                break

        if not matched:
            continue

        # Extract root note from chord name
        # note_to_root handles accidental stripping internally
        root_pc = note_to_root(chord_name)
        if root_pc is None:
            print(f"  WARN: cannot parse root from '{chord_name}' (h3: {h3_text})")
            continue

        # Find the table in the section
        table_lines = []
        in_table = False
        for line in lines[1:]:
            if line.strip().startswith('| 弦 |'):
                in_table = True
                continue
            if in_table and line.strip().startswith('|---'):
                continue
            if in_table:
                if line.strip().startswith('|') and line.strip().endswith('|'):
                    table_lines.append(line.strip())
                elif line.strip() == '' and table_lines:
                    break
                elif not line.strip().startswith('|') and table_lines:
                    break

        if not table_lines:
            print(f"  WARN: no table found for {chord_name}")
            continue

        # Parse table rows
        frets = []
        fingers = []
        string_idx = 0
        for row in table_lines:
            cells = [c.strip() for c in row.split('|')[1:-1]]
            # Expected: [弦, 按格, 手指, 發音]
            if len(cells) >= 3:
                f = parse_fret(cells[1])
                fn = parse_finger(cells[2])
                frets.append(f)
                fingers.append(fn)
                string_idx += 1

        if len(frets) == 0:
            continue

        key = f"{root_pc}:{quality}"
        if is_complex:
            key = f"{root_pc}:{quality}:alt"

        chords[key] = {
            'frets': frets,
            'fingers': fingers,
        }
        # print(f"  {key:20s} -> {frets}  fingers={fingers}")  # debug

    # For keys with both simple and alt, prefer simple
    final = {}
    simple_keys = set()
    alt_keys = set()
    for k in chords:
        if k.endswith(':alt'):
            alt_keys.add(k)
        else:
            simple_keys.add(k)

    for k in simple_keys:
        final[k] = chords[k]

    for k in alt_keys:
        base = k[:-4]  # remove :alt
        if base not in final:
            final[base] = chords[k]
        # else: keep the simple version

    return final


def validate_chord_shape(frets, base_midi, root_pc, quality):
    """Validate that the chord shape produces the right notes."""
    NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
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
    if quality not in QUAL_TONES:
        return True  # skip validation for unknown

    pcs = set()
    for s, f in enumerate(frets):
        if f >= 0:
            pcs.add((base_midi[s] + f) % 12)

    allowed = {(root_pc + i) % 12 for i in QUAL_TONES[quality]}
    essential = {(root_pc + i) % 12 for i in ESSENTIAL[quality]}

    # Check no foreign notes
    foreign = pcs - allowed
    if foreign:
        print(f"    !! FOREIGN notes: {[NOTE[p] for p in foreign]}")
        return False

    # Check essential tones
    missing = essential - pcs
    if missing:
        print(f"    !! MISSING essential: {[NOTE[p] for p in missing]}")
        return False

    return True


def assign_fingers_for_shape(frets):
    """Auto-assign fingers based on fret positions (same logic as gen_chord_library.py)."""
    n = len(frets)
    fingers = [0] * n
    pressed = [(s, f) for s, f in enumerate(frets) if f > 0]
    if not pressed:
        return fingers, None

    f0 = min(f for _, f in pressed)
    at0 = [s for s, f in pressed if f == f0]

    # Check for barre: at least 2 adjacent strings at same fret
    barre = None
    if len(at0) >= 2:
        lo, hi = min(at0), max(at0)
        # Ensure every string between them is either pressed at f0 or muted
        valid_barre = True
        for s in range(lo, hi + 1):
            if frets[s] >= 0 and frets[s] != f0:
                valid_barre = False
                break
        if valid_barre:
            barre = {'fret': f0, 'from': lo, 'to': hi}
            for s in at0:
                fingers[s] = 1
            # Assign remaining fingers
            rest = sorted([(s, f) for s, f in pressed if f > f0],
                          key=lambda x: (x[1], x[0]))
            fmap, nf = {}, 2
            for s, f in rest:
                if f not in fmap:
                    fmap[f] = min(4, nf)
                    nf += 1
                fingers[s] = fmap[f]
            return fingers, barre

    # No barre: assign by fret order
    order = sorted(set(f for _, f in pressed))
    fmap = {fr: min(4, i + 1) for i, fr in enumerate(order)}
    for s, f in pressed:
        fingers[s] = fmap[f]
    return fingers, None


def update_chord_library(fingerings, base_midi):
    """Build the tuning_data dict in CHORD_LIBRARY format."""
    tuning_data = {}
    for key, entry in fingerings.items():
        if key.endswith(':alt'):
            continue  # skip alt variants, use simple versions only
        frets = entry['frets']
        fingers = entry.get('fingers')
        barre = None
        if not fingers or all(f == 0 for f in fingers):
            fingers, barre = assign_fingers_for_shape(frets)

        # Validate
        parts = key.split(':')
        root_pc = int(parts[0])
        quality = parts[1]
        valid = validate_chord_shape(frets, base_midi, root_pc, quality)
        if not valid:
            print(f"  !! INVALID: {key} — will still include but check the notes")

        tuning_data[key] = {
            "frets": frets,
            "fingers": fingers,
            "barre": barre,
        }
    return tuning_data


def update_js_library(js_path, new_mandolin_data):
    """Update the CHORD_LIBRARY JavaScript variable with new mandolin data."""
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the CHORD_LIBRARY object
    m = re.search(r'var\s+CHORD_LIBRARY\s*=\s*(\{.+?\});', content, re.DOTALL)
    if not m:
        raise ValueError("Could not find CHORD_LIBRARY in JS file")

    full_lib = json.loads(m.group(1))

    # Replace instrument 4 (mandolin)
    # but keep the tuning key structure: full_lib["4"] = {"標準": {...}}
    full_lib["4"] = {"標準": new_mandolin_data}

    # Convert back to JS
    new_js = "var CHORD_LIBRARY = " + json.dumps(full_lib, ensure_ascii=False, separators=(',', ':')) + ";"

    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(new_js)
    print(f"// Updated {js_path}")

    return full_lib


def update_html_chord_library(html_path, full_lib):
    """Update the embedded CHORD_LIBRARY in the HTML file."""
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()

    lib_json = json.dumps(full_lib, ensure_ascii=False, separators=(',', ':'))
    new_js = f"var CHORD_LIBRARY = {lib_json};"

    # Replace the CHORD_LIBRARY declaration
    content = re.sub(
        r'var\s+CHORD_LIBRARY\s*=\s*\{.+?\};',
        new_js,
        content,
        count=1,
        flags=re.DOTALL
    )

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"// Updated {html_path}")


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    md_path = os.path.join(repo_root, 'content', 'chord', 'mandolin.md')
    js_path = os.path.join(repo_root, 'scripts', '_chord_library.js')
    html_path = os.path.join(repo_root, 'tools', 'fretboard', 'index.html')

    if not os.path.exists(md_path):
        print(f"ERROR: {md_path} not found")
        sys.exit(1)

    print("=== Step 1: Parse mandolin.md ===")
    fingerings = parse_mandolin_md(md_path)
    print(f"\nTotal unique chords parsed: {len(fingerings)}")

    # Mandolin standard tuning base MIDI: E5, A4, D4, G3
    # E5 = 76, A4 = 69, D4 = 62, G3 = 55
    base_midi = [76, 69, 62, 55]

    print("\n=== Step 2: Build library format ===")
    tuning_data = update_chord_library(fingerings, base_midi)
    print(f"Library entries: {len(tuning_data)}")

    print("\n=== Step 3: Update _chord_library.js ===")
    full_lib = update_js_library(js_path, tuning_data)

    print("\n=== Step 3b: Update chord_lookup.json ===")
    lookup_path = os.path.join(repo_root, 'content', 'chord', 'chord_lookup.json')
    if os.path.exists(lookup_path):
        with open(lookup_path, 'r', encoding='utf-8') as f:
            lookup = json.load(f)
    else:
        lookup = {}
    lookup['mandolin'] = sorted(tuning_data.keys())
    with open(lookup_path, 'w', encoding='utf-8') as f:
        json.dump(lookup, f, ensure_ascii=False, separators=(',', ':'))
    print(f"// Updated {lookup_path}")

    print("\n=== Step 4: Update tools/fretboard/index.html ===")
    update_html_chord_library(html_path, full_lib)

    # Note: NOT re-generating .md files because the user manually edited mandolin.md.
    # The .md files stay as-is; only the JS/HTML data is updated.
    print("\n=== Done! (mandolin.md kept as-is) ===")


if __name__ == '__main__':
    main()
