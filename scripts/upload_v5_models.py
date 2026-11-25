"""把 V5 的十個模型檔上傳到 GitHub Release（models-v2）。

用法：
    python scripts/upload_v5_models.py --check          # 只驗權杖與 repo，不上傳
    python scripts/upload_v5_models.py --only v5-refenc # 先傳一個小的，確認流程
    python scripts/upload_v5_models.py                  # 全部（已存在的不重傳）

檔案放在 work/v5_spike/out2/，清單以 assets/ai-models.json 裡 group == "v5" 的條目為準。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import urllib.error

sys.stdout.reconfigure(encoding='utf-8')
BASE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / "scripts"))
import upload_ai_model as up  # noqa: E402

MANIFEST = BASE / "assets" / "ai-models.json"
SRC = BASE / "work" / "v5_spike" / "out2"
TAG = "models-v2"


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()



def upload_asset(repo: str, tag: str, token: str, path: pathlib.Path) -> str:
    """把一個檔案上傳成 release 附件，附件名稱 = 檔名。"""
    api = f"https://api.github.com/repos/{repo}"
    try:
        rel = up.gh_api(token, "GET", f"{api}/releases/tags/{tag}")
        print(f"  沿用既有 release（id {rel['id']}）", flush=True)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        rel = up.gh_api(token, "POST", f"{api}/releases", {
            "tag_name": tag, "name": "AI 模型（網站工具用）",
            "body": "網站工具第一次使用時請使用者下載的模型檔；下載後在「模型」卡片選進來即可，不用解壓縮。",
        })
        print(f"  建立 release（id {rel['id']}）", flush=True)
    old = next((a for a in rel.get("assets", []) if a["name"] == path.name), None)
    if old:
        up.gh_api(token, "DELETE", f"{api}/releases/assets/{old['id']}")
        print("  刪掉舊的同名附件", flush=True)
    print(f"  上傳 {path.name}（{path.stat().st_size:,} bytes）…", flush=True)
    up.gh_api(token, "POST",
              f"https://uploads.github.com/repos/{repo}/releases/{rel['id']}/assets?name={path.name}",
              binary=path.read_bytes())
    return path.name


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--only", default=None)
    ap.add_argument("--tag", default=TAG)
    args = ap.parse_args()

    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    todo = [(k, v) for k, v in man.items() if v.get("group") == "v5"]
    todo.sort(key=lambda kv: kv[1]["size"])          # 小的先傳，先確認流程
    if args.only:
        todo = [(k, v) for k, v in todo if k == args.only]
        if not todo:
            raise SystemExit(f"清單裡沒有 {args.only}")

    token = up.gh_token()
    if not token:
        raise SystemExit("找不到 GitHub 權杖（先確認平常 git push 是通的）")
    repo = up.gh_repo()
    print(f"repo={repo}  tag={args.tag}  待傳 {len(todo)} 個檔、共 "
          f"{sum(v['size'] for _, v in todo)/1e9:.2f} GB")
    if args.check:
        api = f"https://api.github.com/repos/{repo}"
        rel = None
        try:
            rel = up.gh_api(token, "GET", f"{api}/releases/tags/{args.tag}")
            assets = {a["name"] for a in rel.get("assets", [])}
            print(f"  release 已存在，現有附件 {len(assets)} 個")
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            print("  release 還沒建立（第一次上傳時會自動建立）")
        for k, v in todo:
            p = SRC / v["file"]
            print(f"  {k:<14} {v['size']/1e6:6.0f} MB  {'有' if p.exists() else '缺檔案'}")
        return 0

    # 已經在 release 上的就跳過（重跑不會失敗）
    existing = set()
    try:
        rel = up.gh_api(token, "GET", f"https://api.github.com/repos/{repo}/releases/tags/{args.tag}")
        existing = {a["name"] for a in rel.get("assets", [])}
        print(f"  release 已有 {len(existing)} 個附件，會跳過", flush=True)
    except urllib.error.HTTPError:
        pass

    ok = fail = skipped = 0
    for i, (k, v) in enumerate(todo, 1):
        p = SRC / v["file"]
        if not p.exists():
            print(f"[{i}/{len(todo)}] {k} 缺檔案 {p}", flush=True)
            fail += 1
            continue
        if p.stat().st_size != v["size"]:
            print(f"[{i}/{len(todo)}] {k} 大小不符，跳過", flush=True)
            fail += 1
            continue
        if v["file"] in existing:
            print(f"[{i}/{len(todo)}] {k} 已在 release 上，跳過", flush=True)
            skipped += 1
            continue
        print(f"[{i}/{len(todo)}] {k}  {v['size']/1e6:.0f} MB …", flush=True)
        try:
            upload_asset(repo, args.tag, token, p)
            ok += 1
            print(f"    ✓ {v['file']}", flush=True)
        except Exception as exc:  # noqa: BLE001
            fail += 1
            print(f"    ✗ {type(exc).__name__}: {str(exc)[:200]}", flush=True)
    print(f"完成：成功 {ok}、跳過 {skipped}、失敗 {fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
