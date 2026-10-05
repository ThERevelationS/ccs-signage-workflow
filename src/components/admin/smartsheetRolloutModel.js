function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

const SALES_TERMINAL_TASK_PATTERN = /^(lost(?:$|\s*-)|completed sales?(?:$|\s*-)|closed(?:$|\s*-))/;

function rowLabel(row, dataset) {
  if (dataset === "sales") {
    return cleanText(row?.values?.client_name || row?.values?.title || row?.base44_label);
  }
  return cleanText(row?.values?.customer_name || row?.values?.description || row?.base44_label);
}

function normalizedBaseline(baseline, sheetId) {
  if (!baseline || String(baseline.sheet_id || "") !== String(sheetId || "")) return null;
  const rowIds = Array.isArray(baseline.row_ids)
    ? baseline.row_ids.map((value) => String(value || "")).filter(Boolean)
    : [];
  if (!baseline.captured_at || !rowIds.length) return null;
  return {
    ...baseline,
    row_ids: rowIds,
    row_id_set: new Set(rowIds),
  };
}

export function buildSmartsheetRolloutBaseline({
  sheetId,
  sheetVersion = null,
  rows = [],
  capturedAt,
} = {}) {
  const safeSheetId = String(sheetId || "").trim();
  const safeCapturedAt = String(capturedAt || "").trim();
  const sourceRows = Array.isArray(rows) ? rows : [];
  const rawRowIds = sourceRows.map((row) => String(row?.row_id || row?.id || "").trim()).filter(Boolean);
  const rowIds = [...new Set(rawRowIds)];

  if (!/^\d+$/.test(safeSheetId)) throw new Error("A numeric Smartsheet sheet ID is required to capture a rollout baseline.");
  if (!safeCapturedAt) throw new Error("A baseline capture timestamp is required.");
  if (!rowIds.length) throw new Error("A complete non-empty Smartsheet row scan is required before capturing a rollout baseline.");
  if (rawRowIds.length !== sourceRows.length || rowIds.length !== rawRowIds.length) {
    throw new Error("Every baseline row must have one unique permanent Smartsheet row ID.");
  }

  return {
    version: 1,
    sheet_id: safeSheetId,
    sheet_version: sheetVersion ?? null,
    captured_at: safeCapturedAt,
    row_count: rowIds.length,
    row_ids: rowIds,
  };
}

export function classifySmartsheetRolloutRow(row, dataset, { baseline = null, sheetId = "" } = {}) {
  if (row?.status !== "new_record") return null;

  const safeBaseline = normalizedBaseline(baseline, sheetId);
  const rowId = String(row?.row_id || "");
  const existedAtBaseline = Boolean(safeBaseline?.row_id_set.has(rowId));

  const base = {
    row_id: rowId,
    row_number: Number(row?.row_number || 0) || null,
    label: rowLabel(row, dataset) || "Unnamed row",
    customer_outcome: row?.customer_resolution?.outcome || "",
    auto_create_eligible: false,
    baseline_state: safeBaseline ? (existedAtBaseline ? "preexisting" : "post_baseline") : "not_captured",
  };

  if (safeBaseline && !existedAtBaseline) {
    return {
      ...base,
      outcome: "post_baseline_new",
      creation_review_eligible: true,
      reason: dataset === "orders"
        ? "Row was not present in the captured Order Request baseline. It may enter controlled Base44 Order creation review after Customer resolution and rollout gates pass."
        : "Row was not present in the captured Workflow baseline. Treat it as a new post-rollout Sales candidate, still subject to Customer resolution and explicit creation review.",
    };
  }

  if (dataset === "orders") {
    return {
      ...base,
      outcome: "historical_external",
      reason: "Existing Order Request row at rollout. Keep external/historical unless explicitly selected for backfill.",
    };
  }

  if (dataset === "sales") {
    const taskText = cleanText(row?.values?.current_task_description);
    if (SALES_TERMINAL_TASK_PATTERN.test(taskText.toLowerCase())) {
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

export function buildSmartsheetRolloutPreview({
  rows = [],
  dataset = "",
  baseline = null,
  sheetId = "",
} = {}) {
  const safeBaseline = normalizedBaseline(baseline, sheetId);
  const classifications = (rows || [])
    .map((row) => classifySmartsheetRolloutRow(row, dataset, { baseline: safeBaseline, sheetId }))
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
    post_baseline_new: 0,
  });

  return {
    baseline_state: safeBaseline ? "captured" : "not_captured",
    baseline_captured_at: safeBaseline?.captured_at || "",
    baseline_row_count: Number(safeBaseline?.row_count || safeBaseline?.row_ids?.length || 0),
    auto_create_eligible: 0,
    creation_review_eligible: Number(summary.post_baseline_new || 0),
    summary,
    classifications,
    policy: dataset === "orders"
      ? (safeBaseline
        ? "Rows captured in the Order Request baseline remain historical/external unless explicitly backfilled. Only row IDs first seen after the baseline can enter controlled Base44 Order creation review."
        : "Current Order Request rows are treated as pre-rollout historical/external. Capture a baseline before any creation rollout so only rows first seen afterward can enter relational Base44 Order creation review.")
      : (safeBaseline
        ? "Workflow rows captured in the baseline remain legacy/manual-review candidates. Rows first seen afterward are new Sales candidates, but Customer resolution and explicit creation review still apply. Terminal task text never creates authoritative modern Won/Lost history."
        : "Current Workflow rows are never bulk-created. Exact terminal task text can route a row to legacy/history review; all other pre-rollout rows require explicit manual backfill review. Capture a baseline before future new-row creation is considered."),
  };
}
