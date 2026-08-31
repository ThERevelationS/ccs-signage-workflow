import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SOURCE_APP_ID = '68a5a85045cf8570330146ef';
const SOURCE_FUNCTION = 'exportMasterInventory';
const MIGRATION_SECRET = 'Z9s6uQ1fJ8vN4xB2mK7cH3rT5pL0wD_e';
const HISTORY_BATCH = 'signestimate-history-2026-08-31';
const REF_BATCH = 'catalog-reference-remap-2026-08-31';

const CATALOGS = [
  'FoundationInventory',
  'ChannelLetterInstallInventory',
  'ChannelLetterInstallEquipment',
];

async function listAll(entity: any) {
  const rows: any[] = [];
  const limit = 500;
  let skip = 0;
  while (true) {
    const batch = await entity.list(null, limit, skip);
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < limit) break;
    skip += batch.length;
  }
  return rows;
}

async function fetchSource(serverUrl: string) {
  const endpoint = `${serverUrl}/api/apps/${SOURCE_APP_ID}/functions/${SOURCE_FUNCTION}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: MIGRATION_SECRET }),
  });
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok || !payload?.success) throw new Error(payload?.error || text || `${res.status} ${res.statusText}`);
  return payload;
}

function normalizeString(v: any) {
  return String(v ?? '').trim().toLowerCase();
}

function naturalKey(entityName: string, row: any) {
  if (entityName === 'FoundationInventory') {
    return `${normalizeString(row?.material_type)}|${normalizeString(row?.material_name)}`;
  }
  if (entityName === 'ChannelLetterInstallInventory') {
    return `${normalizeString(row?.item_name)}|${normalizeString(row?.pricing_mode)}`;
  }
  if (entityName === 'ChannelLetterInstallEquipment') {
    return `${normalizeString(row?.equipment_type)}|${normalizeString(row?.equipment_name)}`;
  }
  return '';
}

function cleanForFingerprint(value: any, entityName: string): any {
  if (Array.isArray(value)) return value.map((v) => cleanForFingerprint(v, entityName));
  if (!value || typeof value !== 'object') return value;
  const skip = new Set([
    'id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample',
  ]);
  if (entityName === 'FoundationInventory') {
    skip.add('compatible_equipment_ids');
    skip.add('compatible_attachment_ids');
    skip.add('compatible_sub_attachment_ids');
    skip.add('parent_attachment_ids');
  }
  const out: any = {};
  for (const key of Object.keys(value).sort()) {
    if (skip.has(key)) continue;
    out[key] = cleanForFingerprint(value[key], entityName);
  }
  return out;
}

function fingerprint(entityName: string, row: any) {
  return JSON.stringify(cleanForFingerprint(row, entityName));
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

function buildCatalogMap(entityName: string, sourceRows: any[], targetRows: any[]) {
  const mapping = new Map<string, string>();
  const usedTarget = new Set<string>();
  const methodCounts = { fingerprint: 0, natural_key: 0 };

  const sourceFp = groupBy(sourceRows, (r) => fingerprint(entityName, r.data));
  const targetFp = groupBy(targetRows, (r) => fingerprint(entityName, r));
  for (const [fp, sGroupRaw] of sourceFp) {
    const tGroupRaw = targetFp.get(fp) || [];
    const sGroup = [...sGroupRaw].sort((a, b) => String(a.source_id).localeCompare(String(b.source_id)));
    const tGroup = [...tGroupRaw].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (sGroup.length && sGroup.length === tGroup.length) {
      for (let i = 0; i < sGroup.length; i++) {
        mapping.set(sGroup[i].source_id, tGroup[i].id);
        usedTarget.add(tGroup[i].id);
        methodCounts.fingerprint++;
      }
    }
  }

  const remainingSource = sourceRows.filter((r) => !mapping.has(r.source_id));
  const remainingTarget = targetRows.filter((r) => !usedTarget.has(r.id));
  const sourceNk = groupBy(remainingSource, (r) => naturalKey(entityName, r.data));
  const targetNk = groupBy(remainingTarget, (r) => naturalKey(entityName, r));
  for (const [nk, sGroupRaw] of sourceNk) {
    const tGroupRaw = targetNk.get(nk) || [];
    const sGroup = [...sGroupRaw].sort((a, b) => String(a.source_id).localeCompare(String(b.source_id)));
    const tGroup = [...tGroupRaw].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (sGroup.length && sGroup.length === tGroup.length) {
      for (let i = 0; i < sGroup.length; i++) {
        mapping.set(sGroup[i].source_id, tGroup[i].id);
        usedTarget.add(tGroup[i].id);
        methodCounts.natural_key++;
      }
    }
  }

  const unmatchedSource = sourceRows
    .filter((r) => !mapping.has(r.source_id))
    .map((r) => ({ source_id: r.source_id, key: naturalKey(entityName, r.data) }));
  const unmatchedTarget = targetRows
    .filter((r) => !usedTarget.has(r.id))
    .map((r) => ({ target_id: r.id, key: naturalKey(entityName, r) }));

  return { mapping, methodCounts, unmatchedSource, unmatchedTarget };
}

function clone<T>(v: T): T {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function makeRefStats() {
  return { nonempty: 0, remappable: 0, already_current: 0, unresolved: 0, changed: 0, unresolved_values: [] as any[] };
}

function remapId(value: any, mapping: Map<string, string>, targetIds: Set<string>, stats: any, context: string) {
  const v = String(value || '').trim();
  if (!v) return value;
  stats.nonempty++;
  const mapped = mapping.get(v);
  if (mapped) {
    stats.remappable++;
    if (mapped !== v) {
      stats.changed++;
      return mapped;
    }
    return value;
  }
  if (targetIds.has(v)) {
    stats.already_current++;
    return value;
  }
  stats.unresolved++;
  if (stats.unresolved_values.length < 50) stats.unresolved_values.push({ context, value: v });
  return value;
}

function remapIdArray(values: any, mapping: Map<string, string>, targetIds: Set<string>, stats: any, context: string) {
  if (!Array.isArray(values)) return values;
  return values.map((v, i) => remapId(v, mapping, targetIds, stats, `${context}[${i}]`));
}

async function syncFoundationCatalogRefs(base44: any, sourceRows: any[], targetRows: any[], mapping: Map<string, string>, doWrite: boolean) {
  const stats = makeRefStats();
  const targetIds = new Set(targetRows.map((r) => r.id));
  const targetById = new Map(targetRows.map((r) => [r.id, r]));
  let rowsChanged = 0;

  for (const src of sourceRows) {
    const targetId = mapping.get(src.source_id);
    if (!targetId) continue;
    const target = targetById.get(targetId);
    if (!target) continue;
    const patch: any = {};
    let changed = false;
    for (const field of ['compatible_equipment_ids', 'compatible_attachment_ids', 'compatible_sub_attachment_ids', 'parent_attachment_ids']) {
      const original = src.data?.[field];
      if (!Array.isArray(original)) continue;
      const next = remapIdArray(original, mapping, targetIds, stats, `FoundationInventory:${src.source_id}.${field}`);
      patch[field] = next;
      if (JSON.stringify(target[field] || []) !== JSON.stringify(next || [])) changed = true;
    }
    if (changed) {
      rowsChanged++;
      if (doWrite) await base44.asServiceRole.entities.FoundationInventory.update(targetId, patch);
    }
  }
  return { ...stats, rows_changed: rowsChanged };
}

async function remapFoundationProjects(base44: any, projectIds: Set<string>, mapping: Map<string, string>, targetCatalogRows: any[], doWrite: boolean) {
  const all = await listAll(base44.asServiceRole.entities.FoundationProject);
  const rows = all.filter((r) => projectIds.has(r.id));
  const targetIds = new Set(targetCatalogRows.map((r) => r.id));
  const stats = makeRefStats();
  let projectsChanged = 0;

  for (const row of rows) {
    const items = clone(row.items || []);
    const poles = clone(row.poles || []);
    const walls = clone(row.walls || []);
    const wallCaps = clone(row.wall_caps || []);
    const selectedEquipment = clone(row.selected_equipment || []);
    let topConcrete = row.selected_concrete_id;

    for (let i = 0; i < items.length; i++) {
      for (const field of ['selected_forming_id', 'selected_pole_id', 'selected_brick_id', 'selected_fill_material_id', 'selected_concrete_id']) {
        items[i][field] = remapId(items[i]?.[field], mapping, targetIds, stats, `${row.project_name}.items[${i}].${field}`);
      }
    }
    for (let i = 0; i < poles.length; i++) {
      poles[i].pole_id = remapId(poles[i]?.pole_id, mapping, targetIds, stats, `${row.project_name}.poles[${i}].pole_id`);
    }
    for (let i = 0; i < walls.length; i++) {
      walls[i].materialId = remapId(walls[i]?.materialId, mapping, targetIds, stats, `${row.project_name}.walls[${i}].materialId`);
      walls[i].internalMaterialId = remapId(walls[i]?.internalMaterialId, mapping, targetIds, stats, `${row.project_name}.walls[${i}].internalMaterialId`);
    }
    for (let i = 0; i < wallCaps.length; i++) {
      wallCaps[i].cap_inventory_id = remapId(wallCaps[i]?.cap_inventory_id, mapping, targetIds, stats, `${row.project_name}.wall_caps[${i}].cap_inventory_id`);
    }
    for (let i = 0; i < selectedEquipment.length; i++) {
      selectedEquipment[i].equipment_id = remapId(selectedEquipment[i]?.equipment_id, mapping, targetIds, stats, `${row.project_name}.selected_equipment[${i}].equipment_id`);
    }
    topConcrete = remapId(topConcrete, mapping, targetIds, stats, `${row.project_name}.selected_concrete_id`);

    const changed = JSON.stringify(items) !== JSON.stringify(row.items || []) ||
      JSON.stringify(poles) !== JSON.stringify(row.poles || []) ||
      JSON.stringify(walls) !== JSON.stringify(row.walls || []) ||
      JSON.stringify(wallCaps) !== JSON.stringify(row.wall_caps || []) ||
      JSON.stringify(selectedEquipment) !== JSON.stringify(row.selected_equipment || []) ||
      topConcrete !== row.selected_concrete_id;

    if (changed) {
      projectsChanged++;
      if (doWrite) {
        await base44.asServiceRole.entities.FoundationProject.update(row.id, {
          items, poles, walls, wall_caps: wallCaps, selected_equipment: selectedEquipment, selected_concrete_id: topConcrete,
        });
      }
    }
  }
  return { ...stats, projects_scanned: rows.length, projects_changed: projectsChanged };
}

async function remapChannelProjects(base44: any, projectIds: Set<string>, materialMap: Map<string, string>, materialTargets: any[], equipmentMap: Map<string, string>, equipmentTargets: any[], doWrite: boolean) {
  const all = await listAll(base44.asServiceRole.entities.ChannelLetterInstallation);
  const rows = all.filter((r) => projectIds.has(r.id));
  const materialTargetIds = new Set(materialTargets.map((r) => r.id));
  const equipmentTargetIds = new Set(equipmentTargets.map((r) => r.id));
  const materialStats = makeRefStats();
  const equipmentStats = makeRefStats();
  let projectsChanged = 0;

  for (const row of rows) {
    const items = clone(row.items || []);
    const selectedEquipment = clone(row.selected_equipment || []);

    for (let i = 0; i < items.length; i++) {
      const materials = Array.isArray(items[i]?.materials) ? items[i].materials : [];
      for (let j = 0; j < materials.length; j++) {
        materials[j].inventory_item_id = remapId(
          materials[j]?.inventory_item_id,
          materialMap,
          materialTargetIds,
          materialStats,
          `${row.project_name}.items[${i}].materials[${j}].inventory_item_id`
        );
      }
    }
    for (let i = 0; i < selectedEquipment.length; i++) {
      selectedEquipment[i].equipment_id = remapId(
        selectedEquipment[i]?.equipment_id,
        equipmentMap,
        equipmentTargetIds,
        equipmentStats,
        `${row.project_name}.selected_equipment[${i}].equipment_id`
      );
    }

    const changed = JSON.stringify(items) !== JSON.stringify(row.items || []) ||
      JSON.stringify(selectedEquipment) !== JSON.stringify(row.selected_equipment || []);
    if (changed) {
      projectsChanged++;
      if (doWrite) await base44.asServiceRole.entities.ChannelLetterInstallation.update(row.id, { items, selected_equipment: selectedEquipment });
    }
  }

  return { projects_scanned: rows.length, projects_changed: projectsChanged, material_refs: materialStats, equipment_refs: equipmentStats };
}

async function bulkCreateChecked(entity: any, records: any[]) {
  if (!records.length) return [];
  const out: any[] = [];
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const result = await entity.bulkCreate(chunk);
    const made = Array.isArray(result) ? result : (Array.isArray(result?.entities) ? result.entities : []);
    if (made.length !== chunk.length) throw new Error(`bulkCreate count mismatch: expected ${chunk.length}, got ${made.length}`);
    out.push(...made);
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.secret !== MIGRATION_SECRET) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
    const action = body?.action === 'migrate' ? 'migrate' : 'preview';
    const doWrite = action === 'migrate';
    const serverUrl = (req.headers.get('Base44-Api-Url') || 'https://base44.app').replace(/\/$/, '');
    const source = await fetchSource(serverUrl);
    const base44 = createClientFromRequest(req);

    const targetCatalogs: Record<string, any[]> = {};
    const maps: Record<string, any> = {};
    for (const name of CATALOGS) {
      targetCatalogs[name] = await listAll(base44.asServiceRole.entities[name]);
      maps[name] = buildCatalogMap(name, source.entities?.[name] || [], targetCatalogs[name]);
    }

    const mapSummary = Object.fromEntries(CATALOGS.map((name) => [name, {
      source_count: (source.entities?.[name] || []).length,
      target_count: targetCatalogs[name].length,
      mapped: maps[name].mapping.size,
      methods: maps[name].methodCounts,
      unmatched_source: maps[name].unmatchedSource,
      unmatched_target: maps[name].unmatchedTarget,
    }]));

    const historyMaps = (await listAll(base44.asServiceRole.entities.LegacyMigrationMap))
      .filter((m: any) => m.source_app_id === SOURCE_APP_ID && m.migration_batch === HISTORY_BATCH);
    const foundationProjectIds = new Set(historyMaps.filter((m: any) => m.source_entity === 'FoundationProject').map((m: any) => m.target_id));
    const channelProjectIds = new Set(historyMaps.filter((m: any) => m.source_entity === 'ChannelLetterInstallation').map((m: any) => m.target_id));

    const foundationCatalogRefs = await syncFoundationCatalogRefs(
      base44,
      source.entities?.FoundationInventory || [],
      targetCatalogs.FoundationInventory,
      maps.FoundationInventory.mapping,
      doWrite
    );
    const foundationProjects = await remapFoundationProjects(
      base44,
      foundationProjectIds,
      maps.FoundationInventory.mapping,
      targetCatalogs.FoundationInventory,
      doWrite
    );
    const channelProjects = await remapChannelProjects(
      base44,
      channelProjectIds,
      maps.ChannelLetterInstallInventory.mapping,
      targetCatalogs.ChannelLetterInstallInventory,
      maps.ChannelLetterInstallEquipment.mapping,
      targetCatalogs.ChannelLetterInstallEquipment,
      doWrite
    );

    let mappingRecordsCreated = 0;
    if (doWrite) {
      const existingMaps = await listAll(base44.asServiceRole.entities.LegacyMigrationMap);
      const existingKeys = new Set(existingMaps.filter((m: any) => m.source_app_id === SOURCE_APP_ID).map((m: any) => `${m.source_entity}|${m.source_id}`));
      const records: any[] = [];
      for (const name of CATALOGS) {
        for (const src of source.entities?.[name] || []) {
          const targetId = maps[name].mapping.get(src.source_id);
          const key = `${name}|${src.source_id}`;
          if (!targetId || existingKeys.has(key)) continue;
          records.push({
            source_app_id: SOURCE_APP_ID,
            source_entity: name,
            source_id: src.source_id,
            target_entity: name,
            target_id: targetId,
            migration_batch: REF_BATCH,
            notes: 'Catalog ID mapping used to repair legacy estimator references',
          });
        }
      }
      mappingRecordsCreated = (await bulkCreateChecked(base44.asServiceRole.entities.LegacyMigrationMap, records)).length;
    }

    return Response.json({
      success: true,
      action,
      catalog_mapping: mapSummary,
      foundation_catalog_internal_refs: foundationCatalogRefs,
      foundation_projects: foundationProjects,
      channel_letter_projects: channelProjects,
      mapping_records_created: mappingRecordsCreated,
    });
  } catch (error) {
    console.error('catalog reference remap error:', error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});
