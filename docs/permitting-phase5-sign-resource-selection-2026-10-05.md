# Phase 5 of 15 — shared sign resource selection

The live Cincinnati acceptance run exposed alphabetical truncation of extensionless sign resources and unrelated fraud-report forms competing for discovery. The shared link harvester now ranks sign/outdoor-advertising resources before slicing its bounded link set. Actual downloadable files retain priority among other resources. Fraud reporting is excluded.

Traversal priority uses resource labels and destination leaf names rather than inherited forms directories. Existing saved pending pages are re-ranked without removing URLs, resetting visited pages, or clearing gaps. Manual/pinned document merges, archive identities, authority review and concurrency guards remain unchanged.

Validation: 54/54 focused tests pass, including crowded 150-link index selection, saved-frontier ranking, actual compiled refresh, concurrency protections, and extensionless discovery → verified archive → real PDF text. Two old fixture assumptions were updated: the zoning HTML page now returns HTML instead of a blanket fake PDF response; the size-bound assertion follows the shared response reader. Retained Cincinnati sign-page replay places Outdoor Advertising Sign Application and Signs Informational Handout first after the index. Both affected backend bundles, full app build, and git diff checks pass.

Phase 5 remains active. This correction improves future link selection but does not retroactively recover URLs omitted by an already visited capped page. Next: guarded re-scan of saved page_link_limit gaps, preserving prior progress and documents, followed by live PDF archive handoff acceptance. No frontend publishing or direct production-record modifications in this chunk. Backend shared files auto-sync through the sandbox.
