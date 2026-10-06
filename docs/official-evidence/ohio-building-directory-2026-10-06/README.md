# Ohio government building-directory service snapshot

Source: https://maps.ohio.gov/arcgis/rest/services/Hosted/BBS_Jurisdictions/FeatureServer/0

Captured October 6, 2026. Preserved metadata, before/after record counts and complete object-ID inventories, and all 195 source response batches. Each batch requests up to 200 IDs; 200 is a transport unit, not a total record cap. The read verifies every requested ID returned exactly once, rejects transfer truncation, and requires the complete membership and count to remain the same before and after capture. In-place edits during sequential reads remain possible; this is not an atomic historical snapshot. Source edit dates are preserved in attributes. No geometry was captured.

| Directory classification | Source records |
| --- | ---: |
| County | 88 |
| Municipal | 921 |
| Township | 2,340 |
| State Owned Property | 35,595 |
| Total | 38,944 |

The 3,349 non-property records form 3,346 publisher identity/name/county/type groups. Repeated rows remain linked explicitly; contacts or certification are not arbitrarily selected from a duplicate group. A directory row/group is not automatically a distinct government office or Census locality identity. Source jurisdictionid remains a publisher identifier and is not represented as a verified Census GEOID.

All original response bytes are retained using lossless gzip, reducing the source bundle from about 90 MB to about 8 MB including the reconciliation index. Manifest hashes refer to decompressed original bytes. records.json.gz preserves all attributes; reconciliation-index.json separates governmental research candidates from state property records without discarding source evidence.

Metadata exposes commercial and residential certification/contact fields, plumbing/medical-gas entity fields and exceptions. It does not provide dedicated electrical office fields. Building certification/contact information therefore cannot prove electrical permit issuance, electrical inspection responsibility, sign authority, complete document coverage or property-level authority. Such links remain unverified and need separate current official evidence and staff review.

Offline verification: `python3 scripts/capture-ohio-building-directory.py`. Reader acceptance: `python3 scripts/test-ohio-building-directory.py`. New captures use explicit `--capture` and refuse to overwrite this dated snapshot. No Base44 entities, approvals, AI calls or paid research are invoked.

Next: reconcile county/municipal/township groups to the Census reference and live app identities; inspect all certification exceptions; collect electrical delegation evidence and current forms/portals. Do not infer one parent county or office from the publisher name alone. State property requirements remain a separate applicability context.
