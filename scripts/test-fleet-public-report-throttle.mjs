import assert from "node:assert/strict";
import { build } from "esbuild";

const stubs = {
  "npm:@base44/sdk@0.8.25": "export const createClientFromRequest = () => globalThis.__base44;",
  "../../shared/pagedEntityRows.ts": "export const loadAllEntityRows = async () => [];",
  "../../shared/fleetCutoverState.ts": "export const getCanonicalCutoverState = async () => ({ public_reporting_enabled: true });",
};
const out = await build({
  entryPoints: ["base44/functions/fleetPublicIssueReport/entry.ts"],
  bundle: true, write: false, format: "esm", platform: "neutral",
  plugins: [{ name: "stubs", setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => stubs[a.path] ? { path: a.path, namespace: "stub" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
  } }],
});

function makeEntity() {
  const rows = new Map(); let seq = 0; let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 0, 1) + (++tick)).toISOString();
  const match = (r, q) => Object.entries(q).every(([k, v]) => String(r[k]) === String(v));
  return {
    rows,
    async filter(q) { return [...rows.values()].filter((r) => match(r, q)).map((r) => ({ ...r })); },
    async get(id) { const r = rows.get(id); if (!r) throw new Error("not found"); return { ...r }; },
    async create(d) { const id = `r${String(++seq).padStart(5, "0")}`; const t = stamp(); const r = { ...d, id, created_date: t, updated_date: t }; rows.set(id, r); return { ...r }; },
    async update(id, d) { Object.assign(rows.get(id), d, { updated_date: stamp() }); },
    async updateMany(q, { $set }) { let n = 0; for (const r of rows.values()) if (match(r, q)) { Object.assign(r, $set, { updated_date: stamp() }); n++; } return { updated: n }; },
    async delete(id) { rows.delete(id); },
  };
}

let handler;
globalThis.Deno = { serve: (h) => { handler = h; } };
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

function freshApp(equipmentIds = ["eq-1"]) {
  const Equipment = makeEntity();
  for (const id of equipmentIds) Equipment.rows.set(id, { id, name: id, status: "active" });
  const WorkOrder = makeEntity();
  const Throttle = makeEntity();
  globalThis.__base44 = { asServiceRole: {
    entities: { FleetEquipment: Equipment, FleetMaintenanceWorkOrder: WorkOrder, FleetPublicReportThrottle: Throttle },
    functions: { invoke: async () => ({}) },
    integrations: { Core: { UploadFile: async () => ({ file_url: "https://x/y.jpg" }) } },
  } };
  return { WorkOrder, Throttle };
}

let n = 0;
async function submit({ ip, headers = {}, equipment = "eq-1" }) {
  const req = new Request("https://example.test/fleetPublicIssueReport", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ action: "submit", submission_token: `token-${String(++n).padStart(8, "0")}`, equipment_id: equipment, title: "Flat tire" }),
  });
  const info = ip ? { remoteAddr: { transport: "tcp", hostname: ip, port: 1234 } } : {};
  return (await handler(req, info)).status;
}

// Rotating spoofed forwarding headers from one socket address share one bucket.
{
  freshApp();
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    statuses.push(await submit({ ip: "203.0.113.5", headers: { "cf-connecting-ip": `10.0.0.${i}`, "x-real-ip": `10.1.0.${i}`, "x-forwarded-for": `10.2.0.${i}` } }));
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
}

// No runtime-asserted address: spoofed headers still land in the shared fail-closed bucket.
{
  freshApp();
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push(await submit({ headers: { "cf-connecting-ip": `198.51.100.${i}` } }));
  assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.equal(statuses[5], 429);
}

// Per-equipment cap binds even across distinct client addresses.
{
  freshApp();
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push(await submit({ ip: `192.0.2.${i}` }));
  assert.equal(statuses.filter((s) => s === 200).length, 10);
  assert.deepEqual(statuses.slice(10), [429, 429]);
}

// Global cap binds across distinct addresses and equipment.
{
  const eq = Array.from({ length: 40 }, (_, i) => `eq-${i}`);
  const { WorkOrder } = freshApp(eq);
  const statuses = [];
  for (let i = 0; i < 35; i++) statuses.push(await submit({ ip: `192.0.2.${i}`, equipment: eq[i] }));
  assert.equal(statuses.filter((s) => s === 200).length, 30);
  assert.equal(WorkOrder.rows.size, 30);
}

console.log("PASS test-fleet-public-report-throttle");
