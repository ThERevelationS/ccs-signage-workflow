# Permitting development scope — Brett's October 14, 2026 clarification

Brett states that the entire permitting section is not currently used. Permitting-only information does not require preservation for its own sake. He authorizes changes needed to finish it quickly, including permitting-only cleanup, replacement and disposable test data where useful.

Prioritize meaningful functional completion and larger manageable batches. Avoid serial documentation-only refinements, repeated conservative recovery work on disposable permitting-only records, and extra approvals for already-authorized reversible development.

Protected boundary: live client data is used across multiple systems and MUST remain untouched. Protect Customers/clients, Work Orders/jobs, sales, production/order records, linked files and relationships, permissions affecting shared systems, and all unrelated Sales/Fleet/SIPS/Time Clock/Order Form/Admin work. Treat mixed/shared records such as GlobalSettings conservatively: change only exact permitting keys/fields needed, and preserve unrelated entries. Isolate disposable tests to clearly permitting-only fixtures; never treat a shared/client record as disposable merely because permitting references it.

Accuracy remains required: do not invent exact jurisdictions, requirements, current law, office roles, provider contracts or evidence. Unresolved evidence can remain visible without blocking unrelated functional completion. Research/credit limits remain controlled unless explicitly changed.

Existing publication boundary remains: no frontend publication without explicit permission. Authorized affected backend resources may auto-sync/deploy as needed. The user's clarification does not itself request publishing the application.

Workflow: fresh HEAD/status → one coherent meaningful functional/coverage batch → focused verification → checkpoint → stop. Preserve concurrent source changes; never reset unfamiliar/shared work. Reports should distinguish synthetic browser checks, real deployed-function checks and authenticated production-browser acceptance.

Further clarification: prioritize a broadly complete, usable 90%+ functional prototype so Brett can assess major UI/UX choices before hardening. Defer nonessential auditing, proof-mechanism refinements and exhaustive hardening until the product flows are complete. This is a target, not permission to claim measured 90% completion without evidence. Keep only validation needed for working behavior and the protected live-client/shared-data boundary.
