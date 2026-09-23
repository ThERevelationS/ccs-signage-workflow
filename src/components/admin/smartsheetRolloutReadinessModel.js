import {
  smartsheetAnalysisMatchesProfile,
  smartsheetDryRunMatchesAnalysis,
  smartsheetPersistedBindingsMatchAnalysis,
} from "./smartsheetMappingFreshnessModel.js";

function numericId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function completePreview(preview) {
  const total = Number(preview?.total_row_count || 0);
  const returned = Number(preview?.returned_row_count || 0);
  const rows = preview?.preview?.rows || [];
  return total > 0 && returned === total && rows.length === returned;
}

function step(id, label, status, detail) {
  return { id, label, status, detail };
}

export function buildSmartsheetRolloutReadiness({
  apiStatus = null,
  config = null,
  liveMappingAnalysis = null,
  dryRunPreview = null,
} = {}) {
  const sales = config?.sales || {};
  const orders = config?.orders || {};

  const backendReady = Boolean(
    apiStatus?.configured
    && apiStatus?.read_only === true
    && apiStatus?.write_actions_available === false
  );

  const targetsReady = numericId(sales.smartsheet_sheet_id) && numericId(orders.smartsheet_sheet_id);

  const liveMappingReady = ["sales", "orders"].every((dataset) =>
    smartsheetAnalysisMatchesProfile(liveMappingAnalysis?.[dataset], config?.[dataset])
  );

  const bindingsReady = liveMappingReady && ["sales", "orders"].every((dataset) =>
    smartsheetPersistedBindingsMatchAnalysis(config?.[dataset], liveMappingAnalysis?.[dataset])
  );

  const previewReady = bindingsReady && ["sales", "orders"].every((dataset) =>
    smartsheetDryRunMatchesAnalysis(
      dryRunPreview?.[dataset],
      liveMappingAnalysis?.[dataset],
      config?.[dataset],
    ) && completePreview(dryRunPreview?.[dataset])
  );

  const salesBaseline = sales?.rollout_baseline;
  const ordersBaseline = orders?.rollout_baseline;
  const anyBaseline = Boolean(salesBaseline?.captured_at || ordersBaseline?.captured_at);
  const baselinesComplete = Boolean(
    salesBaseline?.captured_at
    && ordersBaseline?.captured_at
    && String(salesBaseline?.sheet_id || "") === String(sales.smartsheet_sheet_id || "")
    && String(ordersBaseline?.sheet_id || "") === String(orders.smartsheet_sheet_id || "")
  );

  const safetyReady = config?.global_enabled === false && config?.observation_mode === true;
  const canCaptureBaseline = backendReady
    && targetsReady
    && liveMappingReady
    && bindingsReady
    && previewReady
    && safetyReady
    && !anyBaseline;

  const steps = [
    step(
      "backend",
      "Authenticated read-only Smartsheet backend",
      backendReady ? "ready" : apiStatus ? "blocked" : "pending",
      backendReady
        ? "Credential is configured and the deployed backend advertises read-only access with no write actions."
        : apiStatus
          ? "Backend status is not a configured read-only/no-write state."
          : "Waiting for authenticated API status.",
    ),
    step(
      "targets",
      "Permanent target sheet IDs",
      targetsReady ? "ready" : "blocked",
      targetsReady
        ? `Workflow ${sales.smartsheet_sheet_id} • Order Request ${orders.smartsheet_sheet_id}`
        : "Both datasets require numeric permanent Smartsheet sheet IDs.",
    ),
    step(
      "mapping",
      "Fresh compatible live column analysis",
      liveMappingReady ? "ready" : "pending",
      liveMappingReady
        ? "Both target sheets currently resolve every required non-protected field uniquely and compatibly."
        : "Run Analyze Live Mapping in an authenticated admin session and review all missing/conflicting/incompatible fields.",
    ),
    step(
      "bindings",
      "Verified permanent column bindings saved",
      bindingsReady ? "ready" : liveMappingReady ? "blocked" : "pending",
      bindingsReady
        ? "Saved column IDs exactly match the current live analysis for both sheets."
        : liveMappingReady
          ? "Review the live mapping, then use Bind Verified IDs before baseline capture."
          : "Permanent bindings cannot be verified until live mapping analysis is current.",
    ),
    step(
      "preview",
      "Fresh complete full-sheet row preview",
      previewReady ? "ready" : "pending",
      previewReady
        ? "Both full-sheet previews are complete and use the same verified column IDs."
        : bindingsReady
          ? "Run Preview Rows after bindings are saved; partial or stale previews do not count."
          : "Preview Rows remains downstream of verified permanent bindings.",
    ),
    step(
      "baseline",
      "Immutable rollout baseline",
      baselinesComplete ? "complete" : anyBaseline ? "blocked" : canCaptureBaseline ? "ready" : "pending",
      baselinesComplete
        ? "Both baselines are captured against their current permanent target sheets."
        : anyBaseline
          ? "Only part of the required baseline state exists or a baseline no longer matches its target."
          : canCaptureBaseline
            ? "All preconditions are satisfied. Baseline capture is available, but remains a deliberate admin action."
            : "Not ready to capture yet.",
    ),
  ];

  return {
    steps,
    backendReady,
    targetsReady,
    liveMappingReady,
    bindingsReady,
    previewReady,
    safetyReady,
    baselinesComplete,
    canCaptureBaseline,
  };
}
