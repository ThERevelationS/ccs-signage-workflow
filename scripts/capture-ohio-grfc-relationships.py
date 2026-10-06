"""Capture all Ohio GRF-C rows; derive code relationships, never office authority."""
import argparse
import collections
import csv
import gzip
import hashlib
import io
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "docs/official-evidence/ohio-grfc-2026"
URL = "https://www2.census.gov/geo/docs/maps-data/data/grf/2026/public_grfc_cur26_39.txt"
LAYOUT = "https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/grf-record-layouts.html"

def derive(stream):
    reader = csv.DictReader(stream, delimiter="|")
    required = {"CURSTATE", "CURCOUNTY", "PLACEFP", "PLACEFS"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Missing GRF-C required fields")
    relationships = collections.Counter()
    statuses = collections.defaultdict(set)
    count = 0
    no_place = 0
    for row in reader:
        count += 1
        if None in row or any(v is None for v in row.values()):
            raise ValueError("Malformed GRF-C row")
        state, county, place = (row[k] for k in ["CURSTATE", "CURCOUNTY", "PLACEFP"])
        if state != "39" or len(county) != 3 or not county.isdigit() or len(place) != 5 or not place.isdigit():
            raise ValueError("Unexpected state or invalid current geographic code")
        if place == "99999":
            no_place += 1
            continue
        relationships[(state + place, state + county)] += 1
        statuses[state + place].add(row["PLACEFS"])
    if not count:
        raise ValueError("Empty GRF-C source")
    return {"source_row_count": count, "no_place_row_count": no_place,
            "relationships": [{"place_geoid": p, "county_geoid": c, "source_row_count": n,
                               "place_functional_statuses": sorted(statuses[p])}
                              for (p,c),n in sorted(relationships.items())]}

def reconcile(data):
    ref = json.loads((ROOT / "docs/official-evidence/ohio-reference-2026/reference.json").read_text())
    counties = {c["geoid"]: c["name"] for c in ref["candidates"] if c["queue_type"] == "county"}
    lookup = collections.defaultdict(list)
    for row in data["relationships"]:
        if row["county_geoid"] not in counties:
            raise ValueError("Unknown reference county")
        lookup[row["place_geoid"]].append(row)
    rows = []
    for p in ref["candidates"]:
        if p["queue_type"] not in {"city", "village"}:
            continue
        evidence = lookup[p["geoid"]]
        rows.append({"reference_key": p["reference_key"], "place_geoid": p["geoid"], "name": p["name"],
                     "type": p["queue_type"], "county_geoids": [r["county_geoid"] for r in evidence],
                     "county_names": [counties[r["county_geoid"]] for r in evidence],
                     "status": "code_relationship_present" if evidence else "missing_code_relationship",
                     "source_rows": sum(r["source_row_count"] for r in evidence),
                     "geographic_code_relationship_verified": bool(evidence),
                     "live_record_identity_verified": False, "authority_verified": False})
    return {"source_url": URL, "record_layout_url": LAYOUT, **data, "active_municipal_reference_relationships": rows,
            "notes": ["Current place GEOID uses CURSTATE + PLACEFP; current county GEOID uses CURSTATE + CURCOUNTY.",
                      "99999 is no place coverage; CDPs are retained in source relationships but not promoted to active incorporated governments.",
                      "Geographic relationships do not verify live record identity or sign/electrical authority.",
                      "This is 2026 GRF-C evidence; exact effective-date alignment with January 1 TIGERweb requires separate vintage review."]}

def capture():
    FOLDER.mkdir(exist_ok=True)
    target = FOLDER / "public_grfc_cur26_39.txt.gz"
    if target.exists():
        raise ValueError("Capture exists; refusing overwrite")
    digest = hashlib.sha256()
    byte_count = 0
    with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent":"CCS-Permitting-Reference/1.0"}), timeout=30) as source, gzip.open(target, "wb") as out:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            byte_count += len(chunk)
            out.write(chunk)
    manifest = {"url": URL, "layout_url": LAYOUT, "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "raw_bytes": byte_count, "raw_sha256": digest.hexdigest(), "lossless_compression":"gzip"}
    (FOLDER / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    verify()

def verify():
    manifest = json.loads((FOLDER / "manifest.json").read_text())
    digest = hashlib.sha256()
    size = 0
    with gzip.open(FOLDER / "public_grfc_cur26_39.txt.gz","rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk: break
            digest.update(chunk);size+=len(chunk)
    if digest.hexdigest()!=manifest["raw_sha256"] or size!=manifest["raw_bytes"]:
        raise ValueError("Source hash or length mismatch")
    with gzip.open(FOLDER / "public_grfc_cur26_39.txt.gz","rt",encoding="utf-8-sig",newline="") as f:
        result=reconcile(derive(f))
    (FOLDER / "relationships.json").write_text(json.dumps(result,indent=2)+"\n")
    rows=result["active_municipal_reference_relationships"]
    print(json.dumps({"source_rows":result["source_row_count"],"source_bytes":size,
                      "active_places":len(rows),"places_with_code_relationship":sum(bool(r["county_geoids"]) for r in rows),
                      "multi_county_places":sum(len(r["county_geoids"])>1 for r in rows),
                      "all_place_county_pairs":len(result["relationships"])}))

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--capture",action="store_true");args=parser.parse_args()
    capture() if args.capture else verify()
