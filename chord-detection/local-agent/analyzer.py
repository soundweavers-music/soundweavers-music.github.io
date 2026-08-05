#!/usr/bin/env python3
"""
自動抓和弦 — 本地運算代理
使用 librosa 進行專業級音訊分析，提供 REST API 供瀏覽器呼叫。

API:
  GET  /health          → {"status":"ok"}
  POST /analyze         → 接收音檔，回傳 JSON 分析結果
"""
from __future__ import annotations

import io
import json
import sys
import tempfile
import traceback
from argparse import ArgumentParser
from pathlib import Path
from typing import Any

import numpy as np

try:
    import librosa
except ImportError:
    print("需要安裝 librosa: pip install librosa", file=sys.stderr)
    sys.exit(1)

from flask import Flask, jsonify, request
from waitress import serve

# ── 常數 ──────────────────────────────────────────────────────────────────
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# 和弦模板（音程向量：12 個半音, 1=有此音）
CHORD_TEMPLATES: dict[str, list[int]] = {
    'maj':   [1,0,0,0,1,0,0,1,0,0,0,0],
    'm':     [1,0,0,1,0,0,0,1,0,0,0,0],
    '7':     [1,0,0,0,1,0,0,1,0,0,1,0],
    'maj7':  [1,0,0,0,1,0,0,1,0,0,0,1],
    'm7':    [1,0,0,1,0,0,0,1,0,0,1,0],
    'dim':   [1,0,0,1,0,0,1,0,0,0,0,0],
    'dim7':  [1,0,0,1,0,0,1,0,0,1,0,0],
    'm7b5':  [1,0,0,1,0,0,1,0,0,0,1,0],
    'aug':   [1,0,0,0,1,0,0,0,1,0,0,0],
    'sus2':  [1,0,1,0,0,0,0,1,0,0,0,0],
    'sus4':  [1,0,0,0,0,1,0,1,0,0,0,0],
    '6':     [1,0,0,0,1,0,0,1,0,1,0,0],
    'm6':    [1,0,0,1,0,0,0,1,0,1,0,0],
    '9':     [1,0,1,0,1,0,0,1,0,0,1,0],
    'm9':    [1,0,1,1,0,0,0,1,0,0,1,0],
    'maj9':  [1,0,1,0,1,0,0,1,0,0,0,1],
}

# 和弦品質顯示標籤
QUALITY_LABELS: dict[str, str] = {
    'maj': '', 'm': 'm', '7': '7', 'maj7': 'maj7', 'm7': 'm7',
    'dim': 'dim', 'dim7': 'dim7', 'm7b5': 'm7b5', 'aug': 'aug',
    'sus2': 'sus2', 'sus4': 'sus4', '6': '6', 'm6': 'm6',
    '9': '9', 'm9': 'm9', 'maj9': 'maj9',
}

# C 大調 / G 大調順階和弦（根音, 品質）
C_DIATONIC: list[tuple[int, str]] = [
    (0, 'maj'), (2, 'm'), (4, 'm'), (5, 'maj'), (7, 'maj'), (9, 'm'), (11, 'dim')
]
G_DIATONIC: list[tuple[int, str]] = [
    (7, 'maj'), (9, 'm'), (11, 'm'), (0, 'maj'), (2, 'maj'), (4, 'm'), (5, 'dim')
]

# ── 應用程式 ──────────────────────────────────────────────────────────────
app = Flask(__name__)

# =========================================================================
# 核心分析函式
# =========================================================================

def analyze_audio(file_bytes: bytes, sr: int = 22050) -> dict[str, Any]:
    """分析音檔，回傳完整分析結果。"""
    # 使用暫存檔讓 librosa 處理各種格式
    suffix = '.wav'
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        y, sr_actual = librosa.load(tmp_path, sr=sr, mono=True)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    duration = float(len(y)) / sr_actual

    # 1. 節拍追蹤
    bpm, beat_frames = librosa.beat.beat_track(y=y, sr=sr_actual, units='time')
    beat_times: list[float] = beat_frames.tolist() if hasattr(beat_frames, 'tolist') else list(beat_frames)

    if len(beat_times) < 4:
        # 節拍太少，用等間隔 BPM 推測
        bpm_val = float(bpm) if bpm else 120.0
        interval = 60.0 / bpm_val
        beat_times = list(np.arange(0, duration, interval))
        bpm = float(bpm_val)

    # 2. 分組小節（4 拍一小節）
    bars = _group_into_bars(beat_times, duration)

    # 3. CENS Chroma（每個小節一段）
    hop_length = 512
    chroma_cens = librosa.feature.chroma_cens(y=y, sr=sr_actual, hop_length=hop_length, n_chroma=12)
    times = librosa.frames_to_time(np.arange(chroma_cens.shape[1]), sr=sr_actual, hop_length=hop_length)

    # 4. 每個小節進行和弦偵測
    chords: list[dict[str, Any]] = []
    for bar in bars:
        mask = (times >= bar['start']) & (times < bar['end'])
        if not np.any(mask):
            chords.append({'root': 0, 'quality': 'maj', 'confidence': 0})
            continue
        bar_chroma = chroma_cens[:, mask].mean(axis=1)
        if np.all(bar_chroma == 0):
            chords.append({'root': 0, 'quality': 'maj', 'confidence': 0})
            continue
        result = _match_chord(bar_chroma)
        chords.append(result)

    # 5. HMM 平滑
    chords = _hmm_smooth(chords)

    # 6. 調性偵測
    detected_key = _detect_key(chords)
    key_name = NOTE_NAMES[detected_key]

    # 7. 移調夾建議（映射到 C 或 G 大調）
    capo_c = _suggest_capo(detected_key, target_root=0)   # C 大調
    capo_g = _suggest_capo(detected_key, target_root=7)   # G 大調

    # 選擇 capo 格數較少的方案
    if abs(capo_c['capo']) <= abs(capo_g['capo']):
        capo = capo_c
    else:
        capo = capo_g

    # 8. 轉換和弦到目標調的順階和弦
    display_chords = _transpose_to_diatonic(chords, capo['target_root'])

    return {
        'duration': duration,
        'sampleRate': sr_actual,
        'bpm': round(float(bpm), 1),
        'beats': [round(t, 3) for t in beat_times],
        'bars': bars,
        'detectedKey': int(detected_key),
        'detectedKeyName': key_name,
        'capo': capo,
        'chords': display_chords,
        'rawChords': [{'root': c['root'], 'quality': c['quality'],
                        'confidence': round(c.get('confidence', 0.5), 3)} for c in chords],
    }


def _group_into_bars(beats: list[float], duration: float, beats_per_bar: int = 4) -> list[dict]:
    """將節拍分組為小節。"""
    bars = []
    for i in range(0, len(beats), beats_per_bar):
        group = beats[i:i + beats_per_bar]
        if not group:
            continue
        end = group[-1] + (beats[1] - beats[0] if len(beats) > 1 else 0.5)
        if i + beats_per_bar < len(beats):
            end = min(end, beats[i + beats_per_bar])
        else:
            end = min(end, duration)
        bars.append({
            'start': round(group[0], 3),
            'end': round(end, 3),
            'beats': [round(t, 3) for t in group],
        })
    return bars


def _match_chord(chroma: np.ndarray, top_n: int = 5) -> dict[str, Any]:
    """用模板匹配找最合適的和弦。"""
    best_score = -np.inf
    best_root = 0
    best_qual = 'maj'
    all_scores: list[tuple[float, int, str]] = []

    # 正規化 chroma
    c_sum = np.sum(chroma)
    if c_sum > 0:
        chroma = chroma / c_sum

    for root in range(12):
        for qual, template in CHORD_TEMPLATES.items():
            t = np.array(template, dtype=float)
            t_sum = np.sum(t)
            if t_sum > 0:
                t = t / t_sum
            # 卷積相似度
            shifted = np.roll(chroma, -root)
            score = np.dot(shifted, t)
            # Bonus: C/G 大調順階和弦 +0.05
            in_c = any(r == root and q == qual for r, q in C_DIATONIC)
            in_g = any(r == root and q == qual for r, q in G_DIATONIC)
            if in_c or in_g:
                score += 0.05

            if score > best_score:
                best_score = score
                best_root = root
                best_qual = qual
            all_scores.append((score, root, qual))

    # 找第二高分
    all_scores.sort(key=lambda x: -x[0])
    top = all_scores[:top_n]
    if len(top) >= 2:
        gap = top[0][0] - top[1][0]
        confidence = min(1.0, max(0.1, 0.5 + gap * 2))
    else:
        confidence = 0.5

    return {
        'root': int(best_root),
        'quality': best_qual,
        'confidence': round(float(confidence), 3),
    }


def _hmm_smooth(chords: list[dict], penalty_switch: float = 0.3) -> list[dict]:
    """簡單的 HMM 平滑：若相鄰和弦不同但信心度低，傾向保留前一個和弦。"""
    if not chords:
        return chords

    smoothed = list(chords)
    for i in range(1, len(smoothed)):
        prev = smoothed[i - 1]
        curr = smoothed[i]
        if curr['confidence'] < 0.4:
            # 低信心度 → 繼承前一個和弦
            if prev['confidence'] > 0.3:
                smoothed[i] = dict(prev)
                smoothed[i]['confidence'] = round(smoothed[i]['confidence'] * 0.8, 3)
        elif curr['confidence'] < 0.6:
            # 中等信心度，若跟前一個和弦不同則修正
            if (curr['root'] != prev['root'] or curr['quality'] != prev['quality']):
                # 混合
                if prev['confidence'] > curr['confidence'] + 0.1:
                    smoothed[i] = dict(prev)
                    smoothed[i]['confidence'] = round(smoothed[i]['confidence'] * 0.9, 3)
    return smoothed


def _detect_key(chords: list[dict]) -> int:
    """Krumhansl-Schmuckler 風格調性偵測。"""
    if not chords:
        return 0
    chroma_profile = np.zeros(12)
    for c in chords:
        template = CHORD_TEMPLATES.get(c['quality'], CHORD_TEMPLATES['maj'])
        for i, v in enumerate(template):
            if v:
                chroma_profile[(c['root'] + i) % 12] += 1

    # C major 調性輪廓（Krumhansl 權重）
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    best_key = 0
    best_corr = -np.inf
    for root in range(12):
        shifted = np.roll(chroma_profile, -root)
        corr = np.corrcoef(shifted, major_profile)[0, 1]
        if corr > best_corr:
            best_corr = corr
            best_key = root
    return int(best_key)


def _suggest_capo(detected_key: int, target_root: int = 0) -> dict:
    """計算移調夾建議。"""
    capo = (detected_key - target_root + 12) % 12
    return {
        'capo': int(capo),
        'targetRoot': int(target_root),
        'targetKey': NOTE_NAMES[target_root],
        'description': f'移調夾夾第 {capo} 格，以 {NOTE_NAMES[target_root]} 大調順階和弦彈奏',
    }


def _transpose_to_diatonic(chords: list[dict], target_root: int = 0) -> list[dict]:
    """將和弦映射到目標調的順階和弦。"""
    diatonic = C_DIATONIC if target_root == 0 else G_DIATONIC
    diatonic_roots = {r for r, _ in diatonic}
    diatonic_qual = dict(diatonic)

    result = []
    for c in chords:
        # 移調後根音
        transposed_root = (c['root'] - target_root + 12) % 12
        # 是否在目標調順階內
        if transposed_root in diatonic_roots and c['quality'] in ('maj', 'm', 'dim'):
            # 檢查品質是否匹配
            expected_qual = diatonic_qual.get(transposed_root, 'maj')
            if c['quality'] == expected_qual:
                result.append({
                    'display': NOTE_NAMES[c['root']] + QUALITY_LABELS.get(c['quality'], ''),
                    'root': c['root'],
                    'quality': c['quality'],
                    'confidence': c.get('confidence', 0.5),
                    'isDiatonic': True,
                })
                continue

        # 非順階和弦 → 找最近的順階和弦替代
        best_dist = 999
        best_match = None
        for dr, dq in diatonic:
            # 考慮 capo，計算實際音高
            actual_root_raw = (dr + target_root) % 12
            dist = min((c['root'] - actual_root_raw) % 12, (actual_root_raw - c['root']) % 12)
            # 偏好品質相同
            qual_ok = (c['quality'] == dq)
            effective_dist = dist - (0.5 if qual_ok else 0)
            if effective_dist < best_dist:
                best_dist = effective_dist
                best_match = (actual_root_raw, dq)

        if best_match:
            result.append({
                'display': NOTE_NAMES[best_match[0]] + QUALITY_LABELS.get(best_match[1], ''),
                'root': best_match[0],
                'quality': best_match[1],
                'confidence': max(0.1, c.get('confidence', 0.5) - 0.2 * best_dist),
                'isDiatonic': False,
                'originalChord': NOTE_NAMES[c['root']] + QUALITY_LABELS.get(c['quality'], ''),
            })
        else:
            result.append({
                'display': NOTE_NAMES[c['root']] + QUALITY_LABELS.get(c['quality'], ''),
                'root': c['root'],
                'quality': c['quality'],
                'confidence': c.get('confidence', 0.5),
                'isDiatonic': False,
            })

    return result


# =========================================================================
# Flask Routes
# =========================================================================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'version': '1.0.0'})


@app.route('/analyze', methods=['POST'])
def analyze():
    """接收音檔，回傳分析結果 JSON。"""
    if 'file' not in request.files:
        return jsonify({'error': '缺少 file 欄位'}), 400

    audio_file = request.files['file']
    file_bytes = audio_file.read()

    if not file_bytes or len(file_bytes) < 100:
        return jsonify({'error': '音檔過小或無效'}), 400

    try:
        result = analyze_audio(file_bytes)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'分析失敗：{str(e)}'}), 500


# =========================================================================
# 主程式
# =========================================================================

def main():
    parser = ArgumentParser(description='自動抓和弦 — 本地運算代理')
    parser.add_argument('--host', default='127.0.0.1', help='監聽主機（預設 127.0.0.1）')
    parser.add_argument('--port', type=int, default=8765, help='監聽埠號（預設 8765）')
    args = parser.parse_args()

    print(f'🎹 自動抓和弦本地代理啟動在 http://{args.host}:{args.port}')
    print(f'📋 健康檢查: http://{args.host}:{args.port}/health')
    print(f'🔌 在瀏覽器工具中點擊「連線本地代理」即可使用')
    print(f'   (若無法連線，請檢查防火牆設定)')
    serve(app, host=args.host, port=args.port)


if __name__ == '__main__':
    main()
