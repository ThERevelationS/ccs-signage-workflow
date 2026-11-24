import { staffEntities } from "@/components/staff/staffEntities";
import { ensureReusableRecord } from "@/components/estimator/products/reusableSaveIdempotency";
import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

export async function saveFoundationTemplate({ idempotencyKey, data }) {
  return ensureReusableRecord({
    entity: staffEntities.ProjectTemplate,
    idempotencyKey,
    data,
    label: "Foundation template",
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

export async function deleteFoundationTemplate(templateId) {
  const id = String(templateId || "").trim();
  if (!id) throw new Error("Foundation template id is required.");

  let current;
  try {
    current = await staffEntities.ProjectTemplate.get(id);
  } catch (e) {
    if (isNotFound(e)) return true;
    throw e;
  }
  if (current === null || current === undefined || typeof current !== "object" || Array.isArray(current) || current.id !== id) {
    throw new Error("Foundation template record could not be verified; delete aborted.");
  }
  await deleteEntityIfUnchanged({
    entity: staffEntities.ProjectTemplate,
    record: current,
    label: "Foundation template",
  });
  return true;
}
