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

export async function deleteModuleTemplate(templateId, label = "Module template") {
  const id = String(templateId || "").trim();
  if (!id) throw new Error(`${label} id is required.`);

  const current = await base44.entities.ProjectTemplate.get(id).catch(() => null);
  if (!current) return true;
  await deleteEntityIfUnchanged({
    entity: base44.entities.ProjectTemplate,
    record: current,
    label,
  });
  return true;
}
