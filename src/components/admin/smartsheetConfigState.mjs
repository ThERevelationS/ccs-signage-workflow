function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = stableNormalize(value[key]);
    return out;
  }, {});
}

export function stableConfigString(value) {
  return JSON.stringify(stableNormalize(value));
}

export function sameStableConfig(left, right) {
  return stableConfigString(left) === stableConfigString(right);
}
