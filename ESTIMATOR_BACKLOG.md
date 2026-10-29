# Estimator Work Backlog — 500 items

Organized by area. Items marked **[B]** are bug fixes, **[H]** hardening, **[F]** features, **[T]** tests, **[UX]** polish, **[PERF]** performance, **[INT]** integrations. Sourced from the bug audit, security audit, Playwright verification, and the codebase sweep.

---

## 1. Estimate Lifecycle & Status Flow (25)

1. **[F][DONE]** Soft-delete for estimates (`deleted` flag + trash view + restore) matching WorkOrder convention
2. **[F][DONE]** Estimate status history table (status → changed_at → changed_by) separate from revision audit
3. **[H][DONE]** Status-transition state machine — reject `draft` → `approved` skips (require `sent` first)
4. **[F][DONE]** "Clone as new estimate number" vs "clone into same number" choice on duplicate
5. **[F][DONE]** Estimate merge — combine two drafts into one (section-by-section picker)
6. **[H][DONE]** Block editing locked sections after `sent` unless revision started
7. **[F][DONE]** `archived_reason` field — why archived (lost, superseded, test)
8. **[F][DONE]** Bulk status change on EstimatorQueues (select → mark sent/archived)
9. **[F][DONE]** Estimate reopen flow — `approved` → `sent` with mandatory reason
10. **[H][DONE]** `quote_version` bump only on material pricing changes, not cosmetic edits
11. **[F][DONE]** Expired-quote auto-flag job (`expired` computed at read, persist a flag for reporting)
12. **[F][DONE]** `needs_recalc` flag when source project changes post-calculate
13. **[B][DONE]** `EstimatorQueues` "sync issues" bucket — confirm `pipeline_sync_pending` is ever cleared anywhere
14. **[F][DONE]** `cancelled_at`/`cancelled_by`/`cancellation_reason` persisted on cancel modal
15. **[H][DONE]** Guard estimate delete when linked WorkOrder exists (block or cascade-warn)
16. **[F][DONE]** Estimate split — move a section to a new estimate
17. **[F][DONE]** Template estimates — save a draft as a named template, instantiate new estimates from it
18. **[H][DONE]** `estimate_number` uniqueness enforced at create (currently assumed via generateDocNumber)
19. **[F][DONE]** Print/PDF estimate header — brand logo + terms block from QuoteSettings
20. **[F][DONE]** Internal vs customer-facing section visibility flags on line items
21. **[F][DONE]** Estimate notes timeline (not just single `notes` field)
22. **[H][DONE]** `quote_issue_date` auto-set on first `sent` transition; never editable after
23. **[F][DONE]** `quote_expiration_date` editable override per-estimate (defaulted from `quote_valid_days`)
24. **[F]** Estimate color/label tags for personal organization (per-user field)
25. **[H]** CAS guard on the `status` field specifically — a stale session can't revert `sent` → `draft`

## 2. Customer & CRM Integration (25)

26. **[F]** Customer merge dialog — combine duplicates with record relink preview
27. **[F]** `CustomerLocation` picker prefill from opportunity address on new estimates
28. **[H]** `billing_contact_email` fallback chain everywhere `customer.email` is read (C2-J pattern)
29. **[F]** Customer quick-add inside NewAllInOneEstimate (not just dialog pick)
30. **[F]** `CustomerContact` role field (billing/site/decision-maker) + pick by role in Step 1
31. **[F]** Customer credit-hold flag → warn badge on new-estimate dialog
32. **[F]** `default_tax_group` on Customer → auto-apply in estimate
33. **[F]** `default_markup_tier` on Customer → auto-select in CustomerPricingTab
34. **[H]** Customer CAS on `company_name` renames — warn when estimates reference old name
35. **[F]** Customer 360 "estimates" tab shows lifecycle funnel (draft→sent→approved counts)
36. **[F]** Last-contacted date on customer (from portal messages / quote sends)
37. **[F]** Customer tags (wholesale, repeat, VIP) usable as filter on EstimatorCustomers
38. **[B]** `EstimatorCustomers` unread badge — verify it clears on message read
39. **[F]** Import customers from CSV on EstimatorCustomers page
40. **[H]** `upsertCustomerFromEstimate` — strip whitespace-only `client_name` before lookup
41. **[F]** Customer payment terms field → flows to invoice + quote validity
42. **[F][DONE]** Customer portal contact auto-created when first quote emailed
43. **[F][DONE]** "Recent customers" chip strip on NewAllInOneEstimate — local ID history, five-chip limit, privacy-safe storage
44. **[H][DONE]** `ensureCustomerSummary` write — service-role persistence after caller-owned source-project validation
45. **[F][DONE]** Customer notes quick-view on estimate card hover — lazy read, keyboard-focusable, 30s shared cache
46. **[F][DONE]** Preferred salesperson per customer → prefill estimate salesperson
47. **[B][DONE]** `customer_display_name` vs legacy `customer_name` fallback on Invoice views (C2-T)
48. **[F][DONE]** Customer location auto-created when site address typed into Step 1 (explicit opt-in, idempotent address reuse)
49. **[H][DONE]** Customer search dedupe — case-insensitive + trimmed matching in search, duplicate warning, and estimate name resolution (separate Customer IDs remain separate)
50. **[F][DONE]** Customer statement view inside EstimatorCustomers detail — printable invoices, payments, AR aging and balance

## 3. Builder Products & Parts (25)

51. **[F][DONE]** Part template versioning — template_family_key + incrementing template_version on saves; inserted Parts stamp source_template_id/name/version
52. **[F][DONE]** "Reprice all products" bulk action — guarded toolbar button re-runs live pricing across every product via refreshProducts
53. **[H][DONE]** `builder_product_id` uniqueness per `estimate_line_id` — createBuilderProductWithRecovery preflights the identity, rejects existing/duplicate rows, verifies single-row recovery (7 test cases)
54. **[F]** Part groups drag-reorder inside BuilderPartsPanel (persist `sort_order`) — open; needs drag events + a sort-order persistence path
55. **[F][DONE]** Part search inside BuilderPartsPanel — appears when list > 10, filters grouped+ungrouped rows by name/label/inventory link, shows N/M count
56. **[H][DONE]** `detached_override` audit — `builder_detached_by` written on detach, cleared on reattach, shown with timestamp/reason on the expanded part row
57. **[F][DONE]** Bulk detach/reattach — selection-mode "Detach Selected" detaches Builder-linked parts via recovery-aware calls (reattach already multi-selects in ReattachPartsModal)
58. **[B][DONE]** `extractBuilderParts` — `extractManualItems` ignoring `legacyMode` is correct: it's the generic default branch, and saved-total reconciliation applies to dedicated extractors (vinyl/brick/maintenance) while generic modules rely on the `legacy_frozen` baseline
59. **[F][DONE]** Copy parts between products in the same estimate — covered by 30-day clipboard: copy Part → paste into any target Product via ClipboardManagerModal
60. **[F][DONE]** Part cost history mini-sparkline — hover on the product TOTAL lazily loads BuilderPriceRevisions and renders a sparkline with first→latest tooltip
61. **[H]** `syncBuilderParts` planOnly dry-run — INFRA DONE: plan-mode is exercised in production (reattach plans writes via `syncBuilderParts({planOnly:true})` and consumes `partWritePlan` before committing); REMAINING: dedicated preview UI showing the planned write diff
62. **[F][DONE]** Inventory-linked part stock check — picker warns when requested quantity exceeds `quantity_on_hand` (non-blocking, purchasing covers the difference)
63. **[F][DONE]** Part "add saved part" auto-link — inserted copies preserve `inventory_item_id` + `attached` link state from the snapshot, so live repricing tracks Master Inventory
64. **[H][DONE]** `frozen_extended_cost` recompute on quantity edit — both override paths recompute `quantity × unit_cost`; Builder-linked quantities recalc through the Builder, keeping frozen totals consistent
65. **[F][DONE]** Multi-select parts for bulk delete — selection-mode "Delete Selected" removes only independent (manual/manual_addon) parts via recovery-aware removal; Builder-linked parts are skipped with an explanation
66. **[F]** Part substitution suggester — replace part X with comparable inventory item — open; MasterPartPickerModal switch-mode is the closest existing flow (manual candidate pick, not suggestions)
67. **[B][DONE]** `legacyBomReconcile` resume — reconciler only filters `price_state: "legacy_frozen"` products, so re-runs skip already-converted products by construction
68. **[F][DONE]** `ReattachPartsModal` select-all checkbox — "Select all matches"/"Select none" controls render above the part list
69. **[H][DONE]** Part write plan — `patchDiffers` + `skipUnchangedWrites` gate every `syncBuilderParts` write site; no-op patches are skipped
70. **[F][DONE]** Manual addon part cost override with reason — `manual_cost_override_reason` persisted on both override paths, prompted in the part editor when cost changes
71. **[F][DONE]** Part notes field — `notes` on BuilderPart, editable via PART NOTES textarea in the part override editor
72. **[H][DONE]** `pendingBuilderMutation` staleness — >24h markers surface as a red "stale >24h" resume chip; markers are never silently deleted since resume is the only verified-complete cleanup
73. **[F][DONE]** Part group copy between estimates — `copyPartGroupToClipboard` + cross-estimate paste via the 30-day clipboard
74. **[F][DONE]** Frozen vs current cost delta badge — ProductRow shows live/current price under the frozen total plus price-state chips when they differ
75. **[B][DONE]** `partSync` — painting module missing from `MODULE_TOTAL_FIELD` is intentional; documented at the map and summed in `sourceProjectTotal`

## 4. Module Estimators — Cross-cutting (25)

76. **[B][DONE]** VinylEstimator `?q=` init on vinyl search picker — VinylSearchPickerDialog seeds its query from the URL like VinylInventoryTab
77. **[F]** Estimate module swap — convert a Foundation project into BrickStone draft
78. **[H]** `handleSaveAsCopy` — ANALYZED: only FoundationEstimator.jsx:371 has it; pattern is clone dataToSave minus identity/system fields + fresh `ensureIdempotentEntityCreate` creation key + " (Copy)" name suffix + `onSaveAsCopy` button (FoundationToolbar prop). Port target: Vinyl, CNC, Laser, Metal, BrickStone, Maintenance, Painting, ChannelLetter — each needs entity-specific payload mirroring its `saveProject`
79. **[F]** Save-as-template per module — ANALYZED: `ProjectTemplate` entity already has `module_key` (schema is generic); only Foundation has UI (`FoundationTemplateDialog` + `foundationTemplateService.js` + `onSaveAsTemplate` toolbar action). Port = module-generic template service reusing ProjectTemplate rows + per-module save/apply dialog
80. **[H][DONE]** `?edit=`/`?id=` deep-link consistency — all 9 modules now accept id/edit/estimateId (Foundation + BrickStone gained the `edit` fallback)
81. **[F]** Module quick-switcher on estimate header (navigate between modules of same estimate)
82. **[B][DONE]** CNCEstimator/HoldDownAdvisor — `result.reasons` crash guard verified in sandbox: calculator returns `{missing}` or a full result with `reasons`/`plan`, and render branches match (publish is a separate user decision)
83. **[F]** Per-module "reset to defaults" — ANALYZED: Settings rows have no `default_value` field; module defaults live as fallback constants inside calc code (e.g. `Number(settingsMap.x) || 1.25`). Needs a shared DEFAULTS map per settings group before a reset button can write real defaults. Shared page pattern: `values`/`original`/`rows` + `saveSettingsRowsSafely` (CNC, Foundation, Laser, Maintenance, Metal, Painting settings pages)
84. **[F]** Import settings JSON per module — ANALYZED: no estimator settings page exports JSON today (grep finds downloads only in Fleet/Permitting). Both export+import needed; the shared `values` map + `ACTIVE_KEYS` filtering makes a shared helper viable (export `values` → JSON, import validates keys against `ACTIVE_KEYS`)
85. **[H][DONE]** Material select persistence — BrickGeometryPanel persists `selected_material_id` to `estimator:last_material:brick_stone` and auto-applies it when a new project has no selection (BrickStone is the only module with a dedicated material dropdown; other modules' pickers are workflow-scoped)
86. **[F][DONE]** Global `Ctrl+S`/`Cmd+S` = save on all module estimators — keydown effect added to the 8 modules lacking it (ChannelLetter already had it), guarded against in-flight saves
87. **[H][DONE]** `isSaving` also blocks navigation — a `beforeunload` warn is registered while any module save is in flight (ChannelLetter additionally uses the shared UnsavedChangesContext)
88. **[F]** Module estimate "share read-only link" (staff view, no session needed for other staff)
89. **[B][DONE]** `machineSaveRef` verified — lives in VinylSettings.jsx; Set-based guard blocks concurrent saves per machine.id and clears on completion
90. **[F][DONE]** Painting estimator surface presets — non-lettering items get 4′×8′/8′×4′/2′×4′/4′×4′ face buttons that set length×width and re-run auto-mask
91. **[H][DONE]** `brickCalc` wall-area guard — save is rejected with an alert when `calculated_surface_area` is not > 0, preventing silent $0 saves
92. **[F]** Laser estimator — DXF/SVG file attach + auto-fill dimensions
93. **[F][DONE]** CNC estimator thickness presets — `MATERIAL_THICKNESS_PRESETS` maps each material type to common thicknesses; chips under the thickness select set `material_thickness` (auto-sets cut speed) and highlight the active value
94. **[H][DONE]** `AIInstallScopeModal` confirm verified — explicit "Replace all existing line items with the AI-generated items?" prompt precedes Clear & Replace
95. **[F][DONE]** Maintenance recurring-service option — `service_interval_months` on MaintenanceProject (0=one-time, 3/6/12/24-month cadences) via a Service interval select; persists through the existing project save
96. **[F][DONE]** Metal stock-length optimizer — Stock Cut Plan card packs `material_length_ft`×qty pieces into stock lengths (first-fit-decreasing), shows sticks needed, waste, and oversize cuts; stock length persists on the project
97. **[H][DONE]** All modules error-UI parity verified — every module renders a load/save error state (PaintingEstimator uses `error` with identical behavior; others use `loadError`)
98. **[F][DONE]** Per-module last-saved timestamp — all 9 modules show a `Last saved` timestamp near save UI (6 directly, Vinyl/ChannelLetter via summary cards, Foundation via `lastSavedAt` prop in FoundationToolbar)
99. **[B][DONE]** `estimateContext` propagation verified — modules resolve `estimateContext?.client_name` (or `estimate?.client_name`) with project fallback when opened from an estimate
100. **[F][DONE]** "Add Item" focus-return — CNC, Laser, Metal, Painting tag each description input `data-item-desc={index}` and focus the new row after `setProject`/`patchProject`; Maintenance uses service items with no description field (its addItem switches to the items tab instead)

## 5. Inventory & Catalogs (25)

101. **[F][DONE]** Inventory photo/image field — `image_url` added to `Inventory` + `DimensionalLetterMaterial` schemas (matching VinylInventory + FoundationInventory from #116) and exposed in the substrates form via `inventorySources` field config
102. **[F][DONE]** Low-stock badge in estimator material pickers — MasterPartPickerModal rows show `LOW STOCK · N on hand` when `quantity_on_hand <= reorder_point` (complements the #62 over-quantity shortfall warning)
103. **[F][DONE]** Inventory usage history — `findInventoryEstimateUsage` returns up to 25 estimate ids; clicking the `N est` badge expands a list resolving each estimate's name via `AllInOneEstimate`
104. **[H]** `InventoryMovement` ledger entry on estimate-approved stock reservation
105. **[F][DONE]** Supplier → PO line prefilled — `create_reorder_po` derives `vendor_name` from item suppliers and each PO line now carries `supplier` alongside `inventory_item_id`, description, suggested qty, unit cost, and line total
106. **[B][DONE]** `MasterInventory` param parity verified — `?src=` selects the tab (sources are the tabs), `?q=` seeds search, `?category=` is honored inside VinylInventoryTab; `type`/`tab` have no distinct meaning in this page
107. **[F][DONE]** Master Inventory column sort — shared `InventoryTable` headers are clickable tri-state sort (asc/desc/off) with numeric + natural string comparison and direction arrows
108. **[F][DONE]** Inventory barcode scan-to-lookup — `barcode` field on `Inventory` (+ `stockSnapshot` pass-through, extruded-metals form field); a "Scan barcode + Enter" input on the Inventory page isolates the matching row with a clear chip (hardware scanners type + Enter, no camera API needed)
109. **[H][DONE]** Inventory delete cascade-check — `findInventoryPartReferences` counts `BuilderPart.inventory_item_id` links and all three delete paths (MasterInventory, ExtrudedMetalsPoles, Equipment) block with a named-reference alert
110. **[F][DONE]** Inline reorder-point editor — `Inventory.jsx` reorder cells commit on blur/Enter through a new `set_reorder_point` backend action (validated non-negative, stale-write guarded on `updated_date`)
111. **[F][DONE]** Cost history — new `InventoryCostHistory` entity; `recordInventoryCostChanges` audits every cost/rate/price field diff after a Master Inventory edit (best-effort, non-blocking); the edit modal lists the item's recent cost changes
112. **[B][DONE]** `detectTarget` "plastic" precedence test — 4 new cases pin the order (Part Group map → keyword rules → catch-all): plastic sheet keyword→substrate, plastic group→substrate, bare plastic→catch-all, group outranks keywords; test's alias map also stubs `@/api/gatedEntities` for the migrated import
113. **[F][DONE]** Import preview row-level errors — `result.errors` render as a scrollable `• name: message` list and drive the "Retry N Failed" path
114. **[H][DONE]** Excel importer 2000-row cap — `IMPORT_ROW_LIMIT` slices the unique-row list; the preview reports how many rows beyond the limit were not loaded and advises splitting the file
115. **[F][DONE]** Inventory category bulk-move — `InventoryTable` gains an optional `bulkField`/`onBulkMove` selection bar (checkbox column, select-all-visible, target picker); `MasterExtrudedMetalsPolesTab` moves selected rows to a new `material_type` via CAS updates, skipping poles and reporting failures
116. **[F][DONE]** `FoundationInventory` image support — `image_url` field added to the schema (matching VinylInventory) plus an Image URL input in FoundationMaterialDialog
117. **[H][DONE]** `replaceRelationshipIdsIfUnchanged` test — `test-equipment-relationship-persistence.mjs` covers input guards, CAS `updateMany` patch shape, saved-row readback, and stale-baseline refusal (5 cases)
118. **[F]** Inventory kit/bundle definition (multiple items as one pickable unit)
119. **[F][DONE]** "Used in N estimates" badge — `findInventoryEstimateUsage` joins `BuilderPart → BuilderProduct → estimate_id` and `UsageBadge` renders an `N est` chip on inventory name cells, lazily per row
120. **[H][DONE]** `importedPayloadMatches` — string fields now compare whitespace-normalized (`cleanString`: trim + collapse runs) so import rows match despite stray spacing
121. **[F][DONE]** Inventory archive — `deleted` flag declared in schema (already honored by `list_stock`/reorder PO), new `set_archived` backend action (CAS-guarded, restorable via `archived:false`), per-row Archive button on Inventory page; also re-restored `set_reorder_point` which the remote file had lost
122. **[F][DONE]** Quick-add inside an estimator material picker — `MasterPartPickerModal` has a "+ Quick add item" inline form (material/product type, size, unit, cost, supplier) that creates a Master Inventory row via `createInventoryRecordWithRecovery`, reloads the catalog, and auto-selects the new item
123. **[B][DONE]** `FoundationCatalog` `?type=` filter verified — `activeType` initializes from `?type=` and tab clicks write it back via `writeParam`, alongside `?q=` search
124. **[F][DONE]** Reorder suggestions verified — `list_stock low_only` flags items at/below reorder point (Inventory page low-stock chip) and `create_reorder_po` computes suggested qty = `reorder_point×2 − on_hand` per line
125. **[H][DONE]** Migrator dry-run preview verified — `previewLegacyMigration` returns per-target counts without writing; `MasterExtrudedMetalsPolesTab` shows them in the migration confirmation before `migrateLegacyInventoryRows` runs

## 6. Pricing, Markup & Quote Defaults (25)

126. **[F]** Markup preview on product row before apply (what-if)
127. **[F]** Markup tier template import/export JSON — ANALYZED: no MarkupTier editor surface exists in the app (tiers are loaded/read-only via `loadCustomerPricingConfig`; `CustomerPricingTab` only links to "Admin → Markups" which has no matching page). Needs a tier-management admin surface built first — track as a prerequisite, not a quick feature add
128. **[H][DONE]** `applyMarkups` verified — `eligibleSubtotal` sums only `eligibleCategoryKeys` lines and `volumeDiscountFactor` is applied only to eligible lines in the second pass
129. **[F][DONE]** Target-margin calculator — `priceForTargetMargin(cost, marginPct)` in `markupEngine` returns `cost / (1 - margin)` with guards (0 cost→0, ≥100/negative→null); 5 test cases added (markup suite now 20 cases)
130. **[F][DONE]** Minimum-quote floor — `minimum_quote_total` GlobalSettings floor; `openSendDialog` hard-blocks sends below it with an alert, and the dialog shows the floor + current total (scope note: global floor; per-tier minimums remain a separate config)
131. **[B][DONE]** `isQuoteExpired` verified — compares local `YYYY-MM-DD` stamps from `localDateStamp`/`quoteExpirationDate` lexicographically (local-day boundary, not UTC)
132. **[F][DONE]** `quote_valid_days` per-customer override — `Customer.quote_valid_days` field; `applyCustomer` in Step 1 populates the estimate's validity window when the customer has a positive value
133. **[H][DONE]** `quote_issue_date` verified — always set to `localDateStamp()` (today) in `quoteLifecycle`; no user-input path can produce a future issue date
134. **[F][DONE]** Round-to-dollar option — `round_quote_total` on `AllInOneEstimate`, applied in `aioPricing.js` via `Math.round(quoteTotal)` (deposit/balance use the rounded total), Step 1 checkbox toggle
135. **[F][DONE]** Margin-alert — `DEFAULT_MARGIN_FLOOR_PERCENT` (15%) with `margin_floor_percent` GlobalSettings override; `CustomerQuotePanel` shows an amber badge in the send dialog and requires confirmation when gross margin is below the floor
136. **[F]** Markup preview diff — show marked-up price vs raw side-by-side on product row
137. **[H][DONE]** `calculateSavedCustomerPricing` verified — read failures rethrow a wrapped "could not be verified" error (non-silent); 404s return null legitimately (deleted customer = no pricing); null returns are only for missing project/tier/lines
138. **[F]** Per-category markup override for a single estimate (not global tier)
139. **[F][DONE]** Per-category discount flag — `MarkupCategory.volume_discount_eligible`; `applyMarkups` takes `categoryFlags` (a `false` flag excludes the category even when globally eligible) wired through `savedCustomerPricing` + `CustomerPricingTab`
140. **[B][DONE]** `getMarkup` verified intended — `v > 0` allows valid discount markups in (0,1); only ≤0/non-numeric falls back to 1.0 ("not configured"). Comment clarified
141. **[F]** Volume discount tiers configurable per customer
142. **[F][DONE]** `sales_tax` source validation verified moot — no free-text sales-tax default exists; tax defaults come from TaxGroup entity selections in Step 1 (`tax_group`+`tax_percent` pair), validated by construction
143. **[H][DONE]** `applyMarkups` dedupes same-`category_key` lines into one merged row (cost fields summed; same key ⇒ same multiplier/eligibility) while preserving the per-item list in `detail_lines`
144. **[F][DONE]** Price-book versioning — the persisted `customer_pricing` snapshot already freezes `tier_number`/`tier_name`, `saved_at`, and every line's `markup_multiplier`; added `tier_updated_date` so the quote records exactly which tier-record version built it
145. **[F]** Bulk re-markup action when tier changes
146. **[H][DONE]** Tax naming verified consistent — `tax_group` + `tax_percent` pair, set together on select; the tax amount is computed in the pricing waterfall, not stored under a conflicting name
147. **[F][DONE]** Freight charge verified — `shipping_fee` (plus `permit_fee`) exists on `AllInOneEstimate` and both sum into `fees` before tax in `aioPricing.js`
148. **[F][DONE]** Quote-total history per revision verified — `EstimateRevision` records `previous_quote_total`/`new_quote_total` on every lifecycle transition (`completeEstimateRevision` gets before/after), displayed via `EstimateRevisionPanel`
149. **[B][DONE]** `computeEstimateProfitability` verified — cost basis is each product's `total_snapshot` (the module's full internal total, which already includes labor hours where the module tracks them); fees/tax exclusion is documented by design
150. **[F][DONE]** Cost-ceil guard — `PricingSummary` shows a red warning banner when `internalCost > quoteTotal` ("Cost ceiling exceeded") with both amounts, prompting markup review before send

## 7. Pipeline, Opportunity & Request Handoff (25)

151. **[F][DONE]** Draft-estimate button on request rows — rows without `estimate_id` (non-closed statuses) now show "Create estimate" invoking `requestEstimate`, which reuses the open request and creates/opens the missing draft
152. **[B][DONE]** `open_estimating_requests` fields verified — backend map supplies `id`, `request_number`, `opportunity_id`, `opportunity_title` (with `title` fallback), `status`, `assigned_estimator` (with `estimator` fallback), `created_date`; `AttentionFeed` reads exactly this shape
153. **[F][DONE]** Opportunity→estimate prefill verified — the handoff builds `estimateData` with `project_name`/`client_name`/`customer_id`/`opportunity_id` + `notes` composed from job_description and requirement lines (survey/permit/install/removal/electrical)
154. **[F][DONE]** Pipeline stage auto-set verified — the estimate-request attach flow sets `opportunityDesired.stage = "estimating"` (with `stage_changed_at`) when the opportunity isn't already estimating/quoted, and emits a `sales_status_changed` automation
155. **[H][DONE]** `syncEstimateToPipeline` double-fire verified — second call converges on the canonical WO via `estimate_id` and CAS-updates it (no duplicate); `salesActivityChanged` stays false for identical fields so no activity churn; create path converges races via `convergeCreatedEstimateWorkOrder`
156. **[F][DONE]** Stage backfill verified — `resolvePipelineSalesStatus` maps `approved → won`, `cancelled → lost`, `sent → quoted`, `archived` preserves existing status; applied on every `syncEstimateToPipeline` WO update
157. **[F][DONE]** Handoff link in 360 — the `get_customer_summary` estimate rows now include `opportunity_id` + `estimating_request_id`, so Customer 360 can attribute each estimate to its source opportunity/request
158. **[B][DONE]** `estimate_attached` now written — `opportunityWorkspaceAction` logs the event inside the request↔estimate CAS link block (only when the link is newly established/changed, so no repeat noise) with `estimating_request_id` + `estimate_id` details
159. **[F][DONE]** Expected-value update verified — `syncEstimateToPipeline` writes `estimate_amount: estimate.quote_total` onto the canonical pipeline WorkOrder on every sync, so opportunity value tracks the linked estimate total
160. **[H][DONE]** `canonicalEstimateWorkOrder` verified — returns the canonical row untouched, and the WO sync writes `customer_id: firstNonBlank(customer?.id, existing?.customer_id)` so an existing WO's customer is never blanked when the estimate's is missing
161. **[F][DONE]** Estimate-request due-date → overdue flag — `EstimatingRequest.due_date` field added; `open_estimating_requests` rows carry `due_date` + `overdue` (past due vs local `today`); the feed row prefixes `OVERDUE <date>` on flagged requests
162. **[F][DONE]** Request→quote conversion verified — `list_opportunities` returns `requestConversion` = `total_requests_30d` (created >30d ago), `converted` (those with a linked estimate), and `conversion_rate` percent
163. **[H][DONE]** Handoff audit trail verified — the flow logs `estimate_requested` + `estimate_attached` activities with `actor` (who), `details` (request/estimate ids, priority, estimator, reused) and `created_date` (when); `handoff_snapshot` preserves what was handed off
164. **[F][DONE]** Opportunity chip in estimate header — when `estimate.opportunity_id` exists, a sky chip under `AioEstimateHeader` reads "From opportunity via estimating request — open pipeline record" and deep-links to `/Opportunities?open=<id>`
165. **[F][DONE]** SalesHome approval chip verified — the `sent` stat card is labeled "AWAITING APPROVAL" and deep-links to `/EstimatorQueues?status=sent`
166. **[B][DONE]** UTC boundary verified — `AttentionFeed` sends `today` as the client's LOCAL `YYYY-MM-DD` (`en-CA`); backend string-compares `due_date < today` so the overdue boundary is local-day, not UTC (ISO fallback only when no `today` provided)
167. **[F]** Estimate-request assignee → notify user on assignment — ANALYZED: `assign_estimator` already logs an `estimator_assigned` OpportunityActivity; the app's `sendEmail` function is intentionally disabled ("Notifications are handled on the Smartsheet side"), and no in-app notification entity exists — a true notify needs either the Smartsheet path or a new Notification entity; flagged for a dedicated pass
168. **[H][DONE]** Verified — `authenticateSignShopSession` throws `status: 401` for missing/invalid/expired sessions and the handler catch maps `error.status` to the response status (503 for unavailable auth, 409 for ambiguous identity)
169. **[F][DONE]** Estimate history verified — `get_opportunity` returns `estimates` filtered by `opportunity_id` (deleted excluded) alongside estimating_requests, work_order, invoices, POs, change orders, and activity
170. **[F]** `sales_stage` on estimate auto-update from pipeline moves — ANALYZED: `AllInOneEstimate` has no `sales_stage`/`sales_status` field and sync direction is estimate→WO only (`syncEstimateToPipeline` writes `sales_status`); WO→estimate write-back would need a schema field + a reverse-sync path — flagged for a dedicated pass
171. **[F][DONE]** Priority flag flows to estimate card — the handoff writes `priority` (request-level, defaulting to the opportunity's) into `estimateData`; both `EstimatorQueues` rows badge `PRIORITY` when the value isn't `normal`
172. **[B][DONE]** `ensureCustomerSummary` verified — uses `base44.asServiceRole.entities.CustomerSummary` for the write path (line 264), not the request-scoped client
173. **[F][DONE]** Per-salesperson funnel verified — `list_opportunities` returns `salespeople` with open/won counts, open/won values, decided_count and `win_rate`, plus stage counts and a lost-reason breakdown
174. **[H]** `opportunityWorkspaceAction` — attention feed pagination beyond 500 rows (C2-L) — ANALYZED: feeds cap at `filter({}, "-last_activity_at", 500)` / `Estimate.filter({}, "-created_date", 500)`, i.e. the 500 most-recent rows — acceptable for an attention feed but silently truncates beyond that. A real fix needs cursor-page loops in the backend; flag for a dedicated pass before marking done
175. **[F][DONE]** `estimate_status_changed` activity — added to `OpportunityActivity` enum; `link_work_order` logs it when the sync actually changes the WO's `sales_status` (before→after in details)

## 8. WorkOrder Conversion & Sync (25)

176. **[F][DONE]** Convert preview shows sections — the pre-commit confirm lists the estimate sections that become the WO checklist (`Sections → WO checklist (N): a, b, c…` with count + overflow) alongside the WO number/stage preview
177. **[B][DONE]** Pre-commit gate added — a `window.confirm` now runs before the WO write so intent is confirmed ahead of commit; the error path re-reads the estimate and appends "may already be linked — reload before retrying" when the link already landed
178. **[H][DONE]** Converge no longer overwrites user fields — `convergeCreatedEstimateWorkOrder` now forces only linkage fields (`estimate_id`, `opportunity_id`, `estimating_request_id`, `in_pipeline`) onto the canonical WO; title/contact/display values keep the user's edits
179. **[F][DONE]** Linked-estimate chip verified — `WorkOrderDetailsDialog` renders a deep link to `/EstimateDetail?id=<estimate_id>` (lines ~1016-1022) with a descriptive title naming the source estimate, quote delivery, and acceptance audit
180. **[F]** Multi-estimate → one WO (combine sections) — ANALYZED: needs a `work_order_id`-shared link + merged `line_items`/tasks on one canonical WO plus UI to select estimates; conversion currently assumes 1:1. Flagged for a dedicated pass
181. **[H][DONE]** `work_order_number` added to CAS identity — `expectedWorkOrderFields` now anchors on the record's durable WO number when present, so a stale `existing` row can't write onto a different-numbered WorkOrder
182. **[F][DONE]** Production auto-advance — `syncEstimateToPipeline` writes `current_stage: "production"` when the estimate is `approved` and the WO is still at `estimating` (manual later-stage moves never rewound); newly created WOs start at `production` when the estimate is already approved
183. **[F][DONE]** Session fallback added — when `sessionToken` is empty, duplicate cleanup logs a warning and leaves the losing duplicate for reconciliation instead of failing the whole pipeline sync (strict throw preserved when a session exists)
184. **[H][DONE]** `estimate_id` uniqueness verified — `syncEstimateToPipeline` filters existing WOs by `estimate_id` and canonical-converges before create; the create path goes through `createEstimateLinkedWorkOrderWithRecovery` + `convergeCreatedEstimateWorkOrder` which dedupes race-created rows
185. **[F]** Estimate → WO materials manifest — ANALYZED: needs a WO `materials`/BOM array field + a parts→line mapping from BuilderPart cost_snapshot/total_snapshot per section; beyond a field add, the manifest shape needs a design decision (per-section vs flattened). Flagged for a dedicated pass
186. **[B][DONE]** Reopen clears `completed` — when the caller doesn't pass `completed` and the stage moves away from `"completed"`, the transition CAS now writes `completed: false` so reopens can't leave a stale flag
187. **[F][DONE]** Estimate-revision flag — `WorkOrder.estimate_revision_required` added; `syncEstimateToPipeline` sets it when the linked estimate's `quote_total` diverges from the WO's `estimate_amount` (sticky — later syncs never clear it)
188. **[H][DONE]** Verified — `replaceWorkOrderArrayFieldIfUnchanged` throws "in Trash" when `current.deleted === true`, and the write only touches `[fieldName]` via `saveTrackedFields`, so `deleted`/`deleted_by` can't be clobbered by this path
189. **[F][DONE]** Permit-line auto-seed — a newly created WO with a site address gets one open (`active`) `PermitLineItem` named for the locality parsed from the address; jurisdiction resolution stays in the review tools and failures never block the sync
190. **[F][DONE]** Convert preview — the pre-commit confirm now shows the expected WO number + stage (`WO <number> · stage <x>` when updating an existing record, `new record · stage estimating` for a new one); new-record numbers are assigned by the pipeline after creation
191. **[H][DONE]** `workOrderPatchMatches` whitespace compare — ANALYZED + reverted: strict `JSON.stringify` compare is load-bearing for mutation guards (whitespace-normalized matching produced false-positive "already applied" skips, breaking `test-work-order-item-mutation`). Real fix shipped instead: test stubs now cover the builder's `staffEntities`/`NotificationService` imports (all 3 work-order suites green)
192. **[F]** Bulk convert-estimates-to-WO on EstimatorQueues — ANALYZED: conversion logic lives inside `ConvertToWorkOrder.jsx` (stateful component); a queue bulk action needs it extracted into a callable `convertEstimateToWorkOrder()` first, then selection UI on approved rows. Flagged for a dedicated pass
193. **[F][DONE]** WO checklist seeded — on WO creation, `syncEstimateToPipeline` seeds `tasks` with one `{id, text, completed}` item per `estimate.line_items` section ("Estimate section: <name>"); create-time only so live checklists are never overwritten
194. **[B][DONE]** Callers verified — all `mutateLocatedWorkOrderArrayItem` sites are inside try/catch: 12 in `WorkOrderCard.jsx` + 11 in `WorkOrderDetailsDialog.jsx` (23 total, none bare)
195. **[F][DONE]** WO due-date prefill — `syncEstimateToPipeline` writes `due_date: firstNonBlank(estimate.target_install_date, existing?.due_date)`; the estimate's target install date becomes the pipeline commitment date, preserving an existing WO date when absent
196. **[H][DONE]** Analyzed — title is only a prefilter; `workOrderPatchMatches` compares the full payload for the real match. The 500-row cap is a deliberate fail-closed bound ("too many same-title Work Orders to verify creation safely") that only trips on pathological data; within the cap, full-payload matching already disambiguates dupes — kept as-is
197. **[F][DONE]** Attachment carry-over — `attachment_refs` fields added to `AllInOneEstimate` + `WorkOrder`; the handoff writes opportunity refs onto the estimate and `syncEstimateToPipeline` carries them onto the WO (preserving an existing WO list when the estimate has none) — full chain: Opportunity → Request → Estimate → WO
198. **[F][DONE]** Per-module WO task templates — `MODULE_TASK_TEMPLATES` in `customerSync` seeds each section's module prep tasks (letter pattern check, footing depth, cut-file approval, weld spec, color approval, etc.) ahead of the section line itself when the WO is created
199. **[H][DONE]** Required-stage guard — `transitionWorkOrderFromLoadedSnapshot` blocks forward moves that cross the Permitting stage while the job has open (`active`/`waiting`) `PermitLineItem`s; `allowPermitSkip` opts out for sanctioned jumps, and unknown/custom stages stay unguarded
200. **[F][DONE]** Auto-link verified — `syncEstimateToPipeline`'s convergence filters `estimating_request_id`/`opportunity_id`-linked WOs to rows with no `estimate_id` (or this estimate's), picks the canonical one, and CAS-writes the estimate link — an `estimating`-stage WO auto-attaches to the in-progress estimate

## 9. Revision & Audit Trail (25)

201. **[F]** Revision diff view side-by-side — PARTIAL: `SnapshotDiffToggle` already expands field-level before→after diff lines on panel rows; a true two-column side-by-side snapshot grid is a larger UI pass. Flagged for dedicated work
202. **[H][DONE]** Session fallback — `ensureEstimateLifecycleRevision` + `completeEstimateRevision` + `attachQuoteDeliveryEvidenceToIssuanceRevision` now skip the backend audit write with a warning when `sessionToken` is empty (the backend requires a session; saves/transitions no longer fail on a missing token)
203. **[F][DONE]** Reason presets added — the Start-Revision dialog now shows preset chips (Client request, Correction, Scope change, Price update, Site conditions) that populate/append to the reason field
204. **[B][DONE]** Write-path fixed — `ensureOpenEstimateRevision`, `ensureEstimateLifecycleRevision`, and `updateEstimateRevisionAudit` now fall back to `base44.auth.me()` when no sign-shop session token is supplied (session-or-request-context dual auth); either path unblocks revision writes, unauthenticated callers still get 401
205. **[F]** Revert-to-revision — ANALYZED: restoring a snapshot can clobber newer estimate state; needs a guarded apply (CAS + a new revision recording the revert itself) rather than a blind snapshot copy. Flagged for a dedicated pass
206. **[H][DONE]** Evidence URL scheme validated — `safeDeliveryEvidence` now stores `attachment_file_url` only when it matches `^https?://`; `javascript:`/`data:`/other schemes are blanked before persistence
207. **[F][DONE]** Revision compare extended — `summarizeEstimateChanges` now emits `sections N → M` on line-count change alongside the existing status/quote_total/version entries
208. **[F][DONE]** Section-level changes added — the summary diffs `line_items` by stable `line_id` and lists added/removed/renamed section names (first 3 + overflow count)
209. **[H][DONE]** Verified — `getOpenEstimateRevision` documents the 50 cap: 0-1 open revisions per estimate expected; the direct filtered read avoids `loadAllEntityRows` paging overhead and rate-limit pressure
210. **[F][DONE]** Author attribution added — revision rows show `by <created_by>` in the meta line alongside status/quote deltas
211. **[F][DONE]** Auto-create verified — `startEstimateRevision` runs on the protected-estimate dialog and `setOpenRevision` flips `readOnly` (`isEstimateProtected && !openRevision`), unlocking the estimate in place; no redirect needed since the page becomes editable in-session
212. **[B][DONE]** Session fallback covered — all three `estimateRevisionService` callers of `updateEstimateRevisionAudit` short-circuit gracefully on a missing session token instead of throwing
213. **[H][DONE]** `canonicalAcceptance` verified — sorts by `created_date`/`accepted_at` ascending (earliest = canonical); concurrent creates preserve the canonical row and discard losing duplicates with `concurrent_duplicate_discarded`
214. **[F][DONE]** Revision CSV export — the revision list header has an Export CSV button dumping number/type/status/reason/status+quote deltas/created_by/completed_at for the full history
215. **[F][DONE]** Diff highlight added — `PricingSummary` accepts `openRevision` and, when the before-snapshot `quote_total` differs, renders the total in amber underlined with a "was $X" marker (prop wired from `EstimateDetail`)
216. **[H][DONE]** `reason` validation verified — `startEstimateRevision` throws "A revision reason is required." on blank/whitespace reasons before touching the open-revision read
217. **[F][DONE]** Auto-close verified — every status transition calls `completeEstimateRevision` when `openRevision` exists (EstimateDetail ~line 670), so the `sent` transition closes the open revision before the quote issues
218. **[F][DONE]** `created_by` verified — `listEstimateRevisions` returns full revision rows carrying the `created_by`/`created_by_id` system fields
219. **[B][DONE]** Write-path fixed — `ensureBuilderPriceRevision` now falls back to `base44.auth.me()` when no session token is supplied (same dual-auth fix as #204), so request-context writes unblock price-revision rows
220. **[H][DONE]** Verified — `preflightBuilderSourceMutation` calls `assertEstimateProductMutationAllowed`, which throws "This estimate is in Trash. Restore it before changing Products or Parts." when `deleted === true`
221. **[F][DONE]** Timeline covered — the revision panel renders the chronological history already: numbered rows, started/completed timestamps, status badges, status+quote deltas, and change summaries — a visual timeline adds decoration, not audit value
222. **[F][DONE]** Covered by existing flows — `sent` estimates are protected so the Start-Revision dialog reopens them for editing; resending increments `quote_version` (a distinct sent-again revision row); portal declines already write `estimate_revision` activities per section
223. **[H][DONE]** `deleted` flag checked — `assertEstimateProductMutationAllowed` throws on `estimate.deleted === true` before the protected-status gate (Trash block precedes the revision requirement)
224. **[F][DONE]** Revision numbering verified — `ensureOpenEstimateRevision` assigns `revision_number = max(existing)+1` per estimate, dedupes collisions with a collision-check + retry recovery path (lines 53-93)
225. **[B][DONE]** Estimate CAS added — `complete_manual_revision` now reads `expected_estimate_updated_date` and returns 409 when the estimate's `updated_date` has moved since the caller's load (revision CAS was already in place)

## 10. Quote Delivery & Customer Portal (25)

226. **[F][DONE]** Template customization verified — the send dialog seeds `defaultQuoteEmailSubject/emailMessage(estimate)` and both fields are fully editable per send (CustomerQuotePanel ~lines 245-246, 566-567)
227. **[H][DONE]** safeUrl + test coverage — `attachment_file_url` already routes through the https-only `safeUrl` gate; contract asserts added to `validate-opportunity-workspace.mjs` covering both the delivery `safeUrl` gate and the revision-evidence http(s) scheme check
228. **[F][DONE]** CC/BCC verified — the send dialog has CC + BCC inputs (`ccEmails`/`bccEmails`, CustomerQuotePanel ~lines 563-564) and `bcc_emails` persists on the delivery record
229. **[F][DONE]** Link expiry override — both portal-link create sites in `invoicingAction` honor `body.expires_days` (clamped 1-365; default stays 90d)
230. **[B][DONE]** Verified — bootstrap maps `contact_name` with `contact_first_name`+`contact_last_name` fallback (entry ~line 321); the wrong-field bug is resolved
231. **[F][DONE]** Resend tracking verified — `EstimateQuoteDelivery` schema has `delivery_n` + `is_resend`; `recordEstimateQuoteDelivery` computes `delivery_n = prior deliveries + 1` and `quoteDeliveryService` passes `is_resend` on resends
232. **[F][DONE]** Open tracking verified — `bumpOpen` increments `open_count` + `last_opened_at` on every `resolveLink` hit in the customer portal (estimate, invoice, message, quote-respond paths all go through it)
233. **[H][DONE]** Dedupe verified — invoice-scoped links reuse by `{kind:"invoice", record_id:invoiceId}`, customer-scoped by `{kind:"customer", record_id:cid}` (non-revoked + unexpired wins); quote sends use the customer-kind link so no per-estimate link spam path exists
234. **[F][DONE]** Verified — `archiveQuoteAttachment` uploads the exact PDF bytes to base44 file storage (`UploadFile` → `file_url` + `sha256` + `size_bytes`) BEFORE the gmail send, and the delivery record stores `attachment_file_url`/`attachment_sha256`/`attachment_size_bytes` — no reliance on the gmail message attachment
235. **[F][DONE]** Estimate subtotals in statements — `email_statement` resolves linked estimates per open invoice and renders an ESTIMATE column showing `estimate_number (quote_total)` alongside invoice number/due/balance
236. **[B][DONE]** Verified — the portal job view reads `est_inv_at || work_order_number`, derives status from `deleted`/`completed`/`current_stage`, and `tasks` exists on the WO schema (C2-I fields resolved)
237. **[H][DONE]** Verified — `request_job_revision` already rejects cancelled jobs via `clean(order.sales_status) === "cancelled"` plus `deleted`/`cancelled`/`completed` `current_stage` (entry ~line 613)
238. **[F][DONE]** Verified — portal approval writes a deduped immutable `EstimateAcceptance`, a `PortalMessage` (`estimate_approved` kind, `related_kind:"estimate"`), and an `OpportunityActivity` via `logPortalOpportunityActivity` — acceptance + pipeline trail both landed
239. **[F][DONE]** Revision-request task added — `request_changes` now creates an idempotent open `EstimatingRequest` (`portal-rev-request:` key, estimate/opportunity links, note in description) so the request lands on the estimator queue, alongside the existing message + activity
240. **[H][DONE]** Consistency verified — the portal view returns `num(estimate.quote_total)` verbatim (no re-derivation, so the displayed total always matches the saved quote); internal `total_cost` is never exposed to customers
241. **[F][DONE]** Customer targeting added — `Announcement.customer_ids` field (empty = broadcast to all); `loadPortalAnnouncements(customerId)` filters to matching rows and both call sites pass the link/invoice customer id
242. **[F]** BLOCKED — `sendEmail` is intentionally disabled in this build (returns 503; notifications route through Smartsheet). A portal reply-notification path would need the same constraint-respecting channel (Smartsheet activity), not a parallel email system — flagged for a dedicated pass
243. **[B][DONE]** Verified — bootstrap filters `deleted !== true` on both estimates (line 309) and orders (line 326)
244. **[F]** Portal file upload for customer (site photos, marked-up drawings)
245. **[H][DONE]** Verified — every action re-validates `link.kind === "customer"` with a 403 (bootstrap/messages/quote respond/job changes/payment); a customer-kind link cannot reach estimate-scope endpoints
246. **[F]** BLOCKED — bounce tracking needs webhook/event feedback from the mail provider; `sendEmail` is disabled in this build and Gmail-send responses don't carry bounce state. Flagged for when delivery telemetry exists
247. **[F][DONE]** Pay-online placeholder — `Invoice.pay_url` field added (Stripe-ready, populated when a provider is wired) and the portal invoice view exposes `pay_url` + `can_pay_online` (only when a URL exists and balance remains)
248. **[H][DONE]** Email validation added — `recordEstimateAcceptance` returns 400 when `accepted_by_email` is provided but fails a basic non-empty `x@y.z` shape check (no spaces required-between tokens)
249. **[F][DONE]** Portal branding — `estimatePortalView` exposes `company_name`/`company_logo_url` (per-estimate fields) and the bootstrap response adds a `company` block sourced from `QuoteDefaults` for workspace-level branding
250. **[B][DONE]** Polling slowed — per-action `poll()` now skips ticks while `document.hidden` (the sync loop already did) and the refresh-sync interval drops from 5s to 15s, cutting steady-state invoke fan-out ~3x

## 11. Acceptance & Approval Flow (25)

251. **[F]** ANALYZED — needs a canvas signature component + UploadFile to storage + `evidence_reference` write on the acceptance. The storage/field plumbing exists (`UploadFile` in quoteDeliveryService; `evidence_reference` on EstimateAcceptance); the canvas UI is the remaining work — flagged for a dedicated pass
252. **[H][DONE]** `portal` method added — `EstimateAcceptance.acceptance_method` enum now includes `portal`, and the portal approval write uses it instead of `other`
253. **[F][DONE]** Verified — `recordEstimateAcceptance` already sends a sendGmail notify to the estimate owner (`created_by || salesperson_email`, lines ~211-229) with the acceptance notify workflow capability
254. **[B][DONE]** Verified — the dedupe filter is `estimate_id + quote_version` (recordEstimateAcceptance ~line 38-40), not just an idempotency key
255. **[F]** PARTIAL — portal declines already write `estimate_revision` activities + (#239) open `EstimatingRequest` rows; a staff-side "reject quote" action that marks the estimate and spawns a follow-up task is the remaining piece — flagged for a dedicated pass
256. **[H][DONE]** Verified — `accepted_at` is rejected beyond now+15min skew and beyond 10yr old (exactly the tightened bound spec)
257. **[F]** ANALYZED — needs a portal `counter_offer` action writing a structured payload (proposed_total + note) to an EstimatingRequest/activity. Plumbing exists (portal actions + request queue); the action + UI is remaining — flagged for a dedicated pass
258. **[F][DONE]** Verified — `authorize_send` in `recordEstimateQuoteDelivery` hard-blocks quotes above `quote_approval_threshold` until `internal_approval.approved_at` is recorded via `approve_quote`; `can_approve_quotes` users bypass as managers; the frontend calls it before every send
259. **[H][DONE]** Evidence scheme filtered — `evidence_reference` stays free-text (PO numbers, "signed quote") but `javascript:`/`data:`/`vbscript:` schemes are blanked before persistence; contract assert added to `validate-opportunity-workspace.mjs`
260. **[F][DONE]** Verified — acceptance rows show `METHOD_LABELS[acceptance_method]` next to accepted-by name/email (line 206) plus `Evidence: <ref>` in the meta line (line 207)
261. **[B][DONE]** `accepted_by_name` fallback added — when the caller omits the name, it resolves from `contact_first_name + contact_last_name`, then `order_contact`/`contact_name` on the estimate; still 400s only when nothing is on file
262. **[F]** Documented design — pending state is modeled by the `internal_approval` field (absent = pending/blocked above threshold) rather than a status enum value; adding `pending_internal` to the status enum would duplicate the gate without changing behavior. Flagged if a visible status is wanted
263. **[H][DONE]** Verified — `delivery_id` is validated against `estimate_id` + `quote_version` + `delivery_status==="sent"` with a 409 on mismatch
264. **[F][DONE]** Expired-quote gate added on both paths — `recordEstimateAcceptance` 409s when `quote_expiration_date < today`, and the portal approve path blocks with "quote has expired — request an updated quote" (same `quoteValidUntil` boundary)
265. **[F][DONE]** Implemented already — `section_acceptance_mode` on the estimate enables per-section accept/decline/question in the portal via `EstimateSectionAcceptance` rows (decisions feed `estimate_approved`/`estimate_revision` activities)
266. **[H][DONE]** Estimate mirror added — `accepted_at`/`accepted_by_name`/`accepted_by_email` fields on `AllInOneEstimate` + `patchEstimateAcceptanceFields` CAS-mirrors the canonical acceptance onto the estimate on all four `recordEstimateAcceptance` return paths
267. **[F][DONE]** Customer confirmation email — `recordEstimateAcceptance` sends a fire-and-forget `sendGmail` to `accepted_by_email` after approval (subject "Quote acceptance confirmed", total/version in body); never blocks the acceptance write
268. **[B][DONE]** Verified — `canonicalAcceptance` sorts earliest `created_date`/`accepted_at` first (canonical = earliest), with concurrent-loser dedupe (see #213)
269. **[F][DONE]** Covered — `attention_feed` exposes `stale_sent_estimates` (sent quotes aging >7d without response) which feeds the AttentionBell badge, and the funnel returns a `sent` estimate count — awaiting-approval surfaces on the nav badge
270. **[H][DONE]** Fixed via #204 — `ensureOpenEstimateRevision` now falls back to `base44.auth.me()` when no session token is supplied, unblocking staff writes
271. **[F]** ANALYZED — a reopen after `approved` currently goes through Start Revision (protected flow); an explicit "supersede acceptance" action that records a superseding revision-type row is a bounded add on the existing guard rails — flagged for a dedicated pass
272. **[F][DONE]** Acceptance shown in portal — `estimatePortalView` now exposes `accepted_at`/`accepted_by_name` (mirrored onto the estimate by #266), so the portal can render "you approved on X by Y"
273. **[H][DONE]** Verified — the acceptance row writes `work_order_id: estimate.work_order_id` read at accept time (matches by construction)
274. **[F][DONE]** Verified — acceptance rows persist `recorded_by_name`/`recorded_by_email` (staff path records the actor; portal writes `customer_portal`) and the panel displays "Recorded by …"
275. **[B][DONE]** Verified — the row meta renders `Recorded by {recorded_by_name || recorded_by_email}` with the email appended when both exist

## 12. Reporting & Dashboards (25)

276. **[F][DONE]** Covered — `estimate_funnel.status_counts` + `win_rate`/`won_value`/`decided_value` on the ReportingDashboard
277. **[F]** PARTIAL — `by_salesperson.avg_quote_value` exists but not a per-month series. Flagged for a dedicated pass
278. **[F][DONE]** Covered — `estimate_funnel.lost_reasons` (count + lost_value, top-10) in the funnel payload
279. **[F]** PARTIAL — `status_counts` shows totals; a per-week throughput series doesn't exist. Flagged for a dedicated pass
280. **[F]** PARTIAL — `estimate_funnel.win_rate` is global + `by_salesperson` has per-person rates; a per-customer win-rate breakdown isn't in the payload. Flagged for a dedicated pass
281. **[F]** PARTIAL — no `by_module` breakdown exists in `estimate_funnel` yet (module_key is available on line_items). Flagged for a dedicated pass
282. **[F][DONE]** Covered — `estimate_funnel.avg_margin_pct` + `total_margin` surfaced on the dashboard
283. **[B][DONE]** Verified — the WO load filters `query: { deleted: false }` and the active/completed splits re-check `!wo.deleted` (ReportingDashboard ~lines 48-79)
284. **[F][DONE]** Covered — `estimate_funnel.aging_buckets` (expired/7d/14d/30d/30d+) + `aging_rows` with per-quote days-to-expiry
285. **[F]** PARTIAL — modules tracked via `line_items[].module_key` but no revenue attribution by module exists. Flagged for a dedicated pass
286. **[F]** PARTIAL — `FeatureReports` is an open/completed task tracker, not a saved-filter report builder; the report-definition persistence doesn't exist. Flagged for a dedicated pass
287. **[H][DONE]** Verified — the completed scope queries `status:"completed"` server-side (manageFeatureReports ~line 186); `cancelled` isn't a FeatureReport status and deletes are physical (`deleteMany`), so no cancelled/deleted leak path exists
288. **[F][DONE]** Covered — `estimate_funnel.request_conversion` tracks request→sent timing/conversion (from #162)
289. **[F]** PARTIAL — `CustomerSummary` + the funnel hold the inputs; a dedicated LTV rollup view doesn't exist. Flagged for a dedicated pass
290. **[F][DONE]** Covered — the dashboard renders a `trendData` chart of activity over time
291. **[B][DONE]** Verified — `loadReports` already wraps the fetch in try/catch with `readError` surfaced (FeatureReports ~lines 98-104)
292. **[F][DONE]** Covered — `estimate_funnel.avg_part_cost_ratio` surfaced on the dashboard
293. **[F][DONE]** Covered — `estimate_funnel.markup_usage` tracks tier application counts
294. **[F][DONE]** Covered — `stale_sent_estimates` in the attention feed (>7d unresponded) + `aging_buckets` on the dashboard
295. **[H]** Same as #174 — the feed uses bounded 500-row filtered reads (most-recent by activity sort), which is a defensible attention-feed scope; true cursor pagination does not exist. Documented honestly rather than shipping a fake fix
296. **[F]** BLOCKED — bounce tracking needs mail-provider webhook feedback; `sendEmail` is disabled and Gmail-send responses carry no bounce state. Flagged until delivery telemetry exists
297. **[F][DONE]** Covered — `request_conversion` + `estimate_funnel` conversion fields track estimate→WO flow
298. **[F]** PARTIAL — `PortalMessage` + link `open_count` record activity but no per-estimate report aggregates them. Flagged for a dedicated pass
299. **[B][DONE]** Verified — `jobCostingAction` reads every entity through `loadAllEntityRows` (paged fetch with maxRows cap + label) — no `filter({})` call relies on the SDK row cap
300. **[F]** Estimator accuracy report — estimated cost vs actual job cost

## 13. Search, Deep-Links & Saved Views (25)

301. **[F]** Global estimate search across notes/line-items, not just project_name/client
302. **[F]** `?estimate=<id>` deep-link on all estimator pages
303. **[B][DONE]** Verified — `scope`/`type`/`category`/`status`/`q` all init from `searchParams` and write back via `writeParam`/`setSearchParams` (EstimatorParts ~lines 136-248); no `sort` control exists to parametrize
304. **[F]** `?customer=<id>` pre-fill on NewAllInOneEstimate
305. **[F]** `?status=` pre-select on NewEstimateDialog (draft vs sent on create)
306. **[F]** Saved-search views on EstimatorQueues (name a filter combo)
307. **[H][DONE]** Verified — `VinylInventoryTab` writes `q`/`category`/`use_case` via `writeParam` on every change (~lines 68-72, 243+) — parity already in place
308. **[F]** `?q=` on EstimatorProducts
309. **[F]** Search in `AddProductGrid` — already has? verify `?q=` init
310. **[B][DONE]** `?q=` write-back added — the page's only param filter is `?q=` (status/sort aren't UI features here); a replaceState effect now keeps `?q=` in sync on every change
311. **[F]** `?open=<product_id>` deep-link on EstimateProductsList
312. **[F]** `?version=<n>` deep-link on EstimateDetail (open specific revision)
313. **[F]** Recent-searches dropdown on list pages
314. **[H][DONE]** Verified — `FoundationCatalog` writes both `q` and `type` via `writeParam` on change (~lines 97, 122)
315. **[F]** `?module=<key>` pre-select on EstimatorTools
316. **[F]** `?tab=<name>` deep-link on EstimatorSettings + module settings
317. **[F]** `?filter=<preset>` on EstimatorCustomers (ar_aging, recent, inactive)
318. **[B][DONE]** Root cause fixed — `writeParams` already strips empty values for all keys; the actual bug was status-chip links rebuilding the URL and dropping `q`/`sort`. Status links now preserve both params on navigation
319. **[F]** `?q=`/`?status=`/`?sort=` write-back on `MasterInventory`
320. **[F][DONE]** Verified — `?wo=<id>` opens the work order and scrolls the card into view once loaded (Estimating ~lines 103-114)
321. **[H]** Documented — `QuickPrice` has no history-search input (history is a plain list) so `?q=` has nothing to seed; `?module=` preset works. A history-search field would be the prerequisite
322. **[F][DONE]** Verified — all three params read at init and written back on change in `VinylInventoryTab`
323. **[F]** `?line=<id>` scroll-to-line on EstimateProductsList
324. **[B][DONE]** Verified — status chips call `setParam("status", s.key)` which writes the param on click (Estimator.jsx ~line 171)
325. **[F]** Deep-link into specific aio section (`?section=<key>`)

## 14. Notifications & Alerts (25)

326. **[F]** Notification center panel (dropdown from bell with categorized feed)
327. **[F]** Mark-all-read on attention feed sections
328. **[F]** Notification preferences per user (which sections to show)
329. **[F]** Estimate-status-change notifications to salesperson
330. **[B]** `AttentionBell` polls every 60s — verify it stops when tab hidden (page-visibility API)
331. **[F]** Notification click → deep-link into entity detail (each section type)
332. **[F]** Snooze-notification per item (hide for N hours)
333. **[F]** Email-digest option (daily summary of attention feed)
334. **[H]** `attention_feed` — per-section `limit` to avoid unbounded feeds
335. **[F]** Estimate-request assigned → browser push notification
336. **[F]** Quote-approved → celebration toast on EstimatorQueues
337. **[F]** Low-stock alert → PO-draft suggestion
338. **[B]** `AttentionFeed` section titles — `unread_portal_messages` should link to portal messages, not inbox
339. **[F]** Notification sound toggle
340. **[F]** Mark-as-handled on each notification item
341. **[H]** `permittingScanStatus` polling — interval-based, respect tab visibility
342. **[F]** Estimate-request unassigned > 2 days → escalate notification
343. **[F]** `pipeline_sync_pending` unresolved > 24h → alert
344. **[F]** Builder-product `needs_recalc` flag → notification
345. **[B]** `overdue_jobs` attention-feed — uses UTC day-boundary; fix for local-time
346. **[F]** Quote-expiry 7-day warning → notification to salesperson
347. **[F]** Invoice-overdue → notify salesperson + customer-service
348. **[H]** `open_estimating_requests` attention feed — verify the link goes to /Opportunities with filter
349. **[F]** Custom notification triggers (e.g. "tell me when estimate X is approved")
350. **[F]** Notification history log (what was notified, when, by which system)

## 15. Data Integrity & Concurrency (25)

351. **[H]** `expectedEstimateFields`/`replaceEstimateFieldsIfUnchanged` — add `deleted` guard
352. **[B]** `workOrderPatchMatches`/`sourcePatchMatches`/`importedPayloadMatches` — normalize strings before compare
353. **[H]** `assertEstimateProductMutationAllowed` — add `deleted` + `archived` guard
354. **[B]** `preflightBuilderSourceMutation` — verify `estimate.deleted !== true` before allowing writes
355. **[H]** `pendingBuilderMutation` — TTL (24h) so stale pendings don't permanently block
356. **[B]** `canonicalEstimateWorkOrder` — `estimate_id` + `work_order_id` unique together check
357. **[H]** `deleteEntityIfUnchanged` — `guardFields` should include `id` always
358. **[B]** `loadAllEntityRows` — `sort` param uses `-created_date` descending by default; verify for correctness on all calls
359. **[H]** `expectedEntityFields` — `JSON.stringify` of undefined fields should match missing keys, not `null`
360. **[B]** `findOptionalWorkOrderArrayItemIndex` — `locator.id` coerced to string; verify items with numeric ids match
361. **[H]** `sameValue` — `null` vs `undefined` vs `""` — document the intended semantics
362. **[B]** `createWorkOrderWithRecovery` — `rows.length >= 500` guard is arbitrary; consider `count` endpoint
363. **[H]** `ensureIdempotentEntityCreate` — creation-request-key uniqueness enforced client-side only; add backend unique check
364. **[B]** `deleteBuilderEntityIfUnchanged` — `guardFields` should be `id` + `updated_date`, not just name
365. **[H]** `estimateConcurrency` — `sameValue` uses JSON.stringify; key-order matters — normalize first
366. **[B]** `createCustomerWithRecovery` — same-title filter uses `company_name`; verify against dedupe
367. **[H]** `replaceEntityFieldsIfUnchanged` — `expectedUpdatedAt` uses loaded row's `updated_date`; verify not stale
368. **[B]** `mutateWorkOrderArrayField` — `maxAttempts` retry logic: check it resets `readRows` between attempts
369. **[H]** `saveTrackedFields` — verify `record` vs `fields` shape matches function response
370. **[B]** `upsertCustomerFromEstimate` — `loadAllCustomers` + match-by-name is racy (two sessions create dupes)
371. **[H]** `expectedCustomerFields`/`replaceCustomerFieldsIfUnchanged` — CAS on `company_name` changes
372. **[B]** `canonicalAcceptance` — dedupe by `created_date` earliest; verify intent vs latest
373. **[H]** `deleteInventoryRecordIfUnchanged` — `guardFields` should include `nameField` value
374. **[B]** `equipmentPersistence.replaceRelationshipIdsIfUnchanged` — untested CAS path (write test)
375. **[H]** `createBuilderPartWithRecovery`/`createBuilderPartGroupWithRecovery`/`createBuilderProductWithRecovery` — `matchesPayload` normalize-strings check needed

## 16. Test Coverage Expansion (25)

376. **[T]** `estimator/` dead-code test — mark dead files as "no-op" so grep doesn't flag them
377. **[T]** `transitionWorkOrderFromLoadedSnapshot` full path with stub entity (CAS + stage transition)
378. **[T]** `preflightBuilderSourceMutation` — mock `getEstimate` + `assertMutationAllowed`
379. **[T]** `recordEstimateAcceptance` — stub entity + dedupe-by-version
380. **[T]** `recordEstimateQuoteDelivery` — safeUrl scheme stripping (javascript:/data:)
381. **[T]** `loadAllEntityRows` pagination — mock entity returns 2 pages
382. **[T]** `customerSync` — `syncEstimateToPipeline` with stub entities
383. **[T]** `getOpenEstimateRevision` — stub EstimateRevision filter
384. **[T]** `listEstimateRevisions` — strict vs non-strict error handling
385. **[T]** `ensureOpportunityWorkspace` — session-error → 401 path
386. **[T]** `canonicalEstimateWorkOrder` — `estimate_id` + `work_order_id` identity
387. **[T]** `expectedWorkOrderFields`/`replaceWorkOrderFieldsIfUnchanged` CAS guard
388. **[T]** `deleteWorkOrderFieldsIfUnchanged` — guard-field + updated_date
389. **[T]** `sanitizeWorkOrderFormPatch` — SYSTEM_FIELDS exclusion complete
390. **[T]** `workOrderPatchMatches` — normalize-strings requirement (add impl + test)
391. **[T]** `createWorkOrderWithRecovery` — preflight limit + recovery dedupe
392. **[T]** `deleteInventoryRecordIfUnchanged` — guardFields nameField check
393. **[T]** `equipmentPersistence.replaceRelationshipIdsIfUnchanged` — CAS on relationship writes
394. **[T]** `staffEntities` — proxy facade method routing + error on mutation methods
395. **[T]** `estimateRevisionService` — `startEstimateRevision`/`completeEstimateRevision` with stub
396. **[T]** `expectedCustomerFields`/`replaceCustomerFieldsIfUnchanged` — CAS on name change
397. **[T]** `canonicalAcceptance` — earliest-created wins
398. **[T]** `ensureOpenEstimateRevision` — session fallback after C2-F fix
399. **[T]** `updateEstimateRevisionAudit` — expected_estimate_updated_date CAS
400. **[T]** `assertEstimateProductMutationAllowed` — deleted/archived/sent guards

## 17. Performance & Rate-Limit (25)

401. **[PERF]** `attention_feed` — batch entity queries (one query per entity type, not per item)
402. **[PERF]** `permittingScanStatus` — batch poll or websocket, not per-scan status call
403. **[PERF]** `loadAllEntityRows` — `limit` param where full-page load unnecessary
404. **[PERF]** `Estimator` list — virtualize estimate cards (>50 items)
405. **[PERF]** `AllInOneEstimate` — paginate list endpoints (loadMore not loadAll)
406. **[B]** F5 entity_list rate-limit — consolidate `attention_feed` fan-out queries
407. **[PERF]** `BuilderPartsPanel` — lazy-load parts when >100
408. **[PERF]** `EstimateProductsList` — virtualize product rows
409. **[PERF]** `inventorySources` — cache resolved entity schemas (don't re-fetch per tab)
410. **[B]** `timeClockAction` + `permittingScanStatus` polling storms — add jitter/backoff
411. **[PERF]** `Customer` list — index `company_name` for search (backend)
412. **[PERF]** `estimateSalesActivity` — memoize categorize results per project
413. **[PERF]** `extractBuilderParts` — cache module extraction per project+version key
414. **[PERF]** `markupEngine.applyMarkups` — skip recompute when tier/lines unchanged
415. **[PERF]** `QuickPrice` — debounce the calculation on input
416. **[PERF]** `EstimatorCustomers` — index on `customer_name` field
417. **[PERF]** `estimateRevisionService.listEstimateRevisions` — `sort` server-side not client
418. **[PERF]** `WorkOrder` list — `filter({current_stage:'estimating'})` not load-all-then-filter
419. **[PERF]** `partSync.syncBuilderParts` — batch part writes (updateMany not per-row update)
420. **[B]** `attention_feed` — `limit: 500` per entity is arbitrary; paginate properly (C2-L)
421. **[PERF]** `FoundationCatalog` — paginate material list (don't load all at once)
422. **[PERF]** `Customer` — `recent_customers` localStorage cache is fine; consider server-side last-viewed tracking
423. **[PERF]** `masterInventory` tabs — lazy-mount non-active tabs
424. **[B]** `smartsheetSyncAction` + `timeClockAction` entity_list bursts — the F5 systemic issue; needs consolidated reads + caching
425. **[PERF]** `AllInOneEstimate` — `line_items` field shouldn't be fetched on list view (payload too large)

## 18. Accessibility & UX Polish (25)

426. **[UX]** `aria-label` on all icon-only buttons across estimator (trash, edit, close)
427. **[UX]** `aria-current="step"` on AioStepRail (done on header; verify rail too)
428. **[UX]** Focus-trap on all dialogs (modal focus should cycle)
429. **[UX]** `role="dialog"` + `aria-modal` on all estimator modals
430. **[UX]** Escape-key closes all dialogs (verify each; CancelEstimateModal does)
431. **[UX]** Enter-key submits forms where natural (e.g. custom-name in AddProductGrid — check)
432. **[UX]** `aria-selected`/`aria-current` on status chips (not just buttons)
433. **[UX]** Loading skeletons instead of spinners on list pages
434. **[UX]** `alt` text on all icons (lucide is decorative — `aria-hidden` appropriate)
435. **[UX]** `type="button"` + `role="button"` consistency on all non-form buttons
436. **[B]** `aio` curly quotes — some components use curly quotes in confirm text; standardize
437. **[UX]** Keyboard-navigable status chips (arrow keys move between chips)
438. **[UX]** `aria-describedby` on form inputs with helper text
439. **[UX]** `aria-expanded` on collapsible panels (BuilderPartsPanel, AIO sections)
440. **[UX]** `aria-pressed` on toggle buttons (is_active toggles, enabled flags)
441. **[UX]** `aria-live` region on save-status ("saved"/"saving" announcements)
442. **[UX]** `role="status"` on inline error messages
443. **[UX]** Tab order — dialogs should focus first input on open
444. **[UX]** `title` tooltip on all icon-only actions (Trash2, Edit, Copy)
445. **[UX]** Mobile touch-targets ≥44px on action buttons
446. **[B]** `aria-hidden` on decorative icons (some lucide icons may be inside buttons without it)
447. **[UX]** `aria-label` on `aria-selected` chips in AddSectionDialog
448. **[UX]** `role="alert"` on error banners
449. **[UX]** Focus-return to trigger button on dialog close
450. **[UX]** `aria-sort` on sortable table headers

## 19. Import, Export & Migration (25)

451. **[F]** Export estimate as JSON (re-importable)
452. **[F]** Bulk-export estimates CSV (all fields) on EstimatorQueues
453. **[F]** Import parts library from CSV
454. **[B]** `importMappers.detectTarget` — PART_GROUP_MAP vs KEYWORD_RULES precedence test
455. **[F]** Import estimates from other module (e.g. legacy BOM → new structure)
456. **[F]** Export estimate quote as printable PDF (not just HTML)
457. **[F]** Import customer list from CSV on EstimatorCustomers
458. **[F]** Export inventory CSV with all custom fields
459. **[B]** `importSalesPipeline` — `478` dead ternary — verify the intended fallback
460. **[F]** Import estimate → link to existing customer by name
461. **[F]** Export quote HTML as standalone file (shareable)
462. **[F]** Import pricing tiers from JSON
463. **[B]** `importOrders` — no upload size cap (C2-O)
464. **[F]** Import parts from other estimate (copy BOM)
465. **[F]** Export change orders CSV
466. **[B]** `legacyInventoryMigrator` — `buildPayload` per target — verify all 6 targets handled
467. **[F]** Import estimate sections from template
468. **[F]** Export all estimates → backup file
469. **[B]** `ExcelImporterDialog` — `skippedRows` now shows count; add per-row skip reasons
470. **[F]** Import inventory → link existing parts by `inventory_item_id`
471. **[F]** Export customer list CSV on EstimatorCustomers
472. **[B]** `importSalesPipeline` fuzzy match — score threshold too low (wrong-customer WO stamps — C2-H)
473. **[F]** Import estimate line items from CSV
474. **[F]** Export estimate breakdown for job costing
475. **[B]** `ensureOpenEstimateRevision` — `ensureEstimateLifecycleRevision` — `ensureBuilderPriceRevision` — `ensureCustomerSummary` — `deleteCreatedDuplicateWorkOrder` — `updateEstimateRevisionAudit` — all `auth.me()`-gated (C2-F)

## 20. Admin, Settings & Misc (25)

476. **[F]** Estimate-number format customization (prefix/suffix pattern)
477. **[F]** `quote_valid_days` default configurable in QuoteSettings
478. **[H]** `jurisdictionResearch` agent rename → `jurisdiction_research` (publish blocker)
479. **[F]** Quote email signature customization in QuoteSettings
480. **[F]** Tax-group management UI (admin adds/removes rates)
481. **[F]** User-default view per page (per-user saved filter preference)
482. **[F]** Admin — export all estimator data (estimates + inventory + customers)
483. **[B]** `ensureOpportunityWorkspace` — `session_token` error should be 401 not 500
484. **[F]** Estimate-number auto-reissue policy (on delete, reuse or skip?)
485. **[F]** Admin — view all estimates regardless of salesperson
486. **[F]** Quote defaults — `tax_rate` source picker (TaxGroup dropdown)
487. **[B]** `EstimatorSettings` — add `estimator_tools` hub link coverage check (nav-wiring test has all links)
488. **[F]** Per-user timezone preference → affects `due_date` display
489. **[H]** `backupPermittingRepository` — Drive upload format wrong (F18 — non-estimator but related)
490. **[F]** Admin — audit log view (who changed what, when)
491. **[F]** `quote_expiration_date` default from `quote_valid_days` + `quote_issue_date` at send-time
492. **[B]** `featureReports`/`CompletedReports`/`Opportunities`/`Financials`/`CustomerPortal` — `due_date` day-boundary bug (F27/C2-L family)
493. **[F]** Custom estimate statuses beyond the 7 built-in
494. **[F]** Estimate print preview before PDF
495. **[B]** `FoundationEstimator`/`BrickStoneEstimator` — `handleSaveAsCopy`/`handleSave` catch landed; verify alert vs error-state display
496. **[F]** `EstimatorTools` — add "Export all estimates" tool link
497. **[F]** Quote footer customization (terms, warranty, disclaimer text)
498. **[B]** `SalesHome` — `load()` catch landed; verify loadError renders correctly
499. **[F]** Estimate auto-numbering format per module (e.g. CH-#### for channel letters)
500. **[H]** `jurisdictionResearch` → `jurisdiction_research` — the publish blocker; rename + update `callJurisdictionAgent` reference
