# 自動抓和弦 — 本地運算代理

使用電腦的 CPU 進行專業級音訊分析，結果即時回傳給瀏覽器顯示。

## 安裝

```bash
# 需要 Python 3.9+
pip install -r requirements.txt
```

## 啟動

```bash
python analyzer.py
```

預設起動在 `http://127.0.0.1:8765`

## 使用

1. 啟動本伺服器
2. 打開瀏覽器中的「自動抓和弦」工具
3. 在工具中點擊「本地代理」→「連線」按鈕
4. 上傳音檔後，工具會自動詢問是否使用本地代理分析
5. 也可以手動切換分析模式

## 如何運作

```
瀏覽器 ──POST 音檔──→ Python (librosa) ──分析──→ JSON 結果 ──→ 瀏覽器顯示
```

本地代理使用 **librosa** 進行：
- 節拍追蹤（DBN 動態規劃）
- 和弦辨識（CENS chroma + 模板匹配 + HMM）
- 調性偵測（Krumhansl-Schmuckler 演算法）
- 移調夾建議（映射至 C / G 大調順階和弦）

## 進階選項

```bash
python analyzer.py --port 9999     # 自訂埠號
python analyzer.py --host 0.0.0.0  # 允許區域網路連線（請自行注意安全）
```

## 注意事項

- 分析完成後音檔不會被儲存，僅暫存於記憶體中
- 支援格式：MP3, WAV, FLAC, OGG, M4A
- 不支援同時分析多個音檔（單工模式）
