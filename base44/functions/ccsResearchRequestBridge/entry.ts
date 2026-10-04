import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

const SHARED_SECRET = Deno.env.get("CCS_RESEARCH_BRIDGE_SECRET") || "";

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a[i % Math.max(a.length, 1)] || 0) ^ (b[i % Math.max(b.length, 1)] || 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

    const provided = String(req.headers.get("x-ccs-research-secret") || "");
    if (!SHARED_SECRET || !provided || !constantTimeEqual(provided, SHARED_SECRET)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action === "ping") return Response.json({ success: true });

    const base44 = createClientFromRequest(req);
    const ResearchRequest = base44.asServiceRole.entities.ResearchRequest;

    if (action === "get") {
      const id = String(body?.id || "").trim();
      if (!id) return Response.json({ error: "ResearchRequest id required" }, { status: 400 });
      const record = await ResearchRequest.get(id);
      return Response.json({ success: true, record });
    }

    if (action === "create") {
      const input = body?.payload || {};
      const jurisdictionName = String(input?.jurisdiction_name || "").trim();
      const state = String(input?.state || "").trim().toUpperCase();
      if (!jurisdictionName || !["OH", "KY"].includes(state)) {
        return Response.json({ error: "Valid OH/KY jurisdiction_name and state required" }, { status: 400 });
      }

      const record = await ResearchRequest.create({
        jurisdiction_name: jurisdictionName,
        state,
        city: input?.city ? String(input.city).trim() : null,
        county: input?.county ? String(input.county).trim() : null,
        ccs_jurisdiction_id: input?.ccs_jurisdiction_id ? String(input.ccs_jurisdiction_id).trim() : null,
        status: "pending",
        requested_by: "continuous_backlog_dispatcher",
      });
      return Response.json({ success: true, record });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("ccsResearchRequestBridge", error);
    return Response.json({ error: "Research bridge request failed" }, { status: 500 });
  }
});
