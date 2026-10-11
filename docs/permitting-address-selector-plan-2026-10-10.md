# Address → location → reviewed permitting offices

Updated 2026-10-11. This replaces the earlier AI/name fallback plan and the earlier requirement to click a separate research button for an unmatched address.

## Simple surface

1. Enter a full street address, including Ohio/OH or Kentucky/KY, and press **Find my jurisdiction**. Typing alone does not start a paid search.
2. The map displays the returned location. The system checks government boundaries and the saved jurisdiction's geographic identity. It does not select a jurisdiction from a mailing city, ZIP code or AI-selected locality ID.
3. If there is no unique usable match, or sign/zoning office review is incomplete, website research starts automatically. The selector shows its live activity, pages checked, resources found and failures. Employees can read their own address activity; manual administrative rescans retain their existing permissions.
4. **Use this jurisdiction** becomes available for an address only after the location check and saved sign/zoning office review pass. Uncertain results and mismatched manual selections cannot bypass the address check. Scans do not apply a jurisdiction to a Work Order.

Long office checks are collapsed. Advanced map tools are under **More map tools**. Manual jurisdiction browsing still exposes scan controls; employees must supply an address to apply a selection. Administrator manual configuration remains available outside an address lookup.

## Implemented location checks

One non-partial Google ROOFTOP result must match the typed house number, street, supplied postal city, state and any supplied ZIP. Interpolated results, corrected identities and multiple candidates require review. Actual coordinates are intersected with Census county/incorporated-place polygons and Ohio or Kentucky municipal boundaries. Ohio addresses outside a city additionally require Census and Ohio township agreement. Kentucky county subdivisions are not treated as legal township authorities.

Conflicting/overlapping polygons, incomplete query results, unsupported states, invalid geometry, unavailable services and locations within 25 meters of a returned relevant boundary fail closed. Saved matching requires exact normalized name/state/kind and a matching government ID when available, or county context for municipalities/townships. A canonical link does not resolve duplicate locality identities. Research prompts include the county and geographic ID; a same-named profile from another county cannot supply its website.

Government source URLs and the check timestamp are retained in the response; activity records retain the actual queries and findings. Website discovery is a bounded first pass of up to three static same-host pages per target. Remaining page URLs, external referral destinations/source pages and individual scan gaps are disclosed in the selector. Source links distinguish pending originals from verified saved copies. Same-host downloadable findings enter a separate owner-scoped research collection; one original is attempted automatically, with Save original and Verify saved file controls for remaining files. Full-byte validation and source/stored hash readback reuse the durable archive worker. External destinations remain unscanned and unapproved. Candidate sites, harvested resources and saved originals remain reference material. They do not create approved locality/office data. Pending collection dispatcher integration and a dedicated collection/review browser remain separate work.

## Map behavior

The authenticated key request includes the SignShop session. The canvas has an explicit responsive height. Address pins update both before and after SDK readiness. Loading failures are visible and retryable. Zoom, pan, camera/rotation where supported, keyboard controls, roadmap/satellite/hybrid/terrain, Street View, fullscreen and scale are enabled. Additional tools provide traffic, transit, bike routes, jurisdiction outlines, approximate distance measurement, recentering and external Google Maps/directions. Map interaction does not change the matched jurisdiction.

## Remaining scope and verification limits

These checks establish building-point geography, not statewide parcel-polygon verification or complete legal/project-specific office applicability. Government datasets can lag annexations. Missing or conflicting evidence needs administrator review; the system must not invent certainty. Address evidence caching, parcel footprints, project-specific authority completeness and additional states remain separate work.

The build, lint, backend bundles, 303 focused regression tests and 25 Chromium checks passed. Browser tests used the actual React components and production CSS with mock API/Google SDK responses. Live government GIS point queries verified Mason/Warren County, Deerfield Township/Warren County and Florence/Boone County. Those probes injected the precision flag and did not geocode real job addresses or certify parcel/office authority. Signed-in live Google key restrictions, imagery and the complete deployed address flow remain unverified. No production Work Orders or reviewed authority records were changed during tests, and no publication was performed.
