# Time Clock / Time Tracker / Time Clock Admin — improvement backlog

Flags: **[F]** feature · **[B]** bug/hardening · **[DONE]** shipped

## 1. Kiosk — identification
1. **[F]** Face liveness check (blink / turn-head prompt) to defeat held-up photos
2. **[F][DONE]** Face descriptor pre-fetch - roster descriptors load while camera starts
3. **[F]** Adaptive match threshold per user — tighten for look-alikes, never below the hard floor
4. **[F]** Enrollment quality score (A-F on pose coverage) so weak enrollments get redone
5. **[F][DONE]** Re-enroll reminder - banner after 5 failed scans
6. **[F][HOLD]** Second USB camera - browser/hardware limited
7. **[F]** Low-light/night guidance for dim shop areas
8. **[F]** Ambiguous-match fallback — confirm name from 2 choices instead of failing
9. **[F][HOLD]** One-tap re-punch - serialized punch path too risky to replay
10. **[F][DONE]** Identification progress display - voter exposes N/required, both scanners show "Verifying X/3"
11. **[F][DONE]** Camera self-test - 5s brightness sampling warns dark/blown lens
12. **[F][DONE]** Per-device camera pref - localStorage deviceId drives getUserMedia

## 2. Kiosk — punch integrity
13. **[F][DONE]** Geo stamp - kiosk captures device location in background; clock_in_geo stored on the entry
14. **[F]** Photo capture per punch, optional, stored on the entry
15. **[F][DONE]** Punch rounding display - display_rounding pref (0/5/10/15), raw preserved
16. **[F][DONE]** Early-punch warning - clocks >20min ahead of schedule flag in confirm
17. **[F][DONE]** Schedule-variance notice - todays_schedule in snapshot + early/late chip on the tracker
18. **[F][DONE]** Max shift auto clock-out - auto_clockout_sweep lists stale opens
19. **[F][DONE]** Break compliance - missed/short lunch flag exists (breakCompliance)
20. **[F][DONE]** Rest-period warning - snapshot returns rest_hours; tracker flags <10h between shifts
21. **[F][DONE]** Consecutive-days warning - snapshot counts worked days; tracker flags day 6+
22. **[F]** Minor work-rule enforcement (break/hour caps for minors)
23. **[F][DONE]** Scheduled-shift comparison - variance minutes shown next to the schedule line
24. **[F][DONE]** Duplicate-punch client debounce - 5s same-employee guard, server request-id still the backstop
25. **[F][DONE]** Punch-edit requests - CorrectionRequestDialog + Time History row buttons
26. **[F][DONE]** Clock-out reason - early-out quick-pick chips feed the admin-notes field
27. **[F][DONE]** Job-site transfer - labor switch moves mid-shift between work orders
28. **[F][DONE]** Split-shift - clock out + clock back in resumes naturally
29. **[F][DONE]** Overnight shift display - "Since 10:00 PM (Wed, Mar 5)" when clock-in isn't today
30. **[F]** Tip declaration on clock-out for tipped roles
31. **[F]** Mileage/drive-time capture on clock-out for field staff
32. **[F]** Per-department labor rate selection at punch time
33. **[F]** Weather-event flag on punches (snow day audit trail)
34. **[F][DONE]** Buddy-punch flag - same-source punches <90s apart surface as a review warning
35. **[F][DONE]** GPS mismatch - punch_velocity_scan flags impossible travel
36. **[F]** Device fingerprint on every punch (which kiosk)
37. **[F][DONE]** Punch velocity - geo scan flags >100km/h sustained

## 3. Kiosk — UX & accessibility
38. **[F][DONE]** Auto-dim screensaver - 120s idle dims the kiosk, tap to wake
39. **[F][DONE]** Large-text kiosk mode - A+ toggle, zoom 1.18, persisted per device
40. **[F][DONE]** Voice prompts - speechSynthesis reads status when enabled
41. **[F][DONE]** Confetti/sound themes - Celebration/Calm/Focus preset bundles
42. **[F][DONE]** Post-punch summary - clock-in message shows time + lunch ETA
43. **[F][DONE]** Supervisor quick-view - who_is_in admin panel shows everyone clocked in
44. **[F][DONE]** Idle return-to-identify timeout - 90s identify-mode auto-reset
45. **[F][DONE]** Roster glance - who_is_in backend + admin roster panel
46. **[F][DONE]** Birthday greeting - prefs carry birthday, kiosk surfaces it
47. **[F][DONE]** Safety-tip rotation - daily shop tip on the kiosk idle card
48. **[F][DONE]** Weather/alert banner - announcements system covers alert banners
49. **[F][DONE]** Punch confirmation audio - chime on clock-in, ding on clock-out via shared sound infra
50. **[F][DONE]** QR badge reprint - issueTimeClockBadge + UserQRCode rotate (revoke old, issue new version)
51. **[F][DONE]** Glove mode - 1.5x zoom toggle for gloved hands
52. **[F][DONE]** Camera mirror toggle - per-device ccs_kiosk_camera_mirror
53. **[F][DONE]** Per-kiosk methods - ccs_kiosk_methods localStorage gates face/qr/manual
54. **[F][DONE]** New-employee flow - kiosk tutorial + missed-clock-in wizard covers first-punch guidance
55. **[F][DONE]** Return-from-leave PTO flash - PTO balance chip in the tracker popover
56. **[F][DONE]** End-of-week recap - Friday week-total line on the tracker
57. **[F][DONE]** Holiday greeting - date-keyed banner + holiday-pay note
58. **[F][DONE]** Camera preview mirror toggle - flip/unflip button, persisted per kiosk
59. **[F][DONE]** Punch success with employee name - notification uses full_name
60. **[F][DONE]** Quiet-hours volume - localStorage schedule suppresses chime

## 4. Kiosk — breaks, pauses, labor
61. **[F][DONE]** Visual break timer - tracker shows live break/pause elapsed ("lunch ends in 12m")
62. **[F][DONE]** Paid-break hint - paidBreakRemaining vs 20m daily allowance
63. **[F][DONE]** Break overrun indicator - red flag chip when an active break runs past 60 min
64. **[F][DONE]** Scheduled break windows - lunch window hint from the shift template
65. **[F]** Paid-break daily cap with running tally on the kiosk
66. **[F]** Work-pause categories (machine down, materials, weather hold)
67. **[F][DONE]** Pause analytics - pause_reason_rollup by reason
68. **[F][DONE]** Labor quick-pick - my_labor_history action + recent-job chips in CurrentWorkCard
69. **[F][DONE]** Labor split - labor_split action divides allocations at once
70. **[F][DONE]** Labor vs estimate - labor_vs_estimate rollup per work order
71. **[F][DONE]** Labor auto-suggest - recent allocations pinned as quick-pick chips
72. **[F][DONE]** Crew assign - labor_split covers multi-allocation
73. **[F]** Labor allocation barcode scan (scan traveler/PO)
74. **[F][DONE]** Out-of-order break - no-lunch-yet badge after 5h without an unpaid break
75. **[F]** On-site vs off-site rest distinction for travel pay
76. **[F]** Overtime authorization prompt at clock-in when projected week >40h

## 5. Tracker — display
77. **[F][DONE]** Session timeline strip - break/pause segments as a colored band under the clock
78. **[F][DONE]** "Next milestone" chip ("45m to 8h") — popover shows remaining minutes to the next unfired threshold
79. **[F][DONE]** Weekly+daily dual ring - outer weekly arc around the daily ring
80. **[F][DONE]** Monthly cumulative - monthly_paid_minutes in snapshot + 'This month' popover stat
81. **[F]** Earnings estimate for hourly staff (opt-in)
82. **[F][DONE]** Overtime proximity warning — "Xm to OT" amber chip when within 30 min of the daily goal
83. **[F][DONE]** Break/pause elapsed while paused — "Work paused - 12m so far" (elapsed shown; scheduled-break countdown needs break schedules)
84. **[F][DONE]** Streak counter - N-day goal streak chip in the popover
85. **[F][DONE]** Team presence - privacy-safe count of clocked-in coworkers in the tracker
86. **[F][DONE]** Pomodoro mode - count_mode shows 25-minute focus cycles
87. **[F][DONE]** Compact badge mode - display_style "badge" already renders icon+minutes
88. **[F][DONE]** Full-screen expanded view - tracker popover card
89. **[F][DONE]** Week heat map - week strip greens >=100% of goal and dims <50%
90. **[F][DONE]** Pay-period progress arc - current period + % bar in the popover
91. **[F][DONE]** Comparison context - week header shows trailing avg/day
92. **[F][DONE]** Yesterday's total shown in the week header
93. **[F][DONE]** PTO balance - pto_balance in snapshot + popover stat row
94. **[F][DONE]** Pending-approval dot - amber dot on the tracker when the admin snapshot shows pending reviews
95. **[F][DONE]** "Last action" subtitle — popover header shows "Clocked in 8:02 AM" / "Work paused" / "On break"
96. **[F][DONE]** Scheduled-break hint - lunch window line under the schedule
97. **[F][DONE]** Comparison ghost - ahead/behind usual pace from the week strip
98. **[F][DONE]** Time-off notice - approved upcoming TimeOffRequest banner in the popover
99. **[F][DONE]** Shift differential - moon badge when clocked in outside 6am-6pm

## 6. Tracker — settings & behavior
100. **[F][DONE]** Config profiles - clipboard JSON export/import of the full prefs bundle
101. **[F][DONE]** Preset slots - 3 localStorage save/apply slots per device
102. **[F][DONE]** Export prefs - copy/paste buttons on the settings header
103. **[F][HOLD]** Drag-to-reposition - tracker layout is fixed, low value
104. **[F][DONE]** Auto-hide when idle - hide_when_idle_minutes pref + slider, pointer/key activity tracking
105. **[F][DONE]** Auto-pulse on milestone hit - milestone_behavior "pulse" already exists
106. **[F][DONE]** Reminder escalation - reminders re-fire once +10min later if ignored
107. **[F][DONE]** Quiet hours - reminders stay inside the scheduled shift (+1h grace)
108. **[F][DONE]** Percent reminders - {percent} reminders resolve against the daily goal, server-sanitized
109. **[F][DONE]** Sound picker for milestone alerts - milestone_sound pref already exists
110. **[F][DONE]** Weekend exclusion - hide_on_weekend pref + visibility gate + settings toggle
111. **[F][DONE]** Countdown direction - prefs.direction "down" already counts down
112. **[F][DONE]** Per-day-of-week goal overrides - daily_goal_overrides pref + 7-input settings row + server sanitize
113. **[F][DONE]** Holiday-aware goals - effectiveGoal=0 on holidays suppresses pressure
114. **[F][DONE]** Tracker tooltip - hover title shows paid/elapsed/weekly/goal
115. **[F][DONE]** Click-through - "Open Time Clock" popover button already navigates
116. **[F][DONE]** Sync status indicator - "Synced Xs ago" line in the popover footer
117. **[F][DONE]** Low-data mode - pref floors polling at 120s and skips secondary fetches
118. **[F][DONE]** Reduced-motion - prefers-reduced-motion CSS rule already simplifies animations
119. **[F][DONE]** Per-role presets - Shop/Office/Field default bundles
120. **[F][DONE]** Tracker API - window.__timeTrackerLive exposes paid/elapsed/weekly/goal/status
121. **[F][DONE]** Punch webhook - punch_webhook emits events to configured URL
122. **[F][DONE]** Milestone templates - preset threshold bundles in settings
123. **[F][DONE]** Include-vs-exclude lunch - count_mode paid vs elapsed already covers both views

## 7. Admin — approvals & corrections
124. **[F][DONE]** Bulk approve - select-all + shared-reason batch bar on the correction queue, per-row retry-safe approve calls
125. **[F][DONE]** Correction diff - dialog already shows ORIGINAL vs EMPLOYEE REQUEST side by side
126. **[F][DONE]** Approval-age SLA - oldest-first sort + amber/red age badges (>=1d, >=3d)
127. **[F][DONE]** Approver notes required - review_reason min-3 gate on every decision
128. **[F][DONE]** Approve from the bell - pending-shift notices deep-link to the review dialog
129. **[F]** Delegated approvers per crew/department
130. **[F]** Two-step approval for corrections over N hours
131. **[F]** Auto-approve rules for small adjustments (<5 min)
132. **[F][DONE]** Rejection reason codes - quick-pick chips fill the manager review reason
133. **[F][DONE]** Employee notify on review outcome - manager reason surfaces in the tracker
134. **[F]** Correction attachments (photo of paper slip)
135. **[F][DONE]** Correction chain - list_timeclock_audit + audit panel shows per-entry history
136. **[F][DONE]** Bulk reject - batch bar decision select (approve/reject) with shared reason
137. **[F][DONE]** Review queue filter - name/kind/reason text filter on the correction queue
138. **[F][DONE]** Payroll-hold flag - contested entries flagged per-row (CAS + audit), visible as red flag
139. **[F][DONE]** Supervisor comments - last manager review note surfaces in the tracker
140. **[F][DONE]** Adjacent-day compare - reviewer sees last 3 shifts for context
141. **[F][DONE]** Same-as-last-review chip - prefills the manager reason from the prior request
142. **[F][DONE]** Correction SLA - request age badges + oldest-first sort + age filters

## 8. Admin — reporting
143. **[F][DONE]** Saved report presets - named filter bundles (localStorage) on the reports dashboard
144. **[F][DONE]** Payroll CSV export - per-employee-per-day rows with 40h reg/OT split on the admin page
145. **[F][DONE]** Absence leaderboard - fewest-worked-days list on the admin page
146. **[F][DONE]** OT forecast - otWatch + projected week-end hours on the admin page (concurrent pass)
147. **[F][DONE]** Hours-vs-schedule variance - weekly +/- line on the tracker
148. **[F][DONE]** Missing-punch digest - manager_digest announcement mode
149. **[F][DONE]** Labor-hours-per-job rollup - Hours by Job card aggregates job_allocations (concurrent pass)
150. **[F][DONE]** Break compliance report - break_compliance_report missed lunches
151. **[F][DONE]** Buddy-punch report - buddy_punch_report same-device <2min pairs
152. **[F]** Cost-of-overtime weekly report
153. **[F][DONE]** Headcount-by-hour - clock-in histogram card on the admin page
154. **[F][DONE]** Late-arrival leaderboard - per-employee after-9am counts on the admin page
155. **[F][DONE]** Missing-punch digest - No Punch Today card lists active employees without a punch
156. **[F][DONE]** Punch-channel stats - clock_source breakdown card on the admin page
157. **[F][DONE]** Break compliance - admin flags >=5h shifts missing lunch (missingBreakEntries)
158. **[F][DONE]** Early-clock-in pattern - before-7am/after-9am counters on the admin page
159. **[F][DONE]** PTO liability - pto_liability_report action + accrued-hours card on the admin page
160. **[F][DONE]** Correction turnover - review-count-per-reviewer summary on the audit panel
161. **[F][DONE]** Site/job labor-cost rollup - Hours by Job card aggregates allocations per client
162. **[F][DONE]** Printable punch card - per-employee print button on Hours by Employee
163. **[F][DONE]** Seasonal/monthly comparison - admin_period_compare action + month-over-month card
164. **[F][DONE]** Real-time "who's in" board - who_is_in action + live admin panel, 60s refresh
165. **[F][DONE]** Drill-down - TimeClockShiftDetail expands any entry row to the full timeline

## 9. Admin — roster & devices
166. **[F][DONE]** Device registry - TimeClockDevice entity + register/list/update actions
167. **[F][DONE]** Device heartbeat - kiosks self-register on mount with last_seen stamps
168. **[F][DONE]** Device health - registered-kiosks card with last-seen and offline dots
169. **[F][DONE]** Shift templates - TimeClockShiftTemplate entity + admin editor + snapshot integration
170. **[F][DONE]** Device location - registry rows carry a location field
171. **[F][DONE]** Device provisioning - devices auto-provision on first heartbeat
172. **[F][DONE]** Device retired flag - update_device sets status/is_active
173. **[F]** Terminated-employee auto-lockout verification
174. **[F]** Device camera quality log (weak-scan kiosks)
175. **[F][DONE]** Offline/retry event log - audit panel lists every punch+correction event with request ids
176. **[F]** Employee nickname display preference
177. **[F]** Birthday field on the employee profile
178. **[F]** Hire date on the employee profile
179. **[F]** Emergency contact on the employee profile
180. **[F]** Custom notes field on the employee profile
181. **[F][DONE]** Fleet health - device registry + last_seen offline dots
182. **[F][DONE]** Per-kiosk config - kiosk_config push methods/quiet/wallpaper
183. **[F][DONE]** Device usage - device_usage_report punches per kiosk

## 10. Reliability & security
184. **[F][DONE]** Audit log viewer - list_timeclock_audit action + collapsible admin panel
185. **[F][DONE]** Conflict resolver - list_pending_requests surfaces in-flight actions
186. **[F][DONE]** Clock-drift warning - tracker footer flags when device time is >2min off the server
187. **[F][DONE]** Session rotation alerts - session_audit_alerts revoke/rotate/lockout events
188. **[F][DONE]** Admin action audit - list_timeclock_audit + panel (actor, request id, time)
189. **[F][DONE]** Punch rate-limit - device_rate_limit_check bursts per device
190. **[F][DONE]** Suspicious login - suspicious_login_scan audit heuristic
191. **[F][DONE]** Retention tooling - Archive old control + admin_archive_entry backend action (CAS + audit)
192. **[F][DONE]** Config backup - JSON export/import covers prefs backup/restore
193. **[F][DONE]** Disaster mode - printable paper-punch sheet generator on the admin roster panel

## 11. Announcements & engagement
194. **[F][DONE]** Clock-in nudge - one-tap announcement to employees not yet clocked in
195. **[F][DONE]** Missed-clockout alert - announcement to anyone 12+ hours on the clock
196. **[F][DONE]** Manager digest - shift totals + pending corrections announcement to admins
197. **[F][DONE]** Announcement read-receipts - acknowledgeAnnouncement persists per-viewer acks
198. **[F][DONE]** Ack-required announcements - requires_ack display mode already exists

## 12. AI & analytics
199. **[F][DONE]** Anomaly flags - TimeClockPunchException entity + admin exception report surfaces outliers to the review queue
200. **[F][DONE]** Anomaly flags - buddy-punch, early/late, consecutive-day, OT-watch heuristics feed the review queue
201. **[F][DONE]** Punch fraud scoring - punch_fraud_scan composite heuristic
202. **[F][DONE]** Staffing rec - staffing_recommendation scheduled vs clocked
203. **[F]** Predictive overtime alerts 2 days out

## 13. Employee self-service
204. **[F][DONE]** My timesheet grid - Time History tab with per-row correction requests + OT split
205. **[F][DONE]** PTO balance display - available/accrued/pending minutes via snapshot (projection needs accrual rules)
206. **[F][DONE]** Punch export - my_history action + CSV download button in the popover
207. **[F][DONE]** Forget-to-clock-out reminder - one-shot toast when elapsed passes goal + 4h
208. **[F][DONE]** Personal stats - completed-shift count + avg shift length after export
209. **[F][DONE]** Correction status tracker - pending-corrections chip in tracker popover
210. **[F][DONE]** Missed-punch wizard - MissedClockInDialog + banner flow exists
211. **[F][DONE]** Preferred-kiosk memory - last-used method persisted + surfaced per device
212. **[F]** Mileage/expense quick-entry on clock-out
213. **[F][DONE]** Shift swap board - shiftSwapAction + admin approve/reject section
214. **[F][DONE]** Crew view - department-scoped who-is-in action

## 14. Payroll & integration
215. **[F][DONE]** Payroll-period lock - pay_period_id Finalized badge + finalize/reopen flow in PayPeriodManager
216. **[F]** Payroll export - reg/OT split per employee/day (backend export exists; certified columns reverted)
217. **[F][DONE]** Hold exclusion - payroll_export skips payroll_hold entries and reports the count
218. **[F]** Union-hour tracking per classification
219. **[F]** Per-diem auto-calculation on qualifying shifts
220. **[F]** Certified payroll - certified_payroll/union_local fields (reverted in cleanup)
221. **[F]** Union reporting - union_local field (reverted in cleanup)
222. **[F]** Shift differential auto-pay for evening/night
223. **[F]** Export audit trail with the payroll file

## 15. Data & API
224. **[F][DONE]** Who-is-in API - timeClockAction who_is_in function endpoint
225. **[F][DONE]** Webhook on punches - punch_webhook action covers downstream sync
226. **[F][DONE]** Bulk import - bulk_import_entries admin action
227. **[F][DONE]** Employee data export - my_data_export action
228. **[F][DONE]** In-flight requests dashboard - list_pending_requests action + stuck-transition card

## 16. Kiosk hardware & ops
229. **[F][HOLD]** Printer receipt - thermal printer hardware
230. **[F][HOLD]** Label printer - hardware integration
231. **[F][HOLD]** Camera health dashboard - hardware telemetry
232. **[F][HOLD]** Remote kiosk restart - needs device agent
233. **[F][HOLD]** Version pin/rollout - needs device agent
234. **[F][HOLD]** Cellular failover - hardware monitoring
235. **[F][DONE]** Power-loss resilience - last-action banner on kiosk boot

## 17. Onboarding & help
236. **[F][DONE]** Kiosk tutorial overlay - first-run 3-step strip, dismisses per device
237. **[F][DONE]** Face-enrollment walkthrough - FAQ entry covers the 10-second enrollment
238. **[F][DONE]** Admin quick-start checklist - computed setup checklist on the admin page
239. **[F][DONE]** Employee FAQ - collapsible Q&A card on the TimeClock page
240. **[F][DONE]** Contextual help - InfoDot tooltips already used across tracker settings
241. **[F][DONE]** What-is-new panel - toggle inside the TimeClock help card
242. **[F][DONE]** Manager playbook - collapsible correction-scenario guide on the admin page
243. **[F][DONE]** Feature flag - GlobalSettings timeclockFeatures read

## Top 10 candidates
23, 124, 19+150, 168, 17, 82, 73, 16, 204, 215
