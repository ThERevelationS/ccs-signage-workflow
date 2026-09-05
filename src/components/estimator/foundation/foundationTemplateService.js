import { base44 } from "@/api/base44Client";
import { ensureReusableRecord } from "@/components/estimator/products/reusableSaveIdempotency";

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

  try {
    await base44.entities.ProjectTemplate.delete(id);
    return true;
  } catch (error) {
    const stillThere = await base44.entities.ProjectTemplate.filter({ id }).catch(() => null);
    if (!Array.isArray(stillThere) || stillThere.some((row) => row.id === id)) throw error;
    return true;
  }
}
