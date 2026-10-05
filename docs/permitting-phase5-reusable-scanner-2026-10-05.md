# Phase 5 — reusable scanner progression

This task advances the shared scanner, rather than adding another locality's production evidence. No production records were changed for verification. No LLM calls or new document uploads were made for the replay.

## Confirmed discovery gap and implemented behavior

Previously refreshJurisdiction harvested one permitting page only when the AI returned no documents. One AI document could suppress discovery of all other linked resources. The refresh now combines AI suggestions with deterministic same-host discovery even when the AI list is nonempty. Existing merge/version/manual-protection/authority gates remain in use.

The shared permittingDiscoveryScan worker follows relevant HTML links, deduplicates cycles and www/fragment aliases, prioritizes sign/application pages, retains the discovery page in provenance notes, and returns pending pages, failures and depth/link limits. Discovery-only refresh processes up to three pages per request without invoking AI. Ordinary research refresh processes one page to preserve its existing network budget. These are request execution bounds, not a manual research quota; no new daily manual limit or dispatcher setting was introduced.

The worker does not label a locality complete, infer adopted rules, upload files, change source reviews, or send evidence into jobs. Static same-host traversal can miss external office/code/portal referrals and JavaScript-generated links. Extensionless download classification remains open.

## Pipeline inventory

| Handoff | Current shared implementation | Remaining verification or implementation |
|---|---|---|
| Locality/office identity → official source | Existing canonical profiles, office/coverage review, jurisdictionResearchAgent | Comprehensive OH/KY identity inventory; reviewed external referrals |
| Official pages → resource links | NEW multi-page worker integrated into refreshJurisdiction; partial-AI omission fixed | Durable frontier across requests/cycles; extensionless resource classification |
| Resource links → downloaded originals | Existing archiveKnownJurisdictionSource / scheduled archive continuation, SHA-256 + byte readback | Connect extensionless files to verified archival without duplicate uploads |
| Downloaded originals → catalog | Existing stable registration keys and catalog continuation | Acceptance across varied locality website patterns |
| Catalog → searchable text | Existing PDF extraction, segmented continuation and explicit OCR gaps | HTML integration, supported non-PDF types and broader OCR workflow |
| Text → requirements | Existing exact citation and authority/review foundations | Automatic candidate extraction and review handoff across localities |
| Approved evidence → locality/workflow | Existing authority-aware integration foundations | Final locality UI, workflow-builder and job integration acceptance |
| Source changes → re-review | Existing SourceMonitor / queue controls | End-to-end changes, dependencies and review invalidation acceptance |

## Verification

49 targeted tests passed, including six tests of the actual refresh function with isolated dependencies and no production writes. Tests cover partial AI results, linked forms/fees, cycles, priority, failed pages, off-host redirects, depth limits, manual collection protection and retained archives. refreshJurisdiction backend bundle passed. Full npm run build returned zero and produced a fresh dist/index.html. git diff --check passed.

Offline replay used three previously retained original pages: Cincinnati OH, Alexandria KY and Campbell County KY. Replay output is in permitting-phase5-discovery-scanner-replay-2026-10-05.json. This proves parser behavior against retained website markup; it is not a freshness check or a full live end-to-end scanner run. Cincinnati's replay found 56 resource links but zero extension-suffixed downloadable files, exposing the extensionless resource gap. The full source inventories remain incomplete.

## Next coherent task

Implement content-type/signature classification for extensionless official resource URLs, retain a durable discovery frontier with version/protection guards, and connect those receipts to existing download/catalog workers. Then demonstrate discovery → verified archive → text → review-ready handoff across multiple locality website patterns. Do not return to serial manual locality collection as the primary development path.
