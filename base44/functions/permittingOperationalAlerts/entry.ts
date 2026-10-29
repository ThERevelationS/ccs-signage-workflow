import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { loadAllEntityRows } from "../../shared/pagedEntityRows.ts";
import { hasWorkflowInvocationCapability } from "../../shared/workflowInvocationCapability.ts";

// ── Permitting Operational Alerts (Phase 14) ──
// Deduped, actionable operational automations that respect existing
// WorkOrder/PermitLineItem semantics — recommend, never rewrite active permit processes.
//
// Automations:
// 1. Missing-document warning: PermitLineItems whose locality has verified
//    requirements but the line is missing required docs (only where data exists).
// 2. Fee schedule changed: mark affected fee rules for review (delegates to
//    the source monitor scanner which already handles this).
//
// Dedupe: one open alert per (type, subject). Re-alert only on escalation.

Deno.serve(async (req: Request) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const isScheduledRun = await hasWorkflowInvocationCapability(body, "permittingOperationalAlerts");

    if (!isScheduledRun) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const alertsCreated = 0;
    const alertsUpdated = 0;
    const alertsSkipped = 0;

    // ── 1. Missing-document warnings ──
    // Only for active PermitLineItems whose locality has a JurisdictionProfile
    // with verified requirements (requires_permit = true). Do not fire for
    // not-researched jurisdictions.
    const missingDocResults = await checkMissingDocuments(base44);

    return Response.json({
      success: true,
      missing_document_alerts: missingDocResults,
    });
  } catch (error) {
    console.error("permittingOperationalAlerts error:", error?.message || error);
    return Response.json({ error: "Operational alerts could not be checked safely" }, { status: 500 });
  }
});

async function checkMissingDocuments(base44: any) {
  // Load active PermitLineItems that have a locality_name
  const lines = await loadAllEntityRows({
    entity: base44.asServiceRole.entities.PermitLineItem,
    query: { status: "active", locality_name: { $exists: true } },
    sort: "created_date",
    label: "Active permit lines for missing-doc check",
  });

  // Group by locality_name to batch JurisdictionProfile lookups
  const localityNames = [...new Set(lines.map((l: any) => l.locality_name).filter(Boolean))];

  // Load JurisdictionProfiles for these localities
  const profilesByLocality = new Map<string, any>();
  for (const name of localityNames) {
    try {
      const profilePage = await base44.asServiceRole.entities.JurisdictionProfile.filter(
        { name: name },
        { limit: 5 },
      );
      if (profilePage.items?.length) profilesByLocality.set(name, profilePage.items[0]);
    } catch { /* non-fatal */ }
  }

  let alertsCreated = 0;
  let alertsSkipped = 0;

  for (const line of lines) {
    const profile = profilesByLocality.get(line.locality_name);
    if (!profile) continue; // not-researched jurisdiction — skip

    // Only warn where the locality has verified requirements
    const requiresPermit = profile.requires_permit === true || profile.permit_required === true;
    if (!requiresPermit) continue;

    // Check if the line item has documents attached
    const hasDocs = (line.documents?.length || 0) > 0 || (line.permit_number && line.permit_number.trim());
    if (hasDocs) continue;

    // Dedupe: check for an existing open alert for this line
    const existing = await base44.asServiceRole.entities.RegulationAlert.filter(
      { field_changed: "missing_required_docs", is_read: false },
      { limit: 50 },
    );

    const dedupeKey = `missing_docs_${line.id}`;
    let found = false;
    for (const alert of existing.items || []) {
      if (String(alert.description || "").includes(dedupeKey)) {
        found = true;
        break;
      }
    }
    if (found) { alertsSkipped++; continue; }

    // Create the alert
    try {
      await base44.asServiceRole.entities.RegulationAlert.create({
        jurisdiction_id: profile.id || "",
        jurisdiction_name: line.locality_name,
        alert_type: "other",
        title: `Missing permit documents: ${line.row_name || line.locality_name}`,
        description: `PermitLineItem ${line.id} in ${line.locality_name} has verified permit requirements but no documents attached. ${dedupeKey}`,
        severity: "medium",
        field_changed: "missing_required_docs",
        detected_at: new Date().toISOString(),
        is_read: false,
        notification_sent: false,
      });
      alertsCreated++;
    } catch (e) {
      console.warn("Missing-doc alert creation failed for line", line.id, e?.message);
    }
  }

  return { created: alertsCreated, skipped: alertsSkipped, lines_scanned: lines.length };
}