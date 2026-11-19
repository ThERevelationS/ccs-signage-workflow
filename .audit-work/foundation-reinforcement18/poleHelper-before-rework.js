import { foundationInputNumber } from "./foundationGeometryInputs";
import { layoutPositionInches } from "./foundationLayoutModel";

// Schematic pole markers only; marker count/diameter changes no design,
// quantity, price, or purchasing requirement.
export const FOUNDATION_POLE_3D_PREVIEW_LIMIT = 64;

const IN = 1 / 12;
const renderable = (n) => Number.isFinite(n) && Number.isFinite(Math.fround(n));
const positive = (n) => renderable(n) && n > 0 && Math.fround(n) > 0;

// Missing recorded height keeps the legacy 96in visual placeholder but is
// flagged; authored bad values fail closed rather than borrowing the default.
const parseHeight = (value, label, add) => {
  if (value === null || value === undefined || value === "") {
    add(null, `${label}: height not recorded; a schematic 96-inch placeholder is drawn.`, "warning");
    return { heightFeet: 96 * IN, heightBasis: "legacy_default" };
  }
  const h = foundationInputNumber(value);
  if (h === null || !positive(h * IN)) {
    add(null, `${label}: height is not a positive finite decimal; marker skipped.`, "error");
    return null;
  }
  return { heightFeet: h * IN, heightBasis: "recorded" };
};

export function buildFoundationPolePreview3D(project = {}, foundationInstances = []) {
  const poles = [], issues = [];
  let clipped = false;
  const seen = new Set();
  const add = (index, message, severity = "warning") => {
    const text = index === null || index === undefined ? message : `Foundation ${index + 1}: ${message}`;
    const key = `${severity}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ index: index ?? null, message: text, severity });
  };
  const budget = () => FOUNDATION_POLE_3D_PREVIEW_LIMIT - poles.length;
  const push = (desc) => {
    if (budget() <= 0) { clipped = true; return false; }
    poles.push(desc);
    return true;
  };

  const items = Array.isArray(project?.items) ? project.items : [];
  const instances = Array.isArray(foundationInstances) ? foundationInstances : [];
  instances.forEach((inst) => {
    if (!inst || !Array.isArray(inst.positionFeet) || inst.positionFeet.length !== 3 ||
      !inst.positionFeet.every((v) => typeof v === "number" && renderable(v))) {
      add(inst?.index ?? null, "foundation instance position is not a finite 3D coordinate; pole marker skipped.", "error");
      return;
    }
    const depth = inst.dimensionsFeet?.[1];
    if (!positive(depth)) {
      add(inst.index ?? null, "foundation instance depth is not positive; pole marker skipped.", "error");
      return;
    }
    const item = items[inst.index];
    if (!item || typeof item !== "object") return;
    if (!(item.selected_pole_id || item.pole_total_height_inches)) return;
    const parsed = parseHeight(item.pole_total_height_inches, `Foundation ${inst.index + 1} pole`, (i, m, s) => add(inst.index, m, s));
    if (!parsed) return;
    const positionFeet = [inst.positionFeet[0], inst.positionFeet[1] + depth / 2 + parsed.heightFeet / 2, inst.positionFeet[2]];
    if (!positionFeet.every(renderable)) { add(inst.index, "pole marker position exceeds the 3D numeric range.", "error"); return; }
    push({ kind: "attached", index: inst.index, instanceIndex: inst.instanceIndex ?? 0, heightFeet: parsed.heightFeet, radiusFeet: 0.35, positionFeet, heightBasis: parsed.heightBasis });
  });

  const raw = project?.poles;
  if (raw !== null && raw !== undefined && !Array.isArray(raw)) {
    add(null, "Project poles collection is malformed; independent pole markers skipped.", "error");
  } else {
    (raw || []).forEach((p, index) => {
      if (!p || typeof p !== "object" || Array.isArray(p)) { add(index, "pole definition is not a record.", "error"); return; }
      const pos = layoutPositionInches(p);
      if (!pos.valid) { add(index, "saved pole coordinates are not finite decimals; marker skipped.", "error"); return; }
      const yRaw = p.y_offset_inches ?? 0;
      const yOff = foundationInputNumber(yRaw);
      if (yOff === null) { add(index, "pole height offset is not a finite decimal; marker skipped.", "error"); return; }
      const parsed = parseHeight(p.height_inches, `Pole ${index + 1}`, add);
      if (!parsed) return;
      const positionFeet = [pos.x_inches * IN, yOff * IN + parsed.heightFeet / 2, pos.z_inches * IN];
      if (!positionFeet.every(renderable)) { add(index, "pole marker position exceeds the 3D numeric range.", "error"); return; }
      push({ kind: "independent", index, instanceIndex: 0, heightFeet: parsed.heightFeet, radiusFeet: 0.35, positionFeet, heightBasis: parsed.heightBasis });
    });
  }

  return { poles, issues, clipped, engineeringApproved: false };
}
