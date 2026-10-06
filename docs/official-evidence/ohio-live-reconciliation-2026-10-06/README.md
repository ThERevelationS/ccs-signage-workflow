## Ohio concrete identity correction review — 2026-10-06

10.1 of 10.3 remains 2 of 4 tasks complete. Task 2 has a reusable, per-record review proposal artifact, but official live identity and separate office-role reconciliation remain open; task 4 full live acceptance remains pending.

Added scripts/build-ohio-identity-correction-review.py and identity-correction-review.json. Review checks every saved Ohio queue/profile row against active reference names across types, explicit township counties and GRF-C municipal county IDs. Exact literal names take precedence; county-level identities do not require parent counties or become ambiguous because of a same-named township. Unknown county placeholders are missing evidence. Alternatives remain visible: city and township matches in the same county require identity review.

Queue 1,274: 711 name/type/county candidates supported; 115 ambiguous identities; 56 listed counties requiring review; 171 possible type corrections requiring official identity evidence; 211 without active exact-name candidates; 10 missing/placeholder counties. Profiles 217: 192 supported candidates; 11 ambiguous; 4 possible type corrections; 8 without active exact-name candidates; 1 generic municipality type; 1 missing/placeholder county. This broader all-type review differs intentionally from the earlier type-restricted matching report. No percentage is a completeness measure.

Every proposal retains source record ID, snapshot updated_date and expected identity fields. Fresh record reads and official identity evidence are mandatory before any write. Automatic correction, identity verification and authority verification remain false. A unique township alternative does not prove an existing village/community record refers to that township. Do not merge duplicates, delete communities, or change relationships from a name match.

Six new tests pass: city/township ambiguity, county narrowing without automatic approval, placeholder counties, county-level identity, multi-county support, generic municipality and no-match cases. Full review regeneration and git diff --check pass. No production entity mutations, scans, or frontend publishing.

Next: verify the identified Ohio locality-type proposals against original research evidence and live versions, and map separate electrical permit issuer versus inspection provider evidence. Retain unresolved communities for geographic expansion rather than deleting them. Kentucky follows Ohio.

## Ohio county relationship candidate audit — 2026-10-06

10.1 of 10.3 remains 2 of 4 tasks complete. Task 2 canonical identity and office-role reconciliation is partial; task 4 full read-only live acceptance remains pending.

Added scripts/build-ohio-county-relationship-candidates.py and county-relationship-candidates.json. The deterministic offline join compares exact literal base names and LSADC types from incorporated places to saved official county subdivision hierarchy evidence. It preserves every matching county portion and its source reference key. It never infers exhaustive county membership or permitting jurisdiction.

Of 922 active municipal reference candidates: 257 have unique name/type relationship candidates, 2 have ambiguous same-name/type place identities, and 663 have no matching hierarchy relationship evidence. Sixteen have multiple county portions in this partial evidence. Even a unique name/type join is not a stable-ID crosswalk; place_identity_link_verified, county_list_exhaustive, and authority_verified remain false.

Existing matched municipal rows assessed: queue 178 county-supported candidates, 581 without relationship evidence, 5 listed counties absent from partial evidence, 10 missing parent county. Profiles 43 county-supported candidates, 68 without evidence, 1 listed county absent from partial evidence. Directory 205 county-supported candidates, 653 without evidence, 50 listed counties absent from partial evidence. County absence here must not be treated as a conflict or used to change/delete records.

Verification: five new relationship tests pass, including multi-county preservation, ambiguous names, legal-name/type distinctions, absent evidence, and non-authoritative county support. Seven identity and five classification tests also pass (17 total); git diff --check passes. Production records unchanged; nothing published.

Next: obtain stable place-ID/county relationship evidence for Ohio, then review locality type discrepancies and separate electrical permit issuer versus inspection provider evidence. Kentucky remains after Ohio.

## Ohio gap classification and name correction — 2026-10-06

10.1 of 10.3: 2 of 4 tasks complete. Task 2 remains partial; classification does not complete canonical identity or office authority reconciliation. Task 4 live acceptance remains pending.

This entry supersedes prior candidate counts: matching now preserves legal base names ending in City or Village instead of treating those words as suffixes. Exact base-name matches take precedence over legal-prefix/suffix normalization. No production entities changed.

Final reusable audit: directory 3,346 groups, 2,282 unique name/type candidates, 1,063 unmatched, 1 ambiguous. Queue 1,274 rows, 862 unique candidates, 411 unmatched, 1 ambiguous. Profiles 217 rows, 200 unique candidates, 17 unmatched. Duplicate groups: queue 1, profiles 4. Missing reference name candidates remain queue 1,459, profiles 2,123, directory 33. All candidates remain unverified.

The new scripts/classify-ohio-identity-gaps.py classifies unmatched rows across active, status-review and hierarchy references. Queue: 187 possible locality-type mismatches; 13 names found only in other explicitly named counties; 210 names absent from this full geographic reference; 1 inactive/consolidated status review. Profiles: 9 possible type mismatches, 8 absent exact names. Directory: 373 possible type mismatches, 629 same names only in other explicit counties, 58 absent exact names, 3 inactive/consolidated status reviews.

Examples: Nelsonville and St. Clairsville are queued as village but match active city names; Sullivan matches township. Geneva has both city and township possibilities, so type correction cannot be inferred from the name. Rendville requires inactive-status review. Absence from the reference may reflect unincorporated communities, spelling, or vintage differences; do not delete records based on this report. Same-name other-county findings are not proof the existing county is wrong. Municipal county membership remains unresolved where the incorporated-place reference does not specify it.

Verification: 7 identity tests and 5 gap-classification tests pass; git diff --check passes. Outputs saved under docs/official-evidence/ohio-live-reconciliation-2026-10-06/. Snapshot remains permission-scoped and not atomic. No frontend publishing, AI scans, or production record corrections.

Next: Ohio official county/place relationship evidence and targeted type correction review, followed by distinct electrical permit issuer and inspection office evidence. Kentucky follows Ohio.

## Ohio candidate identity reconciliation — 2026-10-06

Phase 10.1 of 10.3 remains 2 of 4 tasks complete. Task 2 is partial: canonical geography and office-role reconciliation remain open. Task 4 read-only acceptance is in progress; this connector snapshot is not full browser acceptance.

The reusable offline script scripts/reconcile-ohio-permitting-identities.py compares the saved official Census reference, complete Ohio BBS directory groups, and read-only live entity snapshot. Six tests pass, covering county-specific township ambiguity, municipal county uncertainty, generic municipality type, duplicate groups, unsupported types, and legal-name prefixes.

Final candidate report: directory 3,346 groups: 2,280 unique candidates, 1,063 unmatched, 3 ambiguous; 33 reference candidates without any directory name candidate. Queue 1,274 rows: 865 unique candidates, 408 unmatched, 1 ambiguous, 1 duplicate identity group; 1,459 reference candidates without any queue name candidate. Profiles 217 rows: 200 unique candidates, 17 unmatched, 4 duplicate identity groups; 2,123 reference candidates without any profile name candidate.

These are candidate identities, not verified authorities or completion percentages. Municipal county relationships remain pending; generic municipality types remain unresolved. The live snapshot is permission-scoped and not atomic. No production entities were modified. Electrical permit issuer and inspection provider still require distinct role evidence.

Next: classify Ohio unmatched queue types and official-directory mismatches, resolve county relationships, then reconcile separate electrical permit and inspection office evidence before Kentucky. No frontend publishing.

Artifacts: live-snapshot.json and candidate-reconciliation.json. Regenerate offline with python scripts/reconcile-ohio-permitting-identities.py.
