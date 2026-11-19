# JurisdictionDetailPanel — UI declutter masterplan

## Problem
The detail panel has a tab bar with only 2 tabs (Overview / Activity), and **everything**
(offices research, CAGIS, monitoring, requirements, 300+ line documents section,
signage facts, workflow designer, AI chat) renders inside Overview's single scroll.
Result: a page ~5,000px tall where nothing is findable.

## Plan (all 6 improvements, single pass)

1. **Tabs, not scroll** — add `Documents` + `Offices` tabs. Group sections:
   - `overview` — trust header, approved evidence, change log, requirements, workflow designer, AI ask
   - `documents` — documents workspace + signage facts (facts live beside their sources)
   - `offices` — office research findings, CAGIS search, source monitoring
   - `activity` — unchanged
2. **One panel shell** — the scroll container renders for all three content tabs;
   each section group gets its own `{activeTab === X && <>`} gate. No big block moves.
3. **Progressive disclosure** — documents list renders first 8 + "Show all N" button
   (search still searches the FULL set, the cap only limits initial render).
4. **Compact doc rows** — doc row header stays one-line (title + type chip + link);
   analysis/actions already live behind the expander.
5. **Workspace nav on all tabs** — nav jumps switch tab AND scroll to the section,
   so the jump links keep working under the tab model.
6. **Header already compact** — trust card + counts stay; no change needed.

## Execution checklist
- [ ] Tab bar: +Documents +Offices buttons (aria-selected, counts chips)
- [ ] Panel shell renders for all 3 content tabs; group gates per section
- [ ] `navigateWorkspace` switches to the owning tab before scrolling
- [ ] Docs list: `DOC_PAGE=8` cap + show-all expander (search bypasses cap)
- [ ] esbuild check + sandbox push + publish checkpoint
