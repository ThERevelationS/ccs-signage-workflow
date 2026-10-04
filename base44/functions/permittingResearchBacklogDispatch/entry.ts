import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  classifyBacklogRows,
  researchRequestPayload,
} from "../../shared/permittingResearchBacklog.mjs";

const PERMITTING_APP_ID = "69b1840cf75aba55e115d020";
const PERMITTING_API_KEY = Deno.env.get("PERMITTING_API_KEY") || "";
const DISPATCH_VERSION = "continuous_v1";
const DEFAULT_IN_FLIGHT_TARGET = 250;
const DEFAULT_MAX_DISPATCH_PER_RUN = 50;
const MAX_IN_FLIGHT_TARGET = 500;
const MAX_PER_RUN = 100;
const CANDIDATE_PAGE_SIZE = 500;

const boundedInteger = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

async function loadAllProfiles(entity: any) {
  const rows: any[] = [];
  for (let skip = 0; skip < 10000; skip += 500) {
    const page = await entity.filter({ state: { $in: ["OH", "KY"] } }, "created_date", 500, skip);
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
}

async function createResearchRequest(row: any) {
  const response = await fetch(`https://app.base44.com/api/apps/${PERMITTING_APP_ID}/entities/ResearchRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api_key": PERMITTING_API_KEY,
    },
    body: JSON.stringify(researchRequestPayload(row)),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Permitting Research returned HTTP ${response.status}.`);

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
    if (!PERMITTING_API_KEY) {
      return Response.json({ error: "Permitting research service is not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const inFlightTarget = boundedInteger(body?.in_flight_target, DEFAULT_IN_FLIGHT_TARGET, MAX_IN_FLIGHT_TARGET);
    const maxDispatchPerRun = boundedInteger(body?.max_dispatch_per_run, DEFAULT_MAX_DISPATCH_PER_RUN, MAX_PER_RUN);
    const Queue = base44.asServiceRole.entities.SourceCollectionQueue;
    const Profiles = base44.asServiceRole.entities.JurisdictionProfile;

    const inFlight = await Queue.filter(
      { state: { $in: ["OH", "KY"] }, status: "source_discovery" },
      "-last_activity",
      inFlightTarget,
      0,
    );
    const inFlightCount = inFlight.length;

    const candidates = await Queue.filter(
      { state: { $in: ["OH", "KY"] }, status: "not_started" },
      "created_date",
      CANDIDATE_PAGE_SIZE,
      0,
    );
    if (candidates.length === 0) {
      return Response.json({ success: true, done: true, in_flight: inFlightCount, dispatched: 0, reconciled: 0 });
    }

    const profiles = await loadAllProfiles(Profiles);
    const plan = classifyBacklogRows({
      queueRows: candidates,
      profiles,
      inFlightCount,
      inFlightTarget,
      maxDispatchPerRun,
    });

    if (plan.reconcile.length) {
      const ids = plan.reconcile.map((row: any) => row.id);
      await Queue.updateMany(
        { id: { $in: ids }, status: "not_started" },
        {
          $set: {
            status: "sources_found",
            missing_next: "Existing JurisdictionProfile found; continue source archival/extraction/verification from the existing profile.",
            last_activity: new Date().toISOString(),
          },
        },
      );
    }

    if (plan.dispatch.length === 0) {
      return Response.json({
        success: true,
        done: false,
        at_capacity: plan.atCapacity,
        in_flight: inFlightCount,
        in_flight_target: inFlightTarget,
        dispatched: 0,
        reconciled: plan.reconcile.length,
      });
    }

    const runToken = crypto.randomUUID();
    const reservedAt = new Date().toISOString();
    const targetIds = plan.dispatch.map((row: any) => row.id);
    await Queue.updateMany(
      { id: { $in: targetIds }, status: "not_started" },
      {
        $set: {
          status: "source_discovery",
          research_dispatch_version: DISPATCH_VERSION,
          research_dispatch_token: runToken,
          last_activity: reservedAt,
          missing_next: "Reserved for Base44 Permitting Research dispatch.",
        },
        $inc: { research_dispatch_attempts: 1 },
      },
    );

    const reserved = await Queue.filter(
      { research_dispatch_token: runToken, status: "source_discovery" },
      "created_date",
      maxDispatchPerRun,
      0,
    );

    let dispatched = 0;
    const failures: Array<{ id: string; jurisdiction_name: string; error: string }> = [];

    for (const row of reserved) {
      try {
        const requestId = await createResearchRequest(row);
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
        if (result?.updated !== 1) throw new Error("Queue reservation changed before request id could be persisted.");
        dispatched += 1;
      } catch (error) {
        const message = String(error?.message || "Unknown dispatch error").slice(0, 500);
        failures.push({ id: row.id, jurisdiction_name: row.jurisdiction_name, error: message });
        await Queue.updateMany(
          { id: row.id, status: "source_discovery", research_dispatch_token: runToken },
          {
            $set: {
              status: "not_started",
              last_activity: new Date().toISOString(),
              missing_next: `Research dispatch failed safely and will retry: ${message}`,
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

    return Response.json({
      success: failures.length === 0,
      done: false,
      in_flight_before: inFlightCount,
      in_flight_target: inFlightTarget,
      max_dispatch_per_run: maxDispatchPerRun,
      reconciled: plan.reconcile.length,
      reserved: reserved.length,
      dispatched,
      failed: failures.length,
      failures,
    });
  } catch (error) {
    console.error("permittingResearchBacklogDispatch error:", error?.message || error);
    return Response.json({ error: "Permitting research backlog dispatch failed safely." }, { status: 500 });
  }
});
