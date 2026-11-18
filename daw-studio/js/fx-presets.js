// 效果器預設值（起點，不是標準答案；套用後依實際聲音再微調）
// EQ 的 bands 只寫有改動的段，其餘維持預設（EQ_DEFAULT_BANDS）。
import { EQ_DEFAULT_BANDS } from './effects.js';

// 依「段號：參數」覆寫預設的 8 段
const eq = (over, output = 0) => {
  const bands = EQ_DEFAULT_BANDS.map(b => ({ ...b }));
  for (const [i, o] of Object.entries(over)) Object.assign(bands[i], o);
  return { bands, output };
};

export const PRESETS = {
  eq: [
    { group: '基本', name: '平直（重設）', params: eq({}), tip: '所有頻段歸零。' },
    { group: '人聲', name: '人聲：清晰', params: eq({ 0: { on: true, freq: 90, slope: 24 }, 2: { freq: 250, gain: -2.5, q: 1.2 }, 4: { freq: 3000, gain: 2, q: 0.9 }, 6: { freq: 10000, gain: 2.5 } }),
      tip: '切掉 90 Hz 以下的低頻雜音、減一點 250 Hz 的混濁、提 3 kHz 咬字與 10 kHz 空氣感。' },
    { group: '人聲', name: '人聲：溫暖', params: eq({ 0: { on: true, freq: 80 }, 1: { freq: 180, gain: 2 }, 4: { freq: 2500, gain: -1.5, q: 1 }, 6: { freq: 9000, gain: -1 } }),
      tip: '保留胸腔共鳴、柔化刺耳頻段，適合抒情歌。' },
    { group: '人聲', name: '人聲：去鼻音', params: eq({ 0: { on: true, freq: 90 }, 3: { freq: 1000, gain: -3.5, q: 2 } }),
      tip: '鼻音感通常集中在 800 Hz–1.2 kHz，用窄 Q 小幅衰減。' },
    { group: '人聲', name: 'Podcast／說話', params: eq({ 0: { on: true, freq: 100, slope: 24 }, 2: { freq: 300, gain: -2, q: 1 }, 4: { freq: 2800, gain: 3, q: 1 }, 6: { freq: 8000, gain: 1 }, 7: { on: true, freq: 14000 } }),
      tip: '讓說話更容易聽清楚，也去掉多餘的高頻雜訊。' },
    { group: '樂器', name: '木吉他', params: eq({ 0: { on: true, freq: 80 }, 2: { freq: 200, gain: -3, q: 1.2 }, 4: { freq: 2500, gain: 1.5 }, 6: { freq: 11000, gain: 2.5 } }),
      tip: '減掉 200 Hz 的「轟」，提亮刷弦的顆粒感。' },
    { group: '樂器', name: '電吉他：在混音中站出來', params: eq({ 0: { on: true, freq: 100 }, 3: { freq: 800, gain: 1.5 }, 5: { freq: 4000, gain: -2, q: 1.5 }, 7: { on: true, freq: 9000 } }),
      tip: '保留中頻厚度，收掉失真的刺耳高頻。' },
    { group: '樂器', name: '鋼琴', params: eq({ 0: { on: true, freq: 50 }, 2: { freq: 300, gain: -1.5 }, 6: { freq: 8000, gain: 1.5 } }),
      tip: '輕微清掉中低頻、增加光澤。' },
    { group: '樂器', name: '貝斯：結實', params: eq({ 0: { on: true, freq: 35 }, 1: { freq: 80, gain: 3 }, 2: { freq: 250, gain: -2, q: 1.2 }, 4: { freq: 1500, gain: 2, q: 1 }, 7: { on: true, freq: 6000 } }),
      tip: '加強 80 Hz 的重量與 1.5 kHz 的撥弦聲，讓小喇叭也聽得到貝斯。' },
    { group: '鼓', name: '大鼓', params: eq({ 0: { on: true, freq: 30 }, 1: { freq: 60, gain: 3.5 }, 3: { freq: 400, gain: -4, q: 1.5 }, 5: { freq: 4000, gain: 3, q: 1.2 } }),
      tip: '60 Hz 是重量、400 Hz 常是紙箱聲、4 kHz 是踩下去的「咔」。' },
    { group: '鼓', name: '小鼓', params: eq({ 0: { on: true, freq: 80 }, 2: { freq: 200, gain: 2 }, 3: { freq: 900, gain: -2, q: 1.5 }, 5: { freq: 5000, gain: 2.5 } }),
      tip: '200 Hz 是鼓身、5 kHz 是響線。' },
    { group: '鼓', name: '鼓組匯流排', params: eq({ 1: { freq: 70, gain: 1.5 }, 2: { freq: 350, gain: -2, q: 0.8 }, 6: { freq: 12000, gain: 2 } }),
      tip: '整組鼓：減少中低頻擁擠、加一點亮度。' },
    { group: '鼓', name: '鈸／Overhead', params: eq({ 0: { on: true, freq: 300, slope: 24 }, 5: { freq: 3500, gain: -1.5 }, 6: { freq: 12000, gain: 2 } }),
      tip: '切掉低頻，只留鈸的空氣感。' },
    { group: '整體', name: '溫暖', params: eq({ 1: { freq: 150, gain: 2 }, 6: { freq: 9000, gain: -2 } }), tip: '低頻多一點、高頻少一點。' },
    { group: '整體', name: '明亮', params: eq({ 2: { freq: 250, gain: -1 }, 6: { freq: 8000, gain: 3 } }), tip: '整體更清亮、更前面。' },
    { group: '整體', name: '去混濁', params: eq({ 0: { on: true, freq: 40 }, 2: { freq: 300, gain: -3, q: 0.9 } }), tip: '多軌疊在一起變悶時，先試這個。' },
    { group: '特效', name: '電話／收音機', params: eq({ 0: { on: true, freq: 400, slope: 24 }, 4: { freq: 1800, gain: 5, q: 1.2 }, 7: { on: true, freq: 3500, slope: 24 } }, -3),
      tip: '只留中頻的老式喇叭聲，常用在歌曲前奏或旁白。' },
    { group: '特效', name: 'Lo-fi', params: eq({ 0: { on: true, freq: 150 }, 3: { freq: 1000, gain: 2 }, 7: { on: true, freq: 6000 } }), tip: '模糊、懷舊的聲音。' },
  ],
  comp: [
    { group: '人聲', name: '人聲：自然', params: { threshold: -18, ratio: 3, attack: 8, release: 120, knee: 6, makeup: 3 }, tip: '溫和地讓忽大忽小的歌聲變平均，衰減量約 3–6 dB 為宜。' },
    { group: '人聲', name: '人聲：流行（貼耳）', params: { threshold: -22, ratio: 5, attack: 3, release: 80, knee: 4, makeup: 6 }, tip: '把人聲推到最前面，常見於流行與饒舌。' },
    { group: '人聲', name: 'Podcast／說話', params: { threshold: -24, ratio: 4, attack: 5, release: 150, knee: 8, makeup: 6 }, tip: '說話音量更穩定，小聲的字也聽得到。' },
    { group: '樂器', name: '木吉他', params: { threshold: -20, ratio: 2.5, attack: 15, release: 150, knee: 8, makeup: 2 }, tip: '保留撥弦的起音，只收大聲的部分。' },
    { group: '樂器', name: '貝斯：穩定', params: { threshold: -20, ratio: 4, attack: 10, release: 100, knee: 4, makeup: 3 }, tip: '讓每一顆音一樣大，低頻更穩。' },
    { group: '鼓', name: '大鼓：打擊感', params: { threshold: -15, ratio: 4, attack: 20, release: 60, knee: 2, makeup: 2 }, tip: '起音放慢讓鼓頭的「咔」先過去，打擊感更強。' },
    { group: '鼓', name: '小鼓：厚實', params: { threshold: -18, ratio: 5, attack: 5, release: 80, knee: 3, makeup: 3 }, tip: '把鼓身的餘韻拉起來。' },
    { group: '鼓', name: '鼓組匯流排（黏合）', params: { threshold: -14, ratio: 2, attack: 30, release: 200, knee: 6, makeup: 1.5 }, tip: '整組鼓一起壓 2–3 dB，聽起來更像同一套鼓。' },
    { group: '整體', name: '溫和平衡', params: { threshold: -12, ratio: 1.5, attack: 30, release: 250, knee: 12, makeup: 1 }, tip: '幾乎聽不出來的壓縮，只是讓整體更穩。' },
    { group: '整體', name: '混音黏合', params: { threshold: -16, ratio: 2, attack: 30, release: 150, knee: 6, makeup: 2 }, tip: '放在 Master 或樂器匯流排，讓各軌融成一體。' },
    { group: '整體', name: '強力壓縮', params: { threshold: -30, ratio: 8, attack: 1, release: 60, knee: 2, makeup: 10 }, tip: '很明顯的壓縮效果，常用在平行壓縮或特效。' },
    { group: '整體', name: '限制器式（擋峰值）', params: { threshold: -6, ratio: 20, attack: 0.3, release: 50, knee: 0, makeup: 0 }, tip: '只擋住偶爾過大的峰值，平常不動作。' },
  ],
  deess: [
    { group: '人聲', name: '女聲', params: { freq: 7500, range: 1.2, threshold: -28, amount: 8, listen: 0 }, tip: '女聲的齒音通常在 6–9 kHz。' },
    { group: '人聲', name: '男聲', params: { freq: 5500, range: 1.2, threshold: -28, amount: 8, listen: 0 }, tip: '男聲的齒音通常在 4–7 kHz。' },
    { group: '人聲', name: '溫和', params: { freq: 6500, range: 1.4, threshold: -24, amount: 5, listen: 0 }, tip: '只稍微收一點，不容易聽出處理痕跡。' },
    { group: '人聲', name: '強力（齒音很重）', params: { freq: 6500, range: 1.6, threshold: -34, amount: 14, listen: 0 }, tip: '齒音特別刺耳的錄音；壓太多會變成大舌頭，請邊聽邊調。' },
    { group: '樂器', name: '鈸／Hi-hat 收刺', params: { freq: 9000, range: 1.8, threshold: -26, amount: 6, listen: 0 }, tip: '也可以用在太刺的鈸。' },
  ],
  sat: [
    { group: '溫和', name: '磁帶暖度', params: { mode: 0, drive: 5, tone: -1.5, output: 0, mix: 100 }, tip: '幾乎聽不出失真，只是更厚、更溫暖。' },
    { group: '溫和', name: '真空管：人聲', params: { mode: 1, drive: 7, tone: 1, output: 0, mix: 60 }, tip: '增加人聲的存在感與一點點毛邊。' },
    { group: '溫和', name: '貝斯加厚', params: { mode: 0, drive: 10, tone: 0, output: 0, mix: 70 }, tip: '加上泛音，讓貝斯在小喇叭上也聽得到。' },
    { group: '明顯', name: '鼓組：有力', params: { mode: 2, drive: 12, tone: 2, output: -1, mix: 50 }, tip: '平行混入，讓鼓更兇但不失真。' },
    { group: '明顯', name: 'Lo-fi', params: { mode: 2, drive: 16, tone: -6, output: -2, mix: 100 }, tip: '粗糙、懷舊的聲音。' },
    { group: '明顯', name: '破音', params: { mode: 3, drive: 22, tone: 2, output: -6, mix: 100 }, tip: '明顯的削波破音。' },
  ],
  reverb: [
    { group: '空間', name: '小房間', params: { size: 0.6, predelay: 5, damp: 6000, mix: 18 }, tip: '自然的近距離空間。' },
    { group: '空間', name: '人聲殘響（Plate）', params: { size: 1.8, predelay: 25, damp: 7500, mix: 22 }, tip: '預延遲讓咬字先清楚出來，再接殘響。' },
    { group: '空間', name: '大廳', params: { size: 3.5, predelay: 30, damp: 6000, mix: 28 }, tip: '鋼琴、弦樂、抒情歌。' },
    { group: '空間', name: '教堂', params: { size: 6.5, predelay: 40, damp: 5000, mix: 35 }, tip: '很長的尾巴。' },
    { group: '匯流排', name: 'Send 用（100% 濕）', params: { size: 2.4, predelay: 20, damp: 6500, mix: 100 }, tip: '放在 Bus 上時用：混合量交給各軌的 Send。' },
  ],
  delay: [
    { group: '常用', name: '人聲短回音（Slapback）', params: { time: 0.25, feedback: 0, tone: 5000, pingpong: 0, mix: 18 }, tip: '一次很短的回音，讓人聲更有活力。' },
    { group: '常用', name: '四分音符回音', params: { time: 1, feedback: 30, tone: 4500, pingpong: 0, mix: 20 }, tip: '跟著拍子的回音。' },
    { group: '常用', name: '附點八分（左右）', params: { time: 0.75, feedback: 35, tone: 4500, pingpong: 1, mix: 22 }, tip: '流行與搖滾吉他常用的節奏感回音。' },
    { group: '特效', name: '長尾巴', params: { time: 2, feedback: 60, tone: 3000, pingpong: 1, mix: 30 }, tip: '句尾的空間效果。' },
  ],
  chorus: [
    { group: '常用', name: '輕微加寬', params: { rate: 0.4, depth: 2, mix: 30 }, tip: '讓聲音稍微變寬。' },
    { group: '常用', name: '經典合唱', params: { rate: 0.8, depth: 4, mix: 50 }, tip: '吉他、電鋼琴常用。' },
    { group: '特效', name: '晃動', params: { rate: 3, depth: 6, mix: 60 }, tip: '明顯的搖晃感。' },
  ],
};

export const presetsFor = type => PRESETS[type] || [];
