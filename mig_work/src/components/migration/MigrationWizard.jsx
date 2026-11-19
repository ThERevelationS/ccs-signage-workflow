import * as React from "react";

import {
  DRY_RUN_ROW_LIMIT,
  IMPORT_CHUNK_SIZE,
  SAMPLE_ROW_LIMIT,
  cleanMapping,
  entityRecordKind,
  findMapper,
  resultsToErrorRows,
  runImportPlan,
} from "./migrationModel";
import { migrationActions, migrationErrorMessage } from "./migrationClient";
import { parseCsv } from "./csvParse";
import { MigrationStepper } from "./MigrationStepper";
import { MigrationUploadStep } from "./MigrationUploadStep";
import { MigrationMappingStep } from "./MigrationMappingStep";
import { MigrationDryRunStep } from "./MigrationDryRunStep";
import { MigrationImportStep } from "./MigrationImportStep";
import { MigrationReportStep } from "./MigrationReportStep";

// The CoreBridge CSV migration wizard. Owns the whole run state machine:
//
//   upload  -> entity + file picked, CSV parsed in the browser
//   map     -> start_batch + preview_mapping, editable mapping table
//   dryrun  -> import_rows dry_run:true on the first <=500 rows
//   import  -> import_rows for real, sequentially chunked <=500 rows/call
//   report  -> report action + unimport_batch rollback
//
// `focusBatch` ({ batch_id, nonce }) jumps straight to the report step -- the
// Batches tab's "Report" action drives it.
export default function MigrationWizard({ sessionToken, focusBatch, onBatchChanged }) {
  const [step, setStep] = React.useState("upload");
  const [maxStep, setMaxStep] = React.useState("upload");

  const [mappers, setMappers] = React.useState(null);
  const [mappersLoading, setMappersLoading] = React.useState(true);
  const [mappersError, setMappersError] = React.useState("");

  const [entityKey, setEntityKey] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [parsed, setParsed] = React.useState(null);
  const [picking, setPicking] = React.useState(false);
  const [pickError, setPickError] = React.useState("");

  const [batchId, setBatchId] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const [mapping, setMapping] = React.useState({});
  const [continuing, setContinuing] = React.useState(false);
  const [continueError, setContinueError] = React.useState("");

  const [dryRun, setDryRun] = React.useState(null);
  const [dryRunning, setDryRunning] = React.useState(false);
  const [dryRunError, setDryRunError] = React.useState("");

  const [onDuplicate, setOnDuplicate] = React.useState("skip");
  const [importProgress, setImportProgress] = React.useState(null);
  const stopRef = React.useRef(false);

  const [report, setReport] = React.useState(null);
  const [reportLoading, setReportLoading] = React.useState(false);
  const [reportError, setReportError] = React.useState("");
  const [recordRefs, setRecordRefs] = React.useState([]);

  const [unimporting, setUnimporting] = React.useState(false);
  const [unimportResult, setUnimportResult] = React.useState(null);
  const [unimportError, setUnimportError] = React.useState("");

  const goTo = React.useCallback((next) => {
    setStep(next);
    setMaxStep((cur) => {
      const order = ["upload", "map", "dryrun", "import", "report"];
      return order.indexOf(next) > order.indexOf(cur) ? next : cur;
    });
  }, []);

  // ---- registry ----------------------------------------------------------
  const loadMappers = React.useCallback(async () => {
    setMappersLoading(true);
    setMappersError("");
    try {
      const data = await migrationActions.listMappers(sessionToken);
      setMappers(data?.mappers || []);
    } catch (e) {
      setMappersError(migrationErrorMessage(e, "The import registry could not be loaded."));
      setMappers([]);
    } finally {
      setMappersLoading(false);
    }
  }, [sessionToken]);

  React.useEffect(() => { loadMappers(); }, [loadMappers]);

  const mapper = findMapper(mappers, entityKey);
  const recordKind = entityRecordKind(preview?.target_entity || mapper?.target_entity || reportEntity(report));

  // ---- upload -------------------------------------------------------------
  const pickFile = (file) => {
    setPicking(true);
    setPickError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = parseCsv(String(reader.result || ""));
        setFileName(file.name || "corebridge.csv");
        setParsed(result);
        if (result.errors?.length) setPickError(result.errors.join(" "));
      } catch (e) {
        setParsed(null);
        setPickError(e?.message || "The CSV could not be parsed.");
      } finally {
        setPicking(false);
      }
    };
    reader.onerror = () => {
      setPicking(false);
      setPickError("The file could not be read.");
    };
    reader.readAsText(file);
  };

  const changeEntity = (key) => {
    setEntityKey(key);
    // A different import target means a different batch + mapping downstream --
    // reset everything after upload so stale runs can't leak across entities.
    setParsed(null);
    setFileName("");
    setBatchId("");
    setPreview(null);
    setMapping({});
    setDryRun(null);
    setImportProgress(null);
    setReport(null);
    setRecordRefs([]);
    setUnimportResult(null);
    setContinueError("");
    setDryRunError("");
  };

  // upload -> map: create the batch marker and fetch the mapping preview.
  const continueToMapping = async () => {
    if (!entityKey || !parsed?.rowCount) return;
    setContinuing(true);
    setContinueError("");
    try {
      const [batchRes, previewRes] = await Promise.all([
        migrationActions.startBatch(sessionToken, {
          source_label: fileName || "CoreBridge CSV import",
          entity: entityKey,
        }),
        migrationActions.previewMapping(sessionToken, {
          entity: entityKey,
          columns: parsed.columns,
          sample_rows: parsed.rows.slice(0, SAMPLE_ROW_LIMIT),
        }),
      ]);
      setBatchId(batchRes?.batch_id || "");
      setPreview(previewRes);
      setMapping({ ...(previewRes?.proposed_mapping || {}) });
      setDryRun(null);
      setImportProgress(null);
      setReport(null);
      setRecordRefs([]);
      setUnimportResult(null);
      setUnimportError("");
      goTo("map");
    } catch (e) {
      setContinueError(migrationErrorMessage(e, "The batch or mapping preview could not be started."));
    } finally {
      setContinuing(false);
    }
  };

  // ---- map -> dry run ------------------------------------------------------
  const changeMapping = (column, field) => {
    setMapping((m) => {
      const next = { ...m };
      if (field) next[column] = field;
      else delete next[column];
      return next;
    });
  };

  const runDryRun = async () => {
    if (!batchId || !parsed?.rowCount) return;
    setDryRunning(true);
    setDryRunError("");
    try {
      const sampleRows = parsed.rows.slice(0, DRY_RUN_ROW_LIMIT);
      const res = await migrationActions.importRows(sessionToken, {
        batch_id: batchId,
        entity: entityKey,
        rows: sampleRows,
        mapping: cleanMapping(mapping),
        dry_run: true,
        on_duplicate: onDuplicate,
      });
      setDryRun({
        counts: res?.counts || {},
        results: res?.results || [],
        errorRows: resultsToErrorRows(res?.results, { sourceRows: sampleRows }),
        truncated: !!res?.truncated,
      });
      goTo("dryrun");
    } catch (e) {
      setDryRunError(migrationErrorMessage(e, "The dry run failed."));
    } finally {
      setDryRunning(false);
    }
  };

  // ---- dry run -> import ---------------------------------------------------
  const runImport = async () => {
    if (!batchId || !parsed?.rowCount || importProgress?.running) return;
    stopRef.current = false;
    setStep("import");
    setMaxStep("report");
    const cleaned = cleanMapping(mapping);
    const finalState = await runImportPlan({
      rows: parsed.rows,
      chunkSize: IMPORT_CHUNK_SIZE,
      shouldStop: () => stopRef.current,
      sendChunk: (chunk) => migrationActions.importRows(sessionToken, {
        batch_id: batchId,
        entity: entityKey,
        rows: chunk,
        mapping: cleaned,
        dry_run: false,
        on_duplicate: onDuplicate,
      }),
      onProgress: (p) => setImportProgress({ ...p }),
    });
    setImportProgress({ ...finalState });
    setRecordRefs(finalState.recordRefs || []);
    onBatchChanged?.();
    // Load the report whether the run finished, stopped, or died mid-chunk --
    // partial counts are exactly what the operator needs next either way.
    await loadReport(batchId, { keepRefs: true });
    goTo("report");
  };

  // ---- report --------------------------------------------------------------
  const loadReport = React.useCallback(async (id, { keepRefs = false } = {}) => {
    const target = String(id || "").trim();
    if (!target) return null;
    setReportLoading(true);
    setReportError("");
    try {
      const data = await migrationActions.getReport(sessionToken, target);
      setReport(data);
      if (!keepRefs) setRecordRefs([]);
      setReportLoading(false);
      return data;
    } catch (e) {
      setReportError(migrationErrorMessage(e, "The batch report could not be loaded."));
      setReportLoading(false);
      return null;
    }
  }, [sessionToken]);

  // Counts-only refresh (get_batch) -- lighter than re-running report for the
  // "Refresh counts" button.
  const refreshCounts = React.useCallback(async () => {
    if (!batchId) return;
    setReportLoading(true);
    setReportError("");
    try {
      const data = await migrationActions.getBatch(sessionToken, batchId);
      const counts = data?.counts || {};
      setReport((cur) => (cur ? {
        ...cur,
        totals: { ...(cur.totals || {}), ...counts },
        errors: (data.recent_errors || []).length ? data.recent_errors : cur.errors,
        batch: { ...(cur.batch || {}), ...(data.batch || {}) },
      } : cur));
    } catch (e) {
      setReportError(migrationErrorMessage(e, "Batch counts could not be refreshed."));
    } finally {
      setReportLoading(false);
    }
  }, [sessionToken, batchId]);

  const unimport = async () => {
    if (!batchId) return;
    setUnimporting(true);
    setUnimportError("");
    setUnimportResult(null);
    try {
      const res = await migrationActions.unimportBatch(sessionToken, batchId);
      setUnimportResult(res?.counts || {});
      await loadReport(batchId, { keepRefs: false });
      onBatchChanged?.();
    } catch (e) {
      setUnimportError(migrationErrorMessage(e, "The rollback failed."));
    } finally {
      setUnimporting(false);
    }
  };

  // ---- focusBatch: open the report step for a batch from the Batches tab ----
  const focusNonceRef = React.useRef(0);
  React.useEffect(() => {
    const id = String(focusBatch?.batch_id || "").trim();
    const nonce = Number(focusBatch?.nonce) || 0;
    if (!id || nonce === focusNonceRef.current) return;
    focusNonceRef.current = nonce;
    setBatchId(id);
    setRecordRefs([]);
    setUnimportResult(null);
    setUnimportError("");
    loadReport(id).then((data) => {
      const ent = data?.batch?.entity;
      if (ent) setEntityKey(ent);
    });
    goTo("report");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBatch, loadReport]);

  const startNew = () => {
    setStep("upload");
    setMaxStep("upload");
    setEntityKey("");
    setParsed(null);
    setFileName("");
    setBatchId("");
    setPreview(null);
    setMapping({});
    setDryRun(null);
    setImportProgress(null);
    setReport(null);
    setRecordRefs([]);
    setUnimportResult(null);
    setUnimportError("");
    setContinueError("");
    setDryRunError("");
    setPickError("");
  };

  return (
    <div className="space-y-3">
      <MigrationStepper current={step} maxReached={maxStep} onSelect={goTo} />

      {step === "upload" && (
        <MigrationUploadStep
          mappers={mappers}
          mappersLoading={mappersLoading}
          mappersError={mappersError}
          entityKey={entityKey}
          onEntityChange={changeEntity}
          fileName={fileName}
          parsed={parsed}
          onPickFile={pickFile}
          picking={picking}
          onContinue={continueToMapping}
          continuing={continuing}
          continueError={continueError || pickError}
        />
      )}

      {step === "map" && (
        <MigrationMappingStep
          entityKey={entityKey}
          mapper={mapper}
          preview={preview}
          columns={parsed?.columns || []}
          rows={parsed?.rows || []}
          mapping={mapping}
          onMappingChange={changeMapping}
          onBack={() => goTo("upload")}
          onRunDryRun={runDryRun}
          running={dryRunning}
          runError={dryRunError}
        />
      )}

      {step === "dryrun" && (
        <MigrationDryRunStep
          dryRun={dryRun}
          rowCount={parsed?.rowCount || 0}
          onDuplicate={onDuplicate}
          onDuplicateChange={setOnDuplicate}
          onBack={() => goTo("map")}
          onRunImport={runImport}
          running={!!importProgress?.running}
        />
      )}

      {step === "import" && (
        <MigrationImportStep
          progress={importProgress}
          onStop={() => { stopRef.current = true; }}
        />
      )}

      {step === "report" && (
        <MigrationReportStep
          batchId={batchId}
          report={report}
          reportLoading={reportLoading}
          reportError={reportError}
          onRefresh={refreshCounts}
          recordRefs={recordRefs}
          recordKind={recordKind}
          onUnimport={unimport}
          unimporting={unimporting}
          unimportResult={unimportResult}
          unimportError={unimportError}
          onNewImport={startNew}
        />
      )}
    </div>
  );
}

function reportEntity(report) {
  const keys = Object.keys(report?.per_entity || {});
  return keys.length ? report.per_entity[keys[0]]?.target_entity : "";
}
