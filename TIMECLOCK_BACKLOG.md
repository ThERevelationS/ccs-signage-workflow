# Time Clock / Time Tracker / Time Clock Admin — improvement backlog

Flags: **[F]** feature · **[B]** bug/hardening · **[DONE]** shipped

## 1. Kiosk — identification
1. **[F]** Face liveness check (blink / turn-head prompt) to defeat held-up photos
2. **[F]** Face descriptor roster pre-fetch while the camera starts
3. **[F]** Adaptive match threshold per user — tighten for look-alikes, never below the hard floor
4. **[F]** Enrollment quality score (A-F on pose coverage) so weak enrollments get redone
5. **[F]** Face re-enroll reminder after N failed scans or M days
6. **[F]** Secondary camera angle support — kiosk tries a second USB camera
7. **[F]** Low-light/night guidance for dim shop areas
8. **[F]** Ambiguous-match fallback — confirm name from 2 choices instead of failing
9. **[F]** One-tap re-punch for the same employee within a configurable window
10. **[F][DONE]** Identification progress display - voter exposes N/required, both scanners show "Verifying X/3"
11. **[F]** Camera health self-test — detect blurry/dirty lens and warn
12. **[F]** Per-device camera preference persistence (front vs rear)

## 2. Kiosk — punch integrity
13. **[F][DONE]** Geo stamp - kiosk captures device location in background; clock_in_geo stored on the entry
14. **[F]** Photo capture per punch, optional, stored on the entry
15. **[F]** Punch rounding rules (5/10/15 min), raw time preserved and displayed
16. **[F]** Early-punch block or warning vs scheduled start
17. **[F][DONE]** Schedule-variance notice - todays_schedule in snapshot + early/late chip on the tracker
18. **[F]** Max shift length auto clock-out with manager notification
19. **[F]** Break compliance — flag shifts missing required lunch after N hours
20. **[F][DONE]** Rest-period warning - snapshot returns rest_hours; tracker flags <10h between shifts
21. **[F][DONE]** Consecutive-days warning - snapshot counts worked days; tracker flags day 6+
22. **[F]** Minor work-rule enforcement (break/hour caps for minors)
23. **[F][DONE]** Scheduled-shift comparison - variance minutes shown next to the schedule line
24. **[F][DONE]** Duplicate-punch client debounce - 5s same-employee guard, server request-id still the backstop
25. **[F][DONE]** Punch-edit requests - CorrectionRequestDialog + Time History row buttons
26. **[F][DONE]** Clock-out reason - early-out quick-pick chips feed the admin-notes field
27. **[F]** Job-site transfer punch — "moving to WO-1234" mid-shift
28. **[F]** Split-shift support — clock out for appointment, resume same shift
29. **[F][DONE]** Overnight shift display - "Since 10:00 PM (Wed, Mar 5)" when clock-in isn't today
30. **[F]** Tip declaration on clock-out for tipped roles
31. **[F]** Mileage/drive-time capture on clock-out for field staff
32. **[F]** Per-department labor rate selection at punch time
33. **[F]** Weather-event flag on punches (snow day audit trail)
34. **[F][DONE]** Buddy-punch flag - same-source punches <90s apart surface as a review warning
35. **[F]** GPS vs declared-site mismatch flag on field punches
36. **[F]** Device fingerprint on every punch (which kiosk)
37. **[F]** Punch velocity analysis — impossible travel between sites

## 3. Kiosk — UX & accessibility
38. **[F]** Auto-dim screensaver on camera view, tap to wake
39. **[F][DONE]** Large-text kiosk mode - A+ toggle, zoom 1.18, persisted per device
40. **[F]** Voice prompts for low-vision users
41. **[F]** Confetti/sound themes per branding
42. **[F]** Post-punch day summary ("0:00 worked - lunch ~12:30")
43. **[F][DONE]** Supervisor quick-view - who_is_in admin panel shows everyone clocked in
44. **[F][DONE]** Idle return-to-identify timeout - 90s identify-mode auto-reset
45. **[F]** One-glance roster on kiosk home ("Who's in: 14")
46. **[F]** Birthday/work-anniversary greeting on punch
47. **[F]** Safety-tip-of-the-day rotation on the idle screen
48. **[F]** Weather/alert banner via announcements
49. **[F][DONE]** Punch confirmation audio - chime on clock-in, ding on clock-out via shared sound infra
50. **[F][DONE]** QR badge reprint - issueTimeClockBadge + UserQRCode rotate (revoke old, issue new version)
51. **[F]** Bigger hit targets / glove mode
52. **[F]** Camera preview mirror toggle
53. **[F]** Per-kiosk enabled methods config (face-only office, QR-only field)
54. **[F][DONE]** New-employee flow - kiosk tutorial + missed-clock-in wizard covers first-punch guidance
55. **[F][DONE]** Return-from-leave PTO flash - PTO balance chip in the tracker popover
56. **[F]** End-of-week hours recap on Friday clock-out
57. **[F]** Holiday-aware greeting and holiday-pay indicator
58. **[F][DONE]** Camera preview mirror toggle - flip/unflip button, persisted per kiosk
59. **[F][DONE]** Punch success with employee name - notification uses full_name
60. **[F]** Quiet-hours volume schedule on the kiosk speaker

## 4. Kiosk — breaks, pauses, labor
61. **[F][DONE]** Visual break timer - tracker shows live break/pause elapsed ("lunch ends in 12m")
62. **[F]** Auto-suggest paid vs unpaid break per policy and remaining allowance
63. **[F][DONE]** Break overrun indicator - red flag chip when an active break runs past 60 min
64. **[F][DONE]** Scheduled break windows - lunch window hint from the shift template
65. **[F]** Paid-break daily cap with running tally on the kiosk
66. **[F]** Work-pause categories (machine down, materials, weather hold)
67. **[F]** Pause-reason analytics roll-up
68. **[F][DONE]** Labor quick-pick - my_labor_history action + recent-job chips in CurrentWorkCard
69. **[F]** Labor allocation split — divide remaining day across jobs at once
70. **[F]** Labor % vs estimate warning ("WO at 110% of estimate hours")
71. **[F][DONE]** Labor auto-suggest - recent allocations pinned as quick-pick chips
72. **[F]** Crew-level labor assign — lead assigns whole crew at once
73. **[F]** Labor allocation barcode scan (scan traveler/PO)
74. **[F]** Out-of-order break detection (lunch before break warnings)
75. **[F]** On-site vs off-site rest distinction for travel pay
76. **[F]** Overtime authorization prompt at clock-in when projected week >40h

## 5. Tracker — display
77. **[F][DONE]** Session timeline strip - break/pause segments as a colored band under the clock
78. **[F][DONE]** "Next milestone" chip ("45m to 8h") — popover shows remaining minutes to the next unfired threshold
79. **[F]** Weekly + daily dual ring mode
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
99. **[F]** Shift differential indicator for evening/night rates

## 6. Tracker — settings & behavior
100. **[F][DONE]** Config profiles - clipboard JSON export/import of the full prefs bundle
101. **[F]** Per-device vs per-account preset slots
102. **[F][DONE]** Export prefs - copy/paste buttons on the settings header
103. **[F]** Drag-to-reposition with snap points
104. **[F][DONE]** Auto-hide when idle - hide_when_idle_minutes pref + slider, pointer/key activity tracking
105. **[F][DONE]** Auto-pulse on milestone hit - milestone_behavior "pulse" already exists
106. **[F][DONE]** Reminder escalation - reminders re-fire once +10min later if ignored
107. **[F][DONE]** Quiet hours - reminders stay inside the scheduled shift (+1h grace)
108. **[F][DONE]** Percent reminders - {percent} reminders resolve against the daily goal, server-sanitized
109. **[F][DONE]** Sound picker for milestone alerts - milestone_sound pref already exists
110. **[F][DONE]** Weekend exclusion - hide_on_weekend pref + visibility gate + settings toggle
111. **[F][DONE]** Countdown direction - prefs.direction "down" already counts down
112. **[F][DONE]** Per-day-of-week goal overrides - daily_goal_overrides pref + 7-input settings row + server sanitize
113. **[F]** Holiday-aware goal suppression
114. **[F][DONE]** Tracker tooltip - hover title shows paid/elapsed/weekly/goal
115. **[F][DONE]** Click-through - "Open Time Clock" popover button already navigates
116. **[F][DONE]** Sync status indicator - "Synced Xs ago" line in the popover footer
117. **[F][DONE]** Low-data mode - pref floors polling at 120s and skips secondary fetches
118. **[F][DONE]** Reduced-motion - prefers-reduced-motion CSS rule already simplifies animations
119. **[F]** Per-role default presets (shop vs office)
120. **[F][DONE]** Tracker API - window.__timeTrackerLive exposes paid/elapsed/weekly/goal/status
121. **[F]** Milestone webhook to team channel on goal hit
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
135. **[F]** Full correction chain audit inline per entry
136. **[F][DONE]** Bulk reject - batch bar decision select (approve/reject) with shared reason
137. **[F][DONE]** Review queue filter - name/kind/reason text filter on the correction queue
138. **[F][DONE]** Payroll-hold flag - contested entries flagged per-row (CAS + audit), visible as red flag
139. **[F][DONE]** Supervisor comments - last manager review note surfaces in the tracker
140. **[F][DONE]** Adjacent-day compare - reviewer sees last 3 shifts for context
141. **[F]** "Same correction as yesterday" one-tap for recurring fixes
142. **[F][DONE]** Correction SLA - request age badges + oldest-first sort + age filters

## 8. Admin — reporting
143. **[F][DONE]** Saved report presets - named filter bundles (localStorage) on the reports dashboard
144. **[F][DONE]** Payroll CSV export - per-employee-per-day rows with 40h reg/OT split on the admin page
145. **[F][DONE]** Absence leaderboard - fewest-worked-days list on the admin page
146. **[F][DONE]** OT forecast - otWatch + projected week-end hours on the admin page (concurrent pass)
147. **[F][DONE]** Hours-vs-schedule variance - weekly +/- line on the tracker
148. **[F]** Missing-punch daily digest emailed to managers
149. **[F][DONE]** Labor-hours-per-job rollup - Hours by Job card aggregates job_allocations (concurrent pass)
150. **[F]** Break compliance report — missed/short lunches
151. **[F]** Buddy-punch suspicion report
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
166. **[F]** Kiosk device registry — names, last-seen, remote disable
167. **[F]** Badge lifecycle view — issued/active, revoke/rotate
168. **[F][DONE]** Face enrollment dashboard - list_face_enrollment action + admin panel with descriptor counts + needs-enrollment flags
169. **[F][DONE]** Shift templates - TimeClockShiftTemplate entity + admin editor + snapshot integration
170. **[F]** Per-employee permission matrix (face/QR/manual, missed punches)
171. **[F]** Department/crew management with roll-ups
172. **[F][DONE]** New-hire setup checklist - admin card computing enrollment/punch/audit status
173. **[F]** Terminated-employee auto-lockout verification
174. **[F]** Device camera quality log (weak-scan kiosks)
175. **[F][DONE]** Offline/retry event log - audit panel lists every punch+correction event with request ids
176. **[F]** Employee photo management for badge printing
177. **[F]** Badge print template editor
178. **[F]** Bulk import/export employee time clock settings
179. **[F]** Seasonal employee quick on/off-boarding
180. **[F]** Schedule import from a planning tool
181. **[F]** Multi-location kiosk fleet health view
182. **[F]** Per-kiosk config push (methods, wallpaper, quiet hours)
183. **[F]** Device usage report (most-punched kiosks)

## 10. Reliability & security
184. **[F][DONE]** Audit log viewer - list_timeclock_audit action + collapsible admin panel
185. **[F]** Two-device conflict resolver surfaced to admin
186. **[F][DONE]** Clock-drift warning - tracker footer flags when device time is >2min off the server
187. **[F]** Session-token rotation alerts on compromised kiosk
188. **[F][DONE]** Admin action audit - list_timeclock_audit + panel (actor, request id, time)
189. **[F]** Rate-limit punch attempts per device
190. **[F]** Suspicious login pattern alerts
191. **[F][DONE]** Retention tooling - Archive old control + admin_archive_entry backend action (CAS + audit)
192. **[F][DONE]** Config backup - JSON export/import covers prefs backup/restore
193. **[F][DONE]** Disaster mode - printable paper-punch sheet generator on the admin roster panel

## 11. Announcements & engagement
194. **[F]** Clock-in-triggered announcements (safety brief on punch)
195. **[F]** Shift-end auto-announcement to anyone still in
196. **[F]** Birthday/anniversary auto-announcements from HR data
197. **[F][DONE]** Announcement read-receipts - acknowledgeAnnouncement persists per-viewer acks
198. **[F][DONE]** Ack-required announcements - requires_ack display mode already exists

## 12. AI & analytics
199. **[F][DONE]** Anomaly flags - TimeClockPunchException entity + admin exception report surfaces outliers to the review queue
200. **[F][DONE]** Anomaly flags - buddy-punch, early/late, consecutive-day, OT-watch heuristics feed the review queue
201. **[F]** Punch fraud scoring per entry
202. **[F]** Staffing recommendation from coverage vs workload
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
213. **[F]** Shift swap request board with approval
214. **[F]** "Who else is in" crew view per department

## 14. Payroll & integration
215. **[F][DONE]** Payroll-period lock - pay_period_id Finalized badge + finalize/reopen flow in PayPeriodManager
216. **[F]** Certified-payroll report mode
217. **[F]** Tip pooling report
218. **[F]** Union-hour tracking per classification
219. **[F]** Per-diem auto-calculation on qualifying shifts
220. **[F]** Multi-rate day support (two pay roles in one shift)
221. **[F]** Holiday pay rules engine (worked-holiday premium flag)
222. **[F]** Shift differential auto-pay for evening/night
223. **[F]** Export audit trail with the payroll file

## 15. Data & API
224. **[F][DONE]** Who-is-in API - timeClockAction who_is_in function endpoint
225. **[F]** Webhook on punch events for downstream systems
226. **[F]** Bulk import punches on migration
227. **[F]** Per-employee full data export on request
228. **[F][DONE]** In-flight requests dashboard - list_pending_requests action + stuck-transition card

## 16. Kiosk hardware & ops
229. **[F]** Printer integration — daily punch receipt
230. **[F]** Label printer for visitor/temp badges
231. **[F]** Camera health dashboard (last clear frame)
232. **[F]** Remote kiosk restart command
233. **[F]** Kiosk software version pin + staged rollout
234. **[F]** Cellular failover monitoring on remote kiosks
235. **[F]** Power-loss resilience — "last action confirmed" on boot

## 17. Onboarding & help
236. **[F][DONE]** Kiosk tutorial overlay - first-run 3-step strip, dismisses per device
237. **[F]** Video walkthrough of face enrollment
238. **[F][DONE]** Admin quick-start checklist - computed setup checklist on the admin page
239. **[F][DONE]** Employee FAQ - collapsible Q&A card on the TimeClock page
240. **[F][DONE]** Contextual help - InfoDot tooltips already used across tracker settings
241. **[F][DONE]** What-is-new panel - toggle inside the TimeClock help card
242. **[F][DONE]** Manager playbook - collapsible correction-scenario guide on the admin page
243. **[F]** Per-company feature flag for experimental features

## Top 10 candidates
23, 124, 19+150, 168, 17, 82, 73, 16, 204, 215
