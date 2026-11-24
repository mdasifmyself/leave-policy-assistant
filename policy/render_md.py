"""Writes policy/policy.md (for people) from policy/policy_sections.json (what the assistant reads).

  python3 policy/render_md.py

The JSON file is the source: edit the wording there, then run this so both files say the same thing.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
doc = json.loads((HERE / "policy_sections.json").read_text())

NOTE = ("Northfield Trading Ltd is a fictitious company. This document is a sample written for "
        "demonstration only and is not legal advice.")
lines = [f"# {doc['policy']}", "",
         f"Document {doc['number']} · version {doc['version']} · effective {doc['effective']}", "",
         f"> {NOTE}", ""]
chapter = None
for s in doc["sections"]:
    if s["id"] == "Header":
        continue
    top = re.match(r"\d+", s["id"]).group(0)
    if top != chapter:
        chapter = top
        lines += [f"## {top}. {s['heading']}", ""]
    lines += [f"**{s['id']}** {s['text']}", ""]
(HERE / "policy.md").write_text("\n".join(lines).rstrip() + "\n")
print("wrote policy.md:", len(doc["sections"]) - 1, "numbered clauses")
