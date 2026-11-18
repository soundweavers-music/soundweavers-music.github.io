# 世界聲音百科 — 交接紀錄（HANDOFF）

最後更新：2026-11-17
線上網址：https://soundweavers-music.github.io/
Repo：soundweavers-music/soundweavers-music.github.io（`main` 推上去就會自動部署）

---

## 1. 內容流程（Content Flow）

```
 content/                       原始內容（Markdown，人工或腳本維護）
 ├─ instruments/*.md            833 件樂器（frontmatter + 各節）
 ├─ sound-journey/              聲音旅圖文章
 ├─ vocal/  digitalmusic/       人聲、錄音後製課程
 ├─ musictheory/                樂理五階段
 ├─ mandolin/NN.md + _index.json   曼陀林 22 章（由 prepare_mandolin.py 產生）
 └─ 曼陀林知識全書/               原稿（docx + 原圖，gitignore，不進 repo）
        │
        │  （一次性／資料維護腳本：fetch_* / enrich_* / verify_* / factcheck_* …）
        │  prepare_mandolin.py   原稿 → content/mandolin + assets/mandolin/img/*.webp
        │  prepare_brand_assets.py   LOGO / banner → assets/brand/
        ▼
 ① scripts/build_static_site.py   清空 outputs/ 後全量建置
        樂器頁、分類／國家／子分類、地圖、聲音旅圖、合奏、關於（/about/、/about/author/）、
        招募（/recruit/）、學習總覽（/learn/）、工具（指版、和弦偵測）、/tools/experience/ 轉址頁、
        sitemap.xml、robots.txt、404
 ② scripts/build_vocal_extra.py   覆寫首頁、聯絡、人聲、錄音後製、樂理、/experience/（世界樂器體驗）
③ scripts/build_ensembles.py     合奏與編制百科 /ensembles/：七類 40 篇（內容在 content/ensembles/）
 ④ scripts/build_mandolin.py      曼陀林專區 /mandolin/ + 22 章
 ⑤ scripts/build_ebook.py         電子書（CI 有裝 LibreOffice）
        ▼
 outputs/world-instruments-static/   ← 真正部署的內容（gitignore）
        ▼
 GitHub Actions（.github/workflows/deploy-github-pages.yml）
   依序跑 ①→④ → upload-pages-artifact → deploy-pages
```

**順序很重要**：① 會 `rmtree` 整個輸出資料夾，② ③ ④ 必須在它之後跑。

本機預覽：

```bash
export PYTHONIOENCODING=utf-8
python scripts/build_static_site.py && python scripts/build_vocal_extra.py && python scripts/build_ensembles.py && python scripts/build_mandolin.py
python -m http.server 8899 --directory outputs/world-instruments-static
# 開 http://127.0.0.1:8899/
```

---

## 2. 重要設計與檔案位置

| 項目 | 位置 | 說明 |
|---|---|---|
| **導覽列／頁尾（唯一來源）** | `build_static_site.py` → `site_header()` / `site_footer()` | 所有頁面都用這兩個函式。`build_vocal_extra.py` 和 `build_mandolin.py` 透過 `_bss()` 匯入使用。改選單只改這裡。 |
| 手寫頁面套用導覽 | `with_site_chrome()` | `tools/fretboard/index.html` 是手寫原始檔，建置時把 header/footer 換成最新版。 |
| Banner 細條 | `site_header()` 末尾的 `.site-banner` | 每頁都有；頁面已有 `.hero-banner`（首頁）或 `.banner-hero`（大 banner 標題）時會自動隱藏。 |
| 大 banner 標題 | `banner_hero()`（build_static_site.py） | 關於、作者、招募、學習頁使用。 |
| 關於分頁 | `about_tabs()` + `ABOUT_TABS` | 關於世界聲音百科／作者／歷年作品（/about/works/）／招募夥伴四個分頁。 |
| 設計樣式 | `assets/site-refresh.css` | 木質色系 tokens（--ink、--paper、--accent、--wood…）。`site.css` 是舊底層，由建置程式產生。 |
| 品牌圖 | `assets/brand/`（logo.png、favicon.png、banner.webp、banner-narrow.webp、author.webp、albums/） | CSS 內的 url 相對於 `/assets/`，例如 `url("brand/banner.webp")`。 |
| 第三方 JS | `assets/vendor/` | Leaflet、SheetJS、JSZip、html2canvas、jsPDF、Meyda 都已改為本站託管，CSP 不再允許任何 CDN。 |
| canonical / og:url | `canonical_for()` | 由輸出路徑算出絕對網址。 |
| 曼陀林建議時數 | `build_mandolin.py` → `study_hours()` | 字數 ÷ 300 字/分 × 各 Part 係數（技法 2.5、專輯 2.0…），以 0.5 小時為單位進位。 |
| 合奏與編制百科 | `content/ensembles/*.md` → `build_ensembles.py` | 七類 40 篇，frontmatter（class/num/title/en/region/summary/keywords）+ 固定七節。B1–B7 分類定義在 `build_static_site.ENSEMBLE_ARCHITECTURE`，改分類只要改那裡。寫作規格見 `content/ensembles/_STYLE.md`。 |
| 合奏條目的影片 | `scripts/fetch_ensemble_videos.py --per-entry 2` | 搜尋並篩選「真的在演這個合奏」的 YouTube 影片（排除教學、改編、器材測試、紀錄片、不可嵌入），寫入 `youtube:` frontmatter。`--set file.md=ID\ ID` 可手動指定。快取在 `work/ensemble_videos.json`。 |
| 人聲教材 | `content/vocal/vocal_ch*.md` → `build_vocal_extra.py` | 50 章，每章五個固定章節（先講結論／常見誤解／原理／現在就做／練完之後）。寫作規格 `content/vocal/_STYLE.md`。示意圖 32 張在 `assets/vocal/*.svg`，由 `scripts/make_vocal_diagrams.py` 產生；`scripts/insert_vocal_figures.py` 負責把圖插到每章「原理」標題下（可重複執行，章節↔圖的對照就在這支腳本裡）。結構檢查 `scripts/audit_vocal.py`，查證 `scripts/verify_vocal_content.py`。 |
| 和弦偵測 | `chord-detection/index.html`（**原始檔**，非產出物） | `build_chord_detection_tool()` 包上站台模板。分析全部在瀏覽器內完成。`local-agent/`（Python 分析器）只留在 repo，**不部署，頁面上也不得再提到它**（見第 4 節 Safe Browsing）。 |
| 歷年作品 | `content/discography.json` → `discography_section()` | `/about/works/` 分頁的專輯牆。資料來自 `content/歷年作品.md`；`apple` 是 Apple Music collectionId，`ytm` 是 YouTube Music 播放清單 id。新增作品後執行 `python scripts/fetch_album_covers.py` 下載封面到 `assets/brand/albums/{apple}.webp`（480px webp，本站託管）。 |
| 世界樂器體驗 | `build_vocal_extra.py` → `/experience/` | 首頁、選單、樂器列表的「世界樂器體驗」都連到這裡。舊網址 `/tools/experience/` 只剩轉址頁。 |

---

## 3. 注意事項（Gotchas）

1. **repo 根目錄那些 html 不是線上網站**。Pages 是從 Actions artifact 部署的；根目錄只是歷史鏡像，方便在 GitHub 上瀏覽。同步時**不要** `rmtree` 根目錄的 `instruments/`，因為裡面有 Django app 的程式碼。
2. 同步根目錄的時候，要跳過 `chord-detection/`、`scripts/`、`fonts/` 與 `tools/fretboard/index.html`；前兩者與指版頁都是**原始檔**。不要 `rmtree` 根目錄的 `tools/`：以前這樣做會把產出物蓋回指版原始檔，每建置一次就多疊一條 banner。`with_site_chrome()` 現在會順便吃掉殘留的 banner。
3. 不要再加回 busuanzi 計數器、LINE 連結或任何外部 CDN。CSP 已經收緊（`script-src 'self'`、`form-action 'self'`）。
4. 新增頁面時，記得同時更新 `build_sitemap()` 裡的靜態 URL 清單。
5. 大型檔案：`fonts/` 內的 CJK 字型約 16.8MB，是首頁最大的負載，之後可以考慮做子集化。
6. Windows 執行時請設定 `PYTHONIOENCODING=utf-8`。

---

## 4. 安全性檢查結果（2026-11）

| 項目 | 處理 |
|---|---|
| 外部 CDN 腳本（cdnjs、unpkg、jsdelivr） | 全部改為 `assets/vendor/` 本站託管；CSP 移除 CDN 來源 |
| 不蒜子 busuanzi 第三方計數器 | 移除 |
| 管理頁前端密碼（atob 明碼，形同虛設） | 移除假的保護，頁面改名「資料下載與轉檔」並設為 noindex |
| 和弦偵測 innerHTML 注入 | 加上 `escapeHtml()` |
| 和弦偵測「本地代理」模式（請訪客安裝 Python 程式、連 localhost:8765） | 整個從頁面移除，CSP `connect-src` 只剩 `'self'`。這種「請下載並執行程式」的模式正是 Safe Browsing 判定社交工程的特徵 |
| local-agent CORS 全開 | 限定本站來源，上傳上限 50MB |
| 外站熱連結圖片（yt3、unsplash、example.com 佔位圖） | 改用本站 banner，佔位圖語法在建置時移除 |
| 舊版殘留頁面（eras/、popular/、uncommon/、sound-classes/、舊分類／國家頁） | 從 repo 移除 366 個不再產生、仍含舊追蹤碼的 html |
| 3.4MB 作者大頭貼 | 改為 42KB 的 `assets/brand/author.webp` |
| LINE 官方帳號 | 聯絡頁、首頁、README、Django 模板全部移除 |

### Google Safe Browsing 警告（2026-11-17）

Chrome 開站顯示「危險網站／可能誘騙你安裝軟體」。查詢 `https://transparencyreport.google.com/safe-browsing/search?url=soundweavers-music.github.io` 確認網站被標記。可能原因是舊版和弦偵測頁請訪客下載並執行本地程式，以及先前的第三方腳本與熱連結；這些都已移除。**程式碼修完不會自動解除，需要人工申請審查**：

1. 登入 [Google Search Console](https://search.google.com/search-console)，選 `https://soundweavers-music.github.io/` 資源（驗證檔 `googled81b331c3a5b66a0.html` 已在根目錄）。
2. 左側「安全性與專人介入處理」→「安全性問題」，查看列出的問題與範例網址。
3. 確認範例網址都已修正後，按「要求審查」，說明：已移除要求訪客下載執行程式的功能與所有第三方腳本。
4. 審查通常需要數天到約兩週。期間可以用上面的透明度報告網址追蹤狀態。

---

## 5. 本次變更紀錄

- 導覽列統一：全站 1362 頁只剩一種 header（先前首頁因為少一個 `</div>`，聲音旅圖、合奏百科會被包進樂器百科的下拉選單）。
- 新增 `/learn/` 學習總覽頁；選單中的「學習」連到此頁，下拉內容為人聲、錄音後製、樂理、曼陀林。
- 曼陀林專區：字數改為「建議學習時數」，含各章、各部分與全書合計（約 28.5 小時）。
- 全站加上 banner；關於、作者、招募、學習、體驗聲音頁使用大 banner 標題。
- 關於頁拆成「關於世界聲音百科」與「作者」兩個分頁，另新增「招募夥伴」頁（音樂詞曲創作、人聲配唱）。
- 聯絡我們：移除 LINE，Email 按鈕改為木質色。
- 首頁新增「招募夥伴」卡片。
- 第 4 節所列的安全性修正。

### 2026-11-17

- 作者頁頭像改為 LOGO（`assets/brand/logo.png`）。
- 新增「歷年作品」分頁（/about/works/，關於選單與分頁列都有）：23 張已發行作品的封面牆，附 Apple Music／YouTube Music 連結，另列 4 張即將發行的作品。
- 招募頁「如何報名」簡化為一句「讀完這些資訊，有意願歡迎來信溝通。」加上 Email 按鈕。
- 修正指版和弦圖頁 banner 重複堆疊（原因見第 3 節第 2 點）。
- 首頁、選單、樂器列表的「體驗聲音」改為「世界樂器體驗」（/experience/），舊 `/tools/experience/` 改為轉址。
- 和弦偵測移除本地代理模式（見第 4 節 Safe Browsing）。
- 工具選單圖示區分：🎸 指版和弦圖、🎼 自動抓和弦、🎹 世界樂器體驗。

## 6. 待辦／建議

- **向 Google Search Console 申請 Safe Browsing 審查**（見第 4 節）。
- CJK 字型子集化（減少約 15MB）。
- 研究文章 md 中仍有少量 `http://` 外部連結，可逐步改成 https。
- 招募頁目前只用 Email 報名；之後若改用表單服務，需要調整 CSP 的 `form-action`。
