# -*- coding: utf-8 -*-
"""Generate a validated chord-shape library (JS) for the fretboard tool.

Covers Guitar / Ukulele / Banjo / Mandolin in their standard tunings.
Every shape is validated: the pitch classes it actually produces (from the
tuning + fret) must contain the chord's essential tones (root, 3rd, 7th)
and must not contain any note outside the chord. Recognizable open chords
are curated; all remaining root/quality combos are found by a constrained
voicing solver (root in bass preferred, low position, <=4 fingers, span<=3).
"""
import json, itertools

NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# instrument index in INSTRUMENTS_DATA -> (tuning name, base midi per string)
# string order matches the tuning arrays in the tool (index 0 = 1st string).
INSTRUMENTS = {
    0: ("標準調弦 Standard", [64, 59, 55, 50, 45, 40]),      # 吉他 E4 B3 G3 D3 A2 E2
    2: ("標準 (高音 GCEA)", [69, 64, 60, 67]),               # 烏克麗麗 A4 E4 C4 g4
    3: ("標準 Open G (5弦)", [62, 59, 55, 50, 67]),          # 班卓琴 D4 B3 G3 D3 g4
    4: ("標準", [76, 69, 62, 55]),                           # 曼陀林 E5 A4 D4 G3
}
MAX_MUTE = {0: 2, 2: 1, 3: 2, 4: 1}

QUAL = {
    'maj':  {0, 4, 7},
    'm':    {0, 3, 7},
    '7':    {0, 4, 7, 10},
    'maj7': {0, 4, 7, 11},
    'm7':   {0, 3, 7, 10},
}
# tones that MUST appear (5th may be dropped on dominant/minor sevenths)
ESSENTIAL = {
    'maj':  {0, 4, 7},
    'm':    {0, 3, 7},
    '7':    {0, 4, 10},
    'maj7': {0, 4, 11},
    'm7':   {0, 3, 10},
}
QUALITIES = ['maj', 'm', '7', 'maj7', 'm7']

# ---- curated, recognizable open shapes (absolute frets, -1 = mute) ----
# guitar index order: 1st,2nd,3rd,4th,5th,6th
GUITAR_OPEN = {
    (0, 'maj'): [0, 1, 0, 2, 3, -1], (9, 'maj'): [0, 2, 2, 2, 0, -1],
    (7, 'maj'): [3, 0, 0, 0, 2, 3],  (4, 'maj'): [0, 0, 1, 2, 2, 0],
    (2, 'maj'): [2, 3, 2, 0, -1, -1],
    (9, 'm'): [0, 1, 2, 2, 0, -1], (4, 'm'): [0, 0, 0, 2, 2, 0],
    (2, 'm'): [1, 3, 2, 0, -1, -1],
    (0, '7'): [0, 1, 3, 2, 3, -1], (9, '7'): [0, 2, 0, 2, 0, -1],
    (2, '7'): [2, 1, 2, 0, -1, -1], (4, '7'): [0, 0, 1, 0, 2, 0],
    (7, '7'): [1, 0, 0, 0, 2, 3], (11, '7'): [2, 0, 2, 1, 2, -1],
    (0, 'maj7'): [0, 0, 0, 2, 3, -1], (9, 'maj7'): [0, 2, 1, 2, 0, -1],
    (2, 'maj7'): [2, 2, 2, 0, -1, -1], (4, 'maj7'): [0, 0, 1, 1, 2, 0],
    (5, 'maj7'): [0, 1, 2, 3, -1, -1], (7, 'maj7'): [2, 0, 0, 0, 2, 3],
    (9, 'm7'): [0, 1, 0, 2, 0, -1], (4, 'm7'): [0, 0, 0, 0, 2, 0],
    (2, 'm7'): [1, 1, 2, 0, -1, -1],
}
# ukulele index order: 1st(A),2nd(E),3rd(C),4th(g)
UKE_OPEN = {
    (0, 'maj'): [3, 0, 0, 0], (2, 'maj'): [0, 2, 2, 2], (5, 'maj'): [0, 1, 0, 2],
    (7, 'maj'): [2, 3, 2, 0], (9, 'maj'): [0, 0, 1, 2],
    (9, 'm'): [0, 0, 0, 2], (2, 'm'): [0, 1, 2, 2], (4, 'm'): [2, 3, 4, 0],
    (0, '7'): [1, 0, 0, 0], (7, '7'): [2, 1, 2, 0], (9, '7'): [0, 0, 1, 0],
    (0, 'maj7'): [2, 0, 0, 0],
    (9, 'm7'): [0, 0, 0, 0], (2, 'm7'): [3, 1, 2, 2],
}
OVERRIDES = {0: GUITAR_OPEN, 2: UKE_OPEN, 3: {}, 4: {}}

# movable guitar barre templates (relative to barre fret r), index 1st..6th.
# 'x' = muted. E-shape has root on the 6th string; A-shape on the 5th string.
E_SHAPE = {'maj': [0, 0, 1, 2, 2, 0], 'm': [0, 0, 0, 2, 2, 0], '7': [0, 0, 1, 0, 2, 0],
           'maj7': [0, 0, 1, 1, 2, 0], 'm7': [0, 0, 0, 0, 2, 0]}
A_SHAPE = {'maj': [0, 2, 2, 2, 0, 'x'], 'm': [0, 1, 2, 2, 0, 'x'], '7': [0, 2, 0, 2, 0, 'x'],
           'maj7': [0, 2, 1, 2, 0, 'x'], 'm7': [0, 1, 0, 2, 0, 'x']}


def guitar_barre(root, quality):
    """Return the textbook E-/A-shape barre for a root without an open shape."""
    rE = (root - 4) % 12          # root on 6th string (open E = pc 4)
    rA = (root - 9) % 12          # root on 5th string (open A = pc 9)
    cands = []
    if rE > 0:
        cands.append((rE, E_SHAPE[quality]))
    if rA > 0:
        cands.append((rA, A_SHAPE[quality]))
    cands.sort(key=lambda c: c[0])
    r, tmpl = cands[0]
    return [(-1 if off == 'x' else r + off) for off in tmpl]


def played_pcs(frets, base):
    return {(base[s] + f) % 12 for s, f in enumerate(frets) if f >= 0}


def valid_shape(frets, base, root, quality):
    pcs = {(base[s] + f) % 12 for s, f in enumerate(frets) if f >= 0}
    if not pcs:
        return False
    chordset = {(root + i) % 12 for i in QUAL[quality]}
    if not pcs <= chordset:                      # no foreign notes
        return False
    ess = {(root + i) % 12 for i in ESSENTIAL[quality]}
    if not ess <= pcs:                           # all essential tones present
        return False
    return True


def assign_fingers(frets):
    pressed = [(s, f) for s, f in enumerate(frets) if f > 0]
    fingers = [0] * len(frets)
    barre = None
    if not pressed:
        return fingers, barre
    f0 = min(f for _, f in pressed)
    at0 = [s for s, f in pressed if f == f0]
    if len(at0) >= 2:
        barre = {'fret': f0, 'from': min(at0), 'to': max(at0)}
        for s in at0:
            fingers[s] = 1
        rest = sorted([(s, f) for s, f in pressed if f > f0], key=lambda x: (x[1], x[0]))
        fmap, nf = {}, 2
        for s, f in rest:
            if f not in fmap:
                fmap[f] = min(4, nf); nf += 1
            fingers[s] = fmap[f]
    else:
        order = sorted(set(f for _, f in pressed))
        fmap = {fr: min(4, i + 1) for i, fr in enumerate(order)}
        for s, f in pressed:
            fingers[s] = fmap[f]
    return fingers, barre


def fingers_needed(frets):
    pressed = [(s, f) for s, f in enumerate(frets) if f > 0]
    if not pressed:
        return 0
    f0 = min(f for _, f in pressed)
    at0 = [s for s, f in pressed if f == f0]
    barre = len(at0) >= 2
    rest_frets = set(f for _, f in pressed if not (barre and f == f0))
    return (1 if barre else 0) + len(rest_frets)


def solve(base, root, quality, max_mute):
    chordset = {(root + i) % 12 for i in QUAL[quality]}
    n = len(base)
    # per-string candidate frets
    cand = []
    for s in range(n):
        opts = [-1]
        for f in range(0, 13):
            if (base[s] + f) % 12 in chordset:
                opts.append(f)
        cand.append(opts)
    best = None
    for combo in itertools.product(*cand):
        muted = sum(1 for f in combo if f == -1)
        if muted > max_mute or (n - muted) < 3:
            continue
        fretted = [f for f in combo if f > 0]
        if fretted:
            span = max(fretted) - min(fretted)
            if span > 3:
                continue
        else:
            span = 0
        if not valid_shape(list(combo), base, root, quality):
            continue
        if fingers_needed(list(combo)) > 4:
            continue
        sounding = [(base[s] + f) for s, f in enumerate(combo) if f >= 0]
        bass = min(sounding)
        bass_penalty = 0 if bass % 12 == root else 1
        maxfret = max(fretted) if fretted else 0
        open_cnt = sum(1 for f in combo if f == 0)
        score = (bass_penalty, maxfret, muted, span, -open_cnt)
        if best is None or score < best[0]:
            best = (score, list(combo))
    return best[1] if best else None


def build():
    lib = {}
    stats = {}
    for idx, (tuning_name, base) in INSTRUMENTS.items():
        lib[str(idx)] = {tuning_name: {}}
        table = lib[str(idx)][tuning_name]
        n_ok = n_solved = 0
        for root in range(12):
            for q in QUALITIES:
                frets = OVERRIDES[idx].get((root, q))
                if frets is not None:
                    assert valid_shape(frets, base, root, q), \
                        f"BAD OVERRIDE inst{idx} {NOTE[root]}{q}: {frets}"
                elif idx == 0:
                    # guitar: no open shape -> use textbook movable barre
                    frets = guitar_barre(root, q)
                    assert valid_shape(frets, base, root, q), \
                        f"BAD BARRE inst{idx} {NOTE[root]}{q}: {frets}"
                    n_solved += 1
                else:
                    frets = solve(base, root, q, MAX_MUTE[idx])
                    if frets is not None:
                        n_solved += 1
                if frets is None:
                    continue
                fingers, barre = assign_fingers(frets)
                table[f"{root}:{q}"] = {
                    "frets": frets, "fingers": fingers,
                    "barre": barre,
                }
                n_ok += 1
        stats[idx] = (n_ok, n_solved)
    return lib, stats


if __name__ == "__main__":
    lib, stats = build()
    for idx, (ok, solved) in stats.items():
        print(f"// inst {idx}: {ok}/60 shapes ({solved} solved, {ok - solved} curated)")
    js = "var CHORD_LIBRARY = " + json.dumps(lib, ensure_ascii=False, separators=(',', ':')) + ";"
    with open("scripts/_chord_library.js", "w", encoding="utf-8") as fh:
        fh.write(js)
    print("// bytes:", len(js))
