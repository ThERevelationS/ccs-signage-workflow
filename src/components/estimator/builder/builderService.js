import { base44 } from "@/api/base44Client";
import { getModule, getModuleLabel, MODULE_TOTAL_FIELD } from "@/components/estimator/moduleRegistry";
import { acceptBuilderPartPrices, applyBuilderPartPriceAcceptancePlan, loadVerifiedBuilderPartSyncInputs, syncBuilderParts } from "./partSync";
import { acceptedCustomerUnitPrice, hasNumericValue, liveCustomerUnitPrice, manualCustomerPriceState, sourceProjectEconomics } from "../customerPricing";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { pendingBuilderMutation, resumeBuilderMutation } from "./builderMutationRecovery";

const num = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const nowIso = () => new Date().toISOString();

export const makeStableId = (prefix = "id") => {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
};

function stripSystemFields(value) {
  if (Array.isArray(value)) return value.map(stripSystemFields);
  if (!value || typeof value !== "object") return value;
  const result = {};
  Object.keys(value)
    .sort()
    .forEach((key) => {
      if (["created_by", "created_by_id"].includes(key)) return;
      result[key] = stripSystemFields(value[key]);
    });
  return result;
}

export function stableStringify(value) {
  return JSON.stringify(stripSystemFields(value ?? null));
}

export function snapshotHash(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function getSourceProject(line) {
  const mod = getModule(line?.module_key);
  if (!mod || !line?.project_id) return null;
  return base44.entities[mod.entity].get(line.project_id).catch(() => null);
}

export function sourceProjectTotal(line, record) {
  if (!record) return num(line?.live_total_snapshot, num(line?.total_snapshot));
  const totalField = MODULE_TOTAL_FIELD[line?.module_key];
  if (totalField) return num(record[totalField]);

  if (line?.module_key === "painting") {
    return num(record.total_paint_mask_cost)
      + num(record.total_liquid_paint_and_supplies_cost)
      + num(record.total_labor_cost);
  }

  if (line?.module_key === "foundation") {
    const direct = num(record.grand_total, NaN);
    if (Number.isFinite(direct)) return direct;
    const known = [
      "total_concrete_cost",
      "total_rebar_cost",
      "total_excavation_cost",
      "total_forming_materials_cost",
      "total_labor_cost",
      "total_wall_cost",
      "total_pole_cost",
      "total_pole_painting_cost",
      "total_equipment_cost",
      "total_wall_cap_cost",
      "total_signage_cabinet_cost",
      "total_landscape_cost",
    ];
    return known.reduce((sum, key) => sum + num(record[key]), 0);
  }

  return num(record.total_cost, num(line?.total_snapshot));
}

async function findBuilderProduct(line, estimateId) {
  if (line?.builder_product_id) {
    const direct = await base44.entities.BuilderProduct.get(line.builder_product_id).catch(() => null);
    if (direct) return direct;
  }

  if (line?.project_id) {
    const bySource = await base44.entities.BuilderProduct.filter({
      estimate_id: estimateId,
      source_project_id: line.project_id,
    });
    if (bySource?.[0]) return bySource[0];
  }

  if (line?.line_id) {
    const byLine = await base44.entities.BuilderProduct.filter({
      estimate_id: estimateId,
      estimate_line_id: line.line_id,
    });
    if (byLine?.[0]) return byLine[0];
  }

  return null;
}

function productIdentity(line) {
  const builderName = line?.builder_name || getModuleLabel(line?.module_key) || line?.project_name || "Product";
  const clientName = line?.client_product_name || line?.project_name || builderName;
  return { builderName, clientName };
}

const sameText = (a, b) => String(a ?? "") === String(b ?? "");
const sameNumber = (a, b) => Math.abs(num(a) - num(b)) <= 0.005;

function sameSubstantiveValue(a, b) {
  const bothPresent = a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "";
  if (bothPresent && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return sameNumber(a, b);
  }
  return stableStringify(a) === stableStringify(b);
}

function patchDiffers(record, patch) {
  return Object.entries(patch || {}).some(([key, value]) => !sameSubstantiveValue(record?.[key], value));
}

/**
 * Fully reconciled legacy Products are immutable at their frozen pricing layer.
 * Re-opening an estimate should not rewrite BuilderProduct/BuilderPart/Estimate
 * records merely to refresh timestamps. Reuse the existing linked state when the
 * source record has not changed and the persisted line already mirrors the
 * BuilderProduct. A real source update still falls through to normal recalculation.
 */
export function canReuseReconciledLegacyBuilder({
  line,
  builderProduct,
  source,
  lineId,
  sourceEntity,
  builderName,
  clientName,
}) {
  if (
    !line?.builder_product_id ||
    !builderProduct?.id ||
    line.builder_product_id !== builderProduct.id ||
    builderProduct.price_state !== "legacy_frozen" ||
    builderProduct.legacy_bom_reconciled !== true
  ) return false;

  const sourceStamp = String(source?.updated_date || "").trim();
  const recordedSourceStamp = String(
    line.updated_date_snapshot || builderProduct.builder_snapshot_source_updated_date || ""
  ).trim();
  if (sourceStamp && sourceStamp !== recordedSourceStamp) return false;

  const expectedCategory = line.product_category || builderProduct.product_category || "";
  const expectedProductionType = line.production_product_type ?? builderProduct.production_product_type ?? "";
  const expectedNotes = line.product_notes ?? builderProduct.product_notes ?? "";
  const expectedStatus = line.section_status === "complete" ? "complete" : "in_progress";

  return (
    sameText(builderProduct.estimate_line_id, lineId) &&
    sameText(builderProduct.module_key, line.module_key) &&
    sameText(builderProduct.source_entity, sourceEntity) &&
    sameText(builderProduct.source_project_id, line.project_id) &&
    sameText(builderProduct.builder_name, builderName) &&
    sameText(builderProduct.client_product_name, clientName) &&
    sameText(builderProduct.client_description, line.customer_description) &&
    sameText(builderProduct.product_category, expectedCategory) &&
    sameText(builderProduct.production_product_type, expectedProductionType) &&
    sameText(builderProduct.product_notes, expectedNotes) &&
    sameNumber(builderProduct.quantity, line.customer_quantity ?? 1) &&
    sameText(builderProduct.status, expectedStatus) &&
    sameNumber(line.total_snapshot, builderProduct.frozen_cost) &&
    sameNumber(line.live_total_snapshot, builderProduct.current_recalculated_cost) &&
    sameText(line.price_state, builderProduct.price_state) &&
    sameNumber(line.detached_part_count, builderProduct.detached_part_count) &&
    !!line.needs_reattach_review === !!builderProduct.needs_reattach_review
  );
}

export async function ensureBuilderProductForLine({ estimate, line, isNew = false, deferPartSync = false, strictPartSync = false, skipUnchangedWrites = false, sourceProjectOverride = undefined }) {
  const estimateId = estimate?.id;
  if (!estimateId || !line) return { line, builderProduct: null, changed: false };

  // A Builder mutation may be between durable steps. Preserve the exact saved
  // line and Builder state until that operation is explicitly resumed; page-open
  // reconciliation must never rewrite its recovery inputs. Quick Product insertion
  // has an initial provisional stage before its BuilderProduct exists.
  if (line?.price_acceptance_pending?.key) {
    if (line.price_acceptance_pending.kind === "builder_product_remove") {
      // Product removal intentionally deletes Builder/source records before the
      // final Estimate-line removal. Preserve the durable marker even when those
      // records are already gone so the user can safely resume cleanup.
      const pendingBuilder = line.builder_product_id
        ? await base44.entities.BuilderProduct.get(line.builder_product_id).catch(() => null)
        : null;
      if (pendingBuilder?.estimate_id && pendingBuilder.estimate_id !== estimateId) {
        throw new Error("A pending Product removal found a Builder Product owned by another estimate. The saved recovery marker was retained.");
      }
      return { line, builderProduct: pendingBuilder, changed: false, partSyncInputs: null };
    }
    if (!line.builder_product_id && ["builder_quick_product_insert", "builder_blank_product_insert"].includes(line.price_acceptance_pending.kind)) {
      return { line, builderProduct: null, changed: false, partSyncInputs: null };
    }
    if (line.builder_product_id) {
      const pendingBuilder = await base44.entities.BuilderProduct.get(line.builder_product_id);
      if (!pendingBuilder?.id || (pendingBuilder.estimate_id && pendingBuilder.estimate_id !== estimateId)) {
        throw new Error("A pending Builder mutation could not verify its Builder Product. The saved recovery marker was retained.");
      }
      return { line, builderProduct: pendingBuilder, changed: false, partSyncInputs: null };
    }
  }

  const lineId = line.line_id || makeStableId("line");
  const source = sourceProjectOverride !== undefined ? sourceProjectOverride : await getSourceProject(line);
  const sourceTotal = sourceProjectTotal(line, source);
  const acceptedTotal = num(line.total_snapshot);
  const acceptedCustomerPrice = acceptedCustomerUnitPrice(line);
  const { builderName, clientName } = productIdentity(line);
  const sourceEntity = getModule(line.module_key)?.entity || "";
  const timestamp = nowIso();
  let builderProduct = await findBuilderProduct(line, estimateId);
  if (!isNew && canReuseReconciledLegacyBuilder({
    line,
    builderProduct,
    source,
    lineId,
    sourceEntity,
    builderName,
    clientName,
  })) {
    const partSyncInputs = deferPartSync && source
      ? await loadVerifiedBuilderPartSyncInputs({ builderProduct, moduleKey: line.module_key })
      : null;
    return { line, builderProduct, changed: false, partSyncInputs };
  }
  const preserveLegacyEconomics = !isNew && (!builderProduct || builderProduct.price_state === "legacy_frozen");
  const economics = preserveLegacyEconomics
    ? { internalCost: sourceTotal, customerPrice: liveCustomerUnitPrice(line) }
    : sourceProjectEconomics(line.module_key, source, sourceTotal);
  const liveTotal = economics.internalCost;
  const liveCustomerPrice = economics.customerPrice;
  const partSyncInputs = (deferPartSync || strictPartSync) && source
    ? await loadVerifiedBuilderPartSyncInputs({ builderProduct, moduleKey: line.module_key })
    : null;

  if (!builderProduct) {
    builderProduct = await base44.entities.BuilderProduct.create({
      estimate_id: estimateId,
      estimate_line_id: lineId,
      module_key: line.module_key,
      source_entity: sourceEntity,
      source_project_id: line.project_id || "",
      builder_name: builderName,
      client_product_name: clientName,
      client_description: line.customer_description || "",
      product_category: line.product_category || "",
      production_product_type: line.production_product_type || "",
      product_notes: line.product_notes || "",
      quantity: num(line.customer_quantity, 1),
      status: line.section_status === "complete" ? "complete" : "in_progress",
      builder_version: 1,
      builder_snapshot: source || {},
      builder_snapshot_at: timestamp,
      builder_snapshot_source_updated_date: source?.updated_date || line.updated_date_snapshot || "",
      builder_snapshot_hash: snapshotHash(source || {}),
      frozen_cost: isNew ? 0 : acceptedTotal,
      frozen_customer_price: isNew ? 0 : acceptedCustomerPrice,
      current_recalculated_cost: liveTotal,
      price_state: isNew ? "unchecked" : "legacy_frozen",
      price_delta: isNew ? liveTotal : liveTotal - acceptedTotal,
      price_delta_percent: !isNew && acceptedTotal ? ((liveTotal - acceptedTotal) / acceptedTotal) * 100 : 0,
      price_recalc_required: false,
      price_recalc_reason: "",
      last_price_check_at: timestamp,
      part_count: 0,
      group_count: 0,
      detached_part_count: 0,
      needs_reattach_review: false,
      is_active: true,
      notes: isNew
        ? "Builder Product created with estimate product. First priced save creates the initial frozen revision."
        : "Backfilled from an existing estimate line. Existing total_snapshot remains the authoritative legacy frozen price.",
    });
  } else {
    const frozen = num(builderProduct.frozen_cost, acceptedTotal);
    const frozenCustomer = hasNumericValue(builderProduct.frozen_customer_price)
      ? num(builderProduct.frozen_customer_price)
      : acceptedCustomerPrice;
    const awaitingInitialFreeze = builderProduct.price_state === "unchecked" && frozen === 0;
    const nextState = builderProduct.price_state === "legacy_frozen"
      ? "legacy_frozen"
      : awaitingInitialFreeze
        ? "unchecked"
        : builderProduct.price_state === "manual"
          ? manualCustomerPriceState({
              detached: !!builderProduct.needs_reattach_review,
              recalcRequired: !!builderProduct.price_recalc_required,
            })
          : Math.abs(liveTotal - frozen) > 0.005 || Math.abs(liveCustomerPrice - frozenCustomer) > 0.005
            ? "changed"
            : "current";
    const identityPatch = {
      estimate_line_id: lineId,
      module_key: line.module_key,
      source_entity: sourceEntity,
      source_project_id: line.project_id || "",
      builder_name: builderName,
      client_product_name: clientName,
      client_description: line.customer_description || "",
      product_category: line.product_category || builderProduct.product_category || "",
      production_product_type: line.production_product_type ?? builderProduct.production_product_type ?? "",
      product_notes: line.product_notes ?? builderProduct.product_notes ?? "",
      quantity: num(line.customer_quantity, 1),
      status: line.section_status === "complete" ? "complete" : "in_progress",
    };
    const pricingPatch = {
      current_recalculated_cost: liveTotal,
      price_state: nextState,
      price_delta: liveTotal - frozen,
      price_delta_percent: frozen ? ((liveTotal - frozen) / frozen) * 100 : 0,
      price_recalc_required: builderProduct.price_recalc_required || false,
      price_recalc_reason: builderProduct.price_recalc_reason || "",
    };
    const willRunPartSync = !!source && !deferPartSync && !(
      builderProduct.price_state === "legacy_frozen" && builderProduct.legacy_bom_reconciled === true
    );
    // During strict page reconciliation, Part synchronization is authoritative for
    // the final live Product economics (including manual add-ons). Avoid a
    // transient pre-Part pricing write that would be immediately overwritten by
    // the post-Part summary and churn the BuilderProduct timestamp on page open.
    const productPatch = skipUnchangedWrites && willRunPartSync
      ? identityPatch
      : { ...identityPatch, ...pricingPatch };
    if (!skipUnchangedWrites || patchDiffers(builderProduct, productPatch)) {
      const writePatch = { ...productPatch, last_price_check_at: timestamp };
      await base44.entities.BuilderProduct.update(builderProduct.id, writePatch);
      builderProduct = { ...builderProduct, ...writePatch };
    }
  }

  let partSummary = {
    partCount: num(builderProduct.part_count),
    detachedCount: num(builderProduct.detached_part_count),
    changedCount: 0,
    newPartCount: 0,
    removedPartCount: 0,
    writesPerformed: 0,
    recalcRequired: !!builderProduct.price_recalc_required,
    recalcReason: builderProduct.price_recalc_reason || "",
    usesDirectLiveReprice: false,
    currentPartsTotal: 0,
    frozenPartsTotal: 0,
    currentMarkupTotal: 0,
    frozenMarkupTotal: 0,
    manualAddonFrozenTotal: 0,
    manualAddonCurrentTotal: 0,
  };
  let effectiveLiveTotal = liveTotal;
  let effectiveLiveCustomerPrice = preserveLegacyEconomics ? liveCustomerPrice : economics.customerPrice;
  const preserveReconciledLegacyBom =
    builderProduct?.price_state === "legacy_frozen" && builderProduct?.legacy_bom_reconciled === true;
  if (source && builderProduct?.id && !preserveReconciledLegacyBom && !deferPartSync) {
    partSummary = await syncBuilderParts({
      builderProduct,
      sourceProject: source,
      acceptPrices: false,
      legacyMode: builderProduct.price_state === "legacy_frozen",
      strictCatalogs: strictPartSync,
      catalogsOverride: strictPartSync ? partSyncInputs?.catalogs || null : null,
      existingPartsOverride: strictPartSync ? partSyncInputs?.existingParts || [] : null,
      inventoryRowsOverride: strictPartSync ? partSyncInputs?.inventoryRowsOverride || new Map() : null,
      skipUnchangedWrites,
    });
    if (partSummary.usesDirectLiveReprice) {
      const manualAddonCurrent = num(partSummary.manualAddonCurrentTotal);
      const liveInternalFromParts = num(partSummary.currentPartsTotal) - num(partSummary.currentMarkupTotal);
      const liveBuilderCoreCost = liveInternalFromParts - manualAddonCurrent;
      const markupPercent = num(source?.markup_percent);
      effectiveLiveTotal = liveInternalFromParts;
      effectiveLiveCustomerPrice = liveBuilderCoreCost * (1 + markupPercent / 100) + manualAddonCurrent;
    } else {
      effectiveLiveTotal = liveTotal + num(partSummary.manualAddonCurrentTotal);
      effectiveLiveCustomerPrice = preserveLegacyEconomics
        ? liveCustomerPrice
        : economics.customerPrice + num(partSummary.manualAddonCurrentTotal);
    }
    const frozenAfterSync = num(builderProduct.frozen_cost, acceptedTotal);
    const frozenCustomerAfterSync = hasNumericValue(builderProduct.frozen_customer_price)
      ? num(builderProduct.frozen_customer_price)
      : acceptedCustomerPrice;
    const productPriceState = partSummary.detachedCount > 0
      ? "detached_parts"
      : partSummary.recalcRequired
        ? "changed"
        : builderProduct.price_state === "legacy_frozen"
          ? "legacy_frozen"
          : builderProduct.price_state === "manual"
            ? "manual"
            : partSummary.changedCount > 0 ||
                Math.abs(effectiveLiveTotal - frozenAfterSync) > 0.005 ||
                Math.abs(effectiveLiveCustomerPrice - frozenCustomerAfterSync) > 0.005
              ? "changed"
              : "current";
    const partProductPatch = {
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      current_recalculated_cost: effectiveLiveTotal,
      price_state: productPriceState,
      price_delta: effectiveLiveTotal - frozenAfterSync,
      price_delta_percent: frozenAfterSync ? ((effectiveLiveTotal - frozenAfterSync) / frozenAfterSync) * 100 : 0,
      price_recalc_required: !!partSummary.recalcRequired,
      price_recalc_reason: partSummary.recalcReason || "",
    };
    if (!skipUnchangedWrites || patchDiffers(builderProduct, partProductPatch)) {
      const writePatch = skipUnchangedWrites
        ? { ...partProductPatch, last_price_check_at: timestamp }
        : partProductPatch;
      await base44.entities.BuilderProduct.update(builderProduct.id, writePatch);
      builderProduct = { ...builderProduct, ...writePatch };
    }
  }

  const frozenCost = isNew ? num(builderProduct.frozen_cost) : acceptedTotal;
  const frozenCustomerPrice = hasNumericValue(builderProduct.frozen_customer_price)
    ? num(builderProduct.frozen_customer_price)
    : acceptedCustomerPrice;
  const linePatch = {
    line_id: lineId,
    builder_product_id: builderProduct.id,
    builder_name: builderName,
    client_product_name: clientName,
    product_category: line.product_category || builderProduct.product_category || "",
    production_product_type: line.production_product_type ?? builderProduct.production_product_type ?? "",
    product_notes: line.product_notes ?? builderProduct.product_notes ?? "",
    total_snapshot: frozenCost,
    live_total_snapshot: effectiveLiveTotal,
    customer_price_snapshot: frozenCustomerPrice,
    live_customer_price_snapshot: effectiveLiveCustomerPrice,
    price_state: builderProduct.price_state || (isNew ? "unchecked" : "legacy_frozen"),
    price_recalc_required: !!builderProduct.price_recalc_required,
    price_recalc_reason: builderProduct.price_recalc_reason || "",
    detached_part_count: num(builderProduct.detached_part_count),
    needs_reattach_review: !!builderProduct.needs_reattach_review,
  };
  const lineChanged = patchDiffers(line, linePatch);
  const nextLine = skipUnchangedWrites && !lineChanged
    ? line
    : {
        ...line,
        ...linePatch,
        last_price_check_at: timestamp,
        updated_date_snapshot: source?.updated_date || line.updated_date_snapshot,
      };

  return {
    line: nextLine,
    builderProduct,
    changed: skipUnchangedWrites ? lineChanged : stableStringify(nextLine) !== stableStringify(line),
    partSyncInputs,
  };
}

export async function ensureEstimateBuilderProducts(estimate, { strictReconciliation = false, onWarning = null } = {}) {
  if (!estimate?.id) return estimate;
  const original = estimate.line_items || [];
  const lineItems = [];
  let changed = false;

  for (const line of original) {
    try {
      if (line?.price_acceptance_pending?.kind === "builder_product_remove") {
        // Product removal may already have deleted its owned source and/or Builder.
        // Preserve the exact durable line without reconciliation warnings or writes
        // until the specialized Remove recovery action finishes the operation.
        lineItems.push(line);
        continue;
      }
      let sourceProjectOverride;
      if (strictReconciliation) {
        const mod = getModule(line?.module_key);
        if (mod && line?.project_id) {
          try {
            sourceProjectOverride = await base44.entities[mod.entity].get(line.project_id);
          } catch (error) {
            throw new Error(`${getModuleLabel(line.module_key) || "Builder"} source could not be verified: ${error?.message || "read failed"}`);
          }
          if (!sourceProjectOverride) {
            throw new Error(`${getModuleLabel(line.module_key) || "Builder"} source could not be verified. The saved Product snapshot was retained.`);
          }
        }
      }
      const result = await ensureBuilderProductForLine({
        estimate,
        line,
        isNew: false,
        strictPartSync: strictReconciliation,
        skipUnchangedWrites: strictReconciliation,
        sourceProjectOverride,
      });
      lineItems.push(result.line);
      changed = changed || result.changed;
    } catch (error) {
      if (!strictReconciliation) throw error;
      const warning = {
        line_id: line.line_id || "",
        builder_product_id: line.builder_product_id || "",
        product_name: line.client_product_name || line.project_name || getModuleLabel(line.module_key) || "Product",
        message: error?.message || "This Product could not be verified against its Builder catalogs. The saved Product snapshot was retained.",
      };
      onWarning?.(warning);
      lineItems.push(line);
    }
  }

  if (changed) {
    await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
  }
  return { ...estimate, line_items: lineItems };
}

export async function recordBuilderSave({ estimateId, line, sourceProject, liveTotal, internalCost, customerPrice }) {
  if (!estimateId || !line) return line;
  if (!sourceProject || typeof sourceProject !== "object") {
    throw new Error("The saved Builder source could not be verified. Product pricing and Parts were not synchronized.");
  }
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be verified before synchronizing this Builder save.");
  const currentLine = (estimate.line_items || []).find(
    (item) => item.builder_product_id === line.builder_product_id || item.project_id === line.project_id
  ) || line;

  const existingPending = pendingBuilderMutation(currentLine);
  if (existingPending) {
    if (existingPending.kind === "builder_product_remove") {
      throw new Error("This Product is being removed. Use Resume Product Remove before opening or saving its Builder again.");
    }
    const pendingBuilderId = currentLine.builder_product_id || existingPending.builder_product_id || "";
    const [pendingBuilder, pendingParts] = await Promise.all([
      pendingBuilderId ? base44.entities.BuilderProduct.get(pendingBuilderId) : Promise.resolve(null),
      pendingBuilderId ? base44.entities.BuilderPart.filter({ builder_product_id: pendingBuilderId }) : Promise.resolve([]),
    ]);
    if (!pendingBuilder?.id || !Array.isArray(pendingParts)) {
      throw new Error("The pending initial price acceptance could not verify its Builder Product or Parts. The recovery marker was retained.");
    }
    const recovered = await resumeBuilderMutation({
      estimateId,
      estimate,
      builder: pendingBuilder,
      parts: pendingParts,
      line: currentLine,
      pending: existingPending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan,
    });
    return recovered?.line || currentLine;
  }

  await assertEstimateProductMutationAllowed(estimate);

  const ensured = await ensureBuilderProductForLine({
    estimate,
    line: currentLine,
    isNew: !currentLine.builder_product_id,
    deferPartSync: true,
    sourceProjectOverride: sourceProject ?? undefined,
  });
  const builder = ensured.builderProduct;
  if (builder && !ensured.partSyncInputs) {
    throw new Error("Builder catalogs could not be preverified. Product pricing and Parts were not synchronized.");
  }
  const timestamp = nowIso();
  const sourceTotal = num(liveTotal, sourceProjectTotal(currentLine, sourceProject));
  const economics = sourceProjectEconomics(currentLine.module_key, sourceProject, sourceTotal);
  const nextLiveTotal = hasNumericValue(internalCost) ? num(internalCost) : economics.internalCost;
  const nextLiveCustomerPrice = hasNumericValue(customerPrice) ? num(customerPrice) : economics.customerPrice;
  const previousFrozenTotal = num(builder?.frozen_cost, num(currentLine.total_snapshot));
  const previousFrozenCustomerPrice = hasNumericValue(builder?.frozen_customer_price)
    ? num(builder.frozen_customer_price)
    : acceptedCustomerUnitPrice(currentLine);
  const wantsInitialFreeze = builder?.price_state === "unchecked" && previousFrozenTotal === 0;

  let partSummary = {
    partCount: num(builder?.part_count),
    detachedCount: num(builder?.detached_part_count),
    changedCount: 0,
    newPartCount: 0,
    removedPartCount: 0,
    recalcRequired: false,
    recalcReason: "",
    usesDirectLiveReprice: false,
    currentPartsTotal: 0,
    frozenPartsTotal: 0,
    currentMarkupTotal: 0,
    frozenMarkupTotal: 0,
    manualAddonFrozenTotal: 0,
    manualAddonCurrentTotal: 0,
  };

  if (builder) {
    // Always detect first without accepting prices. A missing inventory link must
    // block the initial freeze just like it blocks later Update Price actions.
    partSummary = await syncBuilderParts({
      builderProduct: builder,
      sourceProject: sourceProject || {},
      acceptPrices: false,
      legacyMode: builder.price_state === "legacy_frozen",
      // This path runs only after the authoritative Builder calculator has
      // produced and saved sourceProject/liveTotal. Mark the current inventory
      // pricing used by that calculation so Update Price can safely accept it.
      builderRecalculated: true,
      strictCatalogs: true,
      catalogsOverride: ensured.partSyncInputs.catalogs,
      existingPartsOverride: ensured.partSyncInputs.existingParts,
      inventoryRowsOverride: ensured.partSyncInputs.inventoryRowsOverride,
    });
  }

  const effectiveLiveTotal = nextLiveTotal + num(partSummary.manualAddonCurrentTotal);
  const effectiveLiveCustomerPrice = nextLiveCustomerPrice + num(partSummary.manualAddonCurrentTotal);
  const canInitialFreeze = wantsInitialFreeze && partSummary.detachedCount === 0;
  const acceptedTotal = canInitialFreeze ? effectiveLiveTotal : previousFrozenTotal;
  const calculatedState = canInitialFreeze
    ? "current"
    : partSummary.changedCount > 0 ||
        Math.abs(effectiveLiveTotal - acceptedTotal) > 0.005 ||
        Math.abs(effectiveLiveCustomerPrice - previousFrozenCustomerPrice) > 0.005
      ? "changed"
      : "current";
  const productState = partSummary.detachedCount > 0
    ? "detached_parts"
    : builder?.price_state === "legacy_frozen"
      ? "legacy_frozen"
      : calculatedState;

  if (builder && canInitialFreeze) {
    // Build the complete frozen Part plan without applying it. The Estimate line
    // recovery marker below must become durable before the first accepted-price
    // write so an interrupted initial freeze can always resume deterministically.
    const partAcceptance = await acceptBuilderPartPrices(builder.id, {
      builderOverride: builder,
      partsOverride: partSummary.parts || [],
      apply: false,
      timestamp,
    });
    if (partAcceptance.detachedCount > 0) {
      // Defensive guard: keep the Product unfrozen until every Part is resolved.
      partSummary.detachedCount = partAcceptance.detachedCount;
    } else {
      const initialAcceptedTotal = effectiveLiveTotal;
      const initialAcceptedCustomerPrice = effectiveLiveCustomerPrice;
      const operationKey = `builder_initial_freeze:${builder.id}:${num(builder.builder_version, 1)}:${snapshotHash({
        estimate_updated_date: estimate.updated_date || "",
        estimate_line_id: currentLine.line_id || ensured.line.line_id || "",
        source_updated_date: sourceProject?.updated_date || "",
        source_hash: snapshotHash(sourceProject || {}),
        total: initialAcceptedTotal,
        customer_price: initialAcceptedCustomerPrice,
        part_updates: partAcceptance.acceptancePlan?.part_updates || [],
      })}`;
      const builderPatch = {
        builder_snapshot: sourceProject || {},
        builder_snapshot_at: timestamp,
        builder_snapshot_source_updated_date: sourceProject?.updated_date || timestamp,
        builder_snapshot_hash: snapshotHash(sourceProject || {}),
        frozen_cost: initialAcceptedTotal,
        frozen_customer_price: initialAcceptedCustomerPrice,
        current_recalculated_cost: effectiveLiveTotal,
        price_state: "current",
        price_delta: 0,
        price_delta_percent: 0,
        price_recalc_required: false,
        price_recalc_reason: "",
        last_price_check_at: timestamp,
        last_price_update_at: timestamp,
        builder_version: num(builder.builder_version, 1) + 1,
        part_count: partSummary.partCount,
        detached_part_count: 0,
        needs_reattach_review: false,
      };
      const linePatch = {
        line_id: currentLine.line_id || ensured.line.line_id,
        builder_product_id: builder.id,
        builder_name: currentLine.builder_name || ensured.line.builder_name,
        client_product_name: currentLine.client_product_name || ensured.line.client_product_name,
        total_snapshot: initialAcceptedTotal,
        live_total_snapshot: effectiveLiveTotal,
        customer_price_snapshot: initialAcceptedCustomerPrice,
        live_customer_price_snapshot: effectiveLiveCustomerPrice,
        price_state: "current",
        price_recalc_required: false,
        price_recalc_reason: "",
        detached_part_count: 0,
        needs_reattach_review: false,
        last_price_check_at: timestamp,
        last_price_update_at: timestamp,
        updated_date_snapshot: sourceProject?.updated_date || timestamp,
      };
      const revision = {
        builder_product_id: builder.id,
        estimate_id: estimateId,
        reason: "initial_freeze",
        previous_total_cost: 0,
        new_total_cost: initialAcceptedTotal,
        previous_customer_price: 0,
        new_customer_price: initialAcceptedCustomerPrice,
        changed_parts: partAcceptance.changedParts || [],
        builder_snapshot_before: builder.builder_snapshot || {},
        builder_snapshot_after: sourceProject || {},
        price_snapshot_before: { total: 0, customer_price: 0 },
        price_snapshot_after: { total: initialAcceptedTotal, customer_price: initialAcceptedCustomerPrice },
        notes: "Initial accepted/frozen product price.",
      };
      const pending = {
        key: operationKey,
        kind: "builder_initial_freeze",
        started_at: timestamp,
        estimate_id: estimateId,
        estimate_line_id: linePatch.line_id || builder.estimate_line_id || "",
        builder_product_id: builder.id,
        builder_updated_date_before: builder.updated_date || "",
        builder_version_before: num(builder.builder_version, 1),
        part_acceptance_plan: partAcceptance.acceptancePlan || {},
        builder_patch: builderPatch,
        line_patch: linePatch,
        revision,
      };

      const preMarkerEstimate = await base44.entities.AllInOneEstimate.get(estimateId);
      if (!preMarkerEstimate) throw new Error("Estimate could not be verified before starting the initial price freeze.");
      if (
        estimate.updated_date &&
        preMarkerEstimate.updated_date &&
        estimate.updated_date !== preMarkerEstimate.updated_date
      ) {
        throw new Error("This estimate changed in another session while the Builder was being saved. Initial pricing was not frozen; reload the Estimate before retrying.");
      }
      const preMarkerLine = (preMarkerEstimate.line_items || []).find((item) =>
        item.builder_product_id === builder.id || (currentLine.project_id && item.project_id === currentLine.project_id)
      );
      if (!preMarkerLine) {
        throw new Error("This Product is no longer part of the estimate. Initial pricing was not frozen.");
      }
      const markedLines = (preMarkerEstimate.line_items || []).map((item) =>
        item === preMarkerLine
          ? {
              ...item,
              line_id: linePatch.line_id,
              builder_product_id: builder.id,
              builder_name: linePatch.builder_name,
              client_product_name: linePatch.client_product_name,
              price_acceptance_pending: pending,
            }
          : item
      );
      await base44.entities.AllInOneEstimate.update(estimateId, { line_items: markedLines });

      const [markedEstimate, currentBuilder, currentParts] = await Promise.all([
        base44.entities.AllInOneEstimate.get(estimateId),
        base44.entities.BuilderProduct.get(builder.id),
        base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
      ]);
      const markedLine = (markedEstimate?.line_items || []).find((item) => item.builder_product_id === builder.id);
      const canonicalPending = pendingBuilderMutation(markedLine);
      if (!canonicalPending || canonicalPending.key !== operationKey) {
        throw new Error("Another Builder price-acceptance operation won the recovery marker race. Reload before continuing.");
      }
      const recovered = await resumeBuilderMutation({
        estimateId,
        estimate: markedEstimate,
        builder: currentBuilder,
        parts: currentParts,
        line: markedLine,
        pending: canonicalPending,
        applyPartPlan: applyBuilderPartPriceAcceptancePlan,
      });
      return recovered?.line || markedLine || currentLine;
    }
  }

  // A successful initial freeze returns through the recovery path above. Reaching
  // this point means this was a normal recalculation/save or the first freeze was
  // blocked by detached Parts, so no accepted-price revision is completed here.
  const initialFreezeCompleted = false;
  const finalAcceptedTotal = initialFreezeCompleted ? effectiveLiveTotal : previousFrozenTotal;
  const finalAcceptedCustomerPrice = initialFreezeCompleted ? effectiveLiveCustomerPrice : previousFrozenCustomerPrice;
  const finalProductState = partSummary.detachedCount > 0
    ? "detached_parts"
    : initialFreezeCompleted
      ? "current"
      : productState;

  if (builder) {
    const nextRevision = num(builder.builder_version, 1) + (initialFreezeCompleted ? 1 : 0);
    await base44.entities.BuilderProduct.update(builder.id, {
      builder_snapshot: sourceProject || {},
      builder_snapshot_at: timestamp,
      builder_snapshot_source_updated_date: sourceProject?.updated_date || timestamp,
      builder_snapshot_hash: snapshotHash(sourceProject || {}),
      frozen_cost: finalAcceptedTotal,
      frozen_customer_price: finalAcceptedCustomerPrice,
      current_recalculated_cost: effectiveLiveTotal,
      price_state: finalProductState,
      price_delta: effectiveLiveTotal - finalAcceptedTotal,
      price_delta_percent: finalAcceptedTotal ? ((effectiveLiveTotal - finalAcceptedTotal) / finalAcceptedTotal) * 100 : 0,
      // The authoritative Builder calculator just ran, so any earlier stale-catalog
      // block is now resolved even if the user has not accepted the new price yet.
      price_recalc_required: false,
      price_recalc_reason: "",
      last_price_check_at: timestamp,
      last_price_update_at: initialFreezeCompleted ? timestamp : builder.last_price_update_at,
      builder_version: nextRevision,
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
    });

  }

  const nextLines = (estimate.line_items || []).map((item) => {
    if (item.project_id !== currentLine.project_id && item.builder_product_id !== builder?.id) return item;
    return {
      ...item,
      line_id: item.line_id || ensured.line.line_id,
      builder_product_id: builder?.id || item.builder_product_id,
      builder_name: item.builder_name || ensured.line.builder_name,
      client_product_name: item.client_product_name || ensured.line.client_product_name,
      total_snapshot: finalAcceptedTotal,
      live_total_snapshot: effectiveLiveTotal,
      customer_price_snapshot: finalAcceptedCustomerPrice,
      live_customer_price_snapshot: effectiveLiveCustomerPrice,
      price_state: finalProductState,
      price_recalc_required: false,
      price_recalc_reason: "",
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      last_price_check_at: timestamp,
      last_price_update_at: initialFreezeCompleted ? timestamp : item.last_price_update_at,
      updated_date_snapshot: sourceProject?.updated_date || timestamp,
    };
  });
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: nextLines });
  return nextLines.find((item) => item.project_id === currentLine.project_id) || currentLine;
}

export async function deleteBuilderProductCascade(builderProductId) {
  if (!builderProductId) return;
  const [parts, groups, revisions] = await Promise.all([
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }).catch(() => []),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }).catch(() => []),
    base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId }).catch(() => []),
  ]);
  await Promise.all((parts || []).map((row) => base44.entities.BuilderPart.delete(row.id).catch(() => null)));
  await Promise.all((groups || []).map((row) => base44.entities.BuilderPartGroup.delete(row.id).catch(() => null)));
  await Promise.all((revisions || []).map((row) => base44.entities.BuilderPriceRevision.delete(row.id).catch(() => null)));
  await base44.entities.BuilderProduct.delete(builderProductId).catch(() => null);
}


export async function acceptBuilderPrice({ estimateId, line, note = "Price updated from current builder calculation.", expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !line?.builder_product_id) return null;
  const [estimate, builder, parts] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(line.builder_product_id),
    base44.entities.BuilderPart.filter({ builder_product_id: line.builder_product_id }),
  ]);
  if (!estimate || !builder) throw new Error("Estimate pricing could not be verified. Reload before updating this Product price.");
  if (!Array.isArray(parts)) throw new Error("Builder Parts could not be verified. No price was accepted.");
  if (builder.estimate_id && builder.estimate_id !== estimateId) {
    throw new Error("This Builder Product no longer belongs to the current estimate. Reload before updating its price.");
  }
  const verifiedEstimateLine = (estimate.line_items || []).find((item) => item.builder_product_id === builder.id);
  if (!verifiedEstimateLine) throw new Error("This Product is no longer part of the estimate. Reload before updating its price.");
  if (builder.estimate_line_id && verifiedEstimateLine.line_id && builder.estimate_line_id !== verifiedEstimateLine.line_id) {
    throw new Error("This Product line changed since its Builder was linked. Reload before updating its price.");
  }
  if (parts.some((part) => part?.builder_product_id !== builder.id)) {
    throw new Error("One or more Builder Parts no longer belong to this Product. Reload before updating its price.");
  }

  const existingPending = pendingBuilderMutation(verifiedEstimateLine);
  if (existingPending) {
    return resumeBuilderMutation({
      estimateId,
      estimate,
      builder,
      parts,
      line: verifiedEstimateLine,
      pending: existingPending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan,
    });
  }

  // If the final Estimate write succeeded but its response was lost, the browser
  // may retry with the pre-operation timestamp. Verify the complete accepted
  // server state before enforcing that stale timestamp so the retry becomes a
  // no-op instead of creating a second pricing operation.
  const serverAlreadyCurrent =
    builder.price_state === "current" &&
    verifiedEstimateLine.price_state === "current" &&
    sameNumber(builder.frozen_cost, builder.current_recalculated_cost) &&
    sameNumber(verifiedEstimateLine.total_snapshot, verifiedEstimateLine.live_total_snapshot) &&
    sameNumber(acceptedCustomerUnitPrice(verifiedEstimateLine), liveCustomerUnitPrice(verifiedEstimateLine));
  if (serverAlreadyCurrent) {
    return { blocked: false, alreadyCompleted: true, changedParts: [], line: verifiedEstimateLine };
  }

  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const timestamp = nowIso();
  const partAcceptance = await acceptBuilderPartPrices(builder.id, {
    builderOverride: builder,
    partsOverride: parts,
    apply: false,
    timestamp,
  });
  if (partAcceptance.detachedCount > 0) {
    const blockedTimestamp = nowIso();
    await base44.entities.BuilderProduct.update(builder.id, {
      price_state: "detached_parts",
      detached_part_count: partAcceptance.detachedCount,
      needs_reattach_review: true,
      last_price_check_at: blockedTimestamp,
    });
    const blockedLines = (estimate.line_items || []).map((item) =>
      item.builder_product_id === builder.id
        ? {
            ...item,
            price_state: "detached_parts",
            detached_part_count: partAcceptance.detachedCount,
            needs_reattach_review: true,
            last_price_check_at: blockedTimestamp,
          }
        : item
    );
    await base44.entities.AllInOneEstimate.update(estimateId, { line_items: blockedLines });
    return {
      blocked: true,
      reason: "detached_parts",
      detachedCount: partAcceptance.detachedCount,
      detachedParts: partAcceptance.detachedParts || [],
      line: blockedLines.find((item) => item.builder_product_id === builder.id) || line,
    };
  }

  if (partAcceptance.recalcRequired) {
    const blockedTimestamp = nowIso();
    const reason = partAcceptance.recalcReason || "Master Inventory changed after this Builder was last calculated. Reopen and save the Builder before accepting Update Price.";
    await base44.entities.BuilderProduct.update(builder.id, {
      price_state: "changed",
      price_recalc_required: true,
      price_recalc_reason: reason,
      last_price_check_at: blockedTimestamp,
    });
    const blockedLines = (estimate.line_items || []).map((item) =>
      item.builder_product_id === builder.id
        ? {
            ...item,
            price_state: "changed",
            price_recalc_required: true,
            price_recalc_reason: reason,
            last_price_check_at: blockedTimestamp,
          }
        : item
    );
    await base44.entities.AllInOneEstimate.update(estimateId, { line_items: blockedLines });
    return {
      blocked: true,
      reason: "recalc_required",
      recalcReason: reason,
      recalcParts: partAcceptance.recalcParts || [],
      line: blockedLines.find((item) => item.builder_product_id === builder.id) || line,
    };
  }

  const currentEstimateLine = verifiedEstimateLine;
  const previousTotal = num(builder.frozen_cost, num(currentEstimateLine.total_snapshot));
  const nextTotal = num(builder.current_recalculated_cost, num(currentEstimateLine.live_total_snapshot, previousTotal));
  const previousCustomerPrice = hasNumericValue(builder.frozen_customer_price)
    ? num(builder.frozen_customer_price)
    : acceptedCustomerUnitPrice(currentEstimateLine);
  const nextCustomerPrice = liveCustomerUnitPrice(currentEstimateLine);
  const noServerChange =
    sameNumber(previousTotal, nextTotal) &&
    sameNumber(previousCustomerPrice, nextCustomerPrice) &&
    (partAcceptance.changedParts || []).length === 0 &&
    builder.price_state === "current" &&
    currentEstimateLine.price_state === "current";
  if (noServerChange) {
    return { blocked: false, alreadyCompleted: true, changedParts: [], line: currentEstimateLine };
  }

  const operationKey = `builder_update_price:${builder.id}:${num(builder.builder_version, 1)}:${snapshotHash({
    estimate_updated_date: estimate.updated_date || "",
    estimate_line_id: currentEstimateLine.line_id || "",
    previous_total: previousTotal,
    next_total: nextTotal,
    previous_customer_price: previousCustomerPrice,
    next_customer_price: nextCustomerPrice,
    part_updates: partAcceptance.acceptancePlan?.part_updates || [],
  })}`;
  const builderPatch = {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    price_recalc_required: false,
    price_recalc_reason: "",
    detached_part_count: 0,
    needs_reattach_review: false,
    part_count: partAcceptance.activePartCount ?? builder.part_count,
    last_price_update_at: timestamp,
    last_price_update_note: note,
    last_price_check_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  };
  const linePatch = {
    total_snapshot: nextTotal,
    live_total_snapshot: nextTotal,
    customer_price_snapshot: nextCustomerPrice,
    live_customer_price_snapshot: nextCustomerPrice,
    price_state: "current",
    price_recalc_required: false,
    price_recalc_reason: "",
    detached_part_count: 0,
    needs_reattach_review: false,
    last_price_update_at: timestamp,
    last_price_check_at: timestamp,
  };
  const revision = {
    builder_product_id: builder.id,
    estimate_id: estimateId,
    reason: "update_price",
    previous_total_cost: previousTotal,
    new_total_cost: nextTotal,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: partAcceptance.changedParts || [],
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousTotal, customer_price: previousCustomerPrice },
    price_snapshot_after: { total: nextTotal, customer_price: nextCustomerPrice },
    notes: note,
  };
  const pending = {
    key: operationKey,
    kind: "builder_update_price",
    started_at: timestamp,
    estimate_id: estimateId,
    estimate_line_id: currentEstimateLine.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num(builder.builder_version, 1),
    part_acceptance_plan: partAcceptance.acceptancePlan || {},
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision,
  };

  // The Estimate line marker is the first write. It survives any later network or
  // multi-record failure and is removed only by the final accepted line write.
  const markedLines = (estimate.line_items || []).map((item) =>
    item.builder_product_id === builder.id
      ? { ...item, price_acceptance_pending: pending }
      : item
  );
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: markedLines });

  // Re-read all mutable inputs after the marker is durable. If a concurrent edit
  // won the race, the stored expected versions make recovery fail closed rather
  // than mixing two Product states.
  const [markedEstimate, currentBuilder, currentParts] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(builder.id),
    base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
  ]);
  const markedLine = (markedEstimate?.line_items || []).find((item) => item.builder_product_id === builder.id);
  const canonicalPending = pendingBuilderMutation(markedLine);
  if (!canonicalPending || canonicalPending.key !== operationKey) {
    throw new Error("Another Update Price operation won the recovery marker race. Reload before continuing.");
  }

  return resumeBuilderMutation({
    estimateId,
    estimate: markedEstimate,
    builder: currentBuilder,
    parts: currentParts,
    line: markedLine,
    pending: canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan,
  });
}
