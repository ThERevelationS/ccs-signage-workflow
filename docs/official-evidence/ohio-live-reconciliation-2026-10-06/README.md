## Ohio candidate identity reconciliation — 2026-10-06

Phase 10.1 of 10.3 remains 2 of 4 tasks complete. Task 2 is partial: canonical geography and office-role reconciliation remain open. Task 4 read-only acceptance is in progress; this connector snapshot is not full browser acceptance.

The reusable offline script scripts/reconcile-ohio-permitting-identities.py compares the saved official Census reference, complete Ohio BBS directory groups, and read-only live entity snapshot. Six tests pass, covering county-specific township ambiguity, municipal county uncertainty, generic municipality type, duplicate groups, unsupported types, and legal-name prefixes.

Final candidate report: directory 3,346 groups: 2,280 unique candidates, 1,063 unmatched, 3 ambiguous; 33 reference candidates without any directory name candidate. Queue 1,274 rows: 865 unique candidates, 408 unmatched, 1 ambiguous, 1 duplicate identity group; 1,459 reference candidates without any queue name candidate. Profiles 217 rows: 200 unique candidates, 17 unmatched, 4 duplicate identity groups; 2,123 reference candidates without any profile name candidate.

These are candidate identities, not verified authorities or completion percentages. Municipal county relationships remain pending; generic municipality types remain unresolved. The live snapshot is permission-scoped and not atomic. No production entities were modified. Electrical permit issuer and inspection provider still require distinct role evidence.

Next: classify Ohio unmatched queue types and official-directory mismatches, resolve county relationships, then reconcile separate electrical permit and inspection office evidence before Kentucky. No frontend publishing.

Artifacts: live-snapshot.json and candidate-reconciliation.json. Regenerate offline with python scripts/reconcile-ohio-permitting-identities.py.
