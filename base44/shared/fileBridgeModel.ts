// fileBridgeModel.ts — PURE contract model for the Unraid File Bridge.
// Zero imports: bundled into backend functions, the agent, and the test suite.
// Every path/command/provenance rule lives here exactly once.

export const FB_CHUNK_SIZE = 32 * 1024 * 1024;        // spike: 64MB raw ok, 96MB → 413
export const FB_DELIVER_INLINE_CAP = 48 * 1024 * 1024;
export const FB_KEEP_DELIVERED_MAX_MB_DEFAULT = 20;
export const FB_SSE_HOLD_MS = 45_000;                  // spike: 55s holds complete
export const FB_HEALTHY_AGE_MS = 90_000;
export const FB_BULK_DELETE_CAP = 50;
export const FB_HOT_INDEX_CAP = 50_000;                // per agent, demote-oldest overflow
export const FB_RECENT_RING_CAP = 2_000;
export const FB_REPLAY_WINDOW_MS = 5 * 60_000;

export const TRASH_DIR = '.ccs_trash';
export const PREVIEW_DIR = '.ccs_previews';            // agent-appdata only, never on share
export const INBOUND_DIR = '_Inbound';

// ---------- paths ----------

export const normPath = (p: string): string =>
  String(p || '')
    .normalize('NFC')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');

export const parentPath = (relPath: string): string => {
  const n = normPath(relPath);
  const i = n.lastIndexOf('/');
  return i < 0 ? '' : n.slice(0, i);
};

export const baseName = (relPath: string): string => {
  const n = normPath(relPath);
  const i = n.lastIndexOf('/');
  return i < 0 ? n : n.slice(i + 1);
};

export const extOf = (name: string): string => {
  const b = baseName(name);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i + 1).toLowerCase();
};

/** SMB is case-insensitive; Linux is not. Dedupe key folds both. */
export const pathKey = (agentId: string, rootKey: string, relPath: string): string =>
  `${agentId}|${rootKey}|${normPath(relPath).toLowerCase()}`;

export const DIR_SEP = '/';

const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** Path must stay inside its root: reject absolute, drive, '..', NUL, control. */
export const safeRelPath = (p: string): { ok: true; path: string } | { ok: false; error: string } => {
  const raw = String(p ?? '');
  if (!raw.trim()) return { ok: false, error: 'empty path' };
  if (raw.includes('\0')) return { ok: false, error: 'nul byte' };
  if (/^[a-zA-Z]:/.test(raw)) return { ok: false, error: 'absolute drive path' };
  if (raw.startsWith('/') || raw.startsWith('\\\\')) return { ok: false, error: 'absolute path' };
  const n = normPath(raw);
  const segs = n.split('/');
  for (const s of segs) {
    if (s === '..' || s === '.') return { ok: false, error: `traversal segment '${s}'` };
    if (/[<>:"|?*\x00-\x1f]/.test(s)) return { ok: false, error: `illegal char in '${s}'` };
  }
  return { ok: true, path: n };
};

/** Root-join guard used agent-side: join then verify containment. Preserves the
 *  root's absolute form (POSIX `/mnt/...` or UNC `//server/...`). */
export const joinUnderRoot = (rootAbs: string, relPath: string): string | null => {
  const r = safeRelPath(relPath);
  if (!r.ok) return null;
  const prefix = /^[\\/]+/.test(rootAbs) ? rootAbs.match(/^[\\/]+/)![0].replace(/\\/g, '/') : '';
  const root = normPath(rootAbs);
  const joined = `${prefix}${root}${r.path ? '/' + r.path : ''}`;
  if (!joined.startsWith(prefix + root)) return null;
  return joined;
};

export const sanitizeFolderName = (name: string): string => {
  let s = String(name || '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  while (s.endsWith('.')) s = s.slice(0, -1).trim();
  if (WINDOWS_RESERVED.has(s.toLowerCase())) s = `_${s}`;
  if (!s) s = 'Unnamed';
  return s.length > 120 ? s.slice(0, 120).trim() : s;
};

// ---------- exclusions ----------

export const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  '#recycle', '.ds_store', 'thumbs.db', '@eadir', '.ccs_*',
  'desktop.ini', '.$*', '~$*', '.spotlight-*', '.trashes', '.fseventsd',
];

export const isExcluded = (relPath: string, patterns: string[] = DEFAULT_EXCLUDE_PATTERNS): boolean => {
  const lower = normPath(relPath).toLowerCase();
  return patterns.some((pat) => {
    const p = String(pat).toLowerCase();
    if (!p) return false;
    const rx = new RegExp('(^|/)' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '(/|$)');
    return rx.test(lower);
  }lease_ms: 60_000, fields: ['root_key', 'paths', 'manifest_ok'] },
  restore_trash:     { mutating: true, roles: ['primary'], lease_ms: 60_000, fields: ['tombstone_path', 'dest_dir'] },
  relink_files:      { mutating: true, roles: ['primary'], lease_ms: 600_000, fields: ['root_key', 'path_prefix', 'customer_id'] },
  archive_output:    { mutating: true, roles: ['primary'], lease_ms: 300_000, fields: ['root_key', 'dest_dir', 'name', 'file_url', 'sha256'] },
  pin_file:          { mutating: false, roles: ['primary', 'backup'], lease_ms: 15_000, fields: ['root_key', 'path', 'pinned'] },
};

const TERMINAL: CommandStatus[] = ['completed', 'failed', 'expired', 'cancelled'];
const TRANSITIONS: Record<CommandStatus, CommandStatus[]> = {
  queued: ['leased', 'expired', 'cancelled'],
  leased: ['running', 'queued', 'expired', 'cancelled'],
  running: ['completed', 'failed', 'queued', 'expired'],
  completed: [], failed: [], expired: [], cancelled: [],
};

export const canTransition = (from: CommandStatus, to: CommandStatus): boolean =>
  (TRANSITIONS[from] || []).includes(to);

export const isTerminal = (s: CommandStatus): boolean => TERMINAL.includes(s);

export const commandAllowed = (type: string, role: 'primary' | 'backup' | 'observer'): { ok: boolean; reason?: string } => {
  const spec = COMMAND_SPECS[type];
  if (!spec) return { ok: false, reason: `unknown command '${type}'` };
  if (role === 'observer') return { ok: false, reason: 'observer role: no commands' };
  if (!spec.roles.includes(role)) {
    return { ok: false, reason: spec.mutating ? 'backup refuses mutations' : `role '${role}' cannot run '${type}'` };
  }
  return { ok: true };
};

// ---------- dedupe / leases ----------

export const dedupeKey = (type: string, agentId: string, args: Record<string, any>): string => {
  const stable = Object.keys(args).sort().map((k) => `${k}=${JSON.stringify(args[k])}`).join('&');
  return `${type}|${agentId}|${stable}`;
};

/** Read commands route: primary if healthy else backup; writes: primary only. */
export const routeAgent = (
  type: string,
  agents: Array<{ agent_id: string; role: string; last_seen_ms: number }>,
  now: number,
): { agent_id?: string; served_by?: 'primary' | 'backup'; queued?: boolean; error?: string } => {
  const spec = COMMAND_SPECS[type];
  if (!spec) return { error: `unknown command '${type}'` };
  const healthy = (a: { last_seen_ms: number }) => now - a.last_seen_ms <= FB_HEALTHY_AGE_MS;
  const primary = agents.find((a) => a.role === 'primary');
  const backup = agents.find((a) => a.role === 'backup');
  if (spec.mutating) {
    if (primary && healthy(primary)) return { agent_id: primary.agent_id, served_by: 'primary' };
    return { queued: true };
  }
  if (primary && healthy(primary)) return { agent_id: primary.agent_id, served_by: 'primary' };
  if (backup && healthy(backup)) return { agent_id: backup.agent_id, served_by: 'backup' };
  return { error: 'no healthy agent' };
};

// ---------- provenance ----------

export type Origin = 'bridge' | 'external';
export type ManagedBy = 'bridge' | 'none';

/** origin:bridge = app-created → deletable. managed_by:bridge = bridge-filed → movable, still not deletable. */
export const canDelete = (f: { origin?: string; managed_by?: string }): boolean => f.origin === 'bridge';
export const canMove = (f: { origin?: string; managed_by?: string }): boolean =>
  f.origin === 'bridge' || f.managed_by === 'bridge';

export const tombstonePath = (rootKey: string, relPath: string, ts: number): string =>
  `${TRASH_DIR}/${rootKey}/${normPath(relPath)}.${ts}.tmb`;

export const isTombstonePath = (relPath: string): boolean =>
  normPath(relPath).startsWith(TRASH_DIR + '/');

// ---------- delivery staleness ----------

/** delivered copy is stale if server mtime moved past delivery time. */
export const isDeliveryStale = (f: { mtime_ms?: number; delivered_at_ms?: number }): boolean => {
  if (!f.delivered_at_ms) return true;
  return (f.mtime_ms || 0) > f.delivered_at_ms;
};

export const chunkCount = (size: number): number => Math.max(1, Math.ceil(size / FB_CHUNK_SIZE));

export const revisionName = (name: string, rev: number): string => {
  const i = name.lastIndexOf('.');
  return i <= 0 ? `${name}.rev-${rev}` : `${name.slice(0, i)}.rev-${rev}${name.slice(i)}`;
};

// ---------- viewer kind registry ----------

export type FileKind =
  | 'image' | 'pdf' | 'text' | 'sheet' | 'doc' | 'audio' | 'video'
  | 'design' | 'archive' | 'font' | 'email' | 'db' | 'other';

const KIND_MAP: Record<string, FileKind> = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image',
  bmp: 'image', tif: 'image', tiff: 'image', heic: 'image', ico: 'image',
  pdf: 'pdf',
  txt: 'text', md: 'text', csv: 'text', tsv: 'text', log: 'text', json: 'text',
  xml: 'text', yaml: 'text', yml: 'text', ini: 'text', cfg: 'text', html: 'text', htm: 'text',
  xls: 'sheet', xlsx: 'sheet', xlsm: 'sheet', ods: 'sheet', numbers: 'sheet',
  doc: 'doc', docx: 'doc', rtf: 'doc', odt: 'doc', pages: 'doc',
  mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio', aac: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video', m4v: 'video', wmv: 'video',
  cdr: 'design', ai: 'design', eps: 'design', psd: 'design', indd: 'design',
  flexi: 'design', fs: 'design', plt: 'design', dxf: 'design', dwg: 'design', skp: 'design',
  zip: 'archive', '7z': 'archive', rar: 'archive', tar: 'archive', gz: 'archive', iso: 'archive',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
  eml: 'email', msg: 'email',
  mdb: 'db', accdb: 'db', sqlite: 'db', db: 'db',
};

export const kindOf = (name: string): FileKind => KIND_MAP[extOf(name)] || 'other';

export type ViewerMode = 'native' | 'preview_pdf' | 'thumb_meta' | 'download_only';

export const viewerFor = (kind: FileKind, previewReady: boolean): ViewerMode => {
  if (kind === 'image' || kind === 'pdf' || kind === 'text' || kind === 'audio' || kind === 'video') return 'native';
  if ((kind === 'sheet' || kind === 'doc') && previewReady) return 'preview_pdf';
  if (kind === 'design') return 'thumb_meta';
  return 'download_only';
};

// ---------- search qualifiers ----------

export const parseQualifiers = (q: string): { text: string; filters: Record<string, string[]> } => {
  const filters: Record<string, string[]> = {};
  const text: string[] = [];
  // tokens: key:"quoted value" | key:value | word | "quoted phrase"
  const re = /(ext|folder|path|agent|customer):("([^"]*)"|[^\s"]+)|"([^"]*)"|[^\s"]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(q || '')))) {
    if (m[1]) {
      const k = m[1].toLowerCase();
      const v = m[3] ?? m[2];
      (filters[k] = filters[k] || []).push(v);
    } else {
      text.push(m[4] ?? m[0]);
    }
  }
  return { text: text.join(' '), filters };
};

// ---------- server-copy merge ----------

/** Same file on primary+backup collapses to one row w/ copies badge; prefer primary. */
export function mergeServerCopies<T extends { agent_id?: string; path_key?: string; role?: string }>(
  rows: T[],
): Array<T & { copies: number }> {
  const groups = new Map<string, Array<T & { copies: number }>>();
  for (const r of rows) {
    const k = String(r.path_key || '').split('|').slice(1).join('|');
    const g = groups.get(k) || [];
    g.push({ ...r, copies: 0 });
    groups.set(k, g);
  }
  const out: Array<T & { copies: number }> = [];
  for (const g of groups.values()) {
    g.sort((a, b) => (a.role === 'primary' ? -1 : 0) - (b.role === 'primary' ? -1 : 0));
    const head = g[0];
    head.copies = g.length;
    out.push(head);
  }
  return out;
}

// ---------- settings (FB-13) ----------

export const FILEBRIDGE_DEFAULTS = {
  enabled: false,
  primary_agent_id: '',
  key_id: 'fbk1',
  deliver_max_mb: 2048,
  keep_delivered_max_mb: FB_KEEP_DELIVERED_MAX_MB_DEFAULT,
  package_ttl_days: 7,
  trash_retention_days: 30,
  content_search: true,
  inbound_restricted_roots: [] as string[],
  secure_download_roots: [] as string[],
  exclude_patterns: DEFAULT_EXCLUDE_PATTERNS,
  extraction_roots: [] as string[],
  config_version: 0,
};

export const normalizeFileBridgeSettings = (raw: any): typeof FILEBRIDGE_DEFAULTS & Record<string, any> => {
  const d = { ...FILEBRIDGE_DEFAULTS, exclude_patterns: [...DEFAULT_EXCLUDE_PATTERNS] };
  if (!raw || typeof raw !== 'object') return d;
  const out: any = { ...d, ...raw };
  out.enabled = !!raw.enabled;
  for (const k of ['deliver_max_mb', 'keep_delivered_max_mb', 'package_ttl_days', 'trash_retention_days', 'config_version']) {
    out[k] = Number.isFinite(+raw[k]) && +raw[k] >= 0 ? +raw[k] : d[k as keyof typeof d];
  }
  out.content_search = raw.content_search !== false;
  for (const k of ['inbound_restricted_roots', 'secure_download_roots', 'extraction_roots']) {
    out[k] = Array.isArray(raw[k]) ? raw[k].map(String) : [];
  }
  out.exclude_patterns = Array.isArray(raw.exclude_patterns) && raw.exclude_patterns.length
    ? raw.exclude_patterns.map(String)
    : [...DEFAULT_EXCLUDE_PATTERNS];
  out.primary_agent_id = String(raw.primary_agent_id || '');
  out.key_id = String(raw.key_id || 'fbk1');
  return out;
};

/** Role resolution (split-brain proof): config pin > env ROLE > observer. */
export const resolveRole = (
  agentId: string,
  envRole: string,
  settings: { primary_agent_id?: string },
): 'primary' | 'backup' | 'observer' => {
  if (settings.primary_agent_id && settings.primary_agent_id === agentId) return 'primary';
  if (settings.primary_agent_id && settings.primary_agent_id !== agentId) {
    return envRole === 'primary' ? 'backup' : (envRole === 'backup' ? 'backup' : 'observer');
  }
  if (envRole === 'primary') return 'primary';
  if (envRole === 'backup') return 'backup';
  return 'observer';
};
