import json, re, sys
from pathlib import Path

DIR = Path(".audit-work/foundation-phaseb1")

# map: diff file -> (baseline path, candidate path, out edits json)
JOBS = [
    ("diff-FoundationProject.jsonc.txt", "remote-src/base44/entities/FoundationProject.jsonc",
     "candidate-src/FoundationProject.jsonc", "edits-FoundationProject.json"),
    ("diff-FoundationInventory.jsonc.txt", "remote-src/base44/entities/FoundationInventory.jsonc",
     "candidate-src/FoundationInventory.jsonc", "edits-FoundationInventory.json"),
    ("diff-foundationCalc.txt", "remote-src/src/components/estimator/foundation/foundationCalc.js",
     "candidate-src/foundationCalc.js", "edits-foundationCalc.json"),
    ("diff-foundationInputValidation.txt", "remote-src/src/components/estimator/foundation/foundationInputValidation.js",
     "candidate-src/foundationInputValidation.js", "edits-foundationInputValidation.json"),
    ("diff-foundationCatalogIntegrity.txt", "remote-src/src/components/estimator/foundation/foundationCatalogIntegrity.js",
     "candidate-src/foundationCatalogIntegrity.js", "edits-foundationCatalogIntegrity.json"),
]

HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")

def parse_hunks(diff_text):
    lines = diff_text.split("\n")
    hunks, cur = [], None
    for ln in lines:
        m = HUNK.match(ln)
        if m:
            if cur: hunks.append(cur)
            cur = {"old_start": int(m.group(1)), "lines": []}
        elif cur is not None and ln[:1] in (" ", "+", "-"):
            cur["lines"].append(ln)
    if cur: hunks.append(cur)
    return hunks

def apply_edits(text, edits):
    for e in edits:
        assert text.count(e["old_text"]) == 1, f"anchor not unique: {e['old_text'][:60]!r} (count={text.count(e['old_text'])})"
        text = text.replace(e["old_text"], e["new_text"], 1)
    return text

for diff_name, base_path, cand_path, out_name in JOBS:
    diff_text = (DIR / diff_name).read_text(encoding="utf-8")
    base = (DIR / base_path).read_text(encoding="utf-8")
    cand = (DIR / cand_path).read_text(encoding="utf-8")
    # normalize: remote file may carry a trailing newline baseline lacks
    base_norm = base if base.endswith("\n") == cand.endswith("\n") else base
    hunks = parse_hunks(diff_text)
    edits = []
    for h in hunks:
        old_lines = [l[1:] for l in h["lines"] if l[0] in (" ", "-")]
        new_lines = [l[1:] for l in h["lines"] if l[0] in (" ", "+")]
        edits.append({"old_text": "\n".join(old_lines) + "\n", "new_text": "\n".join(new_lines) + "\n"})
    # verify: applying to baseline must reproduce candidate modulo trailing newline
    result = apply_edits(base, edits)
    same = result == cand or result == cand + "\n" or result.rstrip("\n") == cand.rstrip("\n")
    status = "EXACT" if result == cand else ("EXACT+NL" if result == cand + "\n" else ("EXACT-NL" if result.rstrip("\n") == cand.rstrip("\n") else "MISMATCH"))
    print(f"{out_name}: {len(edits)} edits -> {status}")
    if not same:
        # show first divergence
        for i,(a,b) in enumerate(zip(result, cand)):
            if a!=b:
                print("  first diff at char", i, repr(result[i-20:i+20]), "VS", repr(cand[i-20:i+20]))
                break
        else:
            print("  length diff", len(result), len(cand))
        sys.exit(1)
    (DIR / out_name).write_text(json.dumps(edits), encoding="utf-8")
print("all edits verified against candidates")
