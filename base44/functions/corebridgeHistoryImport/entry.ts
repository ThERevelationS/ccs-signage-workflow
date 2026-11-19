import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";

const clean = (value: any) => String(value ?? "").trim();
const bad = (message: string, status = 400) => Object.assign(new Error(message), { statusCode: status });
const allowed = new Set(["Invoice", "Payment", "ReconciliationBatch"]);

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");
    if (clean(user?.role) !== "admin") throw bad("Only administrators can run data migrations.", 403);

    if (action === "lookup_links") {
      if (!Array.isArray(body?.estimate_ids) || body.estimate_ids.length > 200) throw bad("estimate_ids must be an array of at most 200 items.");
      const ids = [...new Set(body.estimate_ids.map(clean).filter(Boolean))];
      if (!ids.length) return Response.json({ success: true, action, links: [] });
      const estimates = await base44.asServiceRole.entities.AllInOneEstimate.filter({ id: { $in: ids } }, null, 5000);
      const jobs = await base44.asServiceRole.entities.WorkOrder.filter({ estimate_id: { $in: ids } }, null, 5000);
      if (!Array.isArray(estimates) || !Array.isArray(jobs) || estimates.length >= 5000 || jobs.length >= 5000) throw bad("Link lookup could not be completed.", 500);
      const byId = new Map(estimates.map((row: any) => [clean(row.id), row]));
      const links = ids.map((id) => ({
        estimate_id: id,
        customer_id: clean((byId.get(id) as any)?.customer_id),
        work_order_ids: jobs.filter((job: any) => clean(job.estimate_id) === id).map((job: any) => clean(job.id)).filter(Boolean),
      }));
      return Response.json({ success: true, action, links });
    }

    const entityName = clean(body?.entity);
    if (!allowed.has(entityName)) throw bad("Unsupported entity.");
    const entity = (base44.asServiceRole.entities as any)[entityName];
    const maps = base44.asServiceRole.entities.LegacyMigrationMap;

    if (action === "find_by_keys") {
      if (!Array.isArray(body?.keys) || body.keys.length > 50) throw bad("keys must be an array of at most 50 items.");
      const keys = [...new Set(body.keys.map(clean))];
      if (keys.some((key) => !key.startsWith("cb:"))) throw bad("Every key must start with cb:.");
      const rows = keys.length ? await entity.filter({ creation_request_key: { $in: keys } }, null, 5000) : [];
      if (!Array.isArray(rows) || rows.length >= 5000) throw bad("Target lookup could not be completed.", 500);
      return Response.json({ success: true, action, entity: entityName, results: keys.map((key) => ({
        key,
        matches: rows.filter((row: any) => clean(row.creation_request_key) === key),
      })) });
    }

    if (action === "write_rows") {
      const batchId = clean(body?.batch_id);
      if (!batchId) throw bad("batch_id is required.");
      if (!Array.isArray(body?.rows) || body.rows.length > 25) throw bad("rows must be an array of at most 25 items.");
      const sourceGroups = new Map<string, string[]>();
      const keyList: string[] = [];
      for (const row of body.rows) {
        const sourceEntity = clean(row?.source_entity);
        const sourceId = clean(row?.source_id);
        const key = clean(row?.data?.creation_request_key);
        if (sourceEntity && sourceId) sourceGroups.set(sourceEntity, [...(sourceGroups.get(sourceEntity) || []), sourceId]);
        if (key.startsWith("cb:")) keyList.push(key);
      }
      const mapRows: any[] = [];
      for (const [sourceEntity, ids] of sourceGroups) {
        const found = await maps.filter({ source_app_id: "corebridge", source_entity: sourceEntity, source_id: { $in: [...new Set(ids)] } }, null, 5000);
        if (!Array.isArray(found) || found.length >= 5000) throw bad("Migration map lookup failed.", 500);
        mapRows.push(...found);
      }
      const targetRows = keyList.length ? await entity.filter({ creation_request_key: { $in: [...new Set(keyList)] } }, null, 5000) : [];
      if (!Array.isArray(targetRows) || targetRows.length >= 5000) throw bad("Target lookup failed.", 500);
      const results = [];
      const processedSources = new Set<string>();
      const processedKeys = new Set<string>();
      for (const row of body.rows) {
        const sourceId = clean(row?.source_id);
        const sourceEntity = clean(row?.source_entity);
        const result: any = { source_id: sourceId, status: "error", target_id: "", error: "", ambiguous: false };
        try {
          if (!sourceId || !sourceEntity) throw bad("source_entity and source_id are required.");
          if (!row?.data || typeof row.data !== "object" || Array.isArray(row.data)) throw bad("data must be an object.");
          const key = clean(row.data.creation_request_key);
          if (!key.startsWith("cb:")) throw bad("creation_request_key must start with cb:.");
          const sourceKey = JSON.stringify([sourceEntity, sourceId]);
          if (processedSources.has(sourceKey) || processedKeys.has(key)) throw bad("Duplicate source or creation key in request.");
          processedSources.add(sourceKey);
          processedKeys.add(key);
          const found = mapRows.filter((item: any) => clean(item.source_entity) === sourceEntity && clean(item.source_id) === sourceId);
          const createdMaps = found.filter((item: any) => {
            try { return JSON.parse(clean(item?.notes)).status === "created"; } catch { return false; }
          });
          if (createdMaps.length > 1) throw bad("Duplicate migration map rows.", 409);
          if (createdMaps.length) {
            const map = createdMaps[0];
            if (clean(map.target_entity) !== entityName || !clean(map.target_id)) throw bad("Migration map target is invalid.", 409);
            result.status = "existing";
            result.target_id = clean(map.target_id);
            results.push(result);
            continue;
          }
          if (found.length) throw bad("Source already has a non-created migration map row.", 409);
          const targets = targetRows.filter((item: any) => clean(item.creation_request_key) === key);
          if (targets.length > 1) throw bad("Duplicate creation_request_key.", 409);
          if (body.adopt === true && !targets.length) throw bad("No existing target to adopt.", 404);
          let target = targets[0];
          if (!target) {
            result.ambiguous = true;
            target = await entity.create(row.data);
            targetRows.push(target);
          }
          const targetId = clean(target?.id);
          if (!targetId) throw bad("create returned no record id.", 500);
          result.ambiguous = true;
          const map = await maps.create({
            source_app_id: "corebridge",
            source_entity: sourceEntity,
            source_id: sourceId,
            target_entity: entityName,
            target_id: targetId,
            migration_batch: batchId,
            source_created_date: "",
            source_updated_date: "",
            notes: JSON.stringify({ status: "created", at: new Date().toISOString() }),
          });
          mapRows.push(map);
          result.status = targets.length ? "existing" : "created";
          result.target_id = targetId;
          result.ambiguous = false;
        } catch (error: any) {
          result.error = clean(error?.message || "Row import failed.");
        }
        results.push(result);
      }
      return Response.json({ success: true, action, entity: entityName, results });
    }

    if (action === "get_rows") {
      if (!Array.isArray(body?.ids) || body.ids.length > 50) throw bad("ids must be an array of at most 50 items.");
      const results = [];
      for (const rawId of body.ids) {
        const id = clean(rawId);
        try {
          if (!id) throw bad("id is required.");
          const item = await entity.get(id);
          results.push({ id, item: item || null, error: "" });
        } catch (error: any) {
          results.push({ id, item: null, error: clean(error?.message || "Read failed.") });
        }
      }
      return Response.json({ success: true, action, entity: entityName, results });
    }

    if (action === "update_rows") {
      if (!Array.isArray(body?.rows) || body.rows.length > 25) throw bad("rows must be an array of at most 25 items.");
      const results = [];
      for (const row of body.rows) {
        const id = clean(row?.id);
        try {
          if (!id || !row?.set || typeof row.set !== "object" || Array.isArray(row.set)) throw bad("id and set are required.");
          if (Object.hasOwn(row.set, "creation_request_key")) throw bad("creation_request_key cannot be changed.");
          const current = await entity.get(id);
          if (!clean(current?.creation_request_key).startsWith("cb:")) throw bad("Only CoreBridge records can be updated.", 403);
          const item = await entity.update(id, row.set);
          results.push({ id, status: "updated", item, error: "" });
        } catch (error: any) {
          results.push({ id, status: "error", error: clean(error?.message || "Update failed.") });
        }
      }
      return Response.json({ success: true, action, entity: entityName, results });
    }
    throw bad(`Unsupported action: ${action}`);
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 423, 429, 503].includes(status) ? status : 500;
    return Response.json({ success: false, error: clean(error?.message || "Migration action failed.") }, { status: safeStatus });
  }
});
