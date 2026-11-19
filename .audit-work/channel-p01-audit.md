# P-01 Channel-Letter Module Audit

Run 2026-11 under estimator scope + P-01 module grant. Surfaces inventoried:
`src/pages/ChannelLetterEstimator.jsx`, `src/components/estimator/channel/` (7 files),
`src/components/channelLetterInstall/` (60 files), entities `ChannelLetterInstallation` /
`ChannelLetterInstallInventory` / `ChannelLetterInstallEquipment`, `base44/shared/channelPricingWire.ts`.

## Per-surface findings vs the foundation hardened standard

| Named surface | Status | Evidence |
|---|---|---|
| Live purchase / fabrication / install ownership | PASS | Scope-aware `calcChannelProject` (`project_scope` full/letters_only/install_only); letter purchases carry `set_id`/`set_parent_id` parent-child sets (`LettersPurchaseTab`, `lettersCalculator`); dimensional fab has its own calculator + `DimensionalLetterMaterial` catalog entity |
| Counts / dimensions / set IDs | PASS | `qty_letters`, `letter_size` enum via `sizeMeta`, `raceway_length_feet`, `install_height_feet`; `set_id`/`set_parent_id` grouping landed in `LettersPurchaseTab` (child inherits parent set, splits on height/wall change) |
| Rate settings | PASS (1 note) | `Settings` entity → `settingsObj` keyed map; `installSizeRates` resolves type × size × height-bucket × env combos with documented legacy-key fallback; crew rates per-key `|| 75/65/35` display defaults AFTER verified load — acceptable operator-facing defaults, stamped into the record at save |
| Snapshots | PARTIAL | Materials price snapshots + `PriceHistoryDialog` history exist on the catalog side; `savedSnapshots` diff for dirty tracking. **Gap G1**: `ChannelLetterInstallation` carries no `*_calculation_version` / `acceptance` / `pricing_basis_snapshot` — the foundation-V2 accepted-design contract is not mirrored |
| Source save | PASS | `updateBuilderSourceProject` CAS on `expectedUpdatedAt`; `preflightBuilderSourceMutation`; `ensureIdempotentEntityCreate` + `creation_request_key` with signature-stable attempt keys; `upsertCustomerSummaryForEstimate` post-save |
| Builder mappings | PASS | `moduleRegistry` registers `channel_letters` (entity + page + `total_cost` sell field); `channelPricingWire.ts` entity contract detects engine context + per-line descriptors on items/letter_purchases/selected_equipment/personnel; `channelSellPricing.channelSellEconomics` injects `pricePart` + template seam — non-configured records keep numbers byte-identical |
| Photo entry points | PASS | `PhotoEstimateModal` — site photo → InvokeLLM (height, wall material, install type, conditions, confidence) → preview → explicit Apply; measurement-only prompt, no certification claims |
| Scope entry points | PASS | `AIInstallScopeModal` (items + replace/append modes) + `AIScopeWriterModal` — preview → explicit apply; no silent application |
| Fail-closed reads | PASS after fix | Page load `Promise.all` + `loadError` banner "Fallback configuration was not used"; **fix landed**: `MaterialsInventoryTab` project read was `.catch(() => [])` → fabricated all-zero usage map → `MaterialItemCard` badge hid. Now `projectsFailed` → "Usage unverified" badge |
| Deterministic calc | PASS | `channelCalc` pure: labor minutes + difficulty/height factors, materials per pricing_mode, equipment w/ duration+idle+delivery, personnel, travel, supplies %, markup — totals reconcile to subtotal+markup |

## Gaps carried into the P-02+ implementation pass

- **G1 (structural)**: No accepted-design snapshot versioning on `ChannelLetterInstallation` — adopt `calculation_version` + `acceptance` + `pricing_basis_snapshot` when the module takes the foundation-V2 contract.
- **G2 — CLOSED** (2026-11-12): the three catalog-tab create paths now route through `ensureIdempotentEntityCreate` keyed on each entity's natural name field (`item_name`/`equipment_name`/`material_name` — these entities carry no `creation_request_key` field). Identical-payload retries resolve the same row; a same-name create with different data throws instead of silently duplicating. `.audit-work/channel-g2-catalog/verify-g2.mjs` — 8/8 local + remote.
- **G3 — CLOSED** (landed earlier in the session, confirmed on remote 2026-11-12): `installExport` now emits `—` for held/unavailable values via `fmt`/`fixed` (`Number.isFinite` gated) instead of laundering missing values into `$0.00`; `__held` rows annotate "saved values (not repriced)".
