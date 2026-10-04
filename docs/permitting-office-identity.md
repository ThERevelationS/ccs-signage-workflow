# Phase 4.4 — Campbell office identity verification

Fresh HEAD 5502dedb1e45a73ba6305155ac02d90e4b95fa1d was clean and matched the Phase 4.3 checkpoint (6ac2c80dbdd8b9c4ec20f5ff). Current callers, catalog metadata normalization, GlobalSettings permissions/persistence, locality provenance, and source/office authority readers were traced before the update.

## Completed

The existing Campbell County Planning, Zoning and Building Inspection candidate was reviewed against the live official county department page:

https://campbellcountyky.gov/department/index.php?structureid=37

The page returned HTTP 200. Its complete original HTML is retained at official-evidence/campbell-office-2026-10-04.html: 28,739 bytes, SHA-256 dab1bf520869dba6dfc04a1490a31af0a74ee5ee1ce926c00f8ca6842d672549. Complete deterministic normalized text is retained beside it. The normalized-text digest excludes the file's trailing newline. Literal identity/contact proofs, observation date, paths and hashes are stored with the office and in the validation record.

Current page naming variants were explicitly compared with the original retained sign form publisher and matching official county host, phone and Suite 343 address. The canonical printed publisher name and stable IDs remain unchanged. Current official phone, email, department website and address were populated. Verification records the actual reviewer as Codex acting under the user's authorized office identity review; it does not misattribute a manual employee review.

The live save used a narrow conditional update of six candidate fields guarded by catalog ID/key/version and target office ID. It updated exactly one GlobalSettings row. Readback matched the proposal exactly.

A confirmed catalog normalization gap was fixed: existing catalog edits discarded state and unfamiliar retained identity metadata. Normalization now preserves those metadata fields while continuing to normalize known contact/verification fields. Contact or source changes still revoke verification. Retained reviews and original candidate/archive provenance remain available after revocation.

## Preserved and limited

- Eight offices remain, in the same order. The seven other entries are exactly unchanged.
- Campbell's workflow, office types, original candidate registration and retained form provenance are unchanged.
- Both tracker locality records, queried Campbell/Morrow source records and dispatch config/state are exactly unchanged.
- No locality was linked, job/work order changed, authority relationship created, form made current, regulation adopted, role assigned or geographic coverage inferred.
- Identity reader accepts the saved office; source-scope reader still rejects the unreviewed sign form.
- Zero LLM calls; no queue pause, upload retry, backend change/deploy or frontend publish.

The raw HTML is evidence in Git and is not a published application page. Source links still point directly to the official county department. These snapshots are a point-in-time observation, not a claim that future source content cannot change.

## Validation

112 focused tests passed (six new metadata/evidence preservation regressions plus the existing catalog, locality provenance, candidate, office-authority, source-authority and authority-verification suites). Targeted ESLint, git diff --check and one full npm run build passed. Normal stale browser metadata warnings remain. Saved raw HTML byte/hash checks, normalized text digest, literal proofs, identity acceptance and source-scope rejection passed.

Machine-readable record: permitting-office-identity-live-verification-2026-10-04.json.

## Next dependency

Inspect and retain the county's current service-provider matrix and current sign form before reviewing source ownership/scope and explicit role/coverage relationships. The current page's commission descriptions and the older 2022 sign application list different cities and describe different responsibilities. Neither list should be copied into a broad county authority claim.
