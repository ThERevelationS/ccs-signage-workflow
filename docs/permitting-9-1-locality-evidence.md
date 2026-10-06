### 2026-10-06 — Phase 9, 9.1 of 9.3: approved evidence disclosure

Phase 7 is complete at 7.3 of 7.3. Phase 8 remains open at 8.3 of 8.3 for live handler/data verification; no further login was requested and its browser restriction was not retested in a loop. Independent Phase 9 work has begun at 9.1 of 9.3.

JurisdictionDetailPanel now includes a native expandable Approved sign requirements section beside its existing documents, authority status and research information. The actual cited-evidence search panel is mounted only while expanded for a main-app administrator. Opening a locality or disclosure causes no automatic retrieval or AI invocation; Load approved evidence remains manual. Existing backend admin checks and all approval protections remain unchanged. Ordinary staff see an explicit office/document confirmation notice rather than an unusable admin retrieval control.

Changing locality or losing admin status remounts the disclosure closed and removes previous quotes immediately. Collapsing unmounts retrieval state, so delayed responses cannot reappear on reopening. Existing source/page citations, regulatory-versus-instruction labels, applicability warnings and uncapped page traversal are reused.

Validation: isolated component acceptance exercises the real evidence component and invocation helper against a fake SDK, proving manual-only reads, correct locality/session request, locality reset, collapse cancellation and admin-loss quote removal; existing evidence panel acceptance passes. Targeted ESLint reports zero errors (six pre-existing unused-variable warnings in JurisdictionDetailPanel). Frontend build passes; git diff check passes. No production records were modified, no live API was invoked for these tests, and no frontend publish was performed.

Next: 9.2 of 9.3, connect forms and responsible-office context with the cited requirements. 9.3 is desktop/mobile acceptance. The complete Phase 9 is not certified by this first disclosure. Phase 5 archive reconciliation and Phase 8 live data acceptance remain explicit outstanding work.

