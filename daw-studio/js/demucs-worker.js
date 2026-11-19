// AI 人聲分離（Demucs v4 htdemucs）背景執行緒
// - ONNX Runtime Web（WebGPU 優先，不支援時用 CPU/wasm）從本站 assets/vendor/ort-webgpu/ 載入
// - 模型檔由使用者自己下載後交給這裡（ArrayBuffer），這個執行緒不會連到任何外部伺服器
// - 前處理（STFT）與後處理（iSTFT、分段重疊相加）直接使用 demucs-web 的程式碼
import { DemucsProcessor } from './demucs/processor.js';
import { CONSTANTS } from './demucs/constants.js';

let ort = null, proc = null, backend = '';

async function ensure(vendor, model, prefer) {
  if (!ort) {
    ort = await import(vendor + 'ort.webgpu.min.mjs');
    ort.env.wasm.wasmPaths = vendor;
    ort.env.wasm.numThreads = 1;      // 多執行緒需要 cross-origin isolation，靜態網站做不到
    ort.env.wasm.proxy = false;
  }
  if (proc) return proc;
  const gpu = prefer !== 'cpu' && 'gpu' in navigator && !!(await navigator.gpu.requestAdapter().catch(() => null));
  const tries = gpu ? [['webgpu'], ['wasm']] : [['wasm']];
  let lastErr = null;
  for (const ep of tries) {
    try {
      const p = new DemucsProcessor({
        ort,
        sessionOptions: { executionProviders: ep, graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false },
        onProgress: ({ progress, currentSegment, totalSegments }) => postMessage({ type: 'progress', progress, seg: currentSegment, total: totalSegments }),
      });
      postMessage({ type: 'status', text: ep[0] === 'webgpu' ? '載入模型到顯示卡（WebGPU）…' : '載入模型（CPU）…' });
      // ORT 會把 buffer 轉移給 wasm；複製一份，WebGPU 失敗時還能用 CPU 再試
      await p.loadModel(model.slice(0));
      proc = p; backend = ep[0];
      return proc;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('無法載入模型');
}

self.onmessage = async e => {
  const d = e.data;
  try {
    if (d.type === 'separate') {
      let p = await ensure(d.vendor, d.model, d.prefer);
      postMessage({ type: 'backend', backend });
      const t0 = performance.now();
      let r;
      try { r = await p.separate(new Float32Array(d.L), new Float32Array(d.R)); }
      catch (err) {
        // 有些顯示卡驅動在 WebGPU 上跑某些運算會失敗：自動改用 CPU 重來
        if (backend !== 'webgpu') throw err;
        postMessage({ type: 'status', text: `顯示卡運算失敗（${String(err && err.message || err).slice(0, 60)}），改用 CPU 重新計算…` });
        proc = null;
        p = await ensure(d.vendor, d.model, 'cpu');
        postMessage({ type: 'backend', backend });
        r = await p.separate(new Float32Array(d.L), new Float32Array(d.R));
      }
      const n = d.L.byteLength / 4;
      const inst = [new Float32Array(n), new Float32Array(n)];
      for (const k of ['drums', 'bass', 'other']) {
        const a = r[k].left, b = r[k].right;
        for (let i = 0; i < n; i++) { inst[0][i] += a[i]; inst[1][i] += b[i]; }
      }
      const out = { type: 'done', sr: CONSTANTS.SAMPLE_RATE, ms: performance.now() - t0, backend,
        vocal: [r.vocals.left, r.vocals.right], inst,
        stems: d.stems ? { drums: [r.drums.left, r.drums.right], bass: [r.bass.left, r.bass.right], other: [r.other.left, r.other.right] } : null };
      const tr = [r.vocals.left.buffer, r.vocals.right.buffer, inst[0].buffer, inst[1].buffer];
      if (d.stems) for (const k of ['drums', 'bass', 'other']) tr.push(r[k].left.buffer, r[k].right.buffer);
      postMessage(out, tr);
    } else if (d.type === 'release') {
      proc = null;
    }
  } catch (err) {
    proc = null;
    postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
