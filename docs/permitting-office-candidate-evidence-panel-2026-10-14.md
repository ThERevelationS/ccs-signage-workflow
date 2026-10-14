# Office Catalog read-only candidate evidence panel — October 14, 2026

Phase 10 → Milestone 1 of 3 → Task 2 remains partial. Fixed task counts unchanged.

Fresh baseline HEAD f07361668552f73dc6acb8f68828cfb06a89c3bc; clean working tree.

The Office Catalog now displays immutable candidate registration evidence above contact edits and the existing verification controls. Printed and editable catalog names remain separate. Profile/source/archive/page identifiers, registration key, page/archive hashes and historical classification/currentness are visible. Missing/malformed lineage, mismatched candidate IDs, renamed catalog entries and unsafe links show review gaps. Current official parent/division/alias identity is explicitly unresolved; no inferred current official label is displayed. This is a presentation foundation for subsequent official identity evidence review, not that review itself.

Files:
- src/components/permitting/OfficeCandidateEvidencePanel.jsx
- src/components/permitting/officeCandidateEvidence.mjs
- src/components/permitting/OfficeCatalogEditor.jsx
- scripts/permitting-office-candidate-panel.test.mjs

No actions or API calls in the panel. No verification toggle behavior changed; that existing path still lacks a structured evidence gate. No source/profile/catalog mutation, candidate rename, contact copy, authority approval, alias persistence, LLM or scan.

Validation: 6 panel checks + 17 existing candidate checks = 23/23 pass. React server rendering exercised actual component markup with exact retained Sharonville registration, incomplete fixtures, identity divergence, unsafe links and escaped quotes. Synthetic tests also confirm registration/candidate concurrency protections. Focused ESLint, git diff --check and one npm run build pass. Existing baseline-browser-mapping/Browserslist warnings remain. No authenticated browser/visual acceptance claim.

Fresh permission-scoped live Office Catalog readback after tests:
- record 69e14b004e01bf082f0f8c75
- version 2026-10-14T12:07:33.616000
- 10 visible items
- exact Sharonville candidate remains needs_verification
- contacts blank; office types/workflow empty
No production records modified. No frontend publication or backend changes/deployment.

Next chunk: design a bounded read-only current-official identity evidence comparison that shows parent/child names and source-specific contacts beside registration lineage, with explicit source timestamps and stale/mismatched-evidence warnings. Preserve unverified state; approval and alias-equivalence persistence remain separate work.
