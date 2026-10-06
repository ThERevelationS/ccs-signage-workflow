"""Explain candidate identity gaps without changing live records or certifying offices."""
import importlib.util
import json
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("identity", ROOT / "scripts/reconcile-ohio-permitting-identities.py")
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)

def index_reference(ref):
    rows = []
    for bucket in ["candidates", "status_review", "hierarchy_reference"]:
        for c in ref[bucket]:
            kind = c.get("queue_type") or {"25": "city", "47": "village", "44": "township", "06": "county"}.get(c["lsadc"], "unknown")
            rows.append({**c, "reference_bucket": bucket, "identity_type": kind})
    result = {}
    for row in rows:
        result.setdefault(identity.normalize(row["base_name"]), []).append(row)
    return result

def classify(row, index):
    hits = index.get(identity.normalize(row["name"]), [])
    county = identity.normalize(row.get("county"))
    # Incorporated-place records lack county membership; do not invent one.
    scoped = [c for c in hits if not county or not c.get("county_name") or identity.normalize(c["county_name"]) == county]
    compatible = {"municipal": {"city", "village"}, "municipality": {"city", "village"}}.get(row["type"], {row["type"]})
    active = [c for c in scoped if c["reference_bucket"] == "candidates"]
    if any(c["identity_type"] in compatible for c in active):
        reason = "active_name_candidate_requires_identity_review"
    elif active:
        reason = "possible_locality_type_mismatch"
    elif any(c["reference_bucket"] == "status_review" for c in scoped):
        reason = "inactive_or_consolidated_status_review"
    elif scoped:
        reason = "hierarchy_only_reference"
    elif hits:
        reason = "county_conflict"
    else:
        reason = "no_exact_name_in_full_reference"
    return {**row, "gap_reason": reason,
            "possible_references": [{"reference_key": c["reference_key"], "type": c["identity_type"],
                 "bucket": c["reference_bucket"], "funcstat": c["funcstat"], "county_name": c.get("county_name")} for c in scoped],
            "production_correction_authorized_by_match": False}

def main():
    folder = ROOT / "docs/official-evidence/ohio-live-reconciliation-2026-10-06"
    ref = json.loads((ROOT / "docs/official-evidence/ohio-reference-2026/reference.json").read_text())
    audit = json.loads((folder / "candidate-reconciliation.json").read_text())
    index = index_reference(ref)
    report = {"authority_verified": False, "production_records_changed": False,
              "method": "Exact normalized names across active, status-review and hierarchy references; county restrictions when explicit.",
              "notes": ["Type mismatch is a review candidate, never an automatic reclassification.",
                        "Missing exact name does not establish a nonexistent locality; spelling, unincorporated and vintage differences remain possible.",
                        "Hierarchy references are county evidence, not independent government or office authority.",
                        "This report classifies the saved snapshot only."]}
    for source in ["queue", "profiles", "directory"]:
        rows = [classify(r, index) for r in audit[source]["rows"] if r["status"] == "unmatched"]
        report[source] = {"gap_count": len(rows), "reason_counts": dict(Counter(r["gap_reason"] for r in rows)), "rows": rows}
        print(source, json.dumps(report[source]["reason_counts"]))
    (folder / "gap-classification.json").write_text(json.dumps(report, indent=2) + "\n")

if __name__ == "__main__":
    main()
