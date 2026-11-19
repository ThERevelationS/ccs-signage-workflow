import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";
import { loadAllEntityRows } from "../../shared/pagedEntityRows.ts";
import {
  MIGRATION_MAPPERS,
  getMapper,
  listMappers,
  SOURCE_APP_ID,
  BATCH_MARKER,
  ERROR_TARGET_ID,
  SOURCE_ID_FIELD,
  MAX_ROWS_PER_CALL,
  MAX_SAMPLE_ROWS,
  IDENTITY_FIELDS,
  clean,
  autoMapColumns,
  resolveSourceId,
  applyMappingToRecord,
  coerceRecordTypes,
  validateRecordForMapper,
  buildMappingPreview,
  appendNote,
  parseNumberValue,
} from "../../shared/migrationMappers.ts";

// CoreBridge CSV migration backend. Admin-gated session auth, service-role
// entity writes, LegacyMigrationMap as the resume/dedupe/rollback ledger.
//
// Batch storage: ImportJob's import_type enum cannot represent most migrated
// entities (estimates/invoices/payments/...), so a batch is a string tag:
//   - one LegacyMigrationMap "marker" row per batch
//       source_app_id='corebridge', source_entity='__batch__',
//       source_id=batch_tag, target_entity='__batch__', target_id=batch_tag,
//       migration_batch=batch_tag, notes=JSON metadata
//   - every imported row writes a data map row stamped migration_batch=batch_tag
//       notes=JSON {status: created|updated|skipped_dup|error, error?}
//   - error rows use target_id='__error__' so a retry of the same source_id
//     is not treated as an already-imported duplicate.

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

const list = (v: any) => (Array.isArray(v) ? v : []);

function parseMapNotes(row: any) {
  try {
    const parsed = JSON.parse(clean(row?.notes));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mapRowStatus(row: any) {
  // Status of a data map row — strictly what was recorded in notes. A row
  // with no parseable status returns "" so unimport_batch can never delete a
  // target whose provenance is uncertain (only explicit 'created' deletes).
  return clean(parseMapNotes(row).status);
}

function isErrorMapRow(row: any) {
  return clean(row?.target_id) === ERROR_TARGET_ID || mapRowStatus(row) === "error";
}

function isDuplicateMapRow(row: any) {
  return !!row && !isErrorMapRow(row) && !!clean(row?.target_id);
}

function markerMeta(row: any) {
  return parseMapNotes(row);
}

async function findBatchMarker(MapEntity: any, batchId: string) {
  const rows = await MapEntity.filter({
    source_app_id: SOURCE_APP_ID,
    source_entity: BATCH_MARKER,
    source_id: clean(batchId),
  });
  return list(rows)[0] || null;
}

async function loadBatchMapRows(MapEntity: any, batchId: string) {
  const rows = await loadAllEntityRows({
    entity: MapEntity,
    query: { migration_batch: clean(batchId) },
    sort: "created_date",
    label: "Migration batch map rows",
  });
  return rows.filter((r: any) => clean(r?.source_entity) !== BATCH_MARKER);
}

async function loadSourceIndex(MapEntity: any, sourceEntity: string) {
  const rows = await loadAllEntityRows({
    entity: MapEntity,
    query: { source_app_id: SOURCE_APP_ID, source_entity: clean(sourceEntity) },
    sort: "created_date",
    label: `Migration map rows for ${sourceEntity}`,
  });
  const index = new Map<string, any>();
  for (const row of rows) {
    const sid = clean(row?.source_id);
    if (sid && !index.has(sid)) index.set(sid, row);
  }
  return index;
}

function creationKey(entityKey: string, sourceId: string) {
  return `cb:${entityKey}:${sourceId}`;
}

function tallyCounts(results: any[]) {
  const counts = { created: 0, updated: 0, skipped: 0, errors: 0 };
  for (const r of results) {
    if (r.status === "created") counts.created += 1;
    else if (r.status === "updated") counts.updated += 1;
    else if (r.status === "skipped_dup") counts.skipped += 1;
    else counts.errors += 1;
  }
  return counts;
}

function mergeNumericLeaves(base: any, patch: any): any {
  const out: Record<string, any> = { ...(base && typeof base === "object" ? base : {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (typeof value === "number") {
      out[key] = (typeof out[key] === "number" ? out[key] : 0) + value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = mergeNumericLeaves(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function mergeMarkerStats(MapEntity: any, marker: any, patch: Record<string, any>) {
  try {
    const meta = markerMeta(marker);
    const next = { ...meta, ...patch, updated_at: new Date().toISOString() };
    // Tally-shaped keys accumulate across repeated import_rows calls.
    for (const key of ["counts", "per_entity_counts", "unmapped_columns", "entities_seen"]) {
      if (patch[key] && typeof patch[key] === "object" && !Array.isArray(patch[key])) {
        next[key] = mergeNumericLeaves(meta[key], patch[key]);
      }
    }
    if (patch.recent_errors) {
      next.recent_errors = [...(Array.isArray(meta.recent_errors) ? meta.recent_errors : []), ...patch.recent_errors].slice(-25);
    }
    await MapEntity.update(marker.id, { notes: JSON.stringify(next) });
  } catch (error: any) {
    console.error("manageMigration marker update failed:", error?.message || error);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");
    // Every manageMigration action is admin-gated — imports write core records.
    if (clean(user?.role) !== "admin") throw bad("Only administrators can run data migrations.", 403);

    const MapEntity = base44.asServiceRole.entities.LegacyMigrationMap;
    const entities = base44.asServiceRole.entities as any;

    // ---------------------------------------------------------------------
    if (action === "list_mappers") {
      return Response.json({ success: true, action, mappers: listMappers() });
    }

    // ---------------------------------------------------------------------
    if (action === "start_batch") {
      const sourceLabel = clean(body?.source_label) || "CoreBridge CSV import";
      const entityKey = clean(body?.entity);
      if (entityKey && !getMapper(entityKey)) throw bad(`No mapper is registered for "${entityKey}".`);
      const batchTag = clean(body?.batch_tag) || `cb-${entityKey || "mixed"}-${Date.now().toString(36)}`;

      const existing = await findBatchMarker(MapEntity, batchTag);
      if (existing) {
        return Response.json({ success: true, action, batch_id: batchTag, reused: true, meta: markerMeta(existing) });
      }

      const meta = {
        source_label: sourceLabel,
        entity: entityKey || null,
        entities_seen: {} as Record<string, number>,
        status: "running",
        started_by: actor,
        started_at: new Date().toISOString(),
        counts: { created: 0, updated: 0, skipped: 0, errors: 0 },
        per_entity_counts: {} as Record<string, any>,
        unmapped_columns: {} as Record<string, number>,
        recent_errors: [] as any[],
      };
      await MapEntity.create({
        source_app_id: SOURCE_APP_ID,
        source_entity: BATCH_MARKER,
        source_id: batchTag,
        target_entity: BATCH_MARKER,
        target_id: batchTag,
        migration_batch: batchTag,
        notes: JSON.stringify(meta),
      });
      return Response.json({ success: true, action, batch_id: batchTag, reused: false, meta });
    }

    // ---------------------------------------------------------------------
    if (action === "preview_mapping") {
      const entityKey = clean(body?.entity);
      const mapper = getMapper(entityKey);
      if (!mapper) throw bad(`No mapper is registered for "${entityKey}".`, 404);
      const columns = list(body?.columns).map(clean).filter(Boolean);
      if (!columns.length) throw bad("columns[] is required for a mapping preview.");
      const sampleRows = list(body?.sample_rows).slice(0, MAX_SAMPLE_ROWS);
      const preview = buildMappingPreview(mapper, columns, sampleRows);
      return Response.json({
        success: true,
        action,
        entity: entityKey,
        target_entity: mapper.target_entity,
        kind: mapper.kind,
        mapper_note: mapper.note || "",
        ...preview,
        dry_run: true,
      });
    }

    // ---------------------------------------------------------------------
    if (action === "import_rows") {
      const entityKey = clean(body?.entity);
      const mapper = getMapper(entityKey);
      if (!mapper) throw bad(`No mapper is registered for "${entityKey}".`, 404);
      const batchId = clean(body?.batch_id);
      if (!batchId) throw bad("batch_id is required.");
      const marker = await findBatchMarker(MapEntity, batchId);
      if (!marker) throw bad(`Migration batch "${batchId}" was not found.`, 404);

      const dryRun = body?.dry_run === true;
      const onDuplicate = clean(body?.on_duplicate) === "update" ? "update" : "skip";
      const sourceIdColumn = clean(body?.source_id_column);
      const allRows = list(body?.rows);
      if (!allRows.length) throw bad("rows[] is required and must not be empty.");
      const truncated = allRows.length > MAX_ROWS_PER_CALL;
      const rows = allRows.slice(0, MAX_ROWS_PER_CALL);

      const target = entities[mapper.target_entity];
      if (!target?.create) throw bad(`Target entity "${mapper.target_entity}" is not writable.`, 500);

      // Column->field map. When the caller does not pass one, auto-map from the
      // union of keys seen on the rows being imported.
      let mapping = body?.mapping && typeof body.mapping === "object" ? body.mapping : null;
      if (!mapping || !Object.keys(mapping).length) {
        const seen = new Set<string>();
        for (const row of rows.slice(0, 25)) for (const key of Object.keys(row || {})) seen.add(key);
        mapping = autoMapColumns(mapper, [...seen]).proposed;
      }

      // Dedupe index for THIS entity + parent indexes for referenced parents.
      const dedupeIndex = await loadSourceIndex(MapEntity, entityKey);
      const parentIndexes = new Map<string, Map<string, any>>();
      for (const parent of mapper.parents || []) {
        if (!parentIndexes.has(parent.parent_key)) {
          parentIndexes.set(parent.parent_key, await loadSourceIndex(MapEntity, parent.parent_key));
        }
      }
      const displayCache = new Map<string, string>();

      const results: any[] = [];
      const unmappedTally: Record<string, number> = {};
      const mappedColumns = new Set(Object.keys(mapping));

      async function resolveParentValue(parent: any, rec: any) {
        const sourceField = parent.source_field || parent.field;
        const rawValue = clean(rec[sourceField]);
        if (!rawValue) {
          if (parent.required) return { error: `missing required parent "${sourceField}" (${parent.parent_key})` };
          return { cleared: true };
        }
        const parentIndex = parentIndexes.get(parent.parent_key);
        const hit = parentIndex?.get(rawValue);
        if (hit && clean(hit.target_id) && clean(hit.target_id) !== ERROR_TARGET_ID) {
          if (parent.display_field) {
            const cacheKey = `${hit.target_entity}:${hit.target_id}`;
            if (!displayCache.has(cacheKey)) {
              let display = "";
              try {
                const row = await entities[hit.target_entity]?.get(hit.target_id);
                display = hit.target_entity === "GlobalSettings"
                  ? clean(row?.setting_value?.[parent.display_field])
                  : clean(row?.[parent.display_field]);
              } catch {
                display = "";
              }
              displayCache.set(cacheKey, display);
            }
            const display = displayCache.get(cacheKey) || "";
            rec[parent.field] = display || (parent.keep_literal ? rawValue : display);
          } else {
            rec[parent.field] = clean(hit.target_id);
          }
          return { resolved: true };
        }
        // Unresolved parent reference.
        if (parent.required) {
          return { error: `unresolved ${parent.parent_key} reference "${rawValue}" — import ${parent.parent_key} first` };
        }
        if (parent.keep_literal || parent.display_field) {
          // Keep the literal value (e.g. a vendor NAME column, not an id) —
          // but never overwrite a name that was already mapped directly.
          if (!clean(rec[parent.field])) rec[parent.field] = rawValue;
        } else {
          delete rec[parent.field]; // never write an unresolvable FK
        }
        return { unresolved: true };
      }

      for (let i = 0; i < rows.length; i += 1) {
        const raw = rows[i];
        const rowResult: any = { source_id: "", status: "error" };
        try {
          if (!raw || typeof raw !== "object") {
            rowResult.error = "row is not an object";
            results.push(rowResult);
            continue;
          }
          for (const key of Object.keys(raw)) {
            if (!mappedColumns.has(key)) unmappedTally[key] = (unmappedTally[key] || 0) + 1;
          }
          const sourceId = resolveSourceId(raw, mapping, sourceIdColumn);
          rowResult.source_id = sourceId;
          if (!sourceId) {
            rowResult.error = "no source id — map a column to __source_id__ or pass source_id_column";
            results.push(rowResult);
            continue;
          }

          const { record: mappedRec, dropped } = applyMappingToRecord(mapper, raw, mapping);
          let rec: any = coerceRecordTypes(mapper, mappedRec);

          for (const parent of mapper.parents || []) {
            const outcome = await resolveParentValue(parent, rec);
            if (outcome.error) {
              rowResult.error = [rowResult.error, outcome.error].filter(Boolean).join("; ");
            }
          }
          if (!rowResult.error) mapper.normalize?.(rec, raw);
          if (!rowResult.error && mapper.assemble) rec = mapper.assemble(rec, sourceId);

          if (!rowResult.error) {
            const errors = validateRecordForMapper(mapper, rec);
            if (errors.length) rowResult.error = errors.join("; ");
          }
          if (dropped.length && !rowResult.error) rowResult.dropped_fields = dropped;

          const existing = dedupeIndex.get(sourceId);
          if (!rowResult.error && isDuplicateMapRow(existing)) {
            if (onDuplicate === "update") {
              rowResult.target_id = clean(existing.target_id);
              if (!dryRun) {
                const updatePayload: Record<string, any> = {};
                for (const [k, v] of Object.entries(rec)) {
                  if (IDENTITY_FIELDS.has(k)) continue;
                  if (mapper.legacy_id_field && k === mapper.legacy_id_field) continue;
                  updatePayload[k] = v;
                }
                await target.update(clean(existing.target_id), updatePayload);
                await MapEntity.update(existing.id, {
                  target_id: clean(existing.target_id),
                  migration_batch: batchId,
                  notes: JSON.stringify({ status: "updated", on_duplicate: "update", updated_at: new Date().toISOString() }),
                });
                existing.notes = JSON.stringify({ status: "updated" });
              }
              rowResult.status = "updated";
            } else {
              rowResult.status = "skipped_dup";
              rowResult.target_id = clean(existing.target_id);
            }
            results.push(rowResult);
            continue;
          }
          if (rowResult.error) {
            if (!dryRun && sourceId) {
              // Persist the failure so report/get_batch can show it. The
              // '__error__' placeholder target keeps the row retryable.
              try {
                if (existing?.id) {
                  await MapEntity.update(existing.id, {
                    target_id: ERROR_TARGET_ID,
                    migration_batch: batchId,
                    notes: JSON.stringify({ status: "error", error: rowResult.error, at: new Date().toISOString() }),
                  });
                } else {
                  const created = await MapEntity.create({
                    source_app_id: SOURCE_APP_ID,
                    source_entity: entityKey,
                    source_id: sourceId,
                    target_entity: mapper.target_entity,
                    target_id: ERROR_TARGET_ID,
                    migration_batch: batchId,
                    notes: JSON.stringify({ status: "error", error: rowResult.error, at: new Date().toISOString() }),
                  });
                  dedupeIndex.set(sourceId, created);
                }
              } catch (mapErr: any) {
                console.error("manageMigration error-row write failed:", mapErr?.message || mapErr);
              }
            }
            results.push(rowResult);
            continue;
          }

          // Create path.
          rowResult.status = "created";
          if (dryRun) {
            results.push(rowResult);
            continue;
          }
          const payload: Record<string, any> = { ...rec };
          if (mapper.idempotency_field) payload[mapper.idempotency_field] = creationKey(entityKey, sourceId);
          if (mapper.legacy_id_field) payload[mapper.legacy_id_field] = `${mapper.legacy_id_prefix || ""}${sourceId}`;
          if (mapper.source_summary) {
            payload.source_summary = { source_app_id: SOURCE_APP_ID, source_id: sourceId, source_label: clean(body?.source_label) || "corebridge_csv" };
          }
          if (mapper.notes_append) payload.notes = appendNote(payload.notes, `CoreBridge ID: ${sourceId}`);
          if ((mapper.fields || []).includes("created_by") && !clean(payload.created_by)) {
            payload.created_by = actor;
          }

          const createdRow = await target.create(payload);
          const targetId = clean(createdRow?.id);
          if (!targetId) throw bad("create returned no record id", 500);
          rowResult.target_id = targetId;

          const mapFields: Record<string, any> = {
            source_app_id: SOURCE_APP_ID,
            source_entity: entityKey,
            source_id: sourceId,
            target_entity: mapper.target_entity,
            target_id: targetId,
            migration_batch: batchId,
            source_created_date: clean(raw?.created_date ?? raw?.["Created Date"] ?? raw?.Created ?? raw?.created ?? ""),
            source_updated_date: clean(raw?.updated_date ?? raw?.["Updated Date"] ?? raw?.Modified ?? raw?.modified ?? ""),
            notes: JSON.stringify({ status: "created", at: new Date().toISOString() }),
          };
          if (existing?.id) {
            // A previous error row for this source_id — repoint it at the new
            // record so the dedupe index reflects the successful import.
            await MapEntity.update(existing.id, {
              target_id: targetId,
              migration_batch: batchId,
              notes: mapFields.notes,
            });
            existing.target_id = targetId;
            existing.notes = mapFields.notes;
          } else {
            const mapRow = await MapEntity.create(mapFields);
            dedupeIndex.set(sourceId, mapRow);
          }
          results.push(rowResult);
        } catch (rowError: any) {
          rowResult.status = "error";
          rowResult.error = clean(rowError?.message || "row import failed");
          results.push(rowResult);
        }
      }

      const counts = tallyCounts(results);
      await mergeMarkerStats(MapEntity, marker, {
        entities_seen: { [entityKey]: rows.length },
        per_entity_counts: { [entityKey]: counts },
        unmapped_columns: unmappedTally,
        recent_errors: results.filter((r) => r.status === "error").slice(0, 25).map((r) => ({ source_id: r.source_id, error: r.error })),
        counts,
        last_import_at: new Date().toISOString(),
        last_import_dry_run: dryRun,
      });

      return Response.json({
        success: true,
        action,
        batch_id: batchId,
        entity: entityKey,
        dry_run: dryRun,
        on_duplicate: onDuplicate,
        results,
        counts,
        truncated,
        row_cap: MAX_ROWS_PER_CALL,
      });
    }

    // ---------------------------------------------------------------------
    if (action === "get_batch") {
      const batchId = clean(body?.batch_id);
      if (!batchId) throw bad("batch_id is required.");
      const marker = await findBatchMarker(MapEntity, batchId);
      if (!marker) throw bad(`Migration batch "${batchId}" was not found.`, 404);
      const rows = await loadBatchMapRows(MapEntity, batchId);
      const counts = { created: 0, updated: 0, skipped: 0, errors: 0, rows: rows.length };
      const errors: any[] = [];
      for (const row of rows) {
        const status = mapRowStatus(row);
        if (status === "created") counts.created += 1;
        else if (status === "updated") counts.updated += 1;
        else if (status === "skipped_dup") counts.skipped += 1;
        else {
          counts.errors += 1;
          if (errors.length < 25) {
            errors.push({
              source_id: row.source_id,
              source_entity: row.source_entity,
              error: clean(parseMapNotes(row).error) || "map row has no recorded status",
            });
          }
        }
      }
      return Response.json({
        success: true,
        action,
        batch_id: batchId,
        batch: { id: marker.id, ...markerMeta(marker) },
        counts,
        recent_errors: errors,
      });
    }

    // ---------------------------------------------------------------------
    if (action === "report") {
      const batchId = clean(body?.batch_id);
      if (!batchId) throw bad("batch_id is required.");
      const marker = await findBatchMarker(MapEntity, batchId);
      if (!marker) throw bad(`Migration batch "${batchId}" was not found.`, 404);
      const meta = markerMeta(marker);
      const rows = await loadBatchMapRows(MapEntity, batchId);
      const perEntity: Record<string, any> = {};
      const errors: any[] = [];
      const totals = { created: 0, updated: 0, skipped: 0, errors: 0, rows: 0 };
      for (const row of rows) {
        const key = clean(row?.source_entity) || "unknown";
        perEntity[key] = perEntity[key] || { created: 0, updated: 0, skipped: 0, errors: 0, rows: 0, target_entity: clean(row?.target_entity) };
        perEntity[key].rows += 1;
        totals.rows += 1;
        const status = mapRowStatus(row);
        if (status === "created") { perEntity[key].created += 1; totals.created += 1; }
        else if (status === "updated") { perEntity[key].updated += 1; totals.updated += 1; }
        else if (status === "skipped_dup") { perEntity[key].skipped += 1; totals.skipped += 1; }
        else {
          perEntity[key].errors += 1;
          totals.errors += 1;
          if (errors.length < 200) {
            errors.push({ source_id: clean(row?.source_id), source_entity: key, error: clean(parseMapNotes(row).error) || "unknown error" });
          }
        }
      }
      return Response.json({
        success: true,
        action,
        batch_id: batchId,
        generated_at: new Date().toISOString(),
        batch: { id: marker.id, ...meta },
        totals,
        per_entity: perEntity,
        errors,
        errors_truncated: totals.errors > errors.length,
        unmapped_columns: meta.unmapped_columns || {},
      });
    }

    // ---------------------------------------------------------------------
    if (action === "unimport_batch") {
      const batchId = clean(body?.batch_id);
      if (!batchId) throw bad("batch_id is required.");
      const marker = await findBatchMarker(MapEntity, batchId);
      if (!marker) throw bad(`Migration batch "${batchId}" was not found.`, 404);
      const rows = await loadBatchMapRows(MapEntity, batchId);
      const out = { deleted: 0, already_missing: 0, skipped_non_created: 0, errors: 0 };
      const failures: any[] = [];
      for (const row of rows) {
        const status = mapRowStatus(row);
        // Rollback only ever deletes rows THIS import created. Updated or
        // duplicate-skipped targets pre-date the batch and are left untouched.
        if (status !== "created") {
          out.skipped_non_created += 1;
          continue;
        }
        const targetEntity = entities[clean(row?.target_entity)];
        const targetId = clean(row?.target_id);
        if (!targetEntity?.delete || !targetId) {
          out.skipped_non_created += 1;
          continue;
        }
        try {
          const existing = await targetEntity.get(targetId).catch(() => null);
          if (!existing?.id) {
            out.already_missing += 1; // idempotent — target already gone
          } else {
            await targetEntity.delete(targetId);
            out.deleted += 1;
          }
          // Remove the map row too so a re-import starts clean; error and
          // skipped_dup rows are deliberately retained for the audit trail.
          await MapEntity.delete(row.id).catch(() => null);
        } catch (error: any) {
          const msg = clean(error?.message || "delete failed");
          if (/not found|does not exist|404/i.test(msg)) {
            out.already_missing += 1;
            await MapEntity.delete(row.id).catch(() => null);
          } else {
            out.errors += 1;
            if (failures.length < 50) failures.push({ source_id: clean(row?.source_id), target_id: targetId, error: msg });
          }
        }
      }
      await mergeMarkerStats(MapEntity, marker, {
        status: "rolled_back",
        unimported_at: new Date().toISOString(),
        unimported_by: actor,
        unimport_counts: out,
      });
      return Response.json({ success: true, action, batch_id: batchId, counts: out, failures });
    }

    // ---------------------------------------------------------------------
    if (action === "list_batches") {
      const markers = await loadAllEntityRows({
        entity: MapEntity,
        query: { source_app_id: SOURCE_APP_ID, source_entity: BATCH_MARKER },
        sort: "-created_date",
        label: "Migration batch markers",
      });
      const batches = markers.slice(0, 50).map((row: any) => {
        const meta = markerMeta(row);
        return {
          batch_id: clean(row?.source_id),
          source_label: clean(meta.source_label),
          entity: clean(meta.entity) || null,
          entities_seen: meta.entities_seen || {},
          status: clean(meta.status) || "running",
          started_by: clean(meta.started_by),
          started_at: clean(meta.started_at),
          updated_at: clean(meta.updated_at),
          counts: meta.counts || {},
          per_entity_counts: meta.per_entity_counts || {},
          unimported_at: clean(meta.unimported_at) || null,
        };
      });
      return Response.json({ success: true, action, batches });
    }

    throw bad(`Unsupported manageMigration action: ${action}`);
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 423, 429, 503].includes(status) ? status : 500;
    console.error("manageMigration error:", error?.message || error);
    return Response.json({
      success: false,
      error: clean(error?.message || "Migration action failed."),
    }, { status: safeStatus });
  }
});
