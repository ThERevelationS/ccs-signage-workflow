// Read-only recovery for interrupted SIPS checklist saves.
// A matching latest record establishes the requested state, not which
// session performed the write. Never issue another write from this helper.
const normalize = value => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = normalize(value[key]);
      return out;
    }, {});
  }
  return value;
};

const sameField = (a, b) =>
  (a == null || a === "") && (b == null || b === "") ||
  JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

// These are explicit server rejections (not ambiguous transport failures).
// Do not reinterpret a rejection as a successful write based on coincidental
// matches to a previous or concurrent record.
export function isDefinitiveSipsSaveRejection(error) {
  return /(?:this field changed in another session|the record no longer matches its loaded state|this record is in trash|this record changed during saving|the record changed\. reload before saving|this task is no longer configured for sips or wip|sips task configuration could not be verified|this work order is no longer active for sips)/i
    .test(String(error?.message || ""));
}

export async function reconcileInterruptedSipsSave({ workOrderId, nextFields, guardFields, readWorkOrders }) {
  if (!workOrderId || typeof readWorkOrders !== "function" || !nextFields || !guardFields) {
    return { verified: false };
  }
  try {
    const rows = await readWorkOrders({ id: workOrderId });
    if (!Array.isArray(rows) || rows.length !== 1) return { verified: false };
    const record = rows[0];
    if (!record || record.id !== workOrderId || record.deleted === true) return { verified: false };
    if (!Object.entries(nextFields).every(([key, value]) => sameField(record[key], value))) {
      return { verified: false };
    }
    if (!Object.entries(guardFields).every(([key, value]) =>
      Object.prototype.hasOwnProperty.call(nextFields, key) || sameField(record[key], value)
    )) return { verified: false };
    return { verified: true, record };
  } catch {
    // Network/read failures cannot prove the outcome. Preserve local edits.
    return { verified: false };
  }
}
