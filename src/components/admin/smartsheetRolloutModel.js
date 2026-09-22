function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeTerminalTask(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SALES_TERMINAL_TASKS = new Set([
  "lost",
  "completed sale",
  "closed",
]);

function rowLabel(row, dataset) {
  if (dataset === "sales") {
    return cleanText(row?.values?.client_name || row?.values?.title || row?.base44_label);
  }
  return cleanText(row?.values?.customer_name || row?.values?.description || row?.base44_label);
}

export function classifySmartsheetRolloutRow(row, dataset) {
  if (row?.status !== "new_record") return null;

  const base = {
    row_id: String(row?.row_id || ""),
    row_number: Number(row?.row_number || 0) || null,
    label: rowLabel(row, dataset) || "Unnamed row",
    customer_outcome: row?.customer_resolution?.outcome || "",
    auto_create_eligible: false,
  };

  if (dataset === "orders") {
    return {
      ...base,
      outcome: "historical_external",
      reason: "Existing Order Request row at rollout. Keep external/historical unless explicitly selected for backfill.",
    };
  }

  if (dataset === "sales") {
    const taskText = cleanText(row?.values?.current_task_description);
    const normalizedTask = normalizeTerminalTask(taskText);
    if (SALES_TERMINAL_TASKS.has(normalizedTask)) {
      return {
        ...base,
        outcome: "legacy_terminal",
        task_text: taskText,
        reason: `Explicit terminal task text ("${taskText}") marks this as legacy/history for rollout routing only; it is not an authoritative modern Won/Lost outcome.`,
      };
    }
    return {
      ...base,
      outcome: "manual_backfill_review",
      task_text: taskText,
      reason: "Preexisting Workflow row has no trustworthy explicit terminal signal. Review manually before any backfill; do not assume it is a current opportunity.",
    };
  }

  return {
    ...base,
    outcome: "manual_backfill_review",
    reason: "Preexisting Smartsheet row requires explicit review before backfill.",
  };
}

export function buildSmartsheetRolloutPreview({ rows = [], dataset = "" } = {}) {
  const classifications = (rows || [])
    .map((row) => classifySmartsheetRolloutRow(row, dataset))
    .filter(Boolean);

  const summary = classifications.reduce((result, item) => {
    result[item.outcome] = (result[item.outcome] || 0) + 1;
    return result;
  }, {
    proposed_new_records: classifications.length,
    historical_external: 0,
    legacy_terminal: 0,
    manual_backfill_review: 0,
    auto_create_eligible: 0,
  });

  return {
    baseline_state: "not_captured",
    auto_create_eligible: 0,
    summary,
    classifications,
    policy: dataset === "orders"
      ? "Current Order Request rows are treated as pre-rollout historical/external. A later explicit baseline capture may make only rows first seen after that baseline eligible for relational Base44 Order creation."
      : "Current Workflow rows are never bulk-created. Exact terminal task text can route a row to legacy/history review; all other pre-rollout rows require explicit manual backfill review. A terminal task signal does not create authoritative modern Won/Lost history.",
  };
}
