// 效果器圖示：每個效果器一格 16×16 的線條圖，顏色吃 currentColor，跟著配色主題走
// 用途：插入槽、新增選單、混音台（compact）
const S = (body, extra = '') =>
  `<svg class="fxi" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.25"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

// path 一律用 1.5～13.5 的內框，縮到 10px 也還看得出來
const PATHS = {
  // 等化器：三根推桿
  eq: `<path d="M4 2.5v11M8 2.5v11M12 2.5v11" stroke-opacity=".45"/>
       <path d="M2.2 6h3.6M6.2 10h3.6M10.2 4.4h3.6"/>`,
  // 壓縮器：上方曲線被壓平，下面一條基準線
  comp: `<path d="M2 12.5 6 8.6c1.6-1.5 2.5-1.9 3.2-2.1H14"/>
         <path d="M2 13.5h12" stroke-opacity=".35"/>
         <path d="M6.4 4.2h5.2" stroke-dasharray="1.5 1.6" stroke-opacity=".6"/>`,
  // 去齒音：高頻刺刺的波形被削掉
  deess: `<path d="M2 9.5c1-3 1.7-4.4 2.6-4.4.9 0 1.1 2.6 2 2.6s1-3.4 2-3.4 1.2 3 2 3c.7 0 .8-1.6 1.4-1.6.5 0 .7.9 1 1.6"/>
          <path d="M9.2 2.4l1-1M11.6 2.1l.5-1.1" stroke-opacity=".7"/>`,
  // 修音：波浪線被拉直到格線上
  tune: `<path d="M2 10.5c1.2-2.4 2-3.6 3-2.6 1 1 1.6 2.6 2.6 1.6" stroke-opacity=".5"/>
         <path d="M8.4 7.6c1.2-1.4 2.2 1.4 3.2.2.6-.7 1-.9 2.4-.9"/>
         <circle cx="8.4" cy="7.6" r="1.3"/><path d="M2 13.5h12" stroke-opacity=".3"/>`,
  // 和聲：三條平行聲部
  harm: `<path d="M2 5.5c2-1.8 4-1.8 6 0M2 9h6M2 12.5c2 1.4 4 1.4 6 0"/>
         <path d="M10 4.5c1.6-1.2 2.8-1 4 .4M10 9h4M10 13.2c1.6 1 2.8.8 4-.4" stroke-opacity=".5"/>`,
  // 移調：音符加上下箭頭
  pitch: `<path d="M6.6 12.6V5.4l4-1v6.9"/><circle cx="5" cy="12.8" r="1.7"/><circle cx="9" cy="11.4" r="1.7"/>
          <path d="M13.6 4.6l-1.2-1.6-1.2 1.6M12.4 3v5.2" stroke-opacity=".8"/>`,
  // 飽和：波形上下被削平
  sat: `<path d="M1.8 8c.8 0 1.1-4 2-4s1.2 8 2.1 8 1.2-8 2.1-8 1.2 8 2.1 8 1.1-4 2-4h.7"/>
        <path d="M1.8 3.4h12.4M1.8 12.6h12.4" stroke-dasharray="1.4 1.6" stroke-opacity=".45"/>`,
  // 立體聲寬度：左右推開
  width: `<circle cx="8" cy="8" r="1.6"/><path d="M5.6 8H1.8M10.4 8h3.8"/>
          <path d="M3.4 5.8 1.6 8l1.8 2.2M12.6 5.8 14.4 8l-1.8 2.2"/>`,
  // 殘響：從音源擴散的同心弧
  reverb: `<circle cx="3.4" cy="8" r="1.4"/>
           <path d="M6.4 4.6a5 5 0 0 1 0 6.8M9 2.8a8 8 0 0 1 0 10.4M11.6 1.6a11 11 0 0 1 0 12.8" stroke-opacity=".75"/>
           <path d="M6.4 4.6a5 5 0 0 0 0 6.8" stroke-opacity=".3"/>`,
  // 延遲：一次一次變小的回音
  delay: `<path d="M2.6 2.4v11.2"/><rect x="5" y="4.6" width="2.2" height="6.8" rx=".6"/>
          <rect x="8.8" y="6.2" width="1.8" height="3.6" rx=".6" stroke-opacity=".8"/>
          <rect x="12" y="7" width="1.6" height="2" rx=".5" stroke-opacity=".55"/>`,
  // 合唱：相位錯開的兩條波
  chorus: `<path d="M1.8 8c1.4-3.4 2.8-3.4 4.2 0s2.8 3.4 4.2 0 2.8-3.4 4.2 0"/>
            <path d="M1.8 8c1.4-3.4 2.8-3.4 4.2 0s2.8 3.4 4.2 0 2.8-3.4 4.2 0"
              transform="translate(0 3.2)" stroke-opacity=".45"/>`,
  // 失真：正弦被削成方波
  drive: `<path d="M1.6 11.4V4.6h3.6v6.8h3.6V4.6h3.6v6.8h2"/>
          <path d="M1.6 8h12.8" stroke-dasharray="1.4 1.6" stroke-opacity=".35"/>`,
  // 噪音閘：門檻線以下的音量條被切掉
  gate: `<path d="M3 12.4V6.6M5.4 12.4V5.4M12.6 12.4V6.8M14.2 12.4V8.6"/>
         <path d="M7.8 12.4v-1.4M10.2 12.4v-.9" stroke-opacity=".35"/>
         <path d="M1.6 9.6h12.8" stroke-dasharray="1.5 1.6" stroke-opacity=".8"/>`,
};

export function fxIcon(type) {
  return S(PATHS[type] || `<circle cx="8" cy="8" r="5"/>`);
}
