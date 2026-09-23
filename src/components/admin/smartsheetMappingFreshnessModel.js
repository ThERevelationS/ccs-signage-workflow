function clean(value) {
  return String(value ?? "").trim();
}

function normalizedName(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

export function smartsheetTargetIdentity(profile = {}) {
  const id = clean(profile?.smartsheet_sheet_id);
  if (id) return `id:${id}`;
  const name = normalizedName(profile?.smartsheet_sheet_name);
  return name ? `name:${name}` : "";
}

export function smartsheetAnalysisMatchesProfile(result, profile = {}) {
  if (result?.status !== "ready" || !result?.sheet?.id) return false;

  const configuredId = clean(profile?.smartsheet_sheet_id);
  if (configuredId) {
    if (String(result.sheet.id) !== configuredId) return false;
  } else {
    const expectedName = normalizedName(profile?.smartsheet_sheet_name);
    if (!expectedName || normalizedName(result.sheet.name) !== expectedName) return false;
  }

  const counts = result.analysis?.counts || {};
  return Number(counts.missing || 0) === 0
    && Number(counts.conflict || 0) === 0
    && Number(counts.incompatible || 0) === 0;
}

function analyzedBindings(result) {
  const bindings = {};
  for (const field of result?.analysis?.fields || []) {
    if (field?.status !== "matched" || !field?.field || field?.matches?.length !== 1) continue;
    bindings[field.field] = String(field.matches[0]?.id || "");
  }
  return bindings;
}

function sameBindingIds(actual = {}, expected = {}) {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.length !== expectedKeys.length) return false;
  for (let index = 0; index < actualKeys.length; index += 1) {
    if (actualKeys[index] !== expectedKeys[index]) return false;
    if (String(actual[actualKeys[index]]?.column_id || "") !== expected[expectedKeys[index]]) return false;
  }
  return true;
}

export function smartsheetDryRunMatchesAnalysis(preview, result, profile = {}) {
  if (!smartsheetAnalysisMatchesProfile(result, profile)) return false;
  if (!preview?.sheet_id || String(preview.sheet_id) !== String(result.sheet.id)) return false;
  return sameBindingIds(preview.column_bindings || {}, analyzedBindings(result));
}

export function buildSmartsheetBaselinePreflight({
  dryRunPreview = null,
  liveMappingAnalysis = null,
  config = null,
} = {}) {
  const reasons = [];

  for (const dataset of ["sales", "orders"]) {
    const label = dataset === "sales" ? "Workflow" : "Order Request";
    const preview = dryRunPreview?.[dataset];
    const analysis = liveMappingAnalysis?.[dataset];
    const profile = config?.[dataset] || {};

    if (!smartsheetAnalysisMatchesProfile(analysis, profile)) {
      reasons.push(`${label} live mapping analysis is missing, unresolved, incompatible, or stale for the current target sheet.`);
      continue;
    }
    if (!smartsheetDryRunMatchesAnalysis(preview, analysis, profile)) {
      reasons.push(`${label} row preview does not match the current verified mapping and target sheet.`);
      continue;
    }

    const total = Number(preview?.total_row_count || 0);
    const returned = Number(preview?.returned_row_count || 0);
    const rows = preview?.preview?.rows || [];
    if (!total || returned !== total || rows.length !== returned) {
      reasons.push(`${label} does not have a complete stable full-sheet preview.`);
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}
