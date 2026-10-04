import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const built = await build({
  entryPoints: ['base44/functions/refreshJurisdiction/entry.ts'],
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  plugins: [{ name: 'test-boundaries', setup(b) {
    b.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: 'sdk', namespace: 'mock' }));
    b.onResolve({ filter: /safeExternalFetch\.ts$/ }, () => ({ path: 'fetch', namespace: 'mock' }));
    b.onResolve({ filter: /workflowInvocationCapability\.ts$/ }, () => ({ path: 'capability', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents:
      path === 'sdk' ? 'export const createClientFromRequest = () => globalThis.fixture.client;' :
      path === 'fetch' ? 'export const safeExternalFetch = (...args) => globalThis.fixture.fetch(...args);' :
      'export const hasWorkflowInvocationCapability = async () => false;', loader: 'js' }));
  }}],
});
let handler;
globalThis.Deno = { serve: fn => { handler = fn; } };
await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

const pageUrl = 'https://county.gov/zoning/forms.php';
const page = '<base href="https://county.gov/"><a href= "Zoning/Permit Application.pdf">Zoning Permit Application</a><a href="/Zoning/Fee Schedule.pdf">Fees</a><a href="/Zoning/zoning_regulations.php">Zoning Regulations</a><a href="/parks">Parks</a>';
function setup({ role = 'admin', documents = [], manual = false, extractionFails = false, htmlFile = false } = {}) {
  let record = { id: 'j1', name: 'County', state: 'OH', type: 'county', permitting_url: pageUrl,
    documents: structuredClone(documents), updated_date: 'v1', _manual_documents: manual,
    permit_requirements: { requires_permit: true }, last_updated: 'original', rewrite_authority: null };
  const calls = { research: 0, extraction: 0, uploads: 0, downloads: 0, saves: 0 };
  const entity = {
    get: async () => structuredClone(record),
    updateMany: async (q, patch) => {
      assert.equal(q.updated_date, record.updated_date);
      calls.saves++;
      record = { ...record, ...patch.$set, updated_date: 'v' + (calls.saves + 1) };
      return { updated: 1 };
    },
  };
  globalThis.fixture = {
    client: { auth: { me: async () => role ? { role } : null }, asServiceRole: {
      entities: { JurisdictionProfile: entity },
      functions: { invoke: async () => { calls.research++; return { data: { data: {
        permitting_url: pageUrl, documents: [{ title: 'Application', url: 'https://county.gov/permit.pdf', doc_type: 'permit_application' }],
      } } }; } },
      integrations: { Core: {
        UploadFile: async ({ file }) => { assert.ok(file instanceof File); assert.equal(file.type, 'application/pdf'); assert.ok(file.name.endsWith('.pdf')); calls.uploads++; return { file_url: 'https://archive.gov/file.pdf' }; },
        ExtractDataFromUploadedFile: async () => { calls.extraction++; if (extractionFails) throw new Error('Extraction failed'); return { output: { content: 'text' } }; },
      } },
    } },
    fetch: async url => {
      if (url === pageUrl) return new Response(page, { headers: { 'content-type': 'text/html' } });
      calls.downloads++;
      return new Response(htmlFile ? '<html>error</html>' : '%PDF-1.7 sample', { headers: { 'content-type': htmlFile ? 'text/html' : 'application/pdf' } });
    },
  };
  return { calls, record: () => record };
}
async function invoke(extra = {}) {
  const response = await handler(new Request('https://app.test', { method: 'POST', body: JSON.stringify({ jurisdiction_id: 'j1', discovery_only: true, ...extra }) }));
  return { status: response.status, data: await response.json() };
}

test('compiled discovery refresh retains sources, archives one file, and makes no research/extraction calls', async () => {
  const f = setup();
  const r = await invoke({ settings: { skipManualData: false, updateRequirements: true } });
  assert.equal(r.status, 200);
  assert.equal(r.data.success, true);
  assert.equal(r.data.research_attempts, 0);
  assert.equal(f.calls.research, 0);
  assert.equal(f.calls.extraction, 0);
  assert.equal(f.calls.downloads, 2);
  assert.equal(f.calls.uploads, 1);
  assert.equal(f.record().documents.length, 4);
  const archive = f.record().documents.find(d => d.file_url);
  assert.match(archive.source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(archive.source_bytes, 15);
  assert.equal(f.record().documents.find(d => d.url === pageUrl).file_url, undefined);
  assert.equal(f.record().last_updated, 'original');
  assert.deepEqual(f.record().permit_requirements, { requires_permit: true });
});
test('repeat discovery preserves archive and existing manual/omitted evidence', async () => {
  const old = { id: 'old', source: 'manual', title: 'Manual sign evidence', url: 'https://county.gov/old.pdf', file_url: 'kept', extracted_text: 'kept' };
  const archived = { id: 'archive', url: 'https://county.gov/Zoning/Permit%20Application.pdf', file_url: 'original', source_sha256: 'verified', source: 'ai_discovered' };
  const f = setup({ documents: [old, archived] });
  await invoke();
  assert.deepEqual(f.record().documents[0], old);
  assert.equal(f.record().documents[1].file_url, 'original');
  assert.equal(f.calls.downloads, 2);
  assert.equal(f.record().documents.filter(d => d.file_url).length, 3);
});
test('manual document collection protection cannot be bypassed by settings', async () => {
  const f = setup({ manual: true });
  assert.equal((await invoke({ settings: { skipManualData: false } })).status, 400);
  assert.equal(f.calls.downloads + f.calls.saves + f.calls.research, 0);
});
for (const role of [null, 'user']) test('discovery admin authorization: ' + role, async () => {
  const f = setup({ role });
  assert.equal((await invoke()).status, role ? 403 : 401);
  assert.equal(f.calls.research + f.calls.saves, 0);
});
test('PDF URL returning HTML never creates a fake archive', async () => {
  const f = setup({ htmlFile: true });
  await invoke();
  assert.equal(f.calls.uploads, 0);
  assert.equal(f.record().documents.length, 4);
  assert.equal(f.record().documents.some(d => d.file_url), false);
});
test('normal manual research remains allowed while archival defers AI extraction', async () => {
  const f = setup({ extractionFails: true });
  const r = await invoke({ discovery_only: false });
  assert.equal(r.data.success, true);
  assert.equal(f.calls.research, 1);
  assert.equal(f.calls.extraction, 0);
  assert.equal(f.record().documents[0].file_url, 'https://archive.gov/file.pdf');
  assert.match(f.record().documents[0].source_sha256, /^[a-f0-9]{64}$/);
});
test('source contract keeps discovery bounded and authenticated', async () => {
  const source = await readFile('base44/functions/refreshJurisdiction/entry.ts', 'utf8');
  assert.match(source, /discoveryOnly && \(isScheduledRun \|\| isTargetedAutomation\)/);
  assert.match(source, /readResearchDocumentBytes\(pageResponse, 2 \* 1024 \* 1024\)/);
  assert.match(source, /AbortSignal\.timeout\(RESEARCH_FETCH_TIMEOUT_MS\)/);
});
