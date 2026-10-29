// scripts/.tmp-entities-legacy.mjs
var LaborServiceInventory = {};
var SignPartsSuppliesInventory = {};
var DimensionalLetterMaterial = {};
var Inventory = {};
var LegacyMigrationMap = {};

// src/components/estimator/builder/builderEntityPersistence.js
function isEntityNotFoundError(error) {
  const status = Number(error?.status || error?.response?.status || error?.response?.statusCode || error?.data?.status || 0);
  if (status === 404) return true;
  const message = String(
    error?.message || error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("not found") || message.includes("does not exist");
}
async function deleteBuilderEntityIfUnchanged({
  entity,
  record,
  guardFields = {},
  label = "Builder record"
} = {}) {
  const id = String(record?.id || "").trim();
  const updatedDate = String(record?.updated_date || "").trim();
  if (!id || !updatedDate || typeof entity?.deleteMany !== "function" || typeof entity?.get !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe delete.`);
  }
  const query = { id, updated_date: updatedDate, ...guardFields };
  let result;
  try {
    result = await entity.deleteMany(query);
  } catch (error) {
    let current2;
    try {
      current2 = await entity.get(id);
    } catch (verificationError) {
      if (isEntityNotFoundError(verificationError)) {
        return { deleted: true, convergedAfterResponseLoss: true };
      }
      throw new Error(
        `${label} delete returned an error and its outcome could not be verified. ` + `Do not retry blindly; reload before continuing. ${verificationError?.message || ""}`.trim()
      );
    }
    if (!current2) return { deleted: true, convergedAfterResponseLoss: true };
    throw error;
  }
  if (!result || typeof result.deleted !== "number") {
    throw new Error(`${label} conditional-delete result could not be verified.`);
  }
  if (result.deleted === 1) return { deleted: true };
  if (result.deleted > 1) {
    throw new Error(`${label} returned an impossible multi-record delete count.`);
  }
  let current;
  try {
    current = await entity.get(id);
  } catch (verificationError) {
    if (isEntityNotFoundError(verificationError)) {
      return { deleted: true, alreadyDeleted: true };
    }
    throw new Error(
      `${label} deletion matched no current version and the record could not be re-read. ` + `Do not retry blindly; reload before continuing. ${verificationError?.message || ""}`.trim()
    );
  }
  if (!current) return { deleted: true, alreadyDeleted: true };
  throw new Error(`${label} changed in another session. It was not deleted.`);
}
var deleteEntityIfUnchanged = deleteBuilderEntityIfUnchanged;

// src/components/masterInventory/legacyInventoryMigrator.jsx
var VALID_MATERIAL_TYPES = /* @__PURE__ */ new Set([
  "Aluminum",
  "Steel",
  "Stainless_Steel",
  "Galvanized_Steel",
  "Brass",
  "Copper",
  "Plastic",
  "Other"
]);
var VALID_EXTRUSION_PRODUCT_TYPES = /* @__PURE__ */ new Set([
  "Angle",
  "Channel",
  "Tube_Square",
  "Tube_Round",
  "Flat_Bar",
  "Round_Bar",
  "I_Beam",
  "H_Beam",
  "Pipe"
]);
function classifyLegacyRow(row) {
  const mt = String(row.material_type || "").toLowerCase();
  const pt = String(row.product_type || "").toLowerCase();
  const supplier = String(row.supplier || "").toLowerCase();
  const haystack = `${mt} ${pt} ${supplier}`;
  if (/permit|zoning|inspection/.test(haystack)) return "labor_service";
  if (/labor|fabrication labor|install labor/.test(haystack)) return "labor_service";
  if (/engineering|design fee|consulting/.test(haystack)) return "labor_service";
  if (/freight|delivery|crane/.test(haystack)) return "labor_service";
  if (/trim cap|j[-\s]?bar|retainer|raceway cover|edge trim/.test(haystack)) return "sign_parts_supplies";
  if (/paint|primer|sealant|adhesive|cleaner|solvent|abrasive/.test(haystack)) return "sign_parts_supplies";
  if (/sheet|plate|panel|sintra|acrylic|pvc|acm|dibond|polycarbonate|lexan|styrene/.test(haystack)) return "substrate";
  if (mt === "plastic" && !VALID_EXTRUSION_PRODUCT_TYPES.has(row.product_type)) return "substrate";
  if (VALID_MATERIAL_TYPES.has(row.material_type) && VALID_EXTRUSION_PRODUCT_TYPES.has(row.product_type)) {
    return "keep";
  }
  return "keep";
}
function buildPayload(row, target) {
  const name = row.product_type || row.material_type || "Imported Item";
  const cost = parseFloat(row.cost_per_unit) || 0;
  if (target === "labor_service") {
    const mt = String(row.material_type || "").toLowerCase();
    const isPermit = /permit|zoning|inspection/.test(mt + " " + row.product_type);
    return {
      service_name: name,
      service_category: isPermit ? "permitting" : "subcontractor_labor",
      pricing_mode: isPermit ? "flat" : "per_hour",
      default_rate: cost,
      vendor_name: row.supplier || "",
      notes: row.notes || "",
      is_active: true
    };
  }
  if (target === "sign_parts_supplies") {
    const pt = String(row.product_type || "").toLowerCase();
    let category = "shop_consumable";
    if (/trim cap/.test(pt)) category = "trim_cap";
    else if (/j[-\s]?bar/.test(pt)) category = "j_bar";
    else if (/retainer/.test(pt)) category = "retainer";
    else if (/raceway cover/.test(pt)) category = "raceway_cover";
    else if (/edge trim/.test(pt)) category = "edge_trim";
    else if (/paint/.test(pt)) category = "paint_ink";
    let pricing_mode = "per_piece";
    if (row.unit_type === "per_foot") pricing_mode = "per_foot";
    else if (row.unit_type === "per_sqft") pricing_mode = "per_sqft";
    return {
      item_name: name,
      category,
      size: row.size || "",
      pricing_mode,
      cost_per_unit: cost,
      supplier: row.supplier || "",
      notes: row.notes || "",
      is_active: true
    };
  }
  if (target === "substrate") {
    const thickMatch = String(row.product_type + " " + row.size + " " + (row.thickness_gauge || "")).match(/(\d*\.?\d+)/);
    const thickness = thickMatch ? parseFloat(thickMatch[1]) : 0.125;
    const mt = String(row.material_type || "").toLowerCase();
    const pt = String(row.product_type || "").toLowerCase();
    let material_type = "aluminum_sheet";
    if (mt === "aluminum" || /aluminum/.test(pt)) material_type = "aluminum_sheet";
    else if (/steel/.test(mt) || /steel/.test(pt)) material_type = "steel_sheet";
    else if (/stainless/.test(mt + " " + pt)) material_type = "stainless_sheet";
    else if (/galvanized/.test(mt + " " + pt)) material_type = "galvanized_sheet";
    else if (mt === "plastic" || /acrylic|pvc|sintra|acm|dibond|polycarbonate|lexan|styrene/.test(pt)) {
      if (/acrylic/.test(pt)) material_type = "acrylic";
      else if (/pvc|sintra/.test(pt)) material_type = "pvc";
      else if (/acm|dibond|alumalite/.test(pt)) material_type = "aluminum_composite";
      else if (/polycarbonate|lexan/.test(pt)) material_type = "polycarbonate";
      else if (/styrene/.test(pt)) material_type = "styrene";
      else material_type = "pvc";
    }
    return {
      material_name: name,
      material_type,
      thickness_inches: thickness,
      sheet_length_inches: 96,
      sheet_width_inches: 48,
      cost_per_sheet: cost > 0 && row.unit_type === "per_piece" ? cost : cost * 32,
      // 4x8 = 32 sqft
      supplier: row.supplier || "",
      notes: row.notes || "",
      is_active: true
    };
  }
  return null;
}
var TARGET_ENTITY = {
  labor_service: LaborServiceInventory,
  sign_parts_supplies: SignPartsSuppliesInventory,
  substrate: DimensionalLetterMaterial
};
var TARGET_ENTITY_NAME = {
  labor_service: "LaborServiceInventory",
  sign_parts_supplies: "SignPartsSuppliesInventory",
  substrate: "DimensionalLetterMaterial"
};
var APP_ID = "68dfcc5e57bbbc35387da97c";
var LEGACY_INVENTORY_CLEANUP_BATCH = "legacy_inventory_cleanup_v2";
async function migrationReceipts(sourceId) {
  const rows = await LegacyMigrationMap.filter({
    source_app_id: APP_ID,
    source_entity: "Inventory",
    source_id: sourceId,
    migration_batch: LEGACY_INVENTORY_CLEANUP_BATCH
  });
  return (rows || []).slice().sort((a, b) => String(a.created_date || a.id || "").localeCompare(String(b.created_date || b.id || "")));
}
async function createMigrationReceipt({ source, target, targetName }) {
  return LegacyMigrationMap.create({
    source_app_id: APP_ID,
    source_entity: "Inventory",
    source_id: source.id,
    target_entity: targetName,
    target_id: target.id,
    source_created_date: source.created_date || "",
    source_updated_date: source.updated_date || "",
    migration_batch: LEGACY_INVENTORY_CLEANUP_BATCH,
    notes: "Master Inventory legacy cleanup receipt. Source is deleted only after this target mapping is durable."
  });
}
async function rollbackCreatedMigration({ targetEntity, targetRow, receipt, sourceId }) {
  if (targetRow?.id) {
    try {
      await deleteEntityIfUnchanged({
        entity: targetEntity,
        record: targetRow,
        label: `Legacy migration target rollback for source ${sourceId}`
      });
    } catch (error) {
      return { ok: false, message: `Target rollback failed for ${targetRow.id}: ${error?.message || "unknown error"}. The migration receipt was retained so this partial state remains traceable.` };
    }
  }
  if (receipt?.id) {
    try {
      await deleteEntityIfUnchanged({
        entity: LegacyMigrationMap,
        record: receipt,
        label: `Legacy migration receipt rollback for source ${sourceId}`
      });
    } catch (error) {
      return { ok: false, message: `Target rollback succeeded, but receipt ${receipt.id} could not be removed: ${error?.message || "unknown error"}. Manual review is required before retrying.` };
    }
  }
  return { ok: true, message: "" };
}
async function migrateLegacyInventoryRows(allInventoryRows, { onProgress } = {}) {
  const summary = { labor_service: 0, sign_parts_supplies: 0, substrate: 0, kept: 0, recovered: 0, errors: 0, error_details: [] };
  const rowsToMigrate = allInventoryRows.map((r) => ({ row: r, target: classifyLegacyRow(r) })).filter((x) => x.target !== "keep");
  for (let i = 0; i < rowsToMigrate.length; i++) {
    const { row, target } = rowsToMigrate[i];
    try {
      const live = await Inventory.get(row.id);
      if (!live) throw new Error(`Legacy Inventory row ${row.id} no longer exists.`);
      if (row.updated_date && live.updated_date && row.updated_date !== live.updated_date) {
        throw new Error(`Legacy Inventory row ${row.id} changed after this cleanup preview was loaded.`);
      }
      const targetEntity = TARGET_ENTITY[target];
      const targetName = TARGET_ENTITY_NAME[target];
      if (!targetEntity || !targetName) throw new Error(`No migration target is configured for ${target}.`);
      const existingReceipts = await migrationReceipts(row.id);
      if (existingReceipts.length > 1) {
        throw new Error(`Legacy Inventory row ${row.id} has multiple ${LEGACY_INVENTORY_CLEANUP_BATCH} receipts. No source or target records were changed; resolve the duplicate receipts before retrying.`);
      }
      if (existingReceipts.length === 1) {
        const receipt2 = existingReceipts[0];
        if (receipt2.target_entity !== targetName) {
          throw new Error(`Legacy Inventory row ${row.id} is already mapped to ${receipt2.target_entity}, but the current classifier resolves to ${targetName}. Review this row manually before retrying.`);
        }
        const existingTarget = await targetEntity.get(receipt2.target_id);
        if (!existingTarget?.id) {
          throw new Error(`Legacy Inventory row ${row.id} has migration receipt ${receipt2.id}, but target ${receipt2.target_id} no longer exists. Manual review is required.`);
        }
        await deleteEntityIfUnchanged({
          entity: Inventory,
          record: live,
          label: `Legacy Inventory source ${row.id} recovery delete`
        });
        summary[target] += 1;
        summary.recovered += 1;
        onProgress?.({ done: i + 1, total: rowsToMigrate.length });
        continue;
      }
      const payload = buildPayload(live, target);
      if (!payload) throw new Error(`Legacy Inventory row ${row.id} did not produce a target payload.`);
      let created = null;
      let receipt = null;
      try {
        created = await targetEntity.create(payload);
        if (!created?.id) throw new Error(`Target ${targetName} create did not return a verifiable record.`);
        receipt = await createMigrationReceipt({ source: live, target: created, targetName });
        if (!receipt?.id) throw new Error(`Migration receipt could not be verified for source ${row.id}.`);
        const receiptsAfterCreate = await migrationReceipts(row.id);
        if (receiptsAfterCreate.length !== 1 || receiptsAfterCreate[0].id !== receipt.id) {
          const rollback = await rollbackCreatedMigration({ targetEntity, targetRow: created, receipt, sourceId: row.id });
          if (!rollback.ok) throw new Error(`Concurrent migration receipt conflict for source ${row.id}. ${rollback.message}`);
          throw new Error(`Another migration attempt raced source ${row.id}. This attempt rolled back its own target and receipt; reload the cleanup preview before retrying.`);
        }
        await deleteEntityIfUnchanged({
          entity: Inventory,
          record: live,
          label: `Legacy Inventory source ${row.id}`
        });
        const sourceAfter = await Inventory.get(row.id).catch(() => null);
        const targetAfter = await targetEntity.get(created.id).catch(() => null);
        if (sourceAfter || !targetAfter?.id) {
          throw new Error(`Final verification failed for legacy Inventory source ${row.id}; source absence and target presence could not both be confirmed.`);
        }
        summary[target] += 1;
      } catch (operationError) {
        const sourceStillExists = await Inventory.get(row.id).catch(() => null);
        if (sourceStillExists && created?.id) {
          if (!receipt?.id) {
            const recoveredReceipts = await migrationReceipts(row.id).catch(() => []);
            const matchingReceipt = recoveredReceipts.find((candidate) => candidate.target_id === created.id && candidate.target_entity === targetName) || null;
            if (matchingReceipt) receipt = matchingReceipt;
          }
          const rollback = await rollbackCreatedMigration({ targetEntity, targetRow: created, receipt, sourceId: row.id });
          if (!rollback.ok) {
            throw new Error(`${operationError?.message || "Migration failed."} ${rollback.message}`.trim());
          }
        }
        throw operationError;
      }
    } catch (err) {
      console.error("Migration failed for row", row.id, err);
      summary.errors += 1;
      summary.error_details.push({ source_id: row.id, message: err?.message || "Migration failed." });
    }
    onProgress?.({ done: i + 1, total: rowsToMigrate.length });
  }
  summary.kept = allInventoryRows.length - rowsToMigrate.length;
  return summary;
}
function previewLegacyMigration(allInventoryRows) {
  const counts = { labor_service: 0, sign_parts_supplies: 0, substrate: 0, keep: 0 };
  allInventoryRows.forEach((r) => {
    counts[classifyLegacyRow(r)] += 1;
  });
  return counts;
}
export {
  LEGACY_INVENTORY_CLEANUP_BATCH,
  VALID_EXTRUSION_PRODUCT_TYPES,
  VALID_MATERIAL_TYPES,
  classifyLegacyRow,
  migrateLegacyInventoryRows,
  previewLegacyMigration
};
