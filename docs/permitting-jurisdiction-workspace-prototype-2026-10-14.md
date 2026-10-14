# Jurisdiction workspace prototype — October 14, 2026

Phase 10, milestone 1, task 2 remains partial. Full live acceptance and statewide coverage remain pending.

Connected OfficeResearchFindings to the main JurisdictionDetailPanel, making the existing seven-role research available outside the address picker. Draft/unknown states remain explicit, including separate electrical permit and electrical inspection roles and scheduling details. Empty profiles show that office research has not been collected and direct administrators to existing Refresh.

Added persistent, four-section JurisdictionWorkspaceNavigation above the overview scroll area: Documents, Offices & Electrical, Requirements, Source Monitoring. Buttons scroll and focus the corresponding current section without writes or AI calls. Counts describe collected documents and draft office-role findings, never confirmed authority. Requirements have an explicit empty state and reference-evidence note. Boolean requires_permit now displays Yes/No instead of an always-affirmative label with only an icon indicating the stored value.

Files: src/components/permitting/JurisdictionWorkspaceNavigation.jsx; src/components/permitting/JurisdictionDetailPanel.jsx. Existing office display reused. Document search/PDF flow, monitoring, draft workflow designer and AI question behaviors preserved.

Validation: actual parent panel, navigation and office display in isolated Chromium at 320,390,1280 with production CSS and synthetic permitting profiles; unrelated heavy child surfaces stubbed and external requests blocked. All three viewport scenarios passed: four shortcuts scroll/focus, 44px minimum controls, no horizontal overflow, seven office roles, inspection scheduling detail, stored permit flag false displayed explicitly, switch to empty profile, empty office/requirements/documents sections, zero provider/AI/update calls. Receipt docs/permitting-workspace-browser-2026-10-14.json; harness scripts/test-permitting-workspace-browser.mjs. One production build and git diff --check passed. Focused ESLint: zero errors, six preexisting unused-variable warnings.

Additional existing scripts/test-permitting-pdf-keyboard.mjs: 9/12 pass, 3 fail. Independently ran against the exact pre-change JurisdictionDetailPanel at cd9a248bfa0c018247df30c0d761e35439dd8319 and reproduced the same three failures: missing liveViewingPDF test harness binding, outdated PDF key regex, and mock recovery target lacking scrollIntoView. Left this unrelated test maintenance outside the prototype batch; no claim that the full PDF regression suite passes. Existing Browserslist/baseline-browser warnings remain.

No production permitting or client/shared records read or changed, no permissions/settings/dispatcher changes, no frontend publication or backend deployment. Authenticated production UI acceptance remains pending. Google server geocoding remains REQUEST_DENIED from the preceding live diagnostic; exact live address flow remains blocked by external map configuration.

Next meaningful prototype batch: inspect and complete the AI workflow designer's review/preview/save-draft experience using permitting-only fixtures, preserving its approved-source gates and leaving all real client/job records untouched. Continue functional completion before optional hardening/audits.
