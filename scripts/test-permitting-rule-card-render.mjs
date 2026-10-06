import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const dir=resolve('node_modules/.cache/permitting-card-render');
await mkdir(dir,{recursive:true});
const outfile=resolve(dir,'card.mjs');
try {
 await build({entryPoints:['src/components/admin/PermittingRuleCard.jsx'],outfile,bundle:true,platform:'node',format:'esm',jsx:'automatic',alias:{'@':resolve('src')},external:['react','react-dom','react/jsx-runtime']});
 globalThis.window={self:null,top:null}; // Existing UI utility reads iframe status during module initialization.
 const {default:RuleCard}=await import(pathToFileURL(outfile));
 delete globalThis.window;
 const rule={id:'fixture',status:'needs_review',confidence:'high',conflict_state:'conflicting_sources',rule_category:'submittal_requirement',requirement:'Fixture requirement',citations:[{section_or_page:'PDF page 1',excerpt:'First retained source'},{section_or_page:'PDF page 2',excerpt:'Second retained source'}]};
 const render=(extra={})=>renderToStaticMarkup(React.createElement(RuleCard,{rule,expanded:true,onToggle(){},onApprove(){},onReject(){},onEdit(){},onResolveConflict(){},actionLoading:false,...extra}));
 const html=render();
 assert.match(html,/<button[^>]*disabled=""[^>]*>[\s\S]*?Approve<\/button>/);
 assert.match(html,/<button[^>]*disabled=""[^>]*>Record resolution for staff review<\/button>/);
 assert.match(html,/Resolution rationale/);assert.match(html,/maxLength="2000"/i);
 assert.match(html,/First retained source/);assert.match(html,/Second retained source/);
 assert.match(html,/I reviewed every cited source/);
 const busy=render({actionLoading:true});assert.match(busy,/<textarea[^>]*disabled=""/);assert.match(busy,/<input[^>]*type="checkbox"[^>]*disabled=""/);
 const historical=render({rule:{...rule,status:'historical'}});assert.doesNotMatch(historical,/>Approve<\/button>/);
 assert.doesNotMatch(render({expanded:false}),/Resolution rationale/);
 console.log('Conflict card render acceptance passed: disabled approval/resolution, rationale and acknowledgement, both citations, busy and historical safeguards. No browser interaction or API calls.');
} finally { await rm(dir,{recursive:true,force:true}); }
