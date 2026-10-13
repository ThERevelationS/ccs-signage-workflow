import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
const b=await build({entryPoints:['src/components/permitting/ElectricalAuthorityCoverage.jsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic'});
const Component=(await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))).default;
const render=(authority,selectionContext)=>renderToStaticMarkup(React.createElement(Component,{authority,selectionContext}));
test('missing/older response shows both unestablished roles and distinct evidence next steps',()=>{
 const html=render(null);assert.equal((html.match(/Not established/g)||[]).length,2);
 assert.match(html,/aria-label="Electrical authority coverage"/);
 assert.match(html,/aria-label="Electrical role follow-up guidance"/);
 assert.match(html,/official electrical permit application/);
 assert.match(html,/official inspection scheduling/);
 assert.match(html,/Manual selection is not a verified job-address match/);
 assert.match(html,/Find missing information/);
 assert.match(html,/Do not substitute an office name, ZIP code or unverified AI result/);
});
test('broad legacy electrical cannot render either specific role as reviewed',()=>{const html=render({verified_roles:['electrical']});assert.equal((html.match(/Not established/g)||[]).length,2);assert.doesNotMatch(html,/Staff reviewed/);assert.match(html,/separate review/);});
test('issuer reviewed and inspection pending get only inspection-focused next steps',()=>{
 const html=render({verified_roles:['electrical_permit'],roles_needing_review:['electrical_inspection']});
 assert.match(html,/<dt>Permit issuer<\/dt><dd[^>]*>Staff reviewed/);
 assert.match(html,/<dt>Inspection provider<\/dt><dd[^>]*>Needs staff review/);
 assert.match(html,/An inspection role is configured but awaits staff review/);
 assert.doesNotMatch(html,/An issuer role is configured but awaits staff review/);
 assert.doesNotMatch(html,/No distinct electrical permit issuer is established/);
});
test('both reviewed retain live-source and project-applicability caveat without gap workflow',()=>{
 const html=render({verified_roles:['electrical_permit','electrical_inspection']});
 assert.equal((html.match(/Staff reviewed/g)||[]).length,2);
 assert.doesNotMatch(html,/Next: resolve the separate electrical office evidence/);
 assert.match(html,/confirm applicability and current official sources/);
 assert.match(html,/does not establish every required permit or inspection/);
});
test('manual selection warns no address match; address search warns boundary and county overlay uncertainty',()=>{
 const configured={verified_roles:['electrical_inspection'],roles_needing_review:['electrical_permit']};
 const manual=render(configured,'manual'),address=render(configured,'address');
 assert.match(manual,/Manual selection is not a verified job-address match/);
 assert.doesNotMatch(manual,/A searched address or map match/);
 assert.match(address,/A searched address or map match does not prove an office/);
 assert.match(address,/county or parent-office overlays/);
 assert.doesNotMatch(address,/Manual selection is not a verified job-address match/);
 assert.match(address,/An issuer role is configured but awaits staff review/);
});
test('address and manual selection pass exact context into the same role display',()=>{
 const source=readFileSync('src/components/permitting/LocalityPickerDialog.jsx','utf8');
 assert.match(source,/ElectricalAuthorityCoverage authority=\{addressAuthority\} selectionContext="address"/);
 assert.match(source,/ElectricalAuthorityCoverage authority=\{selectedAuthority\} selectionContext="manual"/);
});
