import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SOURCE_APP_ID = '68a5a85045cf8570330146ef';
const SOURCE_FUNCTION = 'exportMasterInventory';
const SOURCE_SECRET = '8hM4pRz_6Akv1cQYt7u2JXnL5sB0eF9dK3wV';
const BATCH = 'signestimate-history-2026-08-31';

const MODULE_ENTITIES = [
  'Project',
  'FoundationProject',
  'ChannelLetterInstallation',
  'VinylProject',
  'CNCProject',
  'LaserProject',
  'MetalProject',
  'BrickStoneProject',
  'MaintenanceProject',
];

const LEGACY_KEY_TO_ENTITY: Record<string, string> = {
  painting: 'Project',
  foundation: 'FoundationProject',
  channel_letter_installation: 'ChannelLetterInstallation',
  channel_letters: 'ChannelLetterInstallation',
  vinyl_estimator: 'VinylProject',
  vinyl: 'VinylProject',
  cnc: 'CNCProject',
  laser: 'LaserProject',
  metal_fabrication: 'MetalProject',
  metal: 'MetalProject',
  brick_stone: 'BrickStoneProject',
  sign_maintenance: 'MaintenanceProject',
  maintenance: 'MaintenanceProject',
};

const LEGACY_KEY_TO_CURRENT: Record<string, string> = {
  painting: 'painting',
  foundation: 'foundation',
  channel_letter_installation: 'channel_letters',
  channel_letters: 'channel_letters',
  vinyl_estimator: 'vinyl',
  vinyl: 'vinyl',
  cnc: 'cnc',
  laser: 'laser',
  metal_fabrication: 'metal',
  metal: 'metal',
  brick_stone: 'brick_stone',
  sign_maintenance: 'maintenance',
  maintenance: 'maintenance',
};

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
    body: JSON.stringify({ secret: SOURCE_SECRET }),
  });
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error || text || `${res.status} ${res.statusText}`);
  }
  return payload;
}

function mapKey(entityName: string, sourceId: string) {
  return `${entityName}|${sourceId}`;
}

function createdRows(result: any) {
  return Array.isArray(result) ? result : (Array.isArray(result?.entities) ? result.entities : []);
}

async function bulkCreateChecked(entity: any, records: any[]) {
  if (!records.length) return [];
  const out: any[] = [];
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const result = await entity.bulkCreate(chunk);
    const made = createdRows(result);
    if (made.length !== chunk.length) {
      throw new Error(`bulkCreate count mismatch: expected ${chunk.length}, got ${made.length}`);
    }
    out.push(...made);
  }
  return out;
}

function appendNote(existing: any, note: string) {
  const current = String(existing || '').trim();
  return current ? `${current}\n${note}` : note;
}

function analyzeSource(source: any) {
  const sourceIds = new Map<string, Set<string>>();
  for (const entityName of MODULE_ENTITIES) {
    sourceIds.set(entityName, new Set((source.entities?.[entityName] || []).map((r: any) => r.source_id)));
  }

  let totalLines = 0;
  let paintingLines = 0;
  let orphanLines = 0;
  const orphanDetails: any[] = [];

  for (const estimate of source.entities?.AllInOneEstimate || []) {
    for (const line of estimate.data?.line_items || []) {
      totalLines++;
      if (line?.module_key === 'painting') paintingLines++;
      const entityName = LEGACY_KEY_TO_ENTITY[line?.module_key];
      const exists = !!(entityName && line?.project_id && sourceIds.get(entityName)?.has(line.project_id));
      if (!exists) {
        orphanLines++;
        orphanDetails.push({
          estimate: estimate.data?.project_name || estimate.source_id,
          module_key: line?.module_key || null,
          project_name: line?.project_name || null,
          source_project_id: line?.project_id || null,
        });
      }
    }
  }

  return { totalLines, paintingLines, orphanLines, orphanDetails };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'migrate' ? 'migrate' : 'preview';
    const serverUrl = (req.headers.get('Base44-Api-Url') || 'https://base44.app').replace(/\/$/, '');
    const source = await fetchSource(serverUrl);
    const analysis = analyzeSource(source);

    const base44 = createClientFromRequest(req);
    const mapsBefore = await listAll(base44.asServiceRole.entities.LegacyMigrationMap);
    const batchMapsBefore = mapsBefore.filter((m: any) => m.source_app_id === SOURCE_APP_ID && m.migration_batch === BATCH);

    if (action === 'preview') {
      return Response.json({
        success: true,
        action,
        source_counts: source.counts,
        source_module_projects: MODULE_ENTITIES.reduce((sum, name) => sum + Number(source.counts?.[name] || 0), 0),
        source_all_in_one: Number(source.counts?.AllInOneEstimate || 0),
        all_in_one_lines: analysis.totalLines,
        legacy_painting_lines: analysis.paintingLines,
        orphan_lines: analysis.orphanLines,
        orphan_details: analysis.orphanDetails,
        existing_batch_mappings: batchMapsBefore.length,
      });
    }

    const existingMap = new Map<string, any>();
    for (const row of mapsBefore) {
      if (row.source_app_id !== SOURCE_APP_ID) continue;
      existingMap.set(mapKey(row.source_entity, row.source_id), row);
    }

    const createdByEntity: Record<string, number> = {};
    const mappingRecords: any[] = [];

    for (const entityName of MODULE_ENTITIES) {
      const sourceRows = source.entities?.[entityName] || [];
      const missing = sourceRows.filter((r: any) => !existingMap.has(mapKey(entityName, r.source_id)));
      const made = await bulkCreateChecked(
        base44.asServiceRole.entities[entityName],
        missing.map((r: any) => r.data)
      );
      createdByEntity[entityName] = made.length;
      for (let i = 0; i < made.length; i++) {
        const src = missing[i];
        const rec = {
          source_app_id: SOURCE_APP_ID,
          source_entity: entityName,
          source_id: src.source_id,
          target_entity: entityName,
          target_id: made[i].id,
          source_created_date: src.source_created_date,
          source_updated_date: src.source_updated_date,
          migration_batch: BATCH,
          notes: 'Historical estimator project migration',
        };
        mappingRecords.push(rec);
        existingMap.set(mapKey(entityName, src.source_id), rec);
      }
    }

    if (mappingRecords.length) {
      await bulkCreateChecked(base44.asServiceRole.entities.LegacyMigrationMap, mappingRecords);
    }

    const sourceAioRows = source.entities?.AllInOneEstimate || [];
    const missingAio = sourceAioRows.filter((r: any) => !existingMap.has(mapKey('AllInOneEstimate', r.source_id)));
    let importedOrphanLines = 0;
    let importedPaintingLines = 0;

    const aioPayloads = missingAio.map((src: any) => {
      const data = { ...src.data };
      data.line_items = (src.data?.line_items || []).map((line: any) => {
        const legacyKey = line?.module_key;
        const sourceEntity = LEGACY_KEY_TO_ENTITY[legacyKey];
        const currentKey = LEGACY_KEY_TO_CURRENT[legacyKey] || legacyKey;
        const mapped = sourceEntity && line?.project_id
          ? existingMap.get(mapKey(sourceEntity, line.project_id))
          : null;

        if (legacyKey === 'painting') importedPaintingLines++;

        if (!mapped?.target_id) {
          importedOrphanLines++;
          return {
            ...line,
            module_key: currentKey,
            project_id: '',
            owned: false,
            section_note: appendNote(
              line?.section_note,
              'Legacy import: the source project record was already missing in SignEstimate Pro; saved price snapshot preserved.'
            ),
          };
        }

        if (legacyKey === 'painting') {
          return {
            ...line,
            module_key: 'painting',
            project_id: mapped.target_id,
            section_note: appendNote(
              line?.section_note,
              'Legacy Painting section: saved project preserved; current Painting editor is read-only from All-In-One.'
            ),
          };
        }

        return {
          ...line,
          module_key: currentKey,
          project_id: mapped.target_id,
        };
      });
      return data;
    });

    const madeAio = await bulkCreateChecked(base44.asServiceRole.entities.AllInOneEstimate, aioPayloads);
    createdByEntity.AllInOneEstimate = madeAio.length;

    const aioMapRecords = madeAio.map((made: any, i: number) => {
      const src = missingAio[i];
      return {
        source_app_id: SOURCE_APP_ID,
        source_entity: 'AllInOneEstimate',
        source_id: src.source_id,
        target_entity: 'AllInOneEstimate',
        target_id: made.id,
        source_created_date: src.source_created_date,
        source_updated_date: src.source_updated_date,
        migration_batch: BATCH,
        notes: 'Historical All-In-One estimate migration with section ID remap',
      };
    });
    if (aioMapRecords.length) {
      await bulkCreateChecked(base44.asServiceRole.entities.LegacyMigrationMap, aioMapRecords);
    }

    const mapsAfter = await listAll(base44.asServiceRole.entities.LegacyMigrationMap);
    const batchMapsAfter = mapsAfter.filter((m: any) => m.source_app_id === SOURCE_APP_ID && m.migration_batch === BATCH);

    return Response.json({
      success: true,
      action,
      source_counts: source.counts,
      created_by_entity: createdByEntity,
      imported_orphan_lines: importedOrphanLines,
      imported_legacy_painting_lines: importedPaintingLines,
      batch_mappings_before: batchMapsBefore.length,
      batch_mappings_after: batchMapsAfter.length,
    });
  } catch (error) {
    console.error('historical estimator migration error:', error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});
