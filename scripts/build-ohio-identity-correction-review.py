"""Build review proposals from saved sources; never mutate live entities."""
import importlib.util
import json
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("identity",ROOT/"scripts/reconcile-ohio-permitting-identities.py")
identity=importlib.util.module_from_spec(spec);spec.loader.exec_module(identity)
UNKNOWN={"","information not found","unknown","n/a","na","none","not found","not available"}

def county_key(value):
    return "" if identity.name_key(value) in UNKNOWN else identity.normalize(value)

def review(row, candidates, county_lookup):
    exact=[c for c in candidates if identity.name_key(c["base_name"])==identity.name_key(row["name"])]
    hits=exact or [c for c in candidates if identity.name_key(c["base_name"])==identity.normalize(row["name"])]
    if row["type"]=="county":
        county_hits=[c for c in hits if c["queue_type"]=="county"]
        hits=county_hits or hits
    # A county is its own geographic level; it needs no parent-county field.
    county=county_key(row["name"]) if row["type"]=="county" else county_key(row.get("county"))
    supported=[]
    evidence=[]
    for c in hits:
        names=county_lookup.get(c["reference_key"], [c.get("county_name")] if c.get("county_name") else [])
        has_support=bool(county and county in {county_key(n) for n in names})
        evidence.append({"reference_key":c["reference_key"],"geoid":c["geoid"],"type":c["queue_type"],
                         "county_names":names,"listed_county_supported":has_support})
        if has_support:supported.append(c)
    allowed={"municipality":{"city","village"}}.get(row["type"],{row["type"]})
    # Retain alternatives of every type: a community name can also name a township.
    plausible=supported if county else hits
    if not hits:
        action="no_active_exact_name_candidate"
    elif not county:
        action="missing_or_placeholder_parent_county"
    elif not supported:
        action="listed_county_requires_review"
    elif len(plausible)>1:
        action="ambiguous_identity_requires_review"
    elif row["type"]=="municipality":
        action="generic_municipality_type_requires_review"
    elif plausible[0]["queue_type"] not in allowed:
        action="possible_type_correction_requires_identity_evidence"
    else:
        action="name_type_county_candidate_supported"
    suggested=plausible[0] if len(plausible)==1 and county else None
    return {**row,"review_action":action,"all_name_candidates":evidence,
            "suggested_reference_key":suggested["reference_key"] if suggested else None,
            "suggested_type":suggested["queue_type"] if suggested else None,
            "automatic_correction_allowed":False,"identity_verified":False,"authority_verified":False,
            "requires_fresh_record_read":True,"requires_official_identity_evidence":True}

def main():
    folder=ROOT/"docs/official-evidence/ohio-live-reconciliation-2026-10-06"
    ref=json.loads((ROOT/"docs/official-evidence/ohio-reference-2026/reference.json").read_text())
    grf=json.loads((ROOT/"docs/official-evidence/ohio-grfc-2026/relationships.json").read_text())
    live=json.loads((folder/"live-snapshot.json").read_text())
    lookup={r["reference_key"]:r["county_names"] for r in grf["active_municipal_reference_relationships"]}
    report={"source_snapshot_retrieved_at":live["retrieved_at"],"production_records_changed":False,
            "notes":["A unique alternative type is a proposal only; a community and township may share a name.",
                     "Fresh record identity, updated_date and relationship reads are required before any mutation.",
                     "Retain duplicates and history; do not merge or delete from name matches.",
                     "Placeholder county text is missing evidence, not a county contradiction.",
                     "Geographic relationships never approve permitting or electrical office authority."]}
    for source in ["queue","profiles"]:
        rows=[]
        for r in live[source]:
            if source=="queue":
                name,kind,county=r["jurisdiction_name"],r["jurisdiction_type"],r.get("parent_county_name")
            else:
                name,kind,county=r["name"],r["type"],(r.get("parent_county") or {}).get("name")
            row={"id":r["id"],"name":name,"type":kind,"county":county,"snapshot_updated_date":r.get("updated_date"),
                 "expected_identity_fields":{"name":name,"type":kind,"county":county}}
            rows.append(review(row,ref["candidates"],lookup))
        report[source]={"review_action_counts":dict(Counter(r["review_action"] for r in rows)),"rows":rows}
        print(source,json.dumps(report[source]["review_action_counts"]))
    (folder/"identity-correction-review.json").write_text(json.dumps(report,indent=2)+"\n")

if __name__=="__main__":main()
