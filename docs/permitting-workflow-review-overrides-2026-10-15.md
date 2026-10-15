# Permitting workflow review edits and revisions — October 15, 2026

## Change

Added editable staff overrides to workflow preview steps. Staff can revise the office, office type, permit type, proposed action, listed documents, listed forms, and fee expectation before saving.

Every edited step records its original basis and original field values, retains its citations, and is downgraded to **Staff Confirmation Needed**. The UI identifies staff-edited steps and requires the reviewer to re-check the workflow after edits. Saving remains a permitting draft; it does not approve requirements or create job lines.

Saved drafts remain immutable. Reopening a draft and editing it creates a separate draft snapshot with parent/root identity and revision number stored in snapshot metadata. The Draft Library labels revisions, and refreshes its list after a revised draft is saved. The original row and snapshot are not updated.

No Work Order was selected or modified. No production records, files, permissions, or integrations were changed.

## Verification

- Targeted ESLint for the designer, Draft Library, and browser harness passed.
- One production build passed.
- Synthetic browser test passed at 320, 390, and 1280 px.
- The browser fixture verified editable step fields, captured original values, preserved citations, downgraded changed steps, review gating, retry after a synthetic save failure, immutable revision creation with parent linkage, zero job-line writes, and no horizontal overflow.
- `git diff --check` passed.

Receipt: `docs/permitting-workflow-draft-browser-2026-10-15.json`.

This was synthetic acceptance with mocked API and AI. Authenticated employee acceptance, including saved physical-page text reads under employee caller RLS, remains pending because no employee browser session was available. No frontend was published and no backend resource was deployed.
