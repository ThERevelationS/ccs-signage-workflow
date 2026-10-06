# Ohio geographic research candidates

Generated offline from the complete hash-verified January 1, 2026 Census TIGERweb snapshot in ../oh-ky-geography-2026. Official functional-status and legal-status definitions are retained here with hashes and source URLs. Rebuild with `python3 scripts/build-permitting-ohio-reference.py`; validate classification using `python3 scripts/test-permitting-ohio-reference.py`.

| Geographic candidate | Count |
| --- | ---: |
| County — FUNCSTAT A | 88 |
| City — incorporated place, LSADC 25, FUNCSTAT A | 253 |
| Village — incorporated place, LSADC 47, FUNCSTAT A | 669 |
| Township — county subdivision, LSADC 44, FUNCSTAT A | 1,308 |
| Total geographic candidates | 2,318 |

All 2,618 Ohio source rows are accounted for: 2,318 candidates, 19 explicit status-review records, and 281 fictitious hierarchy subdivision records. The review set preserves five consolidated-government township records (C), twelve nonfunctioning townships (N), one inactive township (I), and one inactive incorporated village (I). No records are silently discarded. Fictitious hierarchy records remain source references and are not separate government candidates.

Township and county county-membership references join source STATE+COUNTY to the county table; repeated township names retain distinct GEOIDs. All 922 active incorporated-place candidates still have official county relationships pending. A place may cross counties; never use one centroid or the recalled queue seed to choose a single county. Population-estimates 2025 FIPS references were located during investigation, but not used to replace the 2026 vintage or assert current membership.

Active Census government status is a research classification. It does not prove zoning powers, sign jurisdiction, a permitting office, current forms, archived documents, or authoritative rules. authority_verified and inventory_complete_for_permitting remain false. No Base44 entities are created or changed by generation. Next: official Ohio place-to-county relationships and read-only matching to app queue/profile identities; joint planning agencies/offices need separate coverage.
