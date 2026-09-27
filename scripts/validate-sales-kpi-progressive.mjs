import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

const overview = source.split('<section aria-label="Sales Pipeline overview"')[1]?.split("</section>")[0];
check(Boolean(overview), "Current/All pipeline summary must exist.");
const primary = overview?.split('title="Four primary Sales metrics displayed together, including on phones.">')[1]
  ?.split('<div id="sales-secondary-metrics"')[0];
const secondary = overview?.split('<div id="sales-secondary-metrics"')[1]?.split("</section>")[0];
check(Boolean(primary) && Boolean(secondary), "Primary and secondary metrics must have separate sections.");

const countCards = (markup) => (markup.match(/<button type="button"(?:\s|>)/g) || []).length;
check(countCards(primary) === 4, "Only four primary metric cards may show by default.");
check(countCards(secondary) === 4, "Four original secondary metrics must remain available.");

const primaryMetrics = [
  ["Open Opportunities", "pipelineSummary.openCount", 'applyAttentionFilter("all")'],
  ["Open Pipeline Value", "formatPipelineValue(pipelineSummary.openValue)", 'applyAttentionFilter("all")'],
  ["Follow-ups Due", "pipelineSummary.dueCount", 'applyAttentionFilter("due")'],
  ["Needs Attention", "pipelineSummary.needsAttentionCount", 'applyAttentionFilter("needs_attention")'],
];
for (const [label, value, action] of primaryMetrics) {
  check(primary.includes(label) && primary.includes(value) && primary.includes(action),
    `Primary ${label} still uses the real summary and existing filter.`);
}
const secondaryMetrics = [
  ["Quotes Need Follow-up", "pipelineSummary.quoteNoFollowUpCount", 'applyAttentionFilter("quote_no_followup")'],
  ["Next Action Coverage", "pipelineSummary.nextActionCoverageCount", '"no_next_action"'],
  ["Closing Next 14 Days", "pipelineSummary.nearCloseCount", 'applyAttentionFilter("near_close")'],
  ["Stale 14+ Days", "pipelineSummary.staleCount", 'applyAttentionFilter("stale")'],
];
for (const [label, value, action] of secondaryMetrics) {
  check(secondary.includes(label) && secondary.includes(value) && secondary.includes(action),
    `Secondary ${label} retains its original data and filter action.`);
}
check(secondary.includes('pipelineSummary.noNextActionCount > 0 ? "no_next_action" : "all"'),
  "Next Action Coverage retains its original zero-missing behavior.");
check(primary.includes("pipelineSummary.placeholderCount") && primary.includes("pipelineSummary.placeholderValue"),
  "Open metrics retain test-placeholder coverage in their existing descriptions.");
check(primary.includes("pipelineSummary.overdueCount") && primary.includes("pipelineSummary.dueTodayCount"),
  "Follow-up KPI retains overdue and due-today breakdown.");
check(secondary.includes("pipelineSummary.quoteTimingMissingCount"),
  "Secondary quote KPI keeps its trusted-date coverage warning.");
check(secondary.includes('title="Based only on explicit expected close dates."'),
  "Closing metric retains its explicit-date limitation.");
check(secondary.includes('title="Staleness uses verified sales-specific activity only."'),
  "Stale metric retains its verified activity limitation.");
check(source.includes('const [showMoreMetrics, setShowMoreMetrics] = useState(false)'),
  "Secondary KPI row is collapsed initially.");
check(overview.includes('aria-expanded={showMoreMetrics}') &&
  overview.includes('aria-controls="sales-secondary-metrics"') &&
  overview.includes('id="sales-secondary-metrics"') &&
  overview.includes('aria-labelledby="sales-more-metrics-toggle"'),
  "More Metrics expansion exposes its controlled region accessibly.");
check(overview.includes('className={showMoreMetrics ? "grid min-w-0 grid-cols-2 gap-1.5 pb-0.5 md:grid-cols-4" : "hidden"}'),
  "The secondary metrics are initially collapsed, expanding into two columns on phones and four on desktop.");
check(overview.includes('className="grid min-w-0 grid-cols-2 gap-1.5 pb-0.5 md:grid-cols-4"'),
  "All four primary KPIs appear together as two rows on narrow phones without horizontal swiping.");
check((overview.match(/className=(?:"|\{`)min-w-0 rounded-md border/g) || []).length === 8 &&
  !overview.includes('min-w-[150px]') && !overview.includes('overflow-x-auto'),
  "All eight KPI cards may shrink with their grid cells; mobile does not require hidden horizontal metric scrolling.");
check(overview.includes('min-h-10 max-w-[65%]') && overview.includes('sm:min-h-8'),
  "More Metrics has a larger touch target on phones while staying compact on desktop.");
check(source.includes('["quote_no_followup", "no_next_action", "near_close", "stale"].includes(attentionFilter)'),
  "All secondary KPI filter states are recognized when More Metrics is collapsed.");
check(overview.includes('secondaryMetricLabel ? `More Metrics · ${secondaryMetricLabel}`'),
  "A hidden selected KPI stays named in the visible More Metrics button.");
check(overview.includes('onClick={() => setShowMoreMetrics((open) => !open)}'),
  "More Metrics expands and collapses without touching filter or persistence state.");
check(source.includes('(recordScope === "current" || recordScope === "all")') &&
  source.includes('!showDuplicateCleanup && !["insights", "daily"].includes(viewMode)'),
  "Metric summary retains its Current/All scope and excludes unrelated views.");
check(source.includes('onSummaryChange={setPipelineSummary}') &&
  source.includes('attentionFilter={attentionFilter}') &&
  source.includes('activeColumnPreset={activeColumnPreset}'),
  "The existing source for counts, filter state and column presets remains unchanged.");
check(source.includes('recordScope === "outcomes"') && source.includes("pipelineSummary.trackedOutcomeCount"),
  "Outcome-specific metrics still have their separate authoritative view.");

console.log(`Progressive Sales KPI summary, original actions and coverage: ${checks}/${checks} PASS.`);
