# Address/map prototype — October 14, 2026

Phase 10, milestone 1, task 2 remains partial. Exact-address end-to-end acceptance remains blocked.

Added an optional unconfirmed Google address-map preview when no coordinates are available or the interactive SDK fails. Preview needs no app API key, retains external Google Maps access, and never assigns jurisdiction or office authority. Closing preview restores the main map; changed address/coordinates reset preview. Map tools are hidden while the preview is open. Existing exact matching, automatic no-match source scans, record permissions and client/job flows remain unchanged.

Added admin-only action geocode_diagnostic to the canonical findLocalityByAddress handler and regenerated/activated both address runtimes via Base44 write_file. This action authenticates with normal platform auth.me, returns before government geometry/catalog/research/archive paths, and does not create activity records even if supplied an action token. Ordinary address searches still require Sign Shop authentication.

Live normal SDK/admin probe for public address 10900 Reading Road, Sharonville, OH 45241 returned success=true, diagnostic_only=true, geocode=null, geocoding_service.status=REQUEST_DENIED, diagnostic_code=REQUEST_DENIED, lookup_revision=address-geocode-v5, llm_calls=0, record_writes=0, apply_allowed=false. Google did not disclose a more specific cause. Google Cloud key/API/billing administration is not exposed through the connected tools. The configured server geocoder remains blocked; no claim that exact lookup works. Initial pre-activation probe returned 401; no retry of a production write.

Google's key-free embedded map URL returned HTTP 200 with initialized public address/map data; imagery/rendering inside the authenticated production app remains unverified. External fallback preview: https://maps.google.com/maps?q=10900%20Reading%20Road%2C%20Sharonville%2C%20OH%2045241&output=embed

Validation: 34/34 focused address/diagnostic/map-recovery tests; 10/10 isolated Chromium checks at 320, 390, 1280 using actual React/map loader and production CSS with simulated Google SDK/iframe; focused ESLint; one build; runtime source consistency and git diff --check passed. Browser checks cover visible map/pin/control behavior, unconfirmed fallback open/close, exact-result dismissal, mobile overflow, layer/measurement controls, failure/retry and timeout recovery. No live paid research or authenticated full picker acceptance performed. Existing Browserslist/baseline-browser warnings remain.

No client records accessed or changed. No production permitting records changed. No settings/dispatcher/shared permissions changed. Backend runtime activation completed; frontend not published. Preserve unrelated concurrent CCS work.

Next product batch: demonstrate the actual complete picker search/no-match research/progress experience with permitting-only fixtures, streamline its primary result/actions for UI evaluation, and keep the Google Cloud configuration blocker explicit. Avoid another office audit. Google Cloud administrator must check the server key, enabled Geocoding API, key restrictions and billing before exact live lookup can pass.
