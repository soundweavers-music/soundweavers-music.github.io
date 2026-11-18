// 音訊編碼：MP3（lamejs，LGPL，assets/vendor/lamejs）與 FLAC（本檔自製，無損）
// 兩者都在瀏覽器裡跑，不上傳。

// ---------------- MP3 ----------------
let lameLoading = null;
// 原始碼在 /daw-studio/、成品在 /tools/daw/，相對路徑深度不同。
// 建置腳本會改寫 index.html 裡 jszip 的路徑，所以從那個 <script> 推出 assets/vendor/ 在哪裡，兩邊都對。
function vendorUrl(file) {
  const z = document.querySelector('script[src*="vendor/jszip"]');
  if (z) return new URL(file, z.src.replace(/jszip\.min\.js.*$/, '')).href;
  return new URL('../../assets/vendor/' + file, import.meta.url).href;
}
function loadLame() {
  if (window.lamejs) return Promise.resolve(window.lamejs);
  if (!lameLoading) lameLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = vendorUrl('lamejs/lame.min.js');
    s.onload = () => (window.lamejs ? res(window.lamejs) : rej(new Error('MP3 編碼器載入失敗')));
    s.onerror = () => rej(new Error('找不到 MP3 編碼器檔案'));
    document.head.appendChild(s);
  });
  return lameLoading;
}

const toInt16 = (f, out) => { for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; } return out; };

// kbps：128/192/256/320。lamejs 只支援 32/44.1/48 kHz（以及更低），96k 要先降頻
export async function encodeMp3(buffer, kbps = 320, onProgress) {
  const lame = await loadLame();
  if (![32000, 44100, 48000].includes(buffer.sampleRate)) throw new Error('MP3 只支援 44.1 或 48 kHz，請在輸出設定改取樣率');
  const nCh = Math.min(2, buffer.numberOfChannels);
  const enc = new lame.Mp3Encoder(nCh, buffer.sampleRate, kbps);
  const L = buffer.getChannelData(0), R = nCh > 1 ? buffer.getChannelData(1) : null;
  const block = 1152 * 16;
  const iL = new Int16Array(block), iR = new Int16Array(block);
  const parts = [];
  for (let i = 0; i < buffer.length; i += block) {
    const n = Math.min(block, buffer.length - i);
    const l = toInt16(L.subarray(i, i + n), n === block ? iL : new Int16Array(n));
    const out = R ? enc.encodeBuffer(l, toInt16(R.subarray(i, i + n), n === block ? iR : new Int16Array(n))) : enc.encodeBuffer(l);
    if (out.length) parts.push(new Uint8Array(out));
    if (onProgress && (i / block) % 20 === 0) { onProgress(i / buffer.length); await new Promise(r => setTimeout(r)); }
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return new Blob(parts, { type: 'audio/mpeg' });
}

// ---------------- FLAC ----------------
// 規格：https://xiph.org/flac/format.html
// 每個 subframe 嘗試 FIXED order 0~4，選位元數最少的；殘差用 Rice 編碼（partition order 0~6 擇優）
class BitWriter {
  constructor(cap = 1 << 16) { this.buf = new Uint8Array(cap); this.pos = 0; this.acc = 0; this.n = 0; }
  grow(need) { if (this.pos + need + 8 < this.buf.length) return; const b = new Uint8Array(Math.max(this.buf.length * 2, this.pos + need + 1024)); b.set(this.buf); this.buf = b; }
  // 寫 bits 個位元（bits ≤ 32）
  write(v, bits) {
    this.grow(8);
    while (bits > 0) {
      const take = Math.min(bits, 24 - this.n);
      const shift = bits - take;
      const chunk = shift >= 32 ? 0 : Math.floor(v / Math.pow(2, shift)) & ((1 << take) - 1);
      this.acc = (this.acc << take) | chunk; this.n += take; bits -= take;
      while (this.n >= 8) { this.n -= 8; this.buf[this.pos++] = (this.acc >>> this.n) & 255; }
      this.acc &= (1 << this.n) - 1;
    }
  }
  unary0(q) {   // q 個 0 再一個 1
    while (q >= 24) { this.write(0, 24); q -= 24; }
    this.write(1, q + 1);
  }
  align() { if (this.n) this.write(0, 8 - this.n); }
  bytes() { return this.buf.subarray(0, this.pos); }
}

const CRC8 = new Uint8Array(256), CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; CRC8[i] = c;
  let d = i << 8; for (let k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff; CRC16[i] = d;
}
const crc8 = (b, a, z) => { let c = 0; for (let i = a; i < z; i++) c = CRC8[c ^ b[i]]; return c; };
const crc16 = (b, a, z) => { let c = 0; for (let i = a; i < z; i++) c = ((c << 8) ^ CRC16[(c >> 8) ^ b[i]]) & 0xffff; return c; };

// FIXED 預測殘差
function residual(x, order, out) {
  const n = x.length;
  for (let i = order; i < n; i++) {
    switch (order) {
      case 0: out[i] = x[i]; break;
      case 1: out[i] = x[i] - x[i - 1]; break;
      case 2: out[i] = x[i] - 2 * x[i - 1] + x[i - 2]; break;
      case 3: out[i] = x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3]; break;
      default: out[i] = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
    }
  }
  return out;
}
const zz = v => (v >= 0 ? v * 2 : -v * 2 - 1);

// 給一段殘差，估最佳 Rice 參數與總位元數
function riceCost(res, a, z) {
  let sum = 0;
  for (let i = a; i < z; i++) sum += zz(res[i]);
  const n = z - a;
  if (!n) return { k: 0, bits: 0 };
  const mean = sum / n;
  let k = mean > 0 ? Math.max(0, Math.min(14, Math.floor(Math.log2(mean)))) : 0;
  // 在估計值附近找最小
  let best = { k, bits: Infinity };
  for (let kk = Math.max(0, k - 1); kk <= Math.min(14, k + 1); kk++) {
    let bits = 0;
    for (let i = a; i < z; i++) bits += Math.floor(zz(res[i]) / (1 << kk)) + 1 + kk;
    if (bits < best.bits) best = { k: kk, bits };
  }
  return best;
}

function encodeSubframe(bw, x, bps) {
  const n = x.length;
  // 有號數寫成 bps 位元的二補數（bps 最多 25，用乘法避免 32 位元位移溢位）
  const M = Math.pow(2, bps);
  const sgn = v => (v < 0 ? v + M : v);
  // constant
  let allSame = true; for (let i = 1; i < n; i++) if (x[i] !== x[0]) { allSame = false; break; }
  if (allSame) { bw.write(0, 1); bw.write(0b000000, 6); bw.write(0, 1); bw.write(sgn(x[0]), bps); return; }
  const res = new Int32Array(n);
  let best = null;
  for (let order = 0; order <= Math.min(4, n - 1); order++) {
    residual(x, order, res);
    // partition order：blocksize 必須能被 2^p 整除，且每個 partition 長度 > order
    let bestP = null;
    for (let p = 0; p <= 6; p++) {
      const parts = 1 << p;
      if (n % parts || (n >> p) <= order) break;
      const plen = n >> p;
      let bits = 4 * parts, ks = [];
      for (let q = 0; q < parts; q++) {
        const a = q === 0 ? order : q * plen, z = (q + 1) * plen;
        const c = riceCost(res, a, z);
        bits += c.bits; ks.push(c.k);
      }
      if (!bestP || bits < bestP.bits) bestP = { p, bits, ks };
    }
    const total = order * bps + 6 + bestP.bits;
    if (!best || total < best.total) best = { order, total, ...bestP, res: res.slice() };
  }
  // verbatim 比較划算就用 verbatim
  if (best.total >= n * bps) {
    bw.write(0, 1); bw.write(0b000001, 6); bw.write(0, 1);
    for (let i = 0; i < n; i++) bw.write(sgn(x[i]), bps);
    return;
  }
  bw.write(0, 1); bw.write(0b001000 | best.order, 6); bw.write(0, 1);
  for (let i = 0; i < best.order; i++) bw.write(sgn(x[i]), bps);
  // residual：Rice（4-bit 參數）
  bw.write(0, 2); bw.write(best.p, 4);
  const parts = 1 << best.p, plen = n >> best.p;
  for (let q = 0; q < parts; q++) {
    const k = best.ks[q];
    bw.write(k, 4);
    const a = q === 0 ? best.order : q * plen, z = (q + 1) * plen;
    for (let i = a; i < z; i++) {
      const u = zz(best.res[i]);
      bw.unary0(Math.floor(u / (1 << k)));
      if (k) bw.write(u & ((1 << k) - 1), k);
    }
  }
}

// FLAC 的 frame number 用「UTF-8 形式」編碼（最多 36 位元，這裡 31 位元就夠用）
function utf8Num(bw, v) {
  if (v < 0x80) { bw.write(v, 8); return; }
  // 需要的續接位元組數：2 bytes 可放 11 bits、3 bytes 16 bits、4 bytes 21 bits、5 bytes 26 bits、6 bytes 31 bits
  const cap = [0, 7, 11, 16, 21, 26, 31];
  let len = 2;
  while (v >= Math.pow(2, cap[len])) len++;
  const cont = [];
  let n = v;
  for (let i = 1; i < len; i++) { cont.unshift(0x80 | (n & 0x3f)); n = Math.floor(n / 64); }
  const lead = (0xff << (8 - len)) & 0xff;   // len 個 1 再一個 0
  bw.write(lead | n, 8);
  for (const b of cont) bw.write(b, 8);
}

// bitDepth：16 或 24。回傳 Blob
export async function encodeFlac(buffer, bitDepth = 16, onProgress) {
  const sr = buffer.sampleRate, nCh = Math.min(2, buffer.numberOfChannels), total = buffer.length;
  const bs = 4096;
  const scale = bitDepth === 24 ? 8388607 : 32767;
  const chans = [];
  for (let c = 0; c < nCh; c++) {
    const f = buffer.getChannelData(c), q = new Int32Array(total);
    for (let i = 0; i < total; i++) q[i] = Math.round(Math.max(-1, Math.min(1, f[i])) * scale);
    chans.push(q);
  }
  const frames = [];
  let minF = Infinity, maxF = 0;
  const srCode = { 44100: 0b1001, 48000: 0b1010, 96000: 0b1011, 88200: 0b0011, 32000: 0b1000 }[sr] ?? 0b0000;
  const bpsCode = bitDepth === 24 ? 0b110 : 0b100;
  for (let f = 0, start = 0; start < total; f++, start += bs) {
    const n = Math.min(bs, total - start);
    const bw = new BitWriter(n * nCh * (bitDepth / 8) + 64);
    bw.write(0b11111111111110, 14); bw.write(0, 1); bw.write(0, 1);   // sync, reserved, fixed-blocksize
    const bsCode = n === 4096 ? 0b1100 : 0b0111;                        // 0111 = 後面帶 16-bit (n-1)
    bw.write(bsCode, 4); bw.write(srCode, 4);
    // 聲道：立體聲用 mid/side（通常更小），單聲道 0
    const useMS = nCh === 2;
    bw.write(nCh === 1 ? 0 : useMS ? 0b1010 : 0b0001, 4);
    bw.write(bpsCode, 3); bw.write(0, 1);
    utf8Num(bw, f);
    if (bsCode === 0b0111) bw.write(n - 1, 16);
    bw.align();
    bw.write(crc8(bw.buf, 0, bw.pos), 8);
    if (nCh === 1) encodeSubframe(bw, chans[0].subarray(start, start + n), bitDepth);
    else {
      const L = chans[0].subarray(start, start + n), R = chans[1].subarray(start, start + n);
      const M = new Int32Array(n), S = new Int32Array(n);
      for (let i = 0; i < n; i++) { M[i] = (L[i] + R[i]) >> 1; S[i] = L[i] - R[i]; }
      encodeSubframe(bw, M, bitDepth);
      encodeSubframe(bw, S, bitDepth + 1);    // side 需要多一個位元
    }
    bw.align();
    const c16 = crc16(bw.buf, 0, bw.pos);
    bw.write(c16, 16);
    const bytes = bw.bytes().slice();
    frames.push(bytes);
    minF = Math.min(minF, bytes.length); maxF = Math.max(maxF, bytes.length);
    if (onProgress && f % 40 === 0) { onProgress(start / total); await new Promise(r => setTimeout(r)); }
  }
  // STREAMINFO
  const si = new BitWriter(64);
  si.write(bs, 16); si.write(bs, 16);
  si.write(minF, 24); si.write(maxF, 24);
  si.write(sr, 20); si.write(nCh - 1, 3); si.write(bitDepth - 1, 5);
  si.write(Math.floor(total / 4294967296), 4); si.write(total >>> 0, 32);
  for (let i = 0; i < 16; i++) si.write(0, 8);   // MD5 留空（規格允許）
  const head = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34]);   // "fLaC" + last-block STREAMINFO 長 34
  return new Blob([head, si.bytes(), ...frames], { type: 'audio/flac' });
}
