# Equipment13 UI Review - Rejected, Consolidated Rework Running

Reviewed ALL 406 panel lines, 197 node-test lines, 318 browser-fixture lines, four page-copy diffs and artifacts. Sidekick first report is NOT acceptance; do not cite its claimed 8/3/lint results as final verified completion.

## Actual Defects In First UI Pass

- Invented `equipment_type === non_excavation` and `compatible_foundation_types`, instead of original `is_non_excavation_equipment`, `is_pillar_excavation`, `is_spread_foot_excavation`. This breaks real catalog filtering.
- Direct `eq.compatible_sub_attachment_ids` for sub additions is wrong. Real path is selected active attachment's inventory `compatible_sub_attachment_ids`. Fixture cheated by inventing the parent property too.
- Sub "parentLinked" checked any catalog-compatible attachment, not selected active ones, so warnings wrong.
- selectedAttIds/selectedSubIds included zero counts while hiding zero rows, making existing zeroed items impossible to re-add.
- qtyDrafts survive successful edits and external Undo/restore; input can show3 while model is2 and onBlur silently reapply3. Empty-blur leaves blank instead of restored value.
- Custom quantity chip formatted with money ($2.00) instead of quantity2.
- Unused `amt`, dummy always-null JSX, redundant duration ternary. Actual evidence ESLint exit1 despite report claiming0.
- Page generic copy awkward; global "ALL amounts saved snapshots" false when some rows are currently recalculated.

## Required Settled Rework (Already Sent Full Brief)

- Restore original flags/filter/sort_order; valid foundation_type pillar/spread_foot tests (not standard).
- activeParents=detail.attachmentRows.filter(r=>r.quantity>0&&r.inventory). Warning if no such parent links sub. EligibleAddSub additionally parent must be compatible with current primary. Selected misc/incompatible/unavailable/unlinked children always remain visible; no eager dropping.
- Selected IDs only active quantities (normalized all rows, counts/legacy qty!=0, subs qty!=0). Known old zero maps can be re-added. Parent inventory has NO direct sub list.
- Valid/empty blur discards local draft; external entry change resets staged draft+error, supports Undo without replay. Controlled Harness actually applies onUpdate and external Undo. Verify normalized2/130 ->3/145 ->Undo2/130 ->blur no new edits; empty blur2/no edits, fraction0.5 error unchanged.
- Qty chip plain String; money only monetary overrides. Existing clear/active override hints preserved. Guard `_none`.
- Page FOUR strings only: "Pricing unavailable: selected materials or rental items need attention." Plus global suffix "Unavailable items show saved amounts only; other amounts may be recalculated. Save and estimate handoff are paused."
- Node fixtures use real flags and sub rate7 from lead frozen parity inventory. Add old att0 ->1 costs115; sub0 ->1 after active parent costs122. No active parent=no eligible new sub, selected unlinked sub still visible+warning. Real onUpdate/dirty counts and scoped Card total assertions. No findAll(()=>false), ORtrue, optional noop callbacks. Unmount tests in finally.
- Parent reassign/remove preserving metadata/overrides/children actual callback tests; zero-rate period; unknown-period Review; duration doesn't clear customqty.

## Browser/Evidence Failures And Authorized Repair

- Browser OUT mistakenly points to pricing11 and overwrote its generic browser-results.json/browser-metafile.json. Frozen accepted V5 copies exist, so no UNIQUE old evidence was lost.
- Authorized exact mechanical repair: preserve misplaced current generics as equipment13/browser-results-v1.json and browser-metafile-v1.json, then restore pricing11 generics from its own browser-results-v5.json/browser-metafile-v5.json. Nothing deleted. Do not touch frozen expected/engines or unrelated files.
- Set new fixture OUT to equipment13. Current expected equipment13/browser-results.json did not exist. Capture actual fresh outputs/exitcodes; no claims on stale first log.
- Browser S2 must dirty duration2, enable autosave before refresh, record complete raw project, defer exactly3 inventory/labor/settings requests+labels/query/sort, resolve, full raw draft/receipt deepEqual, autosave visiblyOFF, no I/O2.3s, explicit save CASv1 one source/Builder, source rows==realcalc. Test actual qty2->3 then actualToolbarUndo back2/130 and blur no replay.
- Keep S1 blocked ALL7 spies + receipt; S3 mobile600; SDK/auth absent dependency graph, foreign/console/page errors fail, contexts/server finally close. SimplifiedCSS synthetic fixture is NOT full-app visual signoff.
- Final hashes ALL5 source +2 new tests. Run only repaired new node/browser, lint5src+2scripts, actual full-page bundle. Do NOT rerun lead critical46 or old58/7/4 until lead accepts full UI review.

## Authoritative Lead Facts

- Critical binding/calculation/integrity THREE files personally authored/checked:46 PASS, including29 whole original-row parity. Frozen manifest now `lead-critical-frozen-hashes.json`. Sidekick may not modify these or invent a second money calculator.
- UTF8 repair independently verified by lead from `extra-baselines-utf8.json`: exact last checkpoint page LFsha051cbe98...67ba, original integrity matching engine-source-before, bindings NOT_FOUND. Prior PS IBM437 capture false drift; never use extra-baselines.json for mutation.
- Use npx base44@latest on all future sandbox calls, with both Console.OutputEncoding and OutputEncoding UTF8 in the SAME PowerShell process. No old cached CLI activation script for this new unit.
- No equipment13 remote mutation. Latest real checkpoint remains6aecc85af43458099373b715, commit ea1058... . Sidekick rework running. Need full next diff/artifact review before ANY other next action at its landing.
