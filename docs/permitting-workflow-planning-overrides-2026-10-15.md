# Permitting workflow planning overrides — October 15, 2026

## Change

Extended the staff-editable workflow draft steps to cover planning details already shown in the preview: target day, follow-up interval, inspection planning, and prerequisites. Target days accept whole numbers from zero; follow-up intervals accept positive whole numbers. Prerequisites can reference earlier steps only, so these edits cannot create a dependency cycle. Inspection status is explicitly shown as planned or not currently identified, with office confirmation still required.

Each changed step keeps its citations, records the original values, and is downgraded to **Staff Confirmation Needed**. Saving creates a permitting draft or immutable revision. It does not approve requirements or write to a Work Order.

No production records, files, permissions, or integrations were changed. Roadmap task counts and milestone status are unchanged.

## Verification

- Targeted ESLint passed for the designer and browser harness.
- Production build passed.
- Synthetic browser checks passed at 320, 390, and 1280 px.
- The browser fixture verified schedule, inspection, and prerequisite edits; citation preservation; confirmation downgrade; review gating; save retry; immutable revision; zero job-line writes; and no horizontal overflow.
- git diff --check passed.

Receipt: docs/permitting-workflow-draft-browser-2026-10-15.json.

This is synthetic acceptance using mocked API, AI, and evidence. Authenticated employee acceptance remains pending because no employee browser session was available. Nothing was published.
