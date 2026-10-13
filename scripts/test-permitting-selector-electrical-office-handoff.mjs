import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {summarizeSelectorElectricalOfficeHandoff as summarize} from '../src/components/permitting/selectorElectricalOfficeHandoff.mjs';

const profile=()=>({id:'oh-profile',name:'Pilot Township',state:'OH',documents:[{title:'Electrical permit application',url:'https://gov.example/permit.pdf'}]});
const locality=(offices=[])=>({id:'loc',name:'Pilot Township',state:'OH',jurisdiction_profile_id:'oh-profile',offices});
const office=(id,roles,status='needs_verification',extra={})=>({id,name:'Office '+id,government_office_id:'canonical-'+id,authority_roles:roles,
  authority_verification_status:status,authority_verification_notes:'Notes retained',authority_verified_by:'Reviewer',authority_verified_at:'2026-10-10',
  contact_website:'https://gov.example/offices/'+id,...extra});
const dir=resolve('node_modules/.cache/selector-electrical-office-handoff');
await mkdir(dir,{recursive:true});
await build({entryPoints:['src/components/permitting/SelectorSavedSourceReview.jsx'],bundle:true,
  outfile:dir+'/panel.mjs',format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']});
const Component=(await import(dir+'/panel.mjs')).default;
after(async()=>rm(dir,{recursive:true,force:true}));
const render=l=>renderToStaticMarkup(React.createElement(Component,{profile:profile(),locality:l}));

test('unlinked or wrong-state locality cannot borrow office roles by name',()=>{
 for(const input of [undefined,{...locality([office('a',['electrical_permit'],'staff_verified')]),jurisdiction_profile_id:''},
   {...locality([office('a',['electrical_permit'],'staff_verified')]),jurisdiction_profile_id:'other'},
   {...locality([office('a',['electrical_permit'],'staff_verified')]),state:'KY'}]){
  const result=summarize(profile(),input);
  assert.equal(result.status,'exact_link_required');
  assert.deepEqual(result.roles.map(r=>r.status),['not_assessed','not_assessed']);
  const html=render(input);
  assert.ok(html.includes('No exact profile link for this comparison'));
  assert.ok(!html.includes('Office a'));
 }
});
test('exact linked issuer and inspector are separate review items with preserved office IDs and official source links',()=>{
 const l=locality([office('issuer',['electrical_permit'],'staff_verified'),office('inspector',['electrical_inspection'])]);
 const result=summarize(profile(),l);
 assert.equal(result.status,'exact_link_read');
 assert.deepEqual(result.roles.map(r=>r.status),['staff_review_reference','needs_staff_review']);
 const html=render(l);
 for(const s of ['Next: reconcile the saved electrical office roles','Electrical permit issuer','Electrical inspection provider',
   'Office issuer','Office inspector','canonical-issuer','canonical-inspector','notes recorded',
   'historical tracker flag','fresh official authority and site applicability are still unverified',
   'Use the existing locality office editor for staff review','Open configured office website (reference only)']){
   assert.ok(html.includes(s),s);
 }
 assert.ok(html.includes('href="https://gov.example/offices/issuer"'));
 assert.ok(html.includes('href="https://gov.example/permit.pdf"'));
 assert.ok(!html.includes('Office approved for the job address'));
});
test('legacy broad electrical role is not issuer or inspector',()=>{
 const result=summarize(profile(),locality([office('broad',['electrical'],'staff_verified')]));
 assert.equal(result.legacy_broad_role_present,true);
 assert.deepEqual(result.roles.map(r=>r.status),['not_recorded','not_recorded']);
 const html=render(locality([office('broad',['electrical'],'staff_verified')]));
 assert.ok(html.includes('does not establish a permit issuer or inspection provider'));
});
test('absent and duplicate office IDs, plus multi-office service areas fail closed',()=>{
 const missing=summarize(profile(),locality([office('',['electrical_permit'],'staff_verified')]));
 assert.equal(missing.roles[0].status,'office_identity_conflict');
 const duplicated=summarize(profile(),locality([
   office('same',['electrical_permit'],'staff_verified'),office('same',['electrical_inspection'],'staff_verified')]));
 assert.deepEqual(duplicated.roles.map(r=>r.status),['office_identity_conflict','office_identity_conflict']);
 const multiple=summarize(profile(),locality([office('one',['electrical_inspection']),office('two',['electrical_inspection'])]));
 assert.equal(multiple.roles[1].status,'multiple_saved_offices');
 assert.equal(multiple.roles[1].offices.length,2);
 assert.ok(render(locality([office('one',['electrical_inspection']),office('two',['electrical_inspection'])]))
   .includes('no single office was chosen'));
});
test('malicious or credential URL cannot be an office link, but the original source link remains',()=>{
 for(const url of ['javascript:alert(document.cookie)','data:text/plain,hi','https://user:password@evil.example/']){
  const l=locality([office('issuer',['electrical_permit'],'staff_verified',{contact_website:url})]);
  assert.equal(summarize(profile(),l).roles[0].offices[0].website,'');
  const html=render(l);
  assert.ok(!html.includes('Open configured office website'));
  assert.ok(html.includes('Open recorded source link'));
 }
});
test('thousands of offices are retained as ambiguous evidence; inputs stay unchanged and no requests are made',()=>{
 const p=profile(),l=locality(Array.from({length:1700},(_,i)=>office('id-'+i,['electrical_inspection'])));
 const before=JSON.stringify([p,l]);const summary=summarize(p,l);
 assert.equal(summary.roles[1].offices.length,1700);
 assert.equal(summary.roles[1].status,'multiple_saved_offices');
 assert.equal(JSON.stringify([p,l]),before);
});
test('source review is wired only for nonduplicate profiles and cannot start scans or mutate offices',()=>{
 const text=readFileSync('src/components/permitting/SelectorScanActions.jsx','utf8');
 assert.ok(text.includes('!duplicate&&<SelectorSavedSourceReview'));
 assert.ok(text.includes('locality={locality||result?.suggested_locality||null}'));
 const component=readFileSync('src/components/permitting/SelectorSavedSourceReview.jsx','utf8');
 assert.ok(!component.includes('runAction(')&&!component.includes('.update(')&&!component.includes('.create('));
});
