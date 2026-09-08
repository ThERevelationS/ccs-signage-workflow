function loadedVersion(workOrder, label) {
  const id = String(workOrder?.id || "").trim();
  const updatedDate = String(workOrder?.updated_date || "").trim();
  if (!id || !updatedDate) {
    throw new Error(`${label} is missing a loaded Work Order version. Reload before reordering.`);
  }
  return { id, updatedDate };
}

function buildSnapshotMap(items, label) {
  if (!Array.isArray(items)) {
    throw new Error(`${label} could not verify the loaded priority list.`);
  }
  const map = new Map();
  for (const item of items) {
    const { id, updatedDate } = loadedVersion(item, label);
    if (map.has(id)) {
      throw new Error(`${label} found a duplicate Work Order id. Nothing was reordered.`);
    }
    map.set(id, { item, updatedDate });
  }
  return map;
}

function priorityEquals(value, expected) {
  return typeof value === "number" && Number.isFinite(value) && value === expected;
}

function assertSameCohortAndVersions(loadedItems, currentItems, label) {
  const loaded = buildSnapshotMap(loadedItems, label);
  const current = buildSnapshotMap(currentItems, label);

  if (loaded.size !== current.size) {
    throw new Error(`${label} was blocked because the visible Work Order list changed after it was loaded. Nothing was reordered.`);
  }

  for (const [id, expected] of loaded) {
    const latest = current.get(id);
    if (!latest || latest.updatedDate !== expected.updatedDate) {
      throw new Error(`${label} was blocked because at least one visible Work Order changed after the list was loaded. Nothing was reordered.`);
    }
  }

  return loaded;
}

function assertReorderedCohortMatchesLoaded(loadedItems, reorderedItems, label) {
  const loaded = buildSnapshotMap(loadedItems, label);
  const reordered = buildSnapshotMap(reorderedItems, label);

  if (loaded.size !== reordered.size) {
    throw new Error(`${label} received an incomplete priority list. Nothing was reordered.`);
  }

  for (const [id, expected] of loaded) {
    const next = reordered.get(id);
    if (!next || next.updatedDate !== expected.updatedDate) {
      throw new Error(`${label} received a stale or mismatched priority list. Nothing was reordered.`);
    }
  }

  return loaded;
}

async function readById(entity, id, label) {
  if (typeof entity?.filter !== "function") {
    throw new Error(`${label} could not verify a Work Order after a priority update.`);
  }
  const rows = await entity.filter({ id }, "created_date", 2, 0);
  if (!Array.isArray(rows)) {
    throw new Error(`${label} could not verify a Work Order after a priority update.`);
  }
  if (rows.length > 1) {
    throw new Error(`${label} found an ambiguous Work Order id. Stop and reload before retrying.`);
  }
  return rows[0] || null;
}

function partialProgressError(label, confirmed, total, detail) {
  if (confirmed <= 0) {
    return new Error(`${label} was blocked before any required priority changes were confirmed. ${detail}`);
  }
  return new Error(
    `${label} stopped after ${confirmed} of ${total} required priority changes were confirmed. ` +
    `Those ${confirmed} change${confirmed === 1 ? " may" : "s may"} already be saved. ${detail}`
  );
}

export async function reorderWorkOrdersFromLoadedSnapshot({
  entity,
  loadedItems,
  reorderedItems,
  readCurrentItems,
  label = "Work Order priority reorder",
}) {
  if (typeof entity?.updateMany !== "function" || typeof readCurrentItems !== "function") {
    throw new Error(`${label} could not initialize protected priority persistence.`);
  }

  const loaded = assertReorderedCohortMatchesLoaded(loadedItems, reorderedItems, label);

  // Full cohort preflight. A new/removed row or ANY newer version blocks before
  // this multi-record operation starts so an old drag cannot rewrite a newer order.
  const currentBefore = await readCurrentItems();
  assertSameCohortAndVersions(loadedItems, currentBefore, label);

  // Preserve the existing 0..N priority semantics, but mutate only rows whose
  // saved priority actually needs to change for the requested order.
  const plan = reorderedItems.flatMap((item, index) => {
    const expected = loaded.get(String(item.id));
    if (priorityEquals(expected.item.priority, index)) return [];
    return [{
      id: String(item.id),
      updatedDate: expected.updatedDate,
      desiredPriority: index,
    }];
  });

  let confirmed = 0;
  let converged = 0;

  for (const step of plan) {
    try {
      const result = await entity.updateMany(
        { id: step.id, updated_date: step.updatedDate },
        { $set: { priority: step.desiredPriority } }
      );

      if (result?.updated === 1) {
        confirmed += 1;
        continue;
      }
      if ((result?.updated || 0) > 1) {
        throw new Error("The server reported an impossible multi-record priority update count.");
      }

      const latest = await readById(entity, step.id, label);
      if (latest && priorityEquals(latest.priority, step.desiredPriority)) {
        confirmed += 1;
        converged += 1;
        continue;
      }

      throw new Error("A Work Order changed while the reorder was being saved. No newer value was overwritten.");
    } catch (error) {
      // If the request may have succeeded but its response was lost, converge
      // only after independently confirming the exact desired priority.
      let latest = null;
      try {
        latest = await readById(entity, step.id, label);
      } catch (verificationError) {
        throw partialProgressError(
          label,
          confirmed,
          plan.length,
          `The current outcome could not be verified. Stop and reload before retrying. ${verificationError?.message || ""}`.trim()
        );
      }

      if (latest && priorityEquals(latest.priority, step.desiredPriority)) {
        confirmed += 1;
        converged += 1;
        continue;
      }

      throw partialProgressError(
        label,
        confirmed,
        plan.length,
        `${error?.message || "A concurrent priority change was detected."} Reload the current order before retrying.`
      );
    }
  }

  // Final complete-cohort verification catches rows that entered/left this page
  // or priorities changed while the sequential operation was in flight.
  let currentAfter;
  try {
    currentAfter = await readCurrentItems();
  } catch (error) {
    throw partialProgressError(
      label,
      confirmed,
      plan.length,
      `All planned priority changes were processed, but the final visible list could not be verified. ${error?.message || "Reload before retrying."}`
    );
  }

  const finalMap = buildSnapshotMap(currentAfter, label);
  if (finalMap.size !== reorderedItems.length || reorderedItems.some((item) => !finalMap.has(String(item.id)))) {
    throw partialProgressError(
      label,
      confirmed,
      plan.length,
      "The visible Work Order list changed while the reorder was being saved. Reload to review the current order."
    );
  }

  for (let index = 0; index < reorderedItems.length; index += 1) {
    const latest = finalMap.get(String(reorderedItems[index].id))?.item;
    if (!latest || !priorityEquals(latest.priority, index)) {
      throw partialProgressError(
        label,
        confirmed,
        plan.length,
        "The final priority order changed before it could be verified. Reload to review the current order."
      );
    }
  }

  return {
    items: currentAfter,
    planned: plan.length,
    confirmed,
    converged,
  };
}
