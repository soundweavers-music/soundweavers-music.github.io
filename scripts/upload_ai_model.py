"""把語音辨識模型（Fun-ASR-Nano）上傳到 GitHub Releases（或 Hugging Face），
讓它不用再放進 repo。

為什麼
------
模型 251 MB，GitHub 單檔上限 100 MB、站台也有 1 GB 建議上限；改由使用者第一次使用時
自行下載（網站的 CSP 不允許頁面自己去抓別人的伺服器，所以是「按連結下載 → 選進網頁 →
驗證 sha256 → 存進瀏覽器」）。Release 附件單檔上限 2 GB、下載免費，也不用另外註冊帳號。

用法
----
    python scripts/upload_ai_model.py                    # 合併 → 驗雜湊 → 發 GitHub Release
    python scripts/upload_ai_model.py --dry-run          # 只合併、算雜湊，不上傳
    python scripts/upload_ai_model.py --keep             # 合併後把檔案留在 work/models/
    python scripts/upload_ai_model.py --github-release v2  # 換一個 tag
    python scripts/upload_ai_model.py --huggingface      # 改成傳到 Hugging Face

上傳到 GitHub 用的權杖（不需要自己做任何事，順序如下）：
  1. 環境變數 GH_TOKEN 或 GITHUB_TOKEN
  2. 沒有就問 git 的憑證管理員（你平常 git push 用的那組，不會被印出來）
  3. 都沒有 → 腳本會把合併好的檔案留在 work/models/，請你自己拖到 release 頁面上傳

上傳完腳本會自動改好 assets/ai-models.json 的 url / sha256 / size。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

BASE = pathlib.Path(__file__).resolve().parent.parent
PARTS = [BASE / "assets" / "chord-ai" / f"funasr_nano.onnx.part{k}" for k in range(3)]
LICENSE = BASE / "assets" / "chord-ai" / "LICENSE-FunASR-Nano.txt"
MANIFEST = BASE / "assets" / "ai-models.json"
MODEL_KEY = "funasr-nano"
FILE_NAME = "funasr_nano.onnx"
EXPECTED_SHA = "9dc6e72aa8bc6f5966cf2857a0ce3a425b1d72e91500e147d66329f407c017a1"
EXPECTED_SIZE = 263531902
DEFAULT_TAG = "models-v1"


def merge(dst: pathlib.Path) -> tuple[int, str]:
    h = hashlib.sha256()
    n = 0
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("wb") as out:
        for p in PARTS:
            if not p.exists():
                raise SystemExit(f"找不到 {p}（模型分塊應該在 assets/chord-ai/）")
            data = p.read_bytes()
            h.update(data)
            out.write(data)
            n += len(data)
    return n, h.hexdigest()


# ── GitHub ──────────────────────────────────────────────────────────────
def gh_repo() -> str:
    """從 origin 的網址推出 owner/repo。"""
    try:
        url = subprocess.run(["git", "remote", "get-url", "origin"], cwd=BASE,
                             capture_output=True, text=True, check=True).stdout.strip()
    except Exception:  # noqa: BLE001
        raise SystemExit("讀不到 git remote origin")
    for pre in ("https://github.com/", "git@github.com:", "ssh://git@github.com/"):
        if url.startswith(pre):
            return url[len(pre):].removesuffix("/").removesuffix(".git")
    raise SystemExit(f"看不懂 origin 網址：{url}")


def gh_token() -> str | None:
    tok = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if tok:
        return tok
    try:
        # 用 git 平常存放的憑證（不會印出來）
        p = subprocess.run(["git", "credential", "fill"], cwd=BASE, text=True,
                           input="protocol=https\nhost=github.com\n\n", capture_output=True)
        for line in p.stdout.splitlines():
            if line.startswith("password="):
                return line[len("password="):]
    except Exception:  # noqa: BLE001
        pass
    return None


def gh_api(token: str, method: str, url: str, body: dict | None = None,
           binary: bytes | None = None) -> dict:
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    elif binary is not None:
        data = binary
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "zhiyin-upload-ai-model")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    elif binary is not None:
        req.add_header("Content-Type", "application/octet-stream")
    with urllib.request.urlopen(req, timeout=900) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def upload_release(path: pathlib.Path, tag: str, token: str) -> str:
    repo = gh_repo()
    api = f"https://api.github.com/repos/{repo}"
    print(f"GitHub：{repo}　tag：{tag}")

    rel = None
    try:
        rel = gh_api(token, "GET", f"{api}/releases/tags/{tag}")
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
    if rel is None:
        rel = gh_api(token, "POST", f"{api}/releases", {
            "tag_name": tag,
            "name": "AI 模型（網站工具用）",
            "body": ("網站工具（歌詞辨識、配音剪輯）第一次使用時會請使用者下載的模型檔。\n"
                     "下載後在工具的「模型」卡片按「選擇已下載的檔案…」選進來即可，不需要解壓縮。"),
        })
        print(f"  建立 release（id {rel['id']}）")
    else:
        print(f"  沿用既有 release（id {rel['id']}）")

    asset = next((a for a in rel.get("assets", []) if a["name"] == FILE_NAME), None)
    if asset:
        print("  刪掉舊的同名附件…")
        gh_api(token, "DELETE", f"{api}/releases/assets/{asset['id']}")

    print(f"  上傳 {path.name}（{path.stat().st_size:,} bytes）…")
    asset = gh_api(token, "POST",
                   f"https://uploads.github.com/repos/{repo}/releases/{rel['id']}/assets"
                   f"?name={FILE_NAME}",
                   binary=path.read_bytes())
    url = asset.get("browser_download_url") or \
        f"https://github.com/{repo}/releases/download/{tag}/{FILE_NAME}"
    print(f"  附件 id {asset.get('id')}")
    return url


# ── Hugging Face ────────────────────────────────────────────────────────
def upload_hf(path: pathlib.Path, repo: str) -> str:
    try:
        from huggingface_hub import HfApi
    except ImportError:
        raise SystemExit("需要 huggingface_hub：pip install huggingface_hub")
    api = HfApi()
    try:
        who = api.whoami()
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"還沒有登入 Hugging Face：{exc}\n請先執行 `huggingface-cli login`")
    print(f"Hugging Face 登入身分：{who.get('name')}")
    api.create_repo(repo, repo_type="model", exist_ok=True)
    api.upload_file(path_or_fileobj=str(path), path_in_repo=FILE_NAME,
                    repo_id=repo, repo_type="model")
    if LICENSE.exists():
        api.upload_file(path_or_fileobj=str(LICENSE), path_in_repo="LICENSE-FunASR-Nano.txt",
                        repo_id=repo, repo_type="model")
    return f"https://huggingface.co/{repo}/resolve/main/{FILE_NAME}"


# ── 清單 ────────────────────────────────────────────────────────────────
def update_manifest(url: str, size: int, sha: str) -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entry = data.setdefault(MODEL_KEY, {})
    entry["file"] = FILE_NAME
    entry["size"] = size
    entry["sha256"] = sha
    entry["url"] = url
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  已更新 {MANIFEST.relative_to(BASE)}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None,
                    help="合併後的檔案路徑（預設 work/models/funasr_nano.onnx）")
    ap.add_argument("--dry-run", action="store_true", help="只合併與驗證，不上傳")
    ap.add_argument("--keep", action="store_true", help="合併後把檔案留在 --out，不要刪掉")
    ap.add_argument("--github-release", nargs="?", const=DEFAULT_TAG, default=None,
                    metavar="TAG", help=f"發 GitHub Release 附件（預設 tag {DEFAULT_TAG}）")
    ap.add_argument("--huggingface", action="store_true", help="改上傳到 Hugging Face")
    ap.add_argument("--repo", default="soundweavers-music/ai-models",
                    help="Hugging Face repo（只有 --huggingface 會用到）")
    args = ap.parse_args()

    out = pathlib.Path(args.out) if args.out else BASE / "work" / "models" / FILE_NAME
    print("合併 3 個分塊…")
    size, sha = merge(out)
    print(f"  檔案 {out}")
    print(f"  大小 {size:,} bytes（預期 {EXPECTED_SIZE:,}）")
    print(f"  sha256 {sha}")
    if size != EXPECTED_SIZE or sha != EXPECTED_SHA:
        print("！合併結果與預期不符，先不要上傳", file=sys.stderr)
        return 1

    if args.dry_run:
        print("dry-run：沒有上傳")
        if not args.keep:
            out.unlink(missing_ok=True)
        return 0

    url = None
    if args.huggingface:
        url = upload_hf(out, args.repo)
    else:
        tag = args.github_release or DEFAULT_TAG
        token = gh_token()
        if not token:
            print(file=sys.stderr)
            print("找不到 GitHub 權杖，改成手動上傳（檔案已經合併好了）：", file=sys.stderr)
            print(f"  1. 開 https://github.com/{gh_repo()}/releases/new", file=sys.stderr)
            print(f"  2. tag 填 {tag}，標題隨便", file=sys.stderr)
            print(f"  3. 把 {out} 拖進附件區，發佈", file=sys.stderr)
            print("  4. 再把下面這行寫進 assets/ai-models.json 的 url：", file=sys.stderr)
            print(f"     https://github.com/{gh_repo()}/releases/download/{tag}/{FILE_NAME}",
                  file=sys.stderr)
            print("\n（或設定環境變數 GH_TOKEN=<有 repo 權限的 token> 後重跑本腳本）",
                  file=sys.stderr)
            return 1
        url = upload_release(out, tag, token)

    update_manifest(url, size, sha)
    print("下載網址：")
    print(f"  {url}")
    print("接下來重新建站（python scripts/build_static_site.py），"
          "確認後就可以把 assets/chord-ai/funasr_nano.onnx.part* 從 repo 移除（git rm）。")
    if not args.keep:
        out.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
