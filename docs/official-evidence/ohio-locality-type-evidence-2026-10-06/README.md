## Ohio profile type evidence and schema blockers — 2026-10-06

10.1 of 10.3 remains 2 of 4 tasks complete. Four proposed profile corrections now have fresh live identity/version checks and archived official-site type evidence. Task 2 still requires safe correction implementation and office-role reconciliation; task 4 full live acceptance remains pending.

Read live schemas and four profiles directly through Base44. All four identities and updated_date values match the saved proposals. Downloaded official Cleves, Norwood and Deer Park HTML pages with timestamp, original-byte SHA-256 and source URLs. Each retained page contains the government type label: Village of Cleves, City of Norwood, City of Deer Park. Census geographic IDs and county relationships agree with the proposed types. No permitting authority approval implied.

Confirmed problems: Norwood and Deer Park profiles are stored as village; two Cleves profiles are stored as city. JurisdictionProfile's current live schema allows county/city/township/municipality but not village, while legacy village values exist. Both Cleves records suggest the same Census place identity; retain relationships, documents and history pending duplicate review. Do not simply overwrite Cleves with an unsupported enum value or merge records.

The reusable correction review now includes current/suggested type schema compatibility and multiple-existing-row collision blockers. Fresh readback and evidence review artifacts are saved alongside the reconciliation. Six correction-review tests, full regeneration, four actual identity/version assertions, raw-source hash/label checks and git diff --check pass.

A runtime gap was also confirmed by code inspection: profileMatchesQueueRow checks non-county names/state/counties but does not enforce compatible locality types; it can reconcile a city row against a township profile. This requires a guarded dispatcher change that also prevents duplicate profile creation when mismatched identities already exist. No runtime code or production entity changes in this unit. Nothing published.

Next: fix dispatcher type compatibility and conflict handling, then safely support village identity in the profile pipeline before applying the verified corrections. Continue Ohio electrical permit/inspection office reconciliation afterward; Kentucky remains later.

