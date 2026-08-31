import { base44 } from "@/api/base44Client";
import { ensureEstimateBuilderProducts } from "@/components/estimator/builder/builderService";

const APP_ID = "68dfcc5e57bbbc35387da97c";
const MIGRATION_BATCH = "builder_bom_backfill_v1";
const COMPLETE_SENTINEL = "__builder_bom_backfill_v1_complete__";
const LOCAL_LOCK_KEY = "ccs_estimator_builder_bom_backfill_v1_lock";
const LOCAL_LOCK_TTL_MS = 10 * 60 * 1000;

const nowIso = () => new Date().toISOString();

function fullyBackfilled(estimate) {
  return (estimate?.line_items || []).every((line) => !!line.line_id && !!line.builder_product_id);
}

async function verifyBuilderLinks(estimate) {
  if (!fullyBackfilled(estimate)) return false;
  const products = await base44.entities.BuilderProduct.filter({ estimate_id: estimate.id }).catch(() => []);
  const productIds = new Set((products || []).map((product) => product.id));
  return (estimate?.line_items || []).every((line) => productIds.has(line.builder_product_id));
}

function acquireLocalLock() {
  try {
    const raw = window.localStorage.getItem(LOCAL_LOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.started_at && Date.now() - Number(parsed.started_at) < LOCAL_LOCK_TTL_MS) return false;
    }
    window.localStorage.setItem(LOCAL_LOCK_KEY, JSON.stringify({ started_at: Date.now() }));
    return true;
  } catch {
    return true;
  }
}

function releaseLocalLock() {
  try {
    window.localStorage.removeItem(LOCAL_LOCK_KEY);
  } catch {
    // Browser storage is only a same-browser duplicate-run guard; the database
    // migration map remains the authoritative resumability record.
  }
}

async function migrationRows() {
  return base44.entities.LegacyMigrationMap.filter({ migration_batch: MIGRATION_BATCH }).catch(() => []);
}

function completedEstimateIds(rows) {
  return new Set(
    (rows || [])
      .filter((row) => row.source_entity === "AllInOneEstimate" && row.source_id && row.source_id !== COMPLETE_SENTINEL)
      .map((row) => row.source_id)
  );
}

function hasCompleteMarker(rows) {
  return (rows || []).some((row) => row.source_id === COMPLETE_SENTINEL && row.migration_batch === MIGRATION_BATCH);
}

async function markEstimateComplete(estimate) {
  const builderIds = (estimate?.line_items || []).map((line) => line.builder_product_id).filter(Boolean);
  await base44.entities.LegacyMigrationMap.create({
    source_app_id: APP_ID,
    source_entity: "AllInOneEstimate",
    source_id: estimate.id,
    target_entity: "AllInOneEstimate",
    target_id: estimate.id,
    source_created_date: estimate.created_date || "",
    source_updated_date: estimate.updated_date || "",
    migration_batch: MIGRATION_BATCH,
    notes: JSON.stringify({
      completed_at: nowIso(),
      line_count: (estimate.line_items || []).length,
      builder_product_ids: builderIds,
      mode: "legacy_frozen_builder_bom_backfill",
    }),
  });
}

async function markBatchComplete(estimates, processedCount) {
  await base44.entities.LegacyMigrationMap.create({
    source_app_id: APP_ID,
    source_entity: "AllInOneEstimate",
    source_id: COMPLETE_SENTINEL,
    target_entity: "AllInOneEstimate",
    target_id: COMPLETE_SENTINEL,
    source_created_date: "",
    source_updated_date: "",
    migration_batch: MIGRATION_BATCH,
    notes: JSON.stringify({
      completed_at: nowIso(),
      estimate_count: estimates.length,
      processed_this_run: processedCount,
      behavior: "Existing total_snapshot values remained authoritative legacy frozen prices while Builder Products and BOM Parts were materialized from saved source projects.",
    }),
  });
}

export async function runHistoricalBuilderBackfill({ seedEstimates = [] } = {}) {
  const me = await base44.auth.me().catch(() => null);
  if (me?.role !== "admin") return { ran: false, reason: "admin_only", estimates: seedEstimates };
  if (!acquireLocalLock()) return { ran: false, reason: "already_running", estimates: seedEstimates };

  try {
    let rows = await migrationRows();
    if (hasCompleteMarker(rows)) {
      return { ran: false, reason: "complete", estimates: seedEstimates };
    }

    let processedCount = 0;
    let latestEstimates = seedEstimates?.length
      ? seedEstimates
      : await base44.entities.AllInOneEstimate.list("-created_date", 200);

    // Two passes are intentional. The first handles the snapshot loaded with the
    // Estimator page. The second catches an estimate created while the first pass
    // was running. Every estimate is individually marked only after its entire
    // Product/BOM conversion has succeeded, so an interrupted run resumes safely.
    for (let pass = 0; pass < 2; pass += 1) {
      rows = await migrationRows();
      const doneIds = completedEstimateIds(rows);
      const pending = (latestEstimates || []).filter((estimate) => !doneIds.has(estimate.id));
      if (!pending.length) break;

      for (const estimate of pending) {
        const fresh = await base44.entities.AllInOneEstimate.get(estimate.id);
        const converted = await ensureEstimateBuilderProducts(fresh);
        if (!(await verifyBuilderLinks(converted))) {
          throw new Error(`Historical Product/BOM backfill did not fully materialize estimate ${estimate.id}.`);
        }
        await markEstimateComplete(converted);
        processedCount += 1;
      }

      latestEstimates = await base44.entities.AllInOneEstimate.list("-created_date", 200);
    }

    rows = await migrationRows();
    const doneIds = completedEstimateIds(rows);
    latestEstimates = await base44.entities.AllInOneEstimate.list("-created_date", 200);
    const outstanding = (latestEstimates || []).filter((estimate) => !doneIds.has(estimate.id));
    if (outstanding.length) {
      throw new Error(`Historical Product/BOM backfill still has ${outstanding.length} estimate(s) pending.`);
    }

    // The batch marker is deliberately written last. If anything above fails,
    // there is no completion marker and the next admin visit resumes from the
    // per-estimate migration rows already written.
    await markBatchComplete(latestEstimates || [], processedCount);
    return { ran: true, processedCount, estimates: latestEstimates || [] };
  } finally {
    releaseLocalLock();
  }
}
