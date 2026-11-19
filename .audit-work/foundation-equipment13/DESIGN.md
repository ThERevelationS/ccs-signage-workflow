# Equipment13 - Lead-Owned Decisions

## Confirmed Evidence

Fresh remote/local baselines: `baselines.json` (EquipmentTab, foundationCalc, legacyFoundationCalc, FoundationItemCard).
Lead-authored/run diagnostic `reproduce.mjs` and frozen `observed-defects.json` reproduce FIVE actual paths, not static hypotheses:

1. Merely rendering real EquipmentTab mutates supplied `attachment_counts:{}` into `{att:1}` from legacy IDs. No onUpdate/markDirty. Real engine changes synthetic cost100 to115 on the subsequent calculation.
2. Normalized `attachments:[{id:att,qty:2}]` costs130 in actual engine but card shows100.
3. Explicit zero custom rate/delivery + custom quantity2 costs0 in engine but card shows120.
4. Missing parent rental: saved600 overwritten0 and selected card disappears.
5. Missing selected attachment: saved115 becomes100, silently omitting the attachment.

These are synthetic diagnostic numbers only, not customer prices. Inputs frozen before execution in `frozen-inputs.json`. Do not re-run derivation for presentation. No source changes for equipment13 yet.

## Required Next Critical Work (Lead Only)

Before editing financial code: freeze the exact current engine bundle and a deterministic complete-catalog parity matrix, reusing already-derived diagnostic expectations for identical cases. Author/check financial model and its tests personally. Sidekick may implement only UI after that model passes and this contract is settled.

MINIMAL UPSTREAM DESIGN (supersedes the initial standalone-price-model idea): keep monetary equations in their existing `foundationCalc.js`, do not duplicate/move an entire pricing engine. Add pure `foundationEquipmentBindings.js` with NO SDK/React/Calc/Integrity imports, exporting `resolveFoundationEquipment(entry,inventory,index)`, `foundationEquipmentCatalogIssues(entries,inventory)` and `setFoundationEquipmentCount(entry,{kind,id,quantity})`. It owns binding/quantity projection, not rental money. First file has now been authored by lead but is not wired/tested yet.

Extend the existing monetary implementation in foundationCalc with `calcEquipmentPricing(selected,inventory)` returning detail rows `{pricedEntry,equipment,rentalPeriod,duration,attachmentMode,attachmentRows,subAttachmentRows,baseCost,deliveryCost,totalCost,issues}`. Each line row gets its computed cost. Use resolver rows with original branch ordering/type/qty semantics; retain original getRentalCost, all override/default/evaluation-order math. On missing refs preserve entire supplied row and return null current breakdown amounts. `calcEquipment` wraps detailed rows and returns `.pricedEntry` ONLY, with no breakdown metadata persisted.

Also export `equipmentCostTotal(pricedEntries)` using the SAME existing equipment num/reduce semantics; use it in existing calcProject aggregation and UI (no duplicated sum logic). UI imports this canonical calculator, not its own rates arithmetic. This graph is acyclic: Calc -> Integrity -> Bindings, Calc -> Bindings, UI -> Calc/Bindings. Integrity appends bindings' issues without computing money.

Before changes lead froze `engine-before.mjs`, full six-source snapshot/hashes and `complete-catalog-parity-inputs.json` with29 actual original cases. Three existing diagnostic results reused;26 new literal anchors checked personally with deep-frozen source. Preserve all exact expected priced rows, not just totals.

## Original Pricing Semantics To Preserve

- Parent: first inventory row matching entry.equipment_id (originally ANY material type; do not add category filtering without auditing normalized legacy writers).
- Period entry.rental_period||day.
- Duration entry.custom_qty if non-null/undefined (zero honored), else entry.rental_duration||1 (legacy zero fallback preserved).
- getRentalCost(item, override): non-null override * duration, else selected day/week/month num(rate)*duration, else0.
- Base uses entry.custom_rate, delivery if include_delivery uses non-null custom_delivery_charge else num(parent.pickup_delivery_cost). Delivery is flat, not multiplied by quantity.
- Attachments precedence: NONEMPTY normalized attachments[]; else TRUTHY attachment_counts (including EMPTY OBJECT); else NONEMPTY attachment_ids.
- Normalized IDs att.id||att.inventory_id, any matching inventory row, quantity att.qty||1 (legacy zero->1 preserved). No override interpretation in attachment row.
- Counts: only matching material_type attachment, quantity num(value,0).
- Legacy IDs: only matching material_type attachment, each occurrence charged once (duplicates remain priced).
- Sub counts: only matching material_type sub_attachment, num(quantity,0), independent of parent attachment compatibility.
- Rates/custom defaults/negative/fractional/imported quantities are NOT silently repaired under extraction. O008 rate/quantity validation/versioning remains open.
- Do not use a Map with last-match semantics: original inventory.find chooses FIRST match.

## Missing Bindings And Price Provenance

- Missing/unassigned parent OR any effectively selected attachment/subattachment reference => preserve WHOLE supplied row including existing equipment_cost, do not combine fresh parent with a missing child. If no snapshot field, leave it absent, not0.
- Count-map entries with effective num(qty)===0 are not selected and do not require a catalog row. Normalized qty0 means1 under original formula, so still requires the reference.
- Mirror each branch's lookup type restrictions exactly, not a new guessed universal filter.
- Issues use existing catalog shape `{kind,index,componentId,field,inventoryId,code,message}`. Kind equipment/attachment/sub_attachment, index parent entry index, componentId entry.component_id??entry._id??null; preserve missing-vs-unassigned codes. Field identifies the original source container. Messages include Equipment N and the specific unavailable ref.
- On any missing binding, base/delivery/subline current costs must not be displayed as fresh amounts; total is saved snapshot or Not saved. No partial zero/free prices.
- CatalogIntegrity appends these equipment issues. Existing page gates then protect Save/SaveExit/CtrlS/autosave/Copy/Swap/Builder. Change repeated page copy to generic selected materials/rental items, not pole/cap/wall only. Existing recovery receipts must not clear.

## Pure Selection Projection / Explicit Edit Adapter

- NEVER mutate entry, attachment_counts, legacy arrays, inventory, or history during render.
- A supplied empty counts object wins over legacy IDs, just like the engine. No eager migration on view.
- Normalized mode rows preserve each original record and order. Duplicate IDs stay individually priced/visible; expose an ambiguity warning and disable quantity edits that cannot identify one record. Explicit Remove all duplicates can remove them with normal undo.
- For normalized edits: change the unique matching record's qty, retaining other properties; add `{id,qty}` when new; quantity0 removes matching rows rather than storing qty0 (which legacy treats as1). Clear shadow attachment_counts to{} and attachment_ids to[] on EXPLICIT normalized edits, so removing the final normalized row cannot resurrect shadow legacy charges.
- For counts/legacy-ID edits: project effective selection into a fresh counts object; legacy duplicate IDs aggregate their occurrence count. Supplied counts{} stays empty before user action. Update/remove target key; clear attachment_ids and empty attachments[] on explicit edit. Use Map/Object.fromEntries or equivalent safe-key handling, not prototype-sensitive object assignment.
- Sub counts use a fresh copied map and explicit target change/removal.
- Input-edit quantity must be finite nonnegative integer. Existing fractional/negative legacy values remain priced unchanged on view; do not clamp them implicitly. Return an actionable error on unsupported edit, never discard the saved selection.
- All other fields (identity, overrides, unknown authored metadata, other quantities) survive.

## UI Implementation To Delegate Only After Critical Model Passes

Only EquipmentTab, minimal FoundationEstimator generic copy, new UI tests/browser as needed. No schema/backend or other modules.

- Replace duplicated card/footer rental arithmetic with model outputs and shared money formatter. Do not let worker invent monetary calculations.
- Retain current Card/indigo visual patterns. No broad UI redesign.
- Render ALL selected equipment even when inventory missing; retain quantities/overrides and saved total, label Saved amounts / Pricing unavailable. Unknown snapshot -> Not saved, real0 -> actual0.
- Missing rows must support reassign/remove; no automatic child clearing when parent changes. All selected children, including unavailable/incompatible/unlinked children, remain visible for review; show compatibility warnings separately from availability, do not silently omit their already-priced cost.
- Add eligible compatible options without hiding already selected incompatible children. Selection/quantity changes call the pure adapter. Parent ID changes preserve children and warn for review.
- Existing custom_rate/custom_qty/custom_delivery_charge must be visible and used in totals. No need to introduce NEW override fields in this unit: show existing overrides and explicit Clear controls. Duration edit does not secretly discard a custom quantity; explain which override is active and how to clear it.
- Include zero-rate period options (do not use `rate && option`).
- Unknown saved periods should stay visible as review values, not silently select day.
- Unknown/new rates and general malformed field validation remain O008, not claimed complete by this unit.

## Test Gates To Settle Before Handoff

Critical model: exact deep equality to frozen original calcEquipment for day/week/month, delivery, all three storage shapes, empty-counts vs legacy conflict, normalized+shadow data, duplicate legacy IDs, subcounts, explicit zero overrides, duration defaults. Frozen inputs ensure no mutations.
Missing parent/child/sub preserve snapshot including0/absent; zero count doesn't spuriously block, normalized0 DOES require ref.
Edit helpers: immutable frozen inputs, normalized removal cannot revive shadows, counts conflict matches engine, legacy duplicates preserved until explicit edit, duplicate-normalized ambiguity, safe keys, invalid edit rejection.

UI: real engine/model with actual EquipmentTab. Merely rendering frozen source must not throw or mutate, updates/dirty0; display==engine including normalized2 and custom0; explicit quantity change creates exactly one parent update and matching new total; no hidden shadow precedence; unavailable rows visible/editable; full save/copy/Builder blocked when equipment bindings missing, restore catalog preserves draft and receipts. Exact-origin SDK-free browser; no vague global text assertions or optional/no-op handlers.

No source implementation has begun. Source11 pricing11 is checkpointed and accepted, do not rerun those derivations simply to format this evidence.
