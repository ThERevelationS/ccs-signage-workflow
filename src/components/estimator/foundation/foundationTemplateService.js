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

const isNotFound = (e) => e?.status === 404 || e?.response?.status === 404;

export async function deleteFoundationTemplate(templateId) {
  const id = String(templateId || "").trim();
  if (!id) throw new Error("Foundation template id is required.");

  let current;
  try {
    current = await base44.entities.ProjectTemplate.get(id);
  } catch (e) {
    if (isNotFound(e)) return true;
    throw e;
  }
  if (current === null || current === undefined || typeof current !== "object" || Array.isArray(current) || current.id !== id) {
    throw new Error("Foundation template record could not be verified; delete aborted.");
  }
  await deleteEntityIfUnchanged({
    entity: base44.entities.ProjectTemplate,
    record: current,
    label: "Foundation template",
  });
  return true;
}

