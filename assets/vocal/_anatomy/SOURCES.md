# 解剖底圖來源與授權

`src/` 放的是**原始下載檔，不要直接引用到頁面**；頁面用的是
`scripts/localize_anatomy.py` 產生的中文版（放在 `assets/vocal/`）。

每一張都必須保留出處。CC BY-SA 的檔案是「相同方式分享」，改作後的圖
一樣以 CC BY-SA 釋出；公有領域與 CC0 沒有這個限制，但仍標示來源。

| 檔案 | 來源 | 作者 | 授權 | 用途 |
|---|---|---|---|---|
| `src/larynx-external.svg` | [File:Larynx external en.svg](https://commons.wikimedia.org/wiki/File:Larynx_external_en.svg) | Olek Remesz (Orem) | CC BY-SA 2.5 | 喉部構造（甲狀軟骨、環狀軟骨、環甲肌、氣管） |
| `src/respiratory-system.svg` | [File:Respiratory system complete en.svg](https://commons.wikimedia.org/wiki/File:Respiratory_system_complete_en.svg) | LadyofHats, Jmarchn | Public domain | 呼吸道全圖（鼻腔、咽、喉、氣管、肺、橫膈膜） |
| `src/places-of-articulation.svg` | [File:Places of articulation.svg](https://commons.wikimedia.org/wiki/File:Places_of_articulation.svg) | Wikimedia Commons 社群 | CC BY-SA 4.0 | 口腔側面與構音部位 |
| `src/human-standing.svg` | [File:Silhouette of a standing man.svg](https://commons.wikimedia.org/wiki/File:Silhouette_of_a_standing_man.svg) | Wikimedia Commons 社群 | CC0 | 站姿人形輪廓（`build_vocal_figures.py` 直接內嵌，不經本地化腳本） |

## 重新產生

```bash
python scripts/localize_anatomy.py            # 全部
python scripts/localize_anatomy.py larynx     # 只做一張
python scripts/localize_anatomy.py --check    # 只列出翻譯對照，不寫檔
```

## 待補（Wikimedia CDN 目前 429，稍後再抓）

- `Vocal fold scheme.svg`（CC BY-SA 4.0）— 聲帶俯視
- `Neutral Sagittal Section.svg`（CC0）— 頭頸側剖
- `Mouvement diaphragme respiration.svg`（CC0）— 橫膈膜升降
- `Vocal fold vibration and airflow.svg`（CC BY-SA 4.0）— 聲帶振動氣流
