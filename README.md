# 世界聲音百科

世界樂器・人聲歌唱・音樂文化 — 循著聲音，走進不同文化的現場。

🌐 **網站：** <https://soundweavers-music.github.io/>

## 專案簡介

世界聲音百科是一個整合型音樂知識平台，涵蓋四大面向：

- **🌍 世界樂器** — 833 件樂器的詳細資料，包含 Hornbostel–Sachs 分類、國家／地區、發聲原理、圖片、YouTube 示範影片。每一筆都經英文維基、中文維基、Wikidata 交叉查證（805 已查證、20 部分欄位待補、8 標記為來源不足）
- **🎤 人聲與歌唱** — 系統化的流行歌唱教學，初階 15 堂 + 進階 35 堂 + 研究專欄 5 篇
- **🎼 樂理基礎** — 譜號、節拍、拍號、音調、音域、發聲原理
- **🎚️ 錄音後製** — 錄音技術、混音觀念、宅錄設備指南（即將上線）

## 網站功能

- **入口首頁** — 六大功能卡的入口網站風格導覽
- **世界樂器**
  - 分類瀏覽、篩選搜尋（分類／國家／年代／發聲原理）
  - 地圖導覽（Leaflet + OpenStreetMap）
  - 全文即時搜尋（中文名、原文名、分類、國家、年代）
  - 熱門／冷門／隨選樂器
- **人聲與歌唱**
  - 分頁式課程列表（初階篇／進階篇／研究專欄）
  - 個別章節閱讀頁面，支援上下章導航
  - 研究專欄（聲學分析文章）
- **樂理基礎** — 可捲動的完整教材頁面，含快速導覽錨點
- **聯絡我們** — LINE 官方帳號、Email、YouTube 頻道
- **管理後台** — Excel 匯出／匯入
- **響應式設計** — 支援手機與平板瀏覽

## 導覽結構

```
首頁（入口網站）
├── 🌍 世界樂器
│   ├── 全部樂器（篩選瀏覽／分類卡片）
│   ├── 分類
│   ├── 隨選
│   ├── 熱門
│   ├── 冷門
│   ├── 國家
│   ├── 年代
│   └── 地圖
├── 🎤 人聲與歌唱
│   ├── 🌱 初階篇（15 堂）
│   ├── 🌲 進階篇（35 堂）
│   └── 🔬 研究專欄（5 篇）
├── 🎼 樂理基礎
├── ℹ️ 關於
└── ✉️ 聯絡我們
```

## 資料維護

### 世界樂器

樂器資料以 Markdown 檔案維護在 `content/instruments/` 目錄下，每個檔案使用 front matter 定義中繼資料：

```markdown
---
class_code: A1                       # A1 氣鳴／A2 弦鳴／A3 體鳴·膜鳴／A4 電鳴
frontend_class: 吹奏與氣息樂器
subcategory: 風箱與自由簧
title_zh: 手風琴
title_original: Accordion
sound_hs: 氣鳴｜412.132              # Hornbostel–Sachs
region_culture: 歐洲／德國／奧地利
verification_status: 已查證
issue_note: 分類查證：氣鳴（412.132）；依據：…  # 來源與修正理由
image: "https://upload.wikimedia.org/..."
youtube_ids: abc123def45
---
```

`verification_status` 的三種值是 `已查證`、`已查證（部分欄位待補）`、`待考（來源不足）`；
最後一類的內文段落會以「※本段來源不足」標示，不會以臆測內容充數。

### 資料查證流程

`scripts/` 底下有一組可重跑的證據管線（詳見各檔開頭說明）：

```text
verify_instruments.py      # 四來源證據（enwiki/zhwiki/Wikidata/infobox）
resolve_missing_pages.py   # 補標題變體與搜尋
fetch_source_text.py       # 全文快取，供內文重寫引用
adjudicate_instruments.py  # 三個視角獨立裁決，Python 多數決
rewrite_instruments.py     # 依來源逐段重寫，無來源則標記待補
apply_rewrites.py          # 唯一寫入 content/ 的腳本（會備份）
factcheck_rewrites.py      # 對已發布內文做獨立事實查核
```

中間產物在 `work/`（已 gitignore），可中斷續跑。

### 人聲與歌唱

歌唱教學章節以 Markdown 檔案維護在 `content/vocal/` 目錄下：

```text
content/vocal/
├── vocal_ch1.md    # 初階 第 1 章
├── vocal_ch2.md    # 初階 第 2 章
├── ...
├── vocal_ch15.md   # 初階 第 15 章
├── vocal_ch16.md   # 進階 第 16 章
├── ...
├── vocal_ch20.md   # 進階 第 20 章
└── 人聲共鳴聲學分析研究.md  # 研究專欄
```

## 本機建置

### 前置需求

- Python 3.12+
- pip

### 安裝與建置

```bash
pip install Markdown openpyxl bleach
python scripts/build_static_site.py    # 主站（樂器、樂理、關於）
python scripts/build_vocal_extra.py    # 後處理（首頁、人聲、聯絡）
```

靜態網站輸出至：

```text
outputs/world-instruments-static/
```

### 本機預覽

```bash
cd outputs/world-instruments-static
python -m http.server 8001
```

開啟瀏覽器前往 `http://127.0.0.1:8001/`。

## 部署

靜態網站透過 GitHub Actions 自動部署。推送到 `main` 分支後，workflow 會自動執行：

1. 安裝相依套件（Markdown, openpyxl, bleach）
2. 執行 `scripts/build_static_site.py`
3. 執行 `scripts/build_vocal_extra.py`
4. 上傳成品至 GitHub Pages

若需手動部署：

```bash
pip install Markdown openpyxl bleach
python scripts/build_static_site.py
python scripts/build_vocal_extra.py
cp -r outputs/world-instruments-static/* path/to/deploy-dir/
cd path/to/deploy-dir
git add -A
git commit -m "Deploy static site"
git push origin HEAD:main
```

## SEO 設定

所有頁面自動包含：
- **meta description** — 每頁獨立的描述文字
- **Open Graph 標籤** — og:title, og:description, og:image, og:type
- **canonical URL** — 避免重複內容
- **JSON-LD 結構化資料** — WebSite Schema
- **Sitemap** — 自動產生並在 robots.txt 引用
- **CSP 標頭** — Content-Security-Policy 安全設定

## 技術棧

- **靜態站生成：** Python + Markdown 套件 + Bleach（HTML 淨化）
- **樣式：** 原生 CSS（無框架）
- **地圖：** Leaflet + OpenStreetMap
- **影片：** YouTube nocookie 嵌入
- **字型：** 系統字型（Noto Sans TC）
- **圖示：** 純文字與 Unicode 符號
- **部署：** GitHub Pages + GitHub Actions
- **分析：** 不蒜子（Busuanzi）輕量訪客計數

## 授權

- 網站程式碼：MIT License（見 `LICENSE`）
- 樂器資料與說明文字：CC BY-SA 4.0 — 內文改寫自 Wikipedia／Wikidata，依其授權條款使用
- 圖片：各圖片來源不一，請參照各頁面標示之來源

## 視覺設計

樣式分兩層：`scripts/build_static_site.py` 內產生的 `site.css`（既有規則），
以及 `assets/site-refresh.css`（設計層，可直接修改）。方向為
Minimalism & Swiss Style：襯線標題、紙色底、單一重點色、細線網格卡片。
兩支建置腳本都會讀取它，改樣式只需動 `site-refresh.css`。

## 回饋

有任何建議或發現資料錯誤，歡迎透過以下方式告訴我們：

- 💬 [LINE 官方帳號](https://line.me/R/ti/p/@971xnxql)
- ✉️ <a href="mailto:nextdoor20250726@gmail.com">nextdoor20250726@gmail.com</a>
