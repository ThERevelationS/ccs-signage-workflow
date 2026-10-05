# Phase 5 — resumable discovery and scheduled continuation

## Completed shared behavior

Discovery now retains a seed-bound frontier: pending pages and depths, visited URLs, unresolved gaps, and cumulative attempted-page count. The scanner validates the saved format, official host, source seed, depths and storage bounds before resuming. Completed pages are not fetched again. Extensionless pending PDFs retain their application/checklist title and type when classified.

refreshJurisdiction saves the frontier and discovered source links together through the existing conditional profile update. Whole-document/manual protections, canonical source guards, source reviews and existing stable IDs remain in place. A lost save acknowledgment reconciles the saved receipt; a conflicting writer cannot discard a newer cursor, documents, manual flag or source URL.

The existing enabled scheduled dispatcher now calls a shared continuation worker for one saved page per due scheduled cycle, before archival/text work. It does not invoke AI or debit the research discovery count. Network/parser failures stay separate from other pipeline stages. Pending-page failures are retained as review gaps while the remaining frontier can advance. Malformed/source-changed/oversized cursors are marked blocked with the original frontier preserved, and blocked cursors are excluded from automatic selection. New links invalidate a previously verified profile using the existing verification gate; no rule or locality completeness is approved.

No new manual research quota, automation configuration, frontend publication or test production mutation was introduced. Request and saved-metadata bounds protect persistence and execution; they are not a statewide collection denominator. Changed-source cursor restart, gap retry, expanded depth and external referrals require a future explicit review/reset path.

## Verification

72 checks passed across frontier, continuation, discovery/refresh, extensionless PDF pipeline, dispatch budgets and document preservation. Coverage includes multiple successive requests/cycles, root/page dedupe, preserved titles, saved failures, changed seeds, malformed/oversized state, lost acknowledgment and concurrent writers/staff edits. Both affected backend bundles passed. Full npm run build returned zero and generated fresh dist/index.html. git diff --check passed.

Live read-only inspection found zero profiles matching a pending saved frontier. The existing dispatcher configuration remains enabled, interval 15 minutes, up to 5 research dispatches/cycle, 20 in flight, 40/day and retry limit 3. Those settings were not changed. This is implementation and isolated acceptance evidence; it is not proof of a real scheduled frontier advancing in production.

Schema change: only the additive JurisdictionProfile.discovery_scan_state object. Existing fields and RLS remain unchanged.

## Next task

Supervised multi-locality live pipeline acceptance: create actual saved discovery progress from reviewed official seeds, resume it, confirm PDF archival/catalog/text handoffs and review gaps across varied OH/KY website patterns. Inspect the scheduled continuation receipt on real work. Include source-change/reset and external referral gaps in acceptance; do not claim Phase 5 complete or statewide coverage from a few pilots.
