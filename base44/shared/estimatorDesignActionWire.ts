// estimatorDesignAction dispatch wire
// (ESTIMATOR_MASTERPLAN W-020 / AI-09) — pure TS, ZERO imports, NO IO. Bundles
// clean for Deno base44 functions and the Vite frontend (frontend-shared-modules
// allowlist).
//
// What this does: the session-authenticated `estimatorDesignAction` function
// (NEEDS-OPERATOR deploy grant — never deployed from this session) dispatches
// module/action handlers for the AI assistant lanes: reference analysis,
// next_questions, propose, revise. This wire is the DISPATCH REGISTRY the
// function imports — it names the actions, their input/output contracts, and
// the session/auth gate each handler requires, so the function's entry stays a
// thin switch over this table. It never invents engineering values, never
// emits certification/approval language, and never applies a proposal — the
// client's explicit apply path owns that.
//
// ---------------------------------------------------------------------------
// Contract — one authoritative assistant
// ---------------------------------------------------------------------------
// Per W-020: adapt the initial Concrete endpoint if one exists — none does
// (remote `functions list` carries no concrete/design/estimator endpoint), so
// `estimatorDesignAction` is the single authoritative assistant. A second
// estimator-scoped AI function must NOT be created.
//
// Auth: every handler requires a session-authenticated caller
// (`authenticateSignShopSession`) — the function resolves the caller's
// session before dispatch; an unauthenticated invoke returns 401, never a
// guest-scoped proposal.
//
// Fail-closed: an unknown `action` or `module_key` returns
// { ok:false, error:"unknown_action"|"unknown_module", known:[...] } — the
// function never guesses a handler for a misspelled action.

export type EstimatorDesignAction =
  | "reference_analysis" // analyze reference_photos/notes -> advisory observations
  | "next_questions"     // bounded follow-up questions for the intake lane
  | "propose"            // structured proposal draft (advisory, never applied)
  | "revise";            // revise a prior proposal against operator feedback

export const ESTIMATOR_DESIGN_ACTIONS: readonly EstimatorDesignAction[] = [
  "reference_analysis",
  "next_questions",
  "propose",
  "revise",
] as const;

export type EstimatorDesignModuleKey =
  | "foundation"   // the landed module — FoundationEstimator + foundationCalc
  | "brick_stone"  // queued modules — the intake-shell contract names them;
  | "channel"      // the dispatch accepts the key but the handler returns
  | "cabinet"      // { ok:false, error:"module_not_implemented" } until the
  | "monument"     // module's intake lane lands (never a silent foundation
  | "pylon"        // fallback).
  | "custom";

export const ESTIMATOR_DESIGN_MODULE_KEYS: readonly EstimatorDesignModuleKey[] = [
  "foundation",
  "brick_stone",
  "channel",
  "cabinet",
  "monument",
  "pylon",
  "custom",
] as const;

export type EstimatorDesignRequest = {
  action: EstimatorDesignAction;
  module_key: EstimatorDesignModuleKey;
  /** The operator-authored draft context — the module's scene/project record.
   *  Never a proposal to apply — `propose`/`revise` RETURN a draft; the
   *  client's explicit apply path owns the merge. */
  project?: unknown;
  /** `revise` carries the prior proposal + the operator's feedback text. */
  proposal?: unknown;
  feedback?: string;
  /** `reference_analysis`/`next_questions` carry the intake lane's context —
   *  reference_photos rows ({id,url,caption} — urls, never image bytes) +
   *  the authored notes. */
  reference_photos?: { id?: string; url?: string; caption?: string }[];
  notes?: string;
  /** The proposal's base revision — the server-owned CAS check (W-017's
   *  remaining tail) compares it to the record's `updated_date` at apply
   *  time, not at dispatch. */
  base_project_revision?: string;
};

export type EstimatorDesignResponse =
  | { ok: true; action: EstimatorDesignAction; module_key: EstimatorDesignModuleKey; result: unknown }
  | { ok: false; error: "unknown_action" | "unknown_module" | "module_not_implemented" | "unauthenticated"; known?: readonly string[] };

/** The module keys whose intake lanes are implemented today — the dispatch
 *  returns `module_not_implemented` for the rest (never a foundation
 *  fallback). Foundation is the only landed lane. */
export const ESTIMATOR_DESIGN_IMPLEMENTED_MODULES: readonly EstimatorDesignModuleKey[] = [
  "foundation",
] as const;

/** Validate + classify a request — the function's entry calls this before
 *  dispatching; a `false` result is the response verbatim (fail-closed). */
export function classifyEstimatorDesignRequest(body: unknown): { ok: true; request: EstimatorDesignRequest } | EstimatorDesignResponse {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = typeof b.action === "string" ? (b.action as EstimatorDesignAction) : null;
  if (!action || !ESTIMATOR_DESIGN_ACTIONS.includes(action))
    return { ok: false, error: "unknown_action", known: ESTIMATOR_DESIGN_ACTIONS };
  const moduleKey = typeof b.module_key === "string" ? (b.module_key as EstimatorDesignModuleKey) : null;
  if (!moduleKey || !ESTIMATOR_DESIGN_MODULE_KEYS.includes(moduleKey))
    return { ok: false, error: "unknown_module", known: ESTIMATOR_DESIGN_MODULE_KEYS };
  if (!ESTIMATOR_DESIGN_IMPLEMENTED_MODULES.includes(moduleKey))
    return { ok: false, error: "module_not_implemented", known: ESTIMATOR_DESIGN_IMPLEMENTED_MODULES };
  return { ok: true, request: { ...b, action, module_key: moduleKey } as EstimatorDesignRequest };
}
