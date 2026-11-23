# pinyin-pro（漢字 → 拼音）

`pinyin-pro.js` 是 [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 3.x 的 dist 檔（minified，未修改），
用在「織音AI配音剪輯」的 AI 配音：把字幕的文字轉成帶聲調的拼音，再對到 MeloTTS 的音素表
（`assets/tts/zh-syllables.json`）。之所以自己放一份、不從 CDN 載，是因為站台的 CSP 只允許同源。

- 授權：MIT
- 版本：3.x（https://cdn.jsdelivr.net/npm/pinyin-pro@3/dist/index.js）
- 更新方式：抓上面那個網址覆蓋這個檔案即可，介面（`pinyinPro.pinyin`）沒有變就不用改程式
