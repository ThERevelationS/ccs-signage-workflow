import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  cheapFetch,
  detectChange,
  extractLinks,
  diffLinkSet,
  textDiffSummary,
  assessRegulatoryImpact,
  computeNextCheckDue,
} from "../../shared/sourceMonitorScanner.ts";
import { hasWorkflowInvocationCapability } from "../../shared/workflowInvocationCapability.ts";

// ── Source Monitor Scanner (Phase 11) ──
// CHEAP FIRST: fetch + hash/headers comparison. AI ONLY on meaningful changes.
// Never erases archives, never auto-promotes drafts, never rewrites approved rules.
// Broken source: increment failure_count, create gap alert — never delete data.

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isScheduledRun = await hasWorkflowInvocationCapability(body, "sourceMonitorScan");

    if (!isScheduledRun) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    // Optional filters from body
    const limit = Math.min(Number(body.limit) || 50, 200);
    const jurisdictionFilter = body.jurisdiction_name || null;
    const dryRun = Boolean(body.dry_run);

    // Find monitor rows due for checking
    const nowIso = new Date().toISOString();
    const query: Record<string, unknown> = {
      monitor_enabled: true,
      next_check_due: { $lte: nowIso },
    };
    if (jurisdictionFilter) query.jurisdiction_name = jurisdictionFilter;

    const monitorPage = await base44.asServiceRole.entities.SourceMonitorState.filter(
      query,
      { sort: "next_check_due", limit, fields: ["id", "source_document_id", "official_url", "jurisdiction_name", "jurisdiction_id", "source_title", "source_type", "authority_classification", "last_known_hash", "last_known_etag", "last_known_last_modified", "last_known_content_length", "schedule_cadence", "failure_count"] },
    );

    const results: Array<Record<string, unknown>> = [];
    let changesDetected = 0;
    let failures = 0;
    let noChange = 0;

    for (const monitor of monitorPage.items) {
      const result = await scanOneSource(base44, monitor, dryRun);
      results.push(result);
      if (result.status === "changed") changesDetected++;
      else if (result.status === "failed") failures++;
      else if (result.status === "no_change") noChange++;
    }

    return Response.json({
      success: true,
      scanned: monitorPage.items.length,
      changes_detected: changesDetected,
      no_change: noChange,
      failures,
      dry_run: dryRun,
      results,
    });
  } catch (error) {
    console.error("sourceMonitorScan error:", error?.message || error);
    return Response.json({ error: "Source monitor scan could not complete safely" }, { status: 500 });
  }
});

async function scanOneSource(base44: any, monitor: any, dryRun: boolean): Promise<Record<string, unknown>> {
  const monitorId = monitor.id;
  const url = monitor.official_url;
  const nowIso = new Date().toISOString();

  try {
    // ── CHEAP CHECK: fetch + compare hash/headers ──
    const fetched = await cheapFetch(url);

    const { changed, method } = detectChange(monitor, fetched);

    if (!changed) {
      // No change: update last_successful_check + next_check_due. NO AI.
      if (!dryRun) {
        await base44.asServiceRole.entities.SourceMonitorState.update(monitorId, {
          last_successful_check: nowIso,
          last_http_status: String(fetched.status),
          failure_count: 0,
          last_error: "",
          next_check_due: computeNextCheckDue(monitor.schedule_cadence || "moderate", nowIso),
          last_known_etag: fetched.etag || undefined,
          last_known_last_modified: fetched.lastModified || undefined,
          last_known_content_length: fetched.contentLength || undefined,
        });
      }
      return { monitor_id: monitorId, status: "no_change", method, http_status: fetched.status };
    }

    // ── CHANGE DETECTED: diff + AI assessment ──
    const oldLinks = monitor.last_known_hash ? extractLinks("") : new Set<string>(); // we don't store old body; use hash-only diff
    const newLinks = extractLinks(fetched.bodyText);
    const linkDiff = diffLinkSet(oldLinks, newLinks);

    // Text diff: we don't store the old body, so compare hash + content length
    const diffSummary = `Content hash changed (method: ${method}). Old length: ${monitor.last_known_content_length || "unknown"}, new length: ${fetched.contentLength}. ${linkDiff.added.length} links added, ${linkDiff.removed.length} links removed.`;

    // AI assessment (ONLY on change)
    const aiResult = await assessRegulatoryImpact(
      base44,
      monitor.source_title || "Source document",
      monitor.jurisdiction_name || "Unknown",
      diffSummary,
      linkDiff,
    );

    // Update the source document hash (so future extractions can detect further changes)
    if (!dryRun) {
      await base44.asServiceRole.entities.PermittingSourceDocument.update(monitor.source_document_id, {
        file_hash_sha256: fetched.hash,
        file_bytes: fetched.contentLength,
        last_checked: nowIso,
        last_changed: nowIso,
      });

      // Update monitor state
      await base44.asServiceRole.entities.SourceMonitorState.update(monitorId, {
        last_successful_check: nowIso,
        last_changed: nowIso,
        last_known_hash: fetched.hash,
        last_known_etag: fetched.etag || undefined,
        last_known_last_modified: fetched.lastModified || undefined,
        last_known_content_length: fetched.contentLength || undefined,
        last_http_status: String(fetched.status),
        failure_count: 0,
        last_error: "",
        may_affect_regulatory_data: aiResult.mayAffect,
        staff_review_required: aiResult.mayAffect,
        last_change_summary: {
          method,
          old_hash: monitor.last_known_hash || null,
          new_hash: fetched.hash,
          old_content_length: monitor.last_known_content_length || null,
          new_content_length: fetched.contentLength,
          links_added: linkDiff.added.length,
          links_removed: linkDiff.removed.length,
          ai_summary: aiResult.summary,
          assessed_at: nowIso,
        },
        next_check_due: computeNextCheckDue(monitor.schedule_cadence || "moderate", nowIso),
      });

      // If regulatory data may be affected, flag affected approved rules
      if (aiResult.mayAffect) {
        try {
          await base44.functions.invoke("permittingRuleInvalidate", {
            source_document_id: monitor.source_document_id,
            new_hash: fetched.hash,
          });
        } catch (flagError) {
          console.warn("Rule flagging failed for source", monitor.source_document_id, flagError?.message);
        }

        // Create a deduped RegulationAlert
        await createMonitorAlert(base44, {
          jurisdiction_id: monitor.jurisdiction_id,
          jurisdiction_name: monitor.jurisdiction_name,
          source_document_id: monitor.source_document_id,
          source_title: monitor.source_title,
          alert_type: "document_update",
          title: `Source changed: ${monitor.source_title || monitor.official_url}`,
          description: diffSummary,
          new_value: aiResult.summary,
          severity: "high",
          field_changed: "source_hash",
        });
      }
    }

    return {
      monitor_id: monitorId,
      status: "changed",
      method,
      may_affect: aiResult.mayAffect,
      ai_summary: aiResult.summary,
      http_status: fetched.status,
    };
  } catch (error) {
    // ── BROKEN SOURCE: increment failure_count, never delete data ──
    const errorMsg = String(error?.message || error).slice(0, 500);
    const failCount = (monitor.failure_count || 0) + 1;
    const httpStatus = String(error?.status || "error");

    if (!dryRun) {
      await base44.asServiceRole.entities.SourceMonitorState.update(monitorId, {
        failure_count: failCount,
        last_http_status: httpStatus,
        last_error: errorMsg,
        staff_review_required: failCount >= 3,
        // Do NOT update next_check_due on failure — retry on next cycle
      });

      // Gap alert after 3 consecutive failures
      if (failCount >= 3) {
        await createMonitorAlert(base44, {
          jurisdiction_id: monitor.jurisdiction_id,
          jurisdiction_name: monitor.jurisdiction_name,
          source_document_id: monitor.source_document_id,
          source_title: monitor.source_title,
          alert_type: "url_change",
          title: `Source unavailable: ${monitor.source_title || monitor.official_url}`,
          description: `${failCount} consecutive check failures. Last error: ${errorMsg}. Previously verified data and archives are preserved.`,
          severity: "critical",
          field_changed: "source_availability",
        });
      }
    }

    return { monitor_id: monitorId, status: "failed", error: errorMsg, failure_count: failCount };
  }
}

// ── Deduped alert creation: one open alert per (jurisdiction_id, field_changed, source_document_id) ──
async function createMonitorAlert(base44: any, alertData: {
  jurisdiction_id: string;
  jurisdiction_name: string;
  source_document_id: string;
  source_title: string;
  alert_type: string;
  title: string;
  description: string;
  new_value?: string;
  severity: string;
  field_changed: string;
}) {
  try {
    // Check for an existing open alert with the same identity
    const existing = await base44.asServiceRole.entities.RegulationAlert.filter({
      jurisdiction_id: alertData.jurisdiction_id,
      field_changed: alertData.field_changed,
      is_read: false,
    }, { limit: 10 });

    // Dedupe: if an open alert exists for this source, update it instead of creating a duplicate
    for (const alert of existing.items || []) {
      if (String(alert.description || "").includes(alertData.source_document_id)) {
        // Update existing alert
        await base44.asServiceRole.entities.RegulationAlert.update(alert.id, {
          title: alertData.title,
          description: alertData.description,
          new_value: alertData.new_value || "",
          severity: alertData.severity,
          detected_at: new Date().toISOString(),
        });
        return { status: "updated_existing", alert_id: alert.id };
      }
    }

    // Create new alert
    const created = await base44.asServiceRole.entities.RegulationAlert.create({
      jurisdiction_id: alertData.jurisdiction_id,
      jurisdiction_name: alertData.jurisdiction_name,
      alert_type: alertData.alert_type,
      title: alertData.title,
      description: `${alertData.description}\n\nSource document: ${alertData.source_document_id}`,
      new_value: alertData.new_value || "",
      severity: alertData.severity,
      field_changed: alertData.field_changed,
      detected_at: new Date().toISOString(),
      is_read: false,
      notification_sent: false,
    });
    return { status: "created", alert_id: created.id };
  } catch (e) {
    console.warn("Monitor alert creation failed:", e?.message);
    return { status: "error", error: e?.message };
  }
}