// src/components/channelLetterInstall/letterWidthCalculator.jsx
var AVG_WIDTH_TO_HEIGHT_RATIO = 0.72;
var estimateAverageLetterWidth = (heightInches) => {
  const h = parseFloat(heightInches);
  if (!isFinite(h) || h <= 0) return 0;
  const raw = h * AVG_WIDTH_TO_HEIGHT_RATIO;
  return Math.ceil(raw * 2) / 2;
};

// src/components/channelLetterInstall/channelLayoutModel.js
var CHANNEL_LAYOUT_VERSION = 1;
var CHANNEL_ALIGNMENTS = ["flush_left", "center", "right", "distributed"];
var num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
function channelLetterSetLayout({
  letter_text,
  letter_count,
  letter_height_inches,
  spacing_inches,
  alignment,
  run_width_inches,
  raceway_length_feet,
  raceway,
  backer_panel,
  illumination,
  finish_color,
  artwork_front_ref,
  artwork_back_ref
} = {}) {
  const issues = [];
  const h = num(letter_height_inches);
  const count = num(letter_count);
  const text = typeof letter_text === "string" ? letter_text.trim() : "";
  const chars = text ? [...text] : Array.from({ length: count || 0 }, () => "\u25A1");
  if (count !== null && text && count !== chars.length) {
    issues.push({ kind: "conflict", field: "letter_count", message: `Letter count ${count} differs from text (${chars.length} chars).` });
  }
  if (h === null || h <= 0) {
    return { version: CHANNEL_LAYOUT_VERSION, resolvable: false, issues: [...issues, { kind: "missing", field: "letter_height_inches", message: "Letter height is required for a layout." }], letters: [], envelope: null };
  }
  const spacing = num(spacing_inches) ?? 0;
  const est = estimateAverageLetterWidth(h);
  const letters = chars.map((ch, i) => ({
    index: i,
    char: ch,
    width: ch === " " ? Math.max(est / 2, 0) : est,
    height: h
  }));
  const natural = letters.reduce((s, l) => s + l.width, 0) + Math.max(letters.length - 1, 0) * spacing;
  const runW = num(run_width_inches);
  const align = CHANNEL_ALIGNMENTS.includes(alignment) ? alignment : "flush_left";
  let cursor = 0;
  let gap = spacing;
  if (align === "distributed" && runW !== null && letters.length > 1) {
    const totalLetter = letters.reduce((s, l) => s + l.width, 0);
    gap = Math.max((runW - totalLetter) / (letters.length - 1), 0);
  } else if (align === "center" && runW !== null) {
    cursor = Math.max((runW - natural) / 2, 0);
  } else if (align === "right" && runW !== null) {
    cursor = Math.max(runW - natural, 0);
  }
  for (const l of letters) {
    l.x = cursor;
    cursor += l.width + gap;
  }
  const envelopeW = Math.max(runW ?? 0, cursor - (letters.length ? gap : 0));
  const envelope = { width_inches: envelopeW, height_inches: h };
  const racewayFt = num(raceway_length_feet);
  const racewayRect = raceway === true || racewayFt !== null ? { x: 0, z: 0, width_inches: racewayFt !== null ? racewayFt * 12 : envelopeW, height_inches: Math.min(h * 0.6, h), behind: true } : null;
  const backerRect = backer_panel === true ? { x: 0, z: 0, width_inches: envelopeW, height_inches: h, behind: true } : null;
  return {
    version: CHANNEL_LAYOUT_VERSION,
    resolvable: true,
    issues,
    letters,
    envelope,
    alignment: align,
    spacing_inches: gap,
    baseline_z: h,
    raceway: racewayRect,
    backer: backerRect,
    illumination: ["front_lit", "halo_lit", "front_and_halo", "unlit"].includes(illumination) ? illumination : null,
    finish_color: finish_color || null,
    artwork_front_ref: artwork_front_ref || null,
    artwork_back_ref: artwork_back_ref || null
  };
}
export {
  CHANNEL_ALIGNMENTS,
  CHANNEL_LAYOUT_VERSION,
  channelLetterSetLayout
};
