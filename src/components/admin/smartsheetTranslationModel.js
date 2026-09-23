const NOTE_TYPE_LABELS = Object.freeze({
  admin: "Administrative Work",
  fabrication: "Sign Shop Fabrication",
  vinyl: "Vinyl Production",
  permitting: "Permitting Steps",
  design: "Design Work",
  installation: "Installation",
  client: "Client Communication",
  other: "Other",
});

const LABEL_TO_NOTE_TYPE = new Map(
  Object.entries(NOTE_TYPE_LABELS).flatMap(([key, label]) => [
    [normalizeOptionKey(key), key],
    [normalizeOptionKey(label), key],
  ]),
);

export const WORK_NOTE_TYPES = Object.freeze(Object.keys(NOTE_TYPE_LABELS));
export const LEAD_SOURCE_ALIASES = Object.freeze({
  website: "Web",
});

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeOptionKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function cleanLine(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function dateStamp(value) {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function noteTypeLabel(value) {
  const key = LABEL_TO_NOTE_TYPE.get(normalizeOptionKey(value)) || "other";
  return NOTE_TYPE_LABELS[key] || NOTE_TYPE_LABELS.other;
}

function noteTypeValue(value) {
  return LABEL_TO_NOTE_TYPE.get(normalizeOptionKey(value)) || "other";
}

export function serializeBase44WorkNotes(workNotes = []) {
  if (!Array.isArray(workNotes) || workNotes.length === 0) return "";
  return workNotes.map((note) => {
    const date = dateStamp(note?.timestamp) || "undated";
    const type = noteTypeLabel(note?.type);
    const author = text(note?.created_by) || "Unknown";
    const body = cleanLine(note?.text);
    const lines = [`[${date} | ${type} | ${author}] ${body}`.trimEnd()];
    for (const subTask of Array.isArray(note?.sub_tasks) ? note.sub_tasks : []) {
      const subText = cleanLine(subTask?.text);
      if (!subText) continue;
      lines.push(`  - [${subTask?.completed ? "x" : " "}] ${subText}`);
    }
    return lines.join("\n");
  }).filter(Boolean).join("\n\n");
}

const CANONICAL_NOTE_HEADER = /^\[(\d{4}-\d{2}-\d{2}|undated)\s*\|\s*([^|\]]+)\s*\|\s*([^\]]*)\]\s*(.*)$/i;
const CANONICAL_SUBTASK = /^\s*-\s*\[([xX ])\]\s*(.+)$/;

export function parseCanonicalSmartsheetNotes(value) {
  const source = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (!source) return { canonical: true, notes: [] };
  const lines = source.split("\n");
  const notes = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    current.text = current.text.trim();
    if (!current.text) return;
    notes.push(current);
    current = null;
  };

  for (const line of lines) {
    const header = CANONICAL_NOTE_HEADER.exec(line);
    if (header) {
      flush();
      current = {
        date: header[1].toLowerCase() === "undated" ? "" : header[1],
        type: noteTypeValue(header[2]),
        created_by: text(header[3]) || "Unknown",
        text: text(header[4]),
        sub_tasks: [],
      };
      continue;
    }
    if (!current) {
      if (line.trim()) return { canonical: false, notes: [] };
      continue;
    }
    const subTask = CANONICAL_SUBTASK.exec(line);
    if (subTask) {
      current.sub_tasks.push({
        text: text(subTask[2]),
        completed: subTask[1].toLowerCase() === "x",
      });
    } else if (line.trim()) {
      current.text = current.text ? `${current.text}\n${line.trim()}` : line.trim();
    }
  }
  flush();
  return { canonical: notes.length > 0, notes };
}

export function normalizeCombinedNotesText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

function canonicalAlias(value, aliases = {}) {
  const key = normalizeOptionKey(value);
  if (!key) return "";
  for (const [from, to] of Object.entries(aliases || {})) {
    if (normalizeOptionKey(from) === key) return text(to);
  }
  return text(value);
}

export function reconcilePicklistOptions({
  base44Options = [],
  smartsheetOptions = [],
  aliases = {},
} = {}) {
  const base = (base44Options || []).map((value) => canonicalAlias(value, aliases)).filter(Boolean);
  const sheet = (smartsheetOptions || []).map((value) => canonicalAlias(value, aliases)).filter(Boolean);
  const baseByKey = new Map(base.map((value) => [normalizeOptionKey(value), value]));
  const sheetByKey = new Map(sheet.map((value) => [normalizeOptionKey(value), value]));

  const addToBase44 = [];
  const addToSmartsheet = [];
  for (const [key, value] of sheetByKey) {
    if (!baseByKey.has(key)) addToBase44.push(value);
  }
  for (const [key, value] of baseByKey) {
    if (!sheetByKey.has(key)) addToSmartsheet.push(value);
  }

  const combined = [];
  const seen = new Set();
  for (const value of [...sheet, ...base]) {
    const key = normalizeOptionKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    combined.push(value);
  }

  return {
    addToBase44,
    addToSmartsheet,
    combined,
    synchronized: addToBase44.length === 0 && addToSmartsheet.length === 0,
  };
}

function activeUsers(users = []) {
  return (users || []).filter((user) => user?.is_active !== false && text(user?.full_name));
}

function firstName(value) {
  return text(value).split(/\s+/)[0] || "";
}

export function resolveSmartsheetPerson(smartsheetValue, authorizedUsers = [], aliases = {}) {
  const raw = text(smartsheetValue);
  if (!raw) return { state: "blank", user: null, candidates: [] };
  const users = activeUsers(authorizedUsers);
  const requested = normalizeOptionKey(raw);
  const explicit = aliases?.[requested] || aliases?.[raw] || "";
  const explicitKey = normalizeOptionKey(explicit);
  if (explicitKey) {
    const candidates = users.filter((user) => normalizeOptionKey(user.full_name) === explicitKey);
    return candidates.length === 1
      ? { state: "alias", user: candidates[0], candidates }
      : { state: candidates.length > 1 ? "ambiguous" : "unresolved", user: null, candidates };
  }

  const exact = users.filter((user) => normalizeOptionKey(user.full_name) === requested);
  if (exact.length === 1) return { state: "exact", user: exact[0], candidates: exact };
  if (exact.length > 1) return { state: "ambiguous", user: null, candidates: exact };

  const first = users.filter((user) => normalizeOptionKey(firstName(user.full_name)) === requested);
  if (first.length === 1) return { state: "unique_first_name", user: first[0], candidates: first };
  if (first.length > 1) return { state: "ambiguous", user: null, candidates: first };
  return { state: "unresolved", user: null, candidates: [] };
}

export function smartsheetPersonLabelForUser(user, smartsheetOptions = [], authorizedUsers = []) {
  const fullName = text(user?.full_name);
  if (!fullName) return "";
  for (const option of smartsheetOptions || []) {
    const resolution = resolveSmartsheetPerson(option, authorizedUsers);
    if (resolution.user?.email && user?.email && normalizeOptionKey(resolution.user.email) === normalizeOptionKey(user.email)) {
      return text(option);
    }
    if (resolution.user?.full_name && normalizeOptionKey(resolution.user.full_name) === normalizeOptionKey(fullName)) {
      return text(option);
    }
  }
  const first = firstName(fullName);
  const sameFirst = activeUsers(authorizedUsers).filter(
    (candidate) => normalizeOptionKey(firstName(candidate.full_name)) === normalizeOptionKey(first),
  );
  return sameFirst.length === 1 ? first : fullName;
}
