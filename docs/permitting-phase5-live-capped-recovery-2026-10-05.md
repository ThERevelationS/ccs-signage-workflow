# Phase 5 of 15 — live capped-page acceptance

Cincinnati profile 6ac1a123edda6d8dd942690b was recovered through authenticated discovery-only refresh. The first live run exposed a false block from full HTML hashing: page markup changed between requests. Recovery now hashes ordered resource URLs and titles, ignoring unrelated markup while still blocking actual link changes. Old HTML-hash offsets restart at zero during manual recovery; prior documents and visited progress remain intact. Refresh now retains discovery page/depth metadata instead of discarding it.

The committed live run scanned portions at offsets 0 and 100, collecting 100 + 69 links, with no remaining page_link_limit gap and zero LLM calls. Profile documents increased from 125 to 189 (64 additional records); all prior IDs and uploaded archive identities were preserved. Remaining fetch/depth gaps are still unresolved. Legacy unknown page depth was conservatively retained at maximum depth; this acceptance does not establish full locality coverage or adopted authority.

Validation: 59 focused tests pass, both affected backend bundles pass, app build passes with only existing browser-data warnings. Tests distinguish changed resource links from unrelated markup changes.

Selected official COA application archival was initiated through the existing guarded archive function. Its final receipt is recorded separately after verification. No frontend publishing.
