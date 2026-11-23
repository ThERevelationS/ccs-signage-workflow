import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const BATCH_WINDOW_MS = 30;
const MAX_BATCH_IDS = 200;
let pending = new Map();

async function loadChunk(entries) {
  const ids = entries.map(([id]) => id);
  const query = { builder_product_id: ids.length === 1 ? ids[0] : { $in: ids } };
  try {
    const [parts, groups] = await Promise.all([
      loadAllEntityRows({ entity: staffEntities.BuilderPart, query, sort: "sort_order", label: "Builder Parts panel Parts" }),
      loadAllEntityRows({ entity: staffEntities.BuilderPartGroup, query, sort: "sort_order", label: "Builder Parts panel Groups" }),
    ]);
    const byId = new Map(ids.map((id) => [id, { parts: [], groups: [] }]));
    for (const part of parts) byId.get(part?.builder_product_id)?.parts.push(part);
    for (const group of groups) byId.get(group?.builder_product_id)?.groups.push(group);
    for (const [id, callers] of entries) {
      const result = byId.get(id);
      for (const { resolve } of callers) resolve({ parts: [...result.parts], groups: [...result.groups] });
    }
  } catch (error) {
    for (const [, callers] of entries) {
      for (const { reject } of callers) reject(error);
    }
  }
}

function flush() {
  const entries = [...pending];
  pending = new Map();
  for (let i = 0; i < entries.length; i += MAX_BATCH_IDS) {
    void loadChunk(entries.slice(i, i + MAX_BATCH_IDS));
  }
}

export function loadBuilderPartsAndGroups(builderProductId) {
  return new Promise((resolve, reject) => {
    if (!pending.size) setTimeout(flush, BATCH_WINDOW_MS);
    const callers = pending.get(builderProductId) || [];
    callers.push({ resolve, reject });
    pending.set(builderProductId, callers);
  });
}
