// O-040 (CMP-C09) — foundation scene edit history (stroke-level undo).
//
// Pure, DOM-free undo/redo store for scene edits. One continuous gesture —
// a pointer drag begin→moves→commit, a keyboard nudge burst, or a
// multi-commit paint-style stroke — records as ONE undoable command. The
// store never mutates the scene itself: consumers apply returned patch
// payloads through their normal commit path and report the live scene's
// geometry anchor back via observe(), so every undo is CAS-gated against
// the scene it was recorded on. An external write (another panel, a
// Builder sync, a concurrent save adopting a new revision) detaches the
// chain instead of letting undo resurrect stale geometry over it.
//
// Terminology:
//   * edit    — an atomic committed change record { before, after,
//               beforeAnchor, afterAnchor, ... }. `before`/`after` are
//               caller-shaped restore values (for canvas item moves,
//               { x_inches, z_inches } patch-shaped).
//   * stroke  — a multi-commit gesture aggregated between beginStroke and
//              commitStroke (paint cells, future vertex/segment drags that
//              land sub-edits continuously). A pointer drag commits exactly
//              once, so the canvas records it via recordEdit — the
//              one-command outcome is identical.
//   * anchor  — opaque caller token fingerprinting the scene's editable
//              geometry (see sceneLayoutAnchor). Entries chain
//              beforeAnchor → afterAnchor; undo applies only while the
//              live anchor equals the head entry's afterAnchor.
//   * detached — recorded entries whose chain was broken below them by an
//              external write. Kept for honest reporting, never applied;
//              pruned when the undo cursor reaches the boundary.
//
// Anchor discipline is all-or-nothing per store: once anchored (first
// observe() or first anchored record), edits lacking BOTH anchors are
// refused with 'ignored-unanchored' — an unverifiable edit must never sit
// inside a CAS-gated chain. Unanchored stores (never observed) work as a
// plain undo stack.
//
// Coalescing: consecutive committed edits sharing a non-null coalesceKey
// merge into one entry while the merge stays inside coalesceWindowMs of the
// last sub-edit AND the chain still links (incoming beforeAnchor === top
// afterAnchor). The key is caller-computed (the input seam's
// sceneEditCoalesceKey maps a keyboard burst on one row to one identity);
// drags pass null — one gesture is already one command.
//
// Mount sketch (page-owned, see MOUNT-ANCHORS.md):
//   const ref = useRef(null); if (!ref.current) ref.current = createSceneHistory();
//   useSyncExternalStore(ref.current.subscribe, () => ref.current.getState().stateVersion);
//   <FoundationLayoutCanvas ... sceneHistory={ref.current} />
//   const undo = () => ref.current.undo(sceneLayoutAnchor(items), (rev) => apply(rev) !== false);

import { layoutItemFingerprint } from "./foundationLayoutModel";

const fin = (v) => typeof v === "number" && Number.isFinite(v);

export const SCENE_HISTORY_CAPACITY = 100;
export const SCENE_HISTORY_COALESCE_WINDOW_MS = 1200;

// ---------------------------------------------------------------------------
// Scene geometry anchors
// ---------------------------------------------------------------------------

// Walls carry their plan geometry in shape.points (+ closed), not the item
// footprint/position fields layoutItemFingerprint reads — their anchor part
// fingerprints the authored outline directly.
const wallAnchorPart = (wall) => JSON.stringify({
  pts: Array.isArray(wall?.shape?.points) ? wall.shape.points : null,
  closed: wall?.shape?.closed === true,
});

// Geometry-only CAS token for the whole editable scene. Rows fingerprint
// with the same field set the drag guards use (position validity/type/
// corner/footprint/rotation for items and poles, outline for walls); the
// join preserves row count and order, so any geometric change — move,
// resize, rotate, insert, delete, or a reorder of differently-shaped rows —
// yields a different anchor. Two anchor-relevant properties are deliberate:
//   * component ids/keys are EXCLUDED — normalization minting a component_id
//     does not move geometry and must not look like an external write.
//   * non-geometry fields (labels, prices, materials) are EXCLUDED — a cost
//     or text edit must not invalidate position undo.
// `scene` accepts an items array (canvas shape) or { items, poles, walls }.
// Deterministic: same scene in → identical string out.
export function sceneLayoutAnchor(scene) {
  const s = Array.isArray(scene) ? { items: scene } : (scene && typeof scene === "object" ? scene : {});
  const fp = (rows, f) => (Array.isArray(rows) ? rows.map(f).join(",") : "");
  return `i:${fp(s.items, layoutItemFingerprint)}|p:${fp(s.poles, layoutItemFingerprint)}|w:${fp(s.walls, wallAnchorPart)}`;
}

// Rows with one row's fields patched — the anchor formula for "the scene
// with only this row's geometry changed". Consumers compute before/after
// anchors against the CURRENT rows with only the target swapped, so an
// interleaved write to a different row is preserved inside the entry
// instead of detaching it.
export function rowsWithPatch(rows, index, patch) {
  if (!Array.isArray(rows)) return rows;
  if (typeof index !== "number" || index < 0 || index >= rows.length || !patch) return rows;
  return rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
}

// ---------------------------------------------------------------------------
// History store
// ---------------------------------------------------------------------------

const hasAnchor = (v) => v !== undefined && v !== null;

export function createSceneHistory({
  capacity = SCENE_HISTORY_CAPACITY,
  coalesceWindowMs = SCENE_HISTORY_COALESCE_WINDOW_MS,
  now = () => Date.now(),
  equal,
} = {}) {
  const eq = typeof equal === "function"
    ? equal
    : (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const cap = fin(capacity) && capacity >= 1 ? Math.floor(capacity) : SCENE_HISTORY_CAPACITY;
  // 0 disables coalescing; Infinity merges every adjacent same-key edit.
  const window_ = coalesceWindowMs === Infinity
    ? Infinity
    : fin(coalesceWindowMs) && coalesceWindowMs >= 0 ? coalesceWindowMs : SCENE_HISTORY_COALESCE_WINDOW_MS;
  const clock = typeof now === "function" ? now : () => Date.now();

  // State. `detached` counts unreachable entries at the BOTTOM of past —
  // entries at index < detached can never apply again. `currentAnchor` is
  // the anchor the live undo chain expects the scene to hold right now.
  let past = [];
  let future = [];
  let open = null;
  let detached = 0;
  let currentAnchor;
  let anchored = false;
  let seq = 0;
  let stateVersion = 0;
  const listeners = new Set();

  const emit = () => {
    stateVersion += 1;
    for (const fn of [...listeners]) {
      try { fn(); } catch { /* listener faults never break the store */ }
    }
  };

  const info = (e, i) => ({
    id: e.id,
    kind: e.kind ?? null,
    method: e.method ?? null,
    label: e.label ?? null,
    target: e.target ?? null,
    moves: e.moves ?? 1,
    openedAt: e.openedAt ?? null,
    committedAt: e.committedAt ?? null,
    lastAt: e.lastAt ?? null,
    detached: typeof i === "number" ? i < detached : false,
  });

  // Every recorded entry below the current head is unreachable after an
  // external write — mark the boundary, drop redo (a redo can never cross a
  // rewrite), and cancel any in-flight stroke (its own commits may have
  // landed on a different base). Returns true when visible state changed.
  const markDetached = () => {
    let changed = false;
    if (open) { open = null; changed = true; }
    if (future.length) { future = []; changed = true; }
    if (detached !== past.length) { detached = past.length; changed = true; }
    return changed;
  };

  const boundStacks = () => {
    while (past.length > cap) {
      past.shift();
      if (detached > 0) detached -= 1;
    }
    while (future.length > cap) future.pop();
  };

  // Head-entry liveness, non-mutating: the top of past must sit above the
  // detached boundary AND chain to the tracked anchor.
  const topApplies = () =>
    past.length > detached &&
    (!hasAnchor(past[past.length - 1].afterAnchor) || past[past.length - 1].afterAnchor === currentAnchor);
  const topRedoApplies = () =>
    future.length > 0 &&
    (!hasAnchor(future[0].beforeAnchor) || future[0].beforeAnchor === currentAnchor);

  const seedAnchor = (anchor) => {
    if (!anchored && hasAnchor(anchor)) { anchored = true; currentAnchor = anchor; }
  };

  // Anchor reconciliation shared by record paths. An edit asserting a base
  // different from the tracked head means the scene moved outside the
  // stroke channel — detach before the new edit joins the chain.
  const reconcileBase = (beforeAnchor) => {
    if (anchored && hasAnchor(beforeAnchor) && beforeAnchor !== currentAnchor) return markDetached();
    return false;
  };

  // ------------------------------------------------------------------
  // Observation + lifecycle
  // ------------------------------------------------------------------

  const observe = (anchor) => {
    if (!hasAnchor(anchor)) return { status: "unanchored" };
    if (!anchored) { anchored = true; currentAnchor = anchor; return { status: "anchored" }; }
    if (anchor === currentAnchor) return { status: "current" };
    const changed = markDetached();
    currentAnchor = anchor;
    if (changed) emit();
    return { status: "detached", detached };
  };

  const clear = (anchor) => {
    past = []; future = []; open = null; detached = 0;
    anchored = false; currentAnchor = undefined;
    if (hasAnchor(anchor)) { anchored = true; currentAnchor = anchor; }
    emit();
    return { status: "cleared" };
  };

  // ------------------------------------------------------------------
  // Atomic edits (one committed change = one command)
  // ------------------------------------------------------------------

  const recordEdit = (edit = {}) => {
    const at = fin(edit.at) ? edit.at : clock();
    if (open) commitStroke({ at }); // interleaved atomic commit never orphans landed sub-edits
    // Anchored stores fail closed on unverifiable edits.
    if (anchored && !(hasAnchor(edit.beforeAnchor) && hasAnchor(edit.afterAnchor))) {
      return { status: "ignored-unanchored" };
    }
    // A record that provably changed nothing is not history.
    if (hasAnchor(edit.beforeAnchor) && edit.beforeAnchor === edit.afterAnchor && eq(edit.before, edit.after)) {
      return { status: "ignored-noop" };
    }
    seedAnchor(edit.beforeAnchor);
    const detachedBefore = reconcileBase(edit.beforeAnchor) ? detached : null;

    const key = edit.coalesceKey ?? null;
    const top = past[past.length - 1];
    const mergeable =
      key != null && top && past.length - 1 >= detached &&
      top.coalesceKey === key && top.mergeable !== false &&
      (!hasAnchor(edit.beforeAnchor) || !hasAnchor(top.afterAnchor) || edit.beforeAnchor === top.afterAnchor) &&
      window_ > 0 && at - top.lastAt <= window_;
    if (mergeable) {
      top.after = edit.after;
      if (hasAnchor(edit.afterAnchor)) { top.afterAnchor = edit.afterAnchor; currentAnchor = edit.afterAnchor; }
      top.lastAt = at;
      top.moves = (top.moves ?? 1) + 1;
      if (edit.label) top.label = edit.label;
      future = [];
      // A burst that returns to its start point cancels itself out — drop
      // the entry rather than leaving a command that provably changes
      // nothing ("sensible history", not a no-op button).
      if (hasAnchor(top.beforeAnchor) && top.beforeAnchor === top.afterAnchor && eq(top.before, top.after)) {
        past.pop();
        emit();
        return { status: "merged-noop", detachedBefore };
      }
      emit();
      return { status: "merged", entry: top, detachedBefore };
    }

    const entry = {
      id: (seq += 1),
      kind: edit.kind ?? null,
      method: edit.method ?? null,
      label: edit.label ?? null,
      target: edit.target ?? null,
      coalesceKey: key,
      before: edit.before,
      after: edit.after,
      beforeAnchor: edit.beforeAnchor,
      afterAnchor: edit.afterAnchor,
      mergeable: edit.mergeable,
      openedAt: at,
      committedAt: at,
      lastAt: at,
      moves: 1,
    };
    past.push(entry);
    boundStacks();
    future = [];
    if (hasAnchor(edit.afterAnchor)) currentAnchor = edit.afterAnchor;
    emit();
    return { status: "recorded", entry, detachedBefore };
  };

  // ------------------------------------------------------------------
  // Multi-commit strokes (paint/drag gestures that land sub-edits)
  // ------------------------------------------------------------------

  const beginStroke = (opts = {}) => {
    const at = fin(opts.at) ? opts.at : clock();
    if (open) commitStroke({ at }); // a new gesture never orphans the prior one's landed work
    if (anchored && !(hasAnchor(opts.beforeAnchor))) return { status: "ignored-unanchored" };
    seedAnchor(opts.beforeAnchor);
    const detachedBefore = reconcileBase(opts.beforeAnchor) ? detached : null;
    open = {
      id: (seq += 1),
      kind: opts.kind ?? null,
      method: opts.method ?? null,
      label: opts.label ?? null,
      target: opts.target ?? null,
      coalesceKey: opts.coalesceKey ?? null,
      before: opts.before,
      after: undefined,
      beforeAnchor: opts.beforeAnchor,
      afterAnchor: undefined,
      mergeable: opts.mergeable,
      openedAt: at,
      lastAt: at,
      moves: 0,
    };
    emit();
    return { status: "open", stroke: open, detachedBefore };
  };

  const extendStroke = ({ after, afterAnchor, at } = {}) => {
    if (!open) return { status: "no-stroke" };
    const t = fin(at) ? at : clock();
    if (after !== undefined) open.after = after;
    if (hasAnchor(afterAnchor)) { open.afterAnchor = afterAnchor; currentAnchor = afterAnchor; }
    open.lastAt = t;
    open.moves = (open.moves ?? 0) + 1;
    emit();
    return { status: "extended", stroke: open };
  };

  const commitStroke = ({ after, afterAnchor, label, at } = {}) => {
    if (!open) return { status: "no-stroke" };
    const t = fin(at) ? at : clock();
    const s = open;
    open = null;
    if (after !== undefined) s.after = after;
    if (hasAnchor(afterAnchor)) { s.afterAnchor = afterAnchor; currentAnchor = afterAnchor; }
    if (label) s.label = label;
    // A stroke that landed nothing is not a command — that verdict stands
    // regardless of anchors.
    if (s.after === undefined) { emit(); return { status: "cancelled-empty" }; }
    // Anchored stores fail closed on unverifiable edits — a stroke that
    // cannot state the scene it landed on can never be CAS-undone.
    if (anchored && !hasAnchor(s.afterAnchor)) { emit(); return { status: "ignored-unanchored" }; }
    if (hasAnchor(s.beforeAnchor) && s.beforeAnchor === s.afterAnchor && eq(s.before, s.after)) {
      emit();
      return { status: "ignored-noop" };
    }
    const entry = { ...s, committedAt: t, lastAt: t, moves: Math.max(1, s.moves ?? 0) };
    past.push(entry);
    boundStacks();
    future = [];
    emit();
    return { status: "recorded", entry };
  };

  const cancelStroke = () => {
    if (!open) return { status: "no-stroke" };
    open = null;
    emit();
    return { status: "cancelled" };
  };

  // ------------------------------------------------------------------
  // Traversal
  // ------------------------------------------------------------------
  // `apply` is the consumer's commit path: called with the revert/reapply
  // payload INSIDE the transition so a refused commit leaves the stacks
  // untouched ('rejected'). Anything returned other than === false counts
  // as applied; omitting apply performs the transition unconditionally —
  // consumers with a fallible commit path must pass it.

  const traverse = (direction, anchor, apply) => {
    if (open) return { status: "busy" };
    if (hasAnchor(anchor) && anchored && anchor !== currentAnchor) {
      return { status: "anchor-mismatch" };
    }
    const applies = direction === "undo" ? topApplies : topRedoApplies;
    if (!applies()) {
      const source = direction === "undo" ? past : future;
      if (!source.length || (direction === "undo" && past.length <= detached)) {
        // Reachable history exhausted. A dead tail exists only for undo —
        // prune it on contact so memory stays bounded.
        if (direction === "undo" && past.length) {
          past = [];
          detached = 0;
          emit();
          return { status: "stale" };
        }
        return { status: source.length ? "stale" : "empty" };
      }
      // Head record exists but its chain no longer reaches the live anchor —
      // external drift the observer missed. Same end state as a mismatch:
      // mark everything detached and refuse.
      if (direction === "undo") { if (markDetached()) emit(); return { status: "stale" }; }
      if (future.length) { future = []; emit(); }
      return { status: "stale" };
    }

    const entry = direction === "undo" ? past[past.length - 1] : future[0];
    const patch = direction === "undo" ? entry.before : entry.after;
    const payload = {
      status: "applied",
      direction,
      kind: entry.kind,
      method: entry.method,
      label: entry.label,
      target: entry.target,
      patch,
      entry,
    };
    if (typeof apply === "function") {
      let result;
      try { result = apply(payload); }
      catch { result = false; }
      if (result === false) return { status: "rejected", entry };
    }
    if (direction === "undo") {
      past.pop();
      future.unshift(entry);
      if (hasAnchor(entry.beforeAnchor)) currentAnchor = entry.beforeAnchor;
    } else {
      future.shift();
      past.push(entry);
      if (hasAnchor(entry.afterAnchor)) currentAnchor = entry.afterAnchor;
    }
    emit();
    return payload;
  };

  const undo = (anchor, apply) => traverse("undo", anchor, apply);
  const redo = (anchor, apply) => traverse("redo", anchor, apply);

  // ------------------------------------------------------------------
  // Inspection (UI state + diagnostics)
  // ------------------------------------------------------------------

  const peekUndo = () => (topApplies() ? info(past[past.length - 1]) : null);
  const peekRedo = () => (topRedoApplies() ? info(future[0]) : null);

  const entries = () => ({
    past: past.map((e, i) => info(e, i)),
    future: future.map((e, i) => ({ ...info(e), detached: false })),
    detached,
    open: open ? info(open) : null,
  });

  const getState = () => ({
    stateVersion,
    capacity: cap,
    coalesceWindowMs: window_,
    busy: open != null,
    open: open ? info(open) : null,
    canUndo: !open && topApplies(),
    canRedo: !open && topRedoApplies(),
    undoDepth: Math.max(0, past.length - detached),
    redoDepth: future.length,
    detached,
    undoLabel: peekUndo()?.label ?? null,
    redoLabel: peekRedo()?.label ?? null,
  });

  const subscribe = (fn) => {
    if (typeof fn !== "function") return () => { };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  };

  return {
    // observation + lifecycle
    observe, clear,
    // recording
    recordEdit, beginStroke, extendStroke, commitStroke, cancelStroke,
    // traversal
    undo, redo,
    // inspection + subscription
    peekUndo, peekRedo, entries, getState, subscribe,
    get stateVersion() { return stateVersion; },
    get currentAnchor() { return currentAnchor; },
    get anchored() { return anchored; },
  };
}