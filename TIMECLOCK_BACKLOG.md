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
10. **[F]** Identification progress display ("verifying 2/3 frames")
11. **[F]** Camera health self-test — detect blurry/dirty lens and warn
12. **[F]** Per-device camera preference persistence (front vs rear)

## 2. Kiosk — punch integrity
13. **[F]** Geo-fence/device-location stamp on punches with graceful fallback
14. **[F]** Photo capture per punch, optional, stored on the entry
15. **[F]** Punch rounding rules (5/10/15 min), raw time preserved and displayed
16. **[F]** Early-punch block or warning vs scheduled start
17. **[F]** Scheduled-shift variance notice ("you're 12 min early")
18. **[F]** Max shift length auto clock-out with manager notification
19. **[F]** Break compliance — flag shifts missing required lunch after N hours
20. **[F]** Rest-period check — warn on <10h between shifts
21. **[F]** Consecutive-days-worked warning (6th/7th day per policy)
22. **[F]** Minor work-rule enforcement (break/hour caps for minors)
23. **[F]** Offline punch queue with original-timestamp sync on reconnect
24. **[F]** Duplicate-punch client debounce + "already clocked in" flash
25. **[F]** Punch-edit requests from the kiosk routed to the correction queue
26. **[F]** Clock-out reason prompt for early outs (appointment/site/sick)
27. **[F]** Job-site transfer punch — "moving to WO-1234" mid-shift
28. **[F]** Split-shift support — clock out for appointment, resume same shift
29. **[F]** Overnight shift display ("started yesterday 10pm")
30. **[F]** Tip declaration on clock-out for tipped roles
31. **[F]** Mileage/drive-time capture on clock-out for field staff
32. **[F]** Per-department labor rate selection at punch time
33. **[F]** Weather-event flag on punches (snow day audit trail)
34. **[F]** Buddy-punch detection — repeated sub-N-second paired punches flagged
35. **[F]** GPS vs declared-site mismatch flag on field punches
36. **[F]** Device fingerprint on every punch (which kiosk)
37. **[F]** Punch velocity analysis — impossible travel between sites

## 3. Kiosk — UX & accessibility
38. **[F]** Auto-dim screensaver on camera view, tap to wake
39. **[F]** Large-text/high-contrast accessibility mode per device
40. **[F]** Voice prompts for low-vision users
41. **[F]** Confetti/sound themes per branding
42. **[F]** Post-punch day summary ("0:00 worked - lunch ~12:30")
43. **[F]** Supervisor quick-view — manager badge scan shows who's in
44. **[F]** Idle return-to-identify timeout for half-done flows
45. **[F]** One-glance roster on kiosk home ("Who's in: 14")
46. **[F]** Birthday/work-anniversary greeting on punch
47. **[F]** Safety-tip-of-the-day rotation on the idle screen
48. **[F]** Weather/alert banner via announcements
49. **[F]** Punch confirmation haptic/audio (louder for noisy shops)
50. **[F]** QR badge reprint shortcut (lost badge -> prints new, revokes old)
51. **[F]** Bigger hit targets / glove mode
52. **[F]** Camera preview mirror toggle
53. **[F]** Per-kiosk enabled methods config (face-only office, QR-only field)
54. **[F]** "New employee" guided first-punch flow
55. **[F]** Return-from-leave welcome + PTO balance flash
56. **[F]** End-of-week hours recap on Friday clock-out
57. **[F]** Holiday-aware greeting and holiday-pay indicator
58. **[F]** Custom kiosk wallpaper/logo per site
59. **[F]** Punch success checkmark with the employee's nickname
60. **[F]** Quiet-hours volume schedule on the kiosk speaker

## 4. Kiosk — breaks, pauses, labor
61. **[F]** Visual break timer ("lunch ends in 12m")
62. **[F]** Auto-suggest paid vs unpaid break per policy and remaining allowance
63. **[F]** Break overrun alert to manager after N minutes
64. **[F]** Scheduled break windows (lunch must start 11:30-1:00) warn/enforce
65. **[F]** Paid-break daily cap with running tally on the kiosk
66. **[F]** Work-pause categories (machine down, materials, weather hold)
67. **[F]** Pause-reason analytics roll-up
68. **[F]** Labor allocation quick-pick — recent/frequent jobs pinned per employee
69. **[F]** Labor allocation split — divide remaining day across jobs at once
70. **[F]** Labor % vs estimate warning ("WO at 110% of estimate hours")
71. **[F]** Auto-suggest labor job from last allocation
72. **[F]** Crew-level labor assign — lead assigns whole crew at once
73. **[F]** Labor allocation barcode scan (scan traveler/PO)
74. **[F]** Out-of-order break detection (lunch before break warnings)
75. **[F]** On-site vs off-site rest distinction for travel pay
76. **[F]** Overtime authorization prompt at clock-in when projected week >40h

## 5. Tracker — display
77. **[F]** Session timeline strip — today's punches/breaks as a colored band
78. **[F][DONE]** "Next milestone" chip ("45m to 8h") — popover shows remaining minutes to the next unfired threshold
79. **[F]** Weekly + daily dual ring mode
80. **[F]** Monthly cumulative option
81. **[F]** Earnings estimate for hourly staff (opt-in)
82. **[F][DONE]** Overtime proximity warning — "Xm to OT" amber chip when within 30 min of the daily goal
83. **[F][DONE]** Break/pause elapsed while paused — "Work paused - 12m so far" (elapsed shown; scheduled-break countdown needs break schedules)
84. **[F]** Streak counter for consecutive goal days
85. **[F]** Team presence indicator ("3 of 5 in")
86. **[F]** Pomodoro/focus-block alternate scheme
87. **[F]** Compact icon+minutes badge mode for cramped bars
88. **[F]** Full-screen expanded card on click
89. **[F]** Week heat map mini-grid (hours per day this week)
90. **[F]** Pay-period progress arc
91. **[F]** Comparison ghost ("20m ahead of usual pace")
92. **[F]** Yesterday's total shown as context on clock-in
93. **[F]** PTO balance chip in expanded view
94. **[F]** Pending-approval dot when a correction awaits review
95. **[F][DONE]** "Last action" subtitle — popover header shows "Clocked in 8:02 AM" / "Work paused" / "On break"
96. **[F]** Next scheduled break indicator
97. **[F]** Estimated finish time to daily goal ("done at 4:32 PM")
98. **[F]** Time-off upcoming notice ("off Friday")
99. **[F]** Shift differential indicator for evening/night rates

## 6. Tracker — settings & behavior
100. **[F]** Named config profiles (save/load/share)
101. **[F]** Per-device vs per-account preset slots
102. **[F]** Export prefs as QR/copyable blob for other machines
103. **[F]** Drag-to-reposition with snap points
104. **[F]** Auto-hide when idle >N min on personal dashboards
105. **[F]** Auto-pulse on milestone hit (visual only)
106. **[F]** Reminder escalation — repeat once or flash if ignored
107. **[F]** Quiet hours suppressing reminders outside shifts
108. **[F]** Reminder types — "at 80% of shift", "30m before end"
109. **[F]** Sound picker for milestone alerts (reuse announcement sounds)
110. **[F]** Weekend exclusion or weekend-goal override
111. **[F]** Countdown direction ("time left in shift")
112. **[F]** Per-day-of-week goal overrides (Friday = 6h)
113. **[F]** Holiday-aware goal suppression
114. **[F]** Tracker tooltip with raw pace/projection numbers
115. **[F]** Click-through to the right Time Clock subtab
116. **[F]** Sync status indicator (last refresh time in tooltip)
117. **[F]** Low-data mode — reduced polling on metered connections
118. **[F]** Reduced-motion simplify beyond CSS (ring+numbers only)
119. **[F]** Per-role default presets (shop vs office)
120. **[F]** Tracker API — one source of truth for "hours today"
121. **[F]** Milestone webhook to team channel on goal hit
122. **[F]** Custom milestone templates (union contract presets)
123. **[F]** Include-vs-exclude lunch toggle views

## 7. Admin — approvals & corrections
124. **[F]** Bulk approve with per-row exception checkboxes
125. **[F]** Correction diff view — submitted vs corrected side by side
126. **[F]** Approval-age SLA badge + sort by oldest
127. **[F]** Required approver notes on certain correction types
128. **[F]** Approve from the notification bell
129. **[F]** Delegated approvers per crew/department
130. **[F]** Two-step approval for corrections over N hours
131. **[F]** Auto-approve rules for small adjustments (<5 min)
132. **[F]** Rejection with structured reason codes
133. **[F]** Employee notification on approval/rejection outcome
134. **[F]** Correction attachments (photo of paper slip)
135. **[F]** Full correction chain audit inline per entry
136. **[F]** Bulk reject with shared reason
137. **[F]** Review queue filters — employee, dept, type, age
138. **[F]** Payroll-hold flag on contested entries
139. **[F]** Supervisor comments visible to the employee
140. **[F]** Compare adjacent days in review ("normal 8h, today 14")
141. **[F]** "Same correction as yesterday" one-tap for recurring fixes
142. **[F]** Employee correction SLA escalation (>3 days pending)

## 8. Admin — reporting
143. **[F]** Saved report presets (range + filters + columns), shareable
144. **[F]** Payroll-provider export formats (CSV mapping)
145. **[F]** Absence/late leaderboard by department + trend
146. **[F]** Overtime forecast from current pace
147. **[F]** Hours-vs-schedule variance (needs shift schedules)
148. **[F]** Missing-punch daily digest emailed to managers
149. **[F]** Labor-hours-per-work-order vs estimate rollup
150. **[F]** Break compliance report — missed/short lunches
151. **[F]** Buddy-punch suspicion report
152. **[F]** Cost-of-overtime weekly report
153. **[F]** Headcount-by-hour chart for coverage planning
154. **[F]** PTO liability accrual report
155. **[F]** Correction-volume report by manager
156. **[F]** Kiosk-vs-manual punch channel stats
157. **[F]** Early-clock-in pattern report
158. **[F]** Long-break/outlier shift report
159. **[F]** Per-job-site labor cost report
160. **[F]** Exportable PDF punch card per employee for disputes
161. **[F]** Seasonal comparison (this month vs last year)
162. **[F]** Report scheduler — auto-email weekly
163. **[F]** Payroll connector export (Corebridge/Smartsheet)
164. **[F]** Real-time "who's in" board with dept grouping
165. **[F]** Drill-down from report row to full entry timeline

## 9. Admin — roster & devices
166. **[F]** Kiosk device registry — names, last-seen, remote disable
167. **[F]** Badge lifecycle view — issued/active, revoke/rotate
168. **[F]** Face enrollment dashboard — status, count, last verify
169. **[F]** Shift templates per employee
170. **[F]** Per-employee permission matrix (face/QR/manual, missed punches)
171. **[F]** Department/crew management with roll-ups
172. **[F]** New-hire onboarding checklist (enroll, badge, schedule)
173. **[F]** Terminated-employee auto-lockout verification
174. **[F]** Device camera quality log (weak-scan kiosks)
175. **[F]** Kiosk offline event log (dropped + re-queued punches)
176. **[F]** Employee photo management for badge printing
177. **[F]** Badge print template editor
178. **[F]** Bulk import/export employee time clock settings
179. **[F]** Seasonal employee quick on/off-boarding
180. **[F]** Schedule import from a planning tool
181. **[F]** Multi-location kiosk fleet health view
182. **[F]** Per-kiosk config push (methods, wallpaper, quiet hours)
183. **[F]** Device usage report (most-punched kiosks)

## 10. Reliability & security
184. **[F]** Full punch audit log viewer (request ID, device, before/after)
185. **[F]** Two-device conflict resolver surfaced to admin
186. **[F]** Kiosk clock-drift warning vs server time
187. **[F]** Session-token rotation alerts on compromised kiosk
188. **[F]** Admin action audit — who approved/edited what, searchable
189. **[F]** Rate-limit punch attempts per device
190. **[F]** Suspicious login pattern alerts
191. **[F]** Data-retention tooling (auto-archive >2y)
192. **[F]** Backup/restore of time clock config profiles
193. **[F]** Disaster mode — printable paper-punch fallback card

## 11. Announcements & engagement
194. **[F]** Clock-in-triggered announcements (safety brief on punch)
195. **[F]** Shift-end auto-announcement to anyone still in
196. **[F]** Birthday/anniversary auto-announcements from HR data
197. **[F]** Announcement read-receipts per employee
198. **[F]** Acknowledge-required policy announcements

## 12. AI & analytics
199. **[F]** Anomaly detection -> review queue (unusual times, outliers)
200. **[F]** Natural-language reports ("who was late Tuesday?")
201. **[F]** Punch fraud scoring per entry
202. **[F]** Staffing recommendation from coverage vs workload
203. **[F]** Predictive overtime alerts 2 days out

## 13. Employee self-service
204. **[F]** My timesheet grid with edit-request buttons per row
205. **[F]** My PTO balance + projected accrual by next request date
206. **[F]** My punch history export (CSV/PDF)
207. **[F]** Forget-to-clock-out reminder notifications
208. **[F]** Personal stats — avg shift, on-time %, weekly trend
209. **[F]** Correction status tracker on the employee card
210. **[F]** Missed-punch guided self-report wizard
211. **[F]** Preferred-kiosk memory per employee
212. **[F]** Mileage/expense quick-entry on clock-out
213. **[F]** Shift swap request board with approval
214. **[F]** "Who else is in" crew view per department

## 14. Payroll & integration
215. **[F]** Payroll-period lock — freeze edits after close, admin unlock log
216. **[F]** Certified-payroll report mode
217. **[F]** Tip pooling report
218. **[F]** Union-hour tracking per classification
219. **[F]** Per-diem auto-calculation on qualifying shifts
220. **[F]** Multi-rate day support (two pay roles in one shift)
221. **[F]** Holiday pay rules engine (worked-holiday premium flag)
222. **[F]** Shift differential auto-pay for evening/night
223. **[F]** Export audit trail with the payroll file

## 15. Data & API
224. **[F]** Public "who's in" API for signage dashboard widget
225. **[F]** Webhook on punch events for downstream systems
226. **[F]** Bulk import punches on migration
227. **[F]** Per-employee full data export on request
228. **[F]** Idempotent-retry dashboard — pending/ambiguous requests visible

## 16. Kiosk hardware & ops
229. **[F]** Printer integration — daily punch receipt
230. **[F]** Label printer for visitor/temp badges
231. **[F]** Camera health dashboard (last clear frame)
232. **[F]** Remote kiosk restart command
233. **[F]** Kiosk software version pin + staged rollout
234. **[F]** Cellular failover monitoring on remote kiosks
235. **[F]** Power-loss resilience — "last action confirmed" on boot

## 17. Onboarding & help
236. **[F]** In-app kiosk tutorial overlay ("first punch? scan here")
237. **[F]** Video walkthrough of face enrollment
238. **[F]** Admin quick-start checklist (schedule -> enroll -> badges)
239. **[F]** Employee FAQ panel on the Time Clock page
240. **[F]** Contextual help on every admin setting (info-dot pattern)
241. **[F]** "What's new" panel for employees on UI changes
242. **[F]** Manager playbook — common correction scenarios in-app
243. **[F]** Per-company feature flag for experimental features

## Top 10 candidates
23, 124, 19+150, 168, 17, 82, 73, 16, 204, 215
