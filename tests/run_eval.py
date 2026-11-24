"""Runs every test question against the live n8n webhook and records what really came back.

  python3 tests/run_eval.py              # all cases once
  python3 tests/run_eval.py --runs 3     # each case 3 times (catches answers that change between runs)
  python3 tests/run_eval.py T09 T27      # only these cases

Writes evaluation/results.csv (every run) and evaluation/summary.md.
A pass needs: the right outcome(s), a correct citation where one is expected,
the exact unknown sentence, the required facts, and none of the forbidden ones.
Read the answers in results.csv as well; the script only catches the obvious failures.
"""
import csv, json, os, pathlib, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = pathlib.Path.home() / ".config/asif-demos"
# The n8n webhook address and its secret: from the environment, or from a private local config.
URL = os.environ.get("N8N_WEBHOOK_URL") or (CFG / "n8n_url").read_text().strip().rstrip("/") + "/webhook/policy-assistant/ask"
KEY = os.environ.get("N8N_WEBHOOK_KEY") or (CFG / "policy_webhook_secret").read_text().strip()
UNKNOWN = "I don't know, please contact HR."


def ask(q, lang):
    req = urllib.request.Request(URL, method="POST", data=json.dumps({"question": q, "lang": lang, "debug": True}).encode(),
                                 headers={"Content-Type": "application/json", "X-Assistant-Key": KEY})
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = {"ok": False, "http": e.code, "raw": e.read().decode()[:300]}
    except Exception as e:  # network / timeout
        body = {"ok": False, "raw": repr(e)}
    return body, round(time.time() - t, 1)


def judge(case, res):
    probs = []
    if not res.get("ok"):
        return ["technical error: " + str(res.get("raw") or res.get("message"))[:1500]]
    parts = res["parts"]
    statuses = [p["status"] for p in parts]
    exp = case["expect"]
    if case.get("all"):
        if sorted(set(statuses)) != sorted(set(exp)):
            probs.append(f"outcomes {statuses}, expected all of {exp}")
    elif not set(statuses) <= set(exp) or not statuses:
        probs.append(f"outcome {statuses}, expected one of {exp}")
    for p in parts:
        if p["status"] in ("unknown", "out_of_scope") and p["text"] != UNKNOWN:
            probs.append("unknown sentence not exact")
        if p["status"] == "unknown" and p["citations"]:
            probs.append("unknown has a citation")
    text = " ".join(p["text"] for p in parts)
    text_bn = " ".join(p.get("text_bn", "") for p in parts)
    cited = {c["section"] for p in parts for c in p["citations"]}
    if case.get("cite") and "answer" in statuses + ["privacy"] and any(s in ("answer", "privacy") for s in statuses):
        if not cited & set(case["cite"]):
            probs.append(f"cited {sorted(cited)}, expected one of {case['cite']}")
    if "answer" in statuses:
        for m in case.get("must", []):
            if not re.search(m, text, re.I):
                probs.append(f"missing /{m}/")
    for m in case.get("must_text", []):
        if not re.search(m, text, re.I):
            probs.append(f"reply missing /{m}/")
    for m in case.get("must_not", []):
        if re.search(m, text, re.I):
            probs.append(f"forbidden /{m}/")
    if case.get("lang") == "bn" and "answer" in statuses:
        for m in case.get("must_bn", []):
            if not re.search(m, text_bn):
                probs.append(f"bangla missing /{m}/")
    return probs


def main():
    args = sys.argv[1:]
    runs = 1
    if "--runs" in args:
        i = args.index("--runs"); runs = int(args[i + 1]); del args[i:i + 2]
    cases = json.loads((ROOT / "tests/cases.json").read_text())
    if args:
        cases = [c for c in cases if c["id"] in args]
    jobs = [(c, r) for c in cases for r in range(runs)]

    def one(job):
        c, r = job
        res, secs = ask(c["q"], c.get("lang", "en"))
        return c, r, res, secs, judge(c, res)

    with ThreadPoolExecutor(4) as ex:
        results = list(ex.map(one, jobs))

    out = ROOT / "evaluation"; out.mkdir(exist_ok=True)
    stamp = time.strftime("%Y-%m-%d %H:%M %Z")
    with open(out / "results.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "run", "question", "outcomes", "answer", "answer_bn", "citations", "attempts",
                    "seconds", "pass", "problems"])
        for c, r, res, secs, probs in results:
            parts = res.get("parts") or []
            w.writerow([c["id"], r + 1, c["q"], " + ".join(p["status"] for p in parts),
                        " | ".join(p["text"] for p in parts), " | ".join(p.get("text_bn", "") for p in parts),
                        " ".join(c2["section"] for p in parts for c2 in p["citations"]),
                        (res.get("meta") or {}).get("attempts"), secs, "PASS" if not probs else "FAIL",
                        "; ".join(probs)])
    passed = sum(1 for *_, p in results if not p)
    model = next(((r.get("meta") or {}).get("model") for _, _, r, _, _ in results if r.get("meta")), "?")
    secs = sorted(s for *_, s, _ in results)
    lines = [f"# Evaluation summary", "", f"Run: {stamp} · model `{model}` · {len(cases)} cases × {runs} run(s)", "",
             f"**{passed} / {len(results)} runs passed.** Median time {secs[len(secs)//2]} s, slowest {secs[-1]} s.", ""]
    fails = [(c, r, p) for c, r, _, _, p in results if p]
    if fails:
        lines += ["| Case | Run | Problem |", "|---|---|---|"] + [f"| {c['id']} | {r+1} | {'; '.join(p)} |" for c, r, p in fails]
    (out / "summary.md").write_text("\n".join(lines) + "\n")
    if not args:  # a full run updates the numbers shown on the app's "How it works" page
        (ROOT / "web/lib/eval.json").write_text(json.dumps({
            "passed": passed, "runs": len(results), "cases": len(cases), "repeats": runs,
            "date": time.strftime("%d %b %Y"), "model": model}))
    print("\n".join(lines))
    for c, r, res, secs, probs in results:
        parts = res.get("parts") or []
        flag = "ok " if not probs else "XX "
        print(f"{flag}{c['id']:5} {secs:5}s a{(res.get('meta') or {}).get('attempts')} "
              f"{'+'.join(p['status'] for p in parts):18} {[x['section'] for p in parts for x in p['citations']]} "
              f"{' | '.join(p['text'] for p in parts)[:230]}")
        if (res.get("meta") or {}).get("retry_reasons"):
            print("        retry:", res["meta"]["retry_reasons"])


if __name__ == "__main__":
    main()
