// base44/shared/fileBridgeModel.ts
var FB_CHUNK_SIZE = 32 * 1024 * 1024;
var FB_DELIVER_INLINE_CAP = 48 * 1024 * 1024;
var FB_KEEP_DELIVERED_MAX_MB_DEFAULT = 20;
var FB_SSE_HOLD_MS = 45e3;
var FB_HEALTHY_AGE_MS = 9e4;
var FB_BULK_DELETE_CAP = 50;
var FB_HOT_INDEX_CAP = 5e4;
var FB_RECENT_RING_CAP = 2e3;
var FB_REPLAY_WINDOW_MS = 5 * 6e4;
var TRASH_DIR = ".ccs_trash";
var PREVIEW_DIR = ".ccs_previews";
var INBOUND_DIR = "_Inbound";
var normPath = (p) => String(p || "").normalize("NFC").replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
var parentPath = (relPath) => {
  const n = normPath(relPath);
  const i = n.lastIndexOf("/");
  return i < 0 ? "" : n.slice(0, i);
};
var baseName = (relPath) => {
  const n = normPath(relPath);
  const i = n.lastIndexOf("/");
  return i < 0 ? n : n.slice(i + 1);
};
var extOf = (name) => {
  const b = baseName(name);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i + 1).toLowerCase();
};
var pathKey = (agentId, rootKey, relPath) => `${agentId}|${rootKey}|${normPath(relPath).toLowerCase()}`;
var DIR_SEP = "/";
var WINDOWS_RESERVED = /* @__PURE__ */ new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9"
]);
var safeRelPath = (p) => {
  const raw = String(p ?? "");
  if (!raw.trim()) return { ok: false, error: "empty path" };
  if (raw.includes("\0")) return { ok: false, error: "nul byte" };
  if (/^[a-zA-Z]:/.test(raw)) return { ok: false, error: "absolute drive path" };
  if (raw.startsWith("/") || raw.startsWith("\\\\")) return { ok: false, error: "absolute path" };
  const n = normPath(raw);
  const segs = n.split("/");
  for (const s of segs) {
    if (s === ".." || s === ".") return { ok: false, error: `traversal segment '${s}'` };
    if (/[<>:"|?*\x00-\x1f]/.test(s)) return { ok: false, error: `illegal char in '${s}'` };
  }
  return { ok: true, path: n };
};
var joinUnderRoot = (rootAbs, relPath) => {
  const r = safeRelPath(relPath);
  if (!r.ok) return null;
  const prefix = /^[\\/]+/.test(rootAbs) ? rootAbs.match(/^[\\/]+/)[0].replace(/\\/g, "/") : "";
  const root = normPath(rootAbs);
  const joined = `${prefix}${root}${r.path ? "/" + r.path : ""}`;
  if (!joined.startsWith(prefix + root)) return null;
  return joined;
};
var sanitizeFolderName = (name) => {
  let s = String(name || "").normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
  while (s.endsWith(".")) s = s.slice(0, -1).trim();
  if (WINDOWS_RESERVED.has(s.toLowerCase())) s = `_${s}`;
  if (!s) s = "Unnamed";
  return s.length > 120 ? s.slice(0, 120).trim() : s;
};
var DEFAULT_EXCLUDE_PATTERNS = [
  "#recycle",
  ".ds_store",
  "thumbs.db",
  "@eadir",
  ".ccs_*",
  "desktop.ini",
  ".$*",
  "~$*",
  ".spotlight-*",
  ".trashes",
  ".fseventsd"
];
var isExcluded = (relPath, patterns = DEFAULT_EXCLUDE_PATTERNS) => {
  const lower = normPath(relPath).toLowerCase();
  return patterns.some((pat) => {
    const p = String(pat).toLowerCase();
    if (!p) return false;
    const rx = new RegExp("(^|/)" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "(/|$)");
    return rx.test(lower);
  });
};
var normalizeCompany = (name) => String(name || "").normalize("NFC").toLowerCase().replace(/&/g, " and ").replace(/\b(inc|llc|ltd|corp|corporation|co|company|the)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
var bigrams = (s) => {
  const t = ` ${s} `;
  const out = /* @__PURE__ */ new Set();
  for (let i = 0; i < t.length - 1; i += 1) out.add(t.slice(i, i + 2));
  return out;
};
var nameSimilarity = (a, b) => {
  const A = bigrams(normalizeCompany(a));
  const B = bigrams(normalizeCompany(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit += 1;
  return 2 * hit / (A.size + B.size);
};
var MATCH_AUTO = 0.95;
var MATCH_SUGGEST = 0.85;
function matchCustomerFolders(folders, customers) {
  const out = [];
  const byCustomer = /* @__PURE__ */ new Map();
  for (const folder of folders) {
    const leaf = baseName(folder);
    const scored = [];
    for (const c of customers) {
      const names = [c.name, ...c.aliases || []].filter(Boolean);
      let best = 0;
      const signals = [];
      for (const n of names) {
        const sim = nameSimilarity(leaf, n);
        if (sim > best) {
          best = sim;
          signals.length = 0;
          signals.push(n === c.name ? "name" : `alias:${n}`);
        } else if (sim === best && sim > 0) signals.push(n === c.name ? "name" : `alias:${n}`);
      }
      if (best >= MATCH_SUGGEST * 0.9) {
        scored.push({ folder, customer_id: c.id, customer_name: c.name || "", confidence: best, signals });
      }
    }
    scored.sort((x, y) => y.confidence - x.confidence);
    if (!scored.length) continue;
    const top = scored[0];
    const ambiguous = scored.length > 1 && scored[1].confidence > top.confidence - 0.05;
    top.confidence = Math.min(top.confidence, ambiguous ? 0.94 : top.confidence);
    (byCustomer.get(top.customer_id) || byCustomer.set(top.customer_id, []).get(top.customer_id)).push(top);
    out.push(top);
  }
  return out.sort((x, y) => y.confidence - x.confidence);
}
var COMMAND_SPECS = {
  list_dir: { mutating: false, roles: ["primary", "backup"], lease_ms: 3e4, fields: ["root_key", "path", "cursor", "limit"] },
  fetch_bytes: { mutating: false, roles: ["primary", "backup"], lease_ms: 3e5, fields: ["root_key", "path", "expected_sha256", "size"] },
  deliver_chunk: { mutating: false, roles: ["primary", "backup"], lease_ms: 3e5, fields: ["command_id", "seq"] },
  deep_search: { mutating: false, roles: ["primary", "backup"], lease_ms: 12e4, fields: ["query", "cursor", "time_cap_ms", "filters"] },
  index_now: { mutating: false, roles: ["primary", "backup"], lease_ms: 6e5, fields: ["root_key", "path_prefix"] },
  log_tail: { mutating: false, roles: ["primary", "backup"], lease_ms: 3e4, fields: ["lines"] },
  package_files: { mutating: false, roles: ["primary"], lease_ms: 6e5, fields: ["paths", "archive_name"] },
  rebuild_manifest: { mutating: false, roles: ["primary"], lease_ms: 3e5, fields: [] },
  upload_apply: { mutating: true, roles: ["primary"], lease_ms: 3e5, fields: ["upload_id", "root_key", "dest_dir", "name", "sha256", "size", "file_url", "mode"] },
  mkdir: { mutating: true, roles: ["primary"], lease_ms: 6e4, fields: ["root_key", "path"] },
  move: { mutating: true, roles: ["primary"], lease_ms: 6e4, fields: ["root_key", "src", "dest_dir"] },
  delete: { mutating: true, roles: ["primary"], lease_ms: 6e4, fields: ["root_key", "paths", "manifest_ok"] },
  restore_trash: { mutating: true, roles: ["primary"], lease_ms: 6e4, fields: ["tombstone_path", "dest_dir"] },
  relink_files: { mutating: true, roles: ["primary"], lease_ms: 6e5, fields: ["root_key", "path_prefix", "customer_id"] },
  archive_output: { mutating: true, roles: ["primary"], lease_ms: 3e5, fields: ["root_key", "dest_dir", "name", "file_url", "sha256"] },
  pin_file: { mutating: false, roles: ["primary", "backup"], lease_ms: 15e3, fields: ["root_key", "path", "pinned"] }
};
var TERMINAL = ["completed", "failed", "expired", "cancelled"];
var TRANSITIONS = {
  queued: ["leased", "expired", "cancelled"],
  // leased→completed/failed direct: agents complete short commands w/o a progress hop
  leased: ["running", "completed", "failed", "queued", "expired", "cancelled"],
  running: ["completed", "failed", "queued", "expired"],
  completed: [],
  failed: [],
  expired: [],
  cancelled: []
};
var canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
var isTerminal = (s) => TERMINAL.includes(s);
var commandAllowed = (type, role) => {
  const spec = COMMAND_SPECS[type];
  if (!spec) return { ok: false, reason: `unknown command '${type}'` };
  if (role === "observer") return { ok: false, reason: "observer role: no commands" };
  if (!spec.roles.includes(role)) {
    return { ok: false, reason: spec.mutating ? "backup refuses mutations" : `role '${role}' cannot run '${type}'` };
  }
  return { ok: true };
};
var dedupeKey = (type, agentId, args) => {
  const stable = Object.keys(args).sort().map((k) => `${k}=${JSON.stringify(args[k])}`).join("&");
  return `${type}|${agentId}|${stable}`;
};
var routeAgent = (type, agents, now) => {
  const spec = COMMAND_SPECS[type];
  if (!spec) return { error: `unknown command '${type}'` };
  const healthy = (a) => now - a.last_seen_ms <= FB_HEALTHY_AGE_MS;
  const primary = agents.find((a) => a.role === "primary");
  const backup = agents.find((a) => a.role === "backup");
  if (spec.mutating) {
    if (primary && healthy(primary)) return { agent_id: primary.agent_id, served_by: "primary" };
    return { queued: true };
  }
  if (primary && healthy(primary)) return { agent_id: primary.agent_id, served_by: "primary" };
  if (backup && healthy(backup)) return { agent_id: backup.agent_id, served_by: "backup" };
  return { error: "no healthy agent" };
};
var canDelete = (f) => f.origin === "bridge";
var canMove = (f) => f.origin === "bridge" || f.managed_by === "bridge";
var tombstonePath = (rootKey, relPath, ts) => `${TRASH_DIR}/${rootKey}/${normPath(relPath)}.${ts}.tmb`;
var isTombstonePath = (relPath) => normPath(relPath).startsWith(TRASH_DIR + "/");
var isDeliveryStale = (f) => {
  if (!f.delivered_at_ms) return true;
  return (f.mtime_ms || 0) > f.delivered_at_ms;
};
var chunkCount = (size) => Math.max(1, Math.ceil(size / FB_CHUNK_SIZE));
var revisionName = (name, rev) => {
  const i = name.lastIndexOf(".");
  return i <= 0 ? `${name}.rev-${rev}` : `${name.slice(0, i)}.rev-${rev}${name.slice(i)}`;
};
var KIND_MAP = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  ico: "image",
  pdf: "pdf",
  txt: "text",
  md: "text",
  csv: "text",
  tsv: "text",
  log: "text",
  json: "text",
  xml: "text",
  yaml: "text",
  yml: "text",
  ini: "text",
  cfg: "text",
  html: "text",
  htm: "text",
  xls: "sheet",
  xlsx: "sheet",
  xlsm: "sheet",
  ods: "sheet",
  numbers: "sheet",
  doc: "doc",
  docx: "doc",
  rtf: "doc",
  odt: "doc",
  pages: "doc",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  flac: "audio",
  ogg: "audio",
  aac: "audio",
  mp4: "video",
  mov: "video",
  webm: "video",
  mkv: "video",
  avi: "video",
  m4v: "video",
  wmv: "video",
  cdr: "design",
  ai: "design",
  eps: "design",
  psd: "design",
  indd: "design",
  flexi: "design",
  fs: "design",
  plt: "design",
  dxf: "design",
  dwg: "design",
  skp: "design",
  zip: "archive",
  "7z": "archive",
  rar: "archive",
  tar: "archive",
  gz: "archive",
  iso: "archive",
  ttf: "font",
  otf: "font",
  woff: "font",
  woff2: "font",
  eml: "email",
  msg: "email",
  mdb: "db",
  accdb: "db",
  sqlite: "db",
  db: "db"
};
var kindOf = (name) => KIND_MAP[extOf(name)] || "other";
var viewerFor = (kind, previewReady) => {
  if (kind === "image" || kind === "pdf" || kind === "text" || kind === "audio" || kind === "video") return "native";
  if ((kind === "sheet" || kind === "doc") && previewReady) return "preview_pdf";
  if (kind === "design") return "thumb_meta";
  return "download_only";
};
var parseQualifiers = (q) => {
  const filters = {};
  const text = [];
  const re = /(ext|folder|path|agent|customer):("([^"]*)"|[^\s"]+)|"([^"]*)"|[^\s"]+/gi;
  let m;
  while (m = re.exec(String(q || ""))) {
    if (m[1]) {
      const k = m[1].toLowerCase();
      const v = m[3] ?? m[2];
      (filters[k] = filters[k] || []).push(v);
    } else {
      text.push(m[4] ?? m[0]);
    }
  }
  return { text: text.join(" "), filters };
};
function mergeServerCopies(rows) {
  const groups = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = r.path_key ? String(r.path_key).split("|").slice(1).join("|") : `__solo__${r.id ?? JSON.stringify(r)}`;
    const g = groups.get(k) || [];
    g.push({ ...r, copies: 0 });
    groups.set(k, g);
  }
  const out = [];
  for (const g of groups.values()) {
    g.sort((a, b) => (a.role === "primary" ? -1 : 0) - (b.role === "primary" ? -1 : 0));
    const head = g[0];
    head.copies = g.length;
    out.push(head);
  }
  return out;
}
var FILEBRIDGE_DEFAULTS = {
  enabled: false,
  primary_agent_id: "",
  key_id: "fbk1",
  deliver_max_mb: 2048,
  keep_delivered_max_mb: FB_KEEP_DELIVERED_MAX_MB_DEFAULT,
  package_ttl_days: 7,
  trash_retention_days: 30,
  content_search: true,
  inbound_restricted_roots: [],
  secure_download_roots: [],
  exclude_patterns: DEFAULT_EXCLUDE_PATTERNS,
  extraction_roots: [],
  config_version: 0
};
var normalizeFileBridgeSettings = (raw) => {
  const d = { ...FILEBRIDGE_DEFAULTS, exclude_patterns: [...DEFAULT_EXCLUDE_PATTERNS] };
  if (!raw || typeof raw !== "object") return d;
  const out = { ...d, ...raw };
  out.enabled = !!raw.enabled;
  for (const k of ["deliver_max_mb", "keep_delivered_max_mb", "package_ttl_days", "trash_retention_days", "config_version"]) {
    out[k] = Number.isFinite(+raw[k]) && +raw[k] >= 0 ? +raw[k] : d[k];
  }
  out.content_search = raw.content_search !== false;
  for (const k of ["inbound_restricted_roots", "secure_download_roots", "extraction_roots"]) {
    out[k] = Array.isArray(raw[k]) ? raw[k].map(String) : [];
  }
  out.exclude_patterns = Array.isArray(raw.exclude_patterns) && raw.exclude_patterns.length ? raw.exclude_patterns.map(String) : [...DEFAULT_EXCLUDE_PATTERNS];
  out.primary_agent_id = String(raw.primary_agent_id || "");
  out.key_id = String(raw.key_id || "fbk1");
  return out;
};
var resolveRole = (agentId, envRole, settings) => {
  if (settings.primary_agent_id && settings.primary_agent_id === agentId) return "primary";
  if (settings.primary_agent_id && settings.primary_agent_id !== agentId) {
    return envRole === "primary" ? "backup" : envRole === "backup" ? "backup" : "observer";
  }
  if (envRole === "primary") return "primary";
  if (envRole === "backup") return "backup";
  return "observer";
};
export {
  COMMAND_SPECS,
  DEFAULT_EXCLUDE_PATTERNS,
  DIR_SEP,
  FB_BULK_DELETE_CAP,
  FB_CHUNK_SIZE,
  FB_DELIVER_INLINE_CAP,
  FB_HEALTHY_AGE_MS,
  FB_HOT_INDEX_CAP,
  FB_KEEP_DELIVERED_MAX_MB_DEFAULT,
  FB_RECENT_RING_CAP,
  FB_REPLAY_WINDOW_MS,
  FB_SSE_HOLD_MS,
  FILEBRIDGE_DEFAULTS,
  INBOUND_DIR,
  MATCH_AUTO,
  MATCH_SUGGEST,
  PREVIEW_DIR,
  TRASH_DIR,
  baseName,
  canDelete,
  canMove,
  canTransition,
  chunkCount,
  commandAllowed,
  dedupeKey,
  extOf,
  isDeliveryStale,
  isExcluded,
  isTerminal,
  isTombstonePath,
  joinUnderRoot,
  kindOf,
  matchCustomerFolders,
  mergeServerCopies,
  nameSimilarity,
  normPath,
  normalizeCompany,
  normalizeFileBridgeSettings,
  parentPath,
  parseQualifiers,
  pathKey,
  resolveRole,
  revisionName,
  routeAgent,
  safeRelPath,
  sanitizeFolderName,
  tombstonePath,
  viewerFor
};
