### Phase 10 → Milestone 1 of 3 → Task 4 partial — browser attempt and SDK adapter acceptance (2026-10-07)

Preserved fresh concurrent HEADs. Opened established sandbox preview AdminSettings URL in browser: accessibility tree and screenshot both blank; one reload remained blank. No sign-in screen or site-served bot challenge observed, so no bot-block diagnosis or login loop. Live authenticated app acceptance is not passed; Task 4 and Milestone 1 remain open. Task 2 implementation/reconciliation closeout preserved.

Added focused acceptance of actual readRecordedCoverage SDK adapter using injected test SDK: exact OH/KY scope; 500 as page size without total cap; continuation cursor; per-entity cursor reset; duplicate-ID merge; progress; superseded read prevents next entity; profile access failure propagates instead of showing partial completeness. Requests now project needed identity fields and omit top-level profile documents/activity logs. Parent county remains existing nested field; no schema, permissions or record modifications.

Validation: SDK adapter and real React panel tests passed; targeted ESLint and git diff --check passed. Production build passed with exit receipt 0. These are automated adapter/component tests, not live SDK/browser acceptance. No production records changed or frontend publish. Next: independent Milestone 2 Ohio collection expansion from the saved gap inventory, preserving Task 4 blank-preview blocker until access changes; Kentucky collection follows Ohio. Do not repeat identical preview or download failures.

