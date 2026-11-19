// stub:@/api/base44Client
var base44 = { entities: { ProjectTemplate: { get: (id) => globalThis.__tplGet(id) } } };

// stub:@/components/estimator/products/reusableSaveIdempotency
var ensureReusableRecord = (a) => (globalThis.__tplSave || ((x) => ({ id: "t1", ...x.data })))(a);

// stub:@/components/estimator/builder/builderEntityPersistence
var deleteEntityIfUnchanged = async (a) => {
  globalThis.__deletes.push(a);
  return true;
};

// .audit-work/foundation-o014-templates/candidates/src/components/estimator/foundation/foundationTemplateService.js
async function saveFoundationTemplate({ idempotencyKey, data }) {
  return ensureReusableRecord({
    entity: base44.entities.ProjectTemplate,
    idempotencyKey,
    data,
    label: "Foundation template"
  });
}
var isNotFound = (e) => {
  const status = Number(e?.status || e?.response?.status || e?.response?.statusCode || e?.data?.status || 0);
  if (status === 404) return true;
  const message = [
    e?.message,
    e?.response?.data?.message,
    e?.response?.data?.error,
    e?.data?.message,
    e?.data?.error
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  return message.includes("not found") || message.includes("does not exist");
};
async function deleteFoundationTemplate(templateId) {
  const id = String(templateId || "").trim();
  if (!id) throw new Error("Foundation template id is required.");
  let current;
  try {
    current = await base44.entities.ProjectTemplate.get(id);
  } catch (e) {
    if (isNotFound(e)) return true;
    throw e;
  }
  if (current === null || current === void 0 || typeof current !== "object" || Array.isArray(current) || current.id !== id) {
    throw new Error("Foundation template record could not be verified; delete aborted.");
  }
  await deleteEntityIfUnchanged({
    entity: base44.entities.ProjectTemplate,
    record: current,
    label: "Foundation template"
  });
  return true;
}
export {
  deleteFoundationTemplate,
  saveFoundationTemplate
};
