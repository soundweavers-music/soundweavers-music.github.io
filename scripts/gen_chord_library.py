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
    'aug7': {0, 4, 8, 10},
    '7sus4': {0, 5, 7, 10},
    'maj9': {0, 4, 7, 11, 2},
    'm9': {0, 3, 7, 10, 2},
    'madd9': {0, 3, 7, 2},
    '5':    {0, 7},
    '11':   {0, 4, 7, 10, 2, 5},
    '13':   {0, 4, 7, 10, 2, 5, 9},
    'm11':  {0, 3, 7, 10, 2, 5},
    'm13':  {0, 3, 7, 10, 2, 5, 9},
    '69':   {0, 4, 7, 9, 2},
    '7b9':  {0, 4, 7, 10, 1},
    '7#9':  {0, 4, 7, 10, 3},
    '9sus4': {0, 5, 7, 10, 2},
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
    'aug7': {0, 4, 8, 10},
    '7sus4': {0, 5, 10},
    'maj9': {0, 4, 11, 2},
    'm9': {0, 3, 10, 2},
    'madd9': {0, 3, 2},
    '5':    {0, 7},
    '11':   {0, 4, 10, 5},
    '13':   {0, 4, 10, 9},
    'm11':  {0, 3, 10, 5},
    'm13':  {0, 3, 10, 9},
    '69':   {0, 4, 9, 2},
    '7b9':  {0, 4, 10, 1},
    '7#9':  {0, 4, 10, 3},
    '9sus4': {0, 5, 10, 2},
}
# core = curated open shapes / guitar barres; the rest are solved (low position).
CORE = ['maj', 'm', '7', 'maj7', 'm7']
QUALITIES = CORE + ['aug', 'aug7', 'dim', 'dim7', 'm7b5', '6', 'm6',
             '9', 'maj9', 'm9', 'sus2', 'sus4', '7sus4', 'add9', 'madd9',
             '5', '11', '13', 'm11', 'm13', '69', '7b9', '7#9', '9sus4']

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


def valid_shape(frets, base, root, quality, allow=()):
    pcs = {(base[s] + f) % 12 for s, f in enumerate(frets) if f >= 0}
    if not pcs:
        return False
    chordset = {(root + i) % 12 for i in QUAL[quality]} | set(allow)
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


def solve(base, root, quality, max_mute, mute_first=False, window=None, allow=()):
    """找一個合法指型：弦數 ≤6，用深度優先＋及早剪枝（跨度、悶音、音高上限）。"""
    chordset = {(root + i) % 12 for i in QUAL[quality]} | set(allow)
    n = len(base)
    opts = []
    for s_ in range(n):
        lst = [(-1, None)]
        for f in range(0, 9):
            if (base[s_] + f) % 12 in chordset:
                lst.append((f, (base[s_] + f) % 12))
        opts.append(lst)

    best = [None]

    def score_of(combo):
        muted = sum(1 for f in combo if f == -1)
        fretted = [f for f in combo if f > 0]
        span = (max(fretted) - min(fretted)) if fretted else 0
        maxf = max(fretted) if fretted else 0
        sounding = [base[s_] + f for s_, f in enumerate(combo) if f >= 0]
        bass = min(sounding) % 12 if sounding else 0
        bass_penalty = 0 if bass == root % 12 else 1
        open_cnt = sum(1 for f in combo if f == 0)
        if mute_first:
            return (muted, maxf, span, bass_penalty, -open_cnt)
        return (1 if muted else 0, maxf, span, muted, bass_penalty, -open_cnt)

    def dfs(i, combo, muted, mini, maxi):
        if best[0] is not None:
            # 已經有解：用目前的粗略下界提早收手（悶音與最低把位都比最佳差就停）
            pass
        if muted > max_mute or (n - muted) < 3:
            return
        if i == n:
            fretted = [f for f in combo if f > 0]
            span = (max(fretted) - min(fretted)) if fretted else 0
            if span > 3:
                return
            if window and fretted and not (window[0] <= min(fretted) and max(fretted) <= window[1]):
                return
            if not valid_shape(list(combo), base, root, quality, allow):
                return
            if fingers_needed(list(combo)) > 4:
                return
            sc = score_of(combo)
            if best[0] is None or sc < best[0][0]:
                best[0] = (sc, list(combo))
            return
        for f, _pc in opts[i]:
            if f == -1:
                dfs(i + 1, combo + [-1], muted + 1, mini, maxi)
            else:
                if f > 0:
                    nmini = f if mini is None else min(mini, f)
                    nmaxi = f if maxi is None else max(maxi, f)
                    if nmini is not None and nmaxi - nmini > 3:
                        continue
                    dfs(i + 1, combo + [f], muted, nmini, nmaxi)
                else:
                    dfs(i + 1, combo + [0], muted, mini, maxi)

    dfs(0, [], 0, None, None)
    return best[0][1] if best[0] else None


def bass_pc(frets, base):
    """最低音的 pitch class（用來處理 C/E 這種斜線和弦）。"""
    lowest = None
    for i, f in enumerate(frets):
        if f is None or f < 0:
            continue
        midi = base[i] + f          # base 與 frets 都是「第 1 弦在前」
        if lowest is None or midi < lowest:
            lowest = midi
    return None if lowest is None else lowest % 12


def voicings(base, root, quality, max_mute, bass=None, limit=3, mute_first=True):
    """同一個和弦在不同把位的按法（含資料庫原本那一組）。"""
    found, seen = [], set()
    for lo in range(0, 12):
        frets = solve(base, root, quality, max_mute, mute_first=mute_first,
                      window=(lo, lo + 4), allow=((bass,) if bass is not None else ()))
        if frets is None:
            continue
        if bass is not None and bass_pc(frets, base) != bass % 12:
            continue
        key = tuple(frets)
        if key in seen:
            continue
        seen.add(key)
        fingers, barre = assign_fingers(frets)
        if not fingers_ok(frets, fingers, barre):
            continue
        found.append({"frets": frets, "fingers": fingers, "barre": barre})
        if len(found) >= limit:
            break
    return found




def solve_bass(base, root, quality, bass, max_mute, limit=2):
    """斜線和弦：最低音必須是指定低音（用 DFS 一次掃完，收集前幾個）."""
    chordset = {(root + i) % 12 for i in QUAL[quality]} | {bass % 12}
    n = len(base)
    opts = []
    for s_ in range(n):
        lst = []
        for f in range(0, 9):
            if (base[s_] + f) % 12 in chordset:
                lst.append(f)
        opts.append(lst)

    found = []

    def rec(i, combo, muted, mini, maxi):
        if muted > max_mute or (n - muted) < 3:
            return
        if i == n:
            fretted = [f for f in combo if f > 0]
            span = (max(fretted) - min(fretted)) if fretted else 0
            if span > 3:
                return
            if bass_pc(combo, base) != bass % 12:
                return
            if not valid_shape(list(combo), base, root, quality, (bass % 12,)):
                return
            if fingers_needed(list(combo)) > 4:
                return
            fingers, barre = assign_fingers(list(combo))
            if not fingers_ok(list(combo), fingers, barre):
                return
            maxf = max(fretted) if fretted else 0
            score = (1 if muted > 1 else 0, maxf, span)
            if any(c[1] == list(combo) for c in found):
                return
            found.append((score, list(combo), fingers, barre))
            return
        for f in opts[i]:
            if f == 0:
                rec(i + 1, combo + [0], muted, mini, maxi)
                continue
            nmini = f if mini is None else min(mini, f)
            nmaxi = f if maxi is None else max(maxi, f)
            if nmaxi - nmini > 3:
                continue
            rec(i + 1, combo + [f], muted, nmini, nmaxi)
        if muted + 1 <= max_mute:
            rec(i + 1, combo + [-1], muted + 1, mini, maxi)

    rec(0, [], 0, None, None)
    found.sort(key=lambda c: c[0])
    out = []
    for _sc, frets, fingers, barre in found[:limit]:
        out.append({"frets": frets, "fingers": fingers, "barre": barre})
    return out




# ---- 直接從指板工具的 INSTRUMENTS_DATA 讀樂器與調弦（單一真相來源）----
_NOTE_BASE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def note_to_midi(txt: str) -> int:
    """'E4' / 'F♯3' → MIDI 音高。"""
    t = txt.strip().replace('♯', '#').replace('♭', 'b')
    letter = t[0]
    i = 1
    acc = 0
    while i < len(t) and t[i] in '#b':
        acc += 1 if t[i] == '#' else -1
        i += 1
    octv = int(t[i:])
    return (octv + 1) * 12 + _NOTE_BASE[letter] + acc


def load_tool_tunings():
    """回傳 ({instrument_idx: [(tuning_name, [midi from 1st string]), ...]}, {idx: 名稱})。"""
    import json as _json
    import re as _re
    from pathlib import Path as _Path
    path = _Path(__file__).resolve().parent.parent / "tools" / "fretboard" / "index.html"
    if not path.exists():
        return {}, {}
    html = path.read_text(encoding="utf-8")
    m = _re.search(r"INSTRUMENTS_DATA = (\[.*?\]);", html, _re.S)
    if not m:
        return {}, {}
    data = _json.loads(m.group(1))
    out, names = {}, {}
    for idx, inst in enumerate(data):
        names[idx] = inst["name"]
        out[idx] = [(name, [note_to_midi(n) for n in notes])
                    for name, notes in inst["tunings"].items()]
    return out, names


TOOL_TUNINGS, TOOL_INSTRUMENTS = load_tool_tunings()

def max_mute_for(idx, n):
    return {0: 2, 2: 1, 3: 2, 4: 1, 1: 1}.get(idx, 1 if n <= 4 else 2)


def build():
    """為工具裡的每一件樂器、每一種調弦產生和弦指型。

    資料來源是指板頁面的 INSTRUMENTS_DATA（單一真相），所以工具新增樂器或
    調弦，重跑就會自動跟上。第 0～4 號樂器（吉他、貝斯、烏克麗麗、班卓琴、
    曼陀林）另外產生斜線和弦。
    """
    lib, stats = {}, {}
    tunings = TOOL_TUNINGS or {int(k): v for k, v in [
        (idx, [(name, base)]) for idx, (name, base) in INSTRUMENTS.items()]}
    for idx, tuning_list in tunings.items():
        lib[str(idx)] = {}
        max_mute = max_mute_for(idx, len(tuning_list[0][1]) if tuning_list else 6)
        for t_i, (tuning_name, base) in enumerate(tuning_list):
            table = {}
            lib[str(idx)][tuning_name] = table
            n_ok = 0
            for root in range(12):
                for q in QUALITIES:
                    frets = None
                    if t_i == 0:
                        frets = OVERRIDES.get(idx, {}).get((root, q))
                        if frets is not None:
                            assert valid_shape(frets, base, root, q),                                 f"BAD OVERRIDE inst{idx} {NOTE[root]}{q}: {frets}"
                        elif idx == 0 and q in E_SHAPE:
                            frets = guitar_barre(root, q)
                            assert valid_shape(frets, base, root, q),                                 f"BAD BARRE inst{idx} {NOTE[root]}{q}: {frets}"
                    if frets is None:
                        frets = EXTRA_OVERRIDES.get((tuning_name, (root, q)))
                        if frets is not None:
                            assert valid_shape(frets, base, root, q),                                 f"BAD ALT OVERRIDE {tuning_name} {NOTE[root]}{q}: {frets}"
                        else:
                            frets = solve(base, root, q, max_mute, mute_first=(t_i > 0))
                    if frets is None:
                        continue
                    fingers, barre = assign_fingers(frets)
                    if not fingers_ok(frets, fingers, barre):
                        continue
                    entry = {"frets": frets, "fingers": fingers, "barre": barre}
                    alts = []
                    for v in voicings(base, root, q, max_mute, limit=4, mute_first=(t_i > 0)):
                        if v["frets"] == frets or v["frets"] in [a["frets"] for a in alts]:
                            continue
                        alts.append(v)
                        if len(alts) >= 2:
                            break
                    if alts:
                        entry["alts"] = alts
                    table[f"{root}:{q}"] = entry
                    n_ok += 1
            stats[f"{idx}:{tuning_name}"] = (n_ok, n_ok)

        # 斜線和弦：只做前五件常見樂器
        if idx <= 4:
            n_slash = 0
            for tuning_name, base in tuning_list:
                table = lib[str(idx)][tuning_name]
                for root in range(12):
                    for q in ("maj", "m", "7", "m7", "maj7", "9"):
                        tones = {(root + iv) % 12 for iv in QUAL[q]} - {root}
                        if q in ("maj", "m"):
                            tones.add((root + 10) % 12)
                        if q == "maj":
                            tones.add((root + 2) % 12)
                        for b in sorted(tones):
                            vs = solve_bass(base, root, q, b, max_mute, limit=2)
                            if not vs:
                                continue
                            entry = dict(vs[0])
                            if len(vs) > 1:
                                entry["alts"] = vs[1:]
                            table[f"{root}:{q}/{b}"] = entry
                            n_slash += 1
            if n_slash:
                stats[f"{idx}:slash"] = (n_slash, n_slash)
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
    print("// 記得再跑 scripts/sync_fretboard_library.py，把資料同步進指板工具頁面")
