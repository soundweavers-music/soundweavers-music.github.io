# 世界樂器百科

收錄來自世界各地的傳統與現代樂器，探索人類音樂的多元面貌。

🌐 **網站：** <https://soundweavers-music.github.io/>

## 專案簡介

世界樂器百科是一個靜態網站，收錄 912 件世界樂器的詳細資料，包含分類、國家／地區、年代、發聲原理、圖片、YouTube 示範影片等內容。每件樂器都有獨立的介紹頁面，可透過分類瀏覽、篩選搜尋、地圖導覽等方式探索。

## 網站功能

- **首頁篩選瀏覽** — 透過分類、國家、年代、發聲原理篩選樂器
- **分類卡片瀏覽** — 以分類為單位瀏覽樂器
- **地圖導覽** — 以 Leaflet 地圖標記各國樂器分布
- **全文搜尋** — 即時搜尋中文名、原文名、分類、國家、年代
- **分頁導覽**  — 全部樂器、分類、國家、年代、熱門、冷門
- **樂理基礎** — 譜號、節拍、拍號、音調、音域、發聲原理
- **隨選樂器** — 隨機推薦樂器
- **LINE 回饋機器人** — 透過 LINE 送出建議
- **響應式設計** — 支援手機與平板瀏覽

## 導覽結構

```
全部樂器
├── 分類
├── 隨選
├── 熱門
├── 冷門
├── 國家
├── 年代
└── 地圖
樂理
關於
```

## 資料維護

所有樂器資料以 Markdown 檔案維護在 `content/instruments/` 目錄下：

```text
content/instruments/
├── accordion.md
├── piano.md
└── ...
```

每個檔案使用 front matter 定義中繼資料：

```markdown
---
title: "手風琴"
original_name: "Accordion"
category: "管樂器"
country: "待考"
era: "傳統／年代待考"
sound_class: "氣鳴樂器"
image: "https://upload.wikimedia.org/..."
youtube_ids: "abc123def45"
---
```

## 本機建置

### 前置需求

- Python 3.12+
- pip

### 安裝與建置

```bash
pip install Markdown openpyxl
python scripts/build_static_site.py
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

1. 安裝相依套件
2. 執行 `scripts/build_static_site.py`
3. 上傳成品至 GitHub Pages

若需手動部署到 `gh-pages` 分支：

```bash
python scripts/build_static_site.py
git worktree add ../gh-pages-deploy origin/gh-pages
cp -r outputs/world-instruments-static/* ../gh-pages-deploy/
cd ../gh-pages-deploy
git add -A
git commit -m "Deploy static site"
git push origin HEAD:gh-pages
```

## 從 Django 匯出資料

專案最初使用 Django + SQLite 管理資料，現已轉為純 Markdown 靜態站。若需從 Django 資料庫重新匯出 Markdown：

```bash
pip install -r requirements.txt
python manage.py migrate
python scripts/export_markdown_from_db.py
```

Django 後台與 SQLite 資料庫視為舊版匯入工具，不再是內容維護的必要條件。

## 技術棧

- **靜態站生成：** Python + Markdown 套件
- **樣式：** 原生 CSS（無框架）
- **地圖：** Leaflet + OpenStreetMap
- **影片：** YouTube nocookie 嵌入
- **字型：** 系統字型（Noto Sans TC）
- **圖示：** 純文字與 Unicode 符號
- **部署：** GitHub Pages + GitHub Actions

## 授權

- 網站程式碼：MIT License
- 樂器資料與說明文字：CC BY-SA（部分內容引用自 Wikipedia，依其授權條款使用）
- 圖片：各圖片來源不一，請參照各頁面標示之來源

## 回饋

有任何建議或發現資料錯誤，歡迎透過 LINE 官方帳號或 email 告訴我們：

<a href="https://line.me/R/ti/p/@971xnxql" target="_blank" rel="noopener">💬 透過 LINE 送出回饋</a>

✉️ <a href="mailto:nextdoor20250726@gmail.com">nextdoor20250726@gmail.com</a>
