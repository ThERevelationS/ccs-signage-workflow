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
