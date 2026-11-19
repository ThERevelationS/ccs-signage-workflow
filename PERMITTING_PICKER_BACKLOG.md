# Permit Picker ("Which office issues permits here?") — Fix Backlog

Goal: the address picker works 100% of the time for anyone who can type an
address. Simple by default, detail on demand, no dead ends, outlines always
visible, no loading errors.

## 1. Usability — "anyone who can type an address"

- [x] Paste-and-go: pasting a full address searches immediately (already exists)
- [x] Recent addresses chips (already exists)
- [x] Voice input + QR scan + GPS + paste button (already exists)
- [ ] First-run hint: only shows once; after dismiss there's no hint — add a
      permanent one-line "type address → press Find" cue inside the input label
- [ ] Enter-to-search already works; add visible hint text under the input
- [ ] "Find my office" disabled state needs a visible reason when address empty
- [ ] Multi-address mode: hide behind Advanced view (power feature)
- [ ] After apply: toast/alert already explains next step — keep
- [ ] When lookup can't resolve: always show ONE clear next action, never a wall
      of panels

## 2. Reliability — "works 100% of the time"

- [x] Lookup retries on 429 + 5xx (added: 429 waits 4s)
- [ ] Browser-geocode fallback exists (Nominatim resubmit) — also fall back when
      the function itself throws (currently only when it returns geocoding_service.issue)
- [ ] If the function call fails entirely, still try browser geocode + show the
      saved-office pick path instead of a bare error
- [ ] Saved-office list load failure → retry button (currently text only)
- [ ] Multi-address runner: stop on dialog close; cap concurrent invokes at 1
- [ ] 500-address validation harness against Census + Nominatim + all 5
      ArcGIS boundary endpoints — scripts/permitting-address-validation.mjs
- [ ] Google Maps loader: auto-retry once on failure before showing error
- [ ] Boundary fetch failures inside the map: catch per-feature so one bad
      polygon can't blank the whole outline layer

## 3. Layout — "looks great, not terrible"

- [ ] Sidebar: 400px → ~520px on large screens (map still dominant)
- [ ] Toolbar row wraps chaotically — split into: [address input + Find] row,
      [options] row behind "More options"
- [ ] "Paste several addresses" link floats loose under input — move into
      More-options row
- [ ] Google's mapType control overlaps our button overlay — the "Terrain"
      checkbox bleeds through → move mapType control to bottom-left
- [ ] Dialog content has no horizontal padding → field borders touch edges
- [ ] Header buttons (ES / A+) collide with title on narrow screens
- [ ] Result panels: consistent spacing/rounded/borders; status colors distinct
- [ ] Footer: pin Use/Close buttons; never wrap under content
- [ ] Mobile: stacked layout order — map below result card, not mid-scroll

## 4. Information density — "advanced view only for detail"

Default view shows ONLY: input row, status card (found office OR problem),
warnings that change what you do (PO box, GPS mismatch, boundary-edge),
saved-office pick path when nothing resolved, Use button.

Behind "Advanced view" (persisted toggle):
- [ ] Search activity / research progress
- [ ] "See office checks" details block
- [ ] AutomaticAddressScanResults + address archives
- [ ] Show technical details (admin)
- [ ] Multi-address mode toggle
- [ ] Full saved-office browse section (keep the detected-candidate pick visible)
- [ ] GPS-vs-geocode disagreement panel stays visible (action-required)

## 5. Jurisdiction outlines — "must work every time"

- [ ] Map receives GeoJSON MultiLineString — renders at zoom 17 = invisible
      because outline is outside viewport → fitBounds to outline on arrival
- [ ] "Zoom to outline" button next to outline toggle so users can return to it
- [ ] Guard: wrap each addGeoJson in try/catch; log + continue on bad feature
- [ ] When resolution has no boundary (approximate), say "outline not available
      for an approximate area" instead of a silent absent line
- [ ] Multi-boundary edge case: render all returned features, not just [0]
- [ ] County boundary as fallback outline when no city/township boundary exists
- [ ] Boundary style: thicker stroke + label the jurisdiction name on hover

## 6. Loading errors — "a system that eliminates this"

- [ ] All external calls get: timeout + 1 retry + honest degraded state
- [ ] Nominatim browser calls: respect 1 req/sec (queue, not parallel bursts)
- [ ] Repository list: cache 60s (currently 15s), refresh in background
- [ ] Map script load: exponential retry ×2, then static-map fallback exists
      (embedFallback) — verify it actually triggers
- [ ] 429 anywhere in the picker: show "busy — retrying in a few seconds"
      rather than an error string
- [ ] Never leave the footer button in a state where it looks broken

## 7. Validation + verification

- [ ] 500-address run: report per-stage pass/fail (running now)
- [ ] Fix whatever stage has >0% infra-caused failures
- [ ] Playwright: open Permitting, open picker, type address, verify simple
      view + advanced toggle + map + outline + apply path render
