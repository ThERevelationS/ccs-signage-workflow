"""Offline candidate matching only; never writes production entities."""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/official-evidence/ohio-live-reconciliation-2026-10-06"

def name_key(value):
    return re.sub(r"\s+", " ", str(value or "").strip().casefold())

def normalize(value):
    value = re.sub(r"\s+", " ", str(value or "").strip().casefold())
    value = re.sub(r"^(city|village|township|county) of\s+", "", value)
    return re.sub(r"\s+(county|township|city|village)$", "", value)

def match(row, candidates):
    kind = row["type"]
    allowed = {"municipal": {"city", "village"}, "municipality": {"city", "village"}}.get(kind, {kind})
    typed = [c for c in candidates if c["queue_type"] in allowed]
    exact = [c for c in typed if name_key(c["base_name"]) == name_key(row["name"])]
    hits = exact or [c for c in typed if name_key(c["base_name"]) == normalize(row["name"])]
    county = normalize(row.get("county"))
    if kind in {"county", "township"} and county:
        hits = [c for c in hits if normalize(c.get("county_name")) == county]
    flags = []
    if kind == "municipality":
        flags.append("profile_municipality_type_unresolved")
    if kind in {"municipal", "municipality", "city", "village"}:
        flags.append("official_county_relationship_pending")
    if kind == "township" and not county:
        flags.append("parent_county_missing")
    status = "unmatched" if not hits else "ambiguous" if len(hits) > 1 else "unique_candidate"
    return {**row, "status": status, "candidate_reference_keys": sorted(c["reference_key"] for c in hits),
            "review_flags": flags, "canonical_identity_verified": False, "authority_verified": False}

def audit(rows, candidates):
    results = [match(row, candidates) for row in rows]
    represented = {key for r in results for key in r["candidate_reference_keys"]}
    counts = Counter((r["type"], normalize(r["name"]), normalize(r.get("county"))) for r in results)
    duplicates = [{"type": k[0], "name": k[1], "county": k[2], "row_count": n}
                  for k, n in sorted(counts.items()) if n > 1]
    return {"row_count": len(rows), "status_counts": dict(Counter(r["status"] for r in results)),
            "rows_with_review_flags": sum(bool(r["review_flags"]) for r in results),
            "duplicate_identity_groups": duplicates,
            "reference_candidates_without_any_name_candidate": sorted(c["reference_key"] for c in candidates if c["reference_key"] not in represented),
            "rows": results}

def main():
    ref = json.loads((ROOT / "docs/official-evidence/ohio-reference-2026/reference.json").read_text())
    directory = json.loads((ROOT / "docs/official-evidence/ohio-building-directory-2026-10-06/reconciliation-index.json").read_text())
    live = json.loads((OUT / "live-snapshot.json").read_text())
    groups = [{"id": r["source_jurisdictionid"], "name": r["entity"], "type": r["political_description"].casefold(),
               "county": r["county_name"], "source_objectids": r["source_objectids"]} for r in directory["reference_groups"]]
    queue = [{"id": r["id"], "name": r["jurisdiction_name"], "type": r["jurisdiction_type"],
              "county": r.get("parent_county_name")} for r in live["queue"]]
    profiles = [{"id": r["id"], "name": r["name"], "type": r["type"],
                 "county": (r.get("parent_county") or {}).get("name")} for r in live["profiles"]]
    report = {"method": "Exact normalized name and compatible type; explicit county restriction for county/township only.",
              "not_atomic_snapshot": True, "canonical_identity_verified": False, "authority_verified": False,
              "notes": ["No stable GEOID exists in the selected live fields. Unique matches are candidates only.",
                        "Municipal county membership requires official relationship evidence; directory county is only a hint.",
                        "Absence is relative to this permission-scoped snapshot and active reference set, not proof of absent government.",
                        "Directory groups and live rows are not counts of verified permitting offices."],
              "reference_candidate_count": len(ref["candidates"])}
    for name, rows in [("directory", groups), ("queue", queue), ("profiles", profiles)]:
        report[name] = audit(rows, ref["candidates"])
    (OUT / "candidate-reconciliation.json").write_text(json.dumps(report, indent=2) + "\n")
    for name in ["directory", "queue", "profiles"]:
        r = report[name]
        print(name, json.dumps({k: r[k] for k in ["row_count", "status_counts", "rows_with_review_flags"]}),
              "duplicate_groups", len(r["duplicate_identity_groups"]),
              "reference_without_candidate", len(r["reference_candidates_without_any_name_candidate"]))

if __name__ == "__main__":
    main()
