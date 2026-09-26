// Existing Sales Pipeline attention filters. One catalog drives the compact
// quick shortcuts, grouped More Filters menu, active state, and regression tests.
// Counts come exclusively from the existing Sales summary; no inferred dates.
export const SALES_PRIMARY_ATTENTION = Object.freeze([
  { key: "all", label: "All", countKey: "openCount" },
  { key: "overdue", label: "Overdue", countKey: "overdueCount" },
  { key: "today", label: "Today", countKey: "dueTodayCount" },
  { key: "upcoming", label: "Next 7 Days", countKey: "upcomingCount" },
  { key: "needs_attention", label: "Needs Attention", countKey: "needsAttentionCount" },
].map((item) => Object.freeze(item)));

export const SALES_MORE_ATTENTION_GROUPS = Object.freeze([
  {
    label: "Follow-ups and timing",
    items: [
      { key: "due", label: "All Follow-ups Due", countKey: "dueCount" },
      { key: "no_next_action", label: "No Next Action", countKey: "noNextActionCount" },
      { key: "quote_no_followup", label: "Quotes Need Follow-up", countKey: "quoteNoFollowUpCount" },
      { key: "quote_aged", label: "Quote Aged 14+ Days", countKey: "quoteAgedCount" },
      { key: "near_close", label: "Closing in 14 Days", countKey: "nearCloseCount" },
      { key: "close_overdue", label: "Expected Close Overdue", countKey: "overdueCloseCount" },
      { key: "stale", label: "Stale 14+ Days", countKey: "staleCount" },
      { key: "stage_aged", label: "Stage Aged 14+ Days", countKey: "stageAgedCount" },
      { key: "age_90_plus", label: "Age 90+ Days", countKey: "age90PlusCount" },
    ],
  },
  {
    label: "Missing information",
    items: [
      { key: "owner_unassigned", label: "Owner Missing", countKey: "unassignedOwnerCount" },
      { key: "source_missing", label: "Source Missing", countKey: "sourceMissingCount" },
      { key: "quote_timing_missing", label: "Quote Timing Missing", countKey: "quoteTimingMissingCount" },
      { key: "stage_untracked", label: "Stage Timing Missing", countKey: "stageAgeMissingCount" },
      { key: "activity_untracked", label: "Sales Activity Baseline Missing", countKey: "untrackedActivityCount" },
    ],
  },
  {
    label: "Other views",
    items: [
      { key: "mine", label: "My Opportunities", countKey: "myOpportunityCount" },
      { key: "placeholder", label: "Test Records", countKey: "placeholderCount", conditional: true },
    ],
  },
].map((group) => Object.freeze({
  ...group,
  items: Object.freeze(group.items.map((item) => Object.freeze(item))),
})));

export const SALES_ALL_ATTENTION = Object.freeze([
  ...SALES_PRIMARY_ATTENTION,
  ...SALES_MORE_ATTENTION_GROUPS.flatMap((group) => group.items),
]);
const byKey = new Map(SALES_ALL_ATTENTION.map((item) => [item.key, item]));
const primaryKeys = new Set(SALES_PRIMARY_ATTENTION.map((item) => item.key));

export function salesAttentionOption(key) {
  return byKey.get(key) || null;
}

export function salesMoreAttentionSelected(key) {
  return byKey.has(key) && !primaryKeys.has(key);
}

export function salesAttentionCount(summary, key) {
  const countKey = byKey.get(key)?.countKey;
  return countKey && typeof summary?.[countKey] === "number"
    ? Math.max(0, summary[countKey])
    : 0;
}

export function visibleSalesMoreAttentionGroups(summary, selectedKey) {
  return SALES_MORE_ATTENTION_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) =>
      !item.conditional || salesAttentionCount(summary, item.key) > 0 || selectedKey === item.key),
  })).filter((group) => group.items.length > 0);
}
