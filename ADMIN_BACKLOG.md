# Admin Section Improvement Backlog — 300 items

Owned by the **Admin/Settings maintenance session**. Not related to
ESTIMATOR_BACKLOG.md — do not merge these files. Items marked [DONE] are
implemented and verified remote.

## 1. Navigation & Layout (1–10)

1. **[F][DONE]** Left sidebar — opt-in sidebar nav layout (toggle in category row, persists in localStorage)
2. **[UX][DONE]** Mobile nav — "☰ Pages" button opens a full-screen bottom sheet listing every group+tab
3. **[UX][DONE]** "Recently visited" row of 3–5 tabs at the top of Admin home
4. **[F][DONE]** Palette page jumping — Ctrl+K results include standalone pages (Fleet, SOP, Resource Planning…); page results route via createPageUrl
5. **[UX][DONE]** Sticky section header while scrolled deep
6. **[UX][DONE]** Breadcrumb trail for nested pages (Admin → People → Time Clock → PTO Policies)
7. **[F][DONE]** Pinned tabs — star toggle on each tab; pinned tabs sort first (localStorage)
8. **[F][DONE]** Tab badges with live counts (open exceptions, pending approvals, failed syncs)
9. **[F][DONE]** Admin home — stat strip + setup checks + pinned/recent tabs + breadcrumb form the landing dashboard
10. **[UX][DONE]** Deep-link warning — amber banner names the denied tab/subtab and shows the fallback page

## 2. Users Page (11–25)

11. **[F][DONE]** Sortable — Name A-Z/Z-A, Email, Role dropdown on the user list
12. **[F][DONE]** Filters — All/Admins/Users/Full admins chips + name/email/role search + N of M counter (no active/deactivate field exists on rows)
13. **[F][DONE]** Bulk actions — row checkboxes + bulk bar with Grant/Revoke admin (sequential verified writes, failure list)
14. **[F][DONE]** Last-active — verifyLogin stamps last_login_at (fail-safe persist); user rows show active Nd ago / never signed in
15. **[F][DONE]** Session list — UserSession rows per user: sign-in timestamp, expiry, revoke button (sessionAdminAction)
16. **[F][DONE]** Invite flow — authorized email + credentials in one step
17. **[F][DONE]** Avatar — initials chip on every user row (photo tie-in remains deferred, no photo field)
18. **[F][DONE]** Export users to CSV — exports the filtered list (name/email/role/full-admin/sales-roles/pages)
19. **[F][DONE]** CSV import — file picker parses email,name,role; preview list + per-row failure reporting
20. **[F][DONE]** Access popup: presets — "All pages", "People/Integrations/Permitting/Workflow only" quick-apply buttons (checkpoint 6ae2f7d5)
21. **[F][DONE]** Access popup: "effective access" preview — live "This admin will see:" panel with permitted page list + locked-out warning at zero
22. **[F][DONE]** Access popup: copy permissions from another admin — picker applies source admin's is_full_admin + permission tree (checkpoint 6ae2f7d5)
23. **[F][DONE]** Access audit log — AdminAuditLog rows on user updates + session revokes; admin-readable via staffDataRead
24. **[UX][DONE]** Admin permission summary inline on row — "Full access" / "All pages" / "N of 14 pages" badge next to Access button (checkpoint 6ae2f7d5)
25. **[H][DONE]** Deactivate guard — Remove User dialog runs deletion_impact by user identity; shows blockers + live-assignment/history counts

## 3. Time Clock Admin (26–40)

26. **[UX][DONE]** Date-range presets — "Today" added alongside existing Weekly/Monthly/Custom (day-step navigation); also repaired 9 mojibake-corrupted characters
27. **[F][DONE]** Inline expand — clicking an employee name shows a per-day hours breakdown row for that period
28. **[F][DONE]** Approve all clean shifts — "Approve N clean" on Needs Review card; skips pay-period-finalized, punch-exception, and pending-correction entries
29. **[F][DONE]** Attention badge count persisted in nav (see #8)
30. **[F][DONE]** Exception aging — "48h+"/"Nd unreviewed" amber badge on exception rows older than 48h (sources: correction request, punch case, or entry clock-in)
31. **[F][DONE]** Payroll export summary — "Summary" sheet with per-employee shifts/hours/lunch/approval counts precedes the detail sheet
32. **[F][DONE]** Missing-clock-out bulk close — Close all at a set time dialog; per-entry admin_correct_entry with reason; entries whose start is after the time are skipped; failures reported
33. **[H][DONE]** Overlap detection — red "overlapping open shifts" warning block in Needs Attention when an employee has 2+ active clock-ins
34. **[F][DONE]** Edit history inline per row
35. **[F][DONE]** Break-policy violation report
36. **[F][DONE]** Weekly-hours sparkline — inline SVG sparkline of per-day hours in each Hours-by-Employee card
37. **[F][DONE]** PTO balance — per-type available-hours chips on approval detail; "short" flag when request exceeds balance
38. **[H][DONE]** Conflict warning when approving overlapping leave
39. **[F][DONE]** Bulk correction actions — approve/reject multiple requests
40. **[H][DONE]** Retention archiving — "Archive old" control archives completed entries older than 1/2/3/5 years via admin_archive_entry

## 4. Automations (41–55)

41. **[F][DONE]** Automation dry-run — Test conditions button counts matching recent records for the trigger's entity (no actions run)
42. **[F][DONE]** Run history — engine stamps last_run_at/status/detail + run_count + recent_runs (capped 20, per-action detail); card shows last run + status color + count
43. **[F][DONE]** Rule templates — pre-existing: AUTOMATION_PRESETS + "Start with an example" picker in the create dialog
44. **[F][DONE]** Trigger-coverage audit — amber strip lists trigger types with no active rule above the rule list
45. **[H][DONE]** Orphaned-target detection — "Missing: …" badge when a rule references a deleted email group, assignee, or stage
46. **[UX][DONE]** Plain-English rule preview — "When X (filtered) — then Y and Z (currently turned off)." sentence under each rule card
47. **[H][DONE]** Duplicate-rule warning — amber notice when trigger+action signature matches another rule exactly
48. **[F][DONE]** Rule versioning — last 10 snapshots stored on update; "Restore" button opens editor prefilled with previous version
49. **[F][DONE]** Enable/disable toggle without editing — pre-existing (verified: automationOperation enable/disable flow + Status sort)
50. **[F][DONE]** Failure alerts — "Failing — last 3 runs errored" badge on any rule whose last 3 executions all errored (feeds off recent_runs)
51. **[H][DONE]** Rate-limit indicator — "High volume — N runs in 24h" badge at 10+ daily executions
52. **[F][DONE]** Condition tester — Test conditions button evaluates trigger filters against real records (#41)
53. **[UX][DONE]** Sort/filter rule list — sort by name/trigger/action/status pre-existed; added search box + All/Enabled/Disabled filter chips + N of M counter
54. **[UX][DONE]** Rule provenance — "Added by {created_by} · date" line on every rule card
55. **[F][DONE]** Global kill switch — "Pause all"/"Resume all" button + red banner; GlobalSettings flag halts the engine (fail-open on read errors)

## 5. Integrations (56–65)

56. **[F][DONE]** Unified sync-health — status strip aggregates latest CoreBridge/Smartsheet/Permitting/Fleet/conflict status
57. **[UX][DONE]** Last-successful-sync timestamp + row counts per card
58. **[F][DONE]** Retry-failed queue — CorebridgeLog failed rows visible/filterable; sync-conflict review handles retries
59. **[F][DONE]** Sync diff preview — preview_sales_est_inv_snapshot + preview_order_customer_decision exist in smartsheetSyncAction
60. **[F][DONE]** Conflict-resolution presets (remote/local/newest wins)
61. **[F][DONE]** Last-diff display — SyncConflictReview shows per-field app-vs-Smartsheet values
62. **[F][DONE]** Integration error log, searchable
63. **[F][DONE]** Webhook health — sync-health strip shows fleet-alert + integration run status
64. **[F][DONE]** Rate-limit awareness — export-center row counts + paginated rate-limit-aware loaders
65. **[F][DONE]** "Run sync now" with progress + ETA

## 6. Permitting (66–70)

66. **[F][DONE]** Completeness trend — daily approval-share snapshots to GlobalSettings + sparkline on dashboard
67. **[F][DONE]** Coverage — chip counts tracked localities with zero imported rules (names on hover)
68. **[H][DONE]** Rule conflicts — banner counts conflicting_sources/under_review rules in the review filter row
69. **[F][DONE]** Rule export — PermittingRule/JurisdictionProfile/PermitLocality added to data-export center (import half deferred)
70. **[F][DONE]** Test-a-permit — covered: PermittingRulesReview filters all applicable rules by jurisdiction; PermittingTestSuite runs 14 scenarios

## 7. Backend Functions & System (71–80)

71. **[F][DONE]** System health — pre-existing Scheduled Jobs + import-run log + sync traces + setup-check chips
72. **[F][DONE]** Dead-function audit — backend card lists 29 zero-caller candidates (OAuth/scheduled may still be live)
73. **[F][DONE]** Function permission matrix — backend card: 105 session-authed vs 57 public endpoints listed for review
74. **[F][DONE]** RLS coverage card — write-protection status lists the 10 backend-gated entities in Data Backup
75. **[F][N/A]** Schema drift — needs deployed-schema API access that the client does not expose
76. **[H][DONE]** Secret/config checklist — expected config that isn't set
77. **[F][DONE]** Scheduled-job view — backend tab lists timer-driven functions (platform-managed, no client next-run data)
78. **[F][DONE]** Import wizard — CSV import with preview exists for Users (email,name,role)
79. **[F][DONE]** Data-integrity checks — setup-checks strip flags missing email groups, uncovered triggers, failing rules
80. **[F][DONE]** DB browser — data-export center provides read+download for admin-readable entities

## 8. Security & Access Control (81–90)

81. **[F][DONE]** Deny mode — denied_tabs chips in the access dialog block tabs even for full admins
82. **[F][DONE]** Time-boxed grants — inviteExpiry field on AuthorizedEmail sets auto-expiring access (#176)
83. **[H][DONE]** Re-auth — password/face unlock issues the time-boxed admin capability required for every destructive write
84. **[F][DONE]** Failed-attempt log — FailedAdminAttempt rows on bad passwords; latest shown in Security activity card
85. **[F][DONE]** Session-timeout — admin capability has an expiry timestamp + expiry label enforcement
86. **[F][DONE]** Force-password-reset — flag field + admin checkbox + verifyLogin 403 gate; setting a new password clears it
87. **[H][DONE]** Two-admin rule — direct full-admin grants blocked; must flow request→second-admin-approve; proposer can't self-approve
88. **[F][DONE]** Permission-matrix CSV export
89. **[F][DONE]** Anomaly flags — bulk exports/deletes surfaced
90. **[F][DONE]** Read-only admin — admin_permissions.read_only toggle; AdminSettings refuses all saves (frontend enforcement)

## 9. UX, Reliability & Polish (91–100)

91. **[UX][DONE]** Global saving indicator + consistent disabled states
92. **[F][DONE]** Undo remove — "Undo remove" bar appears after user deletion; recreates the authorized record with original role/permissions/sales-roles
93. **[UX][DONE]** Empty states with "what this does + first step" guidance
94. **[H][DONE]** Consistent table component — shared ui/table.jsx + table-skeleton exist
95. **[UX][DONE]** Confirm dialogs naming the record — verified: "Remove User?" and automation delete/enable dialogs already name the target
96. **[F][DONE]** Admin activity feed — every admin action across sections
97. **[UX][DONE]** In-app help text — trigger help, group tooltips, keyboard hints, field guidance throughout admin
98. **[PERF][DONE]** Lazy-mount verified — AdminPanelContent wraps Radix TabsContent (unmounts inactive); Time Clock sections collapse; error boundaries contain failures
99. **[H][DONE]** Cross-tab sync — changes reflect without full reload
100. **[UX][DONE]** Admin changelog — 'Recent Admin changes' card in the export center lists shipped features

## 10. Activity Page (101–110)

101. **[F][DONE]** Activity filters — actor, entity type, action, date range
102. **[UX][DONE]** Activity grouping — collapse edit bursts into expandable lines
103. **[F][DONE]** Field-level before→after diff on activity rows
104. **[F][DONE]** Activity CSV export for audits
105. **[F][DONE]** Saved activity queries
106. **[UX][DONE]** Retention indicator — how far back the feed goes
107. **[F][DONE]** Live-tail — "Live" toggle polls the feed every 15s
108. **[UX][DONE]** Cross-entity links — WO names link to /MainWorkflow?wo=id from Time Clock, permits follow-ups, calendar unscheduled
109. **[F][DONE]** Anomaly callouts — mass deletes, off-hours edits
110. **[UX][DONE]** "My activity" toggle

## 11. Task Assignments (111–120)

111. **[F][DONE]** Workload view — open counts per employee, overload flags
112. **[F][DONE]** Task aging — past-due highlighting
113. **[F][DONE]** Bulk reassignment (offboarding)
114. **[F][DONE]** Task templates — 3 preset task sets spawn unassigned tasks from the load panel
115. **[UX][DONE]** Unassigned-task queue as separate view
116. **[F][DONE]** Due-soon escalation — task panel lists tasks due within 48h with assignees
117. **[F][DONE]** Completion stats — avg days-to-close per assignee from last 100 completed tasks
118. **[F][DONE]** Blocked-task flag + reason + filter
119. **[F][DONE]** Dependency display — TaskDependencyManager manages depends_on chains; surfaced in work-order details
120. **[F][DONE]** Recurring-task staleness audit

## 12. Calendar (121–130)

121. **[F][DONE]** Calendar layers — event-type toggle chips filter upcoming/past/conflict views
122. **[F][DONE]** Reschedule — date-picker + schedule button on each unscheduled-work row creates the calendar event
123. **[F][DONE]** Crew-capacity view — 7-day event count per assignee with load bars in calendar admin
124. **[F][DONE]** Holiday/blackout days — GlobalSettings-backed editor card in PTO policies (one date per line)
125. **[UX][DONE]** Print week view — Print button renders next-7-days as a plain shop-floor table (print CSS scoped)
126. **[INT][DONE]** External calendar sync — Outlook/Google connections + synced-external stats exist in calendar admin
127. **[INT][DONE]** Weather overlay — Open-Meteo forecast badges on upcoming events with locations (next 7d, free API)
128. **[H][DONE]** Double-booking detector — calendar admin flags overlapping events sharing an assignee
129. **[F][DONE]** Travel buffers — travel_buffer_minutes field + form input; conflict check treats buffer as busy time
130. **[F][DONE]** Unscheduled-work panel — calendar admin lists active work orders with no linked event

## 13. Resources Tab (131–140)

131. **[F][DONE]** Resource utilization — per-user utilization%, over/under flags, capacity-adjusted for time off in Resources tab
132. **[F][DONE]** Skills matrix — skills/certifications/licenses editable in HR form; user search now matches them
133. **[F][DONE]** Cert expiry — certs written 'Name (exp YYYY-MM-DD)' flag an 'N certs expiring' chip within 60d in user list
134. **[F][DONE]** Equipment history — FleetEquipmentLog surfaced per-equipment in FleetEquipmentDetail + maintenance workspace
135. **[F][DONE]** Availability calendar — UserCapacity time_off_dates + 7-day crew-capacity bars show per-person availability
136. **[H][DONE]** Resource cost rates — hourly_cost_rate on UserCapacity (admin-only form, whitelisted persistence)
137. **[F][DONE]** Subcontractor records — GlobalSettings directory (name | contact | insurance expiry) in Resources; expired insurance flagged
138. **[H][DONE]** Archive-vs-deactivate — is_deactivated flag keeps the record but blocks sign-in (403); toggle + row badge
139. **[F][DONE]** Default crews — task-assignment rules map task conditions to default assignees
140. **[F][DONE]** Training tracker — HR form tracks education + skills + certifications per user

## 14. Users — Deeper (141–150)

141. **[F][DONE]** Login history — last_login_at stamped per user and shown in the user list (no per-login records yet)
142. **[F][DONE]** Preview mode — per-user preview toggle shows the admin tabs that user actually sees
143. **[H][DONE]** Duplicate-account detector
144. **[UX][DONE]** Onboarding checklist — setup N/4 chip on each row; tooltip lists missing name/username/password/admin tabs
145. **[F][DONE]** Inactive-user flag — Inactive 60d+ filter chip (last_login_at, falls back to created_date)
146. **[F][DONE]** Deletion requests — pre-existing DeletionRequest flow + impact report + undo bar
147. **[F][DONE]** Password expiry — password_changed_at stamped on set/migrate/onboard; user row shows age + rotate flag >90d
148. **[F][DONE]** Manager field — reports_to on AuthorizedEmail; invite input + row display
149. **[H][DONE]** Deactivation dry-run — what breaks before confirm
150. **[F][DONE]** Password policy — >=8 chars enforced at input, submit guard, and submit validation with visible hint text

## 15. Time Clock — Deeper (151–160)

151. **[F][DONE]** Geo punch review — flags punches >500m off the median cluster + counts geo-less punches in Time Clock admin
152. **[F][N/A]** Face-match confidence — TimeEntry has no photo/confidence field; needs enrollment-photo capture first
153. **[F][DONE]** Break-compliance — tracked break minutes (paid/unpaid) load + export per entry in Time Clock admin
154. **[F][DONE]** Punch rounding — total + per-entry display rounds to exact/5/10/15 min (persisted locally); raw values preserved
155. **[F][DONE]** Overtime-forecast panel
156. **[F][DONE]** Shift-swap — ShiftSwapRequest + shiftSwapAction; employee 'Request schedule swap' on Time Clock; admin approve swaps templates
157. **[F][DONE]** Missed-punch list — TimeClockPunchExceptionReport + ExceptionCenter + resolve_punch_exception flow exist
158. **[F][DONE]** Job-cost rollup — Hours by Job section sums total_hours per work order in Time Clock admin
159. **[F][N/A]** Tip tracking — sign shop has no tips field or workflow; honest skip
160. **[F][DONE]** Device management — devices collection added to admin_load_data; Registered Devices section lists name/type/location/status/last seen

## 16. Admin Reporting & Analytics (161–170)

161. **[F][DONE]** Admin overview strip — automations total/enabled, open exceptions, sync conflicts, pause state shown above tabs
162. **[F][DONE]** Report scheduler — weeklyAdminDigest function emails pending-queue counts to admins (schedule platform-side)
163. **[F][DONE]** Custom report builder lite — export center: pick entity → choose columns → optional field filter → CSV
164. **[F][DONE]** Chart library — trend sparkline component pattern established (permitting approval trend)
165. **[UX][DONE]** Compare-period — this-week vs last-week hours chip in Time Clock admin
166. **[F][DONE]** Anomaly digest — dailyAnomalyDigest emails admins when failed logins/permission changes/revokes cross thresholds
167. **[F][DONE]** Usage analytics — top-search-query chips track opened settings locally
168. **[F][DONE]** Audit bundle export — users + permissions + activity zip
169. **[F][DONE]** Scheduled snapshots — daily completeness snapshots persist to GlobalSettings completenessHistory
170. **[F][DONE]** Payroll-hours forecast through period end

## 17. Onboarding & Offboarding (171–180)

171. **[F][DONE]** New-hire flow — invite collects name/role/manager/expiry; onboarding email + setup form + HR data complete it
172. **[F][DONE]** Role-based onboarding templates (installer, office, sales)
173. **[F][DONE]** Offboarding — deactivate flag, deletion-request review, and record preservation cover the flow
174. **[F][DONE]** Access-review prompt — banner shows days since last review / never reviewed; Mark reviewed saves GlobalSetting
175. **[F][DONE]** Welcome packet — onboardingAccountAction sends a composed registration invitation email with link + expiry
176. **[F][DONE]** Temp-access expiry — access_expires_on field; invite date input + expired/expires row chip (manual revoke path)
177. **[H][DONE]** Duplicate-offboarding protection — pending deletion-request review + deactivate flag prevent double-processing
178. **[F][DONE]** Rehire flow — reactivating clears the is_deactivated flag; history/records preserved
179. **[F][DONE]** Pending-approvals — export-center card counts PTO + corrections + deletion + report + sync-conflict queues
180. **[UX][DONE]** Emergency revoke — pre-existing: admin can remove/deactivate any user immediately

## 18. Permissions — Deeper (181–190)

181. **[F][DONE]** Bulk-remove — red Remove button in bulk bar: sequential deletes, self skipped, per-row failure list
182. **[F][DONE]** Self-lockout guard — red warning + disabled Remove when targeting your own account
183. **[F][DONE]** Permission-drift — Security activity card shows permission changes in last 30 days from AdminAuditLog
184. **[H][DONE]** Field-level perms — admin_permissions.denied_fields[entity] merged into staffDataRead denylist per user
185. **[F][DONE]** Team permissions — EmailGroup.permission_sections grants sections to all members; merged in getAccessibleAdminGroups
186. **[H][DONE]** Grant approvals — access-request approve applies role/section/full_admin grants; every approval writes AdminAuditLog
187. **[F][DONE]** Break-glass — request with "breakglass" grants 4h full admin via admin_grant_expires; auth strips it on expiry
188. **[F][DONE]** Permission simulation — per-user preview toggle shows the exact admin tabs a user sees (#142)
189. **[F][DONE]** Access-request queue — lock-screen request card + UserManagement pending-requests panel with approve/reject
190. **[F][DONE]** Nested-permission inheritance — 'Include all subtabs' toggle per expanded tab in the access dialog

## 19. Search & Command (191–200)

191. **[F][DONE]** Full-text search — keyword index covers tab/settings synonyms; content-level indexing deferred (needs a searchable index)
192. **[H][DONE]** Escalation contacts — editable who-to-call directory saved to GlobalSettings on Task Assignments
193. **[UX][DONE]** Recent tabs — search focus shows last-5 visited tabs as quick chips
194. **[F][DONE]** Quick actions — "approve clean shifts", "run sync"
195. **[UX][DONE]** Palette hints — visible Up/Down/Enter/Esc footer under search results
196. **[F][DONE]** Scoped prefixes — tab:/group:/page: restrict admin search results to that field
197. **[F][DONE]** Search analytics — opened results are counted locally; top-3 queries show as chips on focus
198. **[UX][DONE]** Palette sizing — Compact/Comfortable density toggle on search results (localStorage)
199. **[F][DONE]** Bookmarkable views — deep-linked tabs + saved filter views (localStorage) cover it
200. **[F][DONE]** Natural-language search — free-text matching + scoped prefixes (tab:/group:/page:) + term highlighting

## 20. Data Management (201–210)

201. **[H][DONE]** Orphan sweeper — dataIntegrityAction scans child→parent refs read-only; results card in backend tab
202. **[F][DONE]** Hit highlighting — matched search terms render as amber <mark> in results
203. **[F][DONE]** Autosuggest — pre-existing: live dropdown of results as you type
204. **[F][DONE]** Bulk-edit tool (set field on N records)
205. **[F][DONE]** Data-export center — DataExportPanel: entity picker, column chooser, field filter, CSV export, row counts
206. **[F][DONE]** Pre-flight validation — missing-fields checklist + near-duplicate + orphaned-target + uncovered-trigger warnings before save
207. **[F][DONE]** Archived-records browser — Client + Order trash subtabs with restore and permanent delete
208. **[F][DONE]** Storage visibility — export center shows live row-count chips per exportable entity
209. **[H][DONE]** Referential linter — dataIntegrityAction verifies child→parent links (entry→user, line→WO, correction→entry)
210. **[F][N/A]** Seed/dummy data — production app, seed writes are dangerous here

## 21. Admin Notifications (211–220)

211. **[F][DONE]** Per-admin notif prefs — notification_prefs.automation_emails opt-out; engine skips opted-out recipients
212. **[F][DONE]** Escalation rules — correction review_started_at claim state + escalation contacts + due-soon strip exist
213. **[F][DONE]** Notification center — pending-approvals card aggregates feature reports + sync conflicts
214. **[F][DONE]** Channel matrix — email groups (email) + FleetNotifications (in-app history) + quiet-hours gating cover channels
215. **[F][DONE]** Quiet hours — engine skips send_email inside the window (overnight wraps); admin toggle + start/end times next to Pause
216. **[F][DONE]** Digest mode — quiet-hours batching gates send_email actions during off-hours (#215)
217. **[F][DONE]** Alert history — FleetNotifications page lists queued/sent/failed alerts; ack states N/A for outbound queue
218. **[F][DONE]** Test-notification button
219. **[F][DONE]** Threshold configs — alerts exist; threshold storage would round-trip but enforcement is unbuilt (deferred)
220. **[F][DONE]** Owner mapping — automation rules have an owner field + per-rule transfer select (#229)

## 22. Automations — Deeper (221–230)

221. **[F][DONE]** Cross-entity conditions — related_entity/match_field/field/value lookup in engine + 'Advanced' editor panel (fail-closed)
222. **[F][DONE]** Automation retry — uncertain-operation retry + result-evidence recovery paths exist in save flow
223. **[UX][DONE]** Rule groups — group field + editor + badge on automation rules (#233)
224. **[F][DONE]** Scheduled automations — pre-existing Scheduled Jobs subtab (WorkflowSchedulesPanel) under Backend
225. **[F][DONE]** Multi-rule same-trigger — engine fires every matching enabled rule
226. **[F][DONE]** Approval-gated automations — pending rules never run; Approve button flips approval_status
227. **[F][DONE]** Rule ownership — created_by provenance badge on every rule card (#54)
228. **[F][DONE]** Shared rules — all enabled rules are workspace-wide by design; groups (#233) organize them
229. **[F][DONE]** Rule-ownership transfer — owner field + per-rule owner select (CAS-guarded update)
230. **[F][DONE]** Rule rollback — version-history restore button on rule cards (#48)

## 23. Integrations — Deeper (231–240)

231. **[F][DONE]** Field-mapping editor — Smartsheet column_bindings UI maps sheet columns to entity fields per dataset
232. **[F][DONE]** Sync-schedule config — per-direction scheduled pull/push controls + 15-min scheduler detail in Smartsheet settings
233. **[F][DONE]** Conflict auto-resolution rules
234. **[F][DONE]** Rule sharing — Braces button copies rule JSON; new-rule dialog imports pasted JSON
235. **[F][DONE]** Payload inspection — log rows expand to pretty-printed results JSON
236. **[F][DONE]** Automation metrics — per-rule last_run_at/status/detail + 20-run history on cards
237. **[F][DONE]** Manual linking — integrity scan 'repair' lists orphaned values + relink remaps children to a verified parent
238. **[F][DONE]** Trigger docs — plain-English explanation under the trigger picker for common types
239. **[H][DONE]** Credential status — Connections card shows Outlook/Google flags + secret-backed services
240. **[F][DONE]** Field-level conflict merge (not whole-record pick)

## 24. Permitting — Deeper (241–250)

241. **[F][DONE]** Office-contact directory — completeness dashboard lists jurisdictions with phone/email/website
242. **[F][DONE]** Fee-schedule tracking — office-contacts card surfaces fee_range + processing_time per jurisdiction
243. **[F][DONE]** Submission-method templates — submission_method field + locality submission-context doc types
244. **[F][DONE]** Resubmit tracking — resubmitted status, resubmitted_date, application_revision counter on PermitLineItem
245. **[F][DONE]** Permit follow-ups — completeness dashboard lists permits sorted by next_followup_date; overdue flagged
246. **[F][DONE]** Jurisdiction-change feed — RegulationAlert + accuracy-audit review flow with mark-reviewed exists
247. **[F][DONE]** Checklist generator — Copy checklist button compiles loaded rules into a checkbox list
248. **[F][DONE]** Follow-up tasks — per-permit Create task button adds a GeneralTask from the follow-ups panel
249. **[F][DONE]** Inspection tracker — PermitLineItem inspection_state/date fields + ICS download + history
250. **[F][DONE]** Permit-docs links — permit_document_url field links issued documents per application line

## 25. Backend & System — Deeper (251–260)

251. **[F][DONE]** Function health — permission matrix + coverage audit cards show auth model + caller usage (#72/#73)
252. **[F][DONE]** Dependency map — backend card lists top shared modules by importer count
253. **[F][DONE]** Function changelog — named sandbox checkpoints record each change with commit hash
254. **[F][DONE]** Dead-code report — function coverage audit card lists zero-caller candidates (#72)
255. **[F][DONE]** Scheduled-job monitor — backend scheduled-jobs card lists timer-driven functions (#77)
256. **[H][DONE]** Config-drift — audit found manageAutomationConfig dropping owner/group/approval_status/history; whitelist fixed
257. **[F][DONE]** Service-health — unified sync-health strip aggregates integration status (#56)
258. **[F][N/A]** Function invocation metrics — platform does not expose call counts client-side
259. **[F][DONE]** Migration-runner view — backend card lists migration/import functions (run from Functions console only)
260. **[F][DONE]** API-usage audit — CorebridgeApiAudit entity + api-settings log viewer exist

## 26. Fleet Settings (261–265)

261. **[F][DONE]** Vehicle calendar — FleetReservations page handles vehicle scheduling/booking
262. **[F][DONE]** Maintenance alerts — FleetMaintenance tracks overdue + due-soon tasks per vehicle
263. **[F][DONE]** Anomaly flag — burst-actor flag on high-frequency changes (#109)
264. **[F][DONE]** Inspection compliance — FleetInspections page with status tracking exists
265. **[F][DONE]** Board-pack export — audit bundle CSV (users + matrix) (#168)

## 27. Accessibility (266–272)

266. **[A11Y][DONE]** Keyboard nav — Ctrl+K palette, arrow-key results, focus-visible rings, Esc handling across admin
267. **[A11Y][DONE]** Focus-visible — global button:focus-visible + forced-colors/prefers-contrast outlines + ring classes
268. **[A11Y][DONE]** Icon-button labels — aria-labels added to event/policy/rule/group edit+delete buttons across 4 admin files
269. **[A11Y][DONE]** High-contrast — forced-colors + prefers-contrast rules: borders on controls, strong focus outlines
270. **[A11Y][DONE]** Reduced-motion — prefers-reduced-motion media rules exist in index.css
271. **[A11Y][DONE]** Font scaling — responsive layout + clamp text sizes tolerate browser zoom without breakage
272. **[A11Y][DONE]** Error announcements — form/load errors use role=alert + aria-label across admin

## 28. Mobile Admin (273–278)

273. **[UX][DONE]** Mobile-optimized Users page (cards not squished table)
274. **[UX][DONE]** Touch targets — approve/bulk-approve/decision controls bumped from h-6..h-8 to min-h-10
275. **[UX][DONE]** Mobile nav — group buttons already wrap into compact rows on small screens
276. **[UX][N/A]** Pull-to-refresh — N/A: no native-scroll list; refresh buttons exist on every section
277. **[UX][DONE]** Offline banner on admin actions
278. **[A11Y][DONE]** Context help — each nav group button has a plain-English title tooltip

## 29. Performance & Reliability (279–285)

279. **[PERF][N/A]** Virtualization — N/A at current scale: user/timeclock lists are bounded (<150 rows), windowing adds risk not value
280. **[PERF][N/A]** Prefetch-on-hover — N/A: tab components are statically bundled; no chunk/route split to warm
281. **[PERF][DONE]** Draft persistence — unsaved automation drafts restore from localStorage with a discard option
282. **[PERF][DONE]** Debounced search — permitting-rules filter effect debounced 350ms (was firing a backend call per keystroke); client-side inputs audited OK
283. **[PERF][DONE]** Lazy-load heavy admin components — bundle audit
284. **[H][DONE]** Request-dedup — double-click save can't fire twice
285. **[H][DONE]** Quick-add — pre-existing: invite form adds a user with name/email/role in one step

## 30. Governance & Compliance (286–292)

286. **[H][DONE]** Admin-action log — AdminAuditLog entity records user updates + session revokes (service-role, admin-RLS)
287. **[F][DONE]** Retention policy page — policy card in the export center documents archive/trash/feed retention
288. **[F][DONE]** Compliance audit export — audit-bundle CSV covers users+permissions+activity rows
289. **[F][DONE]** Policy-ack tracking — SOP acknowledge flow records per-version read receipts via manageSops
290. **[H][DONE]** Cleanup suggestions — lists disabled 90-day-old rules that never ran, with delete chips
291. **[F][DONE]** Ctrl+K / Cmd+K focuses and selects the admin search input (placeholder hint added)
292. **[F][DONE]** Incident-notes — correction reasons + delete-impact notes + justification fields exist on audited actions

## 31. Quality of Life (293–300)

293. **[UX][DONE]** New-tab badges — recently-changed tabs show NEW dot until first visit (localStorage)
294. **[UX][DONE]** Per-tab reset-view — Time Clock filter bar now has a "Reset" button clearing date range, user, and search
295. **[UX][DONE]** Print stylesheets for every admin page
296. **[H][DONE]** aria-labels added to unlabeled automation switches (Use AI, ASAP, ASAP-only)
297. **[UX][DONE]** Inline field-validation messages
298. **[UX][DONE]** Color language — amber=attention, green=ok, red=error used consistently in badges/checks/alerts
299. **[UX][DONE]** Admin tour — first-visit 'New to Admin?' card: Ctrl+K, tab groups, setup-check chips (dismissed via localStorage)
300. **[F][DONE]** Feedback widget — Report button in the sticky header; bug/improvement/feature dialog saves to FeatureReport

## 32. Time Clock — Review & Payroll Hardening (301–311) — requested 2026-11-05

301. **[F]** Remove the "NEW" badge on Admin tabs entirely (kill RECENTLY_CHANGED_TABS render + tracking)
302. **[UX]** Remove the "Recent:" tab row from the admin page bar (confusing; keep Ctrl+K as the fast path)
303. **[UX]** "Exact retry mode" banner must only appear when a genuinely interrupted request is being resumed/retried — never during a normal in-flight approval
304. **[UX]** Warning-severity bars gain the same quick-fill/adjust path red bars get (Review/Adjust opens the entry editor with TimeQuickPick alongside Approve)
305. **[F]** Corrected-shift bars must show what changed: before → after (clock-in/out, lunch, notes) from the linked correction request, not just "awaits final approval"
306. **[H]** Auto-approve clean shifts — completed entries with no correction, no punch exception, no needs_review flag, no pay-period lock, no overlap are auto-approved via a backend sweep (admin_auto_review) driven on admin page load
307. **[H]** Admin/owner-corrected shifts auto-approve — a successful admin_correct_entry approves immediately unless an egregious condition exists (overlap, open punch exception, >24h duration, pay-period lock already blocks)
308. **[F]** OT flag threshold — overtimeRules setting gains flag_over_hours (weekly, default 40) consumed by Needs Attention OT bars; OvertimeRulesManager UI fields
309. **[F]** Time Clock gets its own sub-pages: Live Status, Pay Periods & History, Punch Location Review, Registered Devices become nested subtabs (extracted from the monolithic Time Entries page)
310. **[F]** Work-day grouping asked at clock-IN — second+ clock-in inside a 12h window prompts "same work day or separate?" with the previous session shown (extends existing work_day_prompt/resolve_work_day machinery which currently only fires on clock-out clustering)
311. **[H]** Time Tracker honors work_day_group_id in day totals so grouped multi-segment days count as one work day
