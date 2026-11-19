// Pure model for the hierarchical Origination tree (CoreBridge
// "Origination" — e.g. "Networking Group : BNI - Carl : Tier 1").
// OriginationNode rows carry parent_id links that form the tree;
// Customer.origination_path stores the denormalized "Root : Child : Leaf"
// string this module resolves/group-bys on. Dependency-free so it bundles
// cleanly under esbuild for tests.

// Canonical separator between path segments. normalizePathString accepts
// any whitespace around ":" (and stray/empty segments) and always re-emits
// this exact form, so stored paths and comparisons stay stable.
export const ORIGINATION_PATH_SEPARATOR = " : ";

const SEP = ORIGINATION_PATH_SEPARATOR;
const idOf = (n) => String(n?.id || "").trim();
const nameOf = (n) => String(n?.name || "").trim();
const parentOf = (n) => String(n?.parent_id || "").trim();
const isArchived = (n) => String(n?.status || "").trim().toLowerCase() === "archived";
const normKey = (s) => normalizePathString(s).toLowerCase();

// "  Networking Group  ::  BNI - Carl : " -> "Networking Group : BNI - Carl"
// Splits on ":", trims each segment, collapses inner whitespace, drops
// empty segments, rejoins with the canonical separator.
export function normalizePathString(s) {
  return String(s ?? "")
    .split(":")
    .map((seg) => seg.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(SEP);
}

// "Root : Child : Leaf" -> ["Root", "Child", "Leaf"]; blank/garbage -> [].
export function pathLevels(path) {
  const norm = normalizePathString(path);
  return norm ? norm.split(SEP) : [];
}

const bySortThenName = (a, b) => {
  const sa = Number(a?.sort);
  const sb = Number(b?.sort);
  const fa = Number.isFinite(sa) ? sa : 0;
  const fb = Number.isFinite(sb) ? sb : 0;
  if (fa !== fb) return fa - fb;
  return nameOf(a).localeCompare(nameOf(b));
};

/**
 * Index OriginationNode rows into a tree. Never throws and never recurses —
 * malformed hierarchies degrade into extra roots instead of hanging.
 *
 * Returns:
 *   roots      — array of nodes with no parent_id, a parent_id pointing at
 *                a missing node (orphans are promoted so they never
 *                vanish), or an ancestor chain that cycles back on itself
 *                (cycle members + their out-of-loop descendants are
 *                promoted so the loop stays reachable); sorted by `sort`
 *                then `name`
 *   byId       — Map id -> node; first row wins on duplicate ids, id-less
 *                rows are dropped
 *   childrenOf — Map parentId -> sorted child array; mirrors declared
 *                parent_id links verbatim (cycle links included), so
 *                renderers must still guard against revisits
 */
export function buildOriginationTree(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map();
  for (const n of list) {
    const id = idOf(n);
    if (!id || byId.has(id)) continue;
    byId.set(id, n);
  }

  const childrenOf = new Map();
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

  // Cycle promotion: a node whose ancestor chain revisits a node already on
  // the chain can never be reached from a real root — promote it (and
  // anything parked under the loop) so it stays visible.
  for (const n of byId.values()) {
    const seen = new Set([idOf(n)]);
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

/**
 * Derive "Root : Child : ... : node.name" by walking parent_id links.
 * Accepts the byId Map from buildOriginationTree (a plain {id: node}
 * object works too). Cycle-safe: stops the first time an id repeats, so a
 * loop yields the segments up to the loop instead of hanging. Prefer this
 * over trusting a stored node.full_path — writes can leave that stale.
 */
export function fullPathOf(node, byId) {
  if (!node) return "";
  const lookup = (pid) => {
    if (!pid) return null;
    if (byId instanceof Map) return byId.get(pid) || null;
    return byId ? byId[pid] || null : null;
  };
  const segs = [];
  const seen = new Set();
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

/**
 * Report grouping: bucket rows (customers) by the origination_path segment
 * at `level` (0-based — 0 is the root segment, CoreBridge "group by
 * origination level N"). Rows whose path is blank or stops before `level`
 * bucket under "" — callers render that key as "(none)"/"(unmatched)".
 * Returns a Map whose keys iterate alphabetically with "" last.
 */
export function groupByLevel(rows, level = 0) {
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  const buckets = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const segs = pathLevels(row?.origination_path);
    const key = lvl < segs.length ? segs[lvl] : "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const out = new Map();
  const keys = [...buckets.keys()].filter((k) => k !== "").sort((a, b) => a.localeCompare(b));
  for (const k of keys) out.set(k, buckets.get(k));
  if (buckets.has("")) out.set("", buckets.get(""));
  return out;
}

const matchedResult = (node, path, input) => ({
  matched: true,
  unmatched: false,
  node,
  path,
  input,
  suggestion: null,
});

/**
 * Resolve a customer row's origination_path string against the tree.
 * `nodes` accepts either the raw OriginationNode array or a prebuilt
 * { byId } from buildOriginationTree — pass the prebuilt tree inside loops.
 *
 * Returns:
 *   matched   — { matched:true, unmatched:false, node, path, input,
 *                 suggestion:null } where path is the node's canonical
 *                 derived path (fullPathOf); comparison is normalized +
 *                 case-insensitive, and a stale stored node.full_path is
 *                 used as a fallback match key
 *   unmatched — { matched:false, unmatched:true, node:null,
 *                 path:<normalized input>, input,
 *                 suggestion:{ node, path, sharedSegments } | null }
 *
 * The suggestion is the deepest non-archived node whose derived path is a
 * strict leading segment-prefix of the input — i.e. the nearest existing
 * ancestor a human would re-pick ("Networking Group : BNI - Carl : Typo"
 * suggests "Networking Group : BNI - Carl"). Zero shared segments or a
 * blank input yields suggestion:null. Archived nodes never appear as
 * suggestions but still resolve on exact match so historical data keeps
 * pointing at them.
 */
export function resolveOrSuggest(customer, nodes) {
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
    while (
      shared < segs.length &&
      segs[shared].toLowerCase() === inputSegs[shared].toLowerCase()
    ) {
      shared += 1;
    }
    if (shared < segs.length) continue; // node path must be a full leading prefix of the input
    if (
      !best ||
      shared > best.sharedSegments ||
      (shared === best.sharedSegments && nameOf(n).localeCompare(nameOf(best.node)) < 0)
    ) {
      best = { node: n, path: p, sharedSegments: shared };
    }
  }

  return {
    matched: false,
    unmatched: true,
    node: null,
    path: input,
    input,
    suggestion: best,
  };
}
