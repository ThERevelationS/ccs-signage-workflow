# 6.4 numeric and page validation

Confirmed defect: String.includes accepted 50 square feet inside 150 square feet. The shared numeric validator now checks expression boundaries in the requirement as well as the exact cited excerpt. It rejects numeric/decimal/currency/sign tails and unit-word prefixes. Comma-separated amounts require groups of three digits. No unit conversion or inferred amount is performed. Candidate physical-page IDs must be positive safe integers.

The shared validator is used for staging and approval; no production data migration or existing rule edits occurred. Unsupported expressions remain review gaps rather than invented numeric values.

Validation: 45 focused evidence and compiled-handler tests passed; extraction and review backend bundles passed; full app build and git diff --check passed. Tests use fixtures/stubs, with zero actual AI calls and no production record writes. Browser and supervised live acceptance remain open. Next milestone: 6.5 idempotent extraction continuation/credit accounting. Phase 5 reconciliation and closeout remain open.
