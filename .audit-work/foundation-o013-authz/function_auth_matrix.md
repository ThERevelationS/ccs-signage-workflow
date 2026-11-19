# O-013 · Function → authentication matrix

Every backend function that touches protected (backend-only / restricted) entities, classified by credential. Verified via remote `sandbox grep`/`sandbox read` on branch `main` — 126 function files contain awaited `authenticateSignShopSession`/`resolveFleetStaffUser` calls, and every file importing the helper invokes it.

## A · Sign-shop session required (EmailGate `sss_session_token`)

`authenticateSignShopSession` (`shared/signShopSession.ts:49-127`): HMAC token verify → expiry → `UserSession` revocation (token-hash) → exactly-one `AuthorizedEmail` → `session_not_before` → 60s cache. `resolveFleetStaffUser` (`shared/fleetStaffSession.ts:1-36`) restricts to `admin`/`user`.

| Function | Auth site | Role gates | Entity surface |
|---|---|---|---|
| `staffDataRead` | l.554 (`resolveFleetStaffUser`) | ADMIN_READABLE tier l.454; OWNER_SCOPED l.464-509; denied_fields l.202-206 | ~130 allowlisted reads |
| `staffEntityWrite` | l.132 | ADMIN_ONLY_WRITE l.91 + inline l.143-176; SavedQueueView owner l.285 | WRITE_OPS allowlist l.10-90 |
| `invoicingAction` | l.206 | none per-action (F-8) | Invoice, Payment, WorkOrder, Customer, ChangeOrder |
| `recordEstimateAcceptance` | l.285 | — | EstimateAcceptance, AllInOneEstimate, EstimateRevision |
| `recordEstimateQuoteDelivery` | l.151 | — | EstimateQuoteDelivery, AllInOneEstimate |
| `ensureNewEstimate` | l.88 | — | AllInOneEstimate create |
| `ensureEstimateCustomer` | l.164 | — | Customer link |
| `ensureNewCustomer` | l.78 | — | Customer create |
| `ensureOpenEstimateRevision` | ~l.107 | — | EstimateRevision |
| `updateEstimateRevisionAudit` | l.35 | auth.me() fallback l.36 (F-6); caller-scoped estimate read l.41,65 (F-3) | EstimateRevision, AllInOneEstimate |
| `queueFeed` | ~l.390 | — | multi-entity feed projection |
| `boardFeed` | l.154 | — | WorkOrder projection via `boardFeedFields` |
| `changeOrderAction` | l.86 | — | ChangeOrder, AllInOneEstimate |
| `opportunityWorkspaceAction` | ~l.288 | — | Opportunity, OpportunityIntake, EstimatingRequest, OpportunityActivity |
| `zzCleanupAction` | l.59 | **admin-only l.60** | zz-scan/delete across entities + AdminAuditLog |
| `customerPortalAction` (staff lane) | l.1480 | — | link CRUD + staff thread ops |
| `generateDocNumber` | ~l.11 | — | DocNumberCounter |
| `deleteCreatedDuplicateWorkOrder` | l.28 | — | WorkOrder delete |
| `importOrders` / `importSalesPipeline` / `importWipSheet` | l.45 / ~l.399 / ~l.184 | — | Order, Customer, ImportJob, PendingImport |
| `inventoryAction` | ~l.94 | — | Inventory, InventoryMovement, InventoryCostHistory |
| `jobCostingAction` | ~l.89 | — | cost aggregates |
| `manageReconciliation` | ~l.174 | — | ReconciliationBatch |
| `purchaseOrderAction` | ~l.135 | — | PurchaseOrder, Vendor |
| `quickbooksExport` | ~l.50 | — | export read paths |
| `manageCustomerLifecycle` | ~l.106 | — | Customer merges |
| `notificationAction` | ~l.136 | — | Notification, templates, prefs |
| `fieldHistoryAction` | ~l.51 | — | FieldAudit, CellHistory |
| `accessRequestAction` | l.8 | admin for approve/list | AccessRequest, AuthorizedEmail grants |
| `issuePasswordReset` | session | admin for other-user | AuthorizedEmail |
| `hostedAssetManifest.save_manifest` | session | **admin-only** | GlobalSettings |
| `sessionAdminAction`, `manageAuthorizedUsers`, `listAuthorizedUserDirectory`, `manageAccountDeletionRequest`, `migrateCredentials`, `manageAnnouncements`, `manageBroadcasts`, `manageCalendarEvents`, `manageMigration`, `manageOwnProfile`, `managePTOConfig`, `manageUserCalendarSettings`, `manageUserCapacity`, `manageWorkflowSchedules`, `manageSops`, `manageTraining`, `manageQuoteApprovalSettings`, `manageSalesFilters`, `manageFeatureReports`, `dataIntegrityAction`, `permittingHealth`, `permittingScanStatus`, `accountingAdminAction`, `corebridgeApiAction`, `googleDriveOperations`, `sendEmail`, `sendStaffEmail`, `sendGmail`, `seedNotificationTemplates`, `staffArchiveFile`, `staffPermittingDocWrite`, `smartsheetMetadataAdminAction`, `smartsheetSyncTraceRead`, `shiftSwapAction`, `archiveAddressResearchFile`, `continueAddressResearchDiscovery`, `getAddressResearchCollections`, `linkAddressResearchDocument`, `processWorkflowTriggers`, `weeklyAdminDigest`, `dailyAnomalyDigest`, `calculateTravelMiles`, `fixtureBusinessSearch`, `placesAutocomplete`, `getGoogleMapsKey`, `streetViewPreview`, `cagisSearch`, `propertySearch`, `translateSmartsheetNotes`, `validateDocumentUrl`, `analyzeDocument`, `bouncieAuthInitiate`, `bouncieApi`, `bouncieStatus`, `bouncieSyncNotifications`, `fleetDataRead`, `fleetMechanicPortal`(fleet creds), ~40 more | verified in awaited-auth grep (126 files total) | per-function | various |

## B · Session OR `auth.me()` fallback (any platform user — no role check: F-6)

| Function | Site |
|---|---|
| `ensureEstimateLifecycleRevision` | l.102-104 |
| `ensureBuilderPriceRevision` | l.101-103 |
| `ensureCustomerSummary` | l.238-240 |
| `updateEstimateRevisionAudit` | l.35-37 |

## C · Workflow-capability (`_workflow_capability`, SHA-256 + constant-time, `shared/workflowInvocationCapability.ts:38-49`)

`checkDeadlineReminders`, `checkPermitFollowupReminders`, `monitorJurisdictionChanges` (also `authenticateAdminSession`), `sourceMonitorScan`, `followUpSweepAction` (also session), `smartsheetSyncAction` (session for staff actions; capability for scheduled), `backupToGoogleDrive`, `auditJurisdictionAccuracy`, `refreshJurisdiction`, `refreshJurisdictionTargeted`, `detectSalesDuplicates`, `sendGmail`. Raw capability lives only in the workflow jsonc `args` — verified present in `Daily Deadline Reminder Check.jsonc`.

## D · Platform `auth.me()`-gated (native Base44 users; EmailGate staff cannot call)

Admin-gated: `opportunityBridgePilotVerification`, `opportunityBridgeProductionApply`, `opportunityBridgeSimulation`, `sourceMonitorSeed`, `permittingResearchBacklogDispatch`, `manageAutomationConfig` (admin capability token), `continueJurisdictionArchives`, `continuePermittingSourceText`, `getPermittingSourceTextPages`, `permittingHtmlEvidence`, `permittingOfficeAuthorityReview`, `permittingOfficeCandidate`, `permittingOperationalAlerts` (admin or wf-cap), `permittingRuleExtraction`, `permittingRuleInvalidate`, `permittingSourceAuthorityReview`, `permittingSourceOcrEvidence`, `downloadPermitPDF`, `searchExternalClients` (+feature flag).
Any-platform-user: `jurisdiction_research` (F-9).

## E · Intentionally public (documented capability/scope-limited)

| Function | Model |
|---|---|
| `workOrderTraveler` | WO-id = capability; narrow field projection (F-5). No writes. |
| `hostedAssetManifest.get_manifest` | public read of legacy asset map (writes admin-gated) |
| `verifyLogin` | mints sessions from email+password (`AuthorizedEmail`) |
| `verifySession` | validates/invalidates sessions |
| `setPassword` | reset-token OR session |
| `onboardingAccountAction` | hashed onboarding token OR session |
| `adminBootstrapLogin` | retired → 410 |
| `customerPortalAction` (public lane) | `CustomerPortalLink` bearer tokens — kind-scoped (see VERDICT I-6) |
| `fileBridgeIngest` / `fileBridgeSpike` | agent HMAC credential / probe key (FileBridge scope) |

## F · Unauthenticated — GAP

| Function | Issue |
|---|---|
| `fileBridgeMaintenance` | No credential of any kind; anonymous invoke → asServiceRole writes incl. `CustomerFolderLink` create. Workflow passes `args:{}` — **no capability registered for it in `WORKFLOW_CAPABILITY_HASHES`** either. See finding F-1. |
