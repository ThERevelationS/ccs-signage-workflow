# PERMITTING_BACKLOG.md — Permitting session ONLY

Scope: the Permitting page, the jurisdiction picker, the repository, the address→jurisdiction pipeline, and every supporting function. Estimator items live in ESTIMATOR_BACKLOG.md — never mix sessions.

North star: **a user types an address (or it comes in from the client record), presses one button, and gets a confirmed jurisdiction they can apply.** Every item below pushes toward that.

Legend: [F] feature · [UX] usability/accessibility · [H] hardening · [B] bug · [DONE] verified done

## P0 — Blocking live behavior

1. **[H]** Deploy/rebuild the published bundle — all frontend fixes (request governor, 429-aware retries, subscribe fallback, plain-language copy, staffEntities pickers) are synced but the live site still serves `index-CJvDKpab.js`. The page's mount burst (~17+ staffDataRead calls) self-saturates the invoke budget → `main` stays empty. The new bundle fixes this.
2. **[B][DONE]** `PermitLocality` was not in `staffEntityWrite` WRITE_OPS — picker "Create draft" would fail server-side. Added `create`.
3. **[B][DONE]** `PermitLineItem` only allowed `create` — every line-item edit/delete would fail for staff. Added `update`, `updateMany`, `delete`.
4. **[B][DONE]** `LocalityPickerDialog` called `base44.entities.*` directly, bypassing the staff gateway → locked-RLS failures for staff. Swapped to `staffEntities`.
5. **[H][DONE]** `GlobalSettings.subscribe` crash was the render-breaker — polling subscribe fallback added to the staff facade.
6. **[H][DONE]** `isRateLimitError` was 429-blind (matched "rate limit" text only, never the 429 status) — loader retries never fired. Fixed to check status codes.
7. **[H][DONE]** `requestGovernor.mjs` was dead code — wired into `invokeFleet` (6-concurrency cap + 4 backoff retries).
8. **[H][DONE]** `resolvePermittingAddress`, `findLocalityByAddress`, `permittingScanStatus`, `staffDataRead`, `staffEntityWrite`, `manageAnnouncements`, `opportunityWorkspaceAction` wrapped with `withEntityRateLimitRetry`.
9. **[H][DONE]** `processWorkflowTriggers` + `permittingOfficeAuthorityReview` wrapped with `withEntityRateLimitRetry`.
10. **[H]** Verify remaining permitting functions are all retry-wrapped (`checkPermitFollowupReminders`, `scanPermittingOffice`, `permittingOfficeCandidate`, `downloadPermitPDF`, etc. — audit all ~158 functions for the wrapper).

## A — One-field address entry (the core UX)

11. **[F]** Single primary input: the job-address field is THE control — everything else (map, candidates, apply) is consequence, not separate steps.
12. **[F]** Auto-load the client/job address into the search field on open — zero typing when the client already has an address.
13. **[F]** Auto-search once a prefilled address lands — the user opens the picker and the lookup already ran.
14. **[F]** Paste-and-parse: pasting "914 Lila Ave, Milford OH 45150" from anywhere should populate and auto-search without clicking.
15. **[F]** Address autocomplete/suggestions as the user types (Census geocoder has no suggest API — evaluate a cheap suggest layer or reuse saved address history for type-ahead).
16. **[UX]** Recent-address list per user — last 5 searches one-click re-runnable.
17. **[F]** "Same as another job" — copy a jurisdiction from a recent job by client name (reuses verified localities).
18. **[UX]** Validation before search: warn if the address lacks a city/ZIP/state instead of failing silently ("That address is missing a city — try adding one").
19. **[UX]** If the geocoder returns a corrected address, show "Did you mean…" and let the user accept the correction in one click.
20. **[F]** Saved/favorite addresses per client — a client with recurring job sites should remember them.

## B — Search progress + feedback

21. **[UX][DONE]** Plain-language pass on picker copy — "Type the full street address and press Find my jurisdiction" replaces jargon.
22. **[UX]** Show WHY a search is taking a while — named stages ("Finding the address", "Checking saved jurisdictions", "Checking which offices cover it") instead of a spinner.
23. **[UX]** Progress indicator with the current stage + a realistic hint ("Usually takes 5–15 seconds").
24. **[F]** Cancel a running search and keep the last result — currently cancellation leaves the dialog in limbo.
25. **[UX]** Retry button that re-runs the last search in one click when the geocoder/network blips — no retyping.
26. **[UX]** Error messages that say what to do next, not what broke: "We couldn't reach the map service. Try again — or type the city and state manually."
27. **[F]** Persist the last search per work order so reopening the picker restores the in-flight context.
28. **[H]** Debounce + dedupe parallel searches — double-clicking Find must not fire two scans (searchVersion ref exists; verify it covers rapid re-clicks).
29. **[UX]** Distinguish "still looking" vs "found nothing" — the current copy merges them into one confusing state.

## C — Results: making the answer obvious

30. **[UX]** The detected jurisdiction should be a BIG, obvious card: name, state, "This is where your permit goes" + a single Apply button.
31. **[UX]** Explain the result in one sentence: "914 Lila Ave is inside the City of Milford, Clermont County — the city office issues your sign permit."
32. **[F]** Confidence badge on the result — "Verified by map boundary" vs "Best guess from city name" vs "Needs review" with a plain explanation of why.
33. **[UX]** When city AND township both match, show them as separate, clearly-labeled cards — never merge. State which one the address falls inside and why the other also appears.
34. **[F]** Show the full breakdown per address: county, city/village, township, other offices — exactly as the data model intends; never conflate roles.
35. **[F]** Show which offices do what: sign permit issuer, electrical permit issuer, electrical inspector, zoning office — as a labeled list, not a data dump.
36. **[UX]** Color-code verified vs unverified vs needs-review candidates so the eye lands on the trustworthy one.
37. **[F]** Click any boundary candidate on the map → highlight the matching card (and vice versa) so map and list agree.
38. **[UX]** "Wrong place?" — one click to re-search with a corrected address without losing the dialog state.
39. **[F]** Manual pin-drag on the map → re-resolve the jurisdiction for the dragged point (for when geocoding lands on the wrong side of a boundary).

## D — Applying the result

40. **[F]** One-button apply: "Use Milford, OH" → writes the locality to the work order and closes — the picker's only positive action.
41. **[H]** Apply must be atomic-ish: write PermitLineItem locality_id via the CAS path (exists) and surface conflicts cleanly, not a silent 409.
42. **[F]** After apply, show a confirmation chip on the job card: "Permit office: Milford, OH — verified" with a link to change it.
43. **[F]** Allow applying WITHOUT a full authority review for jobs that just need the locality (show a "details still being verified" hint instead of blocking).
44. **[F]** Bulk-apply: multiple jobs in the same town → apply one verified jurisdiction to all selected work orders.
45. **[UX]** If apply fails, the error must name the step ("Couldn't link Milford to this job — reload and try again") — never a raw 500.
46. **[F]** Undo an apply within a short window — users change their minds; reverting shouldn't need admin intervention.

## E — Authority review / who to call

47. **[F]** Per-locality office card: the office that issues sign permits, with phone, address, hours, permit portal link — the thing the estimator actually calls.
48. **[F]** Electrical permit + electrical inspection authority as separate cards — NEVER combine with the sign office.
49. **[UX]** "Call" / "Email" / "Open portal" buttons on each office card — the review becomes actionable in one click.
50. **[F]** Source link on every claim — tap the claim → open the government source the data came from.
51. **[UX]** Last-verified date on each office card, plain language: "Checked on Oct 20" → "More than 90 days old — may need a re-check".
52. **[F]** Flag stale jurisdictions in the repository automatically (last-verified > N days) and queue them for re-verification.
53. **[F]** Record a call outcome per office ("they said permits take 2 weeks") — the tribal knowledge stays with the jurisdiction.
54. **[F]** Fee snapshot where known: "Sign permit ≈ $75" sourced from the office's fee schedule page.
55. **[F]** Turnaround estimate where known: "Typical approval: 5–10 business days" sourced or marked unverified.

## F — Repository (saved jurisdictions)

56. **[UX]** The repository list needs a big search box: type "milford" → city, township, county rows labeled separately — no conflation.
57. **[F]** Filter chips: verified / draft / needs-review / with-electrical-data — staff should find gaps in one click.
58. **[UX]** Duplicate/ambiguous rows get a visible warning chip — "Milford appears twice — a staff member should review".
59. **[F]** Merge flow for true duplicates with a relink preview (like the customer merge) — never silently collapse city/township pairs that merely share a name.
60. **[H][DONE]** Draft localities should never be silently promoted to verified — require the authority review to complete first (gated in `confirmDraftFromRepository` + `requireReviewedRepositoryProfile`).
61. **[F]** Sort repository by "most-used" — jurisdictions touched by recent jobs float to the top.
62. **[F]** Export the repository to CSV for offline review.
63. **[F]** Print/share a jurisdiction summary card — the field tech wants the office address + phone, not the whole repository.
64. **[H]** Research-backlog rows: a locality that keeps failing boundary verification needs a visible "problem" flag, not silent retries.
65. **[F]** A jurisdiction with NO verified source evidence shows a warning badge — unverified data never looks confident.

## G — Page layout + accessibility (young AND old users)

66. **[UX]** Big-text mode toggle on the permitting page — 18px+ everything for older users.
67. **[UX]** High-contrast option — status colors get text labels too so color isn't the only signal.
68. **[UX]** Touch targets ≥ 44px on the picker buttons/cards — small select buttons are unusable on a phone or shaky hands.
69. **[UX]** Keyboard navigation: Tab through candidates, Enter to select, Esc to close — the picker is currently mouse-driven.
70. **[UX]** Screen-reader labels: every candidate card needs aria-labels reading "Milford, Ohio — verified — select this office".
71. **[UX]** Focus management: when the search completes, focus jumps to the result card — announce it via aria-live.
72. **[UX]** Reduced-motion mode: the map/skeleton transitions shouldn't disorient users with vestibular sensitivity.
73. **[UX]** The picker dialog needs a visible, labeled Close button in the top-right — not an icon-only X.
74. **[UX]** Status badges get words, not just colors: "Verified", "Needs review", "Draft" — readable without a legend.
75. **[UX]** Font size for the picker input should be 16px+ — iOS zoom-on-focus with small inputs is a classic complaint.
76. **[UX]** Plain-language sweep #3: every remaining technical string ("authority_established", "boundary_intersection", "CAS conflict") gets human copy.
77. **[UX]** The scan-activity panel needs an explain-me tooltip — "This shows what the system checked behind the scenes. You don't need it — it's for us."
78. **[UX]** The jurisdiction picker title should say what the user is DOING: "Which office issues permits for this address?" — not "Choose your jurisdiction" (better than it was, still jargon-y).

## H — Reliability / hardening the pipeline

79. **[H]** Frontend mount burst: batch page-level `staffDataRead` calls — one read returning multiple entities would cut the burst ~10x. Needs a `staffDataRead` multi-entity mode.
80. **[H]** Silent-retry for transient 429s in loadAllEntityRows — most bursts recover in <1s; the UI shouldn't flash errors for recoverable blips.
81. **[H]** `staffDataRead` response caching for slowly-changing catalogs (JurisdictionProfile, PermitLocality repository list) — a 30s TTL kills repeat mount storms.
82. **[H]** `permittingScanStatus` poll: back off when the scan is idle (>30s with no progress → poll every 8s, not 3s).
83. **[H]** Offline tolerance: if `staffDataRead` is unreachable, show last-cached data with a "working offline" banner instead of an empty main.
84. **[H]** Idempotent draft-create at the SERVER layer too — client dedupe (createPermitLocalityIfAbsent) is a courtesy, not a guarantee under double-submit races.
85. **[H]** CAS guard on PermitLocality updates (when update ops get added) — concurrent repository edits must not clobber each other.
86. **[H]** Audit trail on jurisdiction changes: who changed a locality name/state/authority fields and when — a simple `notes_log`-style array on the entity.
87. **[H]** If `resolvePermittingAddress` returns 5xx mid-scan, the picker should re-attempt with a clean retry (already retries 429s; extend to 5xx).
88. **[H]** Timeouts: searches longer than 90s should say "taking longer than usual" and offer a cancel — never spin forever.
89. **[H]** Guard the draft-create path for non-admin users — the UI currently hides it by role but the create path itself should also fail closed.
90. **[H]** Keep `county/city/township/village` strictly separate in every data write — the enduring rule; a code audit is a dedicated pass.

## I — Job card integration

91. **[F]** "Permit office" field on every job card — shows the applied locality at a glance, not buried in a line item.
92. **[F]** Unassigned jobs get a prominent "Find the permit office →" CTA — the empty state tells the user what to do.
93. **[F]** Jobs in the same verified jurisdiction visually group — a county/cluster header so staff see coverage at a glance.
94. **[F]** Permit due-date/chase reminders on the job card — "Permit application due in 3 days" for jobs whose jurisdiction data is stale.
95. **[F]** Track permit-status per job line (applied, in-review, approved, issued, inspected) — not just "locality chosen".
96. **[UX]** A pending-permit badge on the page header — "3 jobs still need a jurisdiction chosen" — the work queue is visible.
97. **[F]** Permit-number field per line item once issued — the clerk types it in, the history stays with the job.
98. **[F]** Permit document upload/link on the line — the PDF lives where the permit is tracked.

## J — Search quality / matching

99. **[H]** Boundary-fallback ladder: Google → Census → Census-Places → address-level → manual city-entry — the user never hits a dead end.
100. **[F]** Manual-entry escape hatch: "Can't find the address? Type the city/village/township name directly" — never blocks on a geocoder.
101. **[H][DONE]** Same-name ambiguity resolution: "Milford, OH" appears as city AND township — candidates labeled by type (city/township/county), never merged.
102. **[H]** Multi-state handling: an address on a state line should surface BOTH states' candidates — current logic prefers the geocoded one.
103. **[F]** Auto-apply when there's exactly one verified, unambiguous match — the happy path needs zero extra clicks.
104. **[F]** "Are you sure?" confirm for apply when the match is low-confidence — the boundary case needs one pause, not blind trust.
105. **[H]** Preserve detected-vs-repository distinction in ALL writes — the picker's location_resolution must never overwrite a verified repository row with a weaker detected one.
106. **[F]** Alias table for common name variants ("City of Milford" ↔ "Milford") so searches don't fail on office-name formatting.
107. **[H]** Strip/normalize ZIP+4, abbreviations ("St"↔"Street"), suite numbers — input tolerance before lookup.

## K — Notifications + follow-through

108. **[F]** When a jurisdiction's authority review completes, surface it on the job card — "Milford office details verified".
109. **[F]** When an office's data goes stale, flag it — "Milford office info last verified 6 months ago".
110. **[F]** Reminder when a job has had a jurisdiction picked but no permit-applied status in N days — permits age without tracking.
111. **[F]** Internal note/activity feed per job-line for permit status changes ("applied on Oct 22", "approved on Oct 30").
112. **[F]** If a jurisdiction's repository row gets merged/updated, jobs linked to the old row get flagged for re-verify — never silently linked to stale data.
113. **[F]** One-click "re-check this jurisdiction" per job — re-runs the address pipeline and shows what changed.
114. **[F]** Show the original search that produced the applied locality — the audit trail on the job.

## L — Polish

115. **[UX]** Empty state for the picker when no address entered: a friendly "Type the job's street address above" with an example — not a blank dialog.
116. **[UX]** Skeleton states while cards load — never show a half-rendered empty `main` like the 429-storm case.
117. **[UX]** The card grid's responsive behavior on a phone: one column, big buttons — the current layout was desktop-first.
118. **[UX]** Sort/filter the permit line items inside a client group — long lists need a simple "show only unpermitted".
119. **[F]** A "Print this jurisdiction's details" view — clerk takes a paper copy of office name/address/phone to the phone call.
120. **[UX]** Undo/history of searches in the dialog — the back-arrow restores the previous search, not close-everything.
121. **[UX]** Accessibility pass on color contrast for every status chip/badge — WCAG AA minimum.
122. **[UX]** Reduced copy density in the picker's review section — the current "authority review" block is too wordy for a fast flow.
123. **[F]** First-run walkthrough: one small guided overlay on first use ("Type an address → pick the office → apply it") — dismissible, never repeats.
124. **[UX]** Every icon-only control gets a label or tooltip — older users don't know what the pin/leaflet icons do.
125. **[H]** Performance audit on the picker mount — the dialog currently fires several parallel calls before the user types; the search should only run on demand.
126. **[F]** A debug-mode toggle (staff only) showing the raw pipeline events for troubleshooting — hidden behind "Show technical details" for normal users.
127. **[UX]** When there's literally nothing to do (empty workspace), a friendly "No permit work right now" screen with what-that-means copy.
128. **[F]** An in-app help page for the permitting flow — the plain-language manual for the team.
129. **[H]** Regression suite for the picker flow: address in → resolve → boundary match → apply — every step asserts the right entity ops fired.
130. **[H]** Contract-check the picker's writes: every PermitLocality/PermitLineItem create/update goes through the gateway + CAS — no direct base44.entities calls remain on the page (partially fixed; sweep the rest).

## M — Dedicated-pass items (bigger scope, already analyzed)

131. **[F]** Batch `staffDataRead` multi-entity mode — the mount-burst fix needs this even after the governor lands (79).
132. **[F]** Address-suggest service — real autocomplete needs a suggest API the Census geocoder doesn't have (15).
133. **[F]** Permit-status workflow state machine on line items — needs its own field + transitions + UI (95).
134. **[F]** Boundary-polygon overlay on the picker map — needs the GeoJSON stored per locality + a polygon render layer (37).
135. **[F]** Jurisdiction expiry + auto-re-verify scheduling — needs a recurring function + a stale flag (52).
136. **[F]** Shared permit-office contact DB with call outcomes — needs its own entity + UI (53).
