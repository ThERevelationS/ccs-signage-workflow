# Candidate office verification shortcut guard — October 14, 2026

Phase 10 → Milestone 1 of 3 → Task 2 remains partial; fixed counts unchanged.
Initial HEAD 2c52a66f61367eabf129b4c7fa717d8b1408b782; clean.

Confirmed gap: the Office Catalog toggle recorded staff_verified without requiring candidate identity evidence, literal alias resolution or version-bound identity review.

The editor now disables candidate promotion and explains the separate evidence-bound identity review requirement. Its handler also refuses the promotion without emitting onChange. The shared updateGovernmentOfficeVerification helper rejects any staff_verified request for a registered candidate before changing notes/source/provenance or calling the clock. Candidate detection includes presence of registration metadata (even malformed/null) and candidate ID prefixes, so missing metadata cannot unlock the shortcut.

Existing verified candidate records remain preserved through normalization and ordinary notes/workflow edits. Explicit revocation remains available; identity/contact/source edits still invalidate verification as before. Legacy noncandidate verification behavior is unchanged. No existing registration snapshots, retained identity evidence or review histories were rewritten. Structured candidate identity approval is not implemented by this guard; future work must provide a separate evidence-bound path. Do not delete/recreate or rename candidates to evade review.

Files:
- src/components/permitting/governmentOfficeCatalog.js
- src/components/permitting/OfficeCatalogEditor.jsx
- scripts/permitting-candidate-verification-guard.test.mjs
- scripts/test-permitting-office-identity-preservation.mjs

Validation: 54/54 focused tests pass across guard/editor interactions, government-office catalog, identity preservation, registration panel, official comparison and candidate backend. Synthetic actual editor handlers tested with stub UI components: unverified toggle disabled and no update even on manual handler invocation; historical verified candidate revocation enabled and evidence preserved. Helper tests reject mixed-patch promotions atomically, malformed/missing candidate metadata and re-verification. Focused ESLint, git diff --check and one build passed. Existing baseline-browser-mapping/Browserslist warnings remain. Authenticated browser acceptance pending.

This is an editor/shared-helper safeguard, not a new provider authorization/RLS rule. Direct admin entity writes are not claimed blocked. No backend/resource changes or deployment.

Permission-scoped live readback after tests: catalog 69e14b004e01bf082f0f8c75, version 2026-10-14T12:07:33.616000, 10 visible items. Exact Sharonville candidate remains needs_verification. No production records changed; no contacts, roles, alias equivalence, currentness, source authority, dispatch or jobs modified. No frontend publication.

Next ONE chunk: design and implement a read-only candidate identity-review preview with exact candidate/catalog/profile/source/page version guards and explicit alias/parent-child ambiguity, before adding any approval action. Preserve historical verified office evidence; no Sharonville verification or production writes.
