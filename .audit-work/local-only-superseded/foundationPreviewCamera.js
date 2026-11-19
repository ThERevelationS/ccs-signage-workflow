// Pure bounding-sphere camera fit — no three.js import, no pricing. Returns
// null for malformed bounds or invalid fov/aspect so callers can fall back.
export function foundationPreviewCameraFit(bounds, fovDegrees, aspect) {
  const ok = (v) => typeof v === "number" && Number.isFinite(v);
  if (!bounds || !ok(bounds.min?.x) || !ok(bounds.min?.y) || !ok(bounds.min?.z) ||
    !ok(bounds.max?.x) || !ok(bounds.max?.y) || !ok(bounds.max?.z)) return null;
  const { min, max } = bounds;
  if (min.x > max.x || min.y > max.y || min.z > max.z) return null;
  if (!ok(fovDegrees) || fovDegrees <= 0 || fovDegrees >= 180) return null;
  if (!ok(aspect) || aspect <= 0) return null;
  const dx = max.x - min.x, dy = max.y - min.y, dz = max.z - min.z;
  const R = Math.hypot(dx, dy, dz) / 2;
  if (!Number.isFinite(R) || R < 0) return null;
  const vHalf = (fovDegrees * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const a = Math.min(vHalf, hHalf);
  if (!Number.isFinite(a) || a <= 0) return null;
  const distance = Math.max(3, (R / Math.sin(a)) * 1.1);
  const target = [min.x / 2 + max.x / 2, min.y / 2 + max.y / 2, min.z / 2 + max.z / 2];
  const fit = {
    target,
    radius: distance,
    near: Math.max(0.001, (distance - R) / 4),
    far: Math.max(2000, (distance + R) * 4),
    minRadius: Math.max(0.01, R * 0.05),
    maxRadius: Math.max(200, distance * 8),
  };
  return Object.values(fit).every((v) => (Array.isArray(v) ? v.every(Number.isFinite) : Number.isFinite(v))) ? fit : null;
}
