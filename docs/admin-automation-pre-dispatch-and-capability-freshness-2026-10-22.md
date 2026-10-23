# Admin Automation pre-dispatch failures and write-time capability freshness

Scope: AdminSettings frontend, automationRulePersistence helper, synthetic
tests and the isolated Chromium acceptance fixture. No backend/schema changes,
production entity reads/writes, or publishing performed.

Automation write helpers now mark validation failures thrown before any request
reaches the server (`automationPreDispatch === true`): missing or blank Admin
Settings capability, a missing rule identity, a local enabled-state mismatch on
toggle, and an empty create name. Post-dispatch failures — transport errors,
timeouts and structured server rejections — never carry the marker.

AdminSettings treats a marked failure as a write that provably did not happen:
the ordinary-operation lock releases immediately, the editor draft is not
fenced, and the real validation message is shown instead of an
uncertain-outcome review. Anything thrown after dispatch still requires the
existing read-only verify/acknowledge recovery. This distinction is additive;
every prior guard is unchanged.

Both write entry points also read the current stored Admin Settings capability
(`getStoredAdminSettingsCapability()`) at dispatch time rather than the
mount-time snapshot. This enforces the documented rule that a UI unlock is
valid only while the issued capability is present and unexpired.

A capability that expired while the page sat open no longer surfaces an
unactionable error: both `handleSave` and `runAutomationOperation` check the
stored capability before acquiring any lock or dispatching, and when it is
absent or expired they set an "authorization expired" message and return
`isUnlocked` to false. The unlock gate reappears immediately with the message
visible, Face ID/credential re-authentication issues a fresh capability, and no
write was attempted — no uncertain fence, no parked draft, no lock held.
Previously the only recovery was a page reload, which the old error text
effectively required without saying so.

Re-locking is also proactive: `getStoredAdminSettingsCapabilityExpiry()` (a
pure, non-mutating reader added to EmailGate) exposes the stored expiry
timestamp, and an `isUnlocked`-gated effect schedules a `setTimeout` that
re-locks the panel at the exact moment the capability expires — even when the
user is idle or only viewing. Re-unlocking stores a fresh expiry and the
effect re-arms via its `[isUnlocked]` dependency. The reader never touches
storage: `getStoredAdminSettingsCapability()` remains the only path that
clears expired credentials.

The same freshness rule now covers every capability-bearing Admin panel, not
just automations: `EmailGroupsManager`, `PTOManagement` (including balance
assignment) and `AdminCalendarSettings` (including its event dialog) each read
`getStoredAdminSettingsCapability()` inside their write handlers and pass that
fresh value into `emailGroupPersistence` / `ptoPersistence` /
`calendarEventPersistence`. The `adminCapability` prop and the mount-time
state that fed it are removed entirely, so a stale snapshot cannot be
forwarded again. On an empty read the helpers throw before dispatch; the
expiry timer re-locks the page for the common case and only an invalid stored
timestamp or an externally cleared storage can still surface the message —
which is then genuinely actionable through the unlock gate.

A full write-authorization audit (2026-10 follow-up) confirmed no remaining
stale-credential dispatch path: capability functions read fresh at dispatch,
session-token functions are verified server-side (UserManagement also fences
in-flight calls against token changes via `activeSessionToken`), direct
entity-SDK writes only reach admin-RLS entities (AuthorizedEmail,
GlobalSettings, WorkOrder delete), and backend-only entities
(EmailGroup/PTOPolicy/CalendarEvent/UserPTOBalance/AutomationRule) cannot be
written by the client SDK at all. The audit invariant is now enforced by
scripts/test-admin-write-authorization.mjs so a future panel cannot
reintroduce an uncredentialed or ungated write without failing tests.

A conditional-save audit across the six Admin panels that write GlobalSettings
through `saveGlobalSettingValueIfUnchanged` found the concurrency contract
correct everywhere, but two panels (JurisdictionMonitoringSettings,
JurisdictionAccuracyAudit) rejected a conflict with "Reload before retrying"
while offering only Dismiss — the stale loaded record guaranteed every retry
failed identically. Both error banners now carry a "Reload latest" action
wired to their loader (matching the existing OvertimeRulesManager pattern);
the invariant is enforced by scripts/test-admin-settings-conflict-reload.mjs
for all six panels plus the shared helper.

A credentialed-invoke sweep then found SyncAlertSettings (inside
SmartsheetSyncSettings) calling smartsheetSyncAction's sync_alert_save and
sync_alert_test with no session_token — both require adminActor server-side,
so Save was a silent 403 no-op and the panel also never unwrapped res.data,
meaning load and the test-email result could never render real state. The
panel now sends session_token on all three invokes, unwraps response.data,
surfaces load/save/test errors with a Retry affordance instead of swallowing
them, and disables Save/Test without a session token. The write-authorization
contract test gained an inline-invoke sweep so any future admin-component
invoke of a credentialed function without a credential fails tests.

The remaining uncredentialed admin invokes were then audited individually:
every one targets a backend function that authenticates via
createClientFromRequest(req).auth.me() with a server-side role === 'admin'
check (the platform ambient session), not a request credential — so they are
correct by design, unlike SyncAlertSettings which hit session_token-deriving
actions. The contract test now enforces the full rule: any inline invoke in
admin components must carry a credential OR name a function on the audited
platform-auth allowlist (auditJurisdictionAccuracy,
opportunityBridgeSimulation, permittingHtmlEvidence,
permittingOfficeAuthorityReview, permittingOfficeCandidate,
permittingResearchBacklogDispatch, permittingSourceAuthorityReview,
updateJurisdictionRewriteAuthority). A new uncredentialed invoke fails tests
until its backend auth is verified and allowlisted deliberately.
Known informational item: sync_alert_get requires no credential server-side
and returns the alert recipient email; hardening it is a backend change and
awaits explicit approval.

While unlocked, the admin navigation card now shows the stored capability's
expiry as a static "Admin authorization expires at <time>" label
(`data-admin-capability-expiry`). The label is populated by the same effect
that arms the re-lock timer, is cleared on every exit path (locked,
unusable expiry, expiry firing), and never ticks — a fixed timestamp avoids
re-rendering the page to keep a countdown fresh.

Child-panel capability freshness is also covered behaviorally now, not just
by source-level contracts: the Chromium fixture's mockEmailGroupPersistence
mirrors the real helper's requireCapability guard and records the capability
that crosses the component->helper boundary (`__adminEmailGroupWriteCalls`).
Two checks exercise the real EmailGroupsManager end to end — a create
forwards the current stored "synthetic" capability at dispatch time, and a
capability that expires mid-draft fails pre-dispatch with the actionable
message, records zero writes, and keeps the dialog/draft open (a mount-time
snapshot would still have dispatched "synthetic").

Boundaries unchanged: operation locks remain mounted-session UI guards over the
server conditional writes; they are not durable across reloads or independent
browser sessions. The marker is only set inside automationRulePersistence
before the invoke call; component code checks the property defensively so
fixture mocks remain compatible.

Verification:
- node --test scripts/test-admin-*.mjs (+ jurisdiction admin path): 416/416
  passed under node --test (the Chromium script is excluded; it runs
  standalone). Includes scripts/test-admin-automation-pre-dispatch.mjs
  (8 tests: marker coverage, post-dispatch isolation, fresh-capability
  dispatch, save/op release semantics, expired-capability re-lock before
  lock acquisition or dispatch, mounted expiry-timer re-lock, static expiry
  label),
  scripts/test-admin-panel-capability-freshness.mjs (4 tests: no snapshot
  prop remains, every panel write handler resolves the stored capability at
  dispatch time, helpers still reject empty credentials pre-dispatch, and
  the browser fixture mirrors the helper guard and covers dispatch-time
  freshness end to end), and
  scripts/test-admin-write-authorization.mjs (5 tests: helper payloads carry
  a verified credential, SDK-written entities are RLS-gated, the direct-write
  allowlist is fixed, session-token fencing holds, and every inline admin
  invoke is credentialed or platform-auth allowlisted), and
  scripts/test-admin-settings-conflict-reload.mjs (4 tests: all six
  GlobalSettings admin panels keep a save conflict actionable via auto-reload
  or a wired reload action, and the shared helper's guards stay intact).
- node scripts/test-admin-navigation-browser.mjs: 95/95 isolated Chromium
  checks passed, including six checks covering pre-dispatch toggle
  release, editor-save draft preservation, write-time expired-capability
  re-lock (zero writes dispatched), unattended re-lock at the exact
  expiry moment, the visible expiry-time label, and two Email Groups
  checks covering write-time capability forwarding and mid-draft expiry
  failing pre-dispatch with the draft preserved. The fixture gained an
  `__adminAutomationPreDispatch` knob,
  an `__adminCapabilityExpired` flag, an `admin_cap_expire_ms` URL param,
  and a `__adminEmailGroupWriteCalls` recorder in mockEmailGroupPersistence
  (which mirrors the real helper's requireCapability guard);
  the script was ported to Windows (forward-slash /@fs URLs, realpath-canonical
  scratch roots, junction node_modules link, ADMIN_PLAYWRIGHT_PATH env
  override — on Windows pass a file:/// URL, not a drive-letter path).
- Two stale source-regex assertions were updated to the contracts that
  actually shipped on 2026-10-22 (operation lock disables editor save;
  pre-dispatch failures skip the uncertain fence).
- Scoped ESLint: zero errors; the pre-existing unused actionType warning
  remains. Local npm build is not runnable on this Windows clone
  (pre-existing `@/entities/all` virtual module is generated by the Base44
  vite plugin); the sandbox build is authoritative.
