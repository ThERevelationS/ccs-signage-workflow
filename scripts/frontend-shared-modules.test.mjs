import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendSharedModules } from './frontend-shared-modules.mjs';
test('frontend bundles preserve electrical helper behavior without blocked runtime imports', async () => {
 const plugin = frontendSharedModules(); plugin.addWatchFile = () => {};
 const id = plugin.resolveId('../../../base44/shared/permittingAddressLocality.js', process.cwd() + '/src/components/permitting/example.jsx');
 const code = await plugin.load(id);
 const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
 const original = await import('../base44/shared/permittingAddressLocality.js');
 assert.deepEqual(module.summarizeElectricalRoleCoverage([]), original.summarizeElectricalRoleCoverage([]));
 assert.doesNotMatch(code, /from ['"]\.\//);
});
test('office research and segmented source evidence resolve through the safe frontend bridge', async () => {
 const plugin = frontendSharedModules(); plugin.addWatchFile = () => {};
 const importer = process.cwd() + '/src/components/permitting/example.jsx';
 const officeId = plugin.resolveId('../../../base44/shared/permittingOfficeResearch.mjs', importer);
 assert.ok(officeId);
 const officeCode = await plugin.load(officeId);
 assert.doesNotMatch(officeCode, /from ['"]\.\//);
 const office = await import('data:text/javascript;base64,' + Buffer.from(officeCode).toString('base64'));
 assert.ok(office.officeResearchChecklist.roles.some(role => role.key === 'electrical_permit'));
 assert.ok(office.officeResearchChecklist.roles.some(role => role.key === 'electrical_inspection'));
 const normalized = office.normalizeOfficeResearch({roles:[{role:'electrical_permit',office_name:'Fixture office',official_source_url:'https://fixture.gov'}]}, {jurisdiction:{id:'fixture',name:'Fixture City',state:'OH'}});
 assert.equal(normalized.roles.find(role => role.role === 'electrical_permit').official_source_url, 'https://fixture.gov/');
 assert.equal(normalized.roles.find(role => role.role === 'electrical_permit').verification_status, 'needs_verification');

 const sourceId = plugin.resolveId('../../../base44/shared/jurisdictionSourceTextSegments.mjs', importer);
 assert.ok(sourceId);
 const sourceCode = await plugin.load(sourceId);
 assert.doesNotMatch(sourceCode, /from ['"]\.\//);
 const source = await import('data:text/javascript;base64,' + Buffer.from(sourceCode).toString('base64'));
 assert.equal(source.segmentedProgressOwned({extracted_pages:[{}],text_extraction_state:{storage_mode:'pdf-page-segments-v1',inline_page_count:1,pages_extracted:1,next_page:2,segment_count:0}}), true);
 assert.equal(source.segmentedProgressOwned({extracted_pages:[{}],text_extraction_state:{storage_mode:'pdf-page-segments-v1',inline_page_count:1,pages_extracted:2,next_page:4,segment_count:1,last_segment:{page_start:2,page_end:2}}}), false);
});
test('backend files and non-approved helpers cannot resolve through frontend bridge', async () => {
 const plugin = frontendSharedModules();
 const importer = process.cwd() + '/src/components/permitting/example.jsx';
 for (const source of ['../../../base44/functions/findLocalityByAddress/entry.ts', '../../../base44/shared/permittingSecrets.js', '../../../base44/config.jsonc']) assert.equal(plugin.resolveId(source, importer), null);
 await assert.rejects(plugin.load('\0ccs-frontend-shared:' + process.cwd() + '/base44/config.jsonc'), /Unapproved/);
});

test('every base44/shared import inside src resolves through the approved frontend bridge', async () => {
 const { readdirSync, statSync, readFileSync } = await import('node:fs');
 const { join } = await import('node:path');
 const files = [];
 const walk = (dir) => { for (const entry of readdirSync(dir)) { const path = join(dir, entry); if (statSync(path).isDirectory()) walk(path); else if (/\.[jt]sx?$/.test(entry)) files.push(path); } };
 walk(process.cwd() + '/src');
 const plugin = frontendSharedModules(); plugin.addWatchFile = () => {};
 const blocked = [];
 for (const file of files) for (const match of readFileSync(file, 'utf8').matchAll(/['"]((?:\.\.\/)+base44\/shared\/[^'"]+)['"]/g)) if (!plugin.resolveId(match[1], file)) blocked.push(file + ' -> ' + match[1]);
 assert.deepEqual(blocked, []);
});
