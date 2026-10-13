// Read-only three-way reconciliation for confidential Admin HR drafts.
// Preserve verified latest fields. Never write data or infer a contact identity.
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const ownValue = (obj, key) => obj && hasOwn(obj, key) ? obj[key] : undefined;
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const normalize = value => Array.isArray(value)
  ? value.map(normalize)
  : isRecord(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
    : value;
const equal = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

// Define rather than assign so even an unexpected "__proto__" data key cannot
// modify the object's prototype.
function applyOwn(result, source, key) {
  if (!source || !hasOwn(source, key)) {
    delete result[key];
  } else {
    Object.defineProperty(result, key, {
      value: source[key], writable: true, configurable: true, enumerable: true
    });
  }
}

function contactIdentity(contact) {
  if (!isRecord(contact) || typeof contact.name !== "string" ||
      typeof contact.relationship !== "string") return null;
  const name = contact.name.trim();
  const relationship = contact.relationship.trim();
  if (!name || !relationship) return null;
  return JSON.stringify([name, relationship]);
}

// Legacy HR contacts have no immutable ID. Only permit per-field comparison
// when all three snapshots have an identical, uniquely identifiable ordered
// list; structural changes and ambiguous contacts stay atomic.
function canCompareContacts(baseline, latest, draft) {
  if (![baseline, latest, draft].every(Array.isArray) ||
      baseline.length !== latest.length || baseline.length !== draft.length) return false;
  const seen = new Set();
  return baseline.every((contact, index) => {
    const key = contactIdentity(contact);
    if (!key || seen.has(key) || key !== contactIdentity(latest[index]) ||
        key !== contactIdentity(draft[index])) return false;
    seen.add(key);
    return true;
  });
}

export function reconcileHrDraft({ baseline, latest, draft, overwriteConflicts = false }) {
  if (![baseline, latest, draft].every(isRecord)) {
    throw new Error("HR comparison requires verified records.");
  }
  const conflictFields = [];
  const editedFields = [];

  function mergeRecord(base, fresh, local, prefix) {
    const merged = { ...fresh };
    for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local || {})])) {
      const path = prefix ? `${prefix}.${key}` : key;
      const baseValue = ownValue(base, key);
      const latestValue = ownValue(fresh, key);
      const draftValue = ownValue(local, key);
      if (equal(baseValue, draftValue)) continue;

      if (path === "clothing_sizes" && isRecord(local && local[key]) &&
          isRecord(fresh && fresh[key]) && (isRecord(baseValue) || baseValue === undefined)) {
        // Merge only individual size fields, preserving unrelated latest sizes.
        applyMerged(merged, key, mergeRecord(baseValue || {}, latestValue, draftValue, path));
      } else if (path === "emergency_contacts" &&
                 canCompareContacts(baseValue, latestValue, draftValue)) {
        // Contact positions and name/relationship have been verified unchanged.
        const nextContacts = latestValue.map((contact, index) =>
          mergeRecord(baseValue[index], contact, draftValue[index], `${path}[${index}]`));
        applyMerged(merged, key, nextContacts);
      } else {
        editedFields.push(path);
        const conflicts = !equal(baseValue, latestValue) && !equal(draftValue, latestValue);
        if (conflicts) conflictFields.push(path);
        if (!conflicts || overwriteConflicts) applyOwn(merged, local, key);
      }
    }
    return merged;
  }

  function applyMerged(target, key, value) {
    Object.defineProperty(target, key, {
      value, writable: true, configurable: true, enumerable: true
    });
  }

  const merged = mergeRecord(baseline, latest, draft, "");
  return { merged, conflictFields, editedFields };
}

// Preview the exact resolution outcome without exposing sensitive field values.
// Use the same reconciler that applies a choice, then classify per-field changes.
export function previewHrResolution({ baseline, latest, draft, choice = "prefer-latest" }) {
  if (!["latest", "prefer-latest", "keep-conflicts"].includes(choice)) {
    throw new Error("Unsupported HR resolution choice.");
  }
  const result = choice === "latest"
    ? (isRecord(baseline) && isRecord(latest) && isRecord(draft)
        ? latest : null)
    : reconcileHrDraft({
        baseline, latest, draft, overwriteConflicts: choice === "keep-conflicts"
      }).merged;
  if (!result) throw new Error("HR comparison requires verified records.");

  const fields = [];
  function inspectRecord(base, fresh, local, chosen, prefix) {
    for (const key of new Set([
      ...Object.keys(base || {}), ...Object.keys(fresh || {}), ...Object.keys(local || {})
    ])) {
      const path = prefix ? `${prefix}.${key}` : key;
      const oldValue = ownValue(base, key);
      const freshValue = ownValue(fresh, key);
      const draftValue = ownValue(local, key);
      const chosenValue = ownValue(chosen, key);
      if (equal(oldValue, freshValue) && equal(oldValue, draftValue)) continue;

      if (path === "clothing_sizes" && (isRecord(oldValue) || oldValue === undefined) &&
          isRecord(freshValue) && isRecord(draftValue)) {
        inspectRecord(oldValue || {}, freshValue, draftValue, chosenValue || {}, path);
      } else if (path === "emergency_contacts" &&
                 canCompareContacts(oldValue, freshValue, draftValue)) {
        oldValue.forEach((contact, index) =>
          inspectRecord(contact, freshValue[index], draftValue[index],
            chosenValue[index], `${path}[${index}]`));
      } else {
        const mineChanged = !equal(oldValue, draftValue);
        const latestChanged = !equal(oldValue, freshValue);
        const conflict = mineChanged && latestChanged && !equal(draftValue, freshValue);
        const outcome = mineChanged && latestChanged && !conflict ? "agreed" :
          mineChanged && equal(chosenValue, draftValue) ? (conflict ? "overwritten" : "mine") :
          mineChanged ? "latest-over-mine" : "latest";
        fields.push({ path, label: formatHrFieldPath(path), outcome, conflict });
      }
    }
  }
  inspectRecord(baseline, latest, draft, result, "");
  return {
    choice,
    fields,
    counts: {
      mine: fields.filter(field => field.outcome === "mine").length,
      latest: fields.filter(field =>
        field.outcome === "latest" || field.outcome === "latest-over-mine").length,
      overwritten: fields.filter(field => field.outcome === "overwritten").length,
      agreed: fields.filter(field => field.outcome === "agreed").length
    }
  };
}

export function formatHrFieldPath(path) {
  const size = /^clothing_sizes\.([^.[\]]+)$/.exec(path);
  if (size) return `Clothing size: ${size[1].replaceAll("_", " ")}`;
  const contact = /^emergency_contacts\[(\d+)\]\.([^.[\]]+)$/.exec(path);
  if (contact) return `Emergency contact ${Number(contact[1]) + 1}: ${contact[2].replaceAll("_", " ")}`;
  if (path === "emergency_contacts") return "Emergency contacts (list or identity changed)";
  if (path === "clothing_sizes") return "Clothing sizes (section changed)";
  return String(path).replaceAll("_", " ");
}
