# Sharonville refresh deployment verification — 2026-10-13

Phase 10 / Milestone 1 / Task 2 remains partial.

Fresh HEAD `9acb55749c32ba394cf206c033d85d219ae88624`; clean tree. CLI whoami verified brettheinlein1@gmail.com. Named remote pull of refreshJurisdiction used an isolated `/tmp/permitting-deployed-review` project; no production repository files were overwritten.

The pulled deployed handler and four relevant dependency files exactly match repository bytes:

| File | SHA-256 |
| --- | --- |
| base44/functions/refreshJurisdiction/entry.ts | 52d335e00c0032957e05cde92ea83e518050e7cbcee9c8bbcc1a00c0f5775696 |
| base44/shared/jurisdictionPermittingLinkDiscovery.mjs | b6ec57b0d6db4a3b1d674721bc973acfcc2b3026fb842a3165ed858e10c60456 |
| base44/shared/permittingDiscoveryScan.mjs | 72f8bc354306cc14bdc46ec19e728dd6c3f8a45dcd81c622ae3b38cb8f0a5432 |
| base44/shared/jurisdictionResearchDocumentMerge.mjs | 7be833e41a0d616b28562c1c2338378ec0a0c052bd6b1b81d92c0679f1a8e734 |
| base44/shared/jurisdictionPersistence.mjs | 3209af4a1bbf5ed4dea350acf791151f7b24308ab83a26299e01365a06ad41f4 |

Deployed relevance vocabulary includes permitting. The selected rescan mode is present and bounded to one page. This verifies retrieved deployed artifacts, not authenticated invocation behavior or official website availability. Other dependencies were not exhaustively compared. No redeployment was necessary or performed.

Next chunk: verify SDK execution identity and fresh exact Sharonville profile, then invoke refreshJurisdiction once with discovery_only:true, defer_archive:true and rescan_source_url equal to the actual saved permitting_url. Last observed seed was https://www.sharonville.org/394/Sign-Application, not the department page. Do not change seed or fabricate discovery state to select the department. Use normal authenticated access, no privileged/RLS bypass. Verify returned and persisted document IDs/frontier; if seed is a PDF, retain classification and unresolved onward-discovery gap instead of claiming guide discovery. No LLM, uploads or authority approval intended. This bounded research update may save genuine discovery metadata but must not alter jobs or create test records.

Five byte-equality/hash checks passed. Final diff check and status verified in checkpoint report. No runtime code change, additional build, production record changes, frontend publishing or backend deployment occurred in this chunk. Authenticated browser acceptance remains pending.
