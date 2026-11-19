// src/components/crm/originationModel.js
var ORIGINATION_PATH_SEPARATOR = " : ";
var SEP = ORIGINATION_PATH_SEPARATOR;
var idOf = (n) => String(n?.id || "").trim();
var nameOf = (n) => String(n?.name || "").trim();
var parentOf = (n) => String(n?.parent_id || "").trim();
var isArchived = (n) => String(n?.status || "").trim().toLowerCase() === "archived";
var normKey = (s) => normalizePathString(s).toLowerCase();
function normalizePathString(s) {
  return String(s ?? "").split(":").map((seg) => seg.trim().replace(/\s+/g, " ")).filter(Boolean).join(SEP);
}
function pathLevels(path) {
  const norm = normalizePathString(path);
  return norm ? norm.split(SEP) : [];
}
var bySortThenName = (a, b) => {
  const sa = Number(a?.sort);
  const sb = Number(b?.sort);
  const fa = Number.isFinite(sa) ? sa : 0;
  const fb = Number.isFinite(sb) ? sb : 0;
  if (fa !== fb) return fa - fb;
  return nameOf(a).localeCompare(nameOf(b));
};
function buildOriginationTree(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = /* @__PURE__ */ new Map();
  for (const n of list) {
    const id = idOf(n);
    if (!id || byId.has(id)) continue;
    byId.set(id, n);
  }
  const childrenOf = /* @__PURE__ */ new Map();
  const roots = [];
  for (const n of byId.values()) {
    const pid = parentOf(n);
    if (pid && byId.has(pid)) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(n);
    } else {
      roots.push(n);
    }
  }
  for (const n of byId.values()) {
    const seen = /* @__PURE__ */ new Set([idOf(n)]);
    let cur = byId.get(parentOf(n));
    while (cur) {
      const cid = idOf(cur);
      if (seen.has(cid)) {
        roots.push(n);
        break;
      }
      seen.add(cid);
      cur = byId.get(parentOf(cur));
    }
  }
  roots.sort(bySortThenName);
  for (const kids of childrenOf.values()) kids.sort(bySortThenName);
  return { roots, byId, childrenOf };
}
function fullPathOf(node, byId) {
  if (!node) return "";
  const lookup = (pid) => {
    if (!pid) return null;
    if (byId instanceof Map) return byId.get(pid) || null;
    return byId ? byId[pid] || null : null;
  };
  const segs = [];
  const seen = /* @__PURE__ */ new Set();
  let cur = node;
  while (cur) {
    const cid = idOf(cur) || `__name:${nameOf(cur)}`;
    if (seen.has(cid)) break;
    seen.add(cid);
    const name = nameOf(cur);
    if (name) segs.unshift(name);
    cur = lookup(parentOf(cur));
  }
  return segs.join(SEP);
}
function groupByLevel(rows, level = 0) {
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  const buckets = /* @__PURE__ */ new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const segs = pathLevels(row?.origination_path);
    const key = lvl < segs.length ? segs[lvl] : "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const out = /* @__PURE__ */ new Map();
  const keys = [...buckets.keys()].filter((k) => k !== "").sort((a, b) => a.localeCompare(b));
  for (const k of keys) out.set(k, buckets.get(k));
  if (buckets.has("")) out.set("", buckets.get(""));
  return out;
}
var matchedResult = (node, path, input) => ({
  matched: true,
  unmatched: false,
  node,
  path,
  input,
  suggestion: null
});
function resolveOrSuggest(customer, nodes) {
  const input = normalizePathString(customer?.origination_path);
  const tree = nodes && nodes.byId instanceof Map ? nodes : buildOriginationTree(nodes);
  const all = [...tree.byId.values()];
  const inputSegs = input ? input.split(SEP) : [];
  if (input) {
    const want = normKey(input);
    let storedHit = null;
    for (const n of all) {
      const derived = fullPathOf(n, tree.byId);
      if (derived && normKey(derived) === want) {
        return matchedResult(n, derived, input);
      }
      const stored = normalizePathString(n?.full_path);
      if (!storedHit && stored && normKey(stored) === want) {
        storedHit = { node: n, path: stored };
      }
    }
    if (storedHit) return matchedResult(storedHit.node, storedHit.path, input);
  }
  let best = null;
  for (const n of all) {
    if (isArchived(n)) continue;
    const p = fullPathOf(n, tree.byId);
    const segs = p ? p.split(SEP) : [];
    if (segs.length === 0 || segs.length > inputSegs.length) continue;
    let shared = 0;
    while (shared < segs.length && segs[shared].toLowerCase() === inputSegs[shared].toLowerCase()) {
      shared += 1;
    }
    if (shared < segs.length) continue;
    if (!best || shared > best.sharedSegments || shared === best.sharedSegments && nameOf(n).localeCompare(nameOf(best.node)) < 0) {
      best = { node: n, path: p, sharedSegments: shared };
    }
  }
  return {
    matched: false,
    unmatched: true,
    node: null,
    path: input,
    input,
    suggestion: best
  };
}
export {
  ORIGINATION_PATH_SEPARATOR,
  buildOriginationTree,
  fullPathOf,
  groupByLevel,
  normalizePathString,
  pathLevels,
  resolveOrSuggest
};
