const ENTITY_SYSTEM_FIELDS = new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by",
  "created_by_id",
  "is_sample",
]);

export function cloneSnapshot(value) {
  if (Array.isArray(value)) return value.map(cloneSnapshot);
  if (!value || typeof value !== "object") return value;
  const out = {};
  Object.entries(value).forEach(([key, item]) => {
    out[key] = cloneSnapshot(item);
  });
  return out;
}

export function stripEntitySystemFields(value) {
  const cloned = cloneSnapshot(value);
  if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) return cloned;
  ENTITY_SYSTEM_FIELDS.forEach((key) => delete cloned[key]);
  return cloned;
}
