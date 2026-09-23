function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function reviewField(field, sheet, dataset) {
  const column = field?.matches?.length === 1 ? field.matches[0] : null;
  return {
    dataset,
    sheetName: String(sheet?.name || ""),
    sheetId: String(sheet?.id || ""),
    field: String(field?.field || ""),
    label: String(field?.label || field?.field || ""),
    transform: String(field?.transform || ""),
    status: String(field?.status || ""),
    columnId: column ? String(column.id || "") : "",
    columnTitle: column ? String(column.title || "") : "",
    columnType: column ? String(column.type || "") : "",
    columnOptions: column && Array.isArray(column.options) ? column.options.map(String) : [],
    validatedPicklist: Boolean(column?.validation === true),
    alias: Boolean(field?.status === "matched" && column
      && normalize(field?.label) !== normalize(column.title)),
    matches: (field?.matches || []).map((candidate) => ({
      id: String(candidate.id || ""),
      title: String(candidate.title || ""),
      type: String(candidate.type || ""),
    })),
  };
}

export function buildSmartsheetMappingReview(results = {}) {
  const fields = ["sales", "orders"].flatMap((dataset) => {
    const result = results?.[dataset];
    if (result?.status !== "ready") return [];
    return (result.analysis?.fields || []).map((field) =>
      reviewField(field, result.sheet, dataset));
  });
  const matched = fields.filter((item) => item.status === "matched");
  const aliases = matched.filter((item) => item.alias);
  return { fields, matched, aliases };
}

export function formatSmartsheetMappingReview(results = {}) {
  const lines = [
    "CCS Smartsheet live mapping review — read-only metadata (no credentials or row values)",
    "Review column meaning before saving permanent IDs.",
  ];
  for (const [dataset, heading] of [
    ["sales", "Sales Pipeline / Workflow"],
    ["orders", "Order Form / Order Request"],
  ]) {
    const result = results?.[dataset];
    lines.push("", heading);
    if (result?.status !== "ready") {
      lines.push("Live analysis unavailable; no field bindings verified.");
      continue;
    }
    lines.push("Sheet: " + String(result.sheet?.name || "") + " (ID " + String(result.sheet?.id || "") + ")");
    for (const field of result.analysis?.fields || []) {
      const item = reviewField(field, result.sheet, dataset);
      if (item.status === "matched") {
        const translationNote = item.transform === "notes_process"
          ? " [TRANSLATION: Base44 work_notes combine into this Smartsheet Notes cell; Smartsheet Notes are split into reviewed work_notes before pull/create]"
          : item.field === "lead_source"
            ? " [TRANSLATION: vocabulary is reconciled additively across Base44 and Smartsheet; aliases such as Website/Web normalize to one value]"
            : item.field === "current_task_description"
              ? " [TRANSLATION: task vocabulary is reconciled additively across Base44 and Smartsheet]"
              : item.field === "current_task_assigned_to"
                ? " [TRANSLATION: resolves against active Base44 users by exact full name or unique first name; ambiguous/unresolved names are blocked]"
                : "";
        lines.push(
          item.label + " [" + item.field + "] → " + item.columnTitle +
          " (ID " + item.columnId + ", " + item.columnType + ")" +
          (item.alias ? " [REVIEW NAME/MEANING]" : "") +
          translationNote +
          (item.columnType === "PICKLIST"
            ? " [PICKLIST " + (item.validatedPicklist ? "validated" : "unvalidated") +
              "; allowed options: " + (item.columnOptions.length ? item.columnOptions.join(", ") : "not supplied") + "]"
            : "")
        );
      } else if (item.status === "protected") {
        lines.push(item.label + " [" + item.field + "] — Base44 only (protected)");
      } else {
        const candidates = item.matches.map((match) =>
          match.title + " (ID " + match.id + ", " + match.type + ")").join("; ");
        lines.push(item.label + " [" + item.field + "] — " +
          item.status.toUpperCase() + (candidates ? ": " + candidates : ""));
      }
    }
  }
  return lines.join("\n");
}

function mappingSnapshot(result) {
  if (result?.status !== "ready" || !result.sheet?.id || !result.analysis) return null;
  return JSON.stringify({
    sheetId: String(result.sheet.id),
    fields: (result.analysis.fields || []).map((field) => ({
      field: String(field.field || ""),
      transform: String(field.transform || ""),
      status: String(field.status || ""),
      matches: (field.matches || []).map((column) => ({
        id: String(column.id || ""),
        title: String(column.title || ""),
        type: String(column.type || ""),
        systemType: String(column.system_column_type || ""),
        validation: Boolean(column.validation === true),
        options: Array.isArray(column.options) ? column.options.map(String) : [],
      })),
    })),
  });
}

export function buildSmartsheetMappingReviewGate({
  liveMappingsReady = false,
  mappingReviewed = false,
  bindingsReady = false,
} = {}) {
  const canBind = Boolean(liveMappingsReady && mappingReviewed);
  const canPreview = Boolean(canBind && bindingsReady);
  return {
    canBind,
    canPreview,
    reason: !liveMappingsReady
      ? "Run a fresh compatible live mapping analysis first."
      : !mappingReviewed
        ? "Review and confirm all live field-to-column mappings before saving IDs."
        : !bindingsReady
          ? "Save the verified permanent column IDs before previewing rows."
          : "",
  };
}

export function sameSmartsheetReviewedMapping(original = {}, refreshed = {}) {
  return ["sales", "orders"].every((dataset) => {
    const before = mappingSnapshot(original?.[dataset]);
    return before !== null && before === mappingSnapshot(refreshed?.[dataset]);
  });
}