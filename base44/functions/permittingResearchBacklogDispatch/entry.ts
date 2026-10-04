import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  classifyBacklogRows,
  profileMatchesQueueRow,
  researchRequestPayload,
} from "../../shared/permittingResearchBacklog.mjs";
import {
  PERMITTING_RESEARCH_CONFIG_KEY,
  PERMITTING_RESEARCH_STATE_KEY,
  normalizePermittingResearchConfig,
  normalizedResearchState,
  researchCycleDecision,
} from "../../shared/permittingResearchDispatchConfig.mjs";

const PERMITTING_APP_ID = "69b1840cf75aba55e115d020";
const PERMITTING_ACCESS_TOKEN = Deno.env.get("PERMITTING_ACCESS_TOKEN") || "";
const DISPATCH_VERSION = "continuous_v2_cost_controlled";
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

function researchAuthorization(req: Request) {
  const configured = String(PERMITTING_ACCESS_TOKEN || "").trim();
  if (configured) return "Bearer " + configured;

  const incoming = String(req.headers.get("authorization") || "").trim();
  if (/^Bearer\s+\S+/i.test(incoming)) return incoming;

  return "";
}

async function researchRequestById(id: string, authorization: string) {
  const response = await fetch(
    "https://app.base44.com/api/apps/" + PERMITTING_APP_ID + "/entities/ResearchRequest/" + encodeURIComponent(id),
    { headers: { "Authorization": authorization } },
  );
  if (!response.ok) throw new Error("ResearchRequest poll returned HTTP " + response.status + ".");
  return await response.json();
}

async function createResearchRequest(row: any, authorization: string) {
  const response = await fetch(
    "https://app.base44.com/api/apps/" + PERMITTING_APP_ID + "/entities/ResearchRequest",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authorization,
      },
      body: JSON.stringify(researchRequestPayload(row)),
    },
  );

  const text = await response.text();
  if (!response.ok) throw new Error("Permitting Research returned HTTP " + response.status + ".");

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Permitting Research returned a non-JSON create response.");
  }

  const id = String(data?.id || data?.entity?.id || data?.record?.id || "").trim();
  if (!id) throw new Error("Permitting Research create response did not include a ResearchRequest id.");
  return id;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }
    const researchAuth = researchAuthorization(req);
    if (!researchAuth) {
      return Response.json({ error: "Permitting research authorization is unavailable" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const manual = body?.manual === true;
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

    if (!decision.due) {
      return Response.json({
        success: true,
        skipped: true,
        reason: decision.reason,
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
      const matches = matchingProfilesForRow(row, profiles);
      if (matches.some((profile) => profileMatchesQueueRow(row, profile, matches))) {
        await Queue.updateMany(
          { id: row.id, status: "source_discovery" },
          {
            $set: {
              status: "sources_found",
              last_activity: now.toISOString(),
              missing_next: "JurisdictionProfile exists; continue source archival/extraction/verification.",
            },
            $unset: { research_dispatch_token: "" },
          },
        );
        reconciledCompleted += 1;
        continue;
      }

      const requestId = String(row?.research_request_id || "").trim();
      if (!requestId) {
        continue;
      }

      let request;
      try {
        request = await researchRequestById(requestId, researchAuth);
      } catch {
        activeRows.push(row);
        continue;
      }

      if (request?.status === "failed") {
        const attempts = Math.max(0, Number(row?.research_dispatch_attempts) || 0);
        const blocked = attempts >= config.retry_limit;
        await Queue.updateMany(
          { id: row.id, status: "source_discovery", research_request_id: requestId },
          {
            $set: {
              status: blocked ? "blocked" : "not_started",
              last_activity: now.toISOString(),
              missing_next: blocked
                ? "Research reached the configured retry limit; admin review required before retrying."
                : "Research failed safely; eligible for a later controlled retry.",
            },
            $unset: {
              research_request_id: "",
              research_requested_at: "",
              research_dispatch_token: "",
            },
          },
        );
        reconciledFailed += 1;
        continue;
      }

      if (request?.status === "completed") {
        await Queue.updateMany(
          { id: row.id, status: "source_discovery", research_request_id: requestId },
          {
            $set: {
              status: "partial_gaps",
              last_activity: now.toISOString(),
              missing_next: "Research completed but no matching JurisdictionProfile was found; review write-back before retrying.",
            },
            $unset: { research_dispatch_token: "" },
          },
        );
        reconciledCompleted += 1;
        continue;
      }

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

    const plan = classifyBacklogRows({
      queueRows: backlog,
      profiles,
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

    let dispatched = 0;
    const failures: Array<{ id: string; jurisdiction_name: string; error: string }> = [];

    for (const row of reserved) {
      try {
        const requestId = await createResearchRequest(row, researchAuth);
        const completedAt = new Date().toISOString();
        const result = await Queue.updateMany(
          { id: row.id, status: "source_discovery", research_dispatch_token: runToken },
          {
            $set: {
              research_request_id: requestId,
              research_requested_at: completedAt,
              last_activity: completedAt,
              missing_next: "Queued in Base44 Permitting Research; awaiting official-source discovery and profile write-back.",
            },
            $unset: { research_dispatch_token: "" },
          },
        );
        if (result?.updated !== 1) {
          throw new Error("Queue reservation changed before request id could be persisted.");
        }
        dispatched += 1;
      } catch (error) {
        const message = String(error?.message || "Unknown dispatch error").slice(0, 500);
        failures.push({
          id: String(row?.id || ""),
          jurisdiction_name: String(row?.jurisdiction_name || ""),
          error: message,
        });
        await Queue.updateMany(
          { id: row.id, status: "source_discovery", research_dispatch_token: runToken },
          {
            $set: {
              status: "not_started",
              last_activity: new Date().toISOString(),
              missing_next: "Research dispatch failed safely and will retry within configured limits: " + message,
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
      dispatched_today: previous.dispatched_today + dispatched,
      last_result: {
        at: now.toISOString(),
        manual,
        in_flight_before: inFlightCount,
        backlog_before: backlog.length,
        reconciled_existing_profiles: plan.reconcile.length,
        reconciled_completed: reconciledCompleted,
        reconciled_failed: reconciledFailed,
        dispatched,
        failed: failures.length,
      },
    };

    await saveState(Settings, stateRecord, nextState);

    return Response.json({
      success: failures.length === 0,
      config,
      state: nextState,
      in_flight_before: inFlightCount,
      backlog_before: backlog.length,
      reconciled_existing_profiles: plan.reconcile.length,
      reconciled_completed: reconciledCompleted,
      reconciled_failed: reconciledFailed,
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
