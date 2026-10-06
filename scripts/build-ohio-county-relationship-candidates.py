"""Join saved official geography by name/type; retain uncertainty and all counties."""
import importlib.util
import json
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("identity", ROOT / "scripts/reconcile-ohio-permitting-identities.py")
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)

def build(ref):
    places = [c for c in ref["candidates"] if c["queue_type"] in {"city", "village"}]
    by_name = {}
    for p in places:
        by_name.setdefault((identity.name_key(p["base_name"]), p["lsadc"]), []).append(p)
    rows = []
    for p in places:
        key = (identity.name_key(p["base_name"]), p["lsadc"])
        evidence = [h for h in ref["hierarchy_reference"] if
                    (identity.name_key(h["base_name"]), h["lsadc"]) == key]
        unique_place = len(by_name[key]) == 1
        status = "name_type_relationship_candidate" if evidence and unique_place else "ambiguous_place_name" if evidence else "no_hierarchy_relationship_evidence"
        rows.append({"reference_key": p["reference_key"], "name": p["name"], "type": p["queue_type"],
                     "status": status, "county_geoids": sorted({h["county_geoid"] for h in evidence}),
                     "county_names": sorted({h["county_name"] for h in evidence}),
                     "evidence_reference_keys": sorted(h["reference_key"] for h in evidence),
                     "evidence_source_files": sorted({h["source_file"] for h in evidence}),
                     "place_identity_link_verified": False, "county_list_exhaustive": False,
                     "authority_verified": False})
    return rows

def evaluate(row, relationships):
    matches = [relationships[k] for k in row["candidate_reference_keys"] if k in relationships]
    county = identity.normalize(row.get("county"))
    supported = [r["reference_key"] for r in matches if county and
                 county in {identity.normalize(n) for n in r["county_names"]}]
    if not county:
        status = "parent_county_missing"
    elif supported:
        status = "county_supported_by_name_type_hierarchy_candidate"
    elif any(r["county_names"] for r in matches):
        status = "county_not_in_partial_relationship_evidence"
    else:
        status = "relationship_evidence_unavailable"
    return {"id": row["id"], "name": row["name"], "type": row["type"], "county": row.get("county"),
            "status": status, "supported_candidate_keys": supported,
            "candidate_reference_keys": row["candidate_reference_keys"],
            "canonical_identity_verified": False, "authority_verified": False}

def main():
    folder = ROOT / "docs/official-evidence/ohio-live-reconciliation-2026-10-06"
    ref = json.loads((ROOT / "docs/official-evidence/ohio-reference-2026/reference.json").read_text())
    audit = json.loads((folder / "candidate-reconciliation.json").read_text())
    rows = build(ref)
    report = {"method": "Exact base-name and LSADC join from incorporated places to county subdivision hierarchy records.",
              "notes": ["Name/type join is candidate evidence, not a stable place-ID relationship.",
                        "County subdivision hierarchy does not cover every incorporated place or every county portion.",
                        "Retain all matching county portions; do not force multi-county places into a single parent.",
                        "Unsupported county is not a contradiction because this evidence is partial.",
                        "No production entities or permitting authority approvals are changed."],
              "source_vintage": ref["source_vintage"], "relationships": rows,
              "status_counts": dict(Counter(r["status"] for r in rows)),
              "multi_county_candidate_count": sum(len(r["county_geoids"]) > 1 for r in rows)}
    lookup = {r["reference_key"]: r for r in rows}
    for source in ["queue", "profiles", "directory"]:
        assessments = [evaluate(r, lookup) for r in audit[source]["rows"] if r["type"] in {"city", "village", "municipal", "municipality"} and r["candidate_reference_keys"]]
        report[source] = {"status_counts": dict(Counter(r["status"] for r in assessments)), "rows": assessments}
        print(source, json.dumps(report[source]["status_counts"]))
    (folder / "county-relationship-candidates.json").write_text(json.dumps(report, indent=2) + "\n")
    print("relationships", json.dumps(report["status_counts"]), "multi_county", report["multi_county_candidate_count"])

if __name__ == "__main__":
    main()
