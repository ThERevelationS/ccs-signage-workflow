// Centralized helper for size × height × environment installation-time settings.
//
// We resolve install times along three axes:
//   - size (extra_small … extra_extra_large)
//   - height bucket (h0_12, h12_20, h20_30, h30plus)
//   - environment (interior, exterior)
//
// Each (type × size × height × env) combination has its own drill / prep /
// electrical setting. Backward compatibility: when a new combo-keyed setting
// is missing, we fall back to the legacy size-only key (e.g.
// install_drill_rate_medium) so existing apps keep working.

export const SIZE_KEYS = [
  "extra_small",
  "small",
  "medium",
  "large",
  "extra_large",
  "extra_extra_large",
];

export const HEIGHT_BUCKETS = [
  { key: "h0_12",    label: "0–12 ft",  min: 0,  max: 12 },
  { key: "h12_20",   label: "12–20 ft", min: 12, max: 20 },
  { key: "h20_30",   label: "20–30 ft", min: 20, max: 30 },
  { key: "h30plus",  label: "30+ ft",   min: 30, max: Infinity },
];

export const ENV_KEYS = ["interior", "exterior"];

export const heightBucketFor = (heightFt) => {
  const h = parseFloat(heightFt) || 0;
  if (h <= 12) return "h0_12";
  if (h <= 20) return "h12_20";
  if (h <= 30) return "h20_30";
  return "h30plus";
};

export const normalizeEnv = (env) => (env === "interior" ? "interior" : "exterior");

// Settings-key prefixes by installation type (drill / prep / elec)
// These match the legacy size-only key prefixes — we just append the
// environment + height suffix when looking up the new keys.
export const TYPE_PREFIXES = {
  flush_mount:           { drill: "install_drill_rate_",             prep: "install_prep_rate_",             elec: "install_electrical_rate_" },
  halo_lit:              { drill: "install_halo_drill_rate_",        prep: "install_halo_prep_rate_",        elec: "install_halo_electrical_rate_" },
  dimensional_lettering: { drill: "install_dimensional_drill_rate_", prep: "install_dimensional_prep_rate_", elec: null },
};

// Build the env-and-height-qualified setting key, e.g.
//   install_drill_rate_medium__exterior__h12_20
export const qualifiedKey = (prefix, size, env, heightBucket) =>
  `${prefix}${size}__${normalizeEnv(env)}__${heightBucket}`;

// Resolve a single setting value, falling back to the legacy size-only key
// if the qualified key isn't set yet.
export const resolveRateMinutes = (settings, prefix, size, env, heightBucket, fallbackDefault = 0) => {
  if (!prefix) return 0;
  const qk = qualifiedKey(prefix, size, env, heightBucket);
  const qv = parseFloat(settings[qk]);
  if (!isNaN(qv)) return qv;
  // Legacy fallback: same setting key without env/height qualifiers.
  const legacy = parseFloat(settings[`${prefix}${size}`]);
  if (!isNaN(legacy)) return legacy;
  return fallbackDefault;
};

// Notes use the same suffix conventions, with __notes appended.
export const qualifiedNotesKey = (prefix, size, env, heightBucket) =>
  `${qualifiedKey(prefix, size, env, heightBucket)}__notes`;