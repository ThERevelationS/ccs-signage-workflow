import { moveVisibleSalesColumn, normalizeSalesColumnSettings } from "./salesColumnCatalog.mjs";

const HISTORY_LIMIT = 40;

export function newSalesColumnDraft(columns = null) {
  return {
    present: normalizeSalesColumnSettings(columns),
    past: [],
    future: [],
  };
}

export function salesColumnDraftReducer(state, action) {
  if (action.type === "reset") return newSalesColumnDraft(action.columns);
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1],
      future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: state.future[0],
      future: state.future.slice(1),
    };
  }

  let next = state.present;
  if (action.type === "toggle") {
    if (!state.present.some((column) => column.id === action.id)) return state;
    next = state.present.map((column) => column.id === action.id
      ? { ...column, visible: !column.visible } : column);
  } else if (action.type === "move") {
    next = moveVisibleSalesColumn(state.present, action.id, action.direction);
  } else {
    return state;
  }
  if (next === state.present) return state;
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

// Compare semantic fields only; obsolete column metadata is left untouched
// by a view-only editor. Normalize before comparing so opening an older
// preset does not create a false "unsaved changes" warning.
export function salesEditorSnapshot({ name = "", columns = null, conditions = [] } = {}) {
  return {
    name: String(name),
    columns: normalizeSalesColumnSettings(columns).map(({ id, visible }) => ({ id, visible })),
    conditions: JSON.parse(JSON.stringify(conditions || [])),
  };
}

export function salesEditorHasChanges(tab, baseline, draft) {
  if (!baseline) return false;
  if (String(draft.name) !== baseline.name) return true;
  if (tab === "columns") {
    return JSON.stringify(salesEditorSnapshot({ columns: draft.columns }).columns)
      !== JSON.stringify(baseline.columns);
  }
  return JSON.stringify(draft.conditions) !== JSON.stringify(baseline.conditions);
}
