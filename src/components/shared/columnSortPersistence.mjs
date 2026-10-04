export const DEFAULT_COLUMN_SORT_CONFIG = Object.freeze({
  key: null,
  direction: "asc",
  customFilter: null,
});

export function readColumnSortConfig(storageKey, storage = globalThis?.localStorage) {
  try {
    const saved = storage?.getItem?.(storageKey);
    if (!saved) return { ...DEFAULT_COLUMN_SORT_CONFIG };
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_COLUMN_SORT_CONFIG };
    }
    return parsed;
  } catch (error) {
    console.error("Error loading sort config:", error);
    return { ...DEFAULT_COLUMN_SORT_CONFIG };
  }
}

export function resolveColumnSortState(sortState, storageKey, storage = globalThis?.localStorage) {
  if (sortState?.storageKey === storageKey) return sortState;
  return {
    storageKey,
    config: readColumnSortConfig(storageKey, storage),
  };
}

export function updateColumnSortState(sortState, storageKey, nextConfig, storage = globalThis?.localStorage) {
  const current = resolveColumnSortState(sortState, storageKey, storage);
  const config = typeof nextConfig === "function"
    ? nextConfig(current.config)
    : nextConfig;
  return { storageKey, config };
}

export function persistColumnSortState(sortState, storageKey, storage = globalThis?.localStorage) {
  if (!sortState || sortState.storageKey !== storageKey) return false;
  try {
    storage?.setItem?.(storageKey, JSON.stringify(sortState.config));
    return true;
  } catch (error) {
    console.error("Error saving sort config:", error);
    return false;
  }
}
