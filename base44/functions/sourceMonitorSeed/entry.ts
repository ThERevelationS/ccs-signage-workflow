import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { defaultCadence, computeNextCheckDue } from "../../shared/sourceMonitorScanner.ts";

// ── Source Monitor Seed (Phase 11) ──
// Seeds SourceMonitorState rows for Boone County's archived PermittingSourceDocuments.
// Admin-only. Idempotent: skips sources that already have a monitor row.
// Monitor-enabled = true for Boone County only.

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const jurisdictionName = body.jurisdiction_name || "Boone County";
    const monitorEnabled = body.monitor_enabled !== false; // default true

    // Load all PermittingSourceDocuments for the jurisdiction that have an official_url
    const docs: any[] = [];
    let cursor: string | undefined;
    do {
      const page = await base44.asServiceRole.entities.PermittingSourceDocument.filter(
        { jurisdiction_name: jurisdictionName, official_url: { $exists: true } },
        { sort: "id", limit: 200, fields: ["id", "title", "official_url", "source_type", "authority_classification", "file_hash_sha256", "jurisdiction_id", "file_bytes"], ...(cursor ? { cursor } : {}) },
      );
      docs.push(...page.items);
      cursor = page.next_cursor;
    } while (cursor && page_has_more(page));

    // Load existing monitor rows to skip duplicates
    const existingMonitors: any[] = [];
    let mCursor: string | undefined;
    do {
      const mPage = await base44.asServiceRole.entities.SourceMonitorState.filter(
        { jurisdiction_name: jurisdictionName },
        { sort: "id", limit: 500, fields: ["id", "source_document_id"], ...(mCursor ? { cursor: mCursor } : {}) },
      );
      existingMonitors.push(...mPage.items);
      mCursor = mPage.next_cursor;
    } while (mCursor && page_has_more(mPage));

    const existingSourceIds = new Set(existingMonitors.map((m) => m.source_document_id));

    let created = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    for (const doc of docs) {
      if (!doc.official_url) { skipped++; continue; }
      if (existingSourceIds.has(doc.id)) { skipped++; continue; }

      const cadence = defaultCadence(doc.source_type, doc.authority_classification);
      await base44.asServiceRole.entities.SourceMonitorState.create({
        source_document_id: doc.id,
        jurisdiction_name: jurisdictionName,
        jurisdiction_id: doc.jurisdiction_id || "",
        official_url: doc.official_url,
        source_title: doc.title || "",
        source_type: doc.source_type || "",
        authority_classification: doc.authority_classification || "",
        check_method: "hash",
        last_known_hash: doc.file_hash_sha256 || "",
        last_known_content_length: doc.file_bytes || 0,
        last_successful_check: nowIso,
        schedule_cadence: cadence,
        next_check_due: computeNextCheckDue(cadence, nowIso),
        monitor_enabled: monitorEnabled,
        failure_count: 0,
        may_affect_regulatory_data: false,
        staff_review_required: false,
      });
      created++;
    }

    return Response.json({
      success: true,
      jurisdiction: jurisdictionName,
      docs_found: docs.length,
      monitors_created: created,
      already_existed: skipped,
      monitor_enabled: monitorEnabled,
    });
  } catch (error) {
    console.error("sourceMonitorSeed error:", error?.message || error);
    return Response.json({ error: "Source monitor seed could not complete" }, { status: 500 });
  }
});

function page_has_more(page: any): boolean {
  return Boolean(page?.has_more);
}