// Deploy-time injection of workflow capabilities. Committed workflow
// definitions only reference `${secret:WORKFLOW_CAPABILITY_<NAME>}`; this
// script substitutes the values from the environment and updates the stored
// definitions through the Base44 Apps API. Values are never printed.
//
//   node scripts/inject-workflow-capabilities.mjs            # dry run: lists required secrets
//   BASE44_WORKFLOWS_TOKEN=... WORKFLOW_CAPABILITY_...=... \
//     node scripts/inject-workflow-capabilities.mjs --apply
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP_ID = process.env.BASE44_APP_ID || '68dfcc5e57bbbc35387da97c';
const API_BASE = 'https://app.base44.com';
const WORKFLOW_DIR = 'base44/workflows';
const PLACEHOLDER = /^\$\{secret:(WORKFLOW_CAPABILITY_[A-Z0-9_]+)\}$/;
const CAPABILITY_FORMAT = /^[A-Za-z0-9_-]{40,128}$/;
const apply = process.argv.includes('--apply');

function inject(node, refs) {
  if (Array.isArray(node)) return node.map((item) => inject(item, refs));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, inject(value, refs)]));
  }
  const match = typeof node === 'string' ? node.match(PLACEHOLDER) : null;
  if (!match) return node;
  refs.add(match[1]);
  return String(process.env[match[1]] || '').trim();
}

const plans = [];
for (const file of readdirSync(WORKFLOW_DIR).filter((name) => name.endsWith('.jsonc')).sort()) {
  const workflow = JSON.parse(readFileSync(join(WORKFLOW_DIR, file), 'utf8'));
  const refs = new Set();
  const definition = inject(workflow.definition, refs);
  if (refs.size) plans.push({ name: workflow.name, refs: [...refs], definition });
}

const missing = new Set();
for (const plan of plans) {
  for (const ref of plan.refs) {
    const ok = CAPABILITY_FORMAT.test(String(process.env[ref] || '').trim());
    if (!ok) missing.add(ref);
    console.log(`${plan.name}: ${ref} ${ok ? 'set' : 'MISSING'}`);
  }
}
if (missing.size) {
  console.error(`Missing or malformed (need 40-128 chars of [A-Za-z0-9_-]): ${[...missing].join(', ')}`);
  process.exit(1);
}
if (!apply) {
  console.log('Dry run only. Re-run with --apply to update the stored workflow definitions.');
  process.exit(0);
}

const token = String(process.env.BASE44_WORKFLOWS_TOKEN || '').trim();
if (!token) {
  console.error('BASE44_WORKFLOWS_TOKEN (Base44 personal access token) is required with --apply.');
  process.exit(1);
}
const api = async (method, path, body) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} failed with HTTP ${response.status}`);
  return response.json();
};

const listed = await api('GET', `/api/apps/${APP_ID}/workflows?limit=200`);
const workflows = Array.isArray(listed) ? listed : (listed?.items || listed?.workflows || []);
let failed = false;
for (const plan of plans) {
  const matches = workflows.filter((workflow) => workflow?.name === plan.name);
  if (matches.length !== 1) {
    console.error(`${plan.name}: expected exactly one workflow with this name, found ${matches.length}`);
    failed = true;
    continue;
  }
  await api('PUT', `/api/apps/${APP_ID}/workflows/${matches[0].id}`, {
    definition: plan.definition,
    change_summary: 'Inject workflow capability from app secrets',
  });
  console.log(`${plan.name}: updated`);
}
process.exit(failed ? 1 : 0);
