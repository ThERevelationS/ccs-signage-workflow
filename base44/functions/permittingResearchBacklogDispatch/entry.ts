import {continueDiscoveryBacklog} from '../../shared/permittingDiscoveryContinuation.mjs';
import {readPermittingResourceResponse} from '../../shared/permittingResourceResponse.mjs';
import {invalidateVerifiedJurisdictionAfterResearch} from '../../shared/jurisdictionVerification.ts';
import {RESEARCH_FETCH_TIMEOUT_MS} from '../../shared/jurisdictionResearchArchiveBudget.mjs';
import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  classifyBacklogRows,
  ohioFirstResearchRows,
  jurisdictionProfileTypeForQueueRow,
  profileHasResearchEvidence,
  resolveResearchProfile,
} from "../../shared/permittingResearchBacklog.mjs";
import {
  PERMITTING_RESEARCH_CONFIG_KEY,
  PERMITTING_RESEARCH_STATE_KEY,
  normalizePermittingResearchConfig,
  normalizedResearchState,
  researchCycleDecision,
} from "../../shared/permittingResearchDispatchConfig.mjs";

import { continueJurisdictionArchiveBacklog } from "../../shared/jurisdictionArchiveContinuation.mjs";
import { safeExternalFetch } from "../../shared/safeExternalFetch.ts";
import { continueSourceTextBacklog, automaticSourceTextGuard } from "../../shared/jurisdictionSourceTextContinuation.mjs";

const DISPATCH_VERSION = "continuous_v3_local_research";
const PAGE_SIZE = 500;

async function loadSingleton(entity: any, settingKey: string) {
  const rows = await entity.filter({ setting_key: settingKey }, "created_date", 2, 0);
  if (!Array.isArray(rows)) throw new Error("GlobalSettings lookup failed for " + settingKey + ".");
  if (rows.length > 1) throw new Error("Duplicate GlobalSettings rows exist for " + settingKey + ".");
  return rows[0] || null;
}

async function saveState(entity: any, loaded: any, settingValue: any) {
  if (loaded?.id) {
    const version = String(loaded.updated_date || "").trim();
    if (!version) throw new Error("Research dispatcher state is missing its version.");
    const result = await entity.updateMany(
      { id: loaded.id, updated_date: version, setting_key: PERMITTING_RESEARCH_STATE_KEY },
      { $set: { setting_value: settingValue } },
    );
    if (result?.updated !== 1) throw new Error("Research dispatcher state changed concurrently.");
    return;
  }

  const before = await entity.filter({ setting_key: PERMITTING_RESEARCH_STATE_KEY }, "created_date", 2, 0);
  if (!Array.isArray(before)) throw new Error("Research dispatcher state could not be verified before create.");
  if (before.length > 0) throw new Error("Research dispatcher state was created concurrently.");
  await entity.create({ setting_key: PERMITTING_RESEARCH_STATE_KEY, setting_value: settingValue });
}

async function loadAll(entity: any, query: any, sort = "created_date") {
  const rows: any[] = [];
  let skip = 0;
  while (true) {
    const page = await entity.filter(query, sort, PAGE_SIZE, skip);
    if (!Array.isArray(page)) throw new Error("Paged Base44 entity read failed.");
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return rows;
}

function matchingProfilesForRow(row: any, profiles: any[]) {
  const name = String(row?.jurisdiction_name || "").trim().toLowerCase();
  const state = String(row?.state || "").trim().toLowerCase();
  return profiles.filter((profile) =>
    String(profile?.name || "").trim().toLowerCase() === name &&
    String(profile?.state || "").trim().toLowerCase() === state
  );
}

async function ensureProfileForQueueRow(row: any, profiles: any[], Profiles: any) {
  const resolution = resolveResearchProfile(row, profiles);
  if (resolution.conflict) throw new Error("Existing locality identity is conflicting or duplicated; admin review required before research or profile creation.");
  const existing = resolution.profile;
  if (existing) return { profile: existing, created: false };

  const now = new Date().toISOString();
  const parentCountyName = String(row?.parent_county_name || "").trim();
  const created = await Profiles.create({
    name: String(row?.jurisdiction_name || "").trim(),
    state: String(row?.state || "").trim().toUpperCase(),
    type: jurisdictionProfileTypeForQueueRow(row),
    auto_refresh: true,
    verification_status: "needs_verification",
    ...(parentCountyName ? { parent_county: { name: parentCountyName } } : {}),
    activity_log: [{
      id: crypto.randomUUID(),
      action: "created",
      description: "Created automatically from the credit-controlled permitting research backlog.",
      user: "system:permittingResearchBacklogDispatch",
      timestamp: now,
      changes: { source_queue_id: String(row?.id || "") },
    }],
  });
  profiles.push(created);
  return { profile: created, created: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const manual = body?.manual === true;
    const refreshCapability = String(body?._refresh_capability || "").trim();
    const Queue = base44.asServiceRole.entities.SourceCollectionQueue;
    const Profiles = base44.asServiceRole.entities.JurisdictionProfile;
    const Settings = base44.asServiceRole.entities.GlobalSettings;

    const [configRecord, stateRecord] = await Promise.all([
      loadSingleton(Settings, PERMITTING_RESEARCH_CONFIG_KEY),
      loadSingleton(Settings, PERMITTING_RESEARCH_STATE_KEY),
    ]);

    const config = normalizePermittingResearchConfig(configRecord?.setting_value || {});
    const now = new Date();
    const decision = researchCycleDecision({
      config,
      state: stateRecord?.setting_value || {},
      now,
      manual,
    });

    // Known-file archival needs no research credits and continues after the
    // daily research allowance is exhausted. One file per scheduled cycle.
    let discoveryContinuation: any = null;
    let archiveContinuation: any = null;
    let textContinuation: any = null;
    const elapsedArchiveCycle = now.getTime() - Date.parse(stateRecord?.setting_value?.last_cycle_at || "");
    if (!manual && config.enabled && (!Number.isFinite(elapsedArchiveCycle) || elapsedArchiveCycle >= config.interval_minutes * 60000)) {
      // One saved official page per cycle; no new AI discovery or research debit.
      // Failure cannot suppress independent archive/text/research work.
      try {
        discoveryContinuation = await continueDiscoveryBacklog({entity: Profiles,
          invalidateProfile: invalidateVerifiedJurisdictionAfterResearch,
          fetchPage: async url => {
            const response = await safeExternalFetch(url, {signal: AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS)});
            return {...await readPermittingResourceResponse(response),finalUrl: response.url || url};
          },
        });
      } catch(error) { discoveryContinuation = {success:false,status:'discovery_continuation_failed',llm_calls:0}; }
      archiveContinuation = await continueJurisdictionArchiveBacklog({
        entity: Profiles, catalogEntity: base44.asServiceRole.entities.PermittingSourceDocument, fetchSource: safeExternalFetch,
        uploadFile: data => base44.asServiceRole.integrations.Core.UploadFile(data),
      });
      // Isolate parser loading/failure from the research dispatcher. No LLM call.
      try {
        const { readAndExtractSourcePdf } = await import('../../shared/jurisdictionSourceTextRuntime.ts');
        textContinuation = await continueSourceTextBacklog({
          entity: base44.asServiceRole.entities.PermittingSourceDocument,
          segmentEntity: base44.asServiceRole.entities.PermittingSourceTextSegment,
          readAndExtract: readAndExtractSourcePdf, canAutomaticallyExtract: automaticSourceTextGuard(Profiles),
        });
      } catch (error) {
        textContinuation = { success: false, status: 'text_continuation_failed', error: String(error?.message || error) };
      }
    }

    if (!decision.due) {
      return Response.json({
        success: true,
        skipped: true,
        reason: decision.reason,
        archive_continuation: archiveContinuation,
        text_continuation: textContinuation,
        discovery_continuation: discoveryContinuation,
        config,
        dispatched_today: decision.state.dispatched_today,
        daily_remaining: decision.dailyRemaining,
      });
    }

    const profiles = await loadAll(Profiles, { state: { $in: ["OH", "KY"] } });
    const sourceDiscovery = await loadAll(
      Queue,
      { state: { $in: ["OH", "KY"] }, status: "source_discovery" },
      "-last_activity",
    );

    let reconciledCompleted = 0;
    let reconciledFailed = 0;
    const activeRows: any[] = [];

    for (const row of sourceDiscovery) {
      const resolution = resolveResearchProfile(row, profiles);
      const matchingProfile = resolution.profile;
      if (matchingProfile && profileHasResearchEvidence(matchingProfile)) {
        await Queue.updateMany(
          { id: row.id, status: "source_discovery" },
          {
            $set: {
              status: "sources_found",
              last_activity: now.toISOString(),
              missing_next: "Local Base44 research evidence exists; continue archival/extraction/verification.",
            },
            $unset: {
              research_dispatch_token: "",
              research_request_id: "",
              research_requested_at: "",
            },
          },
        );
        reconciledCompleted += 1;
        continue;
      }

      if (matchingProfile) {
        const attempts = Math.max(0, Number(row?.research_dispatch_attempts) || 0);
        const blocked = attempts >= config.retry_limit;
        await Queue.updateMany(
          { id: row.id, status: "source_discovery" },
          {
            $set: {
              status: blocked ? "blocked" : "not_started",
              last_activity: now.toISOString(),
              missing_next: blocked
                ? "Local research reached the configured retry limit; admin review required."
                : "Placeholder profile has no research evidence yet; eligible for a controlled local retry.",
            },
            $unset: {
              research_dispatch_token: "",
              research_request_id: "",
              research_requested_at: "",
            },
          },
        );
        reconciledFailed += 1;
        continue;
      }

      // Preserve unmatched legacy external requests as active so migration does
      // not accidentally duplicate research that may still be running.
      activeRows.push(row);
    }

    const inFlightCount = activeRows.length;
    const dailyRemaining = Math.max(0, config.daily_dispatch_limit - decision.state.dispatched_today);
    const dispatchLimit = Math.min(config.max_dispatch_per_cycle, dailyRemaining);

    const backlog = await loadAll(
      Queue,
      { state: { $in: ["OH", "KY"] }, status: "not_started" },
      "created_date",
    );

    const researchedProfiles = profiles.filter(profileHasResearchEvidence);
    const plan = classifyBacklogRows({
      queueRows: backlog,
      profiles: researchedProfiles,
      identityProfiles: profiles,
      inFlightCount,
      inFlightTarget: config.max_in_flight,
      maxDispatchPerRun: dispatchLimit,
    });

    if (plan.reconcile.length) {
      const ids = plan.reconcile.map((row: any) => row.id);
      await Queue.updateMany(
        { id: { $in: ids }, status: "not_started" },
        {
          $set: {
            status: "sources_found",
            missing_next: "Existing JurisdictionProfile found; continue source archival/extraction/verification from the existing profile.",
            last_activity: now.toISOString(),
          },
        },
      );
    }

    const runToken = crypto.randomUUID();
    const targetIds = plan.dispatch.map((row: any) => row.id);
    if (targetIds.length) {
      await Queue.updateMany(
        { id: { $in: targetIds }, status: "not_started" },
        {
          $set: {
            status: "source_discovery",
            research_dispatch_version: DISPATCH_VERSION,
            research_dispatch_token: runToken,
            last_activity: now.toISOString(),
            missing_next: "Reserved for cost-controlled Base44 Permitting Research dispatch.",
          },
          $inc: { research_dispatch_attempts: 1 },
        },
      );
    }

    const reserved = targetIds.length
      ? await Queue.filter(
          { research_dispatch_token: runToken, status: "source_discovery" },
          "created_date",
          config.max_dispatch_per_cycle,
          0,
        )
      : [];

    let attempted = 0;
    let dispatched = 0;
    const failures: Array<{ id: string; jurisdiction_name: string; error: string }> = [];

    for (const row of ohioFirstResearchRows(reserved)) {
      attempted += 1;
      try {
        const { profile } = await ensureProfileForQueueRow(row, profiles, Profiles);
        const refreshArgs: Record<string, unknown> = { jurisdiction_id: profile.id, defer_archive: true };
        if (refreshCapability) refreshArgs._workflow_capability = refreshCapability;

        const refreshResponse = await base44.functions.invoke("refreshJurisdiction", refreshArgs);
        const refreshResult = refreshResponse?.data || refreshResponse;
        if (!refreshResult?.success) {
          throw new Error(String(refreshResult?.error || "Local jurisdiction research did not complete successfully."));
        }

        const researchedProfile = refreshResult?.jurisdiction?.id
          ? refreshResult.jurisdiction
          : await Profiles.get(profile.id);
        const hasEvidence = profileHasResearchEvidence(researchedProfile);
        const completedAt = new Date().toISOString();
        const result = await Queue.updateMany(
          { id: row.id, status: "source_discovery", research_dispatch_token: runToken },
          {
            $set: {
              status: hasEvidence ? "sources_found" : "partial_gaps",
              research_requested_at: completedAt,
              last_activity: completedAt,
              missing_next: hasEvidence
                ? "Local Base44 research completed; continue source archival/extraction/verification."
                : "Local Base44 research completed but returned no usable research evidence; admin review required.",
            },
            $unset: {
              research_dispatch_token: "",
              research_request_id: "",
            },
          },
        );
        if (result?.updated !== 1) {
          throw new Error("Queue reservation changed before local research outcome could be persisted.");
        }
        dispatched += 1;
      } catch (error) {
        const message = String(error?.message || "Unknown local research error").slice(0, 500);
        failures.push({
          id: String(row?.id || ""),
          jurisdiction_name: String(row?.jurisdiction_name || ""),
          error: message,
        });
        const attempts = Math.max(1, Number(row?.research_dispatch_attempts) || 1);
        const blocked = attempts >= config.retry_limit;
        await Queue.updateMany(
          { id: row.id, status: "source_discovery", research_dispatch_token: runToken },
          {
            $set: {
              status: blocked ? "blocked" : "not_started",
              last_activity: new Date().toISOString(),
              missing_next: blocked
                ? "Local research reached the configured retry limit; admin review required: " + message
                : "Local research failed safely and will retry within configured limits: " + message,
            },
            $unset: {
              research_dispatch_token: "",
              research_request_id: "",
              research_requested_at: "",
            },
          },
        );
      }
    }

    const previous = normalizedResearchState(stateRecord?.setting_value || {}, now);
    const nextState = {
      last_cycle_at: now.toISOString(),
      daily_day_key: previous.daily_day_key,
      dispatched_today: previous.dispatched_today + attempted,
      last_result: {
        at: now.toISOString(),
        manual,
        in_flight_before: inFlightCount,
        backlog_before: backlog.length,
        identity_conflicts: plan.conflicts.length,
        reconciled_existing_profiles: plan.reconcile.length,
        reconciled_completed: reconciledCompleted,
        reconciled_failed: reconciledFailed,
        attempted,
        dispatched,
        failed: failures.length,
      },
    };

    await saveState(Settings, stateRecord, nextState);

    return Response.json({
      success: failures.length === 0,
      archive_continuation: archiveContinuation,
        text_continuation: textContinuation,
        discovery_continuation: discoveryContinuation,
      config,
      state: nextState,
      in_flight_before: inFlightCount,
      backlog_before: backlog.length,
      reconciled_existing_profiles: plan.reconcile.length,
      reconciled_completed: reconciledCompleted,
      reconciled_failed: reconciledFailed,
      attempted,
      dispatched,
      failed: failures.length,
      failures,
    });
  } catch (error) {
    console.error("permittingResearchBacklogDispatch error:", error?.message || error);
    return Response.json(
      { error: error?.message || "Permitting research backlog dispatch failed safely." },
      { status: 500 },
    );
  }
});
