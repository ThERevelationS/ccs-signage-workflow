// src/components/channelLetterInstall/letterWidthCalculator.jsx
var AVG_WIDTH_TO_HEIGHT_RATIO = 0.72;
var estimateAverageLetterWidth = (heightInches) => {
  const h = parseFloat(heightInches);
  if (!isFinite(h) || h <= 0) return 0;
  const raw = h * AVG_WIDTH_TO_HEIGHT_RATIO;
  return Math.ceil(raw * 2) / 2;
};

// src/components/channelLetterInstall/channelSetTakeoff.js
var CHANNEL_TAKEOFF_VERSION = 1;
var num = (v) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
var ceil = (x) => Math.ceil(x - 1e-9);
var perimeterInches = (spec, avgW) => {
  const p = num(spec.total_perimeter_inches);
  if (p !== null) return { inches: p, source: "computed" };
  const h = num(spec.letter_height_inches);
  const c = num(spec.letter_count);
  if (h === null || c === null) return { inches: null, source: null };
  return { inches: 2 * (h + avgW) * c, source: "estimated" };
};
function channelSetTakeoff(spec = {}, product = {}, opts = {}) {
  const issues = [];
  const rows = [];
  const count = num(spec.letter_count);
  const h = num(spec.letter_height_inches);
  const depth = num(spec.letter_depth_inches);
  const fabricated = spec.fabrication === "fabricated" || spec.letter_type === "fabricated" || spec.letter_type === "dimensional_letters";
  const lit = spec.illumination === "front_lit" || spec.illumination === "halo_lit" || spec.illumination === "front_and_halo";
  const allowEst = opts.allow_estimates === true;
  const push = (category, item, qty, unit, source, note) => {
    rows.push({ category, item, qty, unit, source, note: note || null });
  };
  const miss = (field, item) => {
    issues.push({ kind: "missing_product_data", field, message: `${item}: no product data for ${field} \u2014 qty unresolved.` });
  };
  const estIssue = (field) => {
    issues.push({ kind: "assumption", field, message: `${field}: qty estimated (no authored value) \u2014 verify before ordering.` });
  };
  if (count === null || h === null) {
    issues.push({ kind: "missing", field: "letter_count/letter_height_inches", message: "Set takeoff requires letter count and height." });
    return { version: CHANNEL_TAKEOFF_VERSION, resolvable: false, rows, issues };
  }
  const avgW = estimateAverageLetterWidth(h);
  const faceSqFt = avgW * h * count / 144;
  const perim = perimeterInches(spec, avgW);
  const perimFt = perim.inches === null ? null : perim.inches / 12;
  if (perim.source === "estimated") estIssue("total_perimeter_inches");
  if (!fabricated) {
    push("letters", "Purchased letter set", count, "letters", "computed", spec.letter_type || null);
  } else {
    if (spec.faces !== false) push("materials", "Face material (acrylic)", Math.round(faceSqFt * 100) / 100, "sqft", "computed");
    if (perimFt === null) {
      miss("total_perimeter_inches", "Return coil");
      push("materials", "Return coil", null, "ft", "unresolved");
    } else {
      if (depth !== null) push("materials", "Return coil", Math.round(perimFt * 100) / 100, "ft", perim.source, `depth ${depth}"`);
      else {
        miss("letter_depth_inches", "Return coil");
        push("materials", "Return coil", Math.round(perimFt * 100) / 100, "ft", perim.source, "depth unresolved");
      }
      push("materials", "Trim cap", Math.round(perimFt * 100) / 100, "ft", perim.source);
    }
    if (spec.backs === true || spec.illumination === "halo_lit") {
      push("materials", "Back material", Math.round(faceSqFt * 100) / 100, "sqft", "computed", "sized to face envelope");
    }
  }
  if (lit) {
    const mpf = num(product.led_modules_per_foot);
    const wpm = num(product.led_watts_per_module);
    const runFt = perimFt;
    let modules = null;
    if (runFt === null || mpf === null) {
      miss("led_modules_per_foot", "LED modules");
      push("electrical", "LED modules", null, "ea", "unresolved");
    } else {
      modules = ceil(runFt * mpf);
      push("electrical", "LED modules", modules, "ea", perim.source === "estimated" ? "estimated" : "computed", `${mpf}/ft x ${Math.round(runFt * 10) / 10}ft`);
    }
    const sw = num(product.power_supply_watts);
    const headroom = num(product.power_supply_headroom) ?? 1;
    if (modules === null || wpm === null || sw === null) {
      miss("power_supply_watts/led_watts_per_module", "Power supplies");
      push("electrical", "Power supplies", null, "ea", "unresolved");
    } else {
      const watts = modules * wpm;
      push("electrical", "Power supplies", ceil(watts / (sw * headroom)), "ea", "computed", `${Math.round(watts)}W load, ${Math.round(headroom * 100)}% headroom`);
    }
  }
  const rwFt = num(spec.raceway_length_feet);
  if (rwFt !== null) {
    push("mounting", "Raceway material", rwFt, "ft", "computed");
    const rwh = num(product.raceway_hardware_per_foot);
    if (rwh === null) {
      miss("raceway_hardware_per_foot", "Raceway hardware");
      push("mounting", "Raceway hardware", null, "ea", "unresolved");
    } else push("mounting", "Raceway hardware", ceil(rwFt * rwh), "ea", "computed");
  }
  if (spec.backer_panel === true) {
    const bw = num(spec.backer_width_inches);
    const bh = num(spec.backer_height_inches);
    if (bw === null || bh === null) {
      miss("backer dimensions", "Backer panel");
      push("mounting", "Backer panel", null, "sqft", "unresolved");
    } else push("mounting", "Backer panel", Math.round(bw * bh / 144 * 100) / 100, "sqft", "computed");
  }
  const fpl = num(product.fasteners_per_letter);
  if (fpl === null) {
    miss("fasteners_per_letter", "Mounting fasteners");
    push("mounting", "Mounting fasteners", null, "ea", "unresolved");
  } else push("mounting", "Mounting fasteners", fpl * count, "ea", "computed");
  if (spec.finish === "painted" || spec.finish_color) {
    push("finish", "Paint coverage", Math.round(faceSqFt * 100) / 100, "sqft", "computed", spec.finish_color || null);
  }
  if (fabricated) {
    const ah = num(product.assembly_hours_per_letter);
    if (ah === null) {
      miss("assembly_hours_per_letter", "Assembly labor");
      push("labor", "Assembly labor", null, "hrs", "unresolved");
    } else push("labor", "Assembly labor", Math.round(ah * count * 100) / 100, "hrs", "computed");
  }
  const ih = num(product.install_hours);
  if (ih === null) {
    miss("install_hours", "Installation labor");
    push("labor", "Installation labor", null, "hrs", "unresolved");
  } else push("labor", "Installation labor", ih, "hrs", "computed");
  return { version: CHANNEL_TAKEOFF_VERSION, resolvable: true, fabricated, lit, rows, issues };
}
export {
  CHANNEL_TAKEOFF_VERSION,
  channelSetTakeoff
};
