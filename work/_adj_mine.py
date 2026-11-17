import json, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "scripts")
import adjudicate_ensembles as A

files = sys.argv[1].split(",")
out = []
for stem in files:
    p = A.CONTENT_DIR / (stem + ".md")
    fc = json.loads((A.FC_DIR / (stem + ".json")).read_text(encoding="utf-8"))
    body = p.read_text(encoding="utf-8").split("---", 2)[2]
    findings = []
    for angle, issues in fc["by_angle"].items():
        for i in issues:
            if i.get("kind") == "error":
                continue
            findings.append({**i, "angle": angle})

    def run(f):
        ctx = A.context_for(body, f.get("quote", ""))
        if not ctx:
            return {**f, "verdict": "UNLOCATABLE"}
        return {**f, **A.judge(fc.get("title", ""), ctx, f)}

    with ThreadPoolExecutor(max_workers=8) as pool:
        outs = list(pool.map(run, findings))
    conf = [o for o in outs if o["verdict"] == "CONFIRMED"]
    out.append({"stem": stem, "confirmed": conf, "total": len(outs)})

Path("work/_adj_mine_out.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
for r in out:
    print(r["stem"], "confirmed", len(r["confirmed"]), "/", r["total"])
