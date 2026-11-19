# O-104+O-105 transport record — 2026-11-08

App `68dfcc5e57bbbc35387da97c`, branch `main`.
Start HEAD `8b0fcf921` → end HEAD `37d401b5aecbafc7ce1773af233efdde22c7ee75`.

## Checkpoints
- `pre-o104` = `6af06d381b35255bb243fc5e` @ `8b0fcf92171373ea3dec071399f10e203135c00f` (restore point)
- `o104-design-basis` = `6af072443d1669e11a347f73` @ `37d401b5a` — `preview_status: ready`, `build_error: null`

## Landed (6 commits, all "External agent changes")
| commit | file | op |
|---|---|---|
| `76444d7b7` | `base44/entities/FoundationProject.jsonc` | write (additive tail: `design_basis` + `site_hazard`, +109 lines) |
| `d96ab61da` | `src/components/estimator/foundation/foundationDesignBasis.js` | NEW (318 lines) |
| `f89027ec1` | `src/components/estimator/foundation/FoundationDesignBasisPanel.jsx` | NEW (423 lines) |
| `684ff9129` | `src/components/estimator/foundation/FoundationRatesPanel.jsx` | edit +8 lines (import + fragment + mount), CRLF preserved |
| `22b8ccae0` | `src/pages/FoundationEstimator.jsx` | payload() +`design_basis: project.design_basis,` +`site_hazard: project.site_hazard,` @688-689 |
| `37d401b5a` | `src/components/estimator/foundation/foundationDraftRecovery.js` | FOUNDATION_DRAFT_FIELDS +comment +`"design_basis", "site_hazard",` |

## Verification
- Remote jsonc: `JSON.parse` OK; `design_basis`/`site_hazard` all 9+9 props present; `required`/`rls`→EOF md5 `bf410fd40e46e564ba7b515ef40fc158` **byte-identical** to pre-change baseline.
- payload lines 688-689 + draft field line 9 + panel import :4 / mount :56 — all grepped on remote.
- esbuild `--bundle --format=esm` on `src/pages/FoundationEstimator.jsx`: **0 warnings, 0 errors**; new panel bundles clean too.
- Local `node scripts/test-foundation-design-basis.mjs` → `PASS foundation-design-basis (24 groups)` on candidates pre-flight.
- Remote repo is LF-only except FoundationRatesPanel.jsx (CRLF anomaly — edit used `\r\n` anchors/newlines to preserve convention; stored bytes CRLF confirmed via apply-diff).

## Encoding artifact adjudicated (baseline "mismatch" — not a real remote change)
SPEC baseline md5s for `FoundationRatesPanel.jsx` (316be7…) and `foundationDraftRecovery.js` (6273ac…) were computed over pulls that had been **double-encoded** (remote `—` U+2014 → `â€"` mojibake). Fresh-pull diffs showed ONLY that substitution — remote substance identical; the SPEC FoundationProject.jsonc baseline md5 matched exactly (no non-ASCII in pre-existing content). The RatesPanel candidate had inherited the mojibake on 2 lines; writing it verbatim would have corrupted remote. Resolution: applied the documented +8-line edit via `sandbox edit` against true remote bytes — readback verified LF-normalized remote == fresh-remote + intended lines only, `—` intact.

## Concurrent-agent note
An O-119 "preliminary notices" agent worked the same tree concurrently (commits `ac0d0e58f`, `ee1216133`, `d9f7a737f`, `2e1f1dac2`, `848648948` + checkpoints `pre-o119`/`o119-preliminary-notices`). **Zero file overlap** with this transport; all readbacks post-conflict confirm my content intact. Both checkpoints at `37d401b5a` build `ready`.

## Transport staging files (local)
- `lf-foundationDesignBasis.js`, `lf-FoundationDesignBasisPanel.jsx` — LF versions written (remote convention)
- `rebuilt-FoundationRatesPanel.jsx` — fresh-remote + +8 lines, `—` correct (reference for the applied edit)
- `fresh-*.jsonc/.jsx/.js`, `rb-*` — baseline + readback captures
- `rates-edits.json` — the applied edit payload
