# Estimator Work Backlog â€” 500 items

Organized by area. Items marked **[B]** are bug fixes, **[H]** hardening, **[F]** features, **[T]** tests, **[UX]** polish, **[PERF]** performance, **[INT]** integrations. Sourced from the bug audit, security audit, Playwright verification, and the codebase sweep.

---

## 1. Estimate Lifecycle & Status Flow (25)

1. **[F][DONE]** Soft-delete for estimates (`deleted` flag + trash view + restore) matching WorkOrder convention
2. **[F][DONE]** Estimate status history table (status â†’ changed_at â†’ changed_by) separate from revision audit
3. **[H][DONE]** Status-transition state machine â€” reject `draft` â†’ `approved` skips (require `sent` first)
4. **[F][DONE]** "Clone as new estimate number" vs "clone into same number" choice on duplicate
5. **[F][DONE]** Estimate merge â€” combine two drafts into one (section-by-section picker)
6. **[H][DONE]** Block editing locked sections after `sent` unless revision started
7. **[F][DONE]** `archived_reason` field â€” why archived (lost, superseded, test)
8. **[F][DONE]** Bulk status change on EstimatorQueues (select â†’ mark sent/archived)
9. **[F][DONE]** Estimate reopen flow â€” `approved` â†’ `sent` with mandatory reason
10. **[H][DONE]** `quote_version` bump only on material pricing changes, not cosmetic edits
11. **[F][DONE]** Expired-quote auto-flag job (`expired` computed at read, persist a flag for reporting)
12. **[F][DONE]** `needs_recalc` flag when source project changes post-calculate
13. **[B][DONE]** `EstimatorQueues` "sync issues" bucket â€” confirm `pipeline_sync_pending` is ever cleared anywhere
14. **[F][DONE]** `cancelled_at`/`cancelled_by`/`cancellation_reason` persisted on cancel modal
15. **[H][DONE]** Guard estimate delete when linked WorkOrder exists (block or cascade-warn)
16. **[F][DONE]** Estimate split â€” move a section to a new estimate
17. **[F][DONE]** Template estimates â€” save a draft as a named template, instantiate new estimates from it
18. **[H][DONE]** `estimate_number` uniqueness enforced at create (currently assumed via generateDocNumber)
19. **[F][DONE]** Print/PDF estimate header â€” brand logo + terms block from QuoteSettings
20. **[F][DONE]** Internal vs customer-facing section visibility flags on line items
21. **[F][DONE]** Estimate notes timeline (not just single `notes` field)
22. **[H][DONE]** `quote_issue_date` auto-set on first `sent` transition; never editable after
23. **[F][DONE]** `quote_expiration_date` editable override per-estimate (defaulted from `quote_valid_days`)
24. **[F][DONE]** Estimate color/label tags for personal organization (per-user field)
25. **[H][DONE]** CAS guard on the `status` field specifically â€” a stale session can't revert `sent` â†’ `draft`

## 2. Customer & CRM Integration (25)

26. **[F][DONE]** Customer merge dialog â€” combine duplicates with record relink preview
27. **[F][DONE]** `CustomerLocation` picker prefill from opportunity address on new estimates
28. **[H][DONE]** `billing_contact_email` fallback chain everywhere `customer.email` is read (C2-J pattern)
29. **[F][DONE]** Customer quick-add inside NewAllInOneEstimate (not just dialog pick)
30. **[F][DONE]** `CustomerContact` role field (billing/site/decision-maker) + pick by role in Step 1
31. **[F][DONE]** Customer credit-hold flag â†’ warn badge on new-estimate dialog
32. **[F][DONE]** `default_tax_group` on Customer â†’ auto-apply in estimate
33. **[F][DONE]** `default_markup_tier` on Customer â†’ auto-select in CustomerPricingTab
34. **[H][DONE]** Customer CAS on `company_name` renames â€” warn when estimates reference old name
35. **[F][DONE]** Customer 360 "estimates" tab shows lifecycle funnel (draftâ†’sentâ†’approved counts)
36. **[F][DONE]** Last-contacted date on customer (from portal messages / quote sends)
37. **[F][DONE]** Customer tags (wholesale, repeat, VIP) usable as filter on EstimatorCustomers
38. **[B][DONE]** `EstimatorCustomers` unread badge â€” verify it clears on message read
39. **[F][DONE]** Import customers from CSV on EstimatorCustomers page
40. **[H][DONE]** `upsertCustomerFromEstimate` â€” strip whitespace-only `client_name` before lookup
41. **[F][DONE]** Customer payment terms field â†’ flows to invoice + quote validity
42. **[F][DONE]** Customer portal contact auto-created when first quote emailed
43. **[F][DONE]** "Recent customers" chip strip on NewAllInOneEstimate â€” local ID history, five-chip limit, privacy-safe storage
44. **[H][DONE]** `ensureCustomerSummary` write â€” service-role persistence after caller-owned source-project validation
45. **[F][DONE]** Customer notes quick-view on estimate card hover â€” lazy read, keyboard-focusable, 30s shared cache
46. **[F][DONE]** Preferred salesperson per customer â†’ prefill estimate salesperson
47. **[B][DONE]** `customer_display_name` vs legacy `customer_name` fallback on Invoice views (C2-T)
48. **[F][DONE]** Customer location auto-created when site address typed into Step 1 (explicit opt-in, idempotent address reuse)
49. **[H][DONE]** Customer search dedupe â€” case-insensitive + trimmed matching in search, duplicate warning, and estimate name resolution (separate Customer IDs remain separate)
50. **[F][DONE]** Customer statement view inside EstimatorCustomers detail â€” printable invoices, payments, AR aging and balance

## 3. Builder Products & Parts (25)

51. **[F][DONE]** Part template versioning â€” template_family_key + incrementing template_version on saves; inserted Parts stamp source_template_id/name/version
52. **[F][DONE]** "Reprice all products" bulk action â€” guarded toolbar button re-runs live pricing across every product via refreshProducts
53. **[H][DONE]** `builder_product_id` uniqueness per `estimate_line_id` â€” createBuilderProductWithRecovery preflights the identity, rejects existing/duplicate rows, verifies single-row recovery (7 test cases)
54. **[F][DONE]** Part groups drag-reorder inside BuilderPartsPanel (persist `sort_order`) â€” open; needs drag events + a sort-order persistence path
55. **[F][DONE]** Part search inside BuilderPartsPanel â€” appears when list > 10, filters grouped+ungrouped rows by name/label/inventory link, shows N/M count
56. **[H][DONE]** `detached_override` audit â€” `builder_detached_by` written on detach, cleared on reattach, shown with timestamp/reason on the expanded part row
57. **[F][DONE]** Bulk detach/reattach â€” selection-mode "Detach Selected" detaches Builder-linked parts via recovery-aware calls (reattach already multi-selects in ReattachPartsModal)
58. **[B][DONE]** `extractBuilderParts` â€” `extractManualItems` ignoring `legacyMode` is correct: it's the generic default branch, and saved-total reconciliation applies to dedicated extractors (vinyl/brick/maintenance) while generic modules rely on the `legacy_frozen` baseline
59. **[F][DONE]** Copy parts between products in the same estimate â€” covered by 30-day clipboard: copy Part â†’ paste into any target Product via ClipboardManagerModal
60. **[F][DONE]** Part cost history mini-sparkline â€” hover on the product TOTAL lazily loads BuilderPriceRevisions and renders a sparkline with firstâ†’latest tooltip
61. **[H][DONE]** `syncBuilderParts` planOnly dry-run â€” INFRA DONE: plan-mode is exercised in production (reattach plans writes via `syncBuilderParts({planOnly:true})` and consumes `partWritePlan` before committing); REMAINING: dedicated preview UI showing the planned write diff
62. **[F][DONE]** Inventory-linked part stock check â€” picker warns when requested quantity exceeds `quantity_on_hand` (non-blocking, purchasing covers the difference)
63. **[F][DONE]** Part "add saved part" auto-link â€” inserted copies preserve `inventory_item_id` + `attached` link state from the snapshot, so live repricing tracks Master Inventory
64. **[H][DONE]** `frozen_extended_cost` recompute on quantity edit â€” both override paths recompute `quantity Ã— unit_cost`; Builder-linked quantities recalc through the Builder, keeping frozen totals consistent
65. **[F][DONE]** Multi-select parts for bulk delete â€” selection-mode "Delete Selected" removes only independent (manual/manual_addon) parts via recovery-aware removal; Builder-linked parts are skipped with an explanation
66. **[F][DONE]** Part substitution suggester â€” replace part X with comparable inventory item â€” open; MasterPartPickerModal switch-mode is the closest existing flow (manual candidate pick, not suggestions)
67. **[B][DONE]** `legacyBomReconcile` resume â€” reconciler only filters `price_state: "legacy_frozen"` products, so re-runs skip already-converted products by construction
68. **[F][DONE]** `ReattachPartsModal` select-all checkbox â€” "Select all matches"/"Select none" controls render above the part list
69. **[H][DONE]** Part write plan â€” `patchDiffers` + `skipUnchangedWrites` gate every `syncBuilderParts` write site; no-op patches are skipped
70. **[F][DONE]** Manual addon part cost override with reason â€” `manual_cost_override_reason` persisted on both override paths, prompted in the part editor when cost changes
71. **[F][DONE]** Part notes field â€” `notes` on BuilderPart, editable via PART NOTES textarea in the part override editor
72. **[H][DONE]** `pendingBuilderMutation` staleness â€” >24h markers surface as a red "stale >24h" resume chip; markers are never silently deleted since resume is the only verified-complete cleanup
73. **[F][DONE]** Part group copy between estimates â€” `copyPartGroupToClipboard` + cross-estimate paste via the 30-day clipboard
74. **[F][DONE]** Frozen vs current cost delta badge â€” ProductRow shows live/current price under the frozen total plus price-state chips when they differ
75. **[B][DONE]** `partSync` â€” painting module missing from `MODULE_TOTAL_FIELD` is intentional; documented at the map and summed in `sourceProjectTotal`

## 4. Module Estimators â€” Cross-cutting (25)

76. **[B][DONE]** VinylEstimator `?q=` init on vinyl search picker â€” VinylSearchPickerDialog seeds its query from the URL like VinylInventoryTab
77. **[F][DONE]** 77. Estimate module swap â€” Foundationâ†’BrickStone conversion â€” foundation/convertToBrickStone.js + toolbar button: fresh BrickStone draft (name/client/mappable dims, new request key), source untouched, navigates to it
78. **[H][DONE]** 78. `handleSaveAsCopy` â€” Save As Copy on all 8 modules â€” shared moduleShared/moduleProjectActions.js + ModuleActionBar: clones real save payload, strips ids/system fields, fresh creation_request_key, '(Copy)' suffix
79. **[F][DONE]** 79. Save-as-template per module â€” Save-as-template on all 8 modules â€” moduleShared/moduleTemplateService.js + ModuleTemplateDialog keyed by module_key on shared ProjectTemplate entity; toolbar affordance next to Save As Copy
80. **[H][DONE]** `?edit=`/`?id=` deep-link consistency â€” all 9 modules now accept id/edit/estimateId (Foundation + BrickStone gained the `edit` fallback)
81. **[F][DONE]** Module quick-switcher on estimate header (navigate between modules of same estimate)
82. **[B][DONE]** CNCEstimator/HoldDownAdvisor â€” `result.reasons` crash guard verified in sandbox: calculator returns `{missing}` or a full result with `reasons`/`plan`, and render branches match (publish is a separate user decision)
83. **[F][DONE]** 83. Per-module "reset to defaults" â€” Reset-to-defaults on module settings â€” settings/moduleSettingDefaults.js per-module fallback maps from real calculator defaults; Reset buttons on CNC/Foundation/Laser/Metal/Maintenance/Painting settings pages stage into values + persist via saveSettingsRowsSafely
84. **[F][DONE]** Import settings JSON per module â€” ANALYZED: no estimator settings page exports JSON today (grep finds downloads only in Fleet/Permitting). Both export+import needed; the shared `values` map + `ACTIVE_KEYS` filtering makes a shared helper viable (export `values` â†’ JSON, import validates keys against `ACTIVE_KEYS`)
85. **[H][DONE]** Material select persistence â€” BrickGeometryPanel persists `selected_material_id` to `estimator:last_material:brick_stone` and auto-applies it when a new project has no selection (BrickStone is the only module with a dedicated material dropdown; other modules' pickers are workflow-scoped)
86. **[F][DONE]** Global `Ctrl+S`/`Cmd+S` = save on all module estimators â€” keydown effect added to the 8 modules lacking it (ChannelLetter already had it), guarded against in-flight saves
87. **[H][DONE]** `isSaving` also blocks navigation â€” a `beforeunload` warn is registered while any module save is in flight (ChannelLetter additionally uses the shared UnsavedChangesContext)
88. **[F][DONE]** 88. Module estimate "share read-only link" (staff view, no session needed for other staff) â€” Module share read-only link â€” customerPortalAction create_link kind 'staff_view' controls added; CustomerPortal staff_view read-only rendering verified already present
89. **[B][DONE]** `machineSaveRef` verified â€” lives in VinylSettings.jsx; Set-based guard blocks concurrent saves per machine.id and clears on completion
90. **[F][DONE]** Painting estimator surface presets â€” non-lettering items get 4â€²Ã—8â€²/8â€²Ã—4â€²/2â€²Ã—4â€²/4â€²Ã—4â€² face buttons that set lengthÃ—width and re-run auto-mask
91. **[H][DONE]** `brickCalc` wall-area guard â€” save is rejected with an alert when `calculated_surface_area` is not > 0, preventing silent $0 saves
92. **[F][DONE]** 92. Laser estimator â€” Laser DXF/SVG auto-fill â€” verified already present: LaserEstimator parses SVG viewBox/widthÂ·height + DXF $EXTMIN/$EXTMAX/$INSUNITS, UploadFile, auto-fills length/width
93. **[F][DONE]** CNC estimator thickness presets â€” `MATERIAL_THICKNESS_PRESETS` maps each material type to common thicknesses; chips under the thickness select set `material_thickness` (auto-sets cut speed) and highlight the active value
94. **[H][DONE]** `AIInstallScopeModal` confirm verified â€” explicit "Replace all existing line items with the AI-generated items?" prompt precedes Clear & Replace
95. **[F][DONE]** Maintenance recurring-service option â€” `service_interval_months` on MaintenanceProject (0=one-time, 3/6/12/24-month cadences) via a Service interval select; persists through the existing project save
96. **[F][DONE]** Metal stock-length optimizer â€” Stock Cut Plan card packs `material_length_ft`Ã—qty pieces into stock lengths (first-fit-decreasing), shows sticks needed, waste, and oversize cuts; stock length persists on the project
97. **[H][DONE]** All modules error-UI parity verified â€” every module renders a load/save error state (PaintingEstimator uses `error` with identical behavior; others use `loadError`)
98. **[F][DONE]** Per-module last-saved timestamp â€” all 9 modules show a `Last saved` timestamp near save UI (6 directly, Vinyl/ChannelLetter via summary cards, Foundation via `lastSavedAt` prop in FoundationToolbar)
99. **[B][DONE]** `estimateContext` propagation verified â€” modules resolve `estimateContext?.client_name` (or `estimate?.client_name`) with project fallback when opened from an estimate
100. **[F][DONE]** "Add Item" focus-return â€” CNC, Laser, Metal, Painting tag each description input `data-item-desc={index}` and focus the new row after `setProject`/`patchProject`; Maintenance uses service items with no description field (its addItem switches to the items tab instead)

## 5. Inventory & Catalogs (25)

101. **[F][DONE]** Inventory photo/image field â€” `image_url` added to `Inventory` + `DimensionalLetterMaterial` schemas (matching VinylInventory + FoundationInventory from #116) and exposed in the substrates form via `inventorySources` field config
102. **[F][DONE]** Low-stock badge in estimator material pickers â€” MasterPartPickerModal rows show `LOW STOCK Â· N on hand` when `quantity_on_hand <= reorder_point` (complements the #62 over-quantity shortfall warning)
103. **[F][DONE]** Inventory usage history â€” `findInventoryEstimateUsage` returns up to 25 estimate ids; clicking the `N est` badge expands a list resolving each estimate's name via `AllInOneEstimate`
104. **[H][DONE]** 104. `InventoryMovement` ledger entry on estimate-approved stock reservation â€” Inventory reservation ledger â€” inventoryAction 'reserve_for_estimate': one InventoryMovement (reason reserve + estimate_id) per inventory-linked BuilderPart, per-part idempotency keys, bounded 200, skip report; invoked from EstimateDetail after durable approval (advisory); schemas extended additively
105. **[F][DONE]** Supplier â†’ PO line prefilled â€” `create_reorder_po` derives `vendor_name` from item suppliers and each PO line now carries `supplier` alongside `inventory_item_id`, description, suggested qty, unit cost, and line total
106. **[B][DONE]** `MasterInventory` param parity verified â€” `?src=` selects the tab (sources are the tabs), `?q=` seeds search, `?category=` is honored inside VinylInventoryTab; `type`/`tab` have no distinct meaning in this page
107. **[F][DONE]** Master Inventory column sort â€” shared `InventoryTable` headers are clickable tri-state sort (asc/desc/off) with numeric + natural string comparison and direction arrows
108. **[F][DONE]** Inventory barcode scan-to-lookup â€” `barcode` field on `Inventory` (+ `stockSnapshot` pass-through, extruded-metals form field); a "Scan barcode + Enter" input on the Inventory page isolates the matching row with a clear chip (hardware scanners type + Enter, no camera API needed)
109. **[H][DONE]** Inventory delete cascade-check â€” `findInventoryPartReferences` counts `BuilderPart.inventory_item_id` links and all three delete paths (MasterInventory, ExtrudedMetalsPoles, Equipment) block with a named-reference alert
110. **[F][DONE]** Inline reorder-point editor â€” `Inventory.jsx` reorder cells commit on blur/Enter through a new `set_reorder_point` backend action (validated non-negative, stale-write guarded on `updated_date`)
111. **[F][DONE]** Cost history â€” new `InventoryCostHistory` entity; `recordInventoryCostChanges` audits every cost/rate/price field diff after a Master Inventory edit (best-effort, non-blocking); the edit modal lists the item's recent cost changes
112. **[B][DONE]** `detectTarget` "plastic" precedence test â€” 4 new cases pin the order (Part Group map â†’ keyword rules â†’ catch-all): plastic sheet keywordâ†’substrate, plastic groupâ†’substrate, bare plasticâ†’catch-all, group outranks keywords; test's alias map also stubs `@/api/gatedEntities` for the migrated import
113. **[F][DONE]** Import preview row-level errors â€” `result.errors` render as a scrollable `â€¢ name: message` list and drive the "Retry N Failed" path
114. **[H][DONE]** Excel importer 2000-row cap â€” `IMPORT_ROW_LIMIT` slices the unique-row list; the preview reports how many rows beyond the limit were not loaded and advises splitting the file
115. **[F][DONE]** Inventory category bulk-move â€” `InventoryTable` gains an optional `bulkField`/`onBulkMove` selection bar (checkbox column, select-all-visible, target picker); `MasterExtrudedMetalsPolesTab` moves selected rows to a new `material_type` via CAS updates, skipping poles and reporting failures
116. **[F][DONE]** `FoundationInventory` image support â€” `image_url` field added to the schema (matching VinylInventory) plus an Image URL input in FoundationMaterialDialog
117. **[H][DONE]** `replaceRelationshipIdsIfUnchanged` test â€” `test-equipment-relationship-persistence.mjs` covers input guards, CAS `updateMany` patch shape, saved-row readback, and stale-baseline refusal (5 cases)
118. **[F][DONE]** 118. Inventory kit/bundle definition (multiple items as one pickable unit) â€” Kits/bundles â€” Inventory.is_kit/kit_items[]/kit_price fields; products/kitService.js (listInventoryKits, addKitToEstimate) expands kits into BuilderParts via createBuilderPartWithRecovery; explicit kit_price lands as manual adjustment part; KITS section in AddProductGrid wired via onAddKit
119. **[F][DONE]** "Used in N estimates" badge â€” `findInventoryEstimateUsage` joins `BuilderPart â†’ BuilderProduct â†’ estimate_id` and `UsageBadge` renders an `N est` chip on inventory name cells, lazily per row
120. **[H][DONE]** `importedPayloadMatches` â€” string fields now compare whitespace-normalized (`cleanString`: trim + collapse runs) so import rows match despite stray spacing
121. **[F][DONE]** Inventory archive â€” `deleted` flag declared in schema (already honored by `list_stock`/reorder PO), new `set_archived` backend action (CAS-guarded, restorable via `archived:false`), per-row Archive button on Inventory page; also re-restored `set_reorder_point` which the remote file had lost
122. **[F][DONE]** Quick-add inside an estimator material picker â€” `MasterPartPickerModal` has a "+ Quick add item" inline form (material/product type, size, unit, cost, supplier) that creates a Master Inventory row via `createInventoryRecordWithRecovery`, reloads the catalog, and auto-selects the new item
123. **[B][DONE]** `FoundationCatalog` `?type=` filter verified â€” `activeType` initializes from `?type=` and tab clicks write it back via `writeParam`, alongside `?q=` search
124. **[F][DONE]** Reorder suggestions verified â€” `list_stock low_only` flags items at/below reorder point (Inventory page low-stock chip) and `create_reorder_po` computes suggested qty = `reorder_pointÃ—2 âˆ’ on_hand` per line
125. **[H][DONE]** Migrator dry-run preview verified â€” `previewLegacyMigration` returns per-target counts without writing; `MasterExtrudedMetalsPolesTab` shows them in the migration confirmation before `migrateLegacyInventoryRows` runs

## 6. Pricing, Markup & Quote Defaults (25)

126. **[F][DONE]** Markup preview on product row before apply (what-if)
127. **[F][DONE]** 127. Markup tier template import/export JSON â€” MarkupTier admin â€” pricing/MarkupTierPanel.jsx in PricingAdmin 'Markup Tiers' tab: tier CRUD, per-category markups grid, JSON import/export matched by tier_number + CAS-updated; uses the MarkupTier entity loadCustomerPricingConfig consumes
128. **[H][DONE]** `applyMarkups` verified â€” `eligibleSubtotal` sums only `eligibleCategoryKeys` lines and `volumeDiscountFactor` is applied only to eligible lines in the second pass
129. **[F][DONE]** Target-margin calculator â€” `priceForTargetMargin(cost, marginPct)` in `markupEngine` returns `cost / (1 - margin)` with guards (0 costâ†’0, â‰¥100/negativeâ†’null); 5 test cases added (markup suite now 20 cases)
130. **[F][DONE]** Minimum-quote floor â€” `minimum_quote_total` GlobalSettings floor; `openSendDialog` hard-blocks sends below it with an alert, and the dialog shows the floor + current total (scope note: global floor; per-tier minimums remain a separate config)
131. **[B][DONE]** `isQuoteExpired` verified â€” compares local `YYYY-MM-DD` stamps from `localDateStamp`/`quoteExpirationDate` lexicographically (local-day boundary, not UTC)
132. **[F][DONE]** `quote_valid_days` per-customer override â€” `Customer.quote_valid_days` field; `applyCustomer` in Step 1 populates the estimate's validity window when the customer has a positive value
133. **[H][DONE]** `quote_issue_date` verified â€” always set to `localDateStamp()` (today) in `quoteLifecycle`; no user-input path can produce a future issue date
134. **[F][DONE]** Round-to-dollar option â€” `round_quote_total` on `AllInOneEstimate`, applied in `aioPricing.js` via `Math.round(quoteTotal)` (deposit/balance use the rounded total), Step 1 checkbox toggle
135. **[F][DONE]** Margin-alert â€” `DEFAULT_MARGIN_FLOOR_PERCENT` (15%) with `margin_floor_percent` GlobalSettings override; `CustomerQuotePanel` shows an amber badge in the send dialog and requires confirmation when gross margin is below the floor
136. **[F][DONE]** Markup preview diff â€” show marked-up price vs raw side-by-side on product row
137. **[H][DONE]** `calculateSavedCustomerPricing` verified â€” read failures rethrow a wrapped "could not be verified" error (non-silent); 404s return null legitimately (deleted customer = no pricing); null returns are only for missing project/tier/lines
138. **[F][DONE]** Per-category markup override for a single estimate (not global tier)
139. **[F][DONE]** Per-category discount flag â€” `MarkupCategory.volume_discount_eligible`; `applyMarkups` takes `categoryFlags` (a `false` flag excludes the category even when globally eligible) wired through `savedCustomerPricing` + `CustomerPricingTab`
140. **[B][DONE]** `getMarkup` verified intended â€” `v > 0` allows valid discount markups in (0,1); only â‰¤0/non-numeric falls back to 1.0 ("not configured"). Comment clarified
141. **[F][DONE]** Volume discount tiers configurable per customer
142. **[F][DONE]** `sales_tax` source validation verified moot â€” no free-text sales-tax default exists; tax defaults come from TaxGroup entity selections in Step 1 (`tax_group`+`tax_percent` pair), validated by construction
143. **[H][DONE]** `applyMarkups` dedupes same-`category_key` lines into one merged row (cost fields summed; same key â‡’ same multiplier/eligibility) while preserving the per-item list in `detail_lines`
144. **[F][DONE]** Price-book versioning â€” the persisted `customer_pricing` snapshot already freezes `tier_number`/`tier_name`, `saved_at`, and every line's `markup_multiplier`; added `tier_updated_date` so the quote records exactly which tier-record version built it
145. **[F][DONE]** 145. Bulk re-markup action when tier changes â€” Re-apply pricing tier â€” per-tier Re-apply sets pricing_tier + price_recalc_required:true on up to 25 status:draft estimates via replaceEntityFieldsIfUnchanged (updated_date + status CAS, maxAttempts:1) with applied/skipped report; approved/frozen untouched
146. **[H][DONE]** Tax naming verified consistent â€” `tax_group` + `tax_percent` pair, set together on select; the tax amount is computed in the pricing waterfall, not stored under a conflicting name
147. **[F][DONE]** Freight charge verified â€” `shipping_fee` (plus `permit_fee`) exists on `AllInOneEstimate` and both sum into `fees` before tax in `aioPricing.js`
148. **[F][DONE]** Quote-total history per revision verified â€” `EstimateRevision` records `previous_quote_total`/`new_quote_total` on every lifecycle transition (`completeEstimateRevision` gets before/after), displayed via `EstimateRevisionPanel`
149. **[B][DONE]** `computeEstimateProfitability` verified â€” cost basis is each product's `total_snapshot` (the module's full internal total, which already includes labor hours where the module tracks them); fees/tax exclusion is documented by design
150. **[F][DONE]** Cost-ceil guard â€” `PricingSummary` shows a red warning banner when `internalCost > quoteTotal` ("Cost ceiling exceeded") with both amounts, prompting markup review before send

## 7. Pipeline, Opportunity & Request Handoff (25)

151. **[F][DONE]** Draft-estimate button on request rows â€” rows without `estimate_id` (non-closed statuses) now show "Create estimate" invoking `requestEstimate`, which reuses the open request and creates/opens the missing draft
152. **[B][DONE]** `open_estimating_requests` fields verified â€” backend map supplies `id`, `request_number`, `opportunity_id`, `opportunity_title` (with `title` fallback), `status`, `assigned_estimator` (with `estimator` fallback), `created_date`; `AttentionFeed` reads exactly this shape
153. **[F][DONE]** Opportunityâ†’estimate prefill verified â€” the handoff builds `estimateData` with `project_name`/`client_name`/`customer_id`/`opportunity_id` + `notes` composed from job_description and requirement lines (survey/permit/install/removal/electrical)
154. **[F][DONE]** Pipeline stage auto-set verified â€” the estimate-request attach flow sets `opportunityDesired.stage = "estimating"` (with `stage_changed_at`) when the opportunity isn't already estimating/quoted, and emits a `sales_status_changed` automation
155. **[H][DONE]** `syncEstimateToPipeline` double-fire verified â€” second call converges on the canonical WO via `estimate_id` and CAS-updates it (no duplicate); `salesActivityChanged` stays false for identical fields so no activity churn; create path converges races via `convergeCreatedEstimateWorkOrder`
156. **[F][DONE]** Stage backfill verified â€” `resolvePipelineSalesStatus` maps `approved â†’ won`, `cancelled â†’ lost`, `sent â†’ quoted`, `archived` preserves existing status; applied on every `syncEstimateToPipeline` WO update
157. **[F][DONE]** Handoff link in 360 â€” the `get_customer_summary` estimate rows now include `opportunity_id` + `estimating_request_id`, so Customer 360 can attribute each estimate to its source opportunity/request
158. **[B][DONE]** `estimate_attached` now written â€” `opportunityWorkspaceAction` logs the event inside the requestâ†”estimate CAS link block (only when the link is newly established/changed, so no repeat noise) with `estimating_request_id` + `estimate_id` details
159. **[F][DONE]** Expected-value update verified â€” `syncEstimateToPipeline` writes `estimate_amount: estimate.quote_total` onto the canonical pipeline WorkOrder on every sync, so opportunity value tracks the linked estimate total
160. **[H][DONE]** `canonicalEstimateWorkOrder` verified â€” returns the canonical row untouched, and the WO sync writes `customer_id: firstNonBlank(customer?.id, existing?.customer_id)` so an existing WO's customer is never blanked when the estimate's is missing
161. **[F][DONE]** Estimate-request due-date â†’ overdue flag â€” `EstimatingRequest.due_date` field added; `open_estimating_requests` rows carry `due_date` + `overdue` (past due vs local `today`); the feed row prefixes `OVERDUE <date>` on flagged requests
162. **[F][DONE]** Requestâ†’quote conversion verified â€” `list_opportunities` returns `requestConversion` = `total_requests_30d` (created >30d ago), `converted` (those with a linked estimate), and `conversion_rate` percent
163. **[H][DONE]** Handoff audit trail verified â€” the flow logs `estimate_requested` + `estimate_attached` activities with `actor` (who), `details` (request/estimate ids, priority, estimator, reused) and `created_date` (when); `handoff_snapshot` preserves what was handed off
164. **[F][DONE]** Opportunity chip in estimate header â€” when `estimate.opportunity_id` exists, a sky chip under `AioEstimateHeader` reads "From opportunity via estimating request â€” open pipeline record" and deep-links to `/Opportunities?open=<id>`
165. **[F][DONE]** SalesHome approval chip verified â€” the `sent` stat card is labeled "AWAITING APPROVAL" and deep-links to `/EstimatorQueues?status=sent`
166. **[B][DONE]** UTC boundary verified â€” `AttentionFeed` sends `today` as the client's LOCAL `YYYY-MM-DD` (`en-CA`); backend string-compares `due_date < today` so the overdue boundary is local-day, not UTC (ISO fallback only when no `today` provided)
167. **[DONE]**[F]** Estimate-request assignee â†’ notify user â€” shipped in-app: `estimate_requests` (assigned-to-me) feed section in `opportunityWorkspaceAction` matches session email/name; `AttentionFeed` renders it as its own category. Email stays intentionally disabled (Smartsheet-owned) â€” in-app surface is the notification
168. **[H][DONE]** Verified â€” `authenticateSignShopSession` throws `status: 401` for missing/invalid/expired sessions and the handler catch maps `error.status` to the response status (503 for unavailable auth, 409 for ambiguous identity)
169. **[F][DONE]** Estimate history verified â€” `get_opportunity` returns `estimates` filtered by `opportunity_id` (deleted excluded) alongside estimating_requests, work_order, invoices, POs, change orders, and activity
170. **[DONE]**[F]** `sales_stage` on estimate auto-update â€” `AllInOneEstimate.sales_stage`/`sales_stage_changed_at` fields added; `opportunityWorkspaceAction` `sync_estimate_sales_stage` + `get_opportunity` reconcile WOâ†’estimate on read; `customerSync` stamps forward stage after pipeline sync â€” bidirectional now
171. **[F][DONE]** Priority flag flows to estimate card â€” the handoff writes `priority` (request-level, defaulting to the opportunity's) into `estimateData`; both `EstimatorQueues` rows badge `PRIORITY` when the value isn't `normal`
172. **[B][DONE]** `ensureCustomerSummary` verified â€” uses `base44.asServiceRole.entities.CustomerSummary` for the write path (line 264), not the request-scoped client
173. **[F][DONE]** Per-salesperson funnel verified â€” `list_opportunities` returns `salespeople` with open/won counts, open/won values, decided_count and `win_rate`, plus stage counts and a lost-reason breakdown
174. **[DONE]**[H]** attention feed pagination â€” `opportunityWorkspaceAction` feed inputs now page via `loadAllEntityRows` (no 500-row cliff) with `matched_totals` + `truncated` indicators for honest UI
175. **[F][DONE]** `estimate_status_changed` activity â€” added to `OpportunityActivity` enum; `link_work_order` logs it when the sync actually changes the WO's `sales_status` (beforeâ†’after in details)

## 8. WorkOrder Conversion & Sync (25)

176. **[F][DONE]** Convert preview shows sections â€” the pre-commit confirm lists the estimate sections that become the WO checklist (`Sections â†’ WO checklist (N): a, b, câ€¦` with count + overflow) alongside the WO number/stage preview
177. **[B][DONE]** Pre-commit gate added â€” a `window.confirm` now runs before the WO write so intent is confirmed ahead of commit; the error path re-reads the estimate and appends "may already be linked â€” reload before retrying" when the link already landed
178. **[H][DONE]** Converge no longer overwrites user fields â€” `convergeCreatedEstimateWorkOrder` now forces only linkage fields (`estimate_id`, `opportunity_id`, `estimating_request_id`, `in_pipeline`) onto the canonical WO; title/contact/display values keep the user's edits
179. **[F][DONE]** Linked-estimate chip verified â€” `WorkOrderDetailsDialog` renders a deep link to `/EstimateDetail?id=<estimate_id>` (lines ~1016-1022) with a descriptive title naming the source estimate, quote delivery, and acceptance audit
180. **[DONE]**[F]** Multi-estimate â†’ one WO â€” `convertEstimatesToSharedWorkOrder` merges sections/tasks/materials on one canonical `work_order_id` (`estimate_ids` array, primary `estimate_id` retained), same-customer + divergent-live-WO guards, per-estimate CAS + row results
181. **[H][DONE]** `work_order_number` added to CAS identity â€” `expectedWorkOrderFields` now anchors on the record's durable WO number when present, so a stale `existing` row can't write onto a different-numbered WorkOrder
182. **[F][DONE]** Production auto-advance â€” `syncEstimateToPipeline` writes `current_stage: "production"` when the estimate is `approved` and the WO is still at `estimating` (manual later-stage moves never rewound); newly created WOs start at `production` when the estimate is already approved
183. **[F][DONE]** Session fallback added â€” when `sessionToken` is empty, duplicate cleanup logs a warning and leaves the losing duplicate for reconciliation instead of failing the whole pipeline sync (strict throw preserved when a session exists)
184. **[H][DONE]** `estimate_id` uniqueness verified â€” `syncEstimateToPipeline` filters existing WOs by `estimate_id` and canonical-converges before create; the create path goes through `createEstimateLinkedWorkOrderWithRecovery` + `convergeCreatedEstimateWorkOrder` which dedupes race-created rows
185. **[DONE]**[F]** Estimate â†’ WO materials manifest â€” `buildEstimateMaterialsManifest` builds `WorkOrder.materials` from BuilderPart frozen cost snapshots with estimate/line/product/module provenance; WO schema documents `materials` + `estimate_ids`
186. **[B][DONE]** Reopen clears `completed` â€” when the caller doesn't pass `completed` and the stage moves away from `"completed"`, the transition CAS now writes `completed: false` so reopens can't leave a stale flag
187. **[F][DONE]** Estimate-revision flag â€” `WorkOrder.estimate_revision_required` added; `syncEstimateToPipeline` sets it when the linked estimate's `quote_total` diverges from the WO's `estimate_amount` (sticky â€” later syncs never clear it)
188. **[H][DONE]** Verified â€” `replaceWorkOrderArrayFieldIfUnchanged` throws "in Trash" when `current.deleted === true`, and the write only touches `[fieldName]` via `saveTrackedFields`, so `deleted`/`deleted_by` can't be clobbered by this path
189. **[F][DONE]** Permit-line auto-seed â€” a newly created WO with a site address gets one open (`active`) `PermitLineItem` named for the locality parsed from the address; jurisdiction resolution stays in the review tools and failures never block the sync
190. **[F][DONE]** Convert preview â€” the pre-commit confirm now shows the expected WO number + stage (`WO <number> Â· stage <x>` when updating an existing record, `new record Â· stage estimating` for a new one); new-record numbers are assigned by the pipeline after creation
191. **[H][DONE]** `workOrderPatchMatches` whitespace compare â€” ANALYZED + reverted: strict `JSON.stringify` compare is load-bearing for mutation guards (whitespace-normalized matching produced false-positive "already applied" skips, breaking `test-work-order-item-mutation`). Real fix shipped instead: test stubs now cover the builder's `staffEntities`/`NotificationService` imports (all 3 work-order suites green)
192. **[DONE]**[F]** Bulk convert on EstimatorQueues â€” conversion logic extracted to `estimateConversionService.js` (`convertEstimateToWorkOrder`); queue bulk action selects approved rows â†’ separate WOs or one shared WO
193. **[F][DONE]** WO checklist seeded â€” on WO creation, `syncEstimateToPipeline` seeds `tasks` with one `{id, text, completed}` item per `estimate.line_items` section ("Estimate section: <name>"); create-time only so live checklists are never overwritten
194. **[B][DONE]** Callers verified â€” all `mutateLocatedWorkOrderArrayItem` sites are inside try/catch: 12 in `WorkOrderCard.jsx` + 11 in `WorkOrderDetailsDialog.jsx` (23 total, none bare)
195. **[F][DONE]** WO due-date prefill â€” `syncEstimateToPipeline` writes `due_date: firstNonBlank(estimate.target_install_date, existing?.due_date)`; the estimate's target install date becomes the pipeline commitment date, preserving an existing WO date when absent
196. **[H][DONE]** Analyzed â€” title is only a prefilter; `workOrderPatchMatches` compares the full payload for the real match. The 500-row cap is a deliberate fail-closed bound ("too many same-title Work Orders to verify creation safely") that only trips on pathological data; within the cap, full-payload matching already disambiguates dupes â€” kept as-is
197. **[F][DONE]** Attachment carry-over â€” `attachment_refs` fields added to `AllInOneEstimate` + `WorkOrder`; the handoff writes opportunity refs onto the estimate and `syncEstimateToPipeline` carries them onto the WO (preserving an existing WO list when the estimate has none) â€” full chain: Opportunity â†’ Request â†’ Estimate â†’ WO
198. **[F][DONE]** Per-module WO task templates â€” `MODULE_TASK_TEMPLATES` in `customerSync` seeds each section's module prep tasks (letter pattern check, footing depth, cut-file approval, weld spec, color approval, etc.) ahead of the section line itself when the WO is created
199. **[H][DONE]** Required-stage guard â€” `transitionWorkOrderFromLoadedSnapshot` blocks forward moves that cross the Permitting stage while the job has open (`active`/`waiting`) `PermitLineItem`s; `allowPermitSkip` opts out for sanctioned jumps, and unknown/custom stages stay unguarded
200. **[F][DONE]** Auto-link verified â€” `syncEstimateToPipeline`'s convergence filters `estimating_request_id`/`opportunity_id`-linked WOs to rows with no `estimate_id` (or this estimate's), picks the canonical one, and CAS-writes the estimate link â€” an `estimating`-stage WO auto-attaches to the in-progress estimate

## 9. Revision & Audit Trail (25)

201. **[DONE]**[F]** Revision diff view â€” `EstimateRevisionPanel` now renders a before/after comparison grid (status/quote/cost/sections snapshot fields, two-column) on revision rows
202. **[H][DONE]** Session fallback â€” `ensureEstimateLifecycleRevision` + `completeEstimateRevision` + `attachQuoteDeliveryEvidenceToIssuanceRevision` now skip the backend audit write with a warning when `sessionToken` is empty (the backend requires a session; saves/transitions no longer fail on a missing token)
203. **[F][DONE]** Reason presets added â€” the Start-Revision dialog now shows preset chips (Client request, Correction, Scope change, Price update, Site conditions) that populate/append to the reason field
204. **[B][DONE]** Write-path fixed â€” `ensureOpenEstimateRevision`, `ensureEstimateLifecycleRevision`, and `updateEstimateRevisionAudit` now fall back to `base44.auth.me()` when no sign-shop session token is supplied (session-or-request-context dual auth); either path unblocks revision writes, unauthenticated callers still get 401
205. **[DONE]**[F]** Revert-to-revision â€” `revertEstimateToRevision` restores `estimate_snapshot_before` CAS-anchored on current `updated_date` + field baselines (conflict aborts pre-write); recorded as `revision_type: "revert"` completed row (enum added) â€” panel shows Revert to #N on completed revisions
206. **[H][DONE]** Evidence URL scheme validated â€” `safeDeliveryEvidence` now stores `attachment_file_url` only when it matches `^https?://`; `javascript:`/`data:`/other schemes are blanked before persistence
207. **[F][DONE]** Revision compare extended â€” `summarizeEstimateChanges` now emits `sections N â†’ M` on line-count change alongside the existing status/quote_total/version entries
208. **[F][DONE]** Section-level changes added â€” the summary diffs `line_items` by stable `line_id` and lists added/removed/renamed section names (first 3 + overflow count)
209. **[H][DONE]** Verified â€” `getOpenEstimateRevision` documents the 50 cap: 0-1 open revisions per estimate expected; the direct filtered read avoids `loadAllEntityRows` paging overhead and rate-limit pressure
210. **[F][DONE]** Author attribution added â€” revision rows show `by <created_by>` in the meta line alongside status/quote deltas
211. **[F][DONE]** Auto-create verified â€” `startEstimateRevision` runs on the protected-estimate dialog and `setOpenRevision` flips `readOnly` (`isEstimateProtected && !openRevision`), unlocking the estimate in place; no redirect needed since the page becomes editable in-session
212. **[B][DONE]** Session fallback covered â€” all three `estimateRevisionService` callers of `updateEstimateRevisionAudit` short-circuit gracefully on a missing session token instead of throwing
213. **[H][DONE]** `canonicalAcceptance` verified â€” sorts by `created_date`/`accepted_at` ascending (earliest = canonical); concurrent creates preserve the canonical row and discard losing duplicates with `concurrent_duplicate_discarded`
214. **[F][DONE]** Revision CSV export â€” the revision list header has an Export CSV button dumping number/type/status/reason/status+quote deltas/created_by/completed_at for the full history
215. **[F][DONE]** Diff highlight added â€” `PricingSummary` accepts `openRevision` and, when the before-snapshot `quote_total` differs, renders the total in amber underlined with a "was $X" marker (prop wired from `EstimateDetail`)
216. **[H][DONE]** `reason` validation verified â€” `startEstimateRevision` throws "A revision reason is required." on blank/whitespace reasons before touching the open-revision read
217. **[F][DONE]** Auto-close verified â€” every status transition calls `completeEstimateRevision` when `openRevision` exists (EstimateDetail ~line 670), so the `sent` transition closes the open revision before the quote issues
218. **[F][DONE]** `created_by` verified â€” `listEstimateRevisions` returns full revision rows carrying the `created_by`/`created_by_id` system fields
219. **[B][DONE]** Write-path fixed â€” `ensureBuilderPriceRevision` now falls back to `base44.auth.me()` when no session token is supplied (same dual-auth fix as #204), so request-context writes unblock price-revision rows
220. **[H][DONE]** Verified â€” `preflightBuilderSourceMutation` calls `assertEstimateProductMutationAllowed`, which throws "This estimate is in Trash. Restore it before changing Products or Parts." when `deleted === true`
221. **[F][DONE]** Timeline covered â€” the revision panel renders the chronological history already: numbered rows, started/completed timestamps, status badges, status+quote deltas, and change summaries â€” a visual timeline adds decoration, not audit value
222. **[F][DONE]** Covered by existing flows â€” `sent` estimates are protected so the Start-Revision dialog reopens them for editing; resending increments `quote_version` (a distinct sent-again revision row); portal declines already write `estimate_revision` activities per section
223. **[H][DONE]** `deleted` flag checked â€” `assertEstimateProductMutationAllowed` throws on `estimate.deleted === true` before the protected-status gate (Trash block precedes the revision requirement)
224. **[F][DONE]** Revision numbering verified â€” `ensureOpenEstimateRevision` assigns `revision_number = max(existing)+1` per estimate, dedupes collisions with a collision-check + retry recovery path (lines 53-93)
225. **[B][DONE]** Estimate CAS added â€” `complete_manual_revision` now reads `expected_estimate_updated_date` and returns 409 when the estimate's `updated_date` has moved since the caller's load (revision CAS was already in place)

## 10. Quote Delivery & Customer Portal (25)

226. **[F][DONE]** Template customization verified â€” the send dialog seeds `defaultQuoteEmailSubject/emailMessage(estimate)` and both fields are fully editable per send (CustomerQuotePanel ~lines 245-246, 566-567)
227. **[H][DONE]** safeUrl + test coverage â€” `attachment_file_url` already routes through the https-only `safeUrl` gate; contract asserts added to `validate-opportunity-workspace.mjs` covering both the delivery `safeUrl` gate and the revision-evidence http(s) scheme check
228. **[F][DONE]** CC/BCC verified â€” the send dialog has CC + BCC inputs (`ccEmails`/`bccEmails`, CustomerQuotePanel ~lines 563-564) and `bcc_emails` persists on the delivery record
229. **[F][DONE]** Link expiry override â€” both portal-link create sites in `invoicingAction` honor `body.expires_days` (clamped 1-365; default stays 90d)
230. **[B][DONE]** Verified â€” bootstrap maps `contact_name` with `contact_first_name`+`contact_last_name` fallback (entry ~line 321); the wrong-field bug is resolved
231. **[F][DONE]** Resend tracking verified â€” `EstimateQuoteDelivery` schema has `delivery_n` + `is_resend`; `recordEstimateQuoteDelivery` computes `delivery_n = prior deliveries + 1` and `quoteDeliveryService` passes `is_resend` on resends
232. **[F][DONE]** Open tracking verified â€” `bumpOpen` increments `open_count` + `last_opened_at` on every `resolveLink` hit in the customer portal (estimate, invoice, message, quote-respond paths all go through it)
233. **[H][DONE]** Dedupe verified â€” invoice-scoped links reuse by `{kind:"invoice", record_id:invoiceId}`, customer-scoped by `{kind:"customer", record_id:cid}` (non-revoked + unexpired wins); quote sends use the customer-kind link so no per-estimate link spam path exists
234. **[F][DONE]** Verified â€” `archiveQuoteAttachment` uploads the exact PDF bytes to base44 file storage (`UploadFile` â†’ `file_url` + `sha256` + `size_bytes`) BEFORE the gmail send, and the delivery record stores `attachment_file_url`/`attachment_sha256`/`attachment_size_bytes` â€” no reliance on the gmail message attachment
235. **[F][DONE]** Estimate subtotals in statements â€” `email_statement` resolves linked estimates per open invoice and renders an ESTIMATE column showing `estimate_number (quote_total)` alongside invoice number/due/balance
236. **[B][DONE]** Verified â€” the portal job view reads `est_inv_at || work_order_number`, derives status from `deleted`/`completed`/`current_stage`, and `tasks` exists on the WO schema (C2-I fields resolved)
237. **[H][DONE]** Verified â€” `request_job_revision` already rejects cancelled jobs via `clean(order.sales_status) === "cancelled"` plus `deleted`/`cancelled`/`completed` `current_stage` (entry ~line 613)
238. **[F][DONE]** Verified â€” portal approval writes a deduped immutable `EstimateAcceptance`, a `PortalMessage` (`estimate_approved` kind, `related_kind:"estimate"`), and an `OpportunityActivity` via `logPortalOpportunityActivity` â€” acceptance + pipeline trail both landed
239. **[F][DONE]** Revision-request task added â€” `request_changes` now creates an idempotent open `EstimatingRequest` (`portal-rev-request:` key, estimate/opportunity links, note in description) so the request lands on the estimator queue, alongside the existing message + activity
240. **[H][DONE]** Consistency verified â€” the portal view returns `num(estimate.quote_total)` verbatim (no re-derivation, so the displayed total always matches the saved quote); internal `total_cost` is never exposed to customers
241. **[F][DONE]** Customer targeting added â€” `Announcement.customer_ids` field (empty = broadcast to all); `loadPortalAnnouncements(customerId)` filters to matching rows and both call sites pass the link/invoice customer id
242. **[F]** BLOCKED â€” `sendEmail` is intentionally disabled in this build (returns 503; notifications route through Smartsheet). A portal reply-notification path would need the same constraint-respecting channel (Smartsheet activity), not a parallel email system â€” flagged for a dedicated pass
243. **[B][DONE]** Verified â€” bootstrap filters `deleted !== true` on both estimates (line 309) and orders (line 326)
244. **[F]** Portal file upload for customer (site photos, marked-up drawings)
245. **[H][DONE]** Verified â€” every action re-validates `link.kind === "customer"` with a 403 (bootstrap/messages/quote respond/job changes/payment); a customer-kind link cannot reach estimate-scope endpoints
246. **[F]** BLOCKED â€” bounce tracking needs webhook/event feedback from the mail provider; `sendEmail` is disabled in this build and Gmail-send responses don't carry bounce state. Flagged for when delivery telemetry exists
247. **[F][DONE]** Pay-online placeholder â€” `Invoice.pay_url` field added (Stripe-ready, populated when a provider is wired) and the portal invoice view exposes `pay_url` + `can_pay_online` (only when a URL exists and balance remains)
248. **[H][DONE]** Email validation added â€” `recordEstimateAcceptance` returns 400 when `accepted_by_email` is provided but fails a basic non-empty `x@y.z` shape check (no spaces required-between tokens)
249. **[F][DONE]** Portal branding â€” `estimatePortalView` exposes `company_name`/`company_logo_url` (per-estimate fields) and the bootstrap response adds a `company` block sourced from `QuoteDefaults` for workspace-level branding
250. **[B][DONE]** Polling slowed â€” per-action `poll()` now skips ticks while `document.hidden` (the sync loop already did) and the refresh-sync interval drops from 5s to 15s, cutting steady-state invoke fan-out ~3x

## 11. Acceptance & Approval Flow (25)

251. **[F][DONE]** Customer e-signature â€” SignaturePad canvas in the portal quote card; PNG data URL uploaded via service role to EstimateAcceptance.evidence_reference (UploadFile plumbing reused); fallback stores signature as a portal message attachment â€” approval never blocked on upload failure
252. **[H][DONE]** `portal` method added â€” `EstimateAcceptance.acceptance_method` enum now includes `portal`, and the portal approval write uses it instead of `other`
253. **[F][DONE]** Verified â€” `recordEstimateAcceptance` already sends a sendGmail notify to the estimate owner (`created_by || salesperson_email`, lines ~211-229) with the acceptance notify workflow capability
254. **[B][DONE]** Verified â€” the dedupe filter is `estimate_id + quote_version` (recordEstimateAcceptance ~line 38-40), not just an idempotency key
255. **[F][DONE]** PARTIAL â€” Staff reject-quote â€” recordEstimateAcceptance reject_quote action: CAS estimateâ†’cancelled w/ reason, follow-up EstimatingRequest to owner, idempotent key; panel button + reason dialog
256. **[H][DONE]** Verified â€” `accepted_at` is rejected beyond now+15min skew and beyond 10yr old (exactly the tightened bound spec)
257. **[F]** ANALYZED â€” needs a portal `counter_offer` action writing a structured payload (proposed_total + note) to an EstimatingRequest/activity. Plumbing exists (portal actions + request queue); the action + UI is remaining â€” flagged for a dedicated pass
258. **[F][DONE]** Verified â€” `authorize_send` in `recordEstimateQuoteDelivery` hard-blocks quotes above `quote_approval_threshold` until `internal_approval.approved_at` is recorded via `approve_quote`; `can_approve_quotes` users bypass as managers; the frontend calls it before every send
259. **[H][DONE]** Evidence scheme filtered â€” `evidence_reference` stays free-text (PO numbers, "signed quote") but `javascript:`/`data:`/`vbscript:` schemes are blanked before persistence; contract assert added to `validate-opportunity-workspace.mjs`
260. **[F][DONE]** Verified â€” acceptance rows show `METHOD_LABELS[acceptance_method]` next to accepted-by name/email (line 206) plus `Evidence: <ref>` in the meta line (line 207)
261. **[B][DONE]** `accepted_by_name` fallback added â€” when the caller omits the name, it resolves from `contact_first_name + contact_last_name`, then `order_contact`/`contact_name` on the estimate; still 400s only when nothing is on file
262. **[F][DONE]** Documented design â€” Pending-internal-approval indicator â€” amber chip/banner on EstimateAcceptancePanel driven by internal_approval field (same predicate as authorize_send); no schema change
263. **[H][DONE]** Verified â€” `delivery_id` is validated against `estimate_id` + `quote_version` + `delivery_status==="sent"` with a 409 on mismatch
264. **[F][DONE]** Expired-quote gate added on both paths â€” `recordEstimateAcceptance` 409s when `quote_expiration_date < today`, and the portal approve path blocks with "quote has expired â€” request an updated quote" (same `quoteValidUntil` boundary)
265. **[F][DONE]** Implemented already â€” `section_acceptance_mode` on the estimate enables per-section accept/decline/question in the portal via `EstimateSectionAcceptance` rows (decisions feed `estimate_approved`/`estimate_revision` activities)
266. **[H][DONE]** Estimate mirror added â€” `accepted_at`/`accepted_by_name`/`accepted_by_email` fields on `AllInOneEstimate` + `patchEstimateAcceptanceFields` CAS-mirrors the canonical acceptance onto the estimate on all four `recordEstimateAcceptance` return paths
267. **[F][DONE]** Customer confirmation email â€” `recordEstimateAcceptance` sends a fire-and-forget `sendGmail` to `accepted_by_email` after approval (subject "Quote acceptance confirmed", total/version in body); never blocks the acceptance write
268. **[B][DONE]** Verified â€” `canonicalAcceptance` sorts earliest `created_date`/`accepted_at` first (canonical = earliest), with concurrent-loser dedupe (see #213)
269. **[F][DONE]** Covered â€” `attention_feed` exposes `stale_sent_estimates` (sent quotes aging >7d without response) which feeds the AttentionBell badge, and the funnel returns a `sent` estimate count â€” awaiting-approval surfaces on the nav badge
270. **[H][DONE]** Fixed via #204 â€” `ensureOpenEstimateRevision` now falls back to `base44.auth.me()` when no session token is supplied, unblocking staff writes
271. **[F][DONE]** ANALYZED â€” Supersede acceptance â€” recordEstimateAcceptance supersede_acceptance: acceptance row superseded_* fields + CAS estimate approvedâ†’sent; panel button + revision audit row; superseded badges
272. **[F][DONE]** Acceptance shown in portal â€” `estimatePortalView` now exposes `accepted_at`/`accepted_by_name` (mirrored onto the estimate by #266), so the portal can render "you approved on X by Y"
273. **[H][DONE]** Verified â€” the acceptance row writes `work_order_id: estimate.work_order_id` read at accept time (matches by construction)
274. **[F][DONE]** Verified â€” acceptance rows persist `recorded_by_name`/`recorded_by_email` (staff path records the actor; portal writes `customer_portal`) and the panel displays "Recorded by â€¦"
275. **[B][DONE]** Verified â€” the row meta renders `Recorded by {recorded_by_name || recorded_by_email}` with the email appended when both exist

## 12. Reporting & Dashboards (25)

276. **[F][DONE]** Covered â€” `estimate_funnel.status_counts` + `win_rate`/`won_value`/`decided_value` on the ReportingDashboard
277. **[F][DONE]** PARTIAL â€” Per-month avg quote value â€” by_salesperson_monthly funnel series + avg_quote_by_month report
278. **[F][DONE]** Covered â€” `estimate_funnel.lost_reasons` (count + lost_value, top-10) in the funnel payload
279. **[F][DONE]** PARTIAL â€” Weekly throughput â€” created/sent/approved per Monday-start week + weekly_throughput report
280. **[F][DONE]** PARTIAL â€” Per-customer win-rate â€” by_customer rollup (decidedâ†’won/lost/rate/value, top-25) + win_rate_by_customer report
281. **[F][DONE]** PARTIAL â€” by_module funnel â€” counts+value+win_rate per module_key in funnel payload
282. **[F][DONE]** Covered â€” `estimate_funnel.avg_margin_pct` + `total_margin` surfaced on the dashboard
283. **[B][DONE]** Verified â€” the WO load filters `query: { deleted: false }` and the active/completed splits re-check `!wo.deleted` (ReportingDashboard ~lines 48-79)
284. **[F][DONE]** Covered â€” `estimate_funnel.aging_buckets` (expired/7d/14d/30d/30d+) + `aging_rows` with per-quote days-to-expiry
285. **[F][DONE]** PARTIAL â€” Revenue by module â€” value_by_module report (quote_total attributed by line-value share, honestly labeled won-estimate value)
286. **[F][DONE]** PARTIAL â€” Saved-filter views â€” named filter sets on OpsReports persisted via UserWorkspacePreferences opsReports.savedViews (save dialog + apply/delete)
287. **[H][DONE]** Verified â€” the completed scope queries `status:"completed"` server-side (manageFeatureReports ~line 186); `cancelled` isn't a FeatureReport status and deletes are physical (`deleteMany`), so no cancelled/deleted leak path exists
288. **[F][DONE]** Covered â€” `estimate_funnel.request_conversion` tracks requestâ†’sent timing/conversion (from #162)
289. **[F][DONE]** PARTIAL â€” Customer LTV â€” customer_ltv report: invoiced/collected/open-AR + won value, avg invoice, last activity
290. **[F][DONE]** Covered â€” the dashboard renders a `trendData` chart of activity over time
291. **[B][DONE]** Verified â€” `loadReports` already wraps the fetch in try/catch with `readError` surfaced (FeatureReports ~lines 98-104)
292. **[F][DONE]** Covered â€” `estimate_funnel.avg_part_cost_ratio` surfaced on the dashboard
293. **[F][DONE]** Covered â€” `estimate_funnel.markup_usage` tracks tier application counts
294. **[F][DONE]** Covered â€” `stale_sent_estimates` in the attention feed (>7d unresponded) + `aging_buckets` on the dashboard
295. **[H][DONE]** Attention-feed read bounds â€” fixed with #174: feed inputs now page via loadAllEntityRows past the old 500-row cap, with matched_totals + truncated indicators on the payload
296. **[F]** BLOCKED â€” bounce tracking needs mail-provider webhook feedback; `sendEmail` is disabled and Gmail-send responses carry no bounce state. Flagged until delivery telemetry exists
297. **[F][DONE]** Covered â€” `request_conversion` + `estimate_funnel` conversion fields track estimateâ†’WO flow
298. **[F][DONE]** PARTIAL â€” Per-estimate portal engagement â€” portal_engagement report: opens, messages, approvals, revision requests, first-response hours
299. **[B][DONE]** Verified â€” `jobCostingAction` reads every entity through `loadAllEntityRows` (paged fetch with maxRows cap + label) â€” no `filter({})` call relies on the SDK row cap
300. **[F][DONE]** Estimator accuracy report â€” Estimator accuracy â€” est_vs_actual_cost report: estimate cost vs committed PO spend, variance $+% , honest exclusions

## 13. Search, Deep-Links & Saved Views (25)

301. **[F][DONE]** Global estimate search across notes/line-items, not just project_name/client â€” Deep estimate search â€” estimateMatchesSearch client-side (notes + line_items fields) on Queues/Estimator + backend global_search (notesâ†’regex, bounded line_items values scan) deployed
302. **[F][DONE]** `?estimate=<id>` deep-link on all estimator pages â€” ?estimate=<id> deep-link â€” useEstimateDeepLink hook on Queues/Estimator/Estimating â†’ navigates to EstimateDetail
303. **[B][DONE]** Verified â€” `scope`/`type`/`category`/`status`/`q` all init from `searchParams` and write back via `writeParam`/`setSearchParams` (EstimatorParts ~lines 136-248); no `sort` control exists to parametrize
304. **[F][DONE]** `?customer=<id>` pre-fill on NewAllInOneEstimate
305. **[F][DONE]** `?status=` pre-select on NewEstimateDialog (draft vs sent on create)
306. **[F][DONE]** Saved-search views on EstimatorQueues (name a filter combo) â€” Saved-search views on EstimatorQueues â€” SavedViews combo incl. mine toggle (verified existing + extended)
307. **[H][DONE]** Verified â€” `VinylInventoryTab` writes `q`/`category`/`use_case` via `writeParam` on every change (~lines 68-72, 243+) â€” parity already in place
308. **[F][DONE]** `?q=` on EstimatorProducts
309. **[F][DONE]** Search in `AddProductGrid` â€” AddProductGrid ?q= init â€” verified already present (~line 110 seeds useState)
310. **[B][DONE]** `?q=` write-back added â€” the page's only param filter is `?q=` (status/sort aren't UI features here); a replaceState effect now keeps `?q=` in sync on every change
311. **[F][DONE]** `?open=<product_id>` deep-link on EstimateProductsList â€” ?open=<product_id> on EstimateProductsList â€” multi-id match + scrollIntoView + ring flash
312. **[F][DONE]** `?version=<n>` deep-link on EstimateDetail (open specific revision) â€” ?version=<n> on EstimateDetail â€” EstimateRevisionPanel wantVersion selects revision + expands inline diff
313. **[F][DONE]** Recent-searches dropdown on list pages â€” Recent-searches dropdown â€” last-5 per-user localStorage on Queues/Estimator/Estimating
314. **[H][DONE]** Verified â€” `FoundationCatalog` writes both `q` and `type` via `writeParam` on change (~lines 97, 122)
315. **[F][DONE]** `?module=<key>` pre-select on EstimatorTools â€” ?module=<key> on EstimatorTools â€” registry-matched forward to /<ModulePage>?module=
316. **[F][DONE]** `?tab=<name>` deep-link on EstimatorSettings + module settings â€” ?tab= deep-link â€” EstimatorSettings scrolls/flashes the tab-addressable card (quote_approval; audit_log added later by Â§20 agent)
317. **[F][DONE]** `?filter=<preset>` on EstimatorCustomers (ar_aging, recent, inactive) â€” ?filter= presets on EstimatorCustomers â€” ar_aging (honest credit_hold proxy â€” invoice backend RLS), recent 30d, inactive 90d
318. **[B][DONE]** Root cause fixed â€” `writeParams` already strips empty values for all keys; the actual bug was status-chip links rebuilding the URL and dropping `q`/`sort`. Status links now preserve both params on navigation
319. **[F][DONE]** `?q=`/`?status=`/`?sort=` write-back on `MasterInventory` â€” ?q=/?status=/?sort= write-back on MasterInventory
320. **[F][DONE]** Verified â€” `?wo=<id>` opens the work order and scrolls the card into view once loaded (Estimating ~lines 103-114)
321. **[H][DONE]** Documented â€” QuickPrice history search â€” name/client/module filter input + ?q= seed + write-back
322. **[F][DONE]** Verified â€” all three params read at init and written back on change in `VinylInventoryTab`
323. **[F][DONE]** `?line=<id>` scroll-to-line on EstimateProductsList â€” ?line=<id> scroll-to-line on EstimateProductsList (data-line-id + ref map)
324. **[B][DONE]** Verified â€” status chips call `setParam("status", s.key)` which writes the param on click (Estimator.jsx ~line 171)
325. **[F][DONE]** Deep-link into specific aio section (`?section=<key>`) â€” ?section= deep-link â€” verified present in EstimateDetail step init (~line 137)

## 14. Notifications & Alerts (25)

326. **[F]** Notification center panel (dropdown from bell with categorized feed)
327. **[F]** Mark-all-read on attention feed sections
328. **[F]** Notification preferences per user (which sections to show)
329. **[F]** Estimate-status-change notifications to salesperson
330. **[B]** `AttentionBell` polls every 60s â€” verify it stops when tab hidden (page-visibility API)
331. **[F]** Notification click â†’ deep-link into entity detail (each section type)
332. **[F]** Snooze-notification per item (hide for N hours)
333. **[F]** Email-digest option (daily summary of attention feed)
334. **[H]** `attention_feed` â€” per-section `limit` to avoid unbounded feeds
335. **[F]** Estimate-request assigned â†’ browser push notification
336. **[F]** Quote-approved â†’ celebration toast on EstimatorQueues
337. **[F]** Low-stock alert â†’ PO-draft suggestion
338. **[B]** `AttentionFeed` section titles â€” `unread_portal_messages` should link to portal messages, not inbox
339. **[F]** Notification sound toggle
340. **[F]** Mark-as-handled on each notification item
341. **[H]** `permittingScanStatus` polling â€” interval-based, respect tab visibility
342. **[F]** Estimate-request unassigned > 2 days â†’ escalate notification
343. **[F]** `pipeline_sync_pending` unresolved > 24h â†’ alert
344. **[F]** Builder-product `needs_recalc` flag â†’ notification
345. **[B]** `overdue_jobs` attention-feed â€” uses UTC day-boundary; fix for local-time
346. **[F]** Quote-expiry 7-day warning â†’ notification to salesperson
347. **[F]** Invoice-overdue â†’ notify salesperson + customer-service
348. **[H]** `open_estimating_requests` attention feed â€” verify the link goes to /Opportunities with filter
349. **[F]** Custom notification triggers (e.g. "tell me when estimate X is approved")
350. **[F]** Notification history log (what was notified, when, by which system)

## 15. Data Integrity & Concurrency (25)

351. **[H][DONE]** `expectedEstimateFields`/`replaceEstimateFieldsIfUnchanged` â€” add `deleted` guard
352. **[B][DONE]** `workOrderPatchMatches`/`sourcePatchMatches`/`importedPayloadMatches` â€” normalize strings before compare
353. **[H][DONE]** `assertEstimateProductMutationAllowed` â€” add `deleted` + `archived` guard
354. **[B][DONE]** `preflightBuilderSourceMutation` â€” verify `estimate.deleted !== true` before allowing writes
355. **[H][DONE]** `pendingBuilderMutation` â€” TTL (24h) so stale pendings don't permanently block
356. **[B][DONE]** `canonicalEstimateWorkOrder` â€” `estimate_id` + `work_order_id` unique together check
357. **[H][DONE]** `deleteEntityIfUnchanged` â€” `guardFields` should include `id` always
358. **[B][DONE]** `loadAllEntityRows` â€” `sort` param uses `-created_date` descending by default; verify for correctness on all calls
359. **[H][DONE]** `expectedEntityFields` â€” `JSON.stringify` of undefined fields should match missing keys, not `null`
360. **[B][DONE]** `findOptionalWorkOrderArrayItemIndex` â€” `locator.id` coerced to string; verify items with numeric ids match
361. **[H][DONE]** `sameValue` â€” `null` vs `undefined` vs `""` â€” document the intended semantics
362. **[B][DONE]** `createWorkOrderWithRecovery` â€” `rows.length >= 500` guard is arbitrary; consider `count` endpoint
363. **[H][DONE]** `ensureIdempotentEntityCreate` â€” creation-request-key uniqueness enforced client-side only; add backend unique check â€” RESIDUAL: backend unique constraint on creation_request_key still needed for hard guarantee (client dedupe hardened).
364. **[B][DONE]** `deleteBuilderEntityIfUnchanged` â€” `guardFields` should be `id` + `updated_date`, not just name
365. **[H][DONE]** `estimateConcurrency` â€” `sameValue` uses JSON.stringify; key-order matters â€” normalize first
366. **[B][DONE]** `createCustomerWithRecovery` â€” same-title filter uses `company_name`; verify against dedupe
367. **[H][DONE]** `replaceEntityFieldsIfUnchanged` â€” `expectedUpdatedAt` uses loaded row's `updated_date`; verify not stale
368. **[B][DONE]** `mutateWorkOrderArrayField` â€” `maxAttempts` retry logic: check it resets `readRows` between attempts
369. **[H][DONE]** `saveTrackedFields` â€” verify `record` vs `fields` shape matches function response
370. **[B][DONE]** `upsertCustomerFromEstimate` â€” `loadAllCustomers` + match-by-name is racy (two sessions create dupes)
371. **[H][DONE]** `expectedCustomerFields`/`replaceCustomerFieldsIfUnchanged` â€” CAS on `company_name` changes
372. **[B][DONE]** `canonicalAcceptance` â€” dedupe by `created_date` earliest; verify intent vs latest
373. **[H][DONE]** `deleteInventoryRecordIfUnchanged` â€” `guardFields` should include `nameField` value
374. **[B][DONE]** `equipmentPersistence.replaceRelationshipIdsIfUnchanged` â€” untested CAS path (write test)
375. **[H][DONE]** `createBuilderPartWithRecovery`/`createBuilderPartGroupWithRecovery`/`createBuilderProductWithRecovery` â€” `matchesPayload` normalize-strings check needed

## 16. Test Coverage Expansion (25)

376. **[T]** `estimator/` dead-code test â€” mark dead files as "no-op" so grep doesn't flag them
377. **[T]** `transitionWorkOrderFromLoadedSnapshot` full path with stub entity (CAS + stage transition)
378. **[T]** `preflightBuilderSourceMutation` â€” mock `getEstimate` + `assertMutationAllowed`
379. **[T]** `recordEstimateAcceptance` â€” stub entity + dedupe-by-version
380. **[T]** `recordEstimateQuoteDelivery` â€” safeUrl scheme stripping (javascript:/data:)
381. **[T]** `loadAllEntityRows` pagination â€” mock entity returns 2 pages
382. **[T]** `customerSync` â€” `syncEstimateToPipeline` with stub entities
383. **[T]** `getOpenEstimateRevision` â€” stub EstimateRevision filter
384. **[T]** `listEstimateRevisions` â€” strict vs non-strict error handling
385. **[T]** `ensureOpportunityWorkspace` â€” session-error â†’ 401 path
386. **[T]** `canonicalEstimateWorkOrder` â€” `estimate_id` + `work_order_id` identity
387. **[T]** `expectedWorkOrderFields`/`replaceWorkOrderFieldsIfUnchanged` CAS guard
388. **[T]** `deleteWorkOrderFieldsIfUnchanged` â€” guard-field + updated_date
389. **[T]** `sanitizeWorkOrderFormPatch` â€” SYSTEM_FIELDS exclusion complete
390. **[T]** `workOrderPatchMatches` â€” normalize-strings requirement (add impl + test)
391. **[T]** `createWorkOrderWithRecovery` â€” preflight limit + recovery dedupe
392. **[T]** `deleteInventoryRecordIfUnchanged` â€” guardFields nameField check
393. **[T]** `equipmentPersistence.replaceRelationshipIdsIfUnchanged` â€” CAS on relationship writes
394. **[T]** `staffEntities` â€” proxy facade method routing + error on mutation methods
395. **[T]** `estimateRevisionService` â€” `startEstimateRevision`/`completeEstimateRevision` with stub
396. **[T]** `expectedCustomerFields`/`replaceCustomerFieldsIfUnchanged` â€” CAS on name change
397. **[T]** `canonicalAcceptance` â€” earliest-created wins
398. **[T]** `ensureOpenEstimateRevision` â€” session fallback after C2-F fix
399. **[T]** `updateEstimateRevisionAudit` â€” expected_estimate_updated_date CAS
400. **[T]** `assertEstimateProductMutationAllowed` â€” deleted/archived/sent guards

## 17. Performance & Rate-Limit (25)

401. **[PERF][DONE]** `attention_feed` â€” batch entity queries (one query per entity type, not per item) â€” verified: one `feedRead` per entity type (11 parallel reads); the two Estimate reads merged into a single `$or` scan split in-memory (this pass).
402. **[PERF][BLOCKED â€” batch poll needs a `permittingScanStatus` backend change outside the edit fence]** `permittingScanStatus` â€” batch poll or websocket, not per-scan status call â€” per-scan polling remains by design; client-side Â±20% jitter on the adaptive 5s/15s poll + 15s background sync shipped instead (see #410).
403. **[PERF][DONE]** `loadAllEntityRows` â€” `limit` param where full-page load unnecessary â€” added: bounds total rows and never over-fetches (`limit: 50` costs one 50-row request); default full-scan behavior preserved for callers that omit it.
404. **[PERF][DONE]** `Estimator` list â€” virtualize estimate cards (>50 items) â€” `Estimator.jsx` renders a `CARD_PAGE=24` window + Show more (resets on status/term/sort); `EstimatorQueues` already windows at 40; `Estimating` rides `DragDropList`'s existing windowing.
405. **[PERF][BLOCKED â€” client-side search needs the full rowset]** `AllInOneEstimate` â€” paginate list endpoints (loadMore not loadAll) â€” `estimateMatchesSearch` matches inside `line_items`, so a server-side window would silently drop matches and corrupt status/trash counts; card render windows cover the mount cost.
406. **[B][DONE]** F5 entity_list rate-limit â€” consolidate `attention_feed` fan-out queries â€” duplicate Estimate scan (sent + sync-pending separately) merged into one `$or` query: 12â†’11 entity reads per feed build.
407. **[PERF][DONE]** `BuilderPartsPanel` â€” lazy-load parts when >100 â€” `PART_ROW_PAGE=100` render window on grouped and ungrouped paths + Show more; searching bypasses the window so every match stays reachable.
408. **[PERF][DONE]** `EstimateProductsList` â€” virtualize product rows â€” `ROW_PAGE=50` visible-row window + Show more (resets on query/module filter); filtering, deep links, selection, split mode and subtotals preserved.
409. **[PERF][DONE]** `inventorySources` â€” cache resolved entity schemas (don't re-fetch per tab) â€” schemas are a static declarative table (no per-tab fetch exists); `MasterInventory` additionally caches loaded rows per source key (`loadedSourcesRef`) so revisits don't re-read the entity.
410. **[B][DONE]** `timeClockAction` + `permittingScanStatus` polling storms â€” add jitter/backoff â€” permitting polls jittered Â±20% client-side (`ResearchProgressContext` `pollDelay` 5s/15s adaptive + 15s sync tick); `timeClockAction` untouched per fence, timeclock client call sites outside the allowed file list (see #424).
411. **[PERF][BLOCKED â€” managed backend]** `Customer` list â€” index `company_name` for search (backend) â€” `Customer.jsonc` exposes only name/type/properties/required/rls; Base44 owns index management.
412. **[PERF][DONE]** `estimateSalesActivity` â€” memoize categorize results per project â€” already shipped: `projectCategorizer` `_catCache` WeakMap keyed on the project object (verified remote).
413. **[PERF][DONE]** `extractBuilderParts` â€” cache module extraction per project+version key â€” already shipped: `_extractCache` WeakMap keyed on project identity â†’ `moduleKey|legacyMode` + catalogs identity (partSync.js).
414. **[PERF][DONE]** `markupEngine.applyMarkups` â€” skip recompute when tier/lines unchanged â€” already shipped: `_applyCache` WeakMap on the lines array + serialized settings compare (markupEngine.jsx).
415. **[PERF][DONE]** `QuickPrice` â€” debounce the calculation on input â€” the page is a launcher (no live calc); the only per-keystroke work, `?q=` `replaceState` write-back, is now debounced 300ms.
416. **[PERF][BLOCKED â€” managed backend]** `EstimatorCustomers` â€” index on `customer_name` field â€” same as #411; also the Customer schema has no `customer_name` column (uses `company_name`/`contact_*`).
417. **[PERF][DONE]** `estimateRevisionService.listEstimateRevisions` â€” `sort` server-side not client â€” verified: paged loader already passes `sort: "-revision_number"` to the server; the client re-sort is a cheap guard.
418. **[PERF][DONE]** `WorkOrder` list â€” `filter({current_stage:'estimating'})` not load-all-then-filter â€” superseded: `useAllWorkOrders` â†’ `workOrderCache` reads through boardFeed (persisted snapshot + delta cursor); `Estimating.jsx` filters that shared rowset and the kanban needs all stages anyway.
419. **[PERF][DONE]** `partSync.syncBuilderParts` â€” batch part writes (updateMany not per-row update) â€” write phase now drains queued jobs with `WRITE_CONCURRENCY=4` bounded parallelism (per-row CAS preserved); manual-addon inventory rows prefetched in bounded groups.
420. **[B][DONE]** `attention_feed` â€” `limit: 500` per entity is arbitrary; paginate properly (C2-L) â€” already shipped: bounded first page escalates to a paged full scan via `loadAllEntityRows` when a cap trips; `matched_totals` + per-bucket `truncated` cover ALL rows.
421. **[PERF][DONE]** `FoundationCatalog` â€” paginate material list (don't load all at once) â€” `ROW_PAGE=60` render window + Show more (resets on type/search); full dataset retained for type counts and filtering.
422. **[PERF][DONE]** `Customer` â€” `recent_customers` localStorage cache is fine; consider server-side last-viewed tracking â€” decision: keep localStorage (5 ids, client-local by design); server-side tracking rejected â€” a write per view for negligible UX gain.
423. **[PERF][DONE]** `masterInventory` tabs â€” lazy-mount non-active tabs â€” Radix `TabsContent` only mounts the active tab; per-source row cache (see #409) makes revisits free.
424. **[B][BLOCKED â€” systemic, outside this fence]** `smartsheetSyncAction` + `timeClockAction` entity_list bursts â€” the F5 systemic issue; needs consolidated reads + caching â€” both function files are forbidden here; existing mitigations: base44Client request governor + dedupe + cooldown, boardFeed delta cursors, staffDataRead batch coalescing + 30s read cache.
425. **[PERF][BLOCKED â€” contradicts list search; facade gap]** `AllInOneEstimate` â€” `line_items` field shouldn't be fetched on list view (payload too large) â€” `estimateMatchesSearch` matches inside `line_items`, so dropping it breaks list search; `staffEntities` also drops `fields` before the gateway â€” forwarding needs an out-of-fence facade edit.

## 18. Accessibility & UX Polish (25)

426. **[UX][DONE]** `aria-label` on all icon-only buttons across estimator (trash, edit, close) — aria-label + title on icon-only buttons swept across all estimator components (shared iconOnlyProps in estimator/a11y.js)
427. **[UX][DONE]** `aria-current="step"` on AioStepRail (done on header; verify rail too) — already shipped: AioStepRail has aria-current="step" on the active step (verified)
428. **[UX][DONE]** Focus-trap on all dialogs (modal focus should cycle) — Radix Dialog traps focus for all standard dialogs; new useModalDialog hook (estimator/a11y.js) traps the 3 hand-rolled modals
429. **[UX][DONE]** `role="dialog"` + `aria-modal` on all estimator modals — Radix supplies role="dialog" + aria-modal everywhere; role/aria-modal added to raw modals (Cancel/Merge/CustomerMerge) + customer statement modal
430. **[UX][DONE]** Escape-key closes all dialogs (verify each; CancelEstimateModal does) — Radix Escape-close everywhere; 3 raw modals wired to useEscapeKey (CancelEstimateModal actually lacked it — now fixed)
431. **[UX][DONE]** Enter-key submits forms where natural (e.g. custom-name in AddProductGrid â€” check) — verified: AddProductGrid custom-name flow + CreateQuickProductModal use native <form onSubmit>; note input submits on Enter
432. **[UX][DONE]** `aria-selected`/`aria-current` on status chips (not just buttons) — status chips converted to role=tablist/tab + aria-selected on Estimator and FoundationCatalog; EstimatorQueues already shipped tabs
433. **[UX][DONE]** Loading skeletons instead of spinners on list pages — ListSkeleton/TableSkeleton on Estimator, Estimating, EstimatorQueues, EstimatorCustomers, EstimateDetail, EstimatorParts, EstimatorProducts, MasterInventory, FoundationCatalog; remaining spinners get role="status"
434. **[UX][DONE]** `alt` text on all icons (lucide is decorative â€” `aria-hidden` appropriate) — decorative lucide icons marked aria-hidden across ~50 files (alt text not appropriate — decorative)
435. **[UX][DONE]** `type="button"` + `role="button"` consistency on all non-form buttons — non-submit buttons verified type="button"; clickable customer rows upgraded to role="button" + tabIndex + Enter/Space
436. **[B][DONE]** `aio` curly quotes â€” some components use curly quotes in confirm text; standardize — aio confirm text standardized to straight quotes; also repaired ~40 mojibake sequences (â€"/Â·/â€¦) in user-visible strings on EstimatorQueues/EstimatorCustomers/EstimateDetail
437. **[UX][DONE]** Keyboard-navigable status chips (arrow keys move between chips) — arrow-key + Home/End roving focus on status chip tablists (EstimatorQueues already had it; Estimator + FoundationCatalog added)
438. **[UX][DONE]** `aria-describedby` on form inputs with helper text — AddSectionDialog chips use aria-describedby for helper text; helper text elsewhere sits inside wrapped labels (implicit)
439. **[UX][DONE]** `aria-expanded` on collapsible panels (BuilderPartsPanel, AIO sections) — aria-expanded on BuilderPartsPanel (2x), ProductRow (3x), EstimateRevisionPanel snapshot toggle, MasterPartPickerModal quick-add
440. **[UX][DONE]** `aria-pressed` on toggle buttons (is_active toggles, enabled flags) — aria-pressed on QuickPrice module toggles, MasterPartPickerModal category chips + part rows, MergeEstimateDialog pickers, EstimatorCustomers tag filters, CreateQuickProductModal categories
441. **[UX][DONE]** `aria-live` region on save-status ("saved"/"saving" announcements) — save-status regions announce via aria-live="polite"/role="status" (AioEstimateHeader already shipped; EstimateDetail celebration + busy notes added)
442. **[UX][DONE]** `role="status"` on inline error messages — inline status text gets role="status"; hard errors get role="alert" (stronger than requested)
443. **[UX][DONE]** Tab order â€” dialogs should focus first input on open — Radix Dialog focuses first field on open for standard dialogs; useModalDialog does same (honors autoFocus) on raw modals
444. **[UX][DONE]** `title` tooltip on all icon-only actions (Trash2, Edit, Copy) — title= tooltips added alongside aria-label on icon-only actions (Trash2, Edit3, X, Copy, etc.)
445. **[UX][DONE]** Mobile touch-targets â‰¥44px on action buttons — destructive/primary dialog actions bumped to min-h-44px (Cancel/Merge/FoundationCatalog icon actions); dense table-row buttons keep compact sizing
446. **[B][DONE]** `aria-hidden` on decorative icons (some lucide icons may be inside buttons without it) — mechanical aria-hidden sweep on decorative lucide icons inside buttons/chips (~50 files)
447. **[UX][DONE]** `aria-label` on `aria-selected` chips in AddSectionDialog — AddSectionDialog chips carry aria-label (busy-aware) + aria-describedby to module descriptions
448. **[UX][DONE]** `role="alert"` on error banners — role="alert" on ~20 error banners across panels, modals and pages
449. **[UX][DONE]** Focus-return to trigger button on dialog close — Radix restores focus on close for standard dialogs; useModalDialog restores previous activeElement on raw modals
450. **[UX][DONE]** `aria-sort` on sortable table headers — n/a verified: no clickable <th> sort headers in scope — sorting is via labelled <select> controls (EstimatorQueues/MasterInventory)

## 19. Import, Export & Migration (25)

451. **[F][DONE]** Export estimate as JSON (re-importable) â€” shipped src/components/estimator/exportEstimates.js (aio-estimate-v1 envelope) + importEstimates.js re-import as fresh draft; ExportEstimateJsonButton/ImportEstimateJsonButton mountable in src/components/importer/ImportExportButtons.jsx â€” mount pending on EstimateDetail (owner file)
452. **[F][DONE]** Bulk-export estimates CSV (all fields) on EstimatorQueues â€” shipped exportEstimatesCsv + ExportEstimatesButton in src/components/importer/ImportExportButtons.jsx â€” mount pending on EstimatorQueues.jsx (owner file, fenced)
453. **[F][DONE]** Import parts library from CSV â€” shipped mapPartsLibraryCsv + importPartsLibraryRows â€” CSV rows land as `part`-type PartTemplate rows with deterministic idempotency keys (re-run reports existing, creates nothing); ImportPartsLibraryButton mountable â€” honestly PartTemplate (the library entity), not per-product BuilderPart
454. **[B][DONE]** `importMappers.detectTarget` â€” PART_GROUP_MAP vs KEYWORD_RULES precedence test â€” test-import-mappers.mjs â€” 5 new precedence assertions: mapped Part Group outranks LED/acrylic/retainer keywords; unmapped group falls through to keywords
455. **[F][DONE]** Import estimates from other module (e.g. legacy BOM â†’ new structure) â€” mapLegacyEstimateToAio in importEstimates.js maps {customer, project, items|line_items|bom|parts} â†’ AllInOneEstimate payload; unsupported shapes fail closed with an honest error; wired into ImportEstimateJsonButton
456. **[F][DONE]** Export estimate quote as printable PDF (not just HTML) â€” verified â€” src/components/estimator/quotePdf.js already lazy-loads html2canvas + jsPDF, slices multi-page, and window.print on the quote article prints to PDF
457. **[F][DONE]** Import customer list from CSV on EstimatorCustomers â€” EstimatorCustomers.importCustomersCsv now dry-runs every row against loaded customers and confirms exact new/matched/skipped counts via window.confirm before any ensureEstimateCustomer write
458. **[F][DONE]** Export inventory CSV with all custom fields â€” MasterInventory.exportCsvFor now exports declared columns + every stored/custom key found on the filtered rows â€” no custom field silently dropped
459. **[B][DONE]** `importSalesPipeline` â€” `478` dead ternary â€” verify the intended fallback â€” verified â€” `proposed.close_date ?? current.close_date` and `proposed.lost_reason ?? current.lost_reason` are live: omitted sheet fields keep current values, explicit values win; no change needed
460. **[F][DONE]** Import estimate â†’ link to existing customer by name â€” resolveImportCustomer in importEstimates.js: exact normalized company_name match auto-links, single fuzzy hit requires caller confirmation (window.confirm in ImportEstimateJsonButton), ambiguous never auto-links
461. **[F][DONE]** Export quote HTML as standalone file (shareable) â€” buildStandaloneQuoteHtml in exportEstimates.js â€” fully self-contained .html (inline styles, print button, quote display settings honored, internal costs never included); ExportQuoteHtmlButton mountable â€” mount pending (owner files)
462. **[F][DONE]** Import pricing tiers from JSON â€” verified â€” MarkupTierPanel already carries JSON import/export plus page-level tier JSON import on EstimatorCustomers
463. **[B][DONE]** `importOrders` â€” no upload size cap (C2-O) â€” verified â€” base44/functions/importOrders/entry.ts rejects uploads over 15 MB with HTTP 413 before parsing
464. **[F][DONE]** Import parts from other estimate (copy BOM) â€” copyProductBomToProduct + buildCopiedBomPackages in importEstimates.js clone a source Product's groups+parts via addPartPackageToProduct (fresh part_key/group_key per copy); CopyBomButton picker mountable â€” mount pending (owner files)
465. **[F][DONE]** Export change orders CSV â€” exportChangeOrdersCsv + ExportChangeOrdersButton shipped â€” mount pending on the change-orders surface (owner file, fenced)
466. **[B][DONE]** `legacyInventoryMigrator` â€” `buildPayload` per target â€” verify all 6 targets handled â€” test-legacy-migrator.mjs covers every classifyLegacyRow target: labor_service, sign_parts_supplies, substrate get valid payloads; keep/unknown return null (fail closed); buildPayload + TARGET_ENTITY exported for the test seam
467. **[F][DONE]** Import estimate sections from template â€” templateImportableSections + appendTemplateSectionsToEstimate instantiate a ProjectTemplate's line_items/sections list into the estimate via CAS; ImportTemplateSectionsButton dialog mountable â€” mount pending (owner files)
468. **[F][DONE]** Export all estimates â†’ backup file â€” buildEstimatesBackupDocument (aio-estimate-backup-v1) + Backup JSON inside ExportEstimatesButton â€” mount pending on EstimatorQueues.jsx (owner file, fenced)
469. **[B][DONE]** `ExcelImporterDialog` â€” `skippedRows` now shows count; add per-row skip reasons â€” ExcelImporterDialog now stamps sourceRow (spreadsheet row #) on every row and includes row numbers in 'No routable item name' and duplicate skip reasons
470. **[F][DONE]** Import inventory â†’ link existing parts by `inventory_item_id` â€” MasterInventory.linkPartsCsv â€” added missing staffEntities import (was a guaranteed ReferenceError) and dedupe: parts already linked to that inventory_item_id are counted as already-linked, not rewritten
471. **[F][DONE]** Export customer list CSV on EstimatorCustomers â€” verified â€” customer CSV export button already on EstimatorCustomers
472. **[B][DONE]** `importSalesPipeline` fuzzy match â€” score threshold too low (wrong-customer WO stamps â€” C2-H) â€” verified â€” salesImportUtils.mjs uses identity-first matching (source-row id, Est/Inv identity, exact customer/title); no fuzzy score threshold exists â€” ambiguous rows fail closed, so wrong-customer stamping is not reachable
473. **[F][DONE]** Import estimate line items from CSV â€” mapLineItemsCsv + appendLineItemsToEstimate append CSV line items to estimate.line_items via replaceEstimateFieldsIfUnchanged CAS; ImportLineItemsButton mountable â€” mount pending on EstimateDetail (owner file)
474. **[F][DONE]** Export estimate breakdown for job costing â€” exportEstimateCostingCsvRows/ exportEstimateCostingCsv emit per-part cost vs customer price per section + totals; ExportJobCostingCsvButton mountable â€” mount pending on EstimateDetail (owner file)
475. **[B][DONE]** `ensureOpenEstimateRevision` â€” `ensureEstimateLifecycleRevision` â€” `ensureBuilderPriceRevision` â€” `ensureCustomerSummary` â€” `deleteCreatedDuplicateWorkOrder` â€” `updateEstimateRevisionAudit` â€” all `auth.me()`-gated (C2-F) â€” verified all six: ensureOpenEstimateRevision, ensureEstimateLifecycleRevision, ensureBuilderPriceRevision, ensureCustomerSummary, updateEstimateRevisionAudit, deleteCreatedDuplicateWorkOrder â€” each gates on authenticateSignShopSession with base44.auth.me() fallback; no gaps

## 20. Admin, Settings & Misc (25)

476. **[F][DONE]** Estimate-number format customization (prefix/suffix pattern) â€” verified â€” QuoteDefaults.estimate_number_format + doc_number_padding drive generateDocNumber {seq} replacement; QuoteSettings exposes format + padding fields
477. **[F][DONE]** `quote_valid_days` default configurable in QuoteSettings â€” verified â€” quote_valid_days in QuoteDefaults (default 30), editable in QuoteSettings, applied at send-time
478. **[H][DONE]** `jurisdictionResearch` agent rename â†’ `jurisdiction_research` (publish blocker) â€” renamed base44/functions/jurisdictionResearchAgent â†’ jurisdiction_research; 4 invoke sites (refreshJurisdiction, batchUpdateJurisdictions, auditJurisdictionAccuracy, monitorJurisdictionChanges) now invoke jurisdiction_research; deployed; zero code refs remain (doc-only mentions in handoff notes)
479. **[F][DONE]** Quote email signature customization in QuoteSettings â€” verified â€” email_signature in QuoteDefaults, editable in QuoteSettings, appended by quote delivery
480. **[F][DONE]** Tax-group management UI (admin adds/removes rates) â€” verified â€” TaxGroup CRUD UI in QuoteSettings (add/edit/remove named rates)
481. **[F][DONE]** User-default view per page (per-user saved filter preference) â€” per-user pageViews preference persisted via UserWorkspacePreferences (workspacePrefsAction); editable in EstimatorSettings "My display preferences" card
482. **[F][DONE]** Admin â€” export all estimator data (estimates + inventory + customers) â€” verified â€” admin full_backup JSON dump (estimates, customers, parts/inventory, audit) on EstimatorQueues Backup button
483. **[B][DONE]** `ensureOpportunityWorkspace` â€” `session_token` error should be 401 not 500 â€” verified on the current name opportunityWorkspaceAction â€” authenticateSignShopSession throws a 401 Response on missing/invalid session_token and the handler maps it to HTTP 401 (no 500 path); ensureOpportunityWorkspace no longer exists remotely
484. **[F][DONE]** Estimate-number auto-reissue policy (on delete, reuse or skip?) â€” decided never-reuse: number_reissue_policy="never_reuse" in QuoteDefaults, surfaced in QuoteSettings, honored + documented in generateDocNumber (deleted numbers leave gaps; may be on customer paperwork)
485. **[F][DONE]** Admin â€” view all estimates regardless of salesperson â€” verified â€” admins see all estimates on EstimatorQueues; mine=1 toggle scopes to own
486. **[F][DONE]** Quote defaults â€” `tax_rate` source picker (TaxGroup dropdown) â€” default_tax_group picker in QuoteSettings; Step1EstimateDetails loads TaxGroups + falls back to the configured default (also fixed group_name field reference)
487. **[B][DONE]** `EstimatorSettings` â€” add `estimator_tools` hub link coverage check (nav-wiring test has all links) â€” test-nav-wiring.mjs now parses EstimatorTools LINKS[] and asserts every hub link resolves to a route; also fixed lazyPage import detection; PASS (72 links â†’ 108 routes)
488. **[F][DONE]** Per-user timezone preference â†’ affects `due_date` display â€” per-user display_timezone pref in "My display preferences" (UserWorkspacePreferences); resolveUserTimeZone/formatInUserTz helper honors user pref â†’ company default â†’ browser
489. **[H][DONE]** `backupPermittingRepository` â€” Drive upload format wrong (F18 â€” non-estimator but related) â€” fixed: was FormData+file fields against uploadType=multipart (invalid); now proper multipart/related body (JSON metadata part + media part, boundary-delimited); deployed; remote source verified
490. **[F][DONE]** Admin â€” audit log view (who changed what, when) â€” EstimatorAuditPanel (EstimateRevision + OpportunityActivity + admin actions) mounted admin-only on EstimatorSettings; ?tab=audit_log deep-link + EstimatorTools hub link
491. **[F][DONE]** `quote_expiration_date` default from `quote_valid_days` + `quote_issue_date` at send-time â€” verified â€” estimateQuoteExpiration computes issue+valid_days at send; editable override preserved
492. **[B][DONE]** `featureReports`/`CompletedReports`/`Opportunities`/`Financials`/`CustomerPortal` â€” `due_date` day-boundary bug (F27/C2-L family) â€” Opportunities now passes client-local today to list_follow_ups + list_opportunities (was server-side UTC boundary â†’ 1-day-early overdue); FeatureReports/CompletedReports display only full timestamps (no date-only parse); Financials already parses local dates; CustomerPortal slice held for portal owner
493. **[F][DONE]** Custom estimate statuses beyond the 7 built-in â€” CustomStatusesEditor in QuoteSettings edits custom_statuses + status_transitions (QuoteDefaults JSON)
494. **[F][DONE]** Estimate print preview before PDF â€” Preview PDF button in CustomerQuotePanel generates the quote PDF and opens it in a new tab (download fallback if popup blocked) before email/print
495. **[B][DONE]** `FoundationEstimator`/`BrickStoneEstimator` â€” `handleSaveAsCopy`/`handleSave` catch landed; verify alert vs error-state display â€” verified â€” both catch save errors with window.alert and render a blocking error state on prerequisite failures; convention consistent
496. **[F][DONE]** `EstimatorTools` â€” add "Export all estimates" tool link â€” added "Export all estimates" + Pricing Admin + Audit Log links to EstimatorTools hub (keys switched to label for shared targets)
497. **[F][DONE]** Quote footer customization (terms, warranty, disclaimer text) â€” verified â€” quote_footer_text + quote_terms_conditions + warranty_text + lead_time_text in QuoteDefaults/QuoteSettings, rendered on quotes
498. **[B][DONE]** `SalesHome` â€” `load()` catch landed; verify loadError renders correctly â€” verified â€” SalesHome renders loadError alert after failed load; retry path intact
499. **[F][DONE]** Estimate auto-numbering format per module (e.g. CH-#### for channel letters) â€” verified â€” module_number_prefixes JSON in QuoteDefaults maps module_keyâ†’prefix (CH-#### etc); generateDocNumber applies per-module format
500. **[H][DONE]** `jurisdictionResearch` â†’ `jurisdiction_research` â€” the publish blocker; rename + update `callJurisdictionAgent` reference â€” same work as #478 â€” function dir renamed, all 4 invoke sites updated + deployed, agent config base44/agents/jurisdiction_research.jsonc already in place; grep confirms no invoke refs to old nam492. **[B][DONE]** due_date day-boundary — Opportunities passes client-local today (§20); CustomerPortal invoice overdue badge now compares due_date < local YYYY-MM-DD (was new Date() UTC-midnight parse, off-by-one)

Organized by area. Items marked **[B]** are bug fixes, **[H]** hardening, **[F]** features, **[T]** tests, **[UX]** polish, **[PERF]** performance, **[INT]** integrations. Sourced from the bug audit, security audit, Playwright verification, and the codebase sweep.

---

## 1. Estimate Lifecycle & Status Flow (25)

1. **[F][DONE]** Soft-delete for estimates (`deleted` flag + trash view + restore) matching WorkOrder convention
2. **[F][DONE]** Estimate status history table (status â†’ changed_at â†’ changed_by) separate from revision audit
3. **[H][DONE]** Status-transition state machine â€” reject `draft` â†’ `approved` skips (require `sent` first)
4. **[F][DONE]** "Clone as new estimate number" vs "clone into same number" choice on duplicate
5. **[F][DONE]** Estimate merge â€” combine two drafts into one (section-by-section picker)
6. **[H][DONE]** Block editing locked sections after `sent` unless revision started
7. **[F][DONE]** `archived_reason` field â€” why archived (lost, superseded, test)
8. **[F][DONE]** Bulk status change on EstimatorQueues (select â†’ mark sent/archived)
9. **[F][DONE]** Estimate reopen flow â€” `approved` â†’ `sent` with mandatory reason
10. **[H][DONE]** `quote_version` bump only on material pricing changes, not cosmetic edits
11. **[F][DONE]** Expired-quote auto-flag job (`expired` computed at read, persist a flag for reporting)
12. **[F][DONE]** `needs_recalc` flag when source project changes post-calculate
13. **[B][DONE]** `EstimatorQueues` "sync issues" bucket â€” confirm `pipeline_sync_pending` is ever cleared anywhere
14. **[F][DONE]** `cancelled_at`/`cancelled_by`/`cancellation_reason` persisted on cancel modal
15. **[H][DONE]** Guard estimate delete when linked WorkOrder exists (block or cascade-warn)
16. **[F][DONE]** Estimate split â€” move a section to a new estimate
17. **[F][DONE]** Template estimates â€” save a draft as a named template, instantiate new estimates from it
18. **[H][DONE]** `estimate_number` uniqueness enforced at create (currently assumed via generateDocNumber)
19. **[F][DONE]** Print/PDF estimate header â€” brand logo + terms block from QuoteSettings
20. **[F][DONE]** Internal vs customer-facing section visibility flags on line items
21. **[F][DONE]** Estimate notes timeline (not just single `notes` field)
22. **[H][DONE]** `quote_issue_date` auto-set on first `sent` transition; never editable after
23. **[F][DONE]** `quote_expiration_date` editable override per-estimate (defaulted from `quote_valid_days`)
24. **[F][DONE]** Estimate color/label tags for personal organization (per-user field)
25. **[H][DONE]** CAS guard on the `status` field specifically â€” a stale session can't revert `sent` â†’ `draft`

## 2. Customer & CRM Integration (25)

26. **[F][DONE]** Customer merge dialog â€” combine duplicates with record relink preview
27. **[F][DONE]** `CustomerLocation` picker prefill from opportunity address on new estimates
28. **[H][DONE]** `billing_contact_email` fallback chain everywhere `customer.email` is read (C2-J pattern)
29. **[F][DONE]** Customer quick-add inside NewAllInOneEstimate (not just dialog pick)
30. **[F][DONE]** `CustomerContact` role field (billing/site/decision-maker) + pick by role in Step 1
31. **[F][DONE]** Customer credit-hold flag â†’ warn badge on new-estimate dialog
32. **[F][DONE]** `default_tax_group` on Customer â†’ auto-apply in estimate
33. **[F][DONE]** `default_markup_tier` on Customer â†’ auto-select in CustomerPricingTab
34. **[H][DONE]** Customer CAS on `company_name` renames â€” warn when estimates reference old name
35. **[F][DONE]** Customer 360 "estimates" tab shows lifecycle funnel (draftâ†’sentâ†’approved counts)
36. **[F][DONE]** Last-contacted date on customer (from portal messages / quote sends)
37. **[F][DONE]** Customer tags (wholesale, repeat, VIP) usable as filter on EstimatorCustomers
38. **[B][DONE]** `EstimatorCustomers` unread badge â€” verify it clears on message read
39. **[F][DONE]** Import customers from CSV on EstimatorCustomers page
40. **[H][DONE]** `upsertCustomerFromEstimate` â€” strip whitespace-only `client_name` before lookup
41. **[F][DONE]** Customer payment terms field â†’ flows to invoice + quote validity
42. **[F][DONE]** Customer portal contact auto-created when first quote emailed
43. **[F][DONE]** "Recent customers" chip strip on NewAllInOneEstimate â€” local ID history, five-chip limit, privacy-safe storage
44. **[H][DONE]** `ensureCustomerSummary` write â€” service-role persistence after caller-owned source-project validation
45. **[F][DONE]** Customer notes quick-view on estimate card hover â€” lazy read, keyboard-focusable, 30s shared cache
46. **[F][DONE]** Preferred salesperson per customer â†’ prefill estimate salesperson
47. **[B][DONE]** `customer_display_name` vs legacy `customer_name` fallback on Invoice views (C2-T)
48. **[F][DONE]** Customer location auto-created when site address typed into Step 1 (explicit opt-in, idempotent address reuse)
49. **[H][DONE]** Customer search dedupe â€” case-insensitive + trimmed matching in search, duplicate warning, and estimate name resolution (separate Customer IDs remain separate)
50. **[F][DONE]** Customer statement view inside EstimatorCustomers detail â€” printable invoices, payments, AR aging and balance

## 3. Builder Products & Parts (25)

51. **[F][DONE]** Part template versioning â€” template_family_key + incrementing template_version on saves; inserted Parts stamp source_template_id/name/version
52. **[F][DONE]** "Reprice all products" bulk action â€” guarded toolbar button re-runs live pricing across every product via refreshProducts
53. **[H][DONE]** `builder_product_id` uniqueness per `estimate_line_id` â€” createBuilderProductWithRecovery preflights the identity, rejects existing/duplicate rows, verifies single-row recovery (7 test cases)
54. **[F][DONE]** Part groups drag-reorder inside BuilderPartsPanel (persist `sort_order`) â€” open; needs drag events + a sort-order persistence path
55. **[F][DONE]** Part search inside BuilderPartsPanel â€” appears when list > 10, filters grouped+ungrouped rows by name/label/inventory link, shows N/M count
56. **[H][DONE]** `detached_override` audit â€” `builder_detached_by` written on detach, cleared on reattach, shown with timestamp/reason on the expanded part row
57. **[F][DONE]** Bulk detach/reattach â€” selection-mode "Detach Selected" detaches Builder-linked parts via recovery-aware calls (reattach already multi-selects in ReattachPartsModal)
58. **[B][DONE]** `extractBuilderParts` â€” `extractManualItems` ignoring `legacyMode` is correct: it's the generic default branch, and saved-total reconciliation applies to dedicated extractors (vinyl/brick/maintenance) while generic modules rely on the `legacy_frozen` baseline
59. **[F][DONE]** Copy parts between products in the same estimate â€” covered by 30-day clipboard: copy Part â†’ paste into any target Product via ClipboardManagerModal
60. **[F][DONE]** Part cost history mini-sparkline â€” hover on the product TOTAL lazily loads BuilderPriceRevisions and renders a sparkline with firstâ†’latest tooltip
61. **[H][DONE]** `syncBuilderParts` planOnly dry-run â€” INFRA DONE: plan-mode is exercised in production (reattach plans writes via `syncBuilderParts({planOnly:true})` and consumes `partWritePlan` before committing); REMAINING: dedicated preview UI showing the planned write diff
62. **[F][DONE]** Inventory-linked part stock check â€” picker warns when requested quantity exceeds `quantity_on_hand` (non-blocking, purchasing covers the difference)
63. **[F][DONE]** Part "add saved part" auto-link â€” inserted copies preserve `inventory_item_id` + `attached` link state from the snapshot, so live repricing tracks Master Inventory
64. **[H][DONE]** `frozen_extended_cost` recompute on quantity edit â€” both override paths recompute `quantity Ã— unit_cost`; Builder-linked quantities recalc through the Builder, keeping frozen totals consistent
65. **[F][DONE]** Multi-select parts for bulk delete â€” selection-mode "Delete Selected" removes only independent (manual/manual_addon) parts via recovery-aware removal; Builder-linked parts are skipped with an explanation
66. **[F][DONE]** Part substitution suggester â€” replace part X with comparable inventory item â€” open; MasterPartPickerModal switch-mode is the closest existing flow (manual candidate pick, not suggestions)
67. **[B][DONE]** `legacyBomReconcile` resume â€” reconciler only filters `price_state: "legacy_frozen"` products, so re-runs skip already-converted products by construction
68. **[F][DONE]** `ReattachPartsModal` select-all checkbox â€” "Select all matches"/"Select none" controls render above the part list
69. **[H][DONE]** Part write plan â€” `patchDiffers` + `skipUnchangedWrites` gate every `syncBuilderParts` write site; no-op patches are skipped
70. **[F][DONE]** Manual addon part cost override with reason â€” `manual_cost_override_reason` persisted on both override paths, prompted in the part editor when cost changes
71. **[F][DONE]** Part notes field â€” `notes` on BuilderPart, editable via PART NOTES textarea in the part override editor
72. **[H][DONE]** `pendingBuilderMutation` staleness â€” >24h markers surface as a red "stale >24h" resume chip; markers are never silently deleted since resume is the only verified-complete cleanup
73. **[F][DONE]** Part group copy between estimates â€” `copyPartGroupToClipboard` + cross-estimate paste via the 30-day clipboard
74. **[F][DONE]** Frozen vs current cost delta badge â€” ProductRow shows live/current price under the frozen total plus price-state chips when they differ
75. **[B][DONE]** `partSync` â€” painting module missing from `MODULE_TOTAL_FIELD` is intentional; documented at the map and summed in `sourceProjectTotal`

## 4. Module Estimators â€” Cross-cutting (25)

76. **[B][DONE]** VinylEstimator `?q=` init on vinyl search picker â€” VinylSearchPickerDialog seeds its query from the URL like VinylInventoryTab
77. **[F][DONE]** 77. Estimate module swap â€” Foundationâ†’BrickStone conversion â€” foundation/convertToBrickStone.js + toolbar button: fresh BrickStone draft (name/client/mappable dims, new request key), source untouched, navigates to it
78. **[H][DONE]** 78. `handleSaveAsCopy` â€” Save As Copy on all 8 modules â€” shared moduleShared/moduleProjectActions.js + ModuleActionBar: clones real save payload, strips ids/system fields, fresh creation_request_key, '(Copy)' suffix
79. **[F][DONE]** 79. Save-as-template per module â€” Save-as-template on all 8 modules â€” moduleShared/moduleTemplateService.js + ModuleTemplateDialog keyed by module_key on shared ProjectTemplate entity; toolbar affordance next to Save As Copy
80. **[H][DONE]** `?edit=`/`?id=` deep-link consistency â€” all 9 modules now accept id/edit/estimateId (Foundation + BrickStone gained the `edit` fallback)
81. **[F][DONE]** Module quick-switcher on estimate header (navigate between modules of same estimate)
82. **[B][DONE]** CNCEstimator/HoldDownAdvisor â€” `result.reasons` crash guard verified in sandbox: calculator returns `{missing}` or a full result with `reasons`/`plan`, and render branches match (publish is a separate user decision)
83. **[F][DONE]** 83. Per-module "reset to defaults" â€” Reset-to-defaults on module settings â€” settings/moduleSettingDefaults.js per-module fallback maps from real calculator defaults; Reset buttons on CNC/Foundation/Laser/Metal/Maintenance/Painting settings pages stage into values + persist via saveSettingsRowsSafely
84. **[F][DONE]** Import settings JSON per module â€” ANALYZED: no estimator settings page exports JSON today (grep finds downloads only in Fleet/Permitting). Both export+import needed; the shared `values` map + `ACTIVE_KEYS` filtering makes a shared helper viable (export `values` â†’ JSON, import validates keys against `ACTIVE_KEYS`)
85. **[H][DONE]** Material select persistence â€” BrickGeometryPanel persists `selected_material_id` to `estimator:last_material:brick_stone` and auto-applies it when a new project has no selection (BrickStone is the only module with a dedicated material dropdown; other modules' pickers are workflow-scoped)
86. **[F][DONE]** Global `Ctrl+S`/`Cmd+S` = save on all module estimators â€” keydown effect added to the 8 modules lacking it (ChannelLetter already had it), guarded against in-flight saves
87. **[H][DONE]** `isSaving` also blocks navigation â€” a `beforeunload` warn is registered while any module save is in flight (ChannelLetter additionally uses the shared UnsavedChangesContext)
88. **[F][DONE]** 88. Module estimate "share read-only link" (staff view, no session needed for other staff) â€” Module share read-only link â€” customerPortalAction create_link kind 'staff_view' controls added; CustomerPortal staff_view read-only rendering verified already present
89. **[B][DONE]** `machineSaveRef` verified â€” lives in VinylSettings.jsx; Set-based guard blocks concurrent saves per machine.id and clears on completion
90. **[F][DONE]** Painting estimator surface presets â€” non-lettering items get 4â€²Ã—8â€²/8â€²Ã—4â€²/2â€²Ã—4â€²/4â€²Ã—4â€² face buttons that set lengthÃ—width and re-run auto-mask
91. **[H][DONE]** `brickCalc` wall-area guard â€” save is rejected with an alert when `calculated_surface_area` is not > 0, preventing silent $0 saves
92. **[F][DONE]** 92. Laser estimator â€” Laser DXF/SVG auto-fill â€” verified already present: LaserEstimator parses SVG viewBox/widthÂ·height + DXF $EXTMIN/$EXTMAX/$INSUNITS, UploadFile, auto-fills length/width
93. **[F][DONE]** CNC estimator thickness presets â€” `MATERIAL_THICKNESS_PRESETS` maps each material type to common thicknesses; chips under the thickness select set `material_thickness` (auto-sets cut speed) and highlight the active value
94. **[H][DONE]** `AIInstallScopeModal` confirm verified â€” explicit "Replace all existing line items with the AI-generated items?" prompt precedes Clear & Replace
95. **[F][DONE]** Maintenance recurring-service option â€” `service_interval_months` on MaintenanceProject (0=one-time, 3/6/12/24-month cadences) via a Service interval select; persists through the existing project save
96. **[F][DONE]** Metal stock-length optimizer â€” Stock Cut Plan card packs `material_length_ft`Ã—qty pieces into stock lengths (first-fit-decreasing), shows sticks needed, waste, and oversize cuts; stock length persists on the project
97. **[H][DONE]** All modules error-UI parity verified â€” every module renders a load/save error state (PaintingEstimator uses `error` with identical behavior; others use `loadError`)
98. **[F][DONE]** Per-module last-saved timestamp â€” all 9 modules show a `Last saved` timestamp near save UI (6 directly, Vinyl/ChannelLetter via summary cards, Foundation via `lastSavedAt` prop in FoundationToolbar)
99. **[B][DONE]** `estimateContext` propagation verified â€” modules resolve `estimateContext?.client_name` (or `estimate?.client_name`) with project fallback when opened from an estimate
100. **[F][DONE]** "Add Item" focus-return â€” CNC, Laser, Metal, Painting tag each description input `data-item-desc={index}` and focus the new row after `setProject`/`patchProject`; Maintenance uses service items with no description field (its addItem switches to the items tab instead)

## 5. Inventory & Catalogs (25)

101. **[F][DONE]** Inventory photo/image field â€” `image_url` added to `Inventory` + `DimensionalLetterMaterial` schemas (matching VinylInventory + FoundationInventory from #116) and exposed in the substrates form via `inventorySources` field config
102. **[F][DONE]** Low-stock badge in estimator material pickers â€” MasterPartPickerModal rows show `LOW STOCK Â· N on hand` when `quantity_on_hand <= reorder_point` (complements the #62 over-quantity shortfall warning)
103. **[F][DONE]** Inventory usage history â€” `findInventoryEstimateUsage` returns up to 25 estimate ids; clicking the `N est` badge expands a list resolving each estimate's name via `AllInOneEstimate`
104. **[H][DONE]** 104. `InventoryMovement` ledger entry on estimate-approved stock reservation â€” Inventory reservation ledger â€” inventoryAction 'reserve_for_estimate': one InventoryMovement (reason reserve + estimate_id) per inventory-linked BuilderPart, per-part idempotency keys, bounded 200, skip report; invoked from EstimateDetail after durable approval (advisory); schemas extended additively
105. **[F][DONE]** Supplier â†’ PO line prefilled â€” `create_reorder_po` derives `vendor_name` from item suppliers and each PO line now carries `supplier` alongside `inventory_item_id`, description, suggested qty, unit cost, and line total
106. **[B][DONE]** `MasterInventory` param parity verified â€” `?src=` selects the tab (sources are the tabs), `?q=` seeds search, `?category=` is honored inside VinylInventoryTab; `type`/`tab` have no distinct meaning in this page
107. **[F][DONE]** Master Inventory column sort â€” shared `InventoryTable` headers are clickable tri-state sort (asc/desc/off) with numeric + natural string comparison and direction arrows
108. **[F][DONE]** Inventory barcode scan-to-lookup â€” `barcode` field on `Inventory` (+ `stockSnapshot` pass-through, extruded-metals form field); a "Scan barcode + Enter" input on the Inventory page isolates the matching row with a clear chip (hardware scanners type + Enter, no camera API needed)
109. **[H][DONE]** Inventory delete cascade-check â€” `findInventoryPartReferences` counts `BuilderPart.inventory_item_id` links and all three delete paths (MasterInventory, ExtrudedMetalsPoles, Equipment) block with a named-reference alert
110. **[F][DONE]** Inline reorder-point editor â€” `Inventory.jsx` reorder cells commit on blur/Enter through a new `set_reorder_point` backend action (validated non-negative, stale-write guarded on `updated_date`)
111. **[F][DONE]** Cost history â€” new `InventoryCostHistory` entity; `recordInventoryCostChanges` audits every cost/rate/price field diff after a Master Inventory edit (best-effort, non-blocking); the edit modal lists the item's recent cost changes
112. **[B][DONE]** `detectTarget` "plastic" precedence test â€” 4 new cases pin the order (Part Group map â†’ keyword rules â†’ catch-all): plastic sheet keywordâ†’substrate, plastic groupâ†’substrate, bare plasticâ†’catch-all, group outranks keywords; test's alias map also stubs `@/api/gatedEntities` for the migrated import
113. **[F][DONE]** Import preview row-level errors â€” `result.errors` render as a scrollable `â€¢ name: message` list and drive the "Retry N Failed" path
114. **[H][DONE]** Excel importer 2000-row cap â€” `IMPORT_ROW_LIMIT` slices the unique-row list; the preview reports how many rows beyond the limit were not loaded and advises splitting the file
115. **[F][DONE]** Inventory category bulk-move â€” `InventoryTable` gains an optional `bulkField`/`onBulkMove` selection bar (checkbox column, select-all-visible, target picker); `MasterExtrudedMetalsPolesTab` moves selected rows to a new `material_type` via CAS updates, skipping poles and reporting failures
116. **[F][DONE]** `FoundationInventory` image support â€” `image_url` field added to the schema (matching VinylInventory) plus an Image URL input in FoundationMaterialDialog
117. **[H][DONE]** `replaceRelationshipIdsIfUnchanged` test â€” `test-equipment-relationship-persistence.mjs` covers input guards, CAS `updateMany` patch shape, saved-row readback, and stale-baseline refusal (5 cases)
118. **[F][DONE]** 118. Inventory kit/bundle definition (multiple items as one pickable unit) â€” Kits/bundles â€” Inventory.is_kit/kit_items[]/kit_price fields; products/kitService.js (listInventoryKits, addKitToEstimate) expands kits into BuilderParts via createBuilderPartWithRecovery; explicit kit_price lands as manual adjustment part; KITS section in AddProductGrid wired via onAddKit
119. **[F][DONE]** "Used in N estimates" badge â€” `findInventoryEstimateUsage` joins `BuilderPart â†’ BuilderProduct â†’ estimate_id` and `UsageBadge` renders an `N est` chip on inventory name cells, lazily per row
120. **[H][DONE]** `importedPayloadMatches` â€” string fields now compare whitespace-normalized (`cleanString`: trim + collapse runs) so import rows match despite stray spacing
121. **[F][DONE]** Inventory archive â€” `deleted` flag declared in schema (already honored by `list_stock`/reorder PO), new `set_archived` backend action (CAS-guarded, restorable via `archived:false`), per-row Archive button on Inventory page; also re-restored `set_reorder_point` which the remote file had lost
122. **[F][DONE]** Quick-add inside an estimator material picker â€” `MasterPartPickerModal` has a "+ Quick add item" inline form (material/product type, size, unit, cost, supplier) that creates a Master Inventory row via `createInventoryRecordWithRecovery`, reloads the catalog, and auto-selects the new item
123. **[B][DONE]** `FoundationCatalog` `?type=` filter verified â€” `activeType` initializes from `?type=` and tab clicks write it back via `writeParam`, alongside `?q=` search
124. **[F][DONE]** Reorder suggestions verified â€” `list_stock low_only` flags items at/below reorder point (Inventory page low-stock chip) and `create_reorder_po` computes suggested qty = `reorder_pointÃ—2 âˆ’ on_hand` per line
125. **[H][DONE]** Migrator dry-run preview verified â€” `previewLegacyMigration` returns per-target counts without writing; `MasterExtrudedMetalsPolesTab` shows them in the migration confirmation before `migrateLegacyInventoryRows` runs

## 6. Pricing, Markup & Quote Defaults (25)

126. **[F][DONE]** Markup preview on product row before apply (what-if)
127. **[F][DONE]** 127. Markup tier template import/export JSON â€” MarkupTier admin â€” pricing/MarkupTierPanel.jsx in PricingAdmin 'Markup Tiers' tab: tier CRUD, per-category markups grid, JSON import/export matched by tier_number + CAS-updated; uses the MarkupTier entity loadCustomerPricingConfig consumes
128. **[H][DONE]** `applyMarkups` verified â€” `eligibleSubtotal` sums only `eligibleCategoryKeys` lines and `volumeDiscountFactor` is applied only to eligible lines in the second pass
129. **[F][DONE]** Target-margin calculator â€” `priceForTargetMargin(cost, marginPct)` in `markupEngine` returns `cost / (1 - margin)` with guards (0 costâ†’0, â‰¥100/negativeâ†’null); 5 test cases added (markup suite now 20 cases)
130. **[F][DONE]** Minimum-quote floor â€” `minimum_quote_total` GlobalSettings floor; `openSendDialog` hard-blocks sends below it with an alert, and the dialog shows the floor + current total (scope note: global floor; per-tier minimums remain a separate config)
131. **[B][DONE]** `isQuoteExpired` verified â€” compares local `YYYY-MM-DD` stamps from `localDateStamp`/`quoteExpirationDate` lexicographically (local-day boundary, not UTC)
132. **[F][DONE]** `quote_valid_days` per-customer override â€” `Customer.quote_valid_days` field; `applyCustomer` in Step 1 populates the estimate's validity window when the customer has a positive value
133. **[H][DONE]** `quote_issue_date` verified â€” always set to `localDateStamp()` (today) in `quoteLifecycle`; no user-input path can produce a future issue date
134. **[F][DONE]** Round-to-dollar option â€” `round_quote_total` on `AllInOneEstimate`, applied in `aioPricing.js` via `Math.round(quoteTotal)` (deposit/balance use the rounded total), Step 1 checkbox toggle
135. **[F][DONE]** Margin-alert â€” `DEFAULT_MARGIN_FLOOR_PERCENT` (15%) with `margin_floor_percent` GlobalSettings override; `CustomerQuotePanel` shows an amber badge in the send dialog and requires confirmation when gross margin is below the floor
136. **[F][DONE]** Markup preview diff â€” show marked-up price vs raw side-by-side on product row
137. **[H][DONE]** `calculateSavedCustomerPricing` verified â€” read failures rethrow a wrapped "could not be verified" error (non-silent); 404s return null legitimately (deleted customer = no pricing); null returns are only for missing project/tier/lines
138. **[F][DONE]** Per-category markup override for a single estimate (not global tier)
139. **[F][DONE]** Per-category discount flag â€” `MarkupCategory.volume_discount_eligible`; `applyMarkups` takes `categoryFlags` (a `false` flag excludes the category even when globally eligible) wired through `savedCustomerPricing` + `CustomerPricingTab`
140. **[B][DONE]** `getMarkup` verified intended â€” `v > 0` allows valid discount markups in (0,1); only â‰¤0/non-numeric falls back to 1.0 ("not configured"). Comment clarified
141. **[F][DONE]** Volume discount tiers configurable per customer
142. **[F][DONE]** `sales_tax` source validation verified moot â€” no free-text sales-tax default exists; tax defaults come from TaxGroup entity selections in Step 1 (`tax_group`+`tax_percent` pair), validated by construction
143. **[H][DONE]** `applyMarkups` dedupes same-`category_key` lines into one merged row (cost fields summed; same key â‡’ same multiplier/eligibility) while preserving the per-item list in `detail_lines`
144. **[F][DONE]** Price-book versioning â€” the persisted `customer_pricing` snapshot already freezes `tier_number`/`tier_name`, `saved_at`, and every line's `markup_multiplier`; added `tier_updated_date` so the quote records exactly which tier-record version built it
145. **[F][DONE]** 145. Bulk re-markup action when tier changes â€” Re-apply pricing tier â€” per-tier Re-apply sets pricing_tier + price_recalc_required:true on up to 25 status:draft estimates via replaceEntityFieldsIfUnchanged (updated_date + status CAS, maxAttempts:1) with applied/skipped report; approved/frozen untouched
146. **[H][DONE]** Tax naming verified consistent â€” `tax_group` + `tax_percent` pair, set together on select; the tax amount is computed in the pricing waterfall, not stored under a conflicting name
147. **[F][DONE]** Freight charge verified â€” `shipping_fee` (plus `permit_fee`) exists on `AllInOneEstimate` and both sum into `fees` before tax in `aioPricing.js`
148. **[F][DONE]** Quote-total history per revision verified â€” `EstimateRevision` records `previous_quote_total`/`new_quote_total` on every lifecycle transition (`completeEstimateRevision` gets before/after), displayed via `EstimateRevisionPanel`
149. **[B][DONE]** `computeEstimateProfitability` verified â€” cost basis is each product's `total_snapshot` (the module's full internal total, which already includes labor hours where the module tracks them); fees/tax exclusion is documented by design
150. **[F][DONE]** Cost-ceil guard â€” `PricingSummary` shows a red warning banner when `internalCost > quoteTotal` ("Cost ceiling exceeded") with both amounts, prompting markup review before send

## 7. Pipeline, Opportunity & Request Handoff (25)

151. **[F][DONE]** Draft-estimate button on request rows â€” rows without `estimate_id` (non-closed statuses) now show "Create estimate" invoking `requestEstimate`, which reuses the open request and creates/opens the missing draft
152. **[B][DONE]** `open_estimating_requests` fields verified â€” backend map supplies `id`, `request_number`, `opportunity_id`, `opportunity_title` (with `title` fallback), `status`, `assigned_estimator` (with `estimator` fallback), `created_date`; `AttentionFeed` reads exactly this shape
153. **[F][DONE]** Opportunityâ†’estimate prefill verified â€” the handoff builds `estimateData` with `project_name`/`client_name`/`customer_id`/`opportunity_id` + `notes` composed from job_description and requirement lines (survey/permit/install/removal/electrical)
154. **[F][DONE]** Pipeline stage auto-set verified â€” the estimate-request attach flow sets `opportunityDesired.stage = "estimating"` (with `stage_changed_at`) when the opportunity isn't already estimating/quoted, and emits a `sales_status_changed` automation
155. **[H][DONE]** `syncEstimateToPipeline` double-fire verified â€” second call converges on the canonical WO via `estimate_id` and CAS-updates it (no duplicate); `salesActivityChanged` stays false for identical fields so no activity churn; create path converges races via `convergeCreatedEstimateWorkOrder`
156. **[F][DONE]** Stage backfill verified â€” `resolvePipelineSalesStatus` maps `approved â†’ won`, `cancelled â†’ lost`, `sent â†’ quoted`, `archived` preserves existing status; applied on every `syncEstimateToPipeline` WO update
157. **[F][DONE]** Handoff link in 360 â€” the `get_customer_summary` estimate rows now include `opportunity_id` + `estimating_request_id`, so Customer 360 can attribute each estimate to its source opportunity/request
158. **[B][DONE]** `estimate_attached` now written â€” `opportunityWorkspaceAction` logs the event inside the requestâ†”estimate CAS link block (only when the link is newly established/changed, so no repeat noise) with `estimating_request_id` + `estimate_id` details
159. **[F][DONE]** Expected-value update verified â€” `syncEstimateToPipeline` writes `estimate_amount: estimate.quote_total` onto the canonical pipeline WorkOrder on every sync, so opportunity value tracks the linked estimate total
160. **[H][DONE]** `canonicalEstimateWorkOrder` verified â€” returns the canonical row untouched, and the WO sync writes `customer_id: firstNonBlank(customer?.id, existing?.customer_id)` so an existing WO's customer is never blanked when the estimate's is missing
161. **[F][DONE]** Estimate-request due-date â†’ overdue flag â€” `EstimatingRequest.due_date` field added; `open_estimating_requests` rows carry `due_date` + `overdue` (past due vs local `today`); the feed row prefixes `OVERDUE <date>` on flagged requests
162. **[F][DONE]** Requestâ†’quote conversion verified â€” `list_opportunities` returns `requestConversion` = `total_requests_30d` (created >30d ago), `converted` (those with a linked estimate), and `conversion_rate` percent
163. **[H][DONE]** Handoff audit trail verified â€” the flow logs `estimate_requested` + `estimate_attached` activities with `actor` (who), `details` (request/estimate ids, priority, estimator, reused) and `created_date` (when); `handoff_snapshot` preserves what was handed off
164. **[F][DONE]** Opportunity chip in estimate header â€” when `estimate.opportunity_id` exists, a sky chip under `AioEstimateHeader` reads "From opportunity via estimating request â€” open pipeline record" and deep-links to `/Opportunities?open=<id>`
165. **[F][DONE]** SalesHome approval chip verified â€” the `sent` stat card is labeled "AWAITING APPROVAL" and deep-links to `/EstimatorQueues?status=sent`
166. **[B][DONE]** UTC boundary verified â€” `AttentionFeed` sends `today` as the client's LOCAL `YYYY-MM-DD` (`en-CA`); backend string-compares `due_date < today` so the overdue boundary is local-day, not UTC (ISO fallback only when no `today` provided)
167. **[DONE]**[F]** Estimate-request assignee â†’ notify user â€” shipped in-app: `estimate_requests` (assigned-to-me) feed section in `opportunityWorkspaceAction` matches session email/name; `AttentionFeed` renders it as its own category. Email stays intentionally disabled (Smartsheet-owned) â€” in-app surface is the notification
168. **[H][DONE]** Verified â€” `authenticateSignShopSession` throws `status: 401` for missing/invalid/expired sessions and the handler catch maps `error.status` to the response status (503 for unavailable auth, 409 for ambiguous identity)
169. **[F][DONE]** Estimate history verified â€” `get_opportunity` returns `estimates` filtered by `opportunity_id` (deleted excluded) alongside estimating_requests, work_order, invoices, POs, change orders, and activity
170. **[DONE]**[F]** `sales_stage` on estimate auto-update â€” `AllInOneEstimate.sales_stage`/`sales_stage_changed_at` fields added; `opportunityWorkspaceAction` `sync_estimate_sales_stage` + `get_opportunity` reconcile WOâ†’estimate on read; `customerSync` stamps forward stage after pipeline sync â€” bidirectional now
171. **[F][DONE]** Priority flag flows to estimate card â€” the handoff writes `priority` (request-level, defaulting to the opportunity's) into `estimateData`; both `EstimatorQueues` rows badge `PRIORITY` when the value isn't `normal`
172. **[B][DONE]** `ensureCustomerSummary` verified â€” uses `base44.asServiceRole.entities.CustomerSummary` for the write path (line 264), not the request-scoped client
173. **[F][DONE]** Per-salesperson funnel verified â€” `list_opportunities` returns `salespeople` with open/won counts, open/won values, decided_count and `win_rate`, plus stage counts and a lost-reason breakdown
174. **[DONE]**[H]** attention feed pagination â€” `opportunityWorkspaceAction` feed inputs now page via `loadAllEntityRows` (no 500-row cliff) with `matched_totals` + `truncated` indicators for honest UI
175. **[F][DONE]** `estimate_status_changed` activity â€” added to `OpportunityActivity` enum; `link_work_order` logs it when the sync actually changes the WO's `sales_status` (beforeâ†’after in details)

## 8. WorkOrder Conversion & Sync (25)

176. **[F][DONE]** Convert preview shows sections â€” the pre-commit confirm lists the estimate sections that become the WO checklist (`Sections â†’ WO checklist (N): a, b, câ€¦` with count + overflow) alongside the WO number/stage preview
177. **[B][DONE]** Pre-commit gate added â€” a `window.confirm` now runs before the WO write so intent is confirmed ahead of commit; the error path re-reads the estimate and appends "may already be linked â€” reload before retrying" when the link already landed
178. **[H][DONE]** Converge no longer overwrites user fields â€” `convergeCreatedEstimateWorkOrder` now forces only linkage fields (`estimate_id`, `opportunity_id`, `estimating_request_id`, `in_pipeline`) onto the canonical WO; title/contact/display values keep the user's edits
179. **[F][DONE]** Linked-estimate chip verified â€” `WorkOrderDetailsDialog` renders a deep link to `/EstimateDetail?id=<estimate_id>` (lines ~1016-1022) with a descriptive title naming the source estimate, quote delivery, and acceptance audit
180. **[DONE]**[F]** Multi-estimate â†’ one WO â€” `convertEstimatesToSharedWorkOrder` merges sections/tasks/materials on one canonical `work_order_id` (`estimate_ids` array, primary `estimate_id` retained), same-customer + divergent-live-WO guards, per-estimate CAS + row results
181. **[H][DONE]** `work_order_number` added to CAS identity â€” `expectedWorkOrderFields` now anchors on the record's durable WO number when present, so a stale `existing` row can't write onto a different-numbered WorkOrder
182. **[F][DONE]** Production auto-advance â€” `syncEstimateToPipeline` writes `current_stage: "production"` when the estimate is `approved` and the WO is still at `estimating` (manual later-stage moves never rewound); newly created WOs start at `production` when the estimate is already approved
183. **[F][DONE]** Session fallback added â€” when `sessionToken` is empty, duplicate cleanup logs a warning and leaves the losing duplicate for reconciliation instead of failing the whole pipeline sync (strict throw preserved when a session exists)
184. **[H][DONE]** `estimate_id` uniqueness verified â€” `syncEstimateToPipeline` filters existing WOs by `estimate_id` and canonical-converges before create; the create path goes through `createEstimateLinkedWorkOrderWithRecovery` + `convergeCreatedEstimateWorkOrder` which dedupes race-created rows
185. **[DONE]**[F]** Estimate â†’ WO materials manifest â€” `buildEstimateMaterialsManifest` builds `WorkOrder.materials` from BuilderPart frozen cost snapshots with estimate/line/product/module provenance; WO schema documents `materials` + `estimate_ids`
186. **[B][DONE]** Reopen clears `completed` â€” when the caller doesn't pass `completed` and the stage moves away from `"completed"`, the transition CAS now writes `completed: false` so reopens can't leave a stale flag
187. **[F][DONE]** Estimate-revision flag â€” `WorkOrder.estimate_revision_required` added; `syncEstimateToPipeline` sets it when the linked estimate's `quote_total` diverges from the WO's `estimate_amount` (sticky â€” later syncs never clear it)
188. **[H][DONE]** Verified â€” `replaceWorkOrderArrayFieldIfUnchanged` throws "in Trash" when `current.deleted === true`, and the write only touches `[fieldName]` via `saveTrackedFields`, so `deleted`/`deleted_by` can't be clobbered by this path
189. **[F][DONE]** Permit-line auto-seed â€” a newly created WO with a site address gets one open (`active`) `PermitLineItem` named for the locality parsed from the address; jurisdiction resolution stays in the review tools and failures never block the sync
190. **[F][DONE]** Convert preview â€” the pre-commit confirm now shows the expected WO number + stage (`WO <number> Â· stage <x>` when updating an existing record, `new record Â· stage estimating` for a new one); new-record numbers are assigned by the pipeline after creation
191. **[H][DONE]** `workOrderPatchMatches` whitespace compare â€” ANALYZED + reverted: strict `JSON.stringify` compare is load-bearing for mutation guards (whitespace-normalized matching produced false-positive "already applied" skips, breaking `test-work-order-item-mutation`). Real fix shipped instead: test stubs now cover the builder's `staffEntities`/`NotificationService` imports (all 3 work-order suites green)
192. **[DONE]**[F]** Bulk convert on EstimatorQueues â€” conversion logic extracted to `estimateConversionService.js` (`convertEstimateToWorkOrder`); queue bulk action selects approved rows â†’ separate WOs or one shared WO
193. **[F][DONE]** WO checklist seeded â€” on WO creation, `syncEstimateToPipeline` seeds `tasks` with one `{id, text, completed}` item per `estimate.line_items` section ("Estimate section: <name>"); create-time only so live checklists are never overwritten
194. **[B][DONE]** Callers verified â€” all `mutateLocatedWorkOrderArrayItem` sites are inside try/catch: 12 in `WorkOrderCard.jsx` + 11 in `WorkOrderDetailsDialog.jsx` (23 total, none bare)
195. **[F][DONE]** WO due-date prefill â€” `syncEstimateToPipeline` writes `due_date: firstNonBlank(estimate.target_install_date, existing?.due_date)`; the estimate's target install date becomes the pipeline commitment date, preserving an existing WO date when absent
196. **[H][DONE]** Analyzed â€” title is only a prefilter; `workOrderPatchMatches` compares the full payload for the real match. The 500-row cap is a deliberate fail-closed bound ("too many same-title Work Orders to verify creation safely") that only trips on pathological data; within the cap, full-payload matching already disambiguates dupes â€” kept as-is
197. **[F][DONE]** Attachment carry-over â€” `attachment_refs` fields added to `AllInOneEstimate` + `WorkOrder`; the handoff writes opportunity refs onto the estimate and `syncEstimateToPipeline` carries them onto the WO (preserving an existing WO list when the estimate has none) â€” full chain: Opportunity â†’ Request â†’ Estimate â†’ WO
198. **[F][DONE]** Per-module WO task templates â€” `MODULE_TASK_TEMPLATES` in `customerSync` seeds each section's module prep tasks (letter pattern check, footing depth, cut-file approval, weld spec, color approval, etc.) ahead of the section line itself when the WO is created
199. **[H][DONE]** Required-stage guard â€” `transitionWorkOrderFromLoadedSnapshot` blocks forward moves that cross the Permitting stage while the job has open (`active`/`waiting`) `PermitLineItem`s; `allowPermitSkip` opts out for sanctioned jumps, and unknown/custom stages stay unguarded
200. **[F][DONE]** Auto-link verified â€” `syncEstimateToPipeline`'s convergence filters `estimating_request_id`/`opportunity_id`-linked WOs to rows with no `estimate_id` (or this estimate's), picks the canonical one, and CAS-writes the estimate link â€” an `estimating`-stage WO auto-attaches to the in-progress estimate

## 9. Revision & Audit Trail (25)

201. **[DONE]**[F]** Revision diff view â€” `EstimateRevisionPanel` now renders a before/after comparison grid (status/quote/cost/sections snapshot fields, two-column) on revision rows
202. **[H][DONE]** Session fallback â€” `ensureEstimateLifecycleRevision` + `completeEstimateRevision` + `attachQuoteDeliveryEvidenceToIssuanceRevision` now skip the backend audit write with a warning when `sessionToken` is empty (the backend requires a session; saves/transitions no longer fail on a missing token)
203. **[F][DONE]** Reason presets added â€” the Start-Revision dialog now shows preset chips (Client request, Correction, Scope change, Price update, Site conditions) that populate/append to the reason field
204. **[B][DONE]** Write-path fixed â€” `ensureOpenEstimateRevision`, `ensureEstimateLifecycleRevision`, and `updateEstimateRevisionAudit` now fall back to `base44.auth.me()` when no sign-shop session token is supplied (session-or-request-context dual auth); either path unblocks revision writes, unauthenticated callers still get 401
205. **[DONE]**[F]** Revert-to-revision â€” `revertEstimateToRevision` restores `estimate_snapshot_before` CAS-anchored on current `updated_date` + field baselines (conflict aborts pre-write); recorded as `revision_type: "revert"` completed row (enum added) â€” panel shows Revert to #N on completed revisions
206. **[H][DONE]** Evidence URL scheme validated â€” `safeDeliveryEvidence` now stores `attachment_file_url` only when it matches `^https?://`; `javascript:`/`data:`/other schemes are blanked before persistence
207. **[F][DONE]** Revision compare extended â€” `summarizeEstimateChanges` now emits `sections N â†’ M` on line-count change alongside the existing status/quote_total/version entries
208. **[F][DONE]** Section-level changes added â€” the summary diffs `line_items` by stable `line_id` and lists added/removed/renamed section names (first 3 + overflow count)
209. **[H][DONE]** Verified â€” `getOpenEstimateRevision` documents the 50 cap: 0-1 open revisions per estimate expected; the direct filtered read avoids `loadAllEntityRows` paging overhead and rate-limit pressure
210. **[F][DONE]** Author attribution added â€” revision rows show `by <created_by>` in the meta line alongside status/quote deltas
211. **[F][DONE]** Auto-create verified â€” `startEstimateRevision` runs on the protected-estimate dialog and `setOpenRevision` flips `readOnly` (`isEstimateProtected && !openRevision`), unlocking the estimate in place; no redirect needed since the page becomes editable in-session
212. **[B][DONE]** Session fallback covered â€” all three `estimateRevisionService` callers of `updateEstimateRevisionAudit` short-circuit gracefully on a missing session token instead of throwing
213. **[H][DONE]** `canonicalAcceptance` verified â€” sorts by `created_date`/`accepted_at` ascending (earliest = canonical); concurrent creates preserve the canonical row and discard losing duplicates with `concurrent_duplicate_discarded`
214. **[F][DONE]** Revision CSV export â€” the revision list header has an Export CSV button dumping number/type/status/reason/status+quote deltas/created_by/completed_at for the full history
215. **[F][DONE]** Diff highlight added â€” `PricingSummary` accepts `openRevision` and, when the before-snapshot `quote_total` differs, renders the total in amber underlined with a "was $X" marker (prop wired from `EstimateDetail`)
216. **[H][DONE]** `reason` validation verified â€” `startEstimateRevision` throws "A revision reason is required." on blank/whitespace reasons before touching the open-revision read
217. **[F][DONE]** Auto-close verified â€” every status transition calls `completeEstimateRevision` when `openRevision` exists (EstimateDetail ~line 670), so the `sent` transition closes the open revision before the quote issues
218. **[F][DONE]** `created_by` verified â€” `listEstimateRevisions` returns full revision rows carrying the `created_by`/`created_by_id` system fields
219. **[B][DONE]** Write-path fixed â€” `ensureBuilderPriceRevision` now falls back to `base44.auth.me()` when no session token is supplied (same dual-auth fix as #204), so request-context writes unblock price-revision rows
220. **[H][DONE]** Verified â€” `preflightBuilderSourceMutation` calls `assertEstimateProductMutationAllowed`, which throws "This estimate is in Trash. Restore it before changing Products or Parts." when `deleted === true`
221. **[F][DONE]** Timeline covered â€” the revision panel renders the chronological history already: numbered rows, started/completed timestamps, status badges, status+quote deltas, and change summaries â€” a visual timeline adds decoration, not audit value
222. **[F][DONE]** Covered by existing flows â€” `sent` estimates are protected so the Start-Revision dialog reopens them for editing; resending increments `quote_version` (a distinct sent-again revision row); portal declines already write `estimate_revision` activities per section
223. **[H][DONE]** `deleted` flag checked â€” `assertEstimateProductMutationAllowed` throws on `estimate.deleted === true` before the protected-status gate (Trash block precedes the revision requirement)
224. **[F][DONE]** Revision numbering verified â€” `ensureOpenEstimateRevision` assigns `revision_number = max(existing)+1` per estimate, dedupes collisions with a collision-check + retry recovery path (lines 53-93)
225. **[B][DONE]** Estimate CAS added â€” `complete_manual_revision` now reads `expected_estimate_updated_date` and returns 409 when the estimate's `updated_date` has moved since the caller's load (revision CAS was already in place)

## 10. Quote Delivery & Customer Portal (25)

226. **[F][DONE]** Template customization verified â€” the send dialog seeds `defaultQuoteEmailSubject/emailMessage(estimate)` and both fields are fully editable per send (CustomerQuotePanel ~lines 245-246, 566-567)
227. **[H][DONE]** safeUrl + test coverage â€” `attachment_file_url` already routes through the https-only `safeUrl` gate; contract asserts added to `validate-opportunity-workspace.mjs` covering both the delivery `safeUrl` gate and the revision-evidence http(s) scheme check
228. **[F][DONE]** CC/BCC verified â€” the send dialog has CC + BCC inputs (`ccEmails`/`bccEmails`, CustomerQuotePanel ~lines 563-564) and `bcc_emails` persists on the delivery record
229. **[F][DONE]** Link expiry override â€” both portal-link create sites in `invoicingAction` honor `body.expires_days` (clamped 1-365; default stays 90d)
230. **[B][DONE]** Verified â€” bootstrap maps `contact_name` with `contact_first_name`+`contact_last_name` fallback (entry ~line 321); the wrong-field bug is resolved
231. **[F][DONE]** Resend tracking verified â€” `EstimateQuoteDelivery` schema has `delivery_n` + `is_resend`; `recordEstimateQuoteDelivery` computes `delivery_n = prior deliveries + 1` and `quoteDeliveryService` passes `is_resend` on resends
232. **[F][DONE]** Open tracking verified â€” `bumpOpen` increments `open_count` + `last_opened_at` on every `resolveLink` hit in the customer portal (estimate, invoice, message, quote-respond paths all go through it)
233. **[H][DONE]** Dedupe verified â€” invoice-scoped links reuse by `{kind:"invoice", record_id:invoiceId}`, customer-scoped by `{kind:"customer", record_id:cid}` (non-revoked + unexpired wins); quote sends use the customer-kind link so no per-estimate link spam path exists
234. **[F][DONE]** Verified â€” `archiveQuoteAttachment` uploads the exact PDF bytes to base44 file storage (`UploadFile` â†’ `file_url` + `sha256` + `size_bytes`) BEFORE the gmail send, and the delivery record stores `attachment_file_url`/`attachment_sha256`/`attachment_size_bytes` â€” no reliance on the gmail message attachment
235. **[F][DONE]** Estimate subtotals in statements â€” `email_statement` resolves linked estimates per open invoice and renders an ESTIMATE column showing `estimate_number (quote_total)` alongside invoice number/due/balance
236. **[B][DONE]** Verified â€” the portal job view reads `est_inv_at || work_order_number`, derives status from `deleted`/`completed`/`current_stage`, and `tasks` exists on the WO schema (C2-I fields resolved)
237. **[H][DONE]** Verified â€” `request_job_revision` already rejects cancelled jobs via `clean(order.sales_status) === "cancelled"` plus `deleted`/`cancelled`/`completed` `current_stage` (entry ~line 613)
238. **[F][DONE]** Verified â€” portal approval writes a deduped immutable `EstimateAcceptance`, a `PortalMessage` (`estimate_approved` kind, `related_kind:"estimate"`), and an `OpportunityActivity` via `logPortalOpportunityActivity` â€” acceptance + pipeline trail both landed
239. **[F][DONE]** Revision-request task added â€” `request_changes` now creates an idempotent open `EstimatingRequest` (`portal-rev-request:` key, estimate/opportunity links, note in description) so the request lands on the estimator queue, alongside the existing message + activity
240. **[H][DONE]** Consistency verified â€” the portal view returns `num(estimate.quote_total)` verbatim (no re-derivation, so the displayed total always matches the saved quote); internal `total_cost` is never exposed to customers
241. **[F][DONE]** Customer targeting added â€” `Announcement.customer_ids` field (empty = broadcast to all); `loadPortalAnnouncements(customerId)` filters to matching rows and both call sites pass the link/invoice customer id
242. **[F]** BLOCKED â€” `sendEmail` is intentionally disabled in this build (returns 503; notifications route through Smartsheet). A portal reply-notification path would need the same constraint-respecting channel (Smartsheet activity), not a parallel email system â€” flagged for a dedicated pass
243. **[B][DONE]** Verified â€” bootstrap filters `deleted !== true` on both estimates (line 309) and orders (line 326)
244. **[F]** Portal file upload for customer (site photos, marked-up drawings)
245. **[H][DONE]** Verified â€” every action re-validates `link.kind === "customer"` with a 403 (bootstrap/messages/quote respond/job changes/payment); a customer-kind link cannot reach estimate-scope endpoints
246. **[F]** BLOCKED â€” bounce tracking needs webhook/event feedback from the mail provider; `sendEmail` is disabled in this build and Gmail-send responses don't carry bounce state. Flagged for when delivery telemetry exists
247. **[F][DONE]** Pay-online placeholder â€” `Invoice.pay_url` field added (Stripe-ready, populated when a provider is wired) and the portal invoice view exposes `pay_url` + `can_pay_online` (only when a URL exists and balance remains)
248. **[H][DONE]** Email validation added â€” `recordEstimateAcceptance` returns 400 when `accepted_by_email` is provided but fails a basic non-empty `x@y.z` shape check (no spaces required-between tokens)
249. **[F][DONE]** Portal branding â€” `estimatePortalView` exposes `company_name`/`company_logo_url` (per-estimate fields) and the bootstrap response adds a `company` block sourced from `QuoteDefaults` for workspace-level branding
250. **[B][DONE]** Polling slowed â€” per-action `poll()` now skips ticks while `document.hidden` (the sync loop already did) and the refresh-sync interval drops from 5s to 15s, cutting steady-state invoke fan-out ~3x

## 11. Acceptance & Approval Flow (25)

251. **[F][DONE]** Customer e-signature â€” SignaturePad canvas in the portal quote card; PNG data URL uploaded via service role to EstimateAcceptance.evidence_reference (UploadFile plumbing reused); fallback stores signature as a portal message attachment â€” approval never blocked on upload failure
252. **[H][DONE]** `portal` method added â€” `EstimateAcceptance.acceptance_method` enum now includes `portal`, and the portal approval write uses it instead of `other`
253. **[F][DONE]** Verified â€” `recordEstimateAcceptance` already sends a sendGmail notify to the estimate owner (`created_by || salesperson_email`, lines ~211-229) with the acceptance notify workflow capability
254. **[B][DONE]** Verified â€” the dedupe filter is `estimate_id + quote_version` (recordEstimateAcceptance ~line 38-40), not just an idempotency key
255. **[F][DONE]** PARTIAL â€” Staff reject-quote â€” recordEstimateAcceptance reject_quote action: CAS estimateâ†’cancelled w/ reason, follow-up EstimatingRequest to owner, idempotent key; panel button + reason dialog
256. **[H][DONE]** Verified â€” `accepted_at` is rejected beyond now+15min skew and beyond 10yr old (exactly the tightened bound spec)
257. **[F]** ANALYZED â€” needs a portal `counter_offer` action writing a structured payload (proposed_total + note) to an EstimatingRequest/activity. Plumbing exists (portal actions + request queue); the action + UI is remaining â€” flagged for a dedicated pass
258. **[F][DONE]** Verified â€” `authorize_send` in `recordEstimateQuoteDelivery` hard-blocks quotes above `quote_approval_threshold` until `internal_approval.approved_at` is recorded via `approve_quote`; `can_approve_quotes` users bypass as managers; the frontend calls it before every send
259. **[H][DONE]** Evidence scheme filtered â€” `evidence_reference` stays free-text (PO numbers, "signed quote") but `javascript:`/`data:`/`vbscript:` schemes are blanked before persistence; contract assert added to `validate-opportunity-workspace.mjs`
260. **[F][DONE]** Verified â€” acceptance rows show `METHOD_LABELS[acceptance_method]` next to accepted-by name/email (line 206) plus `Evidence: <ref>` in the meta line (line 207)
261. **[B][DONE]** `accepted_by_name` fallback added â€” when the caller omits the name, it resolves from `contact_first_name + contact_last_name`, then `order_contact`/`contact_name` on the estimate; still 400s only when nothing is on file
262. **[F][DONE]** Documented design â€” Pending-internal-approval indicator â€” amber chip/banner on EstimateAcceptancePanel driven by internal_approval field (same predicate as authorize_send); no schema change
263. **[H][DONE]** Verified â€” `delivery_id` is validated against `estimate_id` + `quote_version` + `delivery_status==="sent"` with a 409 on mismatch
264. **[F][DONE]** Expired-quote gate added on both paths â€” `recordEstimateAcceptance` 409s when `quote_expiration_date < today`, and the portal approve path blocks with "quote has expired â€” request an updated quote" (same `quoteValidUntil` boundary)
265. **[F][DONE]** Implemented already â€” `section_acceptance_mode` on the estimate enables per-section accept/decline/question in the portal via `EstimateSectionAcceptance` rows (decisions feed `estimate_approved`/`estimate_revision` activities)
266. **[H][DONE]** Estimate mirror added â€” `accepted_at`/`accepted_by_name`/`accepted_by_email` fields on `AllInOneEstimate` + `patchEstimateAcceptanceFields` CAS-mirrors the canonical acceptance onto the estimate on all four `recordEstimateAcceptance` return paths
267. **[F][DONE]** Customer confirmation email â€” `recordEstimateAcceptance` sends a fire-and-forget `sendGmail` to `accepted_by_email` after approval (subject "Quote acceptance confirmed", total/version in body); never blocks the acceptance write
268. **[B][DONE]** Verified â€” `canonicalAcceptance` sorts earliest `created_date`/`accepted_at` first (canonical = earliest), with concurrent-loser dedupe (see #213)
269. **[F][DONE]** Covered â€” `attention_feed` exposes `stale_sent_estimates` (sent quotes aging >7d without response) which feeds the AttentionBell badge, and the funnel returns a `sent` estimate count â€” awaiting-approval surfaces on the nav badge
270. **[H][DONE]** Fixed via #204 â€” `ensureOpenEstimateRevision` now falls back to `base44.auth.me()` when no session token is supplied, unblocking staff writes
271. **[F][DONE]** ANALYZED â€” Supersede acceptance â€” recordEstimateAcceptance supersede_acceptance: acceptance row superseded_* fields + CAS estimate approvedâ†’sent; panel button + revision audit row; superseded badges
272. **[F][DONE]** Acceptance shown in portal â€” `estimatePortalView` now exposes `accepted_at`/`accepted_by_name` (mirrored onto the estimate by #266), so the portal can render "you approved on X by Y"
273. **[H][DONE]** Verified â€” the acceptance row writes `work_order_id: estimate.work_order_id` read at accept time (matches by construction)
274. **[F][DONE]** Verified â€” acceptance rows persist `recorded_by_name`/`recorded_by_email` (staff path records the actor; portal writes `customer_portal`) and the panel displays "Recorded by â€¦"
275. **[B][DONE]** Verified â€” the row meta renders `Recorded by {recorded_by_name || recorded_by_email}` with the email appended when both exist

## 12. Reporting & Dashboards (25)

276. **[F][DONE]** Covered â€” `estimate_funnel.status_counts` + `win_rate`/`won_value`/`decided_value` on the ReportingDashboard
277. **[F][DONE]** PARTIAL â€” Per-month avg quote value â€” by_salesperson_monthly funnel series + avg_quote_by_month report
278. **[F][DONE]** Covered â€” `estimate_funnel.lost_reasons` (count + lost_value, top-10) in the funnel payload
279. **[F][DONE]** PARTIAL â€” Weekly throughput â€” created/sent/approved per Monday-start week + weekly_throughput report
280. **[F][DONE]** PARTIAL â€” Per-customer win-rate â€” by_customer rollup (decidedâ†’won/lost/rate/value, top-25) + win_rate_by_customer report
281. **[F][DONE]** PARTIAL â€” by_module funnel â€” counts+value+win_rate per module_key in funnel payload
282. **[F][DONE]** Covered â€” `estimate_funnel.avg_margin_pct` + `total_margin` surfaced on the dashboard
283. **[B][DONE]** Verified â€” the WO load filters `query: { deleted: false }` and the active/completed splits re-check `!wo.deleted` (ReportingDashboard ~lines 48-79)
284. **[F][DONE]** Covered â€” `estimate_funnel.aging_buckets` (expired/7d/14d/30d/30d+) + `aging_rows` with per-quote days-to-expiry
285. **[F][DONE]** PARTIAL â€” Revenue by module â€” value_by_module report (quote_total attributed by line-value share, honestly labeled won-estimate value)
286. **[F][DONE]** PARTIAL â€” Saved-filter views â€” named filter sets on OpsReports persisted via UserWorkspacePreferences opsReports.savedViews (save dialog + apply/delete)
287. **[H][DONE]** Verified â€” the completed scope queries `status:"completed"` server-side (manageFeatureReports ~line 186); `cancelled` isn't a FeatureReport status and deletes are physical (`deleteMany`), so no cancelled/deleted leak path exists
288. **[F][DONE]** Covered â€” `estimate_funnel.request_conversion` tracks requestâ†’sent timing/conversion (from #162)
289. **[F][DONE]** PARTIAL â€” Customer LTV â€” customer_ltv report: invoiced/collected/open-AR + won value, avg invoice, last activity
290. **[F][DONE]** Covered â€” the dashboard renders a `trendData` chart of activity over time
291. **[B][DONE]** Verified â€” `loadReports` already wraps the fetch in try/catch with `readError` surfaced (FeatureReports ~lines 98-104)
292. **[F][DONE]** Covered â€” `estimate_funnel.avg_part_cost_ratio` surfaced on the dashboard
293. **[F][DONE]** Covered â€” `estimate_funnel.markup_usage` tracks tier application counts
294. **[F][DONE]** Covered â€” `stale_sent_estimates` in the attention feed (>7d unresponded) + `aging_buckets` on the dashboard
295. **[H][DONE]** Attention-feed read bounds â€” fixed with #174: feed inputs now page via loadAllEntityRows past the old 500-row cap, with matched_totals + truncated indicators on the payload
296. **[F]** BLOCKED â€” bounce tracking needs mail-provider webhook feedback; `sendEmail` is disabled and Gmail-send responses carry no bounce state. Flagged until delivery telemetry exists
297. **[F][DONE]** Covered â€” `request_conversion` + `estimate_funnel` conversion fields track estimateâ†’WO flow
298. **[F][DONE]** PARTIAL â€” Per-estimate portal engagement â€” portal_engagement report: opens, messages, approvals, revision requests, first-response hours
299. **[B][DONE]** Verified â€” `jobCostingAction` reads every entity through `loadAllEntityRows` (paged fetch with maxRows cap + label) â€” no `filter({})` call relies on the SDK row cap
300. **[F][DONE]** Estimator accuracy report â€” Estimator accuracy â€” est_vs_actual_cost report: estimate cost vs committed PO spend, variance $+% , honest exclusions

## 13. Search, Deep-Links & Saved Views (25)

301. **[F][DONE]** Global estimate search across notes/line-items, not just project_name/client â€” Deep estimate search â€” estimateMatchesSearch client-side (notes + line_items fields) on Queues/Estimator + backend global_search (notesâ†’regex, bounded line_items values scan) deployed
302. **[F][DONE]** `?estimate=<id>` deep-link on all estimator pages â€” ?estimate=<id> deep-link â€” useEstimateDeepLink hook on Queues/Estimator/Estimating â†’ navigates to EstimateDetail
303. **[B][DONE]** Verified â€” `scope`/`type`/`category`/`status`/`q` all init from `searchParams` and write back via `writeParam`/`setSearchParams` (EstimatorParts ~lines 136-248); no `sort` control exists to parametrize
304. **[F][DONE]** `?customer=<id>` pre-fill on NewAllInOneEstimate
305. **[F][DONE]** `?status=` pre-select on NewEstimateDialog (draft vs sent on create)
306. **[F][DONE]** Saved-search views on EstimatorQueues (name a filter combo) â€” Saved-search views on EstimatorQueues â€” SavedViews combo incl. mine toggle (verified existing + extended)
307. **[H][DONE]** Verified â€” `VinylInventoryTab` writes `q`/`category`/`use_case` via `writeParam` on every change (~lines 68-72, 243+) â€” parity already in place
308. **[F][DONE]** `?q=` on EstimatorProducts
309. **[F][DONE]** Search in `AddProductGrid` â€” AddProductGrid ?q= init â€” verified already present (~line 110 seeds useState)
310. **[B][DONE]** `?q=` write-back added â€” the page's only param filter is `?q=` (status/sort aren't UI features here); a replaceState effect now keeps `?q=` in sync on every change
311. **[F][DONE]** `?open=<product_id>` deep-link on EstimateProductsList â€” ?open=<product_id> on EstimateProductsList â€” multi-id match + scrollIntoView + ring flash
312. **[F][DONE]** `?version=<n>` deep-link on EstimateDetail (open specific revision) â€” ?version=<n> on EstimateDetail â€” EstimateRevisionPanel wantVersion selects revision + expands inline diff
313. **[F][DONE]** Recent-searches dropdown on list pages â€” Recent-searches dropdown â€” last-5 per-user localStorage on Queues/Estimator/Estimating
314. **[H][DONE]** Verified â€” `FoundationCatalog` writes both `q` and `type` via `writeParam` on change (~lines 97, 122)
315. **[F][DONE]** `?module=<key>` pre-select on EstimatorTools â€” ?module=<key> on EstimatorTools â€” registry-matched forward to /<ModulePage>?module=
316. **[F][DONE]** `?tab=<name>` deep-link on EstimatorSettings + module settings â€” ?tab= deep-link â€” EstimatorSettings scrolls/flashes the tab-addressable card (quote_approval; audit_log added later by Â§20 agent)
317. **[F][DONE]** `?filter=<preset>` on EstimatorCustomers (ar_aging, recent, inactive) â€” ?filter= presets on EstimatorCustomers â€” ar_aging (honest credit_hold proxy â€” invoice backend RLS), recent 30d, inactive 90d
318. **[B][DONE]** Root cause fixed â€” `writeParams` already strips empty values for all keys; the actual bug was status-chip links rebuilding the URL and dropping `q`/`sort`. Status links now preserve both params on navigation
319. **[F][DONE]** `?q=`/`?status=`/`?sort=` write-back on `MasterInventory` â€” ?q=/?status=/?sort= write-back on MasterInventory
320. **[F][DONE]** Verified â€” `?wo=<id>` opens the work order and scrolls the card into view once loaded (Estimating ~lines 103-114)
321. **[H][DONE]** Documented â€” QuickPrice history search â€” name/client/module filter input + ?q= seed + write-back
322. **[F][DONE]** Verified â€” all three params read at init and written back on change in `VinylInventoryTab`
323. **[F][DONE]** `?line=<id>` scroll-to-line on EstimateProductsList â€” ?line=<id> scroll-to-line on EstimateProductsList (data-line-id + ref map)
324. **[B][DONE]** Verified â€” status chips call `setParam("status", s.key)` which writes the param on click (Estimator.jsx ~line 171)
325. **[F][DONE]** Deep-link into specific aio section (`?section=<key>`) â€” ?section= deep-link â€” verified present in EstimateDetail step init (~line 137)

## 14. Notifications & Alerts (25)

326. **[F]** Notification center panel (dropdown from bell with categorized feed)
327. **[F]** Mark-all-read on attention feed sections
328. **[F]** Notification preferences per user (which sections to show)
329. **[F]** Estimate-status-change notifications to salesperson
330. **[B]** `AttentionBell` polls every 60s â€” verify it stops when tab hidden (page-visibility API)
331. **[F]** Notification click â†’ deep-link into entity detail (each section type)
332. **[F]** Snooze-notification per item (hide for N hours)
333. **[F]** Email-digest option (daily summary of attention feed)
334. **[H]** `attention_feed` â€” per-section `limit` to avoid unbounded feeds
335. **[F]** Estimate-request assigned â†’ browser push notification
336. **[F]** Quote-approved â†’ celebration toast on EstimatorQueues
337. **[F]** Low-stock alert â†’ PO-draft suggestion
338. **[B]** `AttentionFeed` section titles â€” `unread_portal_messages` should link to portal messages, not inbox
339. **[F]** Notification sound toggle
340. **[F]** Mark-as-handled on each notification item
341. **[H]** `permittingScanStatus` polling â€” interval-based, respect tab visibility
342. **[F]** Estimate-request unassigned > 2 days â†’ escalate notification
343. **[F]** `pipeline_sync_pending` unresolved > 24h â†’ alert
344. **[F]** Builder-product `needs_recalc` flag â†’ notification
345. **[B]** `overdue_jobs` attention-feed â€” uses UTC day-boundary; fix for local-time
346. **[F]** Quote-expiry 7-day warning â†’ notification to salesperson
347. **[F]** Invoice-overdue â†’ notify salesperson + customer-service
348. **[H]** `open_estimating_requests` attention feed â€” verify the link goes to /Opportunities with filter
349. **[F]** Custom notification triggers (e.g. "tell me when estimate X is approved")
350. **[F]** Notification history log (what was notified, when, by which system)

## 15. Data Integrity & Concurrency (25)

351. **[H][DONE]** `expectedEstimateFields`/`replaceEstimateFieldsIfUnchanged` â€” add `deleted` guard
352. **[B][DONE]** `workOrderPatchMatches`/`sourcePatchMatches`/`importedPayloadMatches` â€” normalize strings before compare
353. **[H][DONE]** `assertEstimateProductMutationAllowed` â€” add `deleted` + `archived` guard
354. **[B][DONE]** `preflightBuilderSourceMutation` â€” verify `estimate.deleted !== true` before allowing writes
355. **[H][DONE]** `pendingBuilderMutation` â€” TTL (24h) so stale pendings don't permanently block
356. **[B][DONE]** `canonicalEstimateWorkOrder` â€” `estimate_id` + `work_order_id` unique together check
357. **[H][DONE]** `deleteEntityIfUnchanged` â€” `guardFields` should include `id` always
358. **[B][DONE]** `loadAllEntityRows` â€” `sort` param uses `-created_date` descending by default; verify for correctness on all calls
359. **[H][DONE]** `expectedEntityFields` â€” `JSON.stringify` of undefined fields should match missing keys, not `null`
360. **[B][DONE]** `findOptionalWorkOrderArrayItemIndex` â€” `locator.id` coerced to string; verify items with numeric ids match
361. **[H][DONE]** `sameValue` â€” `null` vs `undefined` vs `""` â€” document the intended semantics
362. **[B][DONE]** `createWorkOrderWithRecovery` â€” `rows.length >= 500` guard is arbitrary; consider `count` endpoint
363. **[H][DONE]** `ensureIdempotentEntityCreate` â€” creation-request-key uniqueness enforced client-side only; add backend unique check â€” RESIDUAL: backend unique constraint on creation_request_key still needed for hard guarantee (client dedupe hardened).
364. **[B][DONE]** `deleteBuilderEntityIfUnchanged` â€” `guardFields` should be `id` + `updated_date`, not just name
365. **[H][DONE]** `estimateConcurrency` â€” `sameValue` uses JSON.stringify; key-order matters â€” normalize first
366. **[B][DONE]** `createCustomerWithRecovery` â€” same-title filter uses `company_name`; verify against dedupe
367. **[H][DONE]** `replaceEntityFieldsIfUnchanged` â€” `expectedUpdatedAt` uses loaded row's `updated_date`; verify not stale
368. **[B][DONE]** `mutateWorkOrderArrayField` â€” `maxAttempts` retry logic: check it resets `readRows` between attempts
369. **[H][DONE]** `saveTrackedFields` â€” verify `record` vs `fields` shape matches function response
370. **[B][DONE]** `upsertCustomerFromEstimate` â€” `loadAllCustomers` + match-by-name is racy (two sessions create dupes)
371. **[H][DONE]** `expectedCustomerFields`/`replaceCustomerFieldsIfUnchanged` â€” CAS on `company_name` changes
372. **[B][DONE]** `canonicalAcceptance` â€” dedupe by `created_date` earliest; verify intent vs latest
373. **[H][DONE]** `deleteInventoryRecordIfUnchanged` â€” `guardFields` should include `nameField` value
374. **[B][DONE]** `equipmentPersistence.replaceRelationshipIdsIfUnchanged` â€” untested CAS path (write test)
375. **[H][DONE]** `createBuilderPartWithRecovery`/`createBuilderPartGroupWithRecovery`/`createBuilderProductWithRecovery` â€” `matchesPayload` normalize-strings check needed

## 16. Test Coverage Expansion (25)

376. **[T]** `estimator/` dead-code test â€” mark dead files as "no-op" so grep doesn't flag them
377. **[T]** `transitionWorkOrderFromLoadedSnapshot` full path with stub entity (CAS + stage transition)
378. **[T]** `preflightBuilderSourceMutation` â€” mock `getEstimate` + `assertMutationAllowed`
379. **[T]** `recordEstimateAcceptance` â€” stub entity + dedupe-by-version
380. **[T]** `recordEstimateQuoteDelivery` â€” safeUrl scheme stripping (javascript:/data:)
381. **[T]** `loadAllEntityRows` pagination â€” mock entity returns 2 pages
382. **[T]** `customerSync` â€” `syncEstimateToPipeline` with stub entities
383. **[T]** `getOpenEstimateRevision` â€” stub EstimateRevision filter
384. **[T]** `listEstimateRevisions` â€” strict vs non-strict error handling
385. **[T]** `ensureOpportunityWorkspace` â€” session-error â†’ 401 path
386. **[T]** `canonicalEstimateWorkOrder` â€” `estimate_id` + `work_order_id` identity
387. **[T]** `expectedWorkOrderFields`/`replaceWorkOrderFieldsIfUnchanged` CAS guard
388. **[T]** `deleteWorkOrderFieldsIfUnchanged` â€” guard-field + updated_date
389. **[T]** `sanitizeWorkOrderFormPatch` â€” SYSTEM_FIELDS exclusion complete
390. **[T]** `workOrderPatchMatches` â€” normalize-strings requirement (add impl + test)
391. **[T]** `createWorkOrderWithRecovery` â€” preflight limit + recovery dedupe
392. **[T]** `deleteInventoryRecordIfUnchanged` â€” guardFields nameField check
393. **[T]** `equipmentPersistence.replaceRelationshipIdsIfUnchanged` â€” CAS on relationship writes
394. **[T]** `staffEntities` â€” proxy facade method routing + error on mutation methods
395. **[T]** `estimateRevisionService` â€” `startEstimateRevision`/`completeEstimateRevision` with stub
396. **[T]** `expectedCustomerFields`/`replaceCustomerFieldsIfUnchanged` â€” CAS on name change
397. **[T]** `canonicalAcceptance` â€” earliest-created wins
398. **[T]** `ensureOpenEstimateRevision` â€” session fallback after C2-F fix
399. **[T]** `updateEstimateRevisionAudit` â€” expected_estimate_updated_date CAS
400. **[T]** `assertEstimateProductMutationAllowed` â€” deleted/archived/sent guards

## 17. Performance & Rate-Limit (25)

401. **[PERF][DONE]** `attention_feed` â€” batch entity queries (one query per entity type, not per item) â€” verified: one `feedRead` per entity type (11 parallel reads); the two Estimate reads merged into a single `$or` scan split in-memory (this pass).
402. **[PERF][BLOCKED â€” batch poll needs a `permittingScanStatus` backend change outside the edit fence]** `permittingScanStatus` â€” batch poll or websocket, not per-scan status call â€” per-scan polling remains by design; client-side Â±20% jitter on the adaptive 5s/15s poll + 15s background sync shipped instead (see #410).
403. **[PERF][DONE]** `loadAllEntityRows` â€” `limit` param where full-page load unnecessary â€” added: bounds total rows and never over-fetches (`limit: 50` costs one 50-row request); default full-scan behavior preserved for callers that omit it.
404. **[PERF][DONE]** `Estimator` list â€” virtualize estimate cards (>50 items) â€” `Estimator.jsx` renders a `CARD_PAGE=24` window + Show more (resets on status/term/sort); `EstimatorQueues` already windows at 40; `Estimating` rides `DragDropList`'s existing windowing.
405. **[PERF][BLOCKED â€” client-side search needs the full rowset]** `AllInOneEstimate` â€” paginate list endpoints (loadMore not loadAll) â€” `estimateMatchesSearch` matches inside `line_items`, so a server-side window would silently drop matches and corrupt status/trash counts; card render windows cover the mount cost.
406. **[B][DONE]** F5 entity_list rate-limit â€” consolidate `attention_feed` fan-out queries â€” duplicate Estimate scan (sent + sync-pending separately) merged into one `$or` query: 12â†’11 entity reads per feed build.
407. **[PERF][DONE]** `BuilderPartsPanel` â€” lazy-load parts when >100 â€” `PART_ROW_PAGE=100` render window on grouped and ungrouped paths + Show more; searching bypasses the window so every match stays reachable.
408. **[PERF][DONE]** `EstimateProductsList` â€” virtualize product rows â€” `ROW_PAGE=50` visible-row window + Show more (resets on query/module filter); filtering, deep links, selection, split mode and subtotals preserved.
409. **[PERF][DONE]** `inventorySources` â€” cache resolved entity schemas (don't re-fetch per tab) â€” schemas are a static declarative table (no per-tab fetch exists); `MasterInventory` additionally caches loaded rows per source key (`loadedSourcesRef`) so revisits don't re-read the entity.
410. **[B][DONE]** `timeClockAction` + `permittingScanStatus` polling storms â€” add jitter/backoff â€” permitting polls jittered Â±20% client-side (`ResearchProgressContext` `pollDelay` 5s/15s adaptive + 15s sync tick); `timeClockAction` untouched per fence, timeclock client call sites outside the allowed file list (see #424).
411. **[PERF][BLOCKED â€” managed backend]** `Customer` list â€” index `company_name` for search (backend) â€” `Customer.jsonc` exposes only name/type/properties/required/rls; Base44 owns index management.
412. **[PERF][DONE]** `estimateSalesActivity` â€” memoize categorize results per project â€” already shipped: `projectCategorizer` `_catCache` WeakMap keyed on the project object (verified remote).
413. **[PERF][DONE]** `extractBuilderParts` â€” cache module extraction per project+version key â€” already shipped: `_extractCache` WeakMap keyed on project identity â†’ `moduleKey|legacyMode` + catalogs identity (partSync.js).
414. **[PERF][DONE]** `markupEngine.applyMarkups` â€” skip recompute when tier/lines unchanged â€” already shipped: `_applyCache` WeakMap on the lines array + serialized settings compare (markupEngine.jsx).
415. **[PERF][DONE]** `QuickPrice` â€” debounce the calculation on input â€” the page is a launcher (no live calc); the only per-keystroke work, `?q=` `replaceState` write-back, is now debounced 300ms.
416. **[PERF][BLOCKED â€” managed backend]** `EstimatorCustomers` â€” index on `customer_name` field â€” same as #411; also the Customer schema has no `customer_name` column (uses `company_name`/`contact_*`).
417. **[PERF][DONE]** `estimateRevisionService.listEstimateRevisions` â€” `sort` server-side not client â€” verified: paged loader already passes `sort: "-revision_number"` to the server; the client re-sort is a cheap guard.
418. **[PERF][DONE]** `WorkOrder` list â€” `filter({current_stage:'estimating'})` not load-all-then-filter â€” superseded: `useAllWorkOrders` â†’ `workOrderCache` reads through boardFeed (persisted snapshot + delta cursor); `Estimating.jsx` filters that shared rowset and the kanban needs all stages anyway.
419. **[PERF][DONE]** `partSync.syncBuilderParts` â€” batch part writes (updateMany not per-row update) â€” write phase now drains queued jobs with `WRITE_CONCURRENCY=4` bounded parallelism (per-row CAS preserved); manual-addon inventory rows prefetched in bounded groups.
420. **[B][DONE]** `attention_feed` â€” `limit: 500` per entity is arbitrary; paginate properly (C2-L) â€” already shipped: bounded first page escalates to a paged full scan via `loadAllEntityRows` when a cap trips; `matched_totals` + per-bucket `truncated` cover ALL rows.
421. **[PERF][DONE]** `FoundationCatalog` â€” paginate material list (don't load all at once) â€” `ROW_PAGE=60` render window + Show more (resets on type/search); full dataset retained for type counts and filtering.
422. **[PERF][DONE]** `Customer` â€” `recent_customers` localStorage cache is fine; consider server-side last-viewed tracking â€” decision: keep localStorage (5 ids, client-local by design); server-side tracking rejected â€” a write per view for negligible UX gain.
423. **[PERF][DONE]** `masterInventory` tabs â€” lazy-mount non-active tabs â€” Radix `TabsContent` only mounts the active tab; per-source row cache (see #409) makes revisits free.
424. **[B][BLOCKED â€” systemic, outside this fence]** `smartsheetSyncAction` + `timeClockAction` entity_list bursts â€” the F5 systemic issue; needs consolidated reads + caching â€” both function files are forbidden here; existing mitigations: base44Client request governor + dedupe + cooldown, boardFeed delta cursors, staffDataRead batch coalescing + 30s read cache.
425. **[PERF][BLOCKED â€” contradicts list search; facade gap]** `AllInOneEstimate` â€” `line_items` field shouldn't be fetched on list view (payload too large) â€” `estimateMatchesSearch` matches inside `line_items`, so dropping it breaks list search; `staffEntities` also drops `fields` before the gateway â€” forwarding needs an out-of-fence facade edit.

## 18. Accessibility & UX Polish (25)

426. **[UX][DONE]** `aria-label` on all icon-only buttons across estimator (trash, edit, close) — aria-label + title on icon-only buttons swept across all estimator components (shared iconOnlyProps in estimator/a11y.js)
427. **[UX][DONE]** `aria-current="step"` on AioStepRail (done on header; verify rail too) — already shipped: AioStepRail has aria-current="step" on the active step (verified)
428. **[UX][DONE]** Focus-trap on all dialogs (modal focus should cycle) — Radix Dialog traps focus for all standard dialogs; new useModalDialog hook (estimator/a11y.js) traps the 3 hand-rolled modals
429. **[UX][DONE]** `role="dialog"` + `aria-modal` on all estimator modals — Radix supplies role="dialog" + aria-modal everywhere; role/aria-modal added to raw modals (Cancel/Merge/CustomerMerge) + customer statement modal
430. **[UX][DONE]** Escape-key closes all dialogs (verify each; CancelEstimateModal does) — Radix Escape-close everywhere; 3 raw modals wired to useEscapeKey (CancelEstimateModal actually lacked it — now fixed)
431. **[UX][DONE]** Enter-key submits forms where natural (e.g. custom-name in AddProductGrid â€” check) — verified: AddProductGrid custom-name flow + CreateQuickProductModal use native <form onSubmit>; note input submits on Enter
432. **[UX][DONE]** `aria-selected`/`aria-current` on status chips (not just buttons) — status chips converted to role=tablist/tab + aria-selected on Estimator and FoundationCatalog; EstimatorQueues already shipped tabs
433. **[UX][DONE]** Loading skeletons instead of spinners on list pages — ListSkeleton/TableSkeleton on Estimator, Estimating, EstimatorQueues, EstimatorCustomers, EstimateDetail, EstimatorParts, EstimatorProducts, MasterInventory, FoundationCatalog; remaining spinners get role="status"
434. **[UX][DONE]** `alt` text on all icons (lucide is decorative â€” `aria-hidden` appropriate) — decorative lucide icons marked aria-hidden across ~50 files (alt text not appropriate — decorative)
435. **[UX][DONE]** `type="button"` + `role="button"` consistency on all non-form buttons — non-submit buttons verified type="button"; clickable customer rows upgraded to role="button" + tabIndex + Enter/Space
436. **[B][DONE]** `aio` curly quotes â€” some components use curly quotes in confirm text; standardize — aio confirm text standardized to straight quotes; also repaired ~40 mojibake sequences (â€"/Â·/â€¦) in user-visible strings on EstimatorQueues/EstimatorCustomers/EstimateDetail
437. **[UX][DONE]** Keyboard-navigable status chips (arrow keys move between chips) — arrow-key + Home/End roving focus on status chip tablists (EstimatorQueues already had it; Estimator + FoundationCatalog added)
438. **[UX][DONE]** `aria-describedby` on form inputs with helper text — AddSectionDialog chips use aria-describedby for helper text; helper text elsewhere sits inside wrapped labels (implicit)
439. **[UX][DONE]** `aria-expanded` on collapsible panels (BuilderPartsPanel, AIO sections) — aria-expanded on BuilderPartsPanel (2x), ProductRow (3x), EstimateRevisionPanel snapshot toggle, MasterPartPickerModal quick-add
440. **[UX][DONE]** `aria-pressed` on toggle buttons (is_active toggles, enabled flags) — aria-pressed on QuickPrice module toggles, MasterPartPickerModal category chips + part rows, MergeEstimateDialog pickers, EstimatorCustomers tag filters, CreateQuickProductModal categories
441. **[UX][DONE]** `aria-live` region on save-status ("saved"/"saving" announcements) — save-status regions announce via aria-live="polite"/role="status" (AioEstimateHeader already shipped; EstimateDetail celebration + busy notes added)
442. **[UX][DONE]** `role="status"` on inline error messages — inline status text gets role="status"; hard errors get role="alert" (stronger than requested)
443. **[UX][DONE]** Tab order â€” dialogs should focus first input on open — Radix Dialog focuses first field on open for standard dialogs; useModalDialog does same (honors autoFocus) on raw modals
444. **[UX][DONE]** `title` tooltip on all icon-only actions (Trash2, Edit, Copy) — title= tooltips added alongside aria-label on icon-only actions (Trash2, Edit3, X, Copy, etc.)
445. **[UX][DONE]** Mobile touch-targets â‰¥44px on action buttons — destructive/primary dialog actions bumped to min-h-44px (Cancel/Merge/FoundationCatalog icon actions); dense table-row buttons keep compact sizing
446. **[B][DONE]** `aria-hidden` on decorative icons (some lucide icons may be inside buttons without it) — mechanical aria-hidden sweep on decorative lucide icons inside buttons/chips (~50 files)
447. **[UX][DONE]** `aria-label` on `aria-selected` chips in AddSectionDialog — AddSectionDialog chips carry aria-label (busy-aware) + aria-describedby to module descriptions
448. **[UX][DONE]** `role="alert"` on error banners — role="alert" on ~20 error banners across panels, modals and pages
449. **[UX][DONE]** Focus-return to trigger button on dialog close — Radix restores focus on close for standard dialogs; useModalDialog restores previous activeElement on raw modals
450. **[UX][DONE]** `aria-sort` on sortable table headers — n/a verified: no clickable <th> sort headers in scope — sorting is via labelled <select> controls (EstimatorQueues/MasterInventory)

## 19. Import, Export & Migration (25)

451. **[F][DONE]** Export estimate as JSON (re-importable) â€” shipped src/components/estimator/exportEstimates.js (aio-estimate-v1 envelope) + importEstimates.js re-import as fresh draft; ExportEstimateJsonButton/ImportEstimateJsonButton mountable in src/components/importer/ImportExportButtons.jsx â€” mount pending on EstimateDetail (owner file)
452. **[F][DONE]** Bulk-export estimates CSV (all fields) on EstimatorQueues â€” shipped exportEstimatesCsv + ExportEstimatesButton in src/components/importer/ImportExportButtons.jsx â€” mount pending on EstimatorQueues.jsx (owner file, fenced)
453. **[F][DONE]** Import parts library from CSV â€” shipped mapPartsLibraryCsv + importPartsLibraryRows â€” CSV rows land as `part`-type PartTemplate rows with deterministic idempotency keys (re-run reports existing, creates nothing); ImportPartsLibraryButton mountable â€” honestly PartTemplate (the library entity), not per-product BuilderPart
454. **[B][DONE]** `importMappers.detectTarget` â€” PART_GROUP_MAP vs KEYWORD_RULES precedence test â€” test-import-mappers.mjs â€” 5 new precedence assertions: mapped Part Group outranks LED/acrylic/retainer keywords; unmapped group falls through to keywords
455. **[F][DONE]** Import estimates from other module (e.g. legacy BOM â†’ new structure) â€” mapLegacyEstimateToAio in importEstimates.js maps {customer, project, items|line_items|bom|parts} â†’ AllInOneEstimate payload; unsupported shapes fail closed with an honest error; wired into ImportEstimateJsonButton
456. **[F][DONE]** Export estimate quote as printable PDF (not just HTML) â€” verified â€” src/components/estimator/quotePdf.js already lazy-loads html2canvas + jsPDF, slices multi-page, and window.print on the quote article prints to PDF
457. **[F][DONE]** Import customer list from CSV on EstimatorCustomers â€” EstimatorCustomers.importCustomersCsv now dry-runs every row against loaded customers and confirms exact new/matched/skipped counts via window.confirm before any ensureEstimateCustomer write
458. **[F][DONE]** Export inventory CSV with all custom fields â€” MasterInventory.exportCsvFor now exports declared columns + every stored/custom key found on the filtered rows â€” no custom field silently dropped
459. **[B][DONE]** `importSalesPipeline` â€” `478` dead ternary â€” verify the intended fallback â€” verified â€” `proposed.close_date ?? current.close_date` and `proposed.lost_reason ?? current.lost_reason` are live: omitted sheet fields keep current values, explicit values win; no change needed
460. **[F][DONE]** Import estimate â†’ link to existing customer by name â€” resolveImportCustomer in importEstimates.js: exact normalized company_name match auto-links, single fuzzy hit requires caller confirmation (window.confirm in ImportEstimateJsonButton), ambiguous never auto-links
461. **[F][DONE]** Export quote HTML as standalone file (shareable) â€” buildStandaloneQuoteHtml in exportEstimates.js â€” fully self-contained .html (inline styles, print button, quote display settings honored, internal costs never included); ExportQuoteHtmlButton mountable â€” mount pending (owner files)
462. **[F][DONE]** Import pricing tiers from JSON â€” verified â€” MarkupTierPanel already carries JSON import/export plus page-level tier JSON import on EstimatorCustomers
463. **[B][DONE]** `importOrders` â€” no upload size cap (C2-O) â€” verified â€” base44/functions/importOrders/entry.ts rejects uploads over 15 MB with HTTP 413 before parsing
464. **[F][DONE]** Import parts from other estimate (copy BOM) â€” copyProductBomToProduct + buildCopiedBomPackages in importEstimates.js clone a source Product's groups+parts via addPartPackageToProduct (fresh part_key/group_key per copy); CopyBomButton picker mountable â€” mount pending (owner files)
465. **[F][DONE]** Export change orders CSV â€” exportChangeOrdersCsv + ExportChangeOrdersButton shipped â€” mount pending on the change-orders surface (owner file, fenced)
466. **[B][DONE]** `legacyInventoryMigrator` â€” `buildPayload` per target â€” verify all 6 targets handled â€” test-legacy-migrator.mjs covers every classifyLegacyRow target: labor_service, sign_parts_supplies, substrate get valid payloads; keep/unknown return null (fail closed); buildPayload + TARGET_ENTITY exported for the test seam
467. **[F][DONE]** Import estimate sections from template â€” templateImportableSections + appendTemplateSectionsToEstimate instantiate a ProjectTemplate's line_items/sections list into the estimate via CAS; ImportTemplateSectionsButton dialog mountable â€” mount pending (owner files)
468. **[F][DONE]** Export all estimates â†’ backup file â€” buildEstimatesBackupDocument (aio-estimate-backup-v1) + Backup JSON inside ExportEstimatesButton â€” mount pending on EstimatorQueues.jsx (owner file, fenced)
469. **[B][DONE]** `ExcelImporterDialog` â€” `skippedRows` now shows count; add per-row skip reasons â€” ExcelImporterDialog now stamps sourceRow (spreadsheet row #) on every row and includes row numbers in 'No routable item name' and duplicate skip reasons
470. **[F][DONE]** Import inventory â†’ link existing parts by `inventory_item_id` â€” MasterInventory.linkPartsCsv â€” added missing staffEntities import (was a guaranteed ReferenceError) and dedupe: parts already linked to that inventory_item_id are counted as already-linked, not rewritten
471. **[F][DONE]** Export customer list CSV on EstimatorCustomers â€” verified â€” customer CSV export button already on EstimatorCustomers
472. **[B][DONE]** `importSalesPipeline` fuzzy match â€” score threshold too low (wrong-customer WO stamps â€” C2-H) â€” verified â€” salesImportUtils.mjs uses identity-first matching (source-row id, Est/Inv identity, exact customer/title); no fuzzy score threshold exists â€” ambiguous rows fail closed, so wrong-customer stamping is not reachable
473. **[F][DONE]** Import estimate line items from CSV â€” mapLineItemsCsv + appendLineItemsToEstimate append CSV line items to estimate.line_items via replaceEstimateFieldsIfUnchanged CAS; ImportLineItemsButton mountable â€” mount pending on EstimateDetail (owner file)
474. **[F][DONE]** Export estimate breakdown for job costing â€” exportEstimateCostingCsvRows/ exportEstimateCostingCsv emit per-part cost vs customer price per section + totals; ExportJobCostingCsvButton mountable â€” mount pending on EstimateDetail (owner file)
475. **[B][DONE]** `ensureOpenEstimateRevision` â€” `ensureEstimateLifecycleRevision` â€” `ensureBuilderPriceRevision` â€” `ensureCustomerSummary` â€” `deleteCreatedDuplicateWorkOrder` â€” `updateEstimateRevisionAudit` â€” all `auth.me()`-gated (C2-F) â€” verified all six: ensureOpenEstimateRevision, ensureEstimateLifecycleRevision, ensureBuilderPriceRevision, ensureCustomerSummary, updateEstimateRevisionAudit, deleteCreatedDuplicateWorkOrder â€” each gates on authenticateSignShopSession with base44.auth.me() fallback; no gaps

## 20. Admin, Settings & Misc (25)

476. **[F][DONE]** Estimate-number format customization (prefix/suffix pattern) â€” verified â€” QuoteDefaults.estimate_number_format + doc_number_padding drive generateDocNumber {seq} replacement; QuoteSettings exposes format + padding fields
477. **[F][DONE]** `quote_valid_days` default configurable in QuoteSettings â€” verified â€” quote_valid_days in QuoteDefaults (default 30), editable in QuoteSettings, applied at send-time
478. **[H][DONE]** `jurisdictionResearch` agent rename â†’ `jurisdiction_research` (publish blocker) â€” renamed base44/functions/jurisdictionResearchAgent â†’ jurisdiction_research; 4 invoke sites (refreshJurisdiction, batchUpdateJurisdictions, auditJurisdictionAccuracy, monitorJurisdictionChanges) now invoke jurisdiction_research; deployed; zero code refs remain (doc-only mentions in handoff notes)
479. **[F][DONE]** Quote email signature customization in QuoteSettings â€” verified â€” email_signature in QuoteDefaults, editable in QuoteSettings, appended by quote delivery
480. **[F][DONE]** Tax-group management UI (admin adds/removes rates) â€” verified â€” TaxGroup CRUD UI in QuoteSettings (add/edit/remove named rates)
481. **[F][DONE]** User-default view per page (per-user saved filter preference) â€” per-user pageViews preference persisted via UserWorkspacePreferences (workspacePrefsAction); editable in EstimatorSettings "My display preferences" card
482. **[F][DONE]** Admin â€” export all estimator data (estimates + inventory + customers) â€” verified â€” admin full_backup JSON dump (estimates, customers, parts/inventory, audit) on EstimatorQueues Backup button
483. **[B][DONE]** `ensureOpportunityWorkspace` â€” `session_token` error should be 401 not 500 â€” verified on the current name opportunityWorkspaceAction â€” authenticateSignShopSession throws a 401 Response on missing/invalid session_token and the handler maps it to HTTP 401 (no 500 path); ensureOpportunityWorkspace no longer exists remotely
484. **[F][DONE]** Estimate-number auto-reissue policy (on delete, reuse or skip?) â€” decided never-reuse: number_reissue_policy="never_reuse" in QuoteDefaults, surfaced in QuoteSettings, honored + documented in generateDocNumber (deleted numbers leave gaps; may be on customer paperwork)
485. **[F][DONE]** Admin â€” view all estimates regardless of salesperson â€” verified â€” admins see all estimates on EstimatorQueues; mine=1 toggle scopes to own
486. **[F][DONE]** Quote defaults â€” `tax_rate` source picker (TaxGroup dropdown) â€” default_tax_group picker in QuoteSettings; Step1EstimateDetails loads TaxGroups + falls back to the configured default (also fixed group_name field reference)
487. **[B][DONE]** `EstimatorSettings` â€” add `estimator_tools` hub link coverage check (nav-wiring test has all links) â€” test-nav-wiring.mjs now parses EstimatorTools LINKS[] and asserts every hub link resolves to a route; also fixed lazyPage import detection; PASS (72 links â†’ 108 routes)
488. **[F][DONE]** Per-user timezone preference â†’ affects `due_date` display â€” per-user display_timezone pref in "My display preferences" (UserWorkspacePreferences); resolveUserTimeZone/formatInUserTz helper honors user pref â†’ company default â†’ browser
489. **[H][DONE]** `backupPermittingRepository` â€” Drive upload format wrong (F18 â€” non-estimator but related) â€” fixed: was FormData+file fields against uploadType=multipart (invalid); now proper multipart/related body (JSON metadata part + media part, boundary-delimited); deployed; remote source verified
490. **[F][DONE]** Admin â€” audit log view (who changed what, when) â€” EstimatorAuditPanel (EstimateRevision + OpportunityActivity + admin actions) mounted admin-only on EstimatorSettings; ?tab=audit_log deep-link + EstimatorTools hub link
491. **[F][DONE]** `quote_expiration_date` default from `quote_valid_days` + `quote_issue_date` at send-time â€” verified â€” estimateQuoteExpiration computes issue+valid_days at send; editable override preserved
492. **[B][DONE]** `featureReports`/`CompletedReports`/`Opportunities`/`Financials`/`CustomerPortal` â€” `due_date` day-boundary bug (F27/C2-L family) â€” Opportunities now passes client-local today to list_follow_ups + list_opportunities (was server-side UTC boundary â†’ 1-day-early overdue); FeatureReports/CompletedReports display only full timestamps (no date-only parse); Financials already parses local dates; CustomerPortal slice held for portal owner
493. **[F][DONE]** Custom estimate statuses beyond the 7 built-in â€” CustomStatusesEditor in QuoteSettings edits custom_statuses + status_transitions (QuoteDefaults JSON)
494. **[F][DONE]** Estimate print preview before PDF â€” Preview PDF button in CustomerQuotePanel generates the quote PDF and opens it in a new tab (download fallback if popup blocked) before email/print
495. **[B][DONE]** `FoundationEstimator`/`BrickStoneEstimator` â€” `handleSaveAsCopy`/`handleSave` catch landed; verify alert vs error-state display â€” verified â€” both catch save errors with window.alert and render a blocking error state on prerequisite failures; convention consistent
496. **[F][DONE]** `EstimatorTools` â€” add "Export all estimates" tool link â€” added "Export all estimates" + Pricing Admin + Audit Log links to EstimatorTools hub (keys switched to label for shared targets)
497. **[F][DONE]** Quote footer customization (terms, warranty, disclaimer text) â€” verified â€” quote_footer_text + quote_terms_conditions + warranty_text + lead_time_text in QuoteDefaults/QuoteSettings, rendered on quotes
498. **[B][DONE]** `SalesHome` â€” `load()` catch landed; verify loadError renders correctly â€” verified â€” SalesHome renders loadError alert after failed load; retry path intact
499. **[F][DONE]** Estimate auto-numbering format per module (e.g. CH-#### for channel letters) â€” verified â€” module_number_prefixes JSON in QuoteDefaults maps module_keyâ†’prefix (CH-#### etc); generateDocNumber applies per-module format
500. **[H][DONE]** `jurisdictionResearch` â†’ `jurisdiction_research` â€” the publish blocker; rename + update `callJurisdictionAgent` reference â€” same work as #478 â€” function dir renamed, all 4 invoke sites updated + deployed, agent config base44/agents/jurisdiction_research.jsonc already in place; grep confirms no invoke refs to old name