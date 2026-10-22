# Order Form: historical Excel-import reconciliation audit (2026-10-17)

Scope: read-only Order Form audit for CCS Signage Workflow (Base44 app `68dfcc5e57bbbc35387da97c`). No Order records, settings, or Smartsheet rows were changed. No Smartsheet write was sent and nothing was published.

## Live repository and evidence

- Fresh Git HEAD: `5e3e8f156b0a69b14ca50d70ac0e0af2927dedeb`; working tree was clean at audit start.
- Read the current `importOrders` implementation, its shared persistence helper, the Order entity schema, current `smartsheetSyncConfig`, and the prior row-ID read-only audit.
- Queried all 1,902 Order records through read-only Base44 entity queries, including soft-deleted records. The corrected review used stable unique-ID ordering (500/500/500/402) and repeated the full read; both reads returned the same 1,902 unique Base44 IDs and the same row-link/sync evidence.
- Configured Order Request sheet: `4963691473987460`. Current saved settings show Order `push_enabled: false`, `pull_enabled: true`, and both generic create switches false. No setting was changed.
- The sandbox did not provide an authenticated read-only Smartsheet request path. Therefore no current remote row contents, completeness, or remote duplicate ownership were verified.

## Observed Base44 counts

- 1,902 Orders total: 1,681 active and 221 soft-deleted.
- 1,901 have a decimal permanent Smartsheet row ID; one soft-deleted Order has no sheet ID, row ID, sync timestamp, snapshot, pending marker, or create-attempt record.
- The 1,901 linked records represent 1,681 distinct sheet/row identities. There are 220 repeated permanent identity groups containing 440 records. Every group is exactly one active plus one soft-deleted Order; there are no active-active groups and no deleted-only groups. The paired records share customer, description, type, work order, quantity, requestor name, and vendor, but their status, snapshots, and sync timestamps differ. These pairs remain review cases; deletion state alone does not prove which record matches current Smartsheet.
- 1,896 records omit `smartsheet_pending_local_sync`; six explicitly store false; none store true.
- 1,901 have a last-sync timestamp and nonempty snapshot. Comparing the nine mapped Smartsheet columns against the current local values produced 221 exact matches and 1,680 mismatches. Of those mismatches, 1,557 were limited to the three date fields. Snapshot divergence is not enough to identify which side changed or to attribute a change to Excel import.
- 71 active natural-key groups (228 Orders) share the legacy importer key `lower(customer_name|description|request_type)`. All groups contain distinct permanent row IDs and differ in at least one mutable value. They may be legitimate repeat orders, but the old importer key cannot select a unique target for those identities.
- One retained create-attempt record reports `linked`; its recorded sheet/row IDs match the Order's permanent IDs, and it also has a sync timestamp and snapshot. This is useful history, not a substitute for a current remote read.
- No durable import-batch/source field distinguishes Excel-created or Excel-updated records from other Orders. Creation timestamps cannot identify historical Excel imports.

## Stable-ID pagination correction and paired-row review (2026-10-18)

This correction was performed from fresh clean Git HEAD `9a31957bcb866e03d4e54ba4adea88f6dd828332`. The first pass paginated by non-unique `created_date`, which caused repeated records at page boundaries and inflated the reported duplicate count. That pass reported 249 groups/499 rows and 30 active-active groups; those counts are superseded. The corrected two-pass read sorted by unique Base44 `id`, had no duplicate Base44 IDs across pages, and agreed on all 1,902 IDs and selected sync evidence.

The corrected 220 active/deleted pairs have these local differences across the pair: `requestor_email` differs in 114; `date_needed` in 5; `date_ordered` in 11; `date_needed_option` in 220; `date_ordered_option` in 216; `receipt_option` in 220; `status` in 220; `smartsheet_last_synced_at` in 220; and `smartsheet_sync_snapshot` in 220. All active records currently show status `received`; all paired deleted records show `pending`. Both sides omit `smartsheet_pending_local_sync`. These differences prevent using snapshot equality, status, or deletion state alone to decide remote ownership.

The current Order sync path loads the configured sheet's linked set, classifies deleted-row tombstones, then excludes soft-deleted records from its active matching map. Active duplicate row IDs are held by a fail-closed preflight. In this corrected dataset there are no active-active duplicate links; the 220 pairs are active/deleted shadowed tombstones. This describes current code behavior, not proof that the active record currently matches Smartsheet.

No live Smartsheet read was available, so all 220 pairs stay flagged for review. No marker repair, relinking, cleanup, or Smartsheet write is authorized by this audit.

## Read-only route capability check (2026-10-18)

Fresh app HEAD at inspection: `6512b1d26f500488b019ab1ac9be72875c92788d`; working tree was clean. Code inspection found an admin-only `audit_order_link_integrity` action reachable from the Order Form review UI. It reads all Base44 Orders and downloads the configured Smartsheet sheet through paginated GET requests, checks sheet identity and complete pagination, and returns `read_only: true`. The audit action is not in the trace-persistence allowlist, so this path does not create a sync trace record. This code path was inspected but not invoked; it supplies no new live Smartsheet evidence for this report.

That action is not sufficient to classify historical import markers. `auditOrderPermanentLinks` filters soft-deleted Orders out before owner counts, while the known 220 repeated row-ID groups each consist of an active/deleted pair. It checks permanent row presence and reports identity-column evidence for unlinked rows; for matched rows it does not return the remote business fields needed to compare snapshots or determine whether an absent marker reflects a completed import or an unqueued local change. Category detail is capped at 100 records. Therefore it cannot resolve these 220 owner pairs or classify the 1,896 absent-marker records as already synced or unsynced.

The last stable Base44-only read still classifies zero records as verified currently synced, zero as explicitly queued (`smartsheet_pending_local_sync: true`), six as explicitly false but not thereby proven current, and 1,896 as marker-absent and unresolved. The one record missing a permanent row ID and all 220 active/deleted permanent-ID pairs remain review cases. These counts overlap: the paired records are included among marker-absent rows. No new entity or Smartsheet read was performed in this capability check.

**Safe next evidence step:** use a dedicated bounded read-only reconciliation that includes active and soft-deleted Order claims, validates a complete configured-sheet download, and returns only the selected permanent row IDs with local marker/snapshot and corresponding remote mapped values. Any repeated owner, missing ID, incomplete download, or source change during the read must remain ambiguous. Do not set markers, push rows, relink, or retire records from the current audit action.

## What the implementation establishes

The importer at the original audit used `lower(customer_name|description|request_type)` and replaced earlier matches when a repeated key appeared. The 2026-10-22 prevention fix supersedes that behavior: it retains every active matching Order ID and reports a conflict when more than one Order matches within the selected job scope (or across all active Orders for an unscoped import). It also checks the whole uploaded workbook before processing and holds every source row whose normalized identity is repeated. Normalization trims and folds case, treats a missing type as `Other`, and uses a tuple to prevent delimiter collisions. Unique matches still receive only nonempty changed import fields. The persistence helper atomically includes `smartsheet_pending_local_sync: true` with a changed business-field update. New import-created Orders also start with that marker. No-op imports do not queue a write.

Those guarantees apply to current code. They do not prove which historical records were touched by older code or whether a historical import already reached Smartsheet.

## Safe classification rules

| Classification | Evidence required | Safe handling |
|---|---|---|
| Already synced now | Exactly one Base44 record owns the configured permanent sheet ID + row ID across active and deleted records; no pending marker is true; a timestamped sync snapshot exists; current mapped local values match that snapshot; and a complete read-only Smartsheet read by permanent IDs confirms the remote values match. | Record as verified at the read time. Snapshot-only agreement is historical baseline evidence, not proof of current remote state. |
| Unsynced / queued | `smartsheet_pending_local_sync === true` is durable evidence that local data is queued. For an unlinked create, a marker or create-attempt alone does not prove the remote POST failed. | Keep queued; do not clear it or retry a possibly completed create until permanent-ID recovery checks resolve the outcome. |
| Ambiguous divergence | Local mapped values differ from the saved snapshot, or import provenance is absent, or a marker is absent without corroborating evidence. | Review local snapshot, source import evidence, and current remote row by permanent ID. Do not infer direction or set a marker automatically. |
| Missing permanent ID | Sheet ID or row ID is absent/invalid, with no authoritative matching evidence. | Flag for review. Search only a complete remote sheet read and other durable evidence; never match by row position or names alone. |
| Duplicate permanent identity | More than one Base44 Order claims the same sheet ID + row ID, including a soft-deleted record. | Flag every claimant. Do not choose the active row automatically, overwrite, delete, or push until ownership is resolved. |
| Duplicate import key | Multiple active Orders share the legacy importer key, even with distinct permanent Smartsheet IDs. | Treat the import target as ambiguous. A repeated key is not proof the Orders are duplicates; do not merge or overwrite based on that key. |

For historical rows, a missing marker means only that the field was absent or not written. It is neither proof of sync nor proof of unsynced state. A marker set to false does not prove the remote row still matches. A missing marker can be classified as already synced only after the permanent-ID ownership, snapshot, and current remote checks above all pass.

## Synthetic decision fixtures

- Unique permanent row ID + timestamped snapshot + matching local values + complete current remote read that agrees + no true pending marker → already synced at verification time.
- Same fixture but `smartsheet_pending_local_sync: true` → queued/unsynced, even if the snapshot matches; preserve the queue until safe sync completion.
- Local value differs from snapshot and no current remote read is available → ambiguous divergence, not automatically unsynced.
- Missing row ID or a create attempt without a conclusively reconciled permanent ID → ambiguous; do not repeat the create POST.
- Two Base44 records claim the same permanent sheet/row ID → duplicate-identity review, regardless of active/deleted flags.
- Two active rows share customer, description, and request type but have distinct permanent row IDs → possible repeated orders and an ambiguous legacy import target, not a confirmed duplicate.

## Result and next safe step

This audit does not support a bulk marker repair. No records can be certified as currently synced from Base44 snapshots alone. Before any repair or write, prepare a bounded review set that resolves duplicate permanent-ID ownership and duplicate legacy import targets, then compare only uniquely owned permanent row IDs against a complete read-only Smartsheet response. Keep the one no-ID soft-deleted record and all ambiguous groups flagged for review. The current `push_enabled: false` setting was left unchanged.

## Import matching prevention verified (2026-10-22)

Started from clean Git HEAD `a841b08a7a5fa58311ac2c0940555869a784a41b`. This phase changes only Order import matching, its completion warning, synthetic tests, and this Order Form report.

- `base44/shared/orderImportMatching.mjs` retains all active claimants instead of choosing the last returned match. Repeated matching source rows are held before that identity's first write. Unique job-scoped matches remain eligible.
- The backend reports matching conflicts through its existing conflict count and bounded issue list. The Order Form warning uses "import conflicts" and shows explanations for the first three valid issue entries after authoritative reload.
- Eleven synthetic scenarios execute the real backend handler with in-memory entities: ambiguous existing matches, job scope, unchanged values and Trash preservation, repeated source rows, default Other type, case/whitespace, delimiter collisions, new creates, unique concurrent reuse, ambiguous create preflight, and permission enforcement.
- Five targeted Order import regression scripts pass. Backend esbuild bundle, production Vite build, targeted ESLint (no errors; existing unused-variable warnings), and Git diff whitespace checks pass.
- No production Order, configuration, or Smartsheet records were changed during testing. No publish was performed.

This prevents the confirmed known-match overwrite. It does not reconcile historical records or establish durable global uniqueness across concurrent imports; the existing per-record conditional-write and uncertain-create protections remain in place. Repeated source rows require review, including legitimate repeated orders, because this workbook format supplies no authoritative per-row identity to distinguish them.

## Order Save & Sync batch bound verified (2026-10-22)

Started from clean Git HEAD `cf6b675bd36307810643389c1364242fd6ab1954`. Explicit Order Save & Sync now sends at most 25 Orders per click. The backend independently enforces that cap before coordinator acquisition or Smartsheet writes, while respecting a smaller configured shared limit. Shared configuration and other dataset consumers remain unchanged.

- Untouched Orders retain their durable pending markers and remain in the browser queue. Completion and partial-result messages include all remaining queued Orders, including those outside the attempted batch.
- A typed lower-limit response is accepted only with explicit failure, a valid limit, and `smartsheet_writes_attempted: false`. The browser learns that limit for the next user click; it never automatically replays the rejected batch.
- The new regression script executes actual backend action, client, and UI sync code with synthetic fixtures. Its ten scenarios cover cap parity, preservation of other consumers, pre-write rejection, strict error validation, 60 Orders across three clicks, lost acknowledgments, partial completion, newer local revisions, smaller server settings, and same-tick repeated clicks.
- Nine targeted Order sync regression scripts pass. Targeted ESLint reports no errors and seven existing unused-variable warnings. The backend esbuild bundle passes with runtime imports externalized, the production Vite build passes, and Git diff whitespace checks pass. Browser compatibility database age notices remain nonblocking.
- No production Order, configuration, or Smartsheet records were changed during testing. No publish was performed.

Remaining release work: complete authenticated desktop/mobile acceptance and verify a controlled Smartsheet round trip using an explicitly authorized safe record. Historical remote comparison and duplicate-claim review remain outstanding; no bulk marker repair is supported.
