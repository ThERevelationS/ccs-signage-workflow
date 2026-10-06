# Official OH/KY geographic reference — January 1, 2026 vintage

Captured October 6, 2026 directly from U.S. Census Bureau TIGERweb. manifest.json records exact source and index URLs, retrieval timestamp, SHA-256 and record counts. Eight complete HTML tables are retained; inventory.json preserves every source field as text, including leading-zero IDs. This is a source snapshot in project Git, not production entity data.

| Geography table | Ohio | Kentucky |
| --- | ---: | ---: |
| Counties | 88 | 120 |
| Incorporated places | 923 | 415 |
| County subdivisions | 1,607 | 493 |
| Consolidated cities | 0 | 1 |

Total: 3,647 geographic rows. Do not sum these as distinct governments or permitting authorities. Tables overlap geographically and include different functional statuses. Every Kentucky county subdivision has LSADC 22 / FUNCSTAT S. Ohio subdivision records include township, city, village and other classifications. Retain those classifications for explicit treatment; do not create a township authority for every subdivision.

Kentucky incorporated-place records include Lexington-Fayette urban county and Louisville/Jefferson County metro government (balance). The separate consolidated-city record is Louisville/Jefferson County metro government. Their authority relationships must be reconciled explicitly. Incorporated-place tables do not provide county membership; do not infer a single county from the name or representative coordinate. Townships can be disambiguated by source STATE+COUNTY+COUSUB, while place GEOIDs use STATE+PLACE.

Offline verification: `python3 scripts/capture-permitting-geography.py` reparses all files, validates source hashes/counts and exact normalized output. Parser acceptance: `python3 scripts/test-permitting-geography.py` rejects wrong state, duplicate GEOIDs, malformed rows, wrong vintage and unexplained empty tables. The explicit Ohio consolidated-city empty marker is accepted. Capture is manual with `--capture`, refuses to overwrite this snapshot, and never invokes Base44 entities or AI.

Remaining before task 2 closure: resolve functional status/overlap rules using official definitions; obtain official place-to-county relationships; match app records to stable reference identities without silently coercing ambiguous names; separately enumerate joint planning/zoning agencies and offices. No statewide authority/form/source/document coverage is certified by this reference snapshot. Production records and UI are unchanged.
