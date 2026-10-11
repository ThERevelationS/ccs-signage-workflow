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
test('backend files and non-approved helpers cannot resolve through frontend bridge', async () => {
 const plugin = frontendSharedModules();
 const importer = process.cwd() + '/src/components/permitting/example.jsx';
 for (const source of ['../../../base44/functions/findLocalityByAddress/entry.ts', '../../../base44/shared/permittingSecrets.js', '../../../base44/config.jsonc']) assert.equal(plugin.resolveId(source, importer), null);
 await assert.rejects(plugin.load('\0ccs-frontend-shared:' + process.cwd() + '/base44/config.jsonc'), /Unapproved/);
});
