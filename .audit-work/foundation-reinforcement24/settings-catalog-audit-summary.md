# Foundation settings+catalog availability hardening — local candidates (reinforcement24)

App `68dfcc5e57bbbc35387da97c`, branch `main`, remote HEAD `f33518b327fb282abc16fd134cac233911ccae09`
(frozen under `.audit-work/foundation-reinforcement24/remote-src/` + `settings-catalog-baseline.json`).

## Scope delivered

- **F1** `legacyFoundationCalc.js` — strict consumed-Settings validation via
  `foundationItemSettingIssues` (kind `foundation`, per-item index, code
  `foundation_setting_unavailable`). Only settings the item's recorded
  configuration actually reads are checked; absent/blank keeps the legacy
  fallback; explicit `0` stays legitimate except the positive divisor read
  (`foundation_main_labor_rate` when finishing-hours are back-calculated).
- **F5/F7** `foundationInputValidation.js` — `excavation_method` enum
  (`hand_dig`/`equipment_excavation`) on items + project default (inheriting
  items held), and truthy non-record `project.landscape` rejected
  (`landscape_unavailable`).
- **Wiring** `foundationCalc.js` — effective item = item + project method
  fallback; setting issues merged once into `catalogIssues` and per-item
  `itemPricing`; delivery gated when item pricing unavailable (no double-scan);
  acknowledged saved snapshots held on item + delivery.
- **F3** `foundationEquipmentBindings.js` — `row.qty ?? 1` preserves a recorded
  `0` attachment quantity (was `|| 1`).
- **F2** admin catalog writes — `catalogNumberInput` in
  `FoundationInventory.jsx`, `EquipmentInventoryTab.jsx`,
  `WallCapsInventoryTab.jsx`, `FoundationMaterialDialog.jsx`: blank → `null`,
  valid → `Number`, malformed → verbatim for downstream validation.
  `FoundationCatalog.jsx` unchanged (read-only).
- Lint hygiene: removed a pre-existing unused `base44` import in
  `EquipmentInventoryTab.jsx` (remote L11, identical error on frozen source).

## Verification (all local, frozen remote sources + candidates)

| Check | Result |
|---|---|
| Model (`verify-settings-model.mjs`) | 27/27 ok |
| RED vs pre-hardening remote-src | 10 compat pass / 17 expected fail |
| Real-page Save harness (`verify-settings-page.mjs`) | 10/10 — blocked saves emit the paused message with zero writes; held/acknowledged amounts render; valid + zero-setting + zero-attachment paths save |
| Browser proof (`verify-settings-browser.mjs`) | 12/12 — 6 modes × {1280,390}: valid, malformed, partial, import-NaN, free-zero, invalid-method; held banners, disabled catalog controls, single-lane issue merge, gated delivery, no overflow, 0 fetches/XHR/writes/console errors |
| Staged consumer bundle (`verify-settings-consumers.mjs`) | inputs=77, 0 warnings |
| Scoped ESLint (8 candidates) | all exit=0 |
| esbuild parse (8 candidates) | 8/8 |

## Candidate hashes (sha256)

- `legacyFoundationCalc.js` `b799f3d33a794f6249beadb0b527a710f7df42d9aad0d0e062edb846dee4d1e4`
- `foundationInputValidation.js` `cd2cd349650134af3137be7a7a200c11fb52bd5d7a2429b9faf436abbb657f63`
- `foundationCalc.js` `ac9c53eb4c08a023ac7c2268c07de09b6591528976cf38a322e8b82d7769557a`
- `foundationEquipmentBindings.js` `9770051bb7cce5424d5075b6fff2910288f2eba6b5724dc3194d2a59928b543f`
- `FoundationInventory.jsx` `0e9d351cfce62d4d6d18d2c4efe24a43c084b8224e6700f2e2df4382385149c6`
- `EquipmentInventoryTab.jsx` `d0503e650c548a1e40a42fd6b8e34726830dc62bfcc25d29722464070a571865`
- `WallCapsInventoryTab.jsx` `735ddb052b673b9834ea94b9bf159919bab8d71a00eefade7f5457f6299be2ca`
- `FoundationMaterialDialog.jsx` `5fbfd26600a281b7fd768974c5aa8cc78a82f31f8d2bad64392d304dc47bdf5b`

## Transport status

**No remote writes.** No sandbox apply, checkpoint, entity/business-record
operation, schema activation, publish, deploy, or release occurred. Candidates
exist only as `.audit-work/foundation-reinforcement24/settings-catalog-candidate-*`
files; `settings-catalog-transport-spec.json` documents the intended apply
order and protected files for a future authorized transport.

## Known notes

- React Router future-flag warnings appear in the page harness only (known
  upstream noise, not a regression).
- Local workspace `src/` contains pre-existing unpushed modifications outside
  this scope — untouched; all verification ran against frozen remote sources.
