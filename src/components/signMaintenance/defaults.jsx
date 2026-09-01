// Sign Maintenance — DEFAULT minutes for every (sign_type × action × size) cell.
// These are field-research-driven baselines from sign shop time studies.
//
// Letter-family signs (flush/halo/raceway/capsule/dimensional) scale by letter size.
// Cabinet-family signs (monument/pylon/post & panel) scale by cabinet sqft buckets.
//
// Rules of thumb baked into these numbers:
//   * Halo letters take 30–50% longer than flush for any action (open back, more parts).
//   * Raceway adds dedicated "rewire" time on top of letter-level work.
//   * Capsule/Logo is roughly 1.4× a flush letter (one big single element, but still complex).
//   * Dimensional (non-illuminated) is ~70% of flush — no electrical, simpler.
//   * Cabinet-scale actions are PER CABINET (rate_basis = per_cabinet), not per letter.
//   * Troubleshooting / electrical diagnostic actions are flat per service item.
//
// Each entry maps a SIZE KEY to MINUTES.  The Settings UI will copy these into
// the MaintenanceActionRate rows on first load (only if a row is unset).

import { ACTIONS_FOR_SIGN_TYPE } from "./constants";

const LSIZES = ["extra_small", "small", "medium", "large", "extra_large", "extra_extra_large"];
const CSIZES = ["cab_small", "cab_medium", "cab_large", "cab_extra_large"];

const letterRow = (xs, s, m, l, xl, xxl) => ({
  extra_small: xs, small: s, medium: m, large: l, extra_large: xl, extra_extra_large: xxl,
});
const cabinetRow = (s, m, l, xl) => ({
  cab_small: s, cab_medium: m, cab_large: l, cab_extra_large: xl,
});
const flat = (mins) => ({ base_minutes_flat: mins });

// =========================================================================
// LETTER-FAMILY DEFAULTS (per letter, minutes)
// =========================================================================
//
// Base shape: cleaning a letter scales gently with size. Repaint scales faster
// (more surface). LED retrofit is the heaviest cell — drill / pull old / rewire.
// Replacing individual LEDs is per-letter average. Troubleshoot is FLAT per item.

const flush_channel = {
  // Cosmetic
  clean:                    { basis: "per_letter", row: letterRow(2,  3,  4,  6,  8, 12) },
  repaint:                  { basis: "per_letter", row: letterRow(8, 12, 18, 28, 42, 60) },
  vinyl_replacement:        { basis: "per_letter", row: letterRow(6, 10, 15, 25, 38, 55) },
  reseal:                   { basis: "per_letter", row: letterRow(3,  5,  8, 12, 18, 25) },
  // LED / Lamp
  led_retrofit:             { basis: "per_letter", row: letterRow(15, 22, 35, 55, 80, 110) },
  replace_leds:             { basis: "per_letter", row: letterRow(8, 12, 20, 30, 45,  65) },
  replace_fluorescent_tubes:{ basis: "per_letter", row: letterRow(6, 10, 15, 22, 32,  45) },
  replace_ballast:          { basis: "per_letter", row: letterRow(10, 12, 15, 18, 22,  28) },
  // Electrical (per-letter where touching each letter, flat for diagnostic)
  replace_power_supplies:   { basis: "flat",       row: flat(45) },
  replace_transformer:      { basis: "flat",       row: flat(60) },
  fix_electrical:           { basis: "flat",       row: flat(60) },
  rewire:                   { basis: "per_letter", row: letterRow(8, 12, 18, 28, 40, 55) },
  replace_breaker:          { basis: "flat",       row: flat(45) },
  replace_photocell:        { basis: "flat",       row: flat(30) },
  replace_timer:            { basis: "flat",       row: flat(45) },
  replace_disconnect:       { basis: "flat",       row: flat(60) },
  troubleshoot:             { basis: "flat",       row: flat(60) },
  // Component
  replace_face:             { basis: "per_letter", row: letterRow(12, 18, 28, 42, 60,  85) },
  replace_returns:          { basis: "per_letter", row: letterRow(20, 30, 45, 70, 100, 140) },
  replace_trim_cap:         { basis: "per_letter", row: letterRow(10, 15, 25, 38, 55,  78) },
};

// HALO — open back + standoffs, every action ~1.35× flush.
const HALO_MULT = 1.35;
const scaleLetter = (src, mult) => {
  const out = {};
  Object.entries(src).forEach(([action, def]) => {
    if (def.basis === "flat") {
      out[action] = { basis: "flat", row: flat(Math.round(def.row.base_minutes_flat * mult)) };
    } else {
      const r = def.row;
      out[action] = { basis: "per_letter", row: letterRow(
        Math.round(r.extra_small * mult),
        Math.round(r.small * mult),
        Math.round(r.medium * mult),
        Math.round(r.large * mult),
        Math.round(r.extra_large * mult),
        Math.round(r.extra_extra_large * mult),
      )};
    }
  });
  return out;
};
const halo_channel    = scaleLetter(flush_channel, HALO_MULT);
const raceway_channel = scaleLetter(flush_channel, 1.15);
const capsule_logo    = scaleLetter(flush_channel, 1.40);

// Dimensional letters — no electrical actions. ~70% of flush for cosmetic.
const DIM_MULT = 0.70;
const dimensional_letters = {};
ACTIONS_FOR_SIGN_TYPE.dimensional_letters.forEach(actionId => {
  const src = flush_channel[actionId];
  if (!src) return;
  if (src.basis === "flat") {
    dimensional_letters[actionId] = { basis: "flat", row: flat(Math.round(src.row.base_minutes_flat * DIM_MULT)) };
  } else {
    const r = src.row;
    dimensional_letters[actionId] = { basis: "per_letter", row: letterRow(
      Math.round(r.extra_small * DIM_MULT),
      Math.round(r.small * DIM_MULT),
      Math.round(r.medium * DIM_MULT),
      Math.round(r.large * DIM_MULT),
      Math.round(r.extra_large * DIM_MULT),
      Math.round(r.extra_extra_large * DIM_MULT),
    )};
  }
});

// =========================================================================
// CABINET-FAMILY DEFAULTS (per cabinet, minutes)
// =========================================================================
//
// One cabinet = one service item. Sizing buckets: S (≤16 sqft), M (16–48),
// L (48–100), XL (100+).  Cleaning a small cabinet is quick, a pylon is a
// half-day project. LED retrofit is the biggest job (often a full re-lamp).

const monument_sign = {
  clean:                    { basis: "per_cabinet", row: cabinetRow( 30,  60,  120, 240) },
  repaint:                  { basis: "per_cabinet", row: cabinetRow(120, 240,  420, 720) },
  vinyl_replacement:        { basis: "per_cabinet", row: cabinetRow( 90, 180,  360, 600) },
  reseal:                   { basis: "per_cabinet", row: cabinetRow( 45,  90,  150, 240) },
  led_retrofit:             { basis: "per_cabinet", row: cabinetRow(240, 420,  720,1200) },
  replace_leds:             { basis: "per_cabinet", row: cabinetRow(120, 240,  420, 720) },
  replace_fluorescent_tubes:{ basis: "per_cabinet", row: cabinetRow( 90, 180,  300, 480) },
  replace_ballast:          { basis: "per_cabinet", row: cabinetRow( 45,  60,   90, 120) },
  replace_power_supplies:   { basis: "per_cabinet", row: cabinetRow( 60,  90,  120, 180) },
  replace_transformer:      { basis: "per_cabinet", row: cabinetRow( 90, 120,  150, 240) },
  fix_electrical:           { basis: "flat",        row: flat(90) },
  rewire:                   { basis: "per_cabinet", row: cabinetRow(120, 180,  300, 480) },
  replace_breaker:          { basis: "flat",        row: flat(60) },
  replace_photocell:        { basis: "flat",        row: flat(45) },
  replace_timer:            { basis: "flat",        row: flat(60) },
  replace_disconnect:       { basis: "flat",        row: flat(75) },
  troubleshoot:             { basis: "flat",        row: flat(75) },
  replace_face:             { basis: "per_cabinet", row: cabinetRow(180, 360,  600, 960) },
};

// Pylon — taller and farther up. All cabinet times ~1.25× monument
// (still per-cabinet — height multipliers handle the access cost separately).
const PYLON_MULT = 1.25;
const scaleCabinet = (src, mult) => {
  const out = {};
  Object.entries(src).forEach(([action, def]) => {
    if (def.basis === "flat") {
      out[action] = { basis: "flat", row: flat(Math.round(def.row.base_minutes_flat * mult)) };
    } else {
      const r = def.row;
      out[action] = { basis: "per_cabinet", row: cabinetRow(
        Math.round(r.cab_small * mult),
        Math.round(r.cab_medium * mult),
        Math.round(r.cab_large * mult),
        Math.round(r.cab_extra_large * mult),
      )};
    }
  });
  return out;
};
const pylon_sign = scaleCabinet(monument_sign, PYLON_MULT);

// Post & Panel — much simpler. Limited action set per constants. ~60% monument.
const PNP_MULT = 0.60;
const post_and_panel = {};
ACTIONS_FOR_SIGN_TYPE.post_and_panel.forEach(actionId => {
  const src = monument_sign[actionId];
  if (!src) return;
  if (src.basis === "flat") {
    post_and_panel[actionId] = { basis: "flat", row: flat(Math.round(src.row.base_minutes_flat * PNP_MULT)) };
  } else {
    const r = src.row;
    post_and_panel[actionId] = { basis: "per_cabinet", row: cabinetRow(
      Math.round(r.cab_small * PNP_MULT),
      Math.round(r.cab_medium * PNP_MULT),
      Math.round(r.cab_large * PNP_MULT),
      Math.round(r.cab_extra_large * PNP_MULT),
    )};
  }
});

// =========================================================================
// EXPORT — single lookup table
// =========================================================================
export const DEFAULT_RATES = {
  flush_channel,
  halo_channel,
  raceway_channel,
  capsule_logo,
  dimensional_letters,
  monument_sign,
  pylon_sign,
  post_and_panel,
};

// Minimum service-call dollar floors per sign type.
// Hours = max minutes hours, then × tech_rate at the estimator. These are MIN HOURS billed
// regardless of how short the action math comes out.
export const DEFAULT_MIN_HOURS = {
  flush_channel:       2,
  halo_channel:        2,
  raceway_channel:     2.5,
  capsule_logo:        2,
  dimensional_letters: 1.5,
  monument_sign:       3,
  pylon_sign:          4,
  post_and_panel:      1.5,
};

// Field name lookup (mirrors entities/MaintenanceActionRate.json fields)
export const SIZE_FIELD = {
  extra_small: "base_minutes_xs",
  small: "base_minutes_s",
  medium: "base_minutes_m",
  large: "base_minutes_l",
  extra_large: "base_minutes_xl",
  extra_extra_large: "base_minutes_xxl",
  cab_small: "base_minutes_cab_s",
  cab_medium: "base_minutes_cab_m",
  cab_large: "base_minutes_cab_l",
  cab_extra_large: "base_minutes_cab_xl",
};