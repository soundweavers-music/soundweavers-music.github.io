"""把語音辨識模型（Fun-ASR-Nano）上傳到 Hugging Face，讓它不用再放進 GitHub repo。

為什麼
------
模型 251 MB，GitHub 單檔上限 100 MB、repo 也有 1 GB 的建議上限；改由使用者第一次使用時
自行下載（網站的 CSP 不允許頁面自己去抓別人的伺服器，所以是「按連結下載 → 選進網頁 →
驗證 sha256 → 存進瀏覽器」）。

用法
----
    huggingface-cli login                 # 只需要做一次（或設環境變數 HF_TOKEN）
    python scripts/upload_ai_model.py     # 預設上傳到 soundweavers-music/ai-models
    python scripts/upload_ai_model.py --repo 你的帳號/ai-models
    python scripts/upload_ai_model.py --dry-run   # 只合併、算雜湊，不上傳

上傳完記得確認 assets/ai-models.json 裡的 url 和 sha256 與這裡印出來的一致。
"""
from __future__ import annotations

import argparse
import hashlib
import pathlib
import sys
import tempfile

BASE = pathlib.Path(__file__).resolve().parent.parent
PARTS = [BASE / "assets" / "chord-ai" / f"funasr_nano.onnx.part{k}" for k in range(3)]
LICENSE = BASE / "assets" / "chord-ai" / "LICENSE-FunASR-Nano.txt"
EXPECTED_SHA = "9dc6e72aa8bc6f5966cf2857a0ce3a425b1d72e91500e147d66329f407c017a1"
EXPECTED_SIZE = 263531902


def merge(dst: pathlib.Path) -> tuple[int, str]:
    h = hashlib.sha256()
    n = 0
    with dst.open("wb") as out:
        for p in PARTS:
            if not p.exists():
                raise SystemExit(f"找不到 {p}（模型分塊應該在 assets/chord-ai/）")
            data = p.read_bytes()
            h.update(data)
            out.write(data)
            n += len(data)
    return n, h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="soundweavers-music/ai-models",
                    help="Hugging Face 模型 repo（預設 soundweavers-music/ai-models）")
    ap.add_argument("--dry-run", action="store_true", help="只合併與驗證，不上傳")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as td:
        out = pathlib.Path(td) / "funasr_nano.onnx"
        print("合併 3 個分塊…")
        size, sha = merge(out)
        print(f"  大小 {size:,} bytes（預期 {EXPECTED_SIZE:,}）")
        print(f"  sha256 {sha}")
        if size != EXPECTED_SIZE or sha != EXPECTED_SHA:
            print("！合併結果與預期不符，先不要上傳", file=sys.stderr)
            return 1
        if args.dry_run:
            print("dry-run：沒有上傳")
            return 0

        try:
            from huggingface_hub import HfApi
        except ImportError:
            print("需要 huggingface_hub：pip install huggingface_hub", file=sys.stderr)
            return 1

        api = HfApi()
        try:
            who = api.whoami()
        except Exception as exc:  # noqa: BLE001
            print(f"還沒有登入 Hugging Face：{exc}", file=sys.stderr)
            print("請先執行 `huggingface-cli login`，或設定環境變數 HF_TOKEN", file=sys.stderr)
            return 1
        print(f"登入身分：{who.get('name')}")

        api.create_repo(args.repo, repo_type="model", exist_ok=True)
        print(f"上傳到 https://huggingface.co/{args.repo} …")
        api.upload_file(path_or_fileobj=str(out), path_in_repo="funasr_nano.onnx",
                        repo_id=args.repo, repo_type="model")
        if LICENSE.exists():
            api.upload_file(path_or_fileobj=str(LICENSE), path_in_repo="LICENSE-FunASR-Nano.txt",
                            repo_id=args.repo, repo_type="model")
        print("完成。下載網址（要放進 assets/ai-models.json 的 url）：")
        print(f"  https://huggingface.co/{args.repo}/resolve/main/funasr_nano.onnx")
        print("完成後就可以把 assets/chord-ai/funasr_nano.onnx.part* 從 repo 移除（git rm）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
