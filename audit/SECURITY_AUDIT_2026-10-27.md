# Security Audit — CCS Signage Workflow
App ID: `68dfcc5e57bbbc35387da97c` · branch `main` · published `public_without_login` at `https://clay-flow-signage-suite-387da97c.base44.app`
Audit date: 2026-10-27 · Mode: read-only (no writes, no records changed, no deploys)
**LOCAL-ONLY audit record — do not publish/push to the app.**

## Scans performed
- Base44 built-in security scan: prior result (2026-10-26) retrieved; fresh scan completed 2026-10-27 09:25Z (2 prior attempts failed). Diff: +33 dependency CVEs (new coverage area); backend findings now 1 (fleetPublicIssueReport only — sendGmail/getGoogleMapsKey dropped); static findings now 2 (face-scan finding dropped — our confirmed analysis stands); RLS recs still 74 (Announcement/Order fingerprints churned only). Scan already `out_of_date` due to concurrent "Visual edits" commits.
- Manual live read-only boundary checks: unauthenticated GET/POST/PUT/DELETE against published entity API; unauthenticated function invoke probes (`verifySession`, `getGoogleMapsKey`); published-site response headers via `curl -I`.
- Four parallel code reviewers: (A) entities/RLS, (B) auth/sessions/roles, (C) backend functions/logic, (D) frontend/deps/secrets/config. Every cited file remote-verified by reviewers; headline items re-verified independently by lead.
- One independent false-positive verifier: running.

## Inventory / coverage checklist
| Area | Status | Notes |
|---|---|---|
| Source files (src/, ~850) | Reviewed | D + spot checks |
| Entities & permissions (~191 defs) | Reviewed | A; all 191 remote-verified |
| Backend functions (156) | Reviewed | rounds 1-3: all entry.ts auth-classified; ~60 line-reviewed end-to-end; remainder grep-verified auth + spot-read; small internals residual noted in gaps |
| AuthN/authZ/sessions/roles | Reviewed | B |
| Workflows/automations (17 defs + runs) | Reviewed | B/C capability-token review; run payloads not inspected |
| Integrations/connectors (gmail, googledrive, bouncie, smartsheet, corebridge) | Reviewed | config-level; OAuth internals partially |
| Secrets handling (12 registered) | Reviewed | names only; access paths verified env-only |
| Dependencies (package.json/lock) | Reviewed | D |
| Deployment/app config (visibility, routes, headers, SSO) | Reviewed | all 87 routes requires_auth=false; SSO unconfigured |
| Agents (3) | Reviewed | D |
| **Inaccessible / gaps** | — | Remote `C:` dir (path-rejected; contents listed via `sandbox run` = esbuild bundle copies); authenticated cross-user live testing (no test accounts — code review only); platform provisioning behavior for auth.me() on public apps (unconfirmed); DB contents (whether plaintext passwords remain); workflow run payloads; `dist/` full drift enumeration |

## CONFIRMED FINDINGS

### CRITICAL
**C1. Anonymous full CRUD on ~75 entities lacking RLS — incl. 898 customer PII records**
- Entities: all 74 scanner-flagged + entities with `read:{}`/no-RLS incl. Customer, WorkOrder, Order, Project, AllInOneEstimate, CustomerContact, CustomerLocation, all *Project estimators, BuilderPart/Group/Product, UserCapacity, CalendarEvent, PTOPolicy, RegulationAlert, Settings, GlobalSettings, EmailNotificationSettings, pricing/markup/inventory tables, QuickProduct(create), Report(create).
- Evidence (live, read-only): full 191-entity anonymous GET sweep (counts only, no record contents retained): **~46 entities return real data — ≈11,000+ records**: WorkOrder 3,123 · JurisdictionProfile 3,106 · Order 1,918 · Customer **898 PII** (names, billing addresses, emails, phones) · PendingImport 654 · Settings 501 · CellHistory 247 · inventories/catalogs ~800 · GlobalSettings 26 · AllInOneEstimate 22 · RegulationAlert 8 · GeneralTask 1 · projects/estimates ~120.
- `POST {}` → 422 validation (not 401); `PUT`/`DELETE` on fake id → 404 not-found (not 401) → create/update/delete reach the handler unauthenticated. RLS'd entities (Invoice, UserCredential, etc.) correctly return 403; `User` → 401.
- **Scanner gap:** the 74-rec list MISSES the no-`rls`-block entities — `GeneralTask` and `JurisdictionProfile` leak data but aren't flagged (scanner only counts explicit `rls:{}` configs).
- Impact: full CRM/operations DB read + tamper by anyone on the internet; customer PII breach; anonymous job/pricing forgery; RegulationAlert delete (only open-delete entity) can suppress compliance alerts.
- Remediation: apply scanner RLS recommendations — read `admin|user`, writes backend-only/staff, delete owner/admin; fix RegulationAlert update/delete immediately.
- Status: **confirmed (live + code)**.

### HIGH
**H1. Archived third-party government HTML with executable scripts served same-origin**
- `public/permitting/sources/**/*.html` — 46 files (verifier-corrected count), ~23+ contain `<script>` (jQuery 3.5.1/1.12 CDN — CVE-2020-11022/11023, bootstrap 4.6, gtag). Live: `GET /permitting/sources/boone-ky/building-permits-page-2026-09-28.html` → 200 text/html, 52 script tags.
- Impact: any script in those pages executes on the app origin → read `localStorage.sss_session_token` (30-day staff session) → account takeover; phishing on trusted domain.
- Remediation: move evidence out of `public/` (entity storage / authenticated function / attachment), or sanitize `<script>`/`<form>` before archiving.
- Status: **confirmed (live)**.

**H2. sendGmail sends arbitrary email as the company Gmail account**
- `sendGmail/entry.ts:26,31`: capability read from email `body` (`body._workflow_capability`) not the request — `{body:{_workflow_capability:'<literal>'}}` skips `auth.me()` entirely. Literal `ccs-sendGmail-internal-svc-cap-…` hardcoded in 5-6 backend files; SHA-256 matches registered hash. Fallback accepts ANY `auth.me()` user (no role check). Up to 3 attachments ≤16MB.
- Impact: unauthenticated/insider mail-as-company (phishing, invoice fraud via real portal links).
- Remediation: read capability from request body properly; move capability to env secret + rotate; require staff session + recipient policy.
- Reachability note (2026-10-27): platform login fully disabled ⇒ `auth.me()` fallback reachable only by provisioned platform users; the **capability-literal path** is the exploitable one for anyone who knows the literal (source/builder access — literal is unrotated cleartext in 6 files; confirmed NOT in src/public/dist).
- Verifier corrections: legitimate callers pass the token **top-level** → their token is ignored (capability path is dead code for intended use); exploit requires `body` as object → body renders `[object Object]`, but `to`/`subject`/≤3 attachments ≤16MB attacker-controlled. SHA-256 of literal matches registered hash — **verified**.
- Status: **confirmed (remote code; exploit path code-verified, not fired)**. Severity: HIGH design / MEDIUM practical remote (requires leaked literal).

**H3. Unauthenticated face-descriptor match mints 2h admin capability**
- `issueAdminSettingsAccess/entry.ts:62-88`: no session → client-supplied 128-float descriptor vs stored admin `face_descriptors` (d≤0.38, ratio 1.5) → `issueAdminSettingsCapability` (accepted by manageAutomationConfig, manageWorkflowSchedules, manageCalendarEvents, managePTOConfig). No rate limit/lockout/liveness/audit. `onboardingAccountAction` `validate`/`save_credentials` returns `face_descriptors` to onboarding-link holders — descriptor leak path.
- Verifier verdict: **HIGH** — confirmed remote (`entry.ts:62-73`, no rate limit/lockout/audit; capability sole gate in the 4 manage* functions). Descriptor obtainable via onboarding-link leak or approximated from an admin photo via the same face-api model (~0.2–0.4 same-person distance straddles the 0.38 threshold).
- Status: **confirmed (design)**.

**H4. Limited admins can self-escalate; `is_full_admin`/`admin_permissions` enforced client-side only**
- `manageAuthorizedUsers` (remote): `adminUserView` + `cleanManagedFields` accept `is_full_admin`/`admin_permissions`; sole gate `role==='admin'`. Escalation: update own record `is_full_admin:true` (defeats the only server segregation-of-duties check — own-shift approval in timeClockAction:9241); `create` a new `role:'admin'`. Verifier REFUTED the `setPassword`-on-another-admin path (no such action exists) — nearest: admin can trigger `issuePasswordReset` on another admin (token emailed to victim — phishing/annoyance only). Verified concrete impact: self-grant `is_full_admin` → approve own time-clock shifts; create new admin accounts; `admin_permissions` never server-enforced.
- Status: **confirmed (remote code)** — verifier MEDIUM-HIGH.

**H5. No effective client-side auth gate — entire staff UI renders anonymously**
- `src/App.jsx`: `isAuthenticated` destructured, never checked; EmailGate "Continue browsing without signing in"; Layout gates only `Fleet*`; `vite.config.js` builds with `minifyIdentifiers:false`.
- Impact: all ~87 routes' UI/logic/admin surfaces exposed to anonymous visitors; safety rests entirely on backend checks.
- Status: **confirmed**.

**H6. Clickjacking — no X-Frame-Options / CSP frame-ancestors**
- Live-verified headers. Combined with H5 + postMessage listener (M5) → UI redress/phishing aid.
- Status: **confirmed**.

**H7. Customer portal tokens plaintext at rest + returned to any staff session**
- `customerPortalAction`: `resolveLink` plaintext compare; `list_links`/`list_thread` return raw `token` to any session; `create_link` needs only session (not admin); tokens in URLs. 256-bit entropy, 90-day TTL are good.
- Status: **confirmed** — verifier MEDIUM-HIGH (any-role staff session can enumerate/impersonate).

**H8. Leaked onboarding link → full account takeover (admin links re-issuable)** — verifier-found: `onboardingAccountAction` `save_credentials` (L152–182) lets a link holder WRITE `password_hash` and `face_descriptors`; `sanitizedUser` also returns `face_descriptors`+`hr_data` on `validate`/`save_credentials`/`save_hr`/`complete`; `issue_invite` (L106–109) re-issues invites for *existing admins* without clearing creds/face data; token not claimed on `save_credentials`. A leaked/guessed invite link for an admin = credential overwrite + biometric-template theft. **Confirmed (remote code).**

**H10. googleDriveOperations: any staff role gets arbitrary Drive read/download/delete via shared connector token**
- `googleDriveOperations/entry.ts:19` gate = `authenticateSignShopSession` only (no role check); `:21` uses shared service connector token with `supportsAllDrives`/`includeItemsFromAllDrives`. `getDownloadUrl` (164–233) returns ≤5MB file content for arbitrary `fileId`; `deleteFile` (235–306) deletes arbitrary `fileId` — `expectedName`/`expectedModified` preconditions enforced ONLY if caller supplies them → unconditional delete.
- Impact: lowest-privilege staff (or stolen staff session) can read/delete any company Drive file incl. Shared Drives.
- Remediation: admin/role gate; require delete preconditions; scope to allowlisted folder tree.
- Status: **confirmed (round-2, remote-verified)**.

**H11. staffDataRead nested filter/sort oracle on AuthorizedEmail credential fields**
- `staffDataRead/entry.ts:81-101` `cleanQuery` rejects only TOP-LEVEL `$` keys — nested operators pass to `entity.filter`. FIELD_DENYLIST strips secrets from output but the query still evaluates them → boolean oracle: `{password_hash:{$regex:"^5f2"}}` recovers bcrypt `password_hash` char-by-char → offline crack; also `password_reset_token_hash`, `onboarding_token_hash`, `session_not_before`. `sort:'password_hash'` = ordering oracle.
- **Exploitability verified (lead):** remote `staffDataRead` confirms `AuthorizedEmail` ∈ STAFF_READABLE; `$regex`/`$gt`/`$in`/`$ne`/`$or` supported — used across codebase (fleetSearch, importSalesPipeline, searchExternalClients…). 4KB query cap, limit 500/skip 100k allow sweeps.
- Status: **confirmed (remote code + engine support proven; oracle extraction mechanical)**. Severity MEDIUM-HIGH (staff session required).

**H9. Stored XSS via unescaped `document.write` print windows** — verifier CONFIRMED: CNCEstimator (~L1051-1151), LaserEstimator (~L1243-1355), MetalEstimator (~L1092-1196) interpolate `project_name`,`client_name`,`notes`,`item.description` into `window.open('','_blank')`+`document.write` with no `escHtml` helper in any of the 3 remote files. Fields persist via saved estimates shared among staff → stored XSS in a same-origin doc → localStorage session + admin-capability theft when a victim prints.
- Status: **confirmed**.

### MEDIUM

**M2. Workflow capability tokens committed plaintext in `base44/workflows/*.jsonc`** — anyone with source access can invoke ~10 scheduled functions (smartsheetSyncAction, refreshJurisdiction, checkDeadlineReminders, monitorJurisdictionChanges, backupToGoogleDrive, auditJurisdictionAccuracy, detectSalesDuplicates, sourceMonitorScan, timeClockAction monitor_stale_shifts) without a session. **Confirmed.**

**M3. ~28 functions gate only on `base44.auth.me()` (any platform-authenticated user)** — analyzeDocument, propertySearch, validateDocumentUrl, downloadPermitPDF (admin only on one branch), callJurisdictionAgent, calculateTravelMiles, permittingProxy, etc. (verifier refuted 2 — batchUpdateJurisdictions + sourceMonitorSeed DO enforce admin). **RESOLVED (2026-10-27):** pulled `auth` config — ALL platform login methods disabled (no password/social/SSO); `users/provisions`+`invite-users` are admin-token-gated (live 401). No public path to a platform session ⇒ exposure limited to already-provisioned platform users (owner/admins). Downgraded to **LOW/hardening** — but fragile: enabling any login method later silently opens all of these.

**M4. 30-day bearer sessions in localStorage; no server-side logout/revocation** — `verifyLogin` 30-day exp; logout deletes local copy only; no admin revoke action (`session_not_before` bump exists but unused for logout). XSS (H1/M1) → durable takeover. **Confirmed.**

**M5. fleetPublicIssueReport unauthenticated work-order creation + photo upload** — submission_token is format-checked idempotency key only; IP throttle trusts spoofable forwarding headers. **LIVE-VERIFIED (lead): `public_reporting_enabled` is ON — anonymous `action:'list'` returns real fleet equipment inventory (ids/names/types) and the endpoint accepts submissions** → strangers can create FleetMaintenanceWorkOrder rows, upload ≤3 JPEGs, and trigger staff notification emails. **Confirmed live.**

**M6. processWorkflowTriggers: any staff session can emit arbitrary events on any record** — e.g. `permit_approved`/`work_order_completed` on records that never transitioned → automation fires. Insider risk. **Confirmed.**

**M7. bouncieWebhook shared-secret header, non-constant-time compare, no timestamp window** — replayed key injects BouncieNotification rows / poisons live vehicle state. **Confirmed.**

**M8. Legacy plaintext passwords at rest + timing nit** — `verifyLogin` plaintext fallback path; unmigrated rows hold cleartext until login; dummy-bcrypt masks timing (real issue is at-rest cleartext). **Confirmed (code); whether rows remain unverifiable.**

**M9. No per-IP throttling on verifyLogin/issuePasswordReset/issueAdminSettingsAccess** — per-account lockout exists; spraying ≤10 tries/account unaffected; reset-email flooding. **Confirmed.**

**M10. VisualEditAgent postMessage listener, origin check commented out** — `update-classes`/`update-content`(innerText)/`refresh-page` handled from any origin; outbound `postMessage('*')` leaks DOM. Framing possible due to H6. **Confirmed.**

**M13. staffDataRead exposes all employees' HR/payroll rows to any staff role** — `STAFF_READABLE` includes TimeEntry, TimeClockAudit/Break/CorrectionRequest/LaborSegment/PayPeriod/WorkPause, TimeOffRequest, UserPTOBalance with NO per-user scoping (timeClockAction scopes to `target.email`); ADMIN_READABLE empty. Any staff reads every coworker's punches, PTO balances, time-off reasons. **Confirmed (round-2).**

**M17. processWorkflowTriggers: only permit events verify durable state; `extras`/`old_data` caller-controlled** — round-4: `entry.ts:143-188` order/WO/time-clock events re-read record id only; `workflowTriggerEngine.ts:340-514` matches on event type + caller `extras.previousStage/newStage`. Staff can emit `time_off_approved` for any TimeOffRequest (approval emails, possibly to customers), `work_order_completed/deleted` on live WOs (fires CAS mutations incl. `create_rider` creating real WorkOrders), `order_received`, `pto_balance_low`, `user_role_changed`/`user_face_enrolled` (admin-gated, still unverified). SERVER_RECORD_EVENTS correctly blocked. Broadens M6. **Confirmed.**

**M18. Staff can forge "immutable" audit/evidence records** — round-4 cluster: `ensureBuilderPriceRevision:143-152` mass-assigns `...revision` incl. fabricated price history on real products (values never checked vs live); `recordEstimateAcceptance` — any staff writes immutable EstimateAcceptance for ANY sent estimate, caller-asserted customer identity/method `verbal`/unbounded `accepted_at`; `recordEstimateQuoteDelivery` — forged "quote emailed" rows, `work_order_id`/`quote_version`/`quote_total` unchecked, `attachment_file_url` accepts `javascript:`/`data:` schemes (stored XSS/phish where rendered); `fieldHistoryAction` — privileged fields (`sales_status`, `estimate_amount`, `actual_cost`, `profit_margin`, `completed`, `permit_*`, reparenting, arbitrary `*_url`) staff-writable + `guard_fields` equality oracle. Weakens repudiation value of audit trail. **Confirmed.**

**M15. Financial mutations open to ANY staff role (no segregation of duties)** — round-3: `invoicingAction`, `purchaseOrderAction`, `changeOrderAction`, `inventoryAction` all gate on `authenticateSignShopSession` only (any `role:'user'`): void_invoice, record/void_payment, mark_paid (free client-supplied `paid_amount` — PO:356-375), adjust_stock (arbitrary negative delta — inventoryAction:205-238), self-approve own change orders (changeOrderAction:226-272). Insider or compromised-session can void invoices, record fictitious payments, shrink stock. **Confirmed (design; flag for owner decision — may be intended "all staff trusted" model).**

**M16. invoicingAction email_invoice/email_statement: arbitrary recipient + caller-controlled `portal_base` carrying a REAL 90-day portal token** — `entry.ts:604,606,614-635,689-716`: `body.email` any address (financial detail exfil); `body.portal_base` attacker domain + genuine portal token → phishing + token capture → 90-day portal access. **Confirmed (round-3).**

**M14. safeExternalFetch IPv4-mapped-IPv6 SSRF bypass (residual)** — `shared/safeExternalFetch.ts:22-37` blocks `::`-prefixed/dotted-mapped forms but expanded-hex `http://[0:0:0:0:0:ffff:a00:1]/` (=10.0.0.1) evades the check; DNS-rebind TOCTOU acknowledged in code comments. Affects validateDocumentUrl, importWipSheet, downloadPermitPDF, scanPermittingOffice, backupPermittingRepository, continueJurisdictionArchives. Caller-side auth limits exposure. **Likely (round-2).**

**M11. Vulnerable/outdated deps — 33 CVEs per fresh scan (2026-10-27)** — `jspdf@2.5.2` **12 CVEs incl. 2 critical** (GHSA-f8cm LFI/path-traversal, GHSA-wfv2 HTML-injection-in-new-window — relevant given PDF generation from user data + print-window XSS paths); `xlsx@0.18.5` 2 highs (prototype pollution GHSA-4r6h, ReDoS GHSA-5pgg — **no fixed version**, parses user-uploaded sheets in importers); `lodash@4.17.21` 3 (code inj, proto pollution); `zod@3.25.76` high (memory exhaustion); `moment` medium; `postcss` 4 (arbitrary file read, traversal, XSS); `vite@6.3.6` 8 (mostly dev-server); `react-quill`→`quill@1.3.7` EOL unused — remove; `face-api.js` abandoned + runtime CDN model load; `bcryptjs` bundled client-side unnecessarily. **Confirmed (scanner + reviewer).**

**M12. Entities with no `rls` block at all** — GeneralTask (internal tasks w/ assignees), TaskTemplate, SipChecklistTemplate, JurisdictionProfile, PermitLocality, PermitLineItem, User. Exposure = platform default — likely open. **Confirmed (schema); exposure likely.**

### LOW
- L1. `permittingProxy` reads unregistered `PERMITTING_API_KEY` → 503 fail-closed (availability, not exploit).
- L2. `listAuthorizedUserDirectory` returns full staff directory (emails, names, roles) to any session.
- L3. `issuePasswordReset` no issuance throttle → email-bombing vector.
- L4. onboardingAccountAction: unvalidated `face_descriptors` stored; onboarding token not claimed on `save_credentials`; returns hr_data+descriptors to link holder.
- L5. `fleetDataRead` returns all columns of allowlisted entities (no field denylist, unlike staffDataRead).
- L6. `getGoogleMapsKey` returns raw key to any staff session (inherently public key; verify GCP referrer restrictions).
- L7. OAuth callback state reusable within 10-min window (bouncie claims atomically); nonce unenforced — minor.
- L8. sendGmail/fleetNotificationDispatcher echo `error.message`; smartsheetSyncAction returns `secret_name` (name only) — info leak nit.
- L9. Agent `jurisdictionResearch` has delete + global memory — broadest agent grant.
- L10. 39 `target=_blank` w/o `rel=noopener` — hygiene.
- L11. Stray artifacts: remote `C:` dir (esbuild bundle copies from Windows-path leak); committed `dist/`+`dist-nomin` drift vs `public/`; `scripts/__pycache__`; ~15 junk/probe entities (Nope, Temp3/5/6, __noop* — 3 still `read:{}`); missing `/manifest.json` (404).
- L12. index.html/site `x-robots-tag: noindex` already set; missing headers beyond XFO: no CSP at all.
- L13. importOrders: no upload byte cap (contrast 15/50MB caps in sibling importers) + xlsx parser risk + unbounded row loop → function DoS for admin/import users. Confirmed (round-2).
- L14. smartsheetSyncAction `pull_dataset(orders)` mass Order mutation triggerable by non-admin staff (intentional per comment — confirm). Confirmed.
- L15. backupPermittingRepository: stored jurisdiction name interpolated unescaped into Drive `q` param → query corruption (admin-initiated only). Confirmed.
- L16. propertySearch: unbounded searchTerm → LLM cost abuse + error.message echo (auth.me()-gated).
- L17. googleDriveOperations.uploadFile: caller `fileType` into multipart header unsanitized (low).
- L19. fleetMeterMaintenanceAction auth bug: `includes(action, session_token)` swallows token → staff sessions always 401 (broken now); if fixed naïvely → non-admin create/update/delete bypass (latent). Confirmed remote :64.
- L20. `invoice_number`/`po_number` client-editable in EDITABLE fields → doc-number forgery/collision (invoicingAction:23, purchaseOrderAction:20). Confirmed.
- L21. fleetWorkOrderAction `reopen` doesn't reverse consumed inventory → re-complete double-decrements stock (:895-944); `update`/`reopen`/`complete` CAS optional (`expected_updated_date` skipped) → last-write-wins. Confirmed.
- L22. fleetInspectionAction: any staff can save/complete another's inspection (no `inspector_email` check) → attribution falsification. Confirmed.
- L23. fleetSearch: accepts any platform `user`/`admin` without AuthorizedEmail row check (unreachable today — logins disabled). Informational.
- L24. Count-based doc numbering racy (`rows.length+1001`) in invoicing/PO/CO/inventory → duplicate numbers on concurrent create. Use DocNumberCounter. Confirmed.
- L25. update_change_order link fields (customer/estimate/work_order/invoice ids) editable without existence re-validation. Integrity nit.
- L27. fleetPublicIssueReport throttle detail (round-4): requests with NO proxy headers are never throttled (`if(!fingerprint) return {limited:false}`); rotating client XFF yields fresh fingerprints → intended 5/15min cap bypassable. Strengthens M5.
- L28. safeExternalFetch additional residuals (round-4): non-compressed IPv4-mapped hex IPv6 + full-form Teredo bypass blocklist; redirect hops replay Authorization headers cross-host (no reviewed call site passes both, conditional); no response-size bound; DNS TOCTOU acknowledged. Complements M14.
- L26. Function logs clean: 288 entries across high-traffic functions (12h) — no session tokens/capabilities/password patterns logged. Not a finding.
- L18. Per-function auth map (round-2): timeClockAction 10.7k lines verified sound — badge/PIN scope-bound, CAS+payload-hash, self-approval blocked unless is_full_admin; smartsheet*/importSalesPipeline/importWipSheet/opportunity*/corebridge/sendEmail all properly gated (admin or capability); OAuth callbacks bind tokens to initiating user only. sendEmail hard-disabled 503.

## FALSE-POSITIVE / DOWNGRADED
- manageAnnouncements `acknowledge` anonymous write (rescan finding): verified — intentionally tolerates 401 (public banner feed); append-only `acknowledged_viewers` key capped at 500 entries via CAS. By-design public read+ack; bounded anonymous write. **LOW/by-design, not a vulnerability.**
- Rescan static finding "staff-controlled text interpolated into customer emails without HTML escaping" (low): plausible given email flows (sendGmail/portal/invoicing emails build HTML bodies); consistent with the no-escaping theme — treat as minor, fold under stored-XSS/escaping hardening recommendations.
- adminBootstrapLogin, restoreMasterInventory, migrateEstimatorConfig, driveBrowseFolder, driveOAuthInitiate, googleDrive* — all return 410 retired, fail-closed. **Not findings.**
- Credential entities (UserCredential, BouncieOAuthState, CustomerPortalLink, FleetMechanicAccess, TimeClockBadge, AuthorizedEmail, Invoice, Payment, PurchaseOrder, PortalMessage, Opportunity, TimeClock*/TimeEntry owner-scoped) — properly locked; live POST → 403. **Not findings.**
- Archived-evidence "secrets" — placeholders/`******`, public analytics keys only. Scanner claim confirmed; **not a finding.**
- Hardcoded secrets in shipped frontend — none found (remote grep). 
- mass-assignment — consistently guarded by field allowlists.
- OAuth state helper — purpose-bound, 10-min TTL, HMAC — sound.
- `verifyLogin` timing oracle — masked by dummy bcrypt; downgraded to at-rest-plaintext issue only.
- Mechanic portal (fleetMechanicPortal) — exemplary: hashed tokens, scope+expiry re-verified per write, CAS, sanitized responses.

## DISAGREEMENTS
- H3 severity: B=Critical vs C=Medium-High → **independent verifier ruled HIGH** (real precondition: obtaining/approximating an admin descriptor — leakable/writable via onboarding links; no throttle/audit).
- H2 severity: verifier splits — HIGH as design flaw, MEDIUM practical remote exploitability (literal not publicly served; requires source/builder/leak access).
- V7 archived HTML: verifier lowered to MEDIUM (third-party CDN/inline scripts — standing same-origin sink, not attacker-authored content); lead keeps HIGH for session-theft consequence. Recorded both.
- M3: RESOLVED — all platform login methods disabled (auth config pulled + verified); provisions/invite admin-gated (live 401). Reclassified LOW/hardening.

## Round-4 additions (residual internals) — all remote-verified
- M17, M18 (above); L27-L28 (below). Also verified clean: monitorJurisdictionChanges (capability XOR admin; scoped writes), permittingResearchBacklogDispatch (admin-only; forwards capability but downstream hash-checks), ensureNewCustomer/ensureNewEstimate/ensureEstimateCustomer/ensureCustomerSummary/ensureOpenEstimateRevision/ensureEstimateLifecycleRevision (whitelists + CAS; minor caller-settable fields noted informational), workflowTriggerEngine escaping/CAS, all shared crypto helpers (adminSettingsCapability, workflowInvocationCapability, signShopSession, oauthState, constantTime, bearerTokenHash), fleetStaffSession, fieldHistoryAction entity allowlist (cannot inject entity), recordEstimate* auth (staff-only, no anonymous), bouncieAuthCallback (one-time CAS state claim), Deno.serve auth sweep — only intended-public endpoints lack auth markers.

## RESUME CHECKPOINT (for continuing this audit)
- Report file: `audit/SECURITY_AUDIT_2026-10-27.md` (this file). Remote baseline HEAD at last full verification: `d166196c2` (2026-10-27 09:52Z).
- Scan files: prior scan `/tmp/b44_scan_initial.json`, fresh scan `/tmp/b44_scan_fresh.json` (Bash /tmp = C:\Users\BRETTH~1\AppData\Local\Temp) — re-fetch via `api fetch GET /api/apps/68dfcc5e57bbbc35387da97c/security/scan` (set `MSYS_NO_PATHCONV=1`).
- Live-verification cheatsheet: entity sweep `GET https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/entities/<Name>` (no auth); function invoke `POST .../functions/<name>`; write-probe = invalid POST (422 = open, 401/403 = gated).
- Next steps on resume: (1) diff security scan vs this run's fingerprints; (2) `git log --since` drift check vs baseline; (3) re-run top-3 entity probes; (4) live authenticated tests IF test accounts provided; (5) verify fixes as they land (watch base44/entities/*.jsonc rls blocks, sendGmail, issueAdminSettingsAccess, public/permitting/sources move).

## Remaining gaps / next-cycle items
- Await verifier verdicts (V1-V10) + fresh scan result (re-triggered).
- ~~Determine whether anonymous visitors can obtain platform `auth.me()` sessions~~ — DONE: all login disabled; auth.me() ≈ platform-admin only.
- ~~Line-review the ~120 functions~~ — DONE (rounds 2-4: all 156 auth-verified, ~60+ line-read; residual internals also covered).
- dist/ is the deploy output; staleness vs src/ = fixes don't ship — ops note, not enumerated path-by-path.
- Live authenticated cross-user/cross-role testing — REQUIRES approved test accounts (none provided); currently covered by code review only.
- Re-run Base44 scan after concurrent-agent changes settle; compare fingerprints.
- Function-log coverage: sampled 288 entries/12h high-traffic functions — clean; full-history sweep not performed (API slow).
- Concurrent-change drift: 20+ "External agent changes" commits in 3h (another agent actively working — mostly time-clock). Re-verified post-drift ~10:00Z: customerPortalAction token paths, print-window XSS (3 files), App.jsx unchecked `isAuthenticated`, Layout Fleet*-only gate, timeClockAction:9241 `is_full_admin` check — ALL still present. Findings remain valid as of latest check.

---

## REMEDIATION LOG (2026-10-27, applied to remote sandbox, branch main)
Checkpoints: `52a2bd94c` (pre-security-remediation) → `b2bf3f268` (security-remediation-phases-1-4). All changes staged on main; **live exposure persists until publish** — RLS/entity config + code ship on publish only.

### Phase 1 — Backend auth/capability/business-logic (applied)
- sendGmail: `_workflow_capability` now read from request payload (was email `body` — dead internal path + smuggled-credential shape); literal rotated in all 5 callers + verifier hash.
- issueAdminSettingsAccess: anonymous face-descriptor path REMOVED — admin session required; optional face binds to that session's admin.
- onboardingAccountAction: `face_descriptors`/`hr_data` stripped from sanitizedUser; descriptor validation on save_credentials; `session_not_before` bumped on re-invite of credentialed users.
- manageAuthorizedUsers: `is_full_admin` required for role/`is_full_admin`/`admin_permissions` on create+update (self-escalation closed).
- customerPortalAction: portal tokens masked for non-admin in list_links/list_thread.
- Workflow capabilities: 9 `_workflow_capability` tokens rotated across 12 workflow jsonc + timeClockAction + shared verifier.
- verifyLogin: legacy plaintext password path removed (bcrypt-only; non-bcrypt accounts → password reset).
- bouncieWebhook: constant-time key compare.
- safeExternalFetch: full-hex IPv4-mapped IPv6 + Teredo blocks; Authorization stripped on cross-host redirects.
- fleetPublicIssueReport: throttle fail-closed (untracked origins share a global bucket).
- fleetSearch: AuthorizedEmail row required (not just platform role claim).
- fleetMeterMaintenanceAction: authorize() arg-order bug fixed (latent bypass).
- googleDriveOperations: admin-only + delete requires expectedFileName/expectedModifiedTime.
- staffDataRead: recursive `$`-operator rejection (credential-hash oracle closed); sort denylist; HR entities owner-scoped.
- Doc numbering: new shared `docNumberAllocation.ts` (atomic DocNumberCounter CAS, seeded per-sequence) wired into invoicing/purchaseOrder/changeOrder/inventory — racy count-based numbering retired.
- invoicingAction: `invoice_number` no longer editable; `portal_base` forced to app origin (phishing closed); email recipient restricted to customer-on-file.
- purchaseOrderAction: `po_number` no longer editable. changeOrderAction: record links immutable on update.
- processWorkflowTriggers: durable-state checks for `time_off_approved`, `stage_*_entered`, completion events; caller-supplied `old_data` dropped.
- ensureBuilderPriceRevision: schema-whitelisted fields. recordEstimateQuoteDelivery: https-only attachment + estimate/version/WO verification.
- fleetWorkOrderAction: reopen reverses consumed inventory via CAS; `expected_updated_date` now required.
- fleetInspectionAction: assigned-inspector (or admin) only for save/complete.
- fieldHistoryAction: privileged fields admin-only; `$`-keys rejected in guard_fields.

### Phase 2 — Frontend (applied/verified)
- Stored-XSS print windows: verified already fully escaped remotely (escHtml on all interpolations — concurrent work).
- public/permitting/sources/**: all 46 archived HTML files sanitized in place — scripts, event handlers, forms, iframes, external loads, meta-refresh, javascript: URLs stripped; 0 residual markers.
- EmailGate: "Continue browsing without signing in" removed — gated pages require login; LoginGate exemptions added for /timeclock, /newusersetup, /privacypolicy, /resetpassword so public flows keep working.
- VisualEditAgent: postMessage origin allowlist (base44.com/base44.app + same-origin).
- noopener: verified 0 missing. access_token URL param: standard SDK pattern, left as-is.

### Phase 3 — Entity RLS lockdown (applied)
- ~100 entity jsonc files rewritten to `__x_backend_only__` sentinel (all 4 ops); 6 previously rls-less entities got proper rls blocks; all 191 entity defs now carry RLS.
- New gateways: `staffDataRead` extended (+50 staff-tier entities, count op, recursive-$ rejection, sort denylist, HR owner-scope); NEW `staffEntityWrite` function — session-authenticated, per-entity op allowlist, operator-key rejection, optional CAS.
- Frontend migration: new `src/api/gatedEntities.js` (staff-tier → staffEntities proxy); 141 files rewritten (`@/entities/all` imports + `base44.entities.X` + dynamic `entities[` access); facade gained create/update/delete routed to staffEntityWrite.
- Junk entities (Nope, Temp*, __noop*, DO_NOT_USE…) sentinel-locked.

### Phase 4 — Platform/deps (applied)
- `prevent_iframe_embedding` enabled (effective policy: block_all) — clickjacking fixed.
- package.json: jspdf→^4.2.1, bcryptjs→^3.0.3, postcss→^8.5.23, vite→^6.4.1, xlsx→cdn.sheetjs.com 0.20.3 tarball (unfixed-npm-CVE path).

### Verification done
- scripts/validate-opportunity-workspace.mjs PASS; test-entity-persistence/customer-persistence/estimate-cas/estimate-lifecycle all PASS; esbuild syntax-clean on all edited files.

### NOT done / deferred (owner-visible)
- Phase-1 misc lows: issuePasswordReset cooldown, server-side logout/revoke action, error-echo trimming, listAuthorizedUserDirectory projection, getGoogleMapsKey restriction.
- Deferred deps: zod 3→4, react-quill removal, lodash (no fix published), moment, face-api (in active use).
- Live re-probe still returns data — entity RLS + code ship only on publish. RE-SWEEP after publish: anonymous entity reads should all 403.
- dist/ staleness: verify publish picks up new code.
- Recommend: re-run Base44 security scan after publish; expect rls_recommendations → 0, backend findings → 0.

### Final items (applied after phases 1-4)
- issuePasswordReset: cooldown — refuses to reissue/mail while an unexpired token exists (anti-bombing).
- verifySession: new `action:"logout"` bumps `session_not_before` (server-side revocation); EmailGate logout now invokes it before clearing local state.
- getGoogleMapsKey / listAuthorizedUserDirectory: verified already gated (staff session + minimal projection). GCP-side HTTP-referrer restriction on the key is the residual manual control.
- Checkpoint `security-remediation-complete` @ `d905a1d8e`. Fresh Base44 scan triggered for post-fix diff.
