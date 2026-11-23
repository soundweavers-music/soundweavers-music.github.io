"""把 OpenVoice V2 的「音色轉換器」匯出成兩個 ONNX，讓瀏覽器能換音色（複製自己的聲音）。

兩個模型
--------
1. `openvoice_refenc.onnx`：線性頻譜 → 音色向量（256 維）。使用者錄一段自己的聲音，
   這一步把「音色」抽出來。
2. `openvoice_conv.onnx`：線性頻譜 ＋ 來源音色 ＋ 目標音色 → 音訊（22.05 kHz）。
   把 MeloTTS 念出來的聲音，換成目標音色。

數學跟官方 `openvoice/api.py` 走同一條路：
    spec = |STFT|（n_fft 1024、hop 256、win 1024、reflect pad 384、hann）
    z    = enc_q(spec, g_src, tau)
    z_hat= flow(flow(z, g_src), g_tgt, reverse=True)
    audio= dec(z_hat, g_tgt)
這裡把 `tau` 固定成 0（z = 平均値，不要加隨機噪音）：配音要可重現，同一句跑兩次結果一樣。

需要
----
    work/models/openvoice/checkpoint.pth      # HF: myshell-ai/OpenVoiceV2 converter/
    work/models/openvoice/config.json
    work/models/openvoice/OpenVoice-main/     # myshell-ai/OpenVoice 原始碼

用法
----
    python scripts/export_openvoice_onnx.py            # 匯出 + 數值驗證
    python scripts/export_openvoice_onnx.py --check-only
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

import numpy as np
import torch

BASE = pathlib.Path(__file__).resolve().parent.parent
OV = BASE / "work" / "models" / "openvoice"
SRC = OV / "OpenVoice-main"
CKPT = OV / "checkpoint.pth"
CFG = OV / "config.json"
OUT_CONV = OV / "openvoice_conv.onnx"
OUT_REF = OV / "openvoice_refenc.onnx"

sys.path.insert(0, str(SRC))


def build_model(device="cpu"):
    from openvoice import utils
    from openvoice.models import SynthesizerTrn

    hps = utils.get_hparams_from_file(str(CFG))
    model = SynthesizerTrn(
        len(getattr(hps, "symbols", [])),
        hps.data.filter_length // 2 + 1,
        n_speakers=hps.data.n_speakers,
        **hps.model,
    ).to(device)
    ck = torch.load(str(CKPT), map_location=device, weights_only=False)
    missing, unexpected = model.load_state_dict(ck["model"], strict=False)
    print(f"載入 checkpoint：缺 {len(missing)} 個、多 {len(unexpected)} 個 key")
    model.eval()
    return model, hps


class ConvWrap(torch.nn.Module):
    """spec + 兩個音色向量 → 音訊（tau=0，不加隨機噪音）"""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, spec, g_src, g_tgt):
        t = torch.tensor([spec.shape[-1]], dtype=torch.long)
        audio = self.model.voice_conversion(spec, t, sid_src=g_src, sid_tgt=g_tgt, tau=0.0)[0]
        return audio


class RefWrap(torch.nn.Module):
    """spec → 音色向量（跟 api.extract_se 一樣：ref_enc(spec.transpose(1,2))）"""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, spec):
        return self.model.ref_enc(spec.transpose(1, 2)).unsqueeze(-1)


def export(model):
    T = 200
    spec = torch.rand(1, 513, T) * 5
    g1 = torch.randn(1, 256, 1)
    g2 = torch.randn(1, 256, 1)
    with torch.no_grad():
        ref_out = RefWrap(model)(spec)
        conv_out = ConvWrap(model)(spec, g1, g2)
    print("PyTorch：音色向量", tuple(ref_out.shape), "、音訊", tuple(conv_out.shape))

    torch.onnx.export(RefWrap(model), (spec,), str(OUT_REF), input_names=["spec"],
                      output_names=["g"], opset_version=17,
                      dynamic_axes={"spec": {2: "T"}, "g": {1: "T"}},
                      do_constant_folding=True)
    print(f"  {OUT_REF.name}  {OUT_REF.stat().st_size/1048576:.1f} MB")

    torch.onnx.export(ConvWrap(model), (spec, g1, g2), str(OUT_CONV),
                      input_names=["spec", "g_src", "g_tgt"], output_names=["audio"],
                      opset_version=17,
                      dynamic_axes={"spec": {2: "T"}, "audio": {2: "T*256"}},
                      do_constant_folding=True)
    print(f"  {OUT_CONV.name}  {OUT_CONV.stat().st_size/1048576:.1f} MB")
    def tonp(t):  # torch 2.3 + numpy 2.x 的 .numpy() 會壞掉，退回 tolist
        try:
            return t.detach().cpu().float().numpy()
        except RuntimeError:
            return np.array(t.detach().cpu().float().tolist(), dtype=np.float32)

    return tonp(ref_out), tonp(conv_out), tonp(spec), tonp(g1), tonp(g2)


def check(ref_out, conv_out, spec, g1, g2):
    import onnxruntime as ort
    ok = True

    s = ort.InferenceSession(str(OUT_REF), providers=["CPUExecutionProvider"])
    r = s.run(None, {"spec": spec})[0]
    d = np.abs(r - ref_out).max()
    print(f"ref_enc：ONNX vs PyTorch 最大差 {d:.2e}")
    ok = ok and d < 1e-3

    # 換一個長度，確認 T 是動態的
    T2 = 331
    spec2 = (spec[:, :, :T2] if spec.shape[-1] >= T2 else np.concatenate([spec, spec], -1)[:, :, :T2])
    r2 = s.run(None, {"spec": spec2})[0]
    print(f"ref_enc：T={T2} 也跑得動 → {tuple(r2.shape)}")
    ok = ok and tuple(r2.shape) == (1, 256, 1)

    c = ort.InferenceSession(str(OUT_CONV), providers=["CPUExecutionProvider"])
    a = c.run(None, {"spec": spec, "g_src": g1, "g_tgt": g2})[0]
    d2 = np.abs(a - conv_out).max()
    rel = d2 / (np.abs(conv_out).max() + 1e-9)
    print(f"voice_conversion：ONNX vs PyTorch 最大差 {d2:.2e}（相對 {rel:.2e}），音訊 {tuple(a.shape)}")
    ok = ok and rel < 1e-3
    a2 = c.run(None, {"spec": spec2, "g_src": g1, "g_tgt": g2})[0]
    print(f"voice_conversion：T={T2} → 音訊 {tuple(a2.shape)}（應該是 {T2*256} 個取樣）")
    ok = ok and a2.shape[-1] == T2 * 256
    return ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check-only", action="store_true")
    args = ap.parse_args()

    if args.check_only:
        if not (OUT_CONV.exists() and OUT_REF.exists()):
            print("還沒有匯出過，先不要加 --check-only")
            return 2
        model, _ = build_model()
        ref_out, conv_out, spec, g1, g2 = export(model) if not args.check_only else (None,) * 5
        return 0

    if not CKPT.exists() or not CFG.exists() or not SRC.exists():
        print(f"缺檔案：{CKPT} / {CFG} / {SRC}")
        return 2
    model, hps = build_model()
    print(f"取樣率 {hps.data.sampling_rate}、hop {hps.data.hop_length}、n_fft {hps.data.filter_length}")
    ref_out, conv_out, spec, g1, g2 = export(model)
    ok = check(ref_out, conv_out, spec, g1, g2)
    print("驗證通過" if ok else "！驗證沒過")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
