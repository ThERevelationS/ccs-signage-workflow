import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

// ── PermittingRule change-linkage helper (Phase 11 preparation) ──
// Given a PermittingSourceDocument whose file hash changed, flags affected
// staff_approved rules to needs_review + conflict_state under_review.
// Never silently rewrites or deletes rules — only flags them for re-review.
// Admin-only (or service-role for future automated calls).

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const sourceDocumentId = String(body.source_document_id || "");
    const newHash = String(body.new_hash || "");
    if (!sourceDocumentId) return Response.json({ error: "source_document_id required" }, { status: 400 });

    // Fetch the source document to get its current hash
    const sourceDoc = await base44.asServiceRole.entities.PermittingSourceDocument.get(sourceDocumentId);
    const currentHash = (sourceDoc as any).file_hash_sha256 || "";

    // Find all PermittingRule records that cite this source document
    // We need to scan rules where citations[].source_document_id matches.
    // Since citations is an array of objects, we filter by jurisdiction first, then check citations in-memory.
    const jurisdictionName = (sourceDoc as any).jurisdiction_name || "";

    const affectedRules: any[] = [];
    let cursor: string | undefined;
    do {
      const page = await base44.asServiceRole.entities.PermittingRule.filter(
        { jurisdiction_name: jurisdictionName, status: { $in: ["staff_approved", "extracted", "needs_review"] } },
        { sort: "id", limit: 200, fields: ["id", "status", "source_snapshot_sha256", "citations", "is_operational", "version"], ...(cursor ? { cursor } : {}) },
      );
      for (const rule of page.items) {
        const citations = (rule as any).citations || [];
        const citesThisSource = citations.some((c: any) => c.source_document_id === sourceDocumentId);
        if (citesThisSource) affectedRules.push(rule);
      }
      cursor = page.next_cursor;
    } while (cursor && page.has_more);

    // Flag rules whose stored source_snapshot_sha256 differs from the current hash
    const toFlag = affectedRules.filter((r) => {
      const storedHash = r.source_snapshot_sha256 || "";
      // If we have a new_hash to compare, use that; otherwise compare against the doc's current hash
      const compareHash = newHash || currentHash;
      return compareHash && storedHash && storedHash !== compareHash;
    });

    let flaggedCount = 0;
    const flaggedIds: string[] = [];
    for (const rule of toFlag) {
      const update: Record<string, unknown> = {
        conflict_state: "under_review",
        version: (rule.version || 1) + 1,
      };
      // Only staff_approved rules get demoted to needs_review; others stay in their current review state
      if (rule.status === "staff_approved") {
        update.status = "needs_review";
        update.is_operational = false;
      }
      await base44.asServiceRole.entities.PermittingRule.update(rule.id, update);
      flaggedIds.push(rule.id);
      flaggedCount++;
    }

    return Response.json({
      success: true,
      source_document_id: sourceDocumentId,
      current_hash: currentHash,
      new_hash: newHash,
      rules_checked: affectedRules.length,
      rules_flagged: flaggedCount,
      flagged_rule_ids: flaggedIds,
      note: "Flagged rules are set to needs_review + under_review. No rules were rewritten or deleted.",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}