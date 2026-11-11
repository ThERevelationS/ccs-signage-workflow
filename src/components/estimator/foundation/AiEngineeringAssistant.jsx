import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Cpu, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  prepareFoundationAiReview,
  foundationAiReviewPatch,
  FOUNDATION_AI_REVIEW_POLICY,
} from "./foundationAiReview";

export default function AiEngineeringAssistant({ project, onResult }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const tokenRef = useRef(0);
  const latestRef = useRef({ key: null, onResult });
  let inputError = "";
  let prepared = null;
  try {
    prepared = prepareFoundationAiReview(project);
  } catch (e) {
    inputError = e?.message || "The foundation inputs cannot be reviewed.";
  }
  latestRef.current = { key: prepared?.key ?? null, onResult };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      tokenRef.current += 1;
      busyRef.current = false;
    };
  }, []);

  const run = async () => {
    if (busyRef.current || !prepared || typeof latestRef.current.onResult !== "function") return;
    busyRef.current = true;
    const token = ++tokenRef.current;
    const capturedKey = prepared.key;
    const request = prepared.request;
    setRunning(true);
    setError("");
    try {
      const res = await base44.integrations.Core.InvokeLLM(request);
      if (!mountedRef.current || token !== tokenRef.current) return;
      if (latestRef.current.key !== capturedKey) {
        setError("The design changed while this review was running. Run a fresh review.");
        return;
      }
      const patch = foundationAiReviewPatch(res, { sourceKey: capturedKey, generatedAt: new Date().toISOString() });
      const accepted = latestRef.current.onResult(patch);
      if (accepted === false) setError("The review could not be attached. No review changes were applied.");
    } catch (e) {
      if (!mountedRef.current || token !== tokenRef.current) return;
      const msg = String(e?.message || "");
      // O-089 — classify the failure so the operator knows whether to wait,
      // retry, or fix connectivity rather than re-reading a raw error string.
      const cls = /rate.?limit|429|too many/i.test(msg) ? "Rate limited -- wait a moment and retry."
        : /network|fetch|ECONN|ENOTFOUND|offline|Failed to fetch/i.test(msg) ? "Network error -- check connectivity and retry."
        : /timeout|timed out|abort/i.test(msg) ? "The review timed out -- retry on a stable connection."
        : msg || "The preliminary review could not run.";
      setError(cls);
    } finally {
      if (mountedRef.current && token === tokenRef.current) {
        busyRef.current = false;
        setRunning(false);
      }
    }
  };

  // O-089 — cancel invalidates the in-flight review: bumping tokenRef makes
  // the pending response hit the stale-token guard, so nothing lands. The
  // server-side call still completes (InvokeLLM is not abortable) but its
  // result is discarded. Retry re-runs the same prepared request.
  const cancel = () => {
    tokenRef.current += 1;
    busyRef.current = false;
    setRunning(false);
    setError("");
  };
  const retry = () => { cancel(); run(); };

  const recommendation = typeof project?.ai_engineering_recommendation === "string" ? project.ai_engineering_recommendation : "";
  const meta = project?.ai_engineering_data;
  const samePolicy = meta?.policy_version === FOUNDATION_AI_REVIEW_POLICY && typeof meta?.source_key === "string" && !!meta.source_key;
  const stale = samePolicy && (!prepared || meta.source_key !== prepared.key);
  // O-121 (CMP-I20) -- version-update surface: a review recorded under a
  // different policy version flags affected-project recalculation rather than
  // silently reading as current.
  const policyMismatch = !!meta?.policy_version && meta.policy_version !== FOUNDATION_AI_REVIEW_POLICY;
  const label = stale
    ? "Design changed since this note. Run a fresh review."
    : policyMismatch
      ? `Policy ${meta.policy_version} (current: ${FOUNDATION_AI_REVIEW_POLICY}) - review may be affected by a method update`
      : samePolicy && meta?.source_key
      ? "Preliminary review"
      : "Historical / unverified AI note";

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-sm p-3 mb-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Cpu className="w-4 h-4 text-violet-600 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-violet-900">AI Preliminary Review</h3>
            <p className="text-[11px] text-violet-700">
              Identify missing inputs and questions for qualified engineering review; not structural calculations or approval.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || !prepared || typeof onResult !== "function"}
          className="h-[30px] px-3 flex items-center gap-1.5 rounded-sm bg-violet-600 text-white text-[12px] font-semibold hover:bg-violet-700 disabled:opacity-60 flex-shrink-0"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Cpu className="w-3.5 h-3.5" aria-hidden="true" />}
          {running ? "Reviewingâ€¦" : "Review Foundation Inputs"}
        </button>
        {/* O-121 (CMP-I20) -- explicit recalc action: a policy-mismatch note
            gains a "Recalculate" trigger -- an explicit re-run on the affected
            note (advisory; accepted client pricing is never touched). */}
        {policyMismatch && (
          <button
            type="button"
            onClick={run}
            disabled={running || !prepared || typeof onResult !== "function"}
            title="Recalculate this note under the current policy -- advisory, never changes accepted client pricing"
            className="h-[30px] px-3 flex items-center gap-1.5 rounded-sm bg-violet-100 text-violet-800 border border-violet-300 text-[12px] font-semibold hover:bg-violet-200 disabled:opacity-60 flex-shrink-0"
          >
            Recalculate
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={cancel}
            className="h-[30px] px-2.5 rounded-sm border border-gray-300 text-gray-600 text-[12px] hover:bg-gray-50"
            title="Discard the in-flight review"
          >
            Cancel
          </button>
        )}
        {error && !running && (
          <button
            type="button"
            onClick={retry}
            className="h-[30px] px-2.5 rounded-sm border border-gray-300 text-gray-600 text-[12px] hover:bg-gray-50"
            title="Re-run the review"
          >
            Retry
          </button>
        )}
      </div>

      {(inputError || error) && <div role="alert" className="mt-2 text-[11px] text-red-600">{inputError || error}</div>}

      {recommendation && (
        <div className="mt-3 bg-white border border-violet-200 rounded-sm p-3 text-[12px] text-gray-700 prose prose-sm max-w-none">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 mb-1">{label}</p>
          <ReactMarkdown>{recommendation}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}