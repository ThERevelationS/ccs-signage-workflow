## Ohio official geographic-ID county crosswalk — 2026-10-06

10.1 of 10.3 remains 2 of 4 tasks complete. Task 2 now has complete code-relationship presence for the 922 active municipal reference entries, but live identity/type, source-vintage alignment, and office-role reconciliation remain partial. Task 4 full live acceptance remains pending.

Captured the complete Ohio 2026 Census GRF-C from https://www2.census.gov/geo/docs/maps-data/data/grf/2026/public_grfc_cur26_39.txt . Official download landing: https://www.census.gov/geographies/reference-files/2026/geo/geo-reference-files.html . Record layout: https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/grf-record-layouts.html . Raw source has 281,551 rows and 98,249,511 bytes; lossless gzip archive and original-byte SHA-256 are retained in docs/official-evidence/ohio-grfc-2026/. Offline verification checks full decompressed hash/length and parses every row without a total cap.

Current codes CURSTATE + PLACEFP and CURSTATE + CURCOUNTY provide place/county relationships directly, avoiding names and centroid inference. TABBLK state/county are deliberately not used to construct current entity IDs. The 99999 no-place sentinel is excluded; CDP relationships remain in source data without promotion into active incorporated governments. All 922 active municipal reference entries have code relationship evidence. Seventy-five span multiple counties. All 1,357 source place/county pairs are retained, including non-active-reference places.

Live snapshot name/type candidates assessed against these ID relationships: queue 724 have county support, 40 listed counties are outside the candidate place's GRF-C relationship set, 10 have no listed county. Profiles 111 have support, 1 is outside the set. Ohio BBS directory groups 809 have support, 99 are outside the set. These results do not certify live identities: records lack stable place IDs, ambiguous name/type matches remain candidates, and current GRF-C alignment with the January 1 TIGERweb reference requires vintage review. No record corrections or authority approvals performed.

Added scripts/capture-ohio-grfc-relationships.py and five meaningful tests covering current versus tabulation codes, leading zeros, no-place sentinel, multi-county preservation, uncapped parsing, malformed/empty/truncated data, and invalid geography. All five pass; full source offline verification and git diff --check pass.

Next: resolve Ohio live type/county discrepancies using this ID crosswalk, then attach distinct electrical permit issuer and inspection provider evidence. Kentucky follows Ohio. No frontend publishing or production entity changes.

