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
10. **[H][DONE]** Verify remaining permitting functions are all retry-wrapped (`checkPermitFollowupReminders`, `scanPermittingOffice`, `permittingOfficeCandidate`, `downloadPermitPDF`, etc. — audit all ~158 functions for the wrapper).

## A — One-field address entry (the core UX)

11. **[F][DONE]** Single primary input: the job-address field is THE control — everything else (map, candidates, apply) is consequence, not separate steps.
12. **[F][DONE]** Auto-load the client/job address into the search field on open — zero typing when the client already has an address.
13. **[F][DONE]** Auto-search once a prefilled address lands — the user opens the picker and the lookup already ran.
14. **[F][DONE]** Paste-and-parse: pasting "914 Lila Ave, Milford OH 45150" from anywhere should populate and auto-search without clicking.
15. **[F][FLAGGED]** Address autocomplete/suggestions as the user types (Census geocoder has no suggest API — evaluate a cheap suggest layer or reuse saved address history for type-ahead).
16. **[UX][DONE]** Recent-address list per user — last 5 searches one-click re-runnable.
17. **[F][DONE]** "Same as another job" — copy a jurisdiction from a recent job by client name (reuses verified localities).
18. **[UX][DONE]** Validation before search: warn if the address lacks a city/ZIP/state instead of failing silently ("That address is missing a city — try adding one").
19. **[UX][DONE]** If the geocoder returns a corrected address, show "Did you mean…" and let the user accept the correction in one click.
20. **[F][DONE]** Saved/favorite addresses per client — a client with recurring job sites should remember them.

## B — Search progress + feedback

21. **[UX][DONE]** Plain-language pass on picker copy — "Type the full street address and press Find my jurisdiction" replaces jargon.
22. **[UX][DONE]** Show WHY a search is taking a while — named stages ("Finding the address", "Checking saved jurisdictions", "Checking which offices cover it") instead of a spinner.
23. **[UX][DONE]** Progress indicator with the current stage + a realistic hint ("Usually takes 5–15 seconds").
24. **[F][DONE]** Cancel a running search and keep the last result — currently cancellation leaves the dialog in limbo.
25. **[UX][DONE]** Retry button that re-runs the last search in one click when the geocoder/network blips — no retyping.
26. **[UX][DONE]** Error messages that say what to do next, not what broke: "We couldn't reach the map service. Try again — or type the city and state manually."
27. **[F][DONE]** Persist the last search per work order so reopening the picker restores the in-flight context.
28. **[H][DONE]** Debounce + dedupe parallel searches — double-clicking Find must not fire two scans (searchVersion ref exists; verify it covers rapid re-clicks).
29. **[UX][DONE]** Distinguish "still looking" vs "found nothing" — the current copy merges them into one confusing state.

## C — Results: making the answer obvious

30. **[UX][DONE]** The detected jurisdiction should be a BIG, obvious card: name, state, "This is where your permit goes" + a single Apply button.
31. **[UX][DONE]** Explain the result in one sentence: "914 Lila Ave is inside the City of Milford, Clermont County — the city office issues your sign permit."
32. **[F][DONE]** Confidence badge on the result — "Verified by map boundary" vs "Best guess from city name" vs "Needs review" with a plain explanation of why.
33. **[UX][DONE]** When city AND township both match, show them as separate, clearly-labeled cards — never merge. State which one the address falls inside and why the other also appears.
34. **[F][DONE]** Show the full breakdown per address: county, city/village, township, other offices — exactly as the data model intends; never conflate roles.
35. **[F][DONE]** Show which offices do what: sign permit issuer, electrical permit issuer, electrical inspector, zoning office — as a labeled list, not a data dump.
36. **[UX][DONE]** Color-code verified vs unverified vs needs-review candidates so the eye lands on the trustworthy one.
37. **[F][FLAGGED]** Click any boundary candidate on the map → highlight the matching card (and vice versa) so map and list agree.
38. **[UX][DONE]** "Wrong place?" — one click to re-search with a corrected address without losing the dialog state.
39. **[F][FLAGGED]** Manual pin-drag on the map → re-resolve the jurisdiction for the dragged point (for when geocoding lands on the wrong side of a boundary).

## D — Applying the result

40. **[F][DONE]** One-button apply: "Use Milford, OH" → writes the locality to the work order and closes — the picker's only positive action.
41. **[H][DONE]** Apply must be atomic-ish: write PermitLineItem locality_id via the CAS path (exists) and surface conflicts cleanly, not a silent 409.
42. **[F][DONE]** After apply, show a confirmation chip on the job card: "Permit office: Milford, OH — verified" with a link to change it.
43. **[F][DONE]** Allow applying WITHOUT a full authority review for jobs that just need the locality (show a "details still being verified" hint instead of blocking).
44. **[F][FLAGGED]** Bulk-apply: multiple jobs in the same town → apply one verified jurisdiction to all selected work orders.
45. **[UX][DONE]** If apply fails, the error must name the step ("Couldn't link Milford to this job — reload and try again") — never a raw 500.
46. **[F][DONE]** Undo an apply within a short window — users change their minds; reverting shouldn't need admin intervention.

## E — Authority review / who to call

47. **[F][DONE]** Per-locality office card: the office that issues sign permits, with phone, address, hours, permit portal link — the thing the estimator actually calls.
48. **[F][DONE]** Electrical permit + electrical inspection authority as separate cards — NEVER combine with the sign office.
49. **[UX][DONE]** "Call" / "Email" / "Open portal" buttons on each office card — the review becomes actionable in one click.
50. **[F][DONE]** Source link on every claim — tap the claim → open the government source the data came from.
51. **[UX][DONE]** Last-verified date on each office card, plain language: "Checked on Oct 20" → "More than 90 days old — may need a re-check".
52. **[F][DONE]** Flag stale jurisdictions in the repository automatically (last-verified > N days) and queue them for re-verification.
53. **[F][FLAGGED]** Record a call outcome per office ("they said permits take 2 weeks") — the tribal knowledge stays with the jurisdiction.
54. **[F][DONE]** Fee snapshot where known: "Sign permit ≈ $75" sourced from the office's fee schedule page.
55. **[F][DONE]** Turnaround estimate where known: "Typical approval: 5–10 business days" sourced or marked unverified.

## F — Repository (saved jurisdictions)

56. **[UX][DONE]** The repository list needs a big search box: type "milford" → city, township, county rows labeled separately — no conflation.
57. **[F][DONE]** Filter chips: verified / draft / needs-review / with-electrical-data — staff should find gaps in one click.
58. **[UX][DONE]** Duplicate/ambiguous rows get a visible warning chip — "Milford appears twice — a staff member should review".
59. **[F][FLAGGED]** Merge flow for true duplicates with a relink preview (like the customer merge) — never silently collapse city/township pairs that merely share a name.
60. **[H][DONE]** Draft localities should never be silently promoted to verified — require the authority review to complete first (gated in `confirmDraftFromRepository` + `requireReviewedRepositoryProfile`).
61. **[F][DONE]** Sort repository by "most-used" — jurisdictions touched by recent jobs float to the top.
62. **[F][DONE]** Export the repository to CSV for offline review.
63. **[F][DONE]** Print/share a jurisdiction summary card — the field tech wants the office address + phone, not the whole repository.
64. **[H][DONE]** Research-backlog rows: a locality that keeps failing boundary verification needs a visible "problem" flag, not silent retries.
65. **[F][DONE]** A jurisdiction with NO verified source evidence shows a warning badge — unverified data never looks confident.

## G — Page layout + accessibility (young AND old users)

66. **[UX][DONE]** Big-text mode toggle on the permitting page — 18px+ everything for older users.
67. **[UX][DONE]** High-contrast option — status colors get text labels too so color isn't the only signal.
68. **[UX][DONE]** Touch targets ≥ 44px on the picker buttons/cards — small select buttons are unusable on a phone or shaky hands.
69. **[UX][DONE]** Keyboard navigation: Tab through candidates, Enter to select, Esc to close — the picker is currently mouse-driven.
70. **[UX][DONE]** Screen-reader labels: every candidate card needs aria-labels reading "Milford, Ohio — verified — select this office".
71. **[UX][DONE]** Focus management: when the search completes, focus jumps to the result card — announce it via aria-live.
72. **[UX][DONE]** Reduced-motion mode: the map/skeleton transitions shouldn't disorient users with vestibular sensitivity.
73. **[UX][DONE]** The picker dialog needs a visible, labeled Close button in the top-right — not an icon-only X.
74. **[UX][DONE]** Status badges get words, not just colors: "Verified", "Needs review", "Draft" — readable without a legend.
75. **[UX][DONE]** Font size for the picker input should be 16px+ — iOS zoom-on-focus with small inputs is a classic complaint.
76. **[UX][DONE]** Plain-language sweep #3: every remaining technical string ("authority_established", "boundary_intersection", "CAS conflict") gets human copy.
77. **[UX][DONE]** The scan-activity panel needs an explain-me tooltip — "This shows what the system checked behind the scenes. You don't need it — it's for us."
78. **[UX][DONE]** The jurisdiction picker title should say what the user is DOING: "Which office issues permits for this address?" — not "Choose your jurisdiction" (better than it was, still jargon-y).

## H — Reliability / hardening the pipeline

79. **[H][DONE]** Frontend mount burst: batch page-level `staffDataRead` calls — one read returning multiple entities would cut the burst ~10x. Needs a `staffDataRead` multi-entity mode.
80. **[H][DONE]** Silent-retry for transient 429s in loadAllEntityRows — most bursts recover in <1s; the UI shouldn't flash errors for recoverable blips.
81. **[H][DONE]** `staffDataRead` response caching for slowly-changing catalogs (JurisdictionProfile, PermitLocality repository list) — a 30s TTL kills repeat mount storms.
82. **[H][DONE]** `permittingScanStatus` poll: back off when the scan is idle (>30s with no progress → poll every 8s, not 3s).
83. **[H][FLAGGED]** Offline tolerance: if `staffDataRead` is unreachable, show last-cached data with a "working offline" banner instead of an empty main.
84. **[H][DONE]** Idempotent draft-create at the SERVER layer too — client dedupe (createPermitLocalityIfAbsent) is a courtesy, not a guarantee under double-submit races.
85. **[H][DONE]** CAS guard on PermitLocality updates (when update ops get added) — concurrent repository edits must not clobber each other.
86. **[H][DONE]** Audit trail on jurisdiction changes: who changed a locality name/state/authority fields and when — a simple `notes_log`-style array on the entity.
87. **[H][DONE]** If `resolvePermittingAddress` returns 5xx mid-scan, the picker should re-attempt with a clean retry (already retries 429s; extend to 5xx).
88. **[H][DONE]** Timeouts: searches longer than 90s should say "taking longer than usual" and offer a cancel — never spin forever.
89. **[H][DONE]** Guard the draft-create path for non-admin users — the UI currently hides it by role but the create path itself should also fail closed.
90. **[H][FLAGGED for dedicated audit]** Keep `county/city/township/village` strictly separate in every data write — the enduring rule; a code audit is a dedicated pass.

## I — Job card integration

91. **[F][DONE]** "Permit office" field on every job card — shows the applied locality at a glance, not buried in a line item.
92. **[F][DONE]** Unassigned jobs get a prominent "Find the permit office →" CTA — the empty state tells the user what to do.
93. **[F][FLAGGED]** Jobs in the same verified jurisdiction visually group — a county/cluster header so staff see coverage at a glance.
94. **[F][DONE]** Permit due-date/chase reminders on the job card — "Permit application due in 3 days" for jobs whose jurisdiction data is stale.
95. **[F][DONE]** Track permit-status per job line (applied, in-review, approved, issued, inspected) — not just "locality chosen".
96. **[UX][DONE]** A pending-permit badge on the page header — "3 jobs still need a jurisdiction chosen" — the work queue is visible.
97. **[F][DONE]** Permit-number field per line item once issued — the clerk types it in, the history stays with the job.
98. **[F][DONE]** Permit document upload/link on the line — the PDF lives where the permit is tracked.

## J — Search quality / matching

99. **[H][DONE]** Boundary-fallback ladder: Google → Census → Census-Places → address-level → manual city-entry — the user never hits a dead end.
100. **[F][DONE]** Manual-entry escape hatch: "Can't find the address? Type the city/village/township name directly" — never blocks on a geocoder.
101. **[H][DONE]** Same-name ambiguity resolution: "Milford, OH" appears as city AND township — candidates labeled by type (city/township/county), never merged.
102. **[H][FLAGGED]** Multi-state handling: an address on a state line should surface BOTH states' candidates — current logic prefers the geocoded one.
103. **[F][DONE]** Auto-apply when there's exactly one verified, unambiguous match — the happy path needs zero extra clicks.
104. **[F][DONE]** "Are you sure?" confirm for apply when the match is low-confidence — the boundary case needs one pause, not blind trust.
105. **[H][DONE]** Preserve detected-vs-repository distinction in ALL writes — the picker's location_resolution must never overwrite a verified repository row with a weaker detected one.
106. **[F][DONE]** Alias table for common name variants ("City of Milford" ↔ "Milford") so searches don't fail on office-name formatting.
107. **[H][DONE]** Strip/normalize ZIP+4, abbreviations ("St"↔"Street"), suite numbers — input tolerance before lookup.

## K — Notifications + follow-through

108. **[F][DONE]** When a jurisdiction's authority review completes, surface it on the job card — "Milford office details verified".
109. **[F][DONE]** When an office's data goes stale, flag it — "Milford office info last verified 6 months ago".
110. **[F][DONE]** Reminder when a job has had a jurisdiction picked but no permit-applied status in N days — permits age without tracking.
111. **[F][DONE]** Internal note/activity feed per job-line for permit status changes ("applied on Oct 22", "approved on Oct 30").
112. **[F][DONE]** If a jurisdiction's repository row gets merged/updated, jobs linked to the old row get flagged for re-verify — never silently linked to stale data.
113. **[F][DONE]** One-click "re-check this jurisdiction" per job — re-runs the address pipeline and shows what changed.
114. **[F][DONE]** Show the original search that produced the applied locality — the audit trail on the job.

## L — Polish

115. **[UX][DONE]** Empty state for the picker when no address entered: a friendly "Type the job's street address above" with an example — not a blank dialog.
116. **[UX][DONE]** Skeleton states while cards load — never show a half-rendered empty `main` like the 429-storm case.
117. **[UX][DONE]** The card grid's responsive behavior on a phone: one column, big buttons — the current layout was desktop-first.
118. **[UX][DONE]** Sort/filter the permit line items inside a client group — long lists need a simple "show only unpermitted".
119. **[F][DONE]** A "Print this jurisdiction's details" view — clerk takes a paper copy of office name/address/phone to the phone call.
120. **[UX][DONE]** Undo/history of searches in the dialog — the back-arrow restores the previous search, not close-everything.
121. **[UX][FLAGGED for dedicated audit]** Accessibility pass on color contrast for every status chip/badge — WCAG AA minimum.
122. **[UX][DONE]** Reduced copy density in the picker's review section — the current "authority review" block is too wordy for a fast flow.
123. **[F][DONE]** First-run walkthrough: one small guided overlay on first use ("Type an address → pick the office → apply it") — dismissible, never repeats.
124. **[UX][DONE]** Every icon-only control gets a label or tooltip — older users don't know what the pin/leaflet icons do.
125. **[H][DONE]** Performance audit on the picker mount — the dialog currently fires several parallel calls before the user types; the search should only run on demand.
126. **[F][DONE]** A debug-mode toggle (staff only) showing the raw pipeline events for troubleshooting — hidden behind "Show technical details" for normal users.
127. **[UX][DONE]** When there's literally nothing to do (empty workspace), a friendly "No permit work right now" screen with what-that-means copy.
128. **[F][DONE]** An in-app help page for the permitting flow — the plain-language manual for the team.
129. **[H][DONE]** Regression suite for the picker flow: address in → resolve → boundary match → apply — every step asserts the right entity ops fired.
130. **[H][DONE]** Contract-check the picker's writes: every PermitLocality/PermitLineItem create/update goes through the gateway + CAS — no direct base44.entities calls remain on the page (partially fixed; sweep the rest).

## M — Dedicated-pass items (bigger scope, already analyzed)

131. **[F][DONE]** Batch `staffDataRead` multi-entity mode — the mount-burst fix needs this even after the governor lands (79).
132. **[F][DONE]** Address-suggest service — real autocomplete needs a suggest API the Census geocoder doesn't have (15).
133. **[F][FLAGGED]** Permit-status workflow state machine on line items — needs its own field + transitions + UI (95).
134. **[F][DONE]** Boundary-polygon overlay on the picker map — needs the GeoJSON stored per locality + a polygon render layer (37).
135. **[F][DONE]** Jurisdiction expiry + auto-re-verify scheduling — needs a recurring function + a stale flag (52).
136. **[F][FLAGGED]** Shared permit-office contact DB with call outcomes — needs its own entity + UI (53).

# --- ROUND 2 (items 137-236) ---

Second hundred. Same rules: permitting session only, never conflate county/city/village/township, never approve unsupported findings. Ordered roughly easiest→hardest per section.

## N — Address entry, round 2

137. **[UX][DONE]** Placeholder example inside the empty input — "e.g. 914 Lila Ave, Milford, OH 45150" so first-timers see the shape before typing.
138. **[F]** QR/barcode scan of a printed work order → pulls the job address straight into the picker (field techs on tablets).
139. **[UX][DONE]** Address field accepts just a ZIP code → narrows to ZIP's localities and says "a ZIP alone isn't enough — add the street".
140. **[F]** Geolocate-me button: use the browser's GPS to pre-fill coordinates → reverse-resolve the jurisdiction (great for a tech standing on the site).
141. **[UX][DONE]** When the prefilled address is stale (job edited), show "address changed since last search — search again?" instead of silently re-using the old result.
142. **[F]** Multi-address input: paste several job addresses at once → resolves each in sequence with a per-address status list.
143. **[UX]** Voice input for the address field (Web Speech API) — hands-free for someone holding a tape measure.
144. **[F]** Address from a dropped photo with EXIF GPS (site photo dropped on the input → coordinates → jurisdiction).
145. **[UX][DONE]** Spelling-tolerant search: "Milford OH 45150" without a street still finds Milford's candidates and says so plainly.
146. **[F][DONE]** Intersection syntax: "Lila Ave & Main St, Milford" resolves via the geocoder's free-form match.
147. **[UX]** If the address resolves to a PO box/rural route, say it plainly ("We found a postal area, not a situs address — check the map pin").

## O — Candidate clarity, round 2

148. **[UX][DONE]** Each candidate card gets a one-line "why it's here": "The map pin falls inside its boundary" vs "Same name as the town" — the reason, not just the name.
149. **[UX]** Distance hint on candidates: "About 0.3 miles from the pin" — helps spot a boundary-edge mistake.
150. **[F]** "Compare side by side" for two candidates: county vs city vs township offices shown in columns so the difference is obvious.
151. **[UX][DONE]** The detected card states what it is NOT: "Not a township address — it sits inside the city." Kills second-guessing.
152. **[F][DONE]** Show the FULL containment chain on the card: Address → City of Milford → Clermont County → Ohio — every level separately.
153. **[UX]** A boundary-edge warning: "The pin is within ~200 ft of the city line — the next office over is X Township" when the margin is thin.
154. **[F]** Per-candidate "evidence" link opening the exact source page that proved coverage.
155. **[UX][DONE]** Candidate cards sorted: verified-detected first, then verified-repository, then unverified — never alphabetical.
156. **[F][DONE]** County offices listed as their own card (county zoning/electrical when unincorporated) — never folded into the city card.
157. **[UX][DONE]** When the pin lands in a village, label it "village" not "city" — the type words matter and Ohio mixes them.
158. **[F]** Extraterritorial jurisdiction (ETJ) hints: city-owned land outside city limits flags "ETJ — the city may still issue permits here".

## P — The job card, round 2

159. **[UX][DONE]** The permit section's first line answers "what do I do next?": "Find the permit office" / "Call (513) 831-7143" / "Waiting on review".
160. **[F][DONE]** Permit checklist per line: application submitted → fee paid → permit issued → inspection scheduled → final passed — checkable steps, not just text.
161. **[UX][DONE]** Overdue highlighting: a permit step sitting open > N days goes amber, then red — aging is visible at a glance.
162. **[F][DONE]** "Next action" field per line: who does what by when — editable inline.
163. **[UX][DONE]** A compact "at a glance" strip per client: offices needed · picked · verified · permits issued — four numbers.
164. **[F][DONE]** Per-line assignee chip — who owns chasing this office (falls back to the WO assignee).
165. **[UX][DONE]** Copy-all-offices button: "Copy contact info" → clipboard block with every office's phone/portal for pasting into email.
166. **[F]** Attach the application PDF draft to the line before it's even sent — the file lives with the line.
167. **[UX]** Line reorder via drag — staff order the offices the way they actually work them.
168. **[F]** A "call log" mini-timeline per line: tap "+" → "called office, spoke to Jane, resubmit Friday" — the chase history stays with the job.
169. **[UX][DONE]** Collapsed vs expanded line state remembered per user — the board doesn't re-expand everything on reload.
170. **[F]** Batch status: select multiple lines → mark them all "application submitted" in one click.

## Q — Repository & jurisdiction data, round 2

171. **[UX][DONE]** Repository row shows the ONE thing staff care about first: "Sign permit office verified — call (513) 831-7143" — front and center.
172. **[F]** Confidence-tier per office claim: verified source / inferred from county rule / unverified — a 3-dot indicator on each office.
173. **[UX]** "What changed" diff on jurisdiction updates — the change_log entries render as "phone changed" not raw JSON.
174. **[F][FLAGGED]** Office hours normalized + "open now?" — "Open until 4:30 PM" vs "Closed today" when the data exists.
175. **[UX][DONE]** Jurisdiction notes field: free-text staff notes ("they only take checks") pinned on the profile.
176. **[F]** Photo/scan attachments on a jurisdiction: the fee-schedule PDF or the printed rules page as evidence.
177. **[UX]** Linked-jobs count per jurisdiction: "Used on 14 jobs" — the high-traffic rows get attention first.
178. **[F]** Version compare on a jurisdiction: current vs an archived snapshot — what the AI/staff edits actually changed.
179. **[UX][DONE]** Search by phone number or office name — "who is (513) 831-7143?" → the jurisdiction row.
180. **[F]** Jurisdiction export bundle: one jurisdiction's offices + evidence + sources as a shareable JSON/PDF for a partner shop.
181. **[UX][DONE]** Recently-researched strip: the 5 most-recently-verified jurisdictions at the top of the repository.
182. **[F]** Boundary map thumbnail per jurisdiction (if GeoJSON exists) — a visual sanity check the profile is the right shape.
183. **[UX][DONE]** "Needs electrical review" chip where sign+zoning verified but electrical isn't — partial states are visible.
184. **[F]** Contact-import from a business card photo (OCR on the phone# + name) — fast office-data entry.
185. **[H]** Jurisdiction-merge staging: queue a merge → preview affected jobs → confirm — never a one-click clobber (ties to item 59).

## R — Pipeline & backend, round 2

186. **[H]** Warm the catalog cache on page load — one batch read fills JurisdictionProfile + PermitLocality + GlobalSettings together (uses the new batch mode).
187. **[H][DONE]** Circuit-breaker on the resolver: after 3 consecutive 5xx, show "lookup service is having trouble" instead of hammering it.
188. **[H]** Request timing headers on the resolver response so slow paths are measurable server-side.
189. **[H]** A `permittingHealth` probe function: geocoder + census + boundary + repository-read statuses in one call — first thing to check on a bad report.
190. **[H]** Dead-letter on failed scans: a scan that errors mid-write lands in a reviewable queue instead of vanishing.
191. **[H]** Deterministic idempotency key on resolver calls: same address+options in 10s → return the cached result, don't re-scan.
192. **[H]** Rate-limit-aware queue for bulk lookups: many addresses resolved server-side with pacing, not parallel invokes.
193. **[H]** Structured timing/stage log on the scan record — which stage ate the seconds (geocode vs boundary vs office review).
194. **[H]** Email-free status delivery: the scan-activity panel IS the notification surface — a subtle badge when a watched scan finishes.
195. **[H][DONE]** Graceful half-result: boundary matched but office review timed out → usable locality + "offices still checking" (partial success, not failure).
196. **[H]** Cap scan-activity retention: prune stale runs older than N days so the panel stays fast.
197. **[H]** Defensive parser on geocoder responses: a malformed payload becomes a clear "map service returned something odd" not a crash.
198. **[H]** Feature flag the fallback geocoder path so a Nominatim outage can't cascade into the picker.

## S — Accessibility & simplicity, round 2

199. **[UX]** A "one big button" mode: hide every optional control (electrical toggle, debug, repository browse) behind a "show more options" — default view is just address + find + result + apply.
200. **[UX]** Spanish/other-language toggle on the picker copy — the field crew isn't all English-first.
201. **[UX]** Dyslexia-friendly font option (OpenDyslexic or just letter-spacing bump) alongside the big-text toggle.
202. **[UX][DONE]** Every number on a status chip also gets the unit word: "3 offices" not just "3".
203. **[UX]** The map's "this is the pin" label: a plain "Your job is here" bubble so the visual isn't ambiguous.
204. **[UX][DONE]** Color-blind safe status: verified=check-icon+word, needs-review=?-icon+word — shape+text, not color alone.
205. **[UX][DONE]** Error recovery reads like a person wrote it: "That lookup hit a snag — try it again, or skip to picking from the saved list."
206. **[UX][DONE]** Confirmation before leaving with unsaved work: closing the picker mid-search asks "leave the lookup running?".
207. **[UX][DONE]** Focus-outline visibility: every focusable element shows a clear 2px ring — keyboard users can see where they are.
208. **[UX]** "Read aloud" button on the office card (SpeechSynthesis) — for a driver who can't look at the screen.
209. **[UX][DONE]** Estimated steps on first open: "This takes 3 steps, usually under a minute" — sets expectations up front.
210. **[UX][DONE]** A persistent "how's this going?" hint under the button while searching: the current stage as words, not just a spinner.

## T — Field/on-site workflow

211. **[F]** "On-site now" mode: GPS + one-tap confirm the jurisdiction matches where the truck is parked.
212. **[F]** Site-photo attach to the permit line: the posted sign photo rides with the permit for the final inspection.
213. **[UX]** Full-screen "dialer" view per office: giant phone number, tap-to-call, plus the office's notes — built for a phone in hand.
214. **[F]** Permit pickup directions: the office's address as a maps link — "drive to this counter".
215. **[UX]** Offline-pocket card: the applied jurisdiction's offices as a cached card readable without signal.
216. **[F][DONE]** Inspection-schedule field: date+time+inspector contact — the visit is tracked where the permit lives.
217. **[UX][DONE]** The whole picker works at 320px wide without horizontal scroll — field phones.
218. **[F][DONE]** Mark-as-inspected from the line: final inspection passed → stamp date + photo + done.
219. **[UX][DONE]** Big "print for the truck" sheet: job address, office address, phone, permit # — one page, taped to the dash.
220. **[F]** A "call next" queue: which of today's jobs need an office call, sorted by age.

## U — Data quality & research depth

221. **[F]** Per-office verification logs: not just "verified" but verified-what: sign-permit ✓, zoning ✓, electrical ✗ — per-role truth.
222. **[H]** Source-coverage scoring: a jurisdiction's score = verified_roles / expected_roles — surfaces thin coverage as a % bar.
223. **[F]** Electrical-issuer vs electrical-inspector separation enforced in the model — two roles, two offices, never merged.
224. **[H]** Cross-check boundary claims: when two sources disagree on whether the pin is in the city, surface the conflict — don't pick silently.
225. **[F]** "Research this" request per locality: flag it for the research queue with a note — the loop from picker → backlog is one click.
226. **[H][DONE]** Sentinel-value sweeper: periodically flags placeholder URLs/emails/phones in jurisdiction rows (exists partially in trust-assess).
227. **[F]** Archived-vs-current version on every document: mark a source superseded, keep it for audit, stop citing it.
228. **[H]** Boundary-version tracking: when a town annexes land, the old boundary claim gets a "may be outdated" flag.
229. **[F]** A "coverage map" per county: which townships/villages/cities in the county have verified offices — the gap map.
230. **[H]** Regression on identity writes: automated check that a write can't set city=county or merge a township into a village row.

## V — Team workflow & visibility

231. **[F]** Permit workload board: per-person "you have N offices to chase" — the day's calls, distributed.
232. **[UX]** Handoff notes on a line: "transfer chasing to Brett" — an internal assignee+note swap, logged.
233. **[F]** Daily digest view: yesterday's applied jurisdictions + today's pending — the morning standup card.
234. **[UX]** Who-applied audit on the job card: "Brett linked Milford, Oct 22" — accountability without digging.
235. **[F][DONE]** Escalation flag: a permit stuck >N days surfaces to a manager queue automatically.
236. **[UX]** Team-verified celebration state: when a jurisdiction's every office is verified, the card shows "fully verified" plainly — a small visible win.
