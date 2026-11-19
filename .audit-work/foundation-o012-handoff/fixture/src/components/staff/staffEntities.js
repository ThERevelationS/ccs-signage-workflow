// O-012 harness stub: in-memory entity layer keyed off globalThis so every
// esbuild bundle in the test shares one store. Mirrors the staffEntities
// contract used by the code under test:
//   get(id)              -> record | reject({status:404})
//   filter(query, sort?) -> [records]
//   update(id, data)     -> merged record (bumps updated_date)
//   updateMany(q, {$set})-> {updated: n}; q.updated_date acts as the CAS term
//   create(data)         -> record with id/created_date/updated_date
//   delete(id)           -> true|false
const store = () => {
  if (!globalThis.__ccsEntities) globalThis.__ccsEntities = new Map();
  return globalThis.__ccsEntities;
};
const table = (name) => {
  const s = store();
  if (!s.has(name)) s.set(name, new Map());
  return s.get(name);
};
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const notFound = () => Object.assign(new Error("Record not found."), { status: 404 });
const bump = () => globalThis.__ccsNow ? globalThis.__ccsNow() : new Date().toISOString();

const matches = (row, query = {}) =>
  Object.entries(query).every(([key, want]) => {
    if (key === "id") return row?.id === want;
    return JSON.stringify(row?.[key] ?? null) === JSON.stringify(want ?? null);
  });

const applySet = (row, update = {}) => {
  const patch = update.$set || update;
  const next = { ...row, ...clone(patch) };
  next.updated_date = bump();
  return next;
};

const api = (name) => ({
  async get(id) {
    const row = table(name).get(id);
    if (!row) throw notFound();
    return clone(row);
  },
  async filter(query = {}, _sort = undefined, _limit = undefined) {
    return [...table(name).values()].filter((r) => matches(r, query)).map(clone);
  },
  async list() {
    return [...table(name).values()].map(clone);
  },
  async create(data) {
    const id = data?.id || `${name}-${table(name).size + 1}-${Math.random().toString(36).slice(2, 8)}`;
    const now = bump();
    const row = { ...clone(data), id, created_date: data?.created_date || now, updated_date: data?.updated_date || now };
    table(name).set(id, row);
    return clone(row);
  },
  async update(id, data) {
    const row = table(name).get(id);
    if (!row) throw notFound();
    const next = applySet(row, data);
    table(name).set(id, next);
    return clone(next);
  },
  async updateMany(query = {}, update = {}) {
    let updated = 0;
    for (const [id, row] of table(name)) {
      if (!matches(row, query)) continue;
      table(name).set(id, applySet(row, update));
      updated += 1;
    }
    return { updated };
  },
  async delete(id) {
    return table(name).delete(id);
  },
  async deleteMany(query = {}) {
    let deleted = 0;
    for (const [id, row] of table(name)) {
      if (matches(row, query)) { table(name).delete(id); deleted += 1; }
    }
    return { deleted };
  },
  async count(query = {}) {
    return [...table(name).values()].filter((r) => matches(r, query)).length;
  },
  subscribe() { return () => {}; },
});

const cache = new Map();
export const staffEntities = new Proxy({}, {
  get(_, name) {
    if (typeof name !== "string") return undefined;
    if (!cache.has(name)) cache.set(name, api(name));
    return cache.get(name);
  },
});
