import { createClient, createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SOURCE_APP_ID = '68a5a85045cf8570330146ef';
const MIGRATION_KEY = `masterInventoryRestore:${SOURCE_APP_ID}`;

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

async function saveState(base44: any, record: any, state: any) {
  const payload = {
    source_app_id: SOURCE_APP_ID,
    updated_at: new Date().toISOString(),
    ...state,
  };
  if (record?.id) {
    await base44.asServiceRole.entities.GlobalSettings.update(record.id, { setting_value: payload });
    return { ...record, setting_value: payload };
  }
  return await base44.asServiceRole.entities.GlobalSettings.create({
    setting_key: MIGRATION_KEY,
    setting_value: payload,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me || me.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!userToken) {
      return Response.json({ success: false, error: 'User authentication token is required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'migrate' ? 'migrate' : 'preview';
    const serverUrl = req.headers.get('Base44-Api-Url') || 'https://base44.app';

    // Use the requesting admin's Base44 identity to read their original app.
    // Writes always happen through THIS app's service role.
    const source = createClient({
      appId: SOURCE_APP_ID,
      serverUrl,
      token: userToken,
      requiresAuth: true,
    });

    await source.auth.me(); // fail early if the caller cannot access the source app

    const stateRows = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: MIGRATION_KEY });
    let stateRecord = stateRows?.[0] || null;
    const savedState = stateRecord?.setting_value || {};
    const migratedSourceIds: Record<string, string[]> = savedState.migrated_source_ids || {};

    const report: any[] = [];
    let totalSource = 0;
    let totalTargetBefore = 0;
    let totalPending = 0;
    let totalImported = 0;
    let totalSkippedExisting = 0;

    // Load each source independently so a partial migration can be safely resumed.
    for (const spec of ENTITY_SPECS) {
      const sourceRows = await listAll(source.entities[spec.name]);
      const targetRows = await listAll(base44.asServiceRole.entities[spec.name]);
      const alreadyMigrated = new Set<string>(migratedSourceIds[spec.name] || []);

      // Only compare against records that existed in the target before THIS restore.
      // We intentionally do not add newly imported keys here, because the original
      // app can legitimately contain duplicate names and Phase 1A must preserve it.
      const preexistingKeys = new Set(targetRows.map((r: any) => spec.key(r)).filter(Boolean));
      const pendingRows = sourceRows.filter((r: any) => !alreadyMigrated.has(r.id));
      const importRows = pendingRows.filter((r: any) => !preexistingKeys.has(spec.key(r)));
      const skippedExistingRows = pendingRows.filter((r: any) => preexistingKeys.has(spec.key(r)));

      totalSource += sourceRows.length;
      totalTargetBefore += targetRows.length;
      totalPending += importRows.length;
      totalSkippedExisting += skippedExistingRows.length;

      const itemReport: any = {
        entity: spec.name,
        source: sourceRows.length,
        target_before: targetRows.length,
        already_migrated: sourceRows.length - pendingRows.length,
        pending: importRows.length,
        skipped_existing: skippedExistingRows.length,
        imported: 0,
      };

      if (action === 'migrate' && importRows.length > 0) {
        for (let i = 0; i < importRows.length; i += 75) {
          const sourceChunk = importRows.slice(i, i + 75);
          const payload = sourceChunk.map(stripSystemFields);
          await base44.asServiceRole.entities[spec.name].bulkCreate(payload);

          migratedSourceIds[spec.name] = [
            ...(migratedSourceIds[spec.name] || []),
            ...sourceChunk.map((r: any) => r.id).filter(Boolean),
          ];
          itemReport.imported += sourceChunk.length;
          totalImported += sourceChunk.length;

          // Persist after every chunk so the operation is resumable if interrupted.
          stateRecord = await saveState(base44, stateRecord, {
            migrated_source_ids: migratedSourceIds,
            status: 'in_progress',
          });
        }
      }

      // Mark pre-existing target matches as intentionally accounted for so
      // rerunning the migration does not keep offering them as pending.
      if (action === 'migrate' && skippedExistingRows.length > 0) {
        migratedSourceIds[spec.name] = [
          ...(migratedSourceIds[spec.name] || []),
          ...skippedExistingRows.map((r: any) => r.id).filter(Boolean),
        ];
      }

      report.push(itemReport);
    }

    if (action === 'migrate') {
      stateRecord = await saveState(base44, stateRecord, {
        migrated_source_ids: migratedSourceIds,
        status: 'complete',
        completed_at: new Date().toISOString(),
        last_imported: totalImported,
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
      migration_status: action === 'migrate' ? 'complete' : (savedState.status || 'not_started'),
    });
  } catch (error) {
    console.error('restoreMasterInventory error:', error);
    return Response.json({
      success: false,
      error: error?.message || String(error),
    }, { status: 500 });
  }
});
