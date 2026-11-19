import { AppCallError } from './app-client.mjs';

const clean = (v) => String(v ?? '').trim();
const metadata = (row) => {
  try { return JSON.parse(row.notes || '{}'); }
  catch { throw new Error(`Malformed sync marker ${row.id}.`); }
};

export class Journal {
  constructor(app, runId) { this.app = app; this.runId = runId; }

  async append(key, state, details) {
    return this.app.appendMap({
      source_app_id: 'corebridge', source_entity: '__sync_write__', source_id: key,
      target_entity: '__sync_write__', target_id: details.target_id || state,
      notes: JSON.stringify({ ...details, key, state, run_id: this.runId, at: new Date().toISOString() }),
    });
  }

  async goodLedger(sourceEntity, sourceId) {
    const rows = (await this.app.map(sourceEntity, sourceId)).filter((row) => row.target_id && row.target_id !== '__error__');
    if (rows.length > 1) throw new Error(`Multiple ${sourceEntity} ledgers for ${sourceId}.`);
    return rows[0] || null;
  }

  async recover() {
    const rows = await this.app.list('LegacyMigrationMap', { source_app_id: 'corebridge', source_entity: '__sync_write__' });
    const groups = new Map();
    for (const row of rows) {
      const value = metadata(row);
      if (!value.key || !['pending', 'complete'].includes(value.state)) throw new Error(`Invalid marker ${row.id}.`);
      if (!groups.has(value.key)) groups.set(value.key, []);
      groups.get(value.key).push(value);
    }
    const unresolved = [];
    for (const [key, values] of groups) {
      const pending = values.filter((value) => value.state === 'pending');
      const complete = values.filter((value) => value.state === 'complete');
      if (pending.length > 1 || complete.length > 1) throw new Error(`Duplicate markers for ${key}.`);
      if (!pending.length || complete.length) continue;
      const item = pending[0];
      const ledger = await this.goodLedger(item.source_entity, item.source_id);
      if (!ledger) { unresolved.push(item); continue; }
      if (item.entity !== ledger.target_entity) throw new Error(`Unexpected ledger target for ${key}.`);
      const matches = item.linked_customer || item.linked_existing
        ? [await this.app.get(item.entity, ledger.target_id)]
        : await this.app.byKey(item.entity, key);
      if (matches.length !== 1 || clean(matches[0].id) !== clean(ledger.target_id)) {
        unresolved.push(item); continue;
      }
      await this.append(key, 'complete', { ...item, target_id: ledger.target_id });
    }
    return unresolved;
  }

  async create({ key, entity, source_entity, source_id, order_id, write }) {
    const existing = await this.app.byKey(entity, key);
    if (existing.length > 1) throw new Error(`Duplicate target key ${key}.`);
    const ledger = await this.goodLedger(source_entity, source_id);
    if (existing.length) {
      if (!ledger || ledger.target_entity !== entity || ledger.target_id !== existing[0].id) {
        throw new Error(`Target ${key} has a missing or conflicting ledger.`);
      }
      return { target_id: ledger.target_id, status: 'existing' };
    }
    if (ledger) throw new Error(`Ledger for ${key} exists without its target.`);
    const details = { entity, source_entity, source_id: String(source_id), order_id };
    await this.append(key, 'pending', details);
    let result;
    try { result = await write(); }
    catch (error) {
      if (!(error instanceof AppCallError) || !error.ambiguous) throw error;
      const found = await this.app.byKey(entity, key);
      const map = await this.goodLedger(source_entity, source_id);
      if (found.length !== 1 || !map || map.target_id !== found[0].id) {
        throw new Error(`Unresolved ambiguous write ${key}.`, { cause: error });
      }
      result = { status: 'existing', target_id: map.target_id };
    }
    // App reads trail writes by up to about a minute; poll before declaring the write unconfirmed.
    let map, matches;
    for (let attempt = 0; ; attempt++) {
      map = await this.goodLedger(source_entity, source_id);
      matches = await this.app.byKey(entity, key);
      if (map && matches.length === 1 && matches[0].id === result.target_id && map.target_id === result.target_id) break;
      if (matches.length > 1 || attempt >= (this.confirmAttempts ?? 8)) break;
      await (this.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(this.confirmDelayMs ?? 15000);
    }
    if (!map || matches.length !== 1 || matches[0].id !== result.target_id || map.target_id !== result.target_id) {
      throw new Error(`Write ${key} was not confirmed in target and ledger.`);
    }
    await this.append(key, 'complete', { ...details, target_id: result.target_id });
    return result;
  }

  async linkCustomer(sourceId, customerId, orderId) {
    const source = String(sourceId);
    const key = `cb:customers:${source}`;
    const ledger = await this.goodLedger('customers', source);
    if (ledger) {
      if (ledger.target_entity !== 'Customer' || ledger.target_id !== customerId) throw new Error(`Customer ledger ${source} conflicts.`);
      return ledger;
    }
    const details = { entity: 'Customer', source_entity: 'customers', source_id: source, order_id: orderId, linked_customer: true };
    await this.append(key, 'pending', details);
    try {
      await this.app.appendMap({
        source_app_id: 'corebridge', source_entity: 'customers', source_id: source,
        target_entity: 'Customer', target_id: customerId, migration_batch: 'cb-customers-2026-11-17',
        notes: JSON.stringify({ status: 'linked', matched_existing: true, account_detail_pending: true, at: new Date().toISOString() }),
      });
    } catch (error) {
      if (!(error instanceof AppCallError) || !error.ambiguous) throw error;
    }
    let found;
    for (let attempt = 0; ; attempt++) {
      found = await this.goodLedger('customers', source);
      if (found || attempt >= (this.confirmAttempts ?? 8)) break;
      await (this.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(this.confirmDelayMs ?? 15000);
    }
    if (!found || found.target_id !== customerId) throw new Error(`Unresolved customer ledger ${source}.`);
    await this.append(key, 'complete', { ...details, target_id: customerId });
    return found;
  }

  async linkExisting(entity, sourceEntity, sourceId, targetId) {
    const key = `cb:${sourceEntity}:${sourceId}`;
    const existing = await this.goodLedger(sourceEntity, sourceId);
    if (existing) {
      if (existing.target_entity !== entity || existing.target_id !== targetId) throw new Error(`Ledger ${key} conflicts.`);
      return existing;
    }
    const details = { entity, source_entity: sourceEntity, source_id: String(sourceId), order_id: null, linked_existing: true };
    await this.append(key, 'pending', details);
    try {
      await this.app.appendMap({ source_app_id: 'corebridge', source_entity: sourceEntity, source_id: String(sourceId),
        target_entity: entity, target_id: targetId, migration_batch: 'cb-customers-2026-11-17',
        notes: JSON.stringify({ status: 'linked', matched_existing: true, at: new Date().toISOString() }) });
    } catch (error) {
      if (!(error instanceof AppCallError) || !error.ambiguous) throw error;
    }
    let found;
    for (let attempt = 0; ; attempt++) {
      found = await this.goodLedger(sourceEntity, sourceId);
      if (found || attempt >= (this.confirmAttempts ?? 8)) break;
      await (this.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(this.confirmDelayMs ?? 15000);
    }
    if (!found || found.target_id !== targetId || found.target_entity !== entity) throw new Error(`Unresolved ledger ${key}.`);
    await this.append(key, 'complete', { ...details, target_id: targetId });
    return found;
  }
}
