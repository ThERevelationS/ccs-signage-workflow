import { base44 } from "@/api/base44Client";
import { ensureReusableRecord } from "@/components/estimator/products/reusableSaveIdempotency";
import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

export async function saveFoundationTemplate({ idempotencyKey, data }) {
  return ensureReusableRecord({
    entity: base44.entities.ProjectTemplate,
    idempotencyKey,
    data,
    label: "Foundation template",
  });
}

export async function deleteFoundationTemplate(templateId) {
  const id = String(templateId || "").trim();
  if (!id) throw new Error("Foundation template id is required.");

  const current = await base44.entities.ProjectTemplate.get(id).catch(() => null);
  if (!current) return true;
  await deleteEntityIfUnchanged({
    entity: base44.entities.ProjectTemplate,
    record: current,
    label: "Foundation template",
  });
  return true;
}
