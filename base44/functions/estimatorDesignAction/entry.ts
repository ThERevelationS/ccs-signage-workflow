// estimatorDesignAction — W-020 (AI-09). The single authoritative estimator
// design assistant: session-authenticated dispatch over
// estimatorDesignActionWire's action registry. Foundation lane only today;
// queued modules return module_not_implemented (never a foundation fallback).
//
// W-017 tail: `propose`/`revise` stamp `base_project_revision` from the LIVE
// FoundationProject record — the server owns the base revision a draft is
// written against, so the client apply path verifies a server-read value.
//
// W-024 tail: every InvokeLLM call pins ESTIMATOR_AI_MODEL (estimatorAiModelPolicy) —
// server-owned policy, no provider fallback, no silent model substitution.
//
// Proposals are advisory: this function returns drafts, never applies them —
// the client's explicit apply path owns the merge (staleBase banner +
// apply-anyway stay client-side).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { classifyEstimatorDesignRequest, ESTIMATOR_DESIGN_ACTIONS, ESTIMATOR_DESIGN_MODULE_KEYS, type EstimatorDesignRequest } from "../../shared/estimatorDesignActionWire.ts";
import { ESTIMATOR_AI_MODEL, ESTIMATOR_AI_POLICY_VERSION } from "../../shared/estimatorAiModelPolicy.js";

const clean = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);

// Foundation intake's adversarial-class contract (AI-eval W-023/O-091): the
// prompt must never emit certification, engineering approval, or code-
// compliance claims — advisory language only.
const ADVISORY_RULES = `Rules: you are an estimating assistant, not an engineer.
- Never claim certification, engineering approval, code compliance, or that values are verified.
- Never invent dimensions, quantities, prices, stock data, or placement — mark unknowns "unknown".
- Output is advisory for operator review; nothing you return is applied automatically.`;

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    project_name: { type: "string" },
    foundation_type: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          foundation_type: { type: "string" },
          width_inches: { type: "number" },
          depth_inches: { type: "number" },
          length_inches: { type: "number" },
          pole_height_inches: { type: "number" },
        },
        additionalProperties: true,
      },
    },
    notes: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  additionalProperties: true,
};

async function liveProjectRevision(base44: any, project: any): Promise<{ id: string; revision: string }> {
  const id = clean(project?.id, 128);
  if (!id) return { id: "", revision: "" };
  const live = await base44.asServiceRole.entities.FoundationProject.get(id).catch(() => null);
  return { id, revision: String(live?.updated_date || "") };
}

async function llm(base44: any, prompt: string, schema: unknown, files: string[] = []) {
  return base44.asServiceRole.integrations.Core.InvokeLLM({
    model: ESTIMATOR_AI_MODEL,
    prompt,
    ...(files.length ? { file_urls: files } : {}),
    ...(schema ? { response_json_schema: schema } : {}),
  });
}

async function handle(base44: any, req: EstimatorDesignRequest) {
  const project = (req.project && typeof req.project === "object" ? req.project : {}) as Record<string, unknown>;
  const notes = clean(req.notes, 8000);
  const photos = Array.isArray(req.reference_photos) ? req.reference_photos : [];

  if (req.action === "reference_analysis") {
    const res = await llm(base44,
      `Analyze these site references for a concrete sign-foundation estimate.\n${ADVISORY_RULES}\nAuthored notes: ${notes || "(none)"}\nReturn JSON: { observations: string[], questions: string[], confidence: "low"|"medium"|"high" }`,
      { type: "object", properties: { observations: { type: "array", items: { type: "string" } }, questions: { type: "array", items: { type: "string" } }, confidence: { type: "string" } }, additionalProperties: true },
      photos.map((p) => clean(p?.url, 2048)).filter(Boolean));
    return { analysis: res, model: ESTIMATOR_AI_MODEL };
  }

  if (req.action === "next_questions") {
    const res = await llm(base44,
      `Given this foundation project draft and notes, list the bounded follow-up questions needed before a proposal can be drafted. Group them by topic (site, geometry, loads, logistics). ${ADVISORY_RULES}\nDraft: ${JSON.stringify(project).slice(0, 6000)}\nNotes: ${notes || "(none)"}\nReturn JSON: { groups: [{ topic: string, questions: string[] }] }`,
      { type: "object", properties: { groups: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, questions: { type: "array", items: { type: "string" } } }, additionalProperties: true } } }, additionalProperties: true });
    return { groups: res?.groups || [], model: ESTIMATOR_AI_MODEL };
  }

  // propose / revise — stamp the server-read base revision (W-017 tail)
  const base = await liveProjectRevision(base44, project);
  const prior = req.action === "revise" ? `Prior proposal: ${JSON.stringify(req.proposal ?? {}).slice(0, 6000)}\nOperator feedback: ${clean(req.feedback, 4000)}\n` : "";
  const res = await llm(base44,
    `${req.action === "revise" ? "Revise the prior proposal per the operator feedback." : "Draft a foundation-module proposal for this project."}\n${ADVISORY_RULES}\n${prior}Draft context: ${JSON.stringify(project).slice(0, 6000)}\nNotes: ${notes || "(none)"}`,
    PROPOSAL_SCHEMA);
  return {
    proposal: res,
    base_project_revision: base.revision, // server-owned: stamped from the live record at dispatch
    base_project_id: base.id,
    model: ESTIMATOR_AI_MODEL,
    policy_version: ESTIMATOR_AI_POLICY_VERSION,
    advisory: true,
  };
}

Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const user = await authenticateSignShopSession(base44, (body as any)?.session_token).catch(() => null);
  if (!user) return Response.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const classified = classifyEstimatorDesignRequest(body);
  if (classified.ok !== true) return Response.json(classified, { status: 400 });

  try {
    const result = await handle(base44, classified.request);
    return Response.json({ ok: true, action: classified.request.action, module_key: classified.request.module_key, result });
  } catch (e: any) {
    return Response.json({ ok: false, error: clean(e?.message || e, 400) || "handler failed" }, { status: 500 });
  }
});
