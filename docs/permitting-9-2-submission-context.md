### 2026-10-06 — Phase 9, 9.2 of 9.3: submission resources and office contact

9.1 is complete. 9.2 is active: forms/contact integration is implemented; fresh reviewed office-role relationships remain to be integrated before declaring 9.2 complete. 9.3 desktop/mobile acceptance follows. Phase 8 remains open at 8.3 for live retrieval acceptance; Phase 5 archive reconciliation remains open. No earlier incomplete phase is certified by this change.

The expandable locality evidence section now shows all repository application forms, checklists and fee schedules, its permitting-page URL and recorded department contacts. There is no total document cap. Each resource distinguishes the source link from the verified stored PDF: stored links require matching source/stored SHA-256 and bytes using the existing archive verifier. Missing/unsafe source URLs, unverified archives, absent forms and absent contacts are explicit gaps. Only HTTP/HTTPS links are rendered. Online forms remain source/page links and are not misrepresented as retained PDFs.

Profile contacts are explicitly marked as recorded, with authority requiring confirmation. This does not substitute a contact or form for a freshly verified PermittingOfficeAuthorityReview relationship. It does not infer county/city coverage or job address authority. Contacts/resources are visible for staff as part of the existing locality profile; approved rule retrieval remains admin-only. Switching locality resets the disclosure and all old resource/contact content; no AI calls, writes or automatic API retrieval occur.

Validation: expanded isolated component acceptance passes for source and verified archive links, rejection of mismatched/untrusted stored links and unsafe URL schemes, contact/resource scope and empty-state gaps, plus existing request/collapse/admin-loss safeguards. Existing evidence search component acceptance passes. Targeted ESLint passes, frontend build passes and git diff check passes. No production records were changed; no live API was called by tests; no frontend publish occurred.

Next: finish 9.2 by connecting the current reviewed office roles/coverage with source evidence and preserving stale/unverified status, then perform 9.3 desktop/mobile acceptance.

