import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function descriptionFor(state) {
  if (state === "ready") return "Ready";
  if (state === "claimed") return "Needs investigation";
  if (state === "invalid_setup") return "Setup problem";
  if (state === "invalid_state") return "Invalid coordinator state";
  return "Unverified";
}

function evidenceLine(label, evidence) {
  if (!evidence) return null;
  const count = Number.isInteger(evidence.count) ? evidence.count : "unknown";
  const outcomes = Array.isArray(evidence.outcomes) && evidence.outcomes.length
    ? evidence.outcomes.join(", ") : "none";
  return { label, value: `${count} audit record(s) · ${outcomes} · ${evidence.ownership_matches === true ? "ownership verified" : "ownership missing or inconsistent"}` };
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-all text-xs font-medium text-slate-800">{String(value ?? "Not available")}</dd>
    </div>
  );
}

export function CorrectionCoordinatorDiagnosticsView({ result, status = "idle", error = "", onRefresh, checkedAt }) {
  const state = status === "success" && result?.read_only === true ? result.coordinator_state : null;
  const ready = state === "ready";
  const concerning = state === "claimed" || state === "invalid_setup" || state === "invalid_state";
  const checking = status === "loading";
  const outcome = checking ? "Checking" : status === "error" ? "Check failed" : ready ? "Ready"
    : concerning ? descriptionFor(state) : "Not checked";
  const evidence = [
    evidenceLine("Applied correction audit", result?.correction_audit),
    evidenceLine("Manager review audit", result?.review_audit),
  ].filter(Boolean);
  const details = concerning ? [
    { label: "Coordinator records", value: result?.record_count },
    ...(state === "claimed" ? [
      { label: "Operation", value: result?.claim_kind === "manager_review" ? "Manager correction review" : "Direct manager correction" },
      { label: "Claim started", value: result?.started_at },
      { label: "Request ID", value: result?.request_id },
      ...(result?.correction_request_id ? [{ label: "Employee correction request", value: result.correction_request_id },
        { label: "Review status", value: result.correction_request_status },
        { label: "Review request identity", value: result.review_request_binding_matches ? "Matches" : "Missing or inconsistent" }] : []),
      { label: "TimeEntry ID", value: result?.time_entry_id },
      { label: "TimeEntry found", value: result?.entry_found ? "Yes" : "No" },
      { label: "TimeEntry request marker", value: result?.entry_request_marker_matches ? "Matches" : "Missing or inconsistent" },
      { label: "Applied TimeEntry snapshot", value: result?.applied_entry_snapshot_matches ? "Matches" : "Missing or inconsistent" },
    ] : []),
    ...evidence,
  ] : [];

  return (
    <section className={`rounded-xl border p-4 ${concerning ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"}`} aria-label="Correction coordinator diagnostics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {concerning ? <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            : ready ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
              : <ShieldAlert className="h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />}
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-slate-900">Manager Correction Coordinator</h3>
            <p className="text-xs text-slate-600">Read-only server diagnostics · No locks or employee time are changed</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={ready ? "border-emerald-300 text-emerald-800 bg-emerald-50"
            : concerning ? "border-amber-300 text-amber-900 bg-amber-50"
              : "border-slate-300 text-slate-700 bg-slate-50"}>{outcome}</Badge>
          <Button type="button" variant="outline" size="sm" disabled={checking || !onRefresh}
            onClick={onRefresh} className="min-h-10 gap-2" aria-label="Refresh manager correction coordinator status">
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
            {checking ? "Checking…" : "Check status"}
          </Button>
        </div>
      </div>
      <div aria-live="polite">
        {checking && <p className="mt-3 text-sm text-slate-600">Checking the latest authoritative coordinator state…</p>}
        {status === "error" && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-800">
            Coordinator status could not be verified. Do not assume manager corrections are available. {error}
          </p>
        )}
        {status === "idle" && <p className="mt-3 text-xs text-slate-600">Select Check status to inspect the server coordinator.</p>}
        {ready && <p className="mt-3 text-sm text-emerald-800">One clean, idle company coordinator was verified at the last check.</p>}
        {concerning && (
          <div className="mt-3 space-y-3">
            <p role="alert" className="text-sm font-medium text-amber-900">
              {result?.attention || "Company correction coordinator requires administrator investigation."}
            </p>
            <dl className="grid grid-cols-1 gap-3 rounded-lg border border-amber-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
              {details.map((item) => <Field key={item.label} label={item.label} value={item.value} />)}
            </dl>
            <p className="text-xs text-amber-900">
              Review the related TimeEntry and audit history. A held claim is not safe to clear solely because it is old.
            </p>
          </div>
        )}
        {checkedAt && status === "success" && <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <Clock3 className="h-3 w-3" aria-hidden="true" /> Last checked {checkedAt}. Refresh to confirm the current state.
        </p>}
      </div>
    </section>
  );
}

export default function CorrectionCoordinatorDiagnostics({ sessionToken }) {
  const [result, setResult] = useState({ token: null, status: "idle", data: null, error: "", checkedAt: null });
  const requestSequence = useRef(0);
  const check = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!sessionToken) {
      setResult({ token: sessionToken, status: "error", data: null,
        error: "An administrator session is required.", checkedAt: null });
      return;
    }
    setResult({ token: sessionToken, status: "loading", data: null, error: "", checkedAt: null });
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "admin_correction_gate_diagnostics", session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || data?.read_only !== true ||
          !["ready", "claimed", "invalid_setup", "invalid_state"].includes(data.coordinator_state)) {
        throw new Error(data?.error || "Server returned an unverified coordinator status.");
      }
      if (sequence !== requestSequence.current) return;
      setResult({ token: sessionToken, status: "success", data,
        error: "", checkedAt: new Date().toLocaleString() });
    } catch (err) {
      if (sequence !== requestSequence.current) return;
      setResult({ token: sessionToken, status: "error", data: null,
        error: err?.response?.data?.error || err?.message || "Unable to contact the Time Clock server.",
        checkedAt: null });
    }
  }, [sessionToken]);

  useEffect(() => {
    check();
    return () => { requestSequence.current += 1; };
  }, [check]);

  const current = result.token === sessionToken ? result : {
    token: sessionToken, status: "loading", data: null, error: "", checkedAt: null,
  };
  return <CorrectionCoordinatorDiagnosticsView result={current.data} status={current.status}
    error={current.error} checkedAt={current.checkedAt} onRefresh={check} />;
}
