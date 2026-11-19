import assert from "node:assert/strict";

const copy = value => value === undefined ? undefined : structuredClone(value);
const persisted = value => JSON.parse(JSON.stringify(value));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function matches(row, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$and") return expected.every(part => matches(row, part));
    if (key === "$or") return expected.some(part => matches(row, part));
    const actual = row[key];
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) return equal(actual, expected);
    return Object.entries(expected).every(([operator, value]) => {
      if (operator === "$eq") return equal(actual, value);
      if (operator === "$ne") return !equal(actual, value);
      if (operator === "$in") return value.some(item => equal(actual, item));
      if (operator === "$nin") return !value.some(item => equal(actual, item));
      if (operator === "$exists") return (actual !== undefined) === value;
      throw Error(`Unexpected synthetic query operator: ${operator}`);
    });
  });
}

export function coupledBuilderStore(initial) {
  const tables = new Map(Object.entries(initial).map(([name, rows]) => [name, new Map(rows.map(row => [row.id, persisted(row)]))]));
  const entities = new Map(), revisions = new Map();
  const store = { audit: [], sequence: 0, onEvent: null };
  const stamp = () => new Date(Date.parse("2026-11-07T12:00:00.000Z") + ++store.sequence).toISOString();
  const record = event => {
    const saved = copy({ index: store.audit.length, ...event });
    store.audit.push(saved);
    store.onEvent?.(saved);
  };
  const table = name => {
    assert.ok(tables.has(name), `Unexpected synthetic entity: ${String(name)}`);
    return tables.get(name);
  };
  const readRows = (name, query, sort, limit = 500, skip = 0) => {
    assert.ok(Number.isInteger(limit) && limit > 0 && Number.isInteger(skip) && skip >= 0);
    let rows = [...table(name).values()].filter(row => matches(row, query));
    if (sort) {
      const descending = sort.startsWith("-"), field = descending ? sort.slice(1) : sort;
      rows = rows.sort((a, b) => {
        const result = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
        return descending ? -result : result;
      });
    }
    record({ entity: name, method: "readRows", query: copy(query), sort, limit, skip, returned: rows.slice(skip, skip + limit).length });
    return copy(rows.slice(skip, skip + limit));
  };
  store.entity = name => {
    table(name);
    if (entities.has(name)) return entities.get(name);
    const facade = {
      async get(id) {
        const row = table(name).get(id);
        record({ entity: name, method: "get", id, found: !!row });
        if (!row) throw Object.assign(Error(`${name} ${id} not found`), { status: 404 });
        return copy(row);
      },
      async list(sort, limit, skip) { return readRows(name, {}, sort, limit, skip); },
      async filter(query, sort, limit, skip) { return readRows(name, query, sort, limit, skip); },
      async create(data) {
        const id = `${name}-synthetic-${++store.sequence}`;
        const row = persisted({ ...data, id, updated_date: stamp() });
        table(name).set(id, row);
        record({ entity: name, method: "create", id, after: row });
        return copy(row);
      },
      async updateMany(query, update) {
        assert.deepEqual(Object.keys(update), ["$set"]);
        const selected = [...table(name).values()].filter(row => matches(row, query));
        for (const before of selected) {
          const after = persisted({ ...before, ...copy(update.$set), updated_date: stamp() });
          table(name).set(before.id, after);
          record({ entity: name, method: "updateMany", id: before.id, query, patch: update.$set, before, after });
        }
        if (!selected.length) record({ entity: name, method: "updateMany", query, matched: 0 });
        return { updated: selected.length };
      },
      async delete(id) {
        const before = table(name).get(id);
        assert.ok(before, "Synthetic delete requires an existing row");
        table(name).delete(id);
        record({ entity: name, method: "delete", id, before });
        return { deleted: 1 };
      },
    };
    entities.set(name, facade);
    return facade;
  };
  store.snapshot = () => Object.fromEntries([...tables].map(([name, rows]) => [name, copy([...rows.values()])]));
  store.invoke = async (name, body) => {
    assert.equal(name, "ensureBuilderPriceRevision", "All other function/AI/API calls are prohibited");
    assert.equal(body.session_token, "synthetic-session-not-real");
    assert.ok(typeof body.idempotency_key === "string" && body.idempotency_key);
    assert.equal(body.revision.builder_product_id, "coupled-foundation-builder");
    assert.equal(body.revision.estimate_id, "coupled-estimate");
    if (!revisions.has(body.idempotency_key)) {
      const row = await store.entity("BuilderPriceRevision").create({ ...copy(body.revision), idempotency_key: body.idempotency_key });
      revisions.set(body.idempotency_key, row);
    } else {
      const previous = revisions.get(body.idempotency_key);
      for (const [key, value] of Object.entries(body.revision)) assert.deepEqual(previous[key], value, "Revision idempotency payload changed");
    }
    record({ entity: "functions", method: name, key: body.idempotency_key, revisionId: revisions.get(body.idempotency_key).id });
    return { data: { revision: copy(revisions.get(body.idempotency_key)) } };
  };
  return store;
}
