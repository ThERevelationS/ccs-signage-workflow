# Phase 5 of 15 — capped-page recovery

Shared scanner recovery is available through authenticated admin discovery-only refresh: `jurisdiction_id`, `discovery_only: true`, `recover_link_limits: true`, `defer_archive: true`. It processes saved page_link_limit gaps without resetting visited URLs or consuming unrelated pending pages. Legacy gaps restart their ranked link collection at offset zero. Each 100-link portion saves its next offset; requests can continue with no daily manual-search quota. The page body hash must remain identical across portions, otherwise the gap and offset remain intact for review. Failed fetches likewise retain progress. Legacy missing depths use retained discovery metadata, or conservatively use the maximum traversal depth.

Discovered documents and cursor still save together through existing guarded replacement and protected merge. No new schema, RLS, automated daily budget or frontend publishing changes. Known automatic continuation remains unchanged. Sandbox backend changes auto-sync.

Verified: 58/58 focused tests, including 242 resources recovered across three requests, unchanged unrelated pending work, failed fetch preservation, invalid offset rejection before network, changed-page hash protection, actual compiled refresh and extensionless PDF archive/catalog/text pipeline. Both affected backend bundles, full app build and git checks pass.

Phase 5 remains active. Next: live admin recovery of Cincinnati's saved capped page and new PDF archive handoff. This chunk does not claim that production recovery or scheduled recovery has run.
