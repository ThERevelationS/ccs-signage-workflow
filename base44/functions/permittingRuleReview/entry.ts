import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { canBeOperational, isCurrentAdoptedSource } from "../../shared/permittingRuleExtraction.ts";

// ── PermittingRule staff review function ──
// Admin-only: list, approve, reject, edit, supersede.
// Approving requires at least one citation from a current_adopted source.
// Optimistic concurrency via version field prevents silent overwrites.
// Superseding archives the old rule (status superseded, superseded_by set) rather than deleting.

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toLowerCase();

    // ── LIST ──
    if (action === "list") {
      const filter: Record<string, unknown> = {};
      if (body.jurisdiction_name) filter.jurisdiction_name = body.jurisdiction_name;
      if (body.rule_category) filter.rule_category = body.rule_category;
      if (body.status) filter.status = body.status;
      if (body.confidence) filter.confidence = body.confidence;
      if (body.conflict_state) filter.conflict_state = body.conflict_state;
      if (body.sign_type_normalized) filter.sign_type_normalized = body.sign_type_normalized;

      const limit = Math.min(Number(body.limit) || 100, 500);
      const sort = body.sort || "-created_date";

      const page = await base44.asServiceRole.entities.PermittingRule.filter(
        Object.keys(filter).length > 0 ? filter : {},
        { sort, limit, fields: [
          "id", "jurisdiction_name", "rule_category", "sign_type", "sign_type_normalized",
          "zoning_district_applicability", "trigger", "requirement", "numeric_value", "unit",
          "exceptions", "status", "confidence", "conflict_state", "citations",
          "is_operational", "draft_context", "reviewer", "reviewed_at", "version",
          "supersedes", "superseded_by", "effective_date", "notes", "created_date",
        ], ...(body.cursor ? { cursor: body.cursor } : {}) },
      );

      return Response.json({
        success: true,
        rules: page.items,
        has_more: page.has_more,
        next_cursor: page.next_cursor,
      });
    }

    // ── COUNTS ──
    if (action === "counts") {
      const filter = body.jurisdiction_name ? { jurisdiction_name: body.jurisdiction_name } : {};
      const [total, byStatus, byCategory, operational, needsReview, draftContext] = await Promise.all([
        base44.asServiceRole.entities.PermittingRule.count(filter),
        base44.asServiceRole.entities.PermittingRule.aggregate({ query: filter, groupBy: "status", count: true }),
        base44.asServiceRole.entities.PermittingRule.aggregate({ query: filter, groupBy: "rule_category", count: true }),
        base44.asServiceRole.entities.PermittingRule.count({ ...filter, is_operational: true }),
        base44.asServiceRole.entities.PermittingRule.count({ ...filter, status: "needs_review" }),
        base44.asServiceRole.entities.PermittingRule.count({ ...filter, draft_context: true }),
      ]);
      return Response.json({
        success: true,
        total,
        operational,
        needs_review: needsReview,
        draft_context: draftContext,
        by_status: (byStatus as any).rows || [],
        by_category: (byCategory as any).rows || [],
      });
    }

    // ── GET (single rule with full citations) ──
    if (action === "get") {
      const ruleId = String(body.rule_id || "");
      if (!ruleId) return Response.json({ error: "rule_id required" }, { status: 400 });
      const rule = await base44.asServiceRole.entities.PermittingRule.get(ruleId);
      return Response.json({ success: true, rule });
    }

    // ── APPROVE ──
    if (action === "approve") {
      const ruleId = String(body.rule_id || "");
      const expectedVersion = Number(body.expected_version) || 0;
      if (!ruleId) return Response.json({ error: "rule_id required" }, { status: 400 });

      const rule = await base44.asServiceRole.entities.PermittingRule.get(ruleId);
      if (rule.draft_context) {
        return Response.json({ error: "Cannot approve a rule extracted from a draft/proposed source — authority gate prohibits this." }, { status: 409 });
      }
      if (rule.status === "historical") {
        return Response.json({ error: "Cannot approve a historical rule — reconfirm from a current source first." }, { status: 409 });
      }

      // Validate: at least one citation from a current_adopted source
      const citations = (rule as any).citations || [];
      const sourceIds = citations.map((c: any) => c.source_document_id).filter(Boolean);
      let hasCurrentAdoptedCitation = false;
      if (sourceIds.length > 0) {
        const sources = await base44.asServiceRole.entities.PermittingSourceDocument.filter(
          { id: { $in: sourceIds } },
          { limit: 50, fields: ["id", "authority_classification", "content_status"] },
        );
        hasCurrentAdoptedCitation = sources.items.some((s: any) => isCurrentAdoptedSource(s));
      }
      if (!hasCurrentAdoptedCitation) {
        return Response.json({ error: "Approval requires at least one citation from a current_adopted source." }, { status: 409 });
      }

      // Optimistic concurrency check
      if ((rule as any).version !== expectedVersion) {
        return Response.json({ error: "Version mismatch — another reviewer edited this rule. Please refresh.", current_version: (rule as any).version }, { status: 409 });
      }

      const updated = await base44.asServiceRole.entities.PermittingRule.update(ruleId, {
        status: "staff_approved",
        is_operational: canBeOperational("staff_approved", citations),
        reviewer: user.full_name || user.email,
        reviewer_email: user.email,
        reviewed_at: new Date().toISOString(),
        version: expectedVersion + 1,
      });
      return Response.json({ success: true, rule: updated });
    }

    // ── REJECT ──
    if (action === "reject") {
      const ruleId = String(body.rule_id || "");
      const expectedVersion = Number(body.expected_version) || 0;
      const reason = String(body.reason || "");
      if (!ruleId) return Response.json({ error: "rule_id required" }, { status: 400 });

      const rule = await base44.asServiceRole.entities.PermittingRule.get(ruleId);
      if ((rule as any).version !== expectedVersion) {
        return Response.json({ error: "Version mismatch — another reviewer edited this rule. Please refresh.", current_version: (rule as any).version }, { status: 409 });
      }

      const updated = await base44.asServiceRole.entities.PermittingRule.update(ruleId, {
        status: "staff_rejected",
        is_operational: false,
        reviewer: user.full_name || user.email,
        reviewer_email: user.email,
        reviewed_at: new Date().toISOString(),
        notes: String((rule as any).notes || "") + (reason ? `\n\nRejection reason: ${reason}` : ""),
        version: expectedVersion + 1,
      });
      return Response.json({ success: true, rule: updated });
    }

    // ── EDIT ──
    if (action === "edit") {
      const ruleId = String(body.rule_id || "");
      const expectedVersion = Number(body.expected_version) || 0;
      const edits = body.edits || {};
      if (!ruleId) return Response.json({ error: "rule_id required" }, { status: 400 });

      const rule = await base44.asServiceRole.entities.PermittingRule.get(ruleId);
      if ((rule as any).version !== expectedVersion) {
        return Response.json({ error: "Version mismatch — another reviewer edited this rule. Please refresh.", current_version: (rule as any).version }, { status: 409 });
      }

      // Only allow editable fields
      const allowed: Record<string, unknown> = {};
      for (const key of ["requirement", "trigger", "exceptions", "zoning_district_applicability", "numeric_value", "unit", "sign_type", "sign_type_normalized", "rule_category", "notes", "citations"]) {
        if (key in edits) allowed[key] = edits[key];
      }
      allowed.version = expectedVersion + 1;
      allowed.reviewer = user.full_name || user.email;
      allowed.reviewer_email = user.email;
      allowed.reviewed_at = new Date().toISOString();

      // If editing citations, re-check operational eligibility
      if ("citations" in allowed) {
        const citations = allowed.citations as any[];
        const sourceIds = citations.map((c: any) => c.source_document_id).filter(Boolean);
        let hasCurrentAdopted = false;
        if (sourceIds.length > 0) {
          const sources = await base44.asServiceRole.entities.PermittingSourceDocument.filter(
            { id: { $in: sourceIds } },
            { limit: 50, fields: ["id", "authority_classification", "content_status"] },
          );
          hasCurrentAdopted = sources.items.some((s: any) => isCurrentAdoptedSource(s));
        }
        // Only update is_operational if currently staff_approved
        if ((rule as any).status === "staff_approved") {
          allowed.is_operational = canBeOperational("staff_approved", citations) && hasCurrentAdopted;
        }
      }

      const updated = await base44.asServiceRole.entities.PermittingRule.update(ruleId, allowed);
      return Response.json({ success: true, rule: updated });
    }

    // ── SUPERSEDE ──
    // Archives the old rule (status superseded, superseded_by set) and creates a new rule.
    if (action === "supersede") {
      const oldRuleId = String(body.old_rule_id || "");
      const expectedVersion = Number(body.expected_version) || 0;
      const newRuleData = body.new_rule || {};
      if (!oldRuleId) return Response.json({ error: "old_rule_id required" }, { status: 400 });

      const oldRule = await base44.asServiceRole.entities.PermittingRule.get(oldRuleId);
      if ((oldRule as any).version !== expectedVersion) {
        return Response.json({ error: "Version mismatch — another reviewer edited this rule. Please refresh.", current_version: (oldRule as any).version }, { status: 409 });
      }

      // Create the new rule
      const newRule = {
        ...newRuleData,
        jurisdiction_name: (oldRule as any).jurisdiction_name,
        jurisdiction_id: (oldRule as any).jurisdiction_id,
        issuing_office: (oldRule as any).issuing_office,
        status: "staff_approved",
        is_operational: canBeOperational("staff_approved", newRuleData.citations || []),
        reviewer: user.full_name || user.email,
        reviewer_email: user.email,
        reviewed_at: new Date().toISOString(),
        supersedes: oldRuleId,
        version: 1,
      };
      const created = await base44.asServiceRole.entities.PermittingRule.create(newRule);

      // Archive the old rule
      await base44.asServiceRole.entities.PermittingRule.update(oldRuleId, {
        status: "superseded",
        superseded_by: created.id,
        is_operational: false,
        version: expectedVersion + 1,
      });

      return Response.json({ success: true, old_rule_id: oldRuleId, new_rule: created });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}