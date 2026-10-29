import { moveVisibleSalesColumn, normalizeSalesColumnSettings } from "./salesColumnCatalog.mjs";

const HISTORY_LIMIT = 40;

// "Hide Optional" is a quick-start view, not a locked set of fields. Users
// can still uncheck any of these four after applying the shortcut.
export const SALES_ESSENTIAL_COLUMN_IDS = Object.freeze([
  "client_name", "sales_status", "current_task_description", "follow_up_date",
]);
const essentialIds = new Set(SALES_ESSENTIAL_COLUMN_IDS);

export function salesColumnSettingsEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
    left.every((column, index) => column.id === right[index]?.id &&
      Boolean(column.visible) === Boolean(right[index]?.visible));
}

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
  } else if (action.type === "reorder") {
    // Drag-and-drop: pull the dragged column out and drop it onto the target's
    // slot, shifting everything between. Order persists for hidden columns too.
    const from = state.present.findIndex((column) => column.id === action.id);
    const to = state.present.findIndex((column) => column.id === action.toId);
    if (from >= 0 && to >= 0 && from !== to) {
      next = [...state.present];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
    }
  } else if (action.type === "show_all" || action.type === "hide_optional") {
    next = state.present.map((column) => ({
      ...column,
      visible: action.type === "show_all" || essentialIds.has(column.id),
    }));
  } else if (action.type === "restore" && Array.isArray(action.columns)) {
    // Restore the opened/saved preset, not factory defaults. Unlike "reset",
    // this is a regular undoable edit and never mutates the stored preset.
    next = normalizeSalesColumnSettings(action.columns);
  } else {
    return state;
  }
  if (next === state.present || salesColumnSettingsEqual(next, state.present)) return state;
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
