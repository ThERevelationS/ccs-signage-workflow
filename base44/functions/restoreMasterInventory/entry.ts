import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SOURCE_APP_ID = '68a5a85045cf8570330146ef';
const EXPORT_SECRET = 'UAipl41wZM1L33OeEYqWtJt7JKN7ER12rvhB1_JEy14';
const SOURCE_EXPORT_FUNCTION = 'exportMasterInventory';

const ENTITY_SPECS = [
  { name: 'DimensionalLetterMaterial', key: (r: any) => `substrate|${norm(r.material_name)}` },
  { name: 'VinylInventory', key: (r: any) => `vinyl|${norm(r.vinyl_name)}` },
  { name: 'SignLightingInventory', key: (r: any) => `lighting|${norm(r.item_name)}` },
  { name: 'SignHardwareInventory', key: (r: any) => `hardware|${norm(r.item_name)}` },
  { name: 'LaborServiceInventory', key: (r: any) => `labor|${norm(r.service_name)}|${norm(r.service_category)}` },
  { name: 'SignPartsSuppliesInventory', key: (r: any) => `parts|${norm(r.item_name)}|${norm(r.category)}` },
  { name: 'FoundationInventory', key: (r: any) => `foundation|${norm(r.material_type)}|${norm(r.material_name)}|${norm(r.equipment_type)}` },
  { name: 'Inventory', key: (r: any) => `metal|${norm(r.material_type)}|${norm(r.product_type)}|${norm(r.size)}|${norm(r.thickness_gauge)}` },
  { name: 'ChannelLetterInstallInventory', key: (r: any) => `install|${norm(r.item_name)}|${norm(r.pricing_mode)}` },
  { name: 'ChannelLetterInstallEquipment', key: (r: any) => `equipment|${norm(r.equipment_name)}|${norm(r.equipment_type)}|${norm(r.ownership)}` },
];

function norm(v: unknown) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripSystemFields(row: any) {
  const {
    id,
    created_date,
    updated_date,
    created_by_id,
    created_by,
    is_sample,
    ...data
  } = row || {};
  return data;
}

async function listAll(entity: any) {
  const out: any[] = [];
  const limit = 500;
  let skip = 0;
  while (true) {
    const batch = await entity.list(null, limit, skip);
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < limit) break;
    skip += batch.length;
  }
  return out;
}

async function fetchSourceEntity(serverUrl: string, entityName: string) {
  const out: any[] = [];
  let skip = 0;
  const limit = 500;
  const endpoint = `${serverUrl}/api/apps/${SOURCE_APP_ID}/functions/${SOURCE_EXPORT_FUNCTION}`;

  while (true) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: EXPORT_SECRET,
        entity: entityName,
        skip,
        limit,
      }),
    });

    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch {}

    if (!response.ok || !payload?.success) {
      const detail = payload?.error || text || `${response.status} ${response.statusText}`;
      throw new Error(`Original inventory export failed for ${entityName}: ${detail}`);
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    out.push(...rows);
    if (rows.length < limit) break;
    skip += rows.length;
  }

  return out;
}

function mapId(value: any, idMap: Map<string, string>) {
  if (!value) return value ?? null;
  return idMap.get(String(value)) || null;
}

function mapIds(values: any, idMap: Map<string, string>) {
  if (!Array.isArray(values)) return [];
  return values.map((v) => idMap.get(String(v))).filter(Boolean);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me || me.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'migrate' ? 'migrate' : 'preview';
    const serverUrl = (req.headers.get('Base44-Api-Url') || 'https://base44.app').replace(/\/$/, '');

    const sourceByEntity: Record<string, any[]> = {};
    const targetByEntity: Record<string, any[]> = {};
    const report: any[] = [];

    let totalSource = 0;
    let totalTargetBefore = 0;
    let totalPending = 0;
    let totalImported = 0;
    let totalSkippedExisting = 0;

    // Read both sides first. Preview does not mutate anything.
    for (const spec of ENTITY_SPECS) {
      const [sourceRows, targetRows] = await Promise.all([
        fetchSourceEntity(serverUrl, spec.name),
        listAll(base44.asServiceRole.entities[spec.name]),
      ]);
      sourceByEntity[spec.name] = sourceRows;
      targetByEntity[spec.name] = targetRows;

      const existingKeys = new Set(targetRows.map((r: any) => spec.key(r)).filter(Boolean));
      const pending = sourceRows.filter((r: any) => !existingKeys.has(spec.key(r)));
      const skipped = sourceRows.length - pending.length;

      totalSource += sourceRows.length;
      totalTargetBefore += targetRows.length;
      totalPending += pending.length;
      totalSkippedExisting += skipped;
      report.push({
        entity: spec.name,
        source: sourceRows.length,
        target_before: targetRows.length,
        pending: pending.length,
        skipped_existing: skipped,
        imported: 0,
      });
    }

    if (action === 'preview') {
      return Response.json({
        success: true,
        action,
        source_app_id: SOURCE_APP_ID,
        totals: {
          source: totalSource,
          target_before: totalTargetBefore,
          pending: totalPending,
          imported: 0,
          skipped_existing: totalSkippedExisting,
        },
        entities: report,
      });
    }

    // First pass: create missing rows and build complete source-ID -> target-ID maps.
    const idMaps: Record<string, Map<string, string>> = {};

    for (let specIndex = 0; specIndex < ENTITY_SPECS.length; specIndex++) {
      const spec = ENTITY_SPECS[specIndex];
      const sourceRows = sourceByEntity[spec.name] || [];
      const existingTargetRows = targetByEntity[spec.name] || [];
      const targetByKey = new Map<string, any>();
      existingTargetRows.forEach((r: any) => targetByKey.set(spec.key(r), r));

      const idMap = new Map<string, string>();
      idMaps[spec.name] = idMap;

      // Map source rows that already have equivalent target rows.
      for (const sourceRow of sourceRows) {
        const match = targetByKey.get(spec.key(sourceRow));
        if (match?.id && sourceRow?.id) idMap.set(String(sourceRow.id), String(match.id));
      }

      const missing = sourceRows.filter((r: any) => !targetByKey.has(spec.key(r)));
      let importedForEntity = 0;

      for (let i = 0; i < missing.length; i += 100) {
        const sourceChunk = missing.slice(i, i + 100);
        const payload = sourceChunk.map(stripSystemFields);
        const created = await base44.asServiceRole.entities[spec.name].bulkCreate(payload);
        const createdRows = Array.isArray(created) ? created : (Array.isArray(created?.entities) ? created.entities : []);
        if (createdRows.length !== sourceChunk.length) {
          throw new Error(`Created-row count mismatch for ${spec.name}: expected ${sourceChunk.length}, received ${createdRows.length}`);
        }
        sourceChunk.forEach((src: any, idx: number) => {
          if (src?.id && createdRows[idx]?.id) idMap.set(String(src.id), String(createdRows[idx].id));
        });
        importedForEntity += sourceChunk.length;
        totalImported += sourceChunk.length;
      }

      report[specIndex].imported = importedForEntity;
    }

    // Second pass: repair ID-based relationships using the new target IDs.
    const vinylMap = idMaps['VinylInventory'] || new Map<string, string>();
    for (const src of sourceByEntity['VinylInventory'] || []) {
      const targetId = vinylMap.get(String(src.id));
      if (!targetId) continue;
      const updates = {
        default_laminate_id: mapId(src.default_laminate_id, vinylMap),
        preferred_laminate_id: mapId(src.preferred_laminate_id, vinylMap),
        preferred_transfer_tape_id: mapId(src.preferred_transfer_tape_id, vinylMap),
      };
      if (src.default_laminate_id || src.preferred_laminate_id || src.preferred_transfer_tape_id) {
        await base44.asServiceRole.entities.VinylInventory.update(targetId, updates);
      }
    }

    const foundationMap = idMaps['FoundationInventory'] || new Map<string, string>();
    for (const src of sourceByEntity['FoundationInventory'] || []) {
      const targetId = foundationMap.get(String(src.id));
      if (!targetId) continue;
      const hasRefs =
        (Array.isArray(src.compatible_equipment_ids) && src.compatible_equipment_ids.length > 0) ||
        (Array.isArray(src.compatible_attachment_ids) && src.compatible_attachment_ids.length > 0) ||
        (Array.isArray(src.compatible_sub_attachment_ids) && src.compatible_sub_attachment_ids.length > 0) ||
        (Array.isArray(src.parent_attachment_ids) && src.parent_attachment_ids.length > 0);
      if (!hasRefs) continue;
      await base44.asServiceRole.entities.FoundationInventory.update(targetId, {
        compatible_equipment_ids: mapIds(src.compatible_equipment_ids, foundationMap),
        compatible_attachment_ids: mapIds(src.compatible_attachment_ids, foundationMap),
        compatible_sub_attachment_ids: mapIds(src.compatible_sub_attachment_ids, foundationMap),
        parent_attachment_ids: mapIds(src.parent_attachment_ids, foundationMap),
      });
    }

    return Response.json({
      success: true,
      action,
      source_app_id: SOURCE_APP_ID,
      totals: {
        source: totalSource,
        target_before: totalTargetBefore,
        pending: totalPending,
        imported: totalImported,
        skipped_existing: totalSkippedExisting,
      },
      entities: report,
      relationships_remapped: true,
    });
  } catch (error) {
    console.error('restoreMasterInventory error:', error);
    return Response.json({
      success: false,
      error: error?.message || String(error),
    }, { status: 500 });
  }
});