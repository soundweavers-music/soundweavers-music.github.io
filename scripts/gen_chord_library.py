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
# 同一件樂器的其他調弦（工具裡有、也要有指型）。名稱必須跟 INSTRUMENTS_DATA 一字不差。
# 由高音弦排到低音弦，跟 INSTRUMENTS 一致。
# 特殊調弦的常用和弦：照教科書／常見按法直接指定（仍然會驗證組成音）
EXTRA_OVERRIDES = {
    ("Drop D", (2, 'maj')): [2, 3, 2, 0, 0, 0],     # D：000232
    ("Drop D", (2, 'm')):   [1, 3, 2, 0, 0, 0],     # Dm：000231
    ("Drop D", (2, '7')):   [2, 1, 2, 0, 0, 0],     # D7
    ("Drop D", (2, 'sus4')): [3, 3, 2, 0, 0, 0],    # Dsus4
    ("Drop D", (7, 'maj')): [3, 0, 0, 0, 2, 0],     # G：000203（低音 D）
    ("Drop D", (0, 'maj')): [0, 1, 0, 2, 3, -1],    # C：x32010，第 6 弦不彈
    ("Drop D", (9, 'm')):   [0, 1, 2, 2, 0, -1],    # Am
    ("Drop D", (4, 'm')):   [0, 0, 0, 2, 2, -1],    # Em
    ("Drop D", (5, 'maj')): [1, 1, 2, 3, 3, -1],    # F（第 6 弦不彈）
    # Low G 烏克麗麗：Em 用大家熟悉的 0432（A2 E3 C4 g0），不要挑到四格跨度的替代按法
    ("Low G", (4, 'm')):    [2, 3, 4, 0],
}

EXTRA_TUNINGS = {
    0: [
        ("Drop D", [64, 59, 55, 50, 45, 38]),          # E4 B3 G3 D3 A2 D2
        ("Drop C", [62, 57, 53, 48, 43, 36]),          # D4 A3 F3 C3 G2 C2
        ("Open D", [62, 57, 54, 50, 45, 38]),          # D4 A3 F♯3 D3 A2 D2
        ("Open G", [62, 59, 55, 50, 43, 38]),          # D4 B3 G3 D3 G2 D2
        ("Open C", [64, 60, 55, 48, 43, 36]),          # E4 C4 G3 C3 G2 C2
        ("DADGAD", [62, 57, 55, 50, 45, 38]),          # D4 A3 G3 D3 A2 D2
        ("Half-step Down", [63, 58, 54, 49, 44, 39]),   # E♭4 B♭3 G♭3 D♭3 A♭2 E♭2
        ("Full-step Down", [62, 57, 53, 48, 43, 38]),   # D4 A3 F3 C3 G2 D2
        ("Nashville Tuning", [64, 59, 67, 62, 57, 52]), # E4 B3 G4 D4 A3 E3
    ],
    2: [
        ("Low G", [69, 64, 60, 55]),                   # A4 E4 C4 G3
        ("D 調 (ADF♯B)", [71, 66, 62, 69]),            # B4 F♯4 D4 A4
        ("Baritone (DGBE)", [64, 59, 55, 50]),         # E4 B3 G3 D3
    ],
    3: [
        ("Open C", [62, 59, 55, 48, 67]),              # D4 B3 G3 C3 G4
        ("Double C", [62, 60, 55, 48, 67]),            # D4 C4 G3 C3 G4
        ("Double D", [62, 57, 54, 50, 62]),            # D4 A3 F♯3 D3 D4
        ("Sawmill", [62, 60, 55, 50, 67]),             # D4 C4 G3 D3 G4
        ("Irish (4弦)", [62, 59, 55, 50]),             # D4 B3 G3 D3
    ],
    4: [
        ("跨弦標準 (CGDA)", [69, 62, 55, 48]),         # A4 D4 G3 C3
        ("Open G", [74, 67, 62, 55]),                  # D5 G4 D4 G3
    ],
}

MAX_MUTE = {0: 2, 2: 1, 3: 2, 4: 1}

# full chord tones (allowed pitch classes — no note outside this set may sound)
QUAL = {
    'maj':  {0, 4, 7},
    'm':    {0, 3, 7},
    '7':    {0, 4, 7, 10},
    'maj7': {0, 4, 7, 11},
    'm7':   {0, 3, 7, 10},
    'aug':  {0, 4, 8},
    'dim':  {0, 3, 6},
    'dim7': {0, 3, 6, 9},
    'm7b5': {0, 3, 6, 10},
    '6':    {0, 4, 7, 9},
    'm6':   {0, 3, 7, 9},
    '9':    {0, 4, 7, 10, 2},
    'sus2': {0, 2, 7},
    'sus4': {0, 5, 7},
    'add9': {0, 4, 7, 2},
}
# tones that MUST appear (5th may be dropped on 7ths/9ths; matches QDEF in the tool)
ESSENTIAL = {
    'maj':  {0, 4, 7},
    'm':    {0, 3, 7},
    '7':    {0, 4, 10},
    'maj7': {0, 4, 11},
    'm7':   {0, 3, 10},
    'aug':  {0, 4, 8},
    'dim':  {0, 3, 6},
    'dim7': {0, 3, 6, 9},
    'm7b5': {0, 3, 6, 10},   # 半減：b5 是這個和弦的定義音，不能省
    '6':    {0, 4, 9},
    'm6':   {0, 3, 9},
    '9':    {0, 4, 10, 2},
    'sus2': {0, 2, 7},
    'sus4': {0, 5, 7},
    'add9': {0, 4, 2},
}
# core = curated open shapes / guitar barres; the rest are solved (low position).
CORE = ['maj', 'm', '7', 'maj7', 'm7']
QUALITIES = CORE + ['aug', 'dim', 'dim7', 'm7b5', '6', 'm6', '9', 'sus2', 'sus4', 'add9']

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
    # 標準開放把位 6 / m6 / sus4（參考 GUIRAR1.webp 和弦表）
    (0, '6'): [0, 1, 2, 2, 3, -1], (0, 'sus4'): [1, 1, 0, 3, 3, -1],
    (2, '6'): [2, 0, 2, 0, -1, -1], (2, 'm6'): [1, 0, 2, 0, -1, -1],
    (2, 'sus4'): [3, 3, 2, 0, -1, -1],
    (4, '6'): [0, 2, 1, 2, 2, 0], (4, 'm6'): [0, 2, 0, 2, 2, 0],
    (4, 'sus4'): [0, 0, 2, 2, 2, 0],
    (7, '6'): [0, 0, 0, 0, 2, 3], (7, 'm6'): [0, 3, 0, 0, 1, 3],
    (7, 'sus4'): [3, 3, 0, 0, 3, 3],
    (9, '6'): [2, 2, 2, 2, 0, -1], (9, 'm6'): [2, 1, 2, 2, 0, -1],
    (9, 'sus4'): [0, 3, 2, 2, 0, -1],
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
    """把按格換成手指編號（最多 4 指；真的需要橫按時才畫成封閉）。"""
    pressed = [(s, f) for s, f in enumerate(frets) if f > 0]
    fingers = [0] * len(frets)
    barre = None
    if not pressed:
        return fingers, barre

    groups = {}
    for s, f in pressed:
        groups.setdefault(f, []).append(s)
    frets_sorted = sorted(groups)

    # 最低那一格：相鄰的 2~3 條弦用 1、2（、3）；不相鄰或 4 條以上才橫按
    low = frets_sorted[0]
    g0 = sorted(groups[low], reverse=True)
    span = g0[0] - g0[-1] + 1          # 這幾條弦跨過幾個弦位
    nxt = 1
    # 跨 4 個弦位以上（Bm 第 1、5 弦、F 全部）或一次壓 4 條以上才算封閉；
    # 像 D（第 1、3 弦）或 uke G（第 1、3 弦）只是兩根手指，不是封閉。
    if len(g0) >= 4 or span >= 4:
        for s_ in g0:
            fingers[s_] = 1
        barre = {'fret': low, 'from': min(g0), 'to': max(g0)}
        nxt = 2
    else:
        for s_ in g0:
            fingers[s_] = nxt
            nxt += 1
        # Em（只有這一組、兩條相鄰弦）用 1、2 指，跟課程的保留指教法一致
    # 其他格：依序給手指；手指不夠就把那一格橫按
    for f in frets_sorted[1:]:
        strings = sorted(groups[f], reverse=True)
        if nxt + len(strings) - 1 > 4:
            for s_ in strings:
                fingers[s_] = min(4, nxt)
            if len(strings) >= 2:
                barre = {'fret': f, 'from': min(strings), 'to': max(strings)}
            nxt = min(4, nxt) + 1
        else:
            for s_ in strings:
                fingers[s_] = nxt
                nxt += 1
    return fingers, barre


def fingers_ok(frets, fingers, barre):
    """同一根手指用在多條弦時，必須是那一格的橫按，否則這個指型彈不出來。"""
    groups = {}
    for s_, f in enumerate(fingers):
        if f > 0:
            groups.setdefault(f, []).append(s_)
    for f, ss in groups.items():
        if len(ss) > 1:
            same_fret = len({frets[s2] for s2 in ss}) == 1
            if not (barre and same_fret):
                return False
    return True


def fingers_needed(frets):
    pressed = [(s, f) for s, f in enumerate(frets) if f > 0]
    if not pressed:
        return 0
    f0 = min(f for _, f in pressed)
    at0 = [s for s, f in pressed if f == f0]
    barre = len(at0) >= 2
    rest_frets = set(f for _, f in pressed if not (barre and f == f0))
    return (1 if barre else 0) + len(rest_frets)


def solve(base, root, quality, max_mute, mute_first=False):
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
        # 標準調弦：最低把位優先；特殊調弦：先把弦用滿（少悶音），再挑低把位
        score = ((muted, maxfret, span, bass_penalty, -open_cnt) if mute_first
                 else (maxfret, span, muted, bass_penalty, -open_cnt))
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
                elif idx == 0 and q in E_SHAPE:
                    # guitar core qualities: textbook movable E-/A-shape barre
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
                if not fingers_ok(frets, fingers, barre):
                    continue
                table[f"{root}:{q}"] = {
                    "frets": frets, "fingers": fingers,
                    "barre": barre,
                }
                n_ok += 1
        stats[idx] = (n_ok, n_solved)
        # 同一件樂器的其他調弦：一樣逐個和弦求解＋驗證（封閉樣板只適用標準調弦）
        for tuning_name2, base2 in EXTRA_TUNINGS.get(idx, []):
            lib[str(idx)][tuning_name2] = {}
            table2 = lib[str(idx)][tuning_name2]
            n2 = 0
            for root in range(12):
                for q in QUALITIES:
                    frets = EXTRA_OVERRIDES.get((tuning_name2, (root, q)))
                    if frets is not None:
                        assert valid_shape(frets, base2, root, q),                             f"BAD ALT OVERRIDE {tuning_name2} {NOTE[root]}{q}: {frets}"
                    else:
                        frets = solve(base2, root, q, MAX_MUTE[idx], mute_first=True)
                    if frets is None:
                        continue
                    assert valid_shape(frets, base2, root, q),                         f"BAD ALT inst{idx} {tuning_name2} {NOTE[root]}{q}: {frets}"
                    fingers, barre = assign_fingers(frets)
                    if not fingers_ok(frets, fingers, barre):   # 四根手指按不出來 → 不收
                        continue
                    table2[f"{root}:{q}"] = {"frets": frets, "fingers": fingers, "barre": barre}
                    n2 += 1
            stats[f"{idx}:{tuning_name2}"] = (n2, n2)
    return lib, stats


if __name__ == "__main__":
    lib, stats = build()
    total = 12 * len(QUALITIES)
    for idx, (ok, solved) in stats.items():
        print(f"// inst {idx}: {ok}/{total} shapes ({solved} barre/curated core, {ok - solved} solved/ext)")
    js = "var CHORD_LIBRARY = " + json.dumps(lib, ensure_ascii=False, separators=(',', ':')) + ";"
    with open("scripts/_chord_library.js", "w", encoding="utf-8") as fh:
        fh.write(js)
    print("// bytes:", len(js))
