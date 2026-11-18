const BASE = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';

export class AppCallError extends Error {
  constructor(message, { status = 0, ambiguous = false, cause } = {}) {
    super(message, { cause });
    this.name = 'AppCallError';
    this.status = status;
    this.ambiguous = ambiguous;
  }
}

export class RateLimiter {
  constructor({ intervalMs = 550, now = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    this.intervalMs = intervalMs;
    this.now = now;
    this.sleep = sleep;
    this.next = 0;
    this.chain = Promise.resolve();
  }

  async wait(weight = 1) {
    if (!Number.isSafeInteger(weight) || weight < 1) throw new Error('Invalid rate limiter weight.');
    const previous = this.chain;
    let release;
    this.chain = new Promise((resolve) => { release = resolve; });
    try {
      await previous;
      const slot = Math.max(this.next, this.now()) + this.intervalMs * (weight - 1);
      const delay = slot - this.now();
      if (delay > 0) await this.sleep(delay);
      this.next = Math.max(slot, this.now()) + this.intervalMs;
    } finally {
      release();
    }
  }
}

export function requestCost(fn, payload) {
  if (fn === 'manageMigration' && payload?.action === 'import_rows') return payload.entity === 'estimates' ? 60 : 35;
  if (fn === 'corebridgeHistoryImport') {
    if (payload?.action === 'lookup_links') return 2;
    if (payload?.action === 'write_rows') return 2 + 2 * (payload.rows?.length || 1);
    if (payload?.action === 'update_rows') return 2 * (payload.rows?.length || 1);
    if (payload?.action === 'get_rows') return payload.ids?.length || 1;
  }
  if (fn === 'corebridgeSyncLock') return 5;
  if (fn === 'staffEntityWrite') return 3;
  if (fn === 'verifyLogin') return 4;
  return 2;
}

export class AppClient {
  constructor({ fetchImpl = fetch, baseUrl = BASE, limiter = new RateLimiter() } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.limiter = limiter;
    this.token = '';
  }

  async call(fn, payload, { write = false } = {}) {
    if (write && fn !== 'corebridgeSyncLock' && this.beforeWrite) await this.beforeWrite();
    await this.limiter.wait(requestCost(fn, payload));
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/${fn}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, ...(this.token ? { session_token: this.token } : {}) }),
        signal: AbortSignal.timeout(120000),
      });
    } catch (error) {
      throw new AppCallError(`${fn}: network request failed.`, { ambiguous: write, cause: error });
    }
    let envelope;
    try { envelope = await response.json(); }
    catch { throw new AppCallError(`${fn}: invalid response.`, { status: response.status, ambiguous: write }); }
    const body = envelope.data || envelope;
    if (!response.ok || envelope.success === false || body.success === false) {
      throw new AppCallError(`${fn}: HTTP ${response.status}: ${body.error || envelope.error || 'request failed'}`,
        { status: response.status, ambiguous: write && response.status >= 500 });
    }
    return body;
  }

  async login(credentials) {
    if (!credentials?.user || !credentials?.pass) throw new Error('CCS staff credentials are required.');
    const result = await this.call('verifyLogin', { username: credentials.user, password: credentials.pass });
    if (!result.token) throw new Error('CCS staff login failed.');
    this.token = result.token;
  }

  async list(entity, query = {}, { pageSize = 1000 } = {}) {
    const rows = [], seen = new Set();
    for (let skip = 0; ; skip += pageSize) {
      if (skip > 100000) throw new Error(`${entity} exceeds staff read pagination limit.`);
      const response = await this.call('staffDataRead', { entity, query, sort: 'created_date', limit: pageSize, skip });
      if (!Array.isArray(response.items)) throw new Error(`${entity} list returned no items.`);
      for (const row of response.items) {
        if (!row.id || seen.has(row.id)) throw new Error(`${entity} pagination has missing or duplicate IDs.`);
        seen.add(row.id); rows.push(row);
      }
      if (response.items.length < pageSize) break;
    }
    return rows;
  }

  async get(entity, id) {
    const result = await this.call('staffDataRead', { entity, id });
    if (!result.item?.id) throw new Error(`${entity} ${id} is unavailable.`);
    return result.item;
  }

  async appendMap(data) {
    const result = await this.call('staffEntityWrite', { entity: 'LegacyMigrationMap', op: 'create', data }, { write: true });
    if (!result.record?.id) throw new AppCallError('Marker create returned no ID.', { ambiguous: true });
    return result.record;
  }

  async lock(action, runId, ttlMinutes = 360) {
    return this.call('corebridgeSyncLock', { action, run_id: runId, ttl_minutes: ttlMinutes }, { write: action !== 'status' });
  }

  async map(sourceEntity, sourceId) {
    return this.list('LegacyMigrationMap', {
      source_app_id: 'corebridge', source_entity: sourceEntity, source_id: String(sourceId),
    });
  }

  async cas(entity, current, patch) {
    if (!current?.id || !current.updated_date) throw new Error(`${entity} CAS requires id and updated_date.`);
    await this.call('staffEntityWrite', {
      entity, op: 'updateMany', id: current.id, query: { id: current.id, updated_date: current.updated_date },
      update: { $set: patch },
    }, { write: true });
    const result = await this.get(entity, current.id);
    for (const [key, value] of Object.entries(patch)) {
      if (JSON.stringify(result[key]) !== JSON.stringify(value)) throw new Error(`${entity} ${current.id} CAS readback differs for ${key}.`);
    }
    return result;
  }

  async byKey(entity, key) {
    if (['Invoice', 'Payment', 'ReconciliationBatch'].includes(entity)) {
      const result = await this.call('corebridgeHistoryImport', { action: 'find_by_keys', entity, keys: [key] });
      if (!Array.isArray(result.results) || result.results.length !== 1) throw new Error('Incomplete key lookup.');
      return result.results[0].matches;
    }
    return this.list(entity, { creation_request_key: key });
  }

  async importMapped(entity, row, batchId, sourceLabel) {
    const result = await this.call('manageMigration', {
      action: 'import_rows', entity, batch_id: batchId,
      rows: [row], mapping: Object.fromEntries(Object.keys(row).map((key) => [key, key])),
      on_duplicate: 'skip', source_label: sourceLabel,
    }, { write: true });
    const entry = result.results?.[0];
    if (!entry || entry.status === 'error' || !entry.target_id) throw new AppCallError(`${entity} mapper failed: ${entry?.error || 'missing result'}`, { ambiguous: true });
    return entry;
  }

  async importEstimate(row) {
    return this.importMapped('estimates', row, 'cb-estimates-2026-11-17', 'corebridge_order_archive');
  }

  async historyWrite(entity, row, adopt = false) {
    const result = await this.call('corebridgeHistoryImport', {
      action: 'write_rows', entity, batch_id: 'cb-invoices-2026-11-17', rows: [row], ...(adopt ? { adopt: true } : {}),
    }, { write: true });
    const entry = result.results?.[0];
    if (!entry || entry.status === 'error' || !entry.target_id) {
      throw new AppCallError(`${entity} importer failed: ${entry?.error || 'missing result'}`, { ambiguous: !entry || Boolean(entry.ambiguous) });
    }
    return entry;
  }

  async links(estimateId) {
    const result = await this.call('corebridgeHistoryImport', { action: 'lookup_links', estimate_ids: [estimateId] });
    if (!Array.isArray(result.links) || result.links.length !== 1) throw new Error('Estimate link lookup was incomplete.');
    return result.links[0];
  }

  async historyGet(entity, id) {
    const result = await this.call('corebridgeHistoryImport', { action: 'get_rows', entity, ids: [id] });
    const entry = result.results?.[0];
    if (!entry?.item || entry.error) throw new Error(`${entity} ${id} is unavailable.`);
    return entry.item;
  }

  async historyUpdate(entity, id, set) {
    const result = await this.call('corebridgeHistoryImport', { action: 'update_rows', entity, rows: [{ id, set }] }, { write: true });
    const entry = result.results?.[0];
    if (!entry || entry.status !== 'updated') throw new AppCallError(`${entity} update failed.`, { ambiguous: true });
    const item = await this.historyGet(entity, id);
    for (const [field, value] of Object.entries(set)) {
      if (JSON.stringify(item[field]) !== JSON.stringify(value)) throw new Error(`${entity} ${id} readback differs for ${field}.`);
    }
    return item;
  }
}
