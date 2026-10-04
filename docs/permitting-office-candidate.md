# Phase 4.3 — retained publisher office candidates

## Recovery and scope

Fresh production Git HEAD was 4a3ec4a6725c2a33f30d6c1abf6110314dd46de6 with a clean tree. Base44 Version History confirmed Phase 4.2 checkpoint 6ac2b4e6d62b041df5ed7736, titled "Permitting canonical office role and coverage relationships". Its existing documentation and live validation record were inspected. The historical 291-test report was not rerun as a whole; the 21 office-authority tests were rerun successfully. Newer Time Clock and Order Form work was preserved.

This phase registers an evidence-backed office candidate. It does not establish current identity, adopted law, role, geographic coverage, or address authority.

## Implementation

- Admin-only permittingOfficeCandidate backend supports preview, register, and read-only get_request.
- Requires a jurisdiction-specific printed name, literal retained page quote, canonical OH/KY profile, page hash, and matching verified archive lineage/hash/bytes.
- Stable state/name office IDs and a source/page/profile registration digest prevent duplicate registrations. Existing matching offices remain unchanged.
- Catalog version comparison and conditional update preserve concurrent changes. Evidence is rechecked before the write.
- An uncertain save is reconciled once by exact office ID and registration key. Staff controls retain the exact pending decision in session storage and require readback before another submission. A persistently unresolved not_found requires manual reconciliation; there is no blind retry.
- Candidate contacts, office types, workflow steps, roles and coverage stay empty. Status is needs_verification.
- Staff controls are prepared in the source evidence review panel. Frontend remains unpublished. Existing permissions/RLS and entity schemas are unchanged.

## Bounded live verification

Base44 editor Test Function successfully executed preview, register and get_request against production entity records for the Campbell County Planning, Zoning and Building Inspection candidate. Source 6ac25be4207035a2e5be3827 retains the sign application PDF, 47,262 bytes, with source/stored hash 77058e0522fe160e2ad42f663d5447fc021da1dc5a6f2cdda2d8dc678802a8ef. Physical page 1 printed office name is retained with its text hash and archive provenance. Printed 2022 contacts were not promoted to current contacts.

Catalog has eight entries: the seven original entries are byte-for-byte equivalent JSON and one unverified Campbell candidate was appended. Both existing tracker localities, both queried source records, and automated dispatch config/state were exactly preserved. Authority review records remain zero. No jobs/work orders changed. No dispatch pause, upload, document reprocessing, LLM call, or authority promotion occurred.

The Morrow variance form's generic "Board of Zoning Appeals" name was not registered as an office identity without jurisdiction-specific identity evidence.

Only preview backend availability was live-verified. npx base44 whoami timed out at 30 seconds; inspection found no locally installed CLI executable. No CLI retry, global installation, frontend publish or separate production deployment was performed or claimed.

## Validation

106 focused tests passed, including 17 new candidate helper and compiled-route tests. Existing office-authority, source-authority, office-catalog, catalog-link and authority-verification suites passed. Targeted lint and git diff --check passed. One full npm run build passed; existing stale browser metadata warnings remain. Affected backend esbuild bundle passed at 20,419 bytes.

Machine-readable results: permitting-office-candidate-live-verification-2026-10-04.json.

## Next chunk

Review current official evidence for Campbell's office identity and contacts before marking staff_verified, then review source ownership and explicit role/coverage relationships. Candidate registration alone must never establish those relationships.
