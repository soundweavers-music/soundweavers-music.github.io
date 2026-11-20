# 世界聲音百科 — 交接紀錄（HANDOFF）

最後更新：2026-11-19
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
       （scripts/build_ebook.py 電子書已從 CI 移除，2026-11-18；要出書再手動跑）
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
| 第三方 JS | `assets/vendor/` | Leaflet、SheetJS、JSZip、html2canvas、jsPDF 都已改為本站託管，CSP 不再允許任何 CDN。和弦偵測自 2026-11-18 起改用自寫 STFT，**不再載入 Meyda**（檔案留在 vendor 但頁面沒引用）。 |
| canonical / og:url | `canonical_for()` | 由輸出路徑算出絕對網址。 |
| 曼陀林建議時數 | `build_mandolin.py` → `study_hours()` | 字數 ÷ 300 字/分 × 各 Part 係數（技法 2.5、專輯 2.0…），以 0.5 小時為單位進位。 |
| 合奏與編制百科 | `content/ensembles/*.md` → `build_ensembles.py` | 七類 40 篇，frontmatter（class/num/title/en/region/summary/keywords）+ 固定七節。B1–B7 分類定義在 `build_static_site.ENSEMBLE_ARCHITECTURE`，改分類只要改那裡。寫作規格見 `content/ensembles/_STYLE.md`。 |
| 合奏條目的影片 | `scripts/fetch_ensemble_videos.py --per-entry 2` | 搜尋並篩選「真的在演這個合奏」的 YouTube 影片（排除教學、改編、器材測試、紀錄片、不可嵌入），寫入 `youtube:` frontmatter。`--set file.md=ID\ ID` 可手動指定。快取在 `work/ensemble_videos.json`。 |
| 人聲教材 | `content/vocal/vocal_ch*.md` → `build_vocal_extra.py` | 50 章，每章五個固定章節（先講結論／常見誤解／原理／現在就做／練完之後）。寫作規格 `content/vocal/_STYLE.md`。示意圖 32 張在 `assets/vocal/*.svg`，由 `scripts/make_vocal_diagrams.py` 產生；`scripts/insert_vocal_figures.py` 負責把圖插到每章「原理」標題下（可重複執行，章節↔圖的對照就在這支腳本裡）。結構檢查 `scripts/audit_vocal.py`，查證 `scripts/verify_vocal_content.py`。 |
| 和弦偵測 | `chord-detection/index.html`（**原始檔**，非產出物） | `build_chord_detection_tool()` 包上站台模板。分析全部在瀏覽器內完成：DP 節拍追蹤 → **自寫 STFT＋諧波/打擊分離＋低頻根音＋調音校正**的 chroma → 整首 chroma 判調 → 帶流行歌順階先驗的 Viterbi → 簡譜式小節表（小節號、級數、歌詞），可移調／標示 Capo、匯入 .lrc、點小節試聽、級數快捷修正、匯出純文字或 Word。`local-agent/`（Python 分析器）只留在 repo，**不部署，頁面上也不得再提到它**（見第 4 節 Safe Browsing）。 |
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

### 2026-11-21（英文版：樂理 20 章＋整條管線）

- **英文內容放 `content/en/<course>/`**，跟中文原稿一個資料夾對一個資料夾。
  課程頁在 `/en/<course>/`，落地頁 `/en/`。
- **`scripts/build_en_courses.py` 是英文課程頁的唯一建置器**：`COURSES` 一筆
  課程 = 目錄頁＋每章一頁＋上下章。`build_courses.py` 從此只建中文
  （以前兩邊都寫 `/en/index.html`，誰後跑誰贏）。樂理例外，仍在
  `build_vocal_extra.build_theory_pages("en")`（它有階段頁），英文那邊只把
  它列進落地頁（`landing_only`）。
- **圖的英文版**：`scripts/figure_i18n.py extract|merge|generate <course>`。
  中文圖先產生好，再逐字串換掉；字串表在 `scripts/figure_strings/<course>.py`，
  工作檔在 `work/figure_strings/<course>/*.json`（gitignore）。
  `generate` 沒翻完會列出來並離開碼 1，所以覆蓋率是可檢查的。
  樂理 46 張圖、470 條字串已全數翻完。英文稿引用圖要用
  `/assets/<course>/en/<name>.svg`（絕對路徑，`relativize()` 會轉相對）。
- **翻譯契約在 `content/en/_STYLE.md`**：語氣、結構、術語表（bar 不用 measure、
  staff 不用 stave…）。翻譯／審查都先讀這一份，不然同一個詞會在兩章長得不一樣。
- **`page()` 的英文外框**：`lang="en"` 時 keywords、og:title、JSON-LD 的
  name/author、回頂部 aria-label 都換英文，只剩語言切換的「中文」是中文（正確）。
- **進度**：樂理 20 章＋前言、詞曲創作 6 堂已完成；吉他、烏克麗麗、人聲、
  錄音後製、DAW、曼陀林逐套進行中。`figure_i18n.py status` 可以看每套圖還剩幾條。

### 2026-11-20（新課程：流行歌曲詞曲創作）

- **`/songwriting/` 六堂課**：拆歌 → 歌詞 → 旋律 → 和弦 → 詞曲合一 → 寫完拿出去。
  內容在 `content/songwriting/1.md`–`6.md`，用 `build_courses.py` 產生
  （`COURSES` 加一筆就會有一整套：目錄、章節頁、上下章）。
- **19 張示意圖**：`scripts/build_songwriting_figures.py`，沿用
  `build_vocal_figures` 的版面元件。`assets/songwriting/` 要記得在
  `build_static_site.py` 的複製清單裡（漏了會整批 404）。
- **歌詞只用公有領域素材**：李白〈靜夜思〉當「具體勝過抽象」的範例，
  課文其餘引號內容都是自寫的誤解句與範例。分析現有華語流行歌時只談段落、
  和弦級數、旋律走向，不引歌詞。
- **`course_hours.py` 加了 `factor_for()` 與 `UNITS`**：詞曲創作每堂要真的坐下來
  寫 30–60 分鐘，練習倍率 5.0；單位是「堂」不是「章」。課程頁與 `/learn/`
  現在共用同一組數字（之前兩邊會用不同倍率，對不起來）。

### 2026-11-19（DAW 課程截圖：木質淺色、標註改成量出來的）

- **全部改成「世界聲音・木質淺色」**：31 張截圖重拍（22 張課程圖、9 張封面圖）。
  `scripts/daw_shots/capture.py` 在 `theme-boot.js` 之前插一支 `_shot-theme.js`
  把 localStorage 與 `data-theme` 釘成 `wood-light`，主題就不會跟著使用者設定跑。
- **紅色標註不再寫死座標**：截圖前 harness 會把 `RECT_SELECTORS` 裡每個元素的
  `getBoundingClientRect` POST 回 `raw/<shot>.json`；`figures.py` 改成用
  `("sel", "#rulerWrap", 0, 8)` 這種寫法指定「標哪個元素」，不再手算像素。
  介面一改版（多一條軌、換示範專案、面板高度變）標註就不會再跑掉。
- **第 1 堂五區圖**：#5 原本標在檢閱器的插入效果器上（狀態列根本被裁掉）、
  #2 貼在面板左緣被切掉、還有一個說明裡沒有的 #6；現在五個都落在對應區塊。
- **截圖工具鏈現在進版控了**：`scripts/daw_shots/capture.py`（跑介面 → 截圖 →
  回報元素座標）與 `figures.py`（讀座標 → 裁切 → 加紅框／編號）。產物
  （`raw/`、profile、`_figs.png`）仍然留在 `work/daw-shots/`，那裡是本機檔。
  重跑：`python scripts/daw_shots/capture.py` 再 `python scripts/daw_shots/figures.py`。
  以前這兩支放在 `work/` 底下，而 `work/` 是靠 `.git/info/exclude` 排除的
  （每個人自己的檔、不進版控），所以別人 clone 下來根本沒有工具可以用。
- **`--window-size` 是視窗不是視窗區**：Chrome 會內縮約 (22, 154)，要拍 1400×840
  的畫面就得給 1422×994，否則量到的座標和截圖差了 154 px（這就是以前標註
  對不上的根本原因）。截圖也比視窗區大，`figures.py` 会先裁左上角。
- **修掉一個真的 bug**：自動伴奏面板一開就爆——
  `arranger-ui.js` 假設每個 `status === 'ready'` 的音色庫都有 `presets`，
  `b.presets.filter(...)` 直接 `Cannot read properties of undefined`。
  已改成 `(b.presets || [])`。第 12 堂的圖就是修完才拍到的。
- **課程頁截圖外框**從深色 `#0c0d11` 改成 `#f6f2ec`。

### 2026-11-19（樂理版面加寬、補圖）

- **樂理頁跟人聲課程同寬**：`.theory-page` 從 780px 改成 1040px、內文字級 16.5 → 17px
  （樣式在 `scripts/build_vocal_extra.py` 的 `build_theory_pages()` 裡，是逐頁內嵌的
  `<style>`，不是 `site.css`——改寬度要改那裡，改完要跑 ② 才會生效）。
- **每一節再補一張圖，`assets/theory/` 從 23 張變成 46 張**：疏密波、聽覺範圍、
  等響曲線、全音半音、節拍 vs 節奏、切分、彈性速度、記譜演化、三種譜號的地盤、
  C 譜號位移、臨時記號、小節線、附點、2/2、鋼琴身分、弦的三個旋鈕、鼓皮張力、
  音域三層、tessitura、管弦三層樓、世界調音、伴奏型。
  產生器是 `scripts/make_theory_figures.py`（第二批在檔案後半）。
- **修掉舊圖的無效屬性**：`text()` 的第 5 個參數是 anchor，早期有些呼叫把顏色
  傳進去，結果輸出 `text-anchor="#8a8078"`、`fill="700"`（7 張圖共 31 處）。
  現在 `text()` 偵測到色碼會自動撥回正確位置，舊圖不用一張張改。
- **檢查**：`python scripts/audit_figure_overlap.py theory`（46 張、0 處重疊）。

### 2026-11-19（手機寬度與字型）

- **手機版**：`.site-header` 在 700px 以下會換行，但 refresh 樣式把高度鎖在 60px、
  導覽維持單排，窄螢幕時整排會跑出畫面。820px 以下改成可換行、高度自適應。
- **字型從 16.9 MB 降到 1.5 MB**：`fonts/` 原本放整套 Source Han Serif TW VF
  （可變字型 16.9 MB）。改成只留站上實際用到的 3,700 個中文字的 woff2 子集，
  `@font-face` 指向 `fonts/SourceHanSerifTW-VF-subset.woff2`。
  要重新產生跑 `python scripts/subset_font.py`（需要原始 TTF，檔頭有下載網址）；
  原始 TTF 已從 repo 移除，不再跟著部署。

### 2026-11-19（課程圖解補齊）

- **兩套課程現在每個小節都有圖**：`scripts/audit_figure_coverage.py` 會列出沒有圖的
  `## x.y`（檢查表／練習設定／結語不算），目前 149 個小節、0 個缺圖。
- 圖都從程式產生，共用的版面放在兩支產生器的前段：步驟卡、左右對照、曲式時間軸、
  音符時值、拍點格、音程與級數；`scripts/song_card.py` 是兩套課程共用的「歌曲卡」，
  把和弦進行畫成一排方塊，資料直接從章節裡既有的和弦表抓。
- 圖檔：吉他 73 張、烏克麗麗 84 張（含 `song/` 子目錄），全部被引用、沒有缺檔。
- 重新產生：`python scripts/build_guitar_figures.py`、`python scripts/make_ukulele_diagrams.py`，
  再用 `python scripts/audit_figure_coverage.py` 檢查有沒有漏。

### 2026-11-19（吉他／烏克麗麗課程收尾）

- **`assets/ukulele/` 從未複製到輸出目錄**：`build_static_site.py` 的資產複製是一項一項列出來的，加了 guitar 卻漏了 ukulele，線上 18 張烏克麗麗圖全部 404。已補上複製步驟。
- **課程稿裡的 LaTeX 會原樣印出**：站上只有 Python-Markdown，沒有 MathJax／KaTeX。`content/ukulele/` 19 個檔案共 116 處 `$\rightarrow$`、`$\downarrow$`、`$4 \times 4 = 16$` 全部改成 `→ ↓ ↑ ×`；`2.md` 的 `$$\text{...}$$` 也一併改掉。
- **吉他第 3、4、6、9、16 章的純文字譜改成程式畫的圖**：新增 `tab-reading`、`chord-diagram-reading`、`chromatic-walk`、`c-major-scale`、`c-major-scale-run`、`twinkle`、`arpeggio-t1213121`、`soul-strum`、`legato` 九張（`scripts/build_guitar_figures.py`）。第 10、12 章原本「圖＋重複的 ASCII 和弦表」刪掉 ASCII。
- **烏克麗麗新增八張圖**（`scripts/make_ukulele_diagrams.py`）：16 Beat 慢靈魂、16 Beat 放克、錘勾滑、卡農進行、移調夾、三度／六度雙音、指彈分工、打板擊點；`insert_ukulele_figures.py` 的 PLAN 同步補上。
- **`chord-hold.svg` 的 G 改成四指版、Em7 指法修正**：圖上原本的 G 是三指版，和「保留指」的說明對不起來；Em7 有兩條弦都標成小指。
- 圖片路徑統一改成相對路徑 `../../assets/<lib>/x.svg`（`audit_guitar.py` 的檢查也跟著會驗相對路徑）。
- 清掉吉他課程殘留的行銷詞（完美、極致、歡迎來到…）。
- **三段找不到可信來源的流行歌逐音轉譜全部換掉**：〈甜蜜蜜〉的簡譜與六線譜互相矛盾（同一份稿子兩個版本），而網路上的簡譜站不是擋爬蟲就是版本互斥；改成公有領域、旋律沒有版本爭議的〈祝你生日快樂〉（3/4 拍，剛好補上八分音符練習）。〈晴天〉前奏與〈突然好想你〉前奏則改成「同一組和弦＋固定分解」的練習，圖上明確標示不是原曲採譜——和弦進行是公開可查的事實，逐音採譜不是。
- 吉他 `目錄.md` 的節次標題全部改成從章節 `## ` 標題重新產生；原本有多章的小節列表和章內對不上（有的列了不存在的節、有的標題是舊版）。
- **烏克麗麗的純文字譜面同步處理**：46 段降到 16 段。和弦指法圖的方塊字（Dm/Em/G、Bb/Bm/Cm/F#m、D×2、Gm/C7、Cmaj7/Am7/Fmaj7/G6）全部用 `chord_grid()` 畫成圖；切音／雷鬼／倫巴三組節奏型畫成格子圖（`chunk8`、`reggae8`、`rumba8`）；18 段和弦＋歌詞譜改成「和弦進行／節奏指法」表格；指板音名地圖改成表格。第 1、4、6 章各有跟現有圖重複的 ASCII，直接刪除。
- **剩下 13 段純文字譜面全部處理掉**，吉他課程已無 ```text 區塊。先逐行量過視覺欄位：多數段落的間距本身就不一致（同一行裡 3 格與 4 格混用），`|` 小節線的寬度也塞不下自己的拍點，所以**無法機械還原「哪個字對哪一拍」**。因此只有三類改成圖（〈擁抱〉、〈情非得已〉、16 Beat 與 6/8 兩個節奏型——這幾張的欄位是整齊的），其餘一律改成「和弦進行 → 歌詞」的表格，不假造對齊。第 18 章那段編排說明改成表格。

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
