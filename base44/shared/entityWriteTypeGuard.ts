// WS-7 write-time type guard for staffEntityWrite.
// Coerces the known offender shape — an array written into a declared-scalar
// field (e.g. WorkOrder.notes[].assigned_to: ["name"]) — before it poisons
// reads or batch writes. Single-element arrays unwrap; empty arrays drop the
// field; multi-element arrays reject loudly (400) rather than silently
// truncate. Fields not in the generated map are untouched. Returns the list
// of coerced paths for logging.
import { ENTITY_SCALAR_WRITE_PATHS } from './entityScalarWritePaths.ts';

const coerceLeaf = (declared: string, v: any): any => {
  if (!Array.isArray(v)) return v;
  if (v.length === 0) return undefined;
  if (v.length > 1) {
    const e: any = new Error(`Field declared as ${declared} received a ${v.length}-element array — refusing to truncate. Fix the caller.`);
    e.status = 400;
    throw e;
  }
  const el = v[0];
  if (el === null || el === undefined) return undefined;
  if (declared === 'string') return typeof el === 'string' ? el : String(el);
  if (declared === 'number' || declared === 'integer') {
    const n = Number(el);
    if (Number.isFinite(n)) return declared === 'integer' ? Math.trunc(n) : n;
    return el; // non-numeric element — leave for the entity layer to reject
  }
  return el;
};

const walkValue = (node: any, segs: string[], i: number, declared: string, pathPrefix: string, coerced: string[]) => {
  if (node === null || node === undefined) return node;
  if (i >= segs.length) {
    const out = coerceLeaf(declared, node);
    if (out !== node) coerced.push(pathPrefix);
    return out;
  }
  if (segs[i] === 'items') {
    if (!Array.isArray(node)) return node;
    return node.map((el) => walkValue(el, segs, i + 1, declared, pathPrefix, coerced));
  }
  if (typeof node === 'object' && !Array.isArray(node)) {
    const next = node[segs[i]];
    if (next === undefined) return node;
    const replaced = walkValue(next, segs, i + 1, declared, `${pathPrefix}.${segs[i]}`, coerced);
    if (replaced !== next) node[segs[i]] = replaced;
    return node;
  }
  return node;
};

export const coerceToDeclaredScalars = (entityName: string, data: any): string[] => {
  const map = ENTITY_SCALAR_WRITE_PATHS[entityName];
  const coerced: string[] = [];
  if (!map || !data || typeof data !== 'object' || Array.isArray(data)) return coerced;
  for (const [path, declared] of Object.entries(map)) {
    const segs = path.split('.');
    const top = data[segs[0]];
    if (top === undefined) continue;
    const replaced = walkValue(top, segs, 0 + 1, declared, segs[0], coerced);
    if (replaced !== top) data[segs[0]] = replaced;
  }
  return coerced;
};
