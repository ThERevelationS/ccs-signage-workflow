// base44/shared/partGroupInheritance.ts
var PART_GROUP_LINK_FIELDS = [
  "part_group_id",
  "catalog_part_group_id",
  "group_id"
];
var hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
var isEmptyValue = (v) => v === void 0 || v === null || v === "";
function partId(part) {
  if (!part || typeof part !== "object") return null;
  const id = part.id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}
function groupId(group) {
  return partId(group);
}
function partGroupLink(part) {
  if (!part || typeof part !== "object") return null;
  for (const f of PART_GROUP_LINK_FIELDS) {
    const v = part[f];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}
function membershipIds(group) {
  const out = /* @__PURE__ */ new Set();
  const raw = group ? group.part_ids : null;
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && v.trim()) out.add(v.trim());
      else if (typeof v === "number" && Number.isFinite(v)) out.add(String(v));
    }
  }
  return out;
}
function overrideSet(part) {
  const out = /* @__PURE__ */ new Set();
  const raw = part && typeof part === "object" ? part.overridden_fields : null;
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && v.trim()) out.add(v.trim());
    }
  }
  return out;
}
function partHasExplicitValue(part, key) {
  if (!part || typeof part !== "object") return false;
  if (!hasOwn(part, key)) return false;
  return !isEmptyValue(part[key]);
}
function orderedGroups(groups) {
  const list = (Array.isArray(groups) ? groups : []).filter(
    (g) => !!g && typeof g === "object"
  );
  return list.map((g, i) => ({ g, i })).sort((a, b) => {
    const sa = typeof a.g.sort === "number" && Number.isFinite(a.g.sort) ? a.g.sort : 0;
    const sb = typeof b.g.sort === "number" && Number.isFinite(b.g.sort) ? b.g.sort : 0;
    return sa - sb || a.i - b.i;
  }).map((x) => x.g);
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    const aa = a;
    const bb = b;
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
      if (!deepEqual(aa[i], bb[i])) return false;
    }
    return true;
  }
  const ao = a;
  const bo = b;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!hasOwn(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}
function resolveGroupForPart(part, groups) {
  const list = orderedGroups(groups);
  const pid = partId(part);
  if (pid) {
    for (const g of list) {
      if (membershipIds(g).has(pid)) return g;
    }
  }
  const link = partGroupLink(part);
  if (link) {
    for (const g of list) {
      if (groupId(g) === link) return g;
    }
  }
  return null;
}
function groupMembers(group, parts) {
  const list = (Array.isArray(parts) ? parts : []).filter(
    (p) => !!p && typeof p === "object"
  );
  if (!group || typeof group !== "object") return [];
  const gid = groupId(group);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const byId = /* @__PURE__ */ new Map();
  for (const p of list) {
    const pid = partId(p);
    if (pid && !byId.has(pid)) byId.set(pid, p);
  }
  const rawIds = Array.isArray(group.part_ids) ? group.part_ids : [];
  for (const v of rawIds) {
    const id = typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    if (!id || seen.has(id)) continue;
    const p = byId.get(id);
    if (p) {
      out.push(p);
      seen.add(id);
    }
  }
  for (const p of list) {
    if (!gid) break;
    const pid = partId(p);
    if (pid && seen.has(pid)) continue;
    if (partGroupLink(p) === gid) {
      out.push(p);
      if (pid) seen.add(pid);
    }
  }
  return out;
}
function effectivePartDefaults(args) {
  const part = args ? args.part : null;
  const group = args ? args.group : null;
  const merged = part && typeof part === "object" ? { ...part } : {};
  const shared = group && typeof group === "object" && group.shared_defaults && typeof group.shared_defaults === "object" && !Array.isArray(group.shared_defaults) ? group.shared_defaults : {};
  const overrides = overrideSet(part);
  const inherited_keys = [];
  const overridden_keys = [];
  const suppressed_keys = [];
  for (const k of Object.keys(shared).sort()) {
    if (partHasExplicitValue(part, k)) {
      overridden_keys.push(k);
      continue;
    }
    if (overrides.has(k)) {
      overridden_keys.push(k);
      suppressed_keys.push(k);
      continue;
    }
    merged[k] = shared[k];
    inherited_keys.push(k);
  }
  return { merged, inherited_keys, overridden_keys, suppressed_keys };
}
function propagateGroupEdit(args) {
  const group = args ? args.group : null;
  const prev = args && args.prevDefaults && typeof args.prevDefaults === "object" ? args.prevDefaults : {};
  const next = group && typeof group === "object" && group.shared_defaults && typeof group.shared_defaults === "object" && !Array.isArray(group.shared_defaults) ? group.shared_defaults : {};
  const changed_keys = Object.keys(next).filter((k) => !hasOwn(prev, k) || !deepEqual(next[k], prev[k])).sort();
  const removed_keys = Object.keys(prev).filter((k) => !hasOwn(next, k)).sort();
  const parts = groupMembers(group, args ? args.parts : null).map(
    (p) => {
      const overrides = overrideSet(p);
      const updates = {};
      const skipped_keys = [];
      for (const k of changed_keys) {
        if (partHasExplicitValue(p, k) || overrides.has(k)) {
          skipped_keys.push(k);
        } else {
          updates[k] = next[k];
        }
      }
      return { part_id: partId(p), updates, skipped_keys };
    }
  );
  return { group_id: groupId(group), changed_keys, removed_keys, parts };
}
function markOverride(part, fieldKey) {
  const set = overrideSet(part);
  if (typeof fieldKey === "string" && fieldKey.trim()) set.add(fieldKey.trim());
  return [...set].sort();
}
export {
  PART_GROUP_LINK_FIELDS,
  effectivePartDefaults,
  groupMembers,
  markOverride,
  propagateGroupEdit,
  resolveGroupForPart
};
