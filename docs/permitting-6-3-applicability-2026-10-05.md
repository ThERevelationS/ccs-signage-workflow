# 6.3 structured applicability implementation

The reusable literal candidate pipeline now retains deterministic applicability evidence inside evidence_context, supported by the existing object schema. Each sign type, district, trigger and exception field records its exact literal and either quoted or not_established_in_excerpt. Absence never means all signs/districts, unconditional applicability or no exceptions. Address applicability remains requires_review, including when every field has quoted wording.

Import comparison includes this metadata so staff edits are preserved. Approval validates consistency for records containing the new metadata; older records retain their existing review path without a migration. Extraction identity remains unchanged because applicability metadata is derived from the same literal fields, avoiding duplicate identities for equivalent evidence.

Validation: 43 evidence/compiled-handler tests passed, both extraction/review backend bundles passed, app build passed, git diff --check passed. Tests use fixtures and AI stubs: zero actual AI calls or production record writes. Browser presentation and live supervised acceptance remain open under 6.7–6.9. Next milestone: 6.4. Phase 5 archive/text reconciliation and closeout remain open.
