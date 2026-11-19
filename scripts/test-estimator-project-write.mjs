import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildSync, transformSync } from 'esbuild';

const projectEntities = [
  'FoundationProject', 'ChannelLetterInstallation', 'VinylProject', 'CNCProject', 'LaserProject',
  'MetalProject', 'BrickStoneProject', 'MaintenanceProject', 'Project', 'CustomItemsProject',
];
const copy = (value) => structuredClone(value);
const guardSource = buildSync({
  entryPoints: ['base44/shared/entityWriteTypeGuard.ts'], bundle: true, platform: 'node', format: 'cjs',
  write: false, logLevel: 'silent',
}).outputFiles[0].text;
const guardModule = { exports: {} };
runInNewContext(guardSource, { module: guardModule, exports: guardModule.exports, console });

const source = transformSync(readFileSync('base44/functions/estimatorProjectWrite/entry.ts', 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;

function fixture() {
  const stores = Object.fromEntries(projectEntities.map((name) => [name, []]));
  const calls = [];
  let serial = 0, handler;
  const entities = Object.fromEntries(projectEntities.map((name) => [name, {
    async get(id) {
      const found = stores[name].find((row) => row.id === id);
      if (!found) throw Object.assign(new Error('not found'), { status: 404 });
      return copy(found);
    },
    async create(data) {
      calls.push({ entity: name, op: 'create', data: copy(data) });
      const row = { ...copy(data), id: `${name}-${++serial}`, updated_date: `v${serial}` };
      stores[name].push(row);
      return copy(row);
    },
    async update(id, data) {
      calls.push({ entity: name, op: 'update', id, data: copy(data) });
      const row = stores[name].find((item) => item.id === id);
      Object.assign(row, copy(data), { updated_date: `v${++serial}` });
      return copy(row);
    },
    async updateMany(query, update) {
      calls.push({ entity: name, op: 'updateMany', query: copy(query), update: copy(update) });
      const row = stores[name].find((item) => item.id === query.id && item.updated_date === query.updated_date);
      if (!row) return { updated: 0 };
      Object.assign(row, copy(update.$set), { updated_date: `v${++serial}` });
      return { updated: 1 };
    },
    async delete(id) {
      calls.push({ entity: name, op: 'delete', id });
      const index = stores[name].findIndex((item) => item.id === id);
      if (index >= 0) stores[name].splice(index, 1);
    },
    async deleteMany(query) {
      calls.push({ entity: name, op: 'deleteMany', query: copy(query) });
      const index = stores[name].findIndex((item) => Object.entries(query).every(([key, value]) => item[key] === value));
      if (index < 0) return { deleted: 0 };
      stores[name].splice(index, 1);
      return { deleted: 1 };
    },
  }]));
  const sdk = { asServiceRole: { entities } };
  const imports = {
    'npm:@base44/sdk@0.8.25': { createClientFromRequest: () => sdk },
    '../../shared/entityRateLimitRetry.ts': { withEntityRateLimitRetry: (value) => value },
    '../../shared/signShopSession.ts': { authenticateSignShopSession: async (_sdk, token) => {
      if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 });
      return { email: 'staff@example.test', role: 'staff' };
    } },
    '../../shared/entityWriteTypeGuard.ts': guardModule.exports,
  };
  runInNewContext(source, {
    require: (name) => { if (!imports[name]) throw new Error(`Unexpected import ${name}`); return imports[name]; },
    module: { exports: {} }, exports: {}, Deno: { serve: (fn) => { handler = fn; } }, Response, console,
  });
  return {
    stores, calls,
    async invoke(body, token = 'staff') {
      const response = await handler(new Request('https://example.test', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, session_token: token }),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

{
  const app = fixture();
  assert.equal((await app.invoke({ entity: 'FoundationProject', op: 'create' }, '')).status, 401);
  for (const entity of ['GlobalSettings', 'Customer', '__proto__', 'constructor']) {
    const denied = await app.invoke({ entity, op: 'create', data: {} });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, 'This record type cannot be written here.');
  }
  for (const entity of projectEntities) {
    const created = await app.invoke({ entity, op: 'create', data: { project_name: ['Synthetic'],
      id: 'injected', created_date: 'fake', updated_date: 'fake', created_by: 'fake' } });
    assert.equal(created.status, 200, entity);
    assert.equal(created.body.record.project_name, 'Synthetic');
    assert.notEqual(created.body.record.id, 'injected');
    assert.equal(Object.hasOwn(created.body.record, 'created_date'), false);
    assert.equal(Object.hasOwn(created.body.record, 'created_by'), false);
    assert.notEqual(created.body.record.updated_date, 'fake');
    const { id, updated_date } = created.body.record;
    const patched = await app.invoke({ entity, op: 'updateMany', id, query: { id, updated_date },
      update: { $set: { project_name: ['Revised'], id: 'ignored', created_date: 'ignored', updated_date: 'ignored', created_by: 'ignored' } } });
    assert.equal(patched.status, 200, entity);
    assert.equal(patched.body.result.updated, 1);
    assert.equal(app.stores[entity][0].project_name, 'Revised');
    assert.equal(app.stores[entity][0].id, id);
    const update = await app.invoke({ entity, op: 'update', id, data: { project_name: 'Updated' } });
    assert.equal(update.status, 200, entity);
    assert.equal(update.body.record.project_name, 'Updated');
    const removed = await app.invoke({ entity, op: 'delete', id });
    assert.equal(removed.status, 200, entity);
    assert.equal(removed.body.deleted, true);
    assert.equal(app.stores[entity].length, 0);
    const second = await app.invoke({ entity, op: 'create', data: { project_name: 'Conditional delete' } });
    const query = { id: second.body.record.id, updated_date: second.body.record.updated_date, project_name: 'Conditional delete' };
    const conditional = await app.invoke({ entity, op: 'deleteMany', query });
    assert.deepEqual(conditional, { status: 200, body: { success: true, result: { deleted: 1 } } });
    assert.deepEqual(app.calls.at(-1), { entity, op: 'deleteMany', query });
    assert.equal(app.stores[entity].length, 0);
  }
}

{
  const app = fixture();
  const made = await app.invoke({ entity: 'FoundationProject', op: 'create', data: { project_name: 'Synthetic' } });
  const { id, updated_date } = made.body.record;
  const request = (query, update, bodyId = id) => app.invoke({
    entity: 'FoundationProject', op: 'updateMany', id: bodyId, query, update,
  });
  for (const [query, update, bodyId] of [
    [{ id }, { $set: { project_name: 'x' } }, id],
    [{ id, updated_date, extra: 'x' }, { $set: { project_name: 'x' } }, id],
    [{ id: 'different', updated_date }, { $set: { project_name: 'x' } }, id],
    [{ id, updated_date }, { $inc: { total_cost: 1 } }, id],
    [{ id, updated_date }, { $set: { project_name: 'x' }, $unset: { notes: 1 } }, id],
    [{ id, updated_date }, { $set: [] }, id],
    [{ id, updated_date }, { $set: { nested: { $set: 1 } } }, id],
  ]) assert.equal((await request(query, update, bodyId)).status, 400);
  assert.equal((await app.invoke({ entity: 'CNCProject', op: 'create', data: { nested: [{ $where: 'x' }] } })).status, 400);
  assert.equal((await app.invoke({ entity: 'CNCProject', op: 'create', data: { notes: 'x'.repeat(200001) } })).status, 400);
  assert.equal((await request({ id, updated_date }, { $set: { notes: 'x'.repeat(200001) } })).status, 400);
  assert.equal((await app.invoke({ entity: 'FoundationProject', op: 'update', id, expected_updated_date: 'stale', data: { notes: 'x' } })).status, 409);
  const stale = await request({ id, updated_date: 'stale' }, { $set: { project_name: 'x' } });
  assert.equal(stale.body.result.updated, 0);
  const deleteCalls = app.calls.filter((call) => call.op === 'deleteMany').length;
  for (const query of [{ id }, { updated_date }, { id, updated_date, $or: [] }, { id, updated_date, nested: { $ne: 'x' } }, []]) {
    assert.equal((await app.invoke({ entity: 'FoundationProject', op: 'deleteMany', query })).status, 400);
  }
  assert.equal(app.calls.filter((call) => call.op === 'deleteMany').length, deleteCalls);
  assert.equal(app.stores.FoundationProject.length, 1);
}

{
  const calls = [];
  let token = 'staff', reads = 0;
  const invokeFleet = async (name, payload) => {
    calls.push({ name, payload: copy(payload) });
    if (name === 'staffDataRead') {
      reads++;
      if (payload.entities) return { status: 200, data: { entities: Object.fromEntries(payload.entities.map((item) => [item.entity, [{ id: 'read' }]])) } };
      return { status: 200, data: { item: { id: payload.id }, items: [{ id: 'read' }] } };
    }
    return { status: 200, data: { record: { id: payload.id || 'created' }, result: { updated: 1 }, deleted: true } };
  };
  const imports = {
    '@/components/fleet/fleetInvoke': { invokeFleet, isFleetCoolingDown: () => false },
    '@/components/auth/EmailGate': { getSessionToken: () => token },
    '@/api/rateLimitCooldown': { noteRateLimit: () => {} },
  };
  const proxySource = transformSync(readFileSync('src/components/staff/staffEntities.js', 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const proxyModule = { exports: {} };
  runInNewContext(proxySource, {
    require: (name) => { if (!imports[name]) throw new Error(`Unexpected import ${name}`); return imports[name]; },
    module: proxyModule, exports: proxyModule.exports, console, setTimeout, setInterval, clearInterval,
  });
  const { staffEntities } = proxyModule.exports;
  for (const entity of projectEntities) {
    const proxy = staffEntities[entity];
    for (const method of ['get', 'filter', 'list', 'create', 'update', 'updateMany', 'delete', 'deleteMany']) {
      assert.equal(typeof proxy[method], 'function', `${entity}.${method}`);
    }
    assert.equal((await proxy.create({ project_name: 'x' })).id, 'created');
    assert.equal((await proxy.update('p', { project_name: 'y' })).id, 'p');
    assert.equal((await proxy.updateMany({ id: 'p', updated_date: 'v' }, { $set: { project_name: 'z' } })).updated, 1);
    assert.equal(await proxy.delete('p'), true);
    assert.ok(calls.slice(-4).every((call) => call.name === 'estimatorProjectWrite' && call.payload.entity === entity));
    assert.deepEqual(calls.at(-2).payload, { entity, op: 'updateMany', id: 'p', query: { id: 'p', updated_date: 'v' }, update: { $set: { project_name: 'z' } } });
  }
  await staffEntities.Inventory.create({ size: 'x' });
  assert.equal(calls.at(-1).name, 'staffEntityWrite');
  await staffEntities.CNCProject.deleteMany({ id: 'p', updated_date: 'v' });
  assert.equal(calls.at(-1).name, 'estimatorProjectWrite');
  assert.deepEqual(calls.at(-1).payload, { entity: 'CNCProject', op: 'deleteMany', query: { id: 'p', updated_date: 'v' } });
  await staffEntities.GeneralTask.deleteMany({ id: 'p', updated_date: 'v' });
  assert.equal(calls.at(-1).name, 'staffEntityWrite');
  await staffEntities.FoundationProject.filter({ project_name: 'x' });
  await staffEntities.FoundationProject.filter({ project_name: 'x' });
  assert.equal(reads, 1);
  await staffEntities.FoundationProject.create({ project_name: 'x' });
  await staffEntities.FoundationProject.filter({ project_name: 'x' });
  assert.equal(reads, 2);
  token = '';
  await assert.rejects(() => staffEntities.FoundationProject.create({}), /Sign-in required/);
}

{
  const app = fixture();
  const pending = {
    kind: 'builder_blank_product_insert', key: 'insert-key', estimate_id: 'estimate-1',
    estimate_line_id: 'line-1', source_entity: 'FoundationProject', source_recovery_tag: 'synthetic-tag',
    source_create_data: { project_name: 'Synthetic foundation' }, source_original_notes: '',
    product_name: 'Synthetic foundation', builder_name: 'Foundation', is_custom: false,
  };
  const estimate = { id: 'estimate-1', updated_date: 'e1', line_items: [
    { line_id: 'line-1', price_acceptance_pending: pending },
  ] };
  const calls = [];
  const rowList = (entity, query = {}) => (entity === 'AllInOneEstimate' ? [estimate] : app.stores[entity] || [])
    .filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)).map(copy);
  const invokeFleet = async (name, payload) => {
    calls.push({ name, payload: copy(payload) });
    if (name === 'staffDataRead') {
      if (payload.entities) return { status: 200, data: { entities: Object.fromEntries(payload.entities.map((item) =>
        [item.entity, rowList(item.entity, item.query)])) } };
      return { status: 200, data: { item: rowList(payload.entity).find((row) => row.id === payload.id) || null } };
    }
    assert.equal(name, 'estimatorProjectWrite');
    const result = await app.invoke(payload);
    if (result.status !== 200) throw new Error(result.body.error);
    return { status: 200, data: result.body };
  };
  const proxyImports = {
    '@/components/fleet/fleetInvoke': { invokeFleet, isFleetCoolingDown: () => false },
    '@/components/auth/EmailGate': { getSessionToken: () => 'staff' },
    '@/api/rateLimitCooldown': { noteRateLimit: () => {} },
  };
  const proxySource = transformSync(readFileSync('src/components/staff/staffEntities.js', 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const proxyModule = { exports: {} };
  runInNewContext(proxySource, {
    require: (name) => { if (!proxyImports[name]) throw new Error(`Unexpected proxy import ${name}`); return proxyImports[name]; },
    module: proxyModule, exports: proxyModule.exports, console, setTimeout, setInterval, clearInterval,
  });
  const { staffEntities } = proxyModule.exports;
  const serviceImports = {
    '@/components/estimator/builder/builderService': { ensureBuilderProductForLine: async ({ line }) =>
      ({ builderProduct: { id: 'builder-1' }, line: { ...line, builder_product_id: 'builder-1' } }) },
    '@/components/estimator/builder/builderMutationRecovery': {
      builderMutationHash: () => 'hash', pendingBuilderMutation: (line) => line?.price_acceptance_pending?.key ? line.price_acceptance_pending : null,
      recoveryPatchDiffers: () => false,
    },
    '@/components/estimator/estimateMutationGuard': { assertEstimateProductMutationAllowed: async () => {} },
    '@/components/estimator/estimatePersistence': {
      expectedEstimateFields: () => ({}), replaceEstimateFieldsIfUnchanged: async ({ nextFields }) => {
        Object.assign(estimate, copy(nextFields));
        return copy(estimate);
      },
    },
    '@/components/estimator/builder/builderEntityPersistence': {
      expectedBuilderEntityFields: () => ({}), expectedEntityFields: () => ({}),
      replaceBuilderEntityFieldsIfUnchanged: async () => { throw new Error('Unexpected custom builder update'); },
      replaceEntityFieldsIfUnchanged: async ({ entity, id, expectedUpdatedAt, nextFields }) => {
        await entity.updateMany({ id, updated_date: expectedUpdatedAt }, { $set: nextFields });
        return entity.get(id);
      },
    },
    '@/components/staff/staffEntities': { staffEntities },
  };
  const serviceSource = transformSync(readFileSync('src/components/estimator/products/blankProductService.js', 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const serviceModule = { exports: {} };
  runInNewContext(serviceSource, {
    require: (name) => { if (!serviceImports[name]) throw new Error(`Unexpected service import ${name}`); return serviceImports[name]; },
    module: serviceModule, exports: serviceModule.exports, console, setTimeout,
  });
  const result = await serviceModule.exports.resumeBlankProductInsertion({ estimateId: estimate.id, lineId: 'line-1' });
  assert.equal(result.sourceProject.id, app.stores.FoundationProject[0].id);
  assert.equal(result.sourceProject.notes, '');
  assert.equal(result.line.project_id, result.sourceProject.id);
  assert.equal(result.line.builder_product_id, 'builder-1');
  assert.deepEqual(calls.filter((call) => call.name === 'estimatorProjectWrite').map((call) => call.payload.op), ['create', 'updateMany']);
  assert.ok(calls.some((call) => call.name === 'staffDataRead' && call.payload.entities?.some((item) => item.entity === 'FoundationProject')));
}

{
  const inventoryEntities = [
    'FoundationInventory', 'ChannelLetterInstallEquipment', 'DimensionalLetterMaterial', 'ChannelLetterInstallInventory',
    'VinylInventory', 'SignLightingInventory', 'SignHardwareInventory', 'LaborServiceInventory',
    'SignPartsSuppliesInventory', 'Inventory',
  ];
  const readerSource = readFileSync('base44/functions/staffDataRead/entry.ts', 'utf8');
  const staffList = readerSource.split('const STAFF_READABLE = new Set([')[1].split(']);')[0];
  for (const name of inventoryEntities) assert.ok(staffList.includes(`'${name}'`), `${name} must be staff-readable`);
  const visited = [];
  const staffEntities = new Proxy({}, { get: (_target, name) => ({
    list: async () => {
      visited.push(name);
      return [{ id: `${name}-1`, name: 'Synthetic', size: 'Synthetic', material_type: name === 'Inventory' ? 'Aluminum' : 'pole',
        product_type: 'Angle', is_active: true }];
    },
  }) });
  const imports = {
    '@/components/staff/staffEntities': { staffEntities },
    '@/components/estimator/builder/partSync': { pricingSnapshot: (row) => row },
    '@/components/estimator/loadAllEntityRows': { loadAllEntityRows: ({ entity }) => entity.list() },
  };
  const catalogSource = transformSync(readFileSync('src/components/estimator/parts/partCatalog.js', 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const catalogModule = { exports: {} };
  runInNewContext(catalogSource, {
    require: (name) => { if (!imports[name]) throw new Error(`Unexpected catalog import ${name}`); return imports[name]; },
    module: catalogModule, exports: catalogModule.exports, console,
  });
  const items = await catalogModule.exports.loadMasterPartCatalog();
  assert.deepEqual([...visited].sort(), [...inventoryEntities].sort());
  assert.ok(items.some((item) => item.entity === 'FoundationInventory'));
  assert.ok(items.some((item) => item.entity === 'Inventory'));
}

console.log('PASS estimatorProjectWrite authorization, CAS, proxy routing, blank-product recovery and inventory catalog');
