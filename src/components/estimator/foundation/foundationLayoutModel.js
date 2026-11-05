// Pure geometry model for the foundation layout canvas. No pricing.

export const FOUNDATION_LAYOUT_WIDTH_INCHES = 480; // 40 ft across
export const FOUNDATION_LAYOUT_DEPTH_INCHES = 320; // 26 ft 8 in deep (3:2)

const finiteNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// rect is the already-zoomed element rect — never rescale by zoom again.
export function layoutPointInches(clientX, clientY, rect) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x_inches: ((clientX - rect.left) * FOUNDATION_LAYOUT_WIDTH_INCHES) / rect.width,
    z_inches: ((clientY - rect.top) * FOUNDATION_LAYOUT_DEPTH_INCHES) / rect.height,
  };
}

export function foundationLayoutFootprint(item) {
  if (!item || typeof item !== "object") return null;
  const w = item.foundation_type === "pillar"
    ? finiteNumber(item.diameter)
    : finiteNumber(item.length_inches);
  const d = item.foundation_type === "pillar"
    ? finiteNumber(item.diameter)
    : finiteNumber(item.width_inches);
  if (w === null || d === null || w <= 0 || d <= 0) return null;
  return { width: w, depth: d };
}

// Legacy undefined/null coordinates default to 0; any other invalid value is
// authored-broken data — surfaced as a note and made non-draggable, never
// silently rewritten to 0.
export function layoutPositionInches(item) {
  if (!item || typeof item !== "object") return { valid: false, x_inches: 0, z_inches: 0 };
  const read = (v) => {
    if (v === undefined || v === null) return 0;
    return finiteNumber(v);
  };
  const x = read(item.x_inches);
  const z = read(item.z_inches);
  if (x === null || z === null) return { valid: false, x_inches: 0, z_inches: 0 };
  return { valid: true, x_inches: x, z_inches: z };
}

export function layoutItemKey(item, index) {
  if (item?.component_id) return `component:${item.component_id}`;
  if (item?.id !== undefined && item?.id !== null) return `legacy:${item.id}`;
  return `index:${index}`;
}

// Snapshot of fields an in-flight gesture must not silently overwrite.
export function layoutItemFingerprint(item) {
  if (!item || typeof item !== "object") return null;
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  return JSON.stringify({
    v: pos.valid,
    t: item.foundation_type || null,
    x: pos.x_inches,
    z: pos.z_inches,
    w: fp?.width ?? null,
    d: fp?.depth ?? null,
    r: item.rotation_degrees ?? null,
  });
}
