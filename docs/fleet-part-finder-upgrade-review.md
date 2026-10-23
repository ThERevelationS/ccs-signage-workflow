# Fleet Part Finder upgrade review

Scope: `src/components/fleet/FleetPartLookupDialog.jsx`, `src/pages/FleetParts.jsx` (one prop),
`scripts/test-fleet-part-lookup-upgrade.mjs`, `scripts/test-fleet-part-lookup-browser.mjs`.
No entity schema or backend function changes were required.

## Phase 1 — multimodal identification

- AI returns up to 3 ranked candidates; top-level fields mirror candidate zero for backward
  compatibility with persisted `FleetPartIdentification` rows.
- Per-field confidence (part number, manufacturer, category, specification, fitment) rendered
  as badges in Verify.
- Up to 4 photos per lookup; thumbnails, removal, primary-photo marker; all URLs sent to the
  model and persisted to `uploaded_photo_urls`.
- Live camera barcode scanning via `BarcodeDetector` + `getUserMedia` (~400 ms poll); all
  tracks stopped on close/cancel/unmount; hidden when unsupported.
- Clipboard paste and drag/drop photo ingestion; each new photo retries barcode detection.
- Resume strip for recent open identification sessions inside the dialog.
- Safe external research/vendor links (http(s) only, `rel="noreferrer"`).
- Ctrl+Enter identifies from the query box.

## Phase 2 — lookup to action

- "Request more of this" panel: linked requests via `inventory_item_id` on duplicate matches
  and post-match/promote; free-text drafts otherwise. Submits through `fleetRequestAction`.
- Request `creation_key` regenerates on every draft-field edit — unchanged retries stay
  idempotent, changed drafts cannot collide with same-key/different-intent.
- Alternate/OEM numbers render as cross-reference chips that start a fresh session while
  retaining the physical part's photos/barcode; the prior review stays in the inbox.
- Hardware wedge scanners terminating with Enter trigger identification from the barcode field.
- Duplicate match cards show the existing part's physical location.

## Phase 3 — inventory, fitment, vendors

- Live inventory awareness while typing/scanning: exact part-number/barcode and name matches
  surface with stock + location and a "Request more" action before any AI call.
- Review-only AI fitment check over human-selected equipment (year/make/model/VIN/engine);
  per-equipment verdicts (fits / likely / uncertain / unlikely / does_not_fit) with reasons.
  Never mutates selections. Results reset on analyze/resume/reset/re-search.
- AI vendor options (up to 3 researched sources: vendor, SKU, URL, est. price) rendered as an
  apply-on-click comparison that fills Procurement fields.

## Phase 4 — verified-candidate request

- Verify step gains "Request this part": a candidate that is not in inventory can be sent to
  Fleet Requests without promoting it into `FleetPart`.
- Requests carry identification-session provenance in `notes`
  (`Raised from part-identification session <id>`).

## Safety invariants preserved (asserted by tests)

- `expected_updated_date` CAS on review/match/dismiss/promote writes.
- Session `creation_key` on identification creation; stable request keys with regeneration.
- Busy gating, Escape lock during mutations, focus trap/restore.
- Camera tracks stopped; object URLs revoked; scan loop killed on close.
- AI remains review-only: no silent inventory creation, no auto-selected equipment.

## Verification

- `scripts/test-fleet-part-lookup-upgrade.mjs`: 24/24 contract checks.
- `scripts/test-fleet-part-lookup-browser.mjs`: 9/9 synthetic Chromium scenarios
  (desktop + mobile; all outside origins blocked).
- ESLint clean; isolated esbuild compiles the JSX.

## Known limitations

- Real-camera barcode scanning needs a physical device; synthetic Chromium cannot produce a
  video stream. `BarcodeDetector` fallback hides the control where unsupported.
- No live authenticated acceptance against production Fleet records (by design).
