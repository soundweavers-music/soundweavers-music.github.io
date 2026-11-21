// 最小可用的 MP4（ISO BMFF）封裝器：H.264 影像 + AAC 聲音，一般播放器、剪輯軟體都吃
// 只做輸出需要的盒子，不做串流分段（moof）——寫成一個 moov + 一個 mdat 的標準檔案。
// 參考 ISO/IEC 14496-12（檔案結構）與 14496-15（avcC）。

const TE = new TextEncoder();
const str = s => TE.encode(s);
const u8v = (...v) => Uint8Array.from(v);
const u16 = v => Uint8Array.of((v >> 8) & 255, v & 255);
const u24 = v => Uint8Array.of((v >> 16) & 255, (v >> 8) & 255, v & 255);
const u32 = v => Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const zero = n => new Uint8Array(n);

function cat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// 盒子：長度 + 類型 + 內容
const box = (type, ...parts) => { const body = cat(parts.flat()); return cat([u32(body.length + 8), str(type), body]); };
// FullBox：多一個 version + flags
const full = (type, ver, flags, ...parts) => box(type, u8v(ver), u24(flags), ...parts);

const MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

// 等長連續取樣只寫一筆 stts
function stts(list) {
  const runs = [];
  for (const s of list) {
    const d = s.duration;
    const last = runs[runs.length - 1];
    if (last && last.d === d) last.n++;
    else runs.push({ n: 1, d });
  }
  return full('stts', 0, 0, u32(runs.length), ...runs.map(r => cat([u32(r.n), u32(r.d)])));
}

// 每個取樣各自一個 chunk（最單純、偏移量直接對得上）
function stsc() { return full('stsc', 0, 0, u32(1), cat([u32(1), u32(1), u32(1)])); }
function stsz(list) { return full('stsz', 0, 0, u32(0), u32(list.length), ...list.map(s => u32(s.data.length))); }
function stco(offsets) { return full('stco', 0, 0, u32(offsets.length), ...offsets.map(o => u32(o))); }
function stss(list) {
  const keys = [];
  list.forEach((s, i) => { if (s.key) keys.push(i + 1); });
  if (!keys.length || keys.length === list.length) return null;
  return full('stss', 0, 0, u32(keys.length), ...keys.map(k => u32(k)));
}

const dinf = () => box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));

// avc1 影像取樣描述；avcC 直接放 WebCodecs 給的 decoderConfig.description
function avc1(width, height, avcC) {
  return box('avc1',
    zero(6), u16(1),                    // reserved + data_reference_index
    u16(0), u16(0), zero(12),           // pre_defined / reserved / pre_defined[3]
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000),   // 72 dpi
    u32(0), u16(1),                     // reserved、frame_count
    zero(32),                           // compressorname
    u16(0x0018), u16(0xffff),           // depth、pre_defined
    box('avcC', avcC));
}

const DESC_LEN = n => (n < 128 ? u8v(n) : u8v((n >> 7) | 0x80, n & 127));

// AAC 的 esds（含 AudioSpecificConfig）
function esds(asc, bitrate) {
  const dsi = cat([u8v(0x05), DESC_LEN(asc.length), asc]);
  const dcd = cat([u8v(0x04), DESC_LEN(13 + dsi.length), u8v(0x40), u8v(0x15), u24(0),
    u32(bitrate), u32(bitrate), dsi]);
  const sl = cat([u8v(0x06), DESC_LEN(1), u8v(0x02)]);
  const es = cat([u8v(0x03), DESC_LEN(3 + dcd.length + sl.length), u16(0), u8v(0), dcd, sl]);
  return full('esds', 0, 0, es);
}

function mp4a(sampleRate, channels, asc, bitrate) {
  return box('mp4a',
    zero(6), u16(1),                    // reserved + data_reference_index
    zero(8),                            // reserved（version/revision/vendor 全 0）
    u16(channels), u16(16), u16(0), u16(0),
    u32(sampleRate << 16),
    esds(asc, bitrate));
}

function trak({ id, isVideo, width, height, timescale, duration, movieDuration, samples, sampleEntry }) {
  const tkhd = full('tkhd', 0, 3,
    u32(0), u32(0), u32(id), u32(0), u32(movieDuration), zero(8),
    u16(0), u16(0), u16(isVideo ? 0 : 0x0100), u16(0),
    MATRIX, u32(width << 16), u32(height << 16));
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0));
  const hdlr = full('hdlr', 0, 0, u32(0), str(isVideo ? 'vide' : 'soun'), zero(12), str(isVideo ? 'VideoHandler' : 'SoundHandler'), u8v(0));
  const stbl = box('stbl',
    full('stsd', 0, 0, u32(1), sampleEntry),
    stts(samples),
    ...(isVideo ? [stss(samples)].filter(Boolean) : []),
    stsc(), stsz(samples), stco(samples.offsets));
  const minf = box('minf',
    isVideo ? full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0))
            : full('smhd', 0, 0, u16(0), u16(0)),
    dinf, stbl);
  return box('trak', tkhd, box('mdia', mdhd, hdlr, minf));
}

/**
 * samples：{ data: Uint8Array, duration: 刻度數, key: bool }（offsets 由這裡填）
 * audio：{ sampleRate, channels, asc: Uint8Array, bitrate, samples }
 */
export function buildMp4({ width, height, fps, videoSamples, avcC, audio }) {
  const vt = 90000;
  const step = Math.round(vt / fps);
  let acc = 0;
  const vs = videoSamples.map((s, i) => {
    const next = Math.round((i + 1) * vt / fps);
    const duration = next - acc;
    acc = next;
    return { data: s.data, duration, key: !!s.key };
  });
  const vDuration = acc;
  const movieTs = 1000;
  const movieDuration = Math.round(vDuration / vt * movieTs);

  const as = audio && audio.samples.length ? audio.samples.map(s => ({ data: s.data, duration: s.duration, key: true })) : null;
  const aDuration = as ? as.reduce((a, s) => a + s.duration, 0) : 0;

  const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));

  // moov 兩次：第一次算長度（偏移量先填 0），第二次填真正的偏移量
  const makeMoov = (vOff, aOff) => {
    const tracks = [trak({
      id: 1, isVideo: true, width, height, timescale: vt, duration: vDuration, movieDuration,
      samples: Object.assign([...vs], { offsets: vOff }),
      sampleEntry: avc1(width, height, avcC),
    })];
    if (as) {
      tracks.push(trak({
        id: 2, isVideo: false, width: 0, height: 0, timescale: audio.sampleRate,
        duration: aDuration, movieDuration,
        samples: Object.assign([...as], { offsets: aOff }),
        sampleEntry: mp4a(audio.sampleRate, audio.channels, audio.asc, audio.bitrate || 192000),
      }));
    }
    const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(movieTs), u32(movieDuration),
      u32(0x00010000), u16(0x0100), zero(10), MATRIX, zero(24), u32(as ? 3 : 2));
    return box('moov', mvhd, ...tracks);
  };

  const moov0 = makeMoov(vs.map(() => 0), as ? as.map(() => 0) : []);
  const mdatStart = ftyp.length + moov0.length + 8;   // mdat 標頭 8 bytes
  const vOff = [];
  let off = mdatStart;
  for (const s of vs) { vOff.push(off); off += s.data.length; }
  const aOff = [];
  for (const s of as || []) { aOff.push(off); off += s.data.length; }
  const moov = makeMoov(vOff, aOff);
  const mdat = box('mdat', ...vs.map(s => s.data), ...(as || []).map(s => s.data));
  return cat([ftyp, moov, mdat]);
}
