import { base44 } from "@/api/base44Client";
import { ensureReusableRecord } from "@/components/estimator/products/reusableSaveIdempotency";
import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

// Generic module-keyed template persistence on the shared ProjectTemplate
// entity. Mirrors foundationTemplateService exactly so every estimator module
// gets identical idempotent save/list/delete semantics without duplicating the
// recovery logic per module (#79).
export async function saveModuleTemplate({ moduleKey, idempotencyKey, data, label = "Module template" }) {
  return ensureReusableRecord({
    entity: base44.entities.ProjectTemplate,
    idempotencyKey,
    data: { ...data, module_key: moduleKey },
    label,
  });
}

export async function listModuleTemplates({ moduleKey }) {
  return loadAllEntityRows({
    entity: base44.entities.ProjectTemplate,
    query: { module_key: moduleKey },
    sort: "created_date",
    label: "Module templates",
  });
}

// Mirrors the canonical not-found detection in builderEntityPersistence
// (isEntityNotFoundError): a genuinely-missing record is "already gone" while
// every other fetch failure stays an error so the UI never drops a live row.
// All message fields are scanned (not just the first) so a generic top-level
// message cannot hide a nested "not found" detail.
const isNotFound = (e) => {
  const status = Number(e?.status || e?.response?.status || e?.response?.statusCode || e?.data?.status || 0);
  if (status === 404) return true;
  const message = [
    e?.message,
    e?.response?.data?.message,
    e?.response?.data?.error,
    e?.data?.message,
    e?.data?.error,
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  return message.includes("not found") || message.includes("does not exist");
};

export async function deleteModuleTemplate(templateId, label = "Module template") {
  const id = String(templateId || "").trim();
  if (!id) throw new Error(`${label} id is required.`);

  let current;
  try {
    current = await base44.entities.ProjectTemplate.get(id);
  } catch (e) {
    // Only a definitive not-found is "already gone" — a transient read error
    // (500/429/timeout) must NOT mint a false delete-success; rethrow so the
    // dialog surfaces the failure instead of dropping a live row.
    if (isNotFound(e)) return true;
    throw e;
  }
  if (current === null || current === undefined || typeof current !== "object" || Array.isArray(current) || current.id !== id) {
    throw new Error(`${label} record could not be verified; delete aborted.`);
  }
  await deleteEntityIfUnchanged({
    entity: base44.entities.ProjectTemplate,
    record: current,
    label,
  });
  return true;
}