
export const __db = { FoundationProject: new Map(), AllInOneEstimate: new Map(), BuilderProduct: new Map(), BuilderPart: new Map(), BuilderPartGroup: new Map(), FoundationInventory: new Map(), LaborServiceInventory: new Map(), EstimateRevision: new Map() };
export const __ops = { gets: 0, filters: 0, creates: 0, updateManys: 0, deleteManys: 0 };
export const __fail = { updateManyOnce: new Map(), createOnce: new Map() };
let ver = 0;
const table = (name) => (__db[name] || (__db[name] = new Map()));
const clone = (r) => JSON.parse(JSON.stringify(r));
const match = (row, q) => Object.entries(q || {}).every(([k, v]) => JSON.stringify(row?.[k] ?? null) === JSON.stringify(v ?? null));
const bump = (row) => { row.updated_date = 'u' + (++ver); return row; };
function makeEntity(name) {
  const rows = table(name);
  let seq = 0;
  return {
    async get(id) { __ops.gets++; const r = rows.get(id); return r ? clone(r) : null; },
    async filter(query, sort, limit, skip) {
      __ops.filters++;
      let out = [...rows.values()].filter((r) => match(r, query)).map(clone);
      if (sort) out.sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')));
      if (skip) out = out.slice(skip);
      if (limit) out = out.slice(0, limit);
      return out;
    },
    async list(sort, limit, skip) { return this.filter({}, sort, limit, skip); },
    async create(data) {
      __ops.creates++;
      const once = __fail.createOnce.get(name) || 0;
      if (once > 0) {
        if (once - 1 <= 0) __fail.createOnce.delete(name); else __fail.createOnce.set(name, once - 1);
        throw new Error('injected create failure');
      }
      const id = data.id || name.toLowerCase() + '-' + (++seq) + '-' + (rows.size + 1);
      const rec = bump({ ...clone(data), id, created_date: 't0' });
      rows.set(id, rec);
      return clone(rec);
    },
    async updateMany(query, update) {
      __ops.updateManys++;
      if (__fail.updateManyOnce.get(name) > 0) {
        __fail.updateManyOnce.set(name, __fail.updateManyOnce.get(name) - 1);
        throw new Error('injected updateMany failure');
      }
      const matched = [...rows.values()].filter((r) => match(r, query));
      if (matched.length !== 1) return { updated: 0 };
      const rec = matched[0];
      Object.assign(rec, clone(update?.$set || {}));
      bump(rec);
      rows.set(rec.id, rec);
      return { updated: 1 };
    },
    async deleteMany(query) {
      __ops.deleteManys++;
      const matched = [...rows.values()].filter((r) => match(r, query));
      matched.forEach((r) => rows.delete(r.id));
      return { deleted: matched.length };
    },
  };
}
export const staffEntities = new Proxy({}, { get: (_, name) => (typeof name === 'string' ? makeEntity(name) : undefined) });
export const __seed = (name, row) => { const rec = clone(row); if (!rec.updated_date) bump(rec); table(name).set(rec.id, rec); };
export const __rows = (name) => [...table(name).values()].map(clone);
