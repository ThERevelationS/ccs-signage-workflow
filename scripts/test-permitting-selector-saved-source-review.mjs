import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Renderer,{act} from 'react-test-renderer';
import {savedSourceWebUrl,summarizeSavedSelectorSources} from '../src/components/permitting/selectorSavedSourceEvidence.mjs';

const H='a'.repeat(64);
const profile=(documents=[])=>({id:'exact-oh-profile',name:'Example Township',state:'OH',type:'township',documents});
const document=(patch={})=>({id:'doc-1',title:'Electrical permit application',doc_type:'permit_application',
  url:'https://government.example/forms/electrical-permit.pdf',source:'official_page_harvest',
  discovery_page_url:'https://government.example/forms',
  file_url:'https://archives.example/files/permit.pdf',source_sha256:H,stored_sha256:H,
  source_bytes:110,stored_bytes:110,...patch});
const dir=resolve('node_modules/.cache/selector-saved-source-review');
await mkdir(dir,{recursive:true});
await build({entryPoints:['src/components/permitting/SelectorSavedSourceReview.jsx'],
  bundle:true,outfile:dir+'/panel.mjs',format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],
  plugins:[{name:'mock-readonly-base44',setup(build){
    build.onResolve({filter:/base44Client/},args=>({path:args.path,namespace:'mock-base44'}));
    build.onLoad({filter:/.*/,namespace:'mock-base44'},()=>({contents:'export const base44={entities:{}};'}));
  }}]});
const Component=(await import(dir+'/panel.mjs')).default;
after(async()=>rm(dir,{recursive:true,force:true}));
const render=docs=>renderToStaticMarkup(React.createElement(Component,{profile:profile(docs)}));

test('exact profile saved source links and matching fingerprints are visible without office approval',()=>{
 const html=render([document()]);
 assert.match(html,/Saved on profile ID exact-oh-profile/);
 assert.match(html,/Review saved source links \(1\)/);
 assert.match(html,/Electrical permit application/);
 assert.match(html,/Found on a recorded forms page/);
 assert.match(html,/Open recorded source link/);
 assert.match(html,/Open discovery page/);
 assert.match(html,/Open fingerprint-matched retained PDF/);
 assert.match(html,/Stored PDF fingerprint matches/);
 assert.match(html,/do not verify electrical issuers, inspectors/);
 assert.match(html,/county overlays/);
 assert.match(html,/No link or filename automatically approves/);
 assert.match(html,/href="https:\/\/government.example\/forms\/electrical-permit.pdf"/);
 assert.match(html,/href="https:\/\/archives.example\/files\/permit.pdf"/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);
});
test('untrusted javascript, data, file and credential-bearing URLs cannot form clickable links',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,payload','file:///tmp/secret',
 'https://user:password@evil.example/file.pdf','/untrusted/path','not a url']){
  assert.equal(savedSourceWebUrl(url),'');
  const html=render([document({url,file_url:url,discovery_page_url:url})]);
  assert.doesNotMatch(html,/<a /);
  assert.match(html,/A usable original URL is not recorded/);
 }
 assert.equal(savedSourceWebUrl('https://gov.example/form'),'https://gov.example/form');
 assert.equal(savedSourceWebUrl('http://gov.example/forms'),'http://gov.example/forms');
});
test('failed archive fingerprints or lacking metadata never advertise a verified PDF',()=>{
 for(const patch of [
  {stored_sha256:'b'.repeat(64)},{source_bytes:111},{stored_bytes:0},
  {file_url:'https://archive.example/retained.pdf',stored_sha256:''}
 ]){
  const html=render([document(patch)]);
  assert.doesNotMatch(html,/Open fingerprint-matched retained PDF/);
  assert.match(html,/stored file exists but its PDF fingerprint has not been verified/);
  assert.match(html,/Open recorded source link/);
 }
});
test('portal, manual and archived-less resources remain accessible and retain provenance',()=>{
 const html=render([document({title:'Official online permit intake',source:'manual',doc_type:'other',
  url:'https://city.example/portal',file_url:'',discovery_page_url:'',archive_pinned:true})]);
 assert.match(html,/Open recorded source link/);
 assert.match(html,/Protected\/manual evidence — preserve/);
 assert.match(html,/Saved manually/);
 assert.match(html,/Retain HTML forms and portals as links/);
 assert.doesNotMatch(html,/Open fingerprint-matched retained PDF/);
});
test('unknown resource categories, missing URLs, duplicate document IDs remain separate review entries',()=>{
 const rows=summarizeSavedSelectorSources(profile([
  document({id:'same',title:'',url:''}),document({id:'same',title:'',url:'',doc_type:'electrical'})
 ]));
 assert.equal(rows.length,2);
 assert.notEqual(rows[0].key,rows[1].key);
 assert.equal(rows[1].category,'Unclassified resource');
 assert.equal(rows[0].source_url,'');
 assert.equal(rows[1].title,'Saved resource 2');
});
test('zero sources clearly requests research without claiming no permit exists',()=>{
 const html=render([]);
 assert.match(html,/Review saved source links \(0\)/);
 assert.match(html,/No saved links/);
 assert.match(html,/request official permit\/inspection materials/);
 assert.doesNotMatch(html,/no electrical permits are required/i);
});
test('only first ten records display initially; show-more is explicit and does not drop older records',async()=>{
 const docs=Array.from({length:37},(_,i)=>document({id:'doc-'+i,title:'Saved entry '+i,url:'https://example.gov/entry/'+i,file_url:''}));
 let root;
 await act(async()=>{root=Renderer.create(React.createElement(Component,{profile:profile(docs)}));});
 const visible=()=>JSON.stringify(root.toJSON());
 assert.match(visible(),/Saved entry 0/);
 assert.match(visible(),/Saved entry 9/);
 assert.doesNotMatch(visible(),/Saved entry 10"/);
 assert.match(visible(),/37/);
 const button=()=>root.root.findAllByType('button').find(b=>b.children.some(s=>typeof s==='string'&&s.includes('Show next saved links')));
 await act(async()=>button().props.onClick());
 assert.match(visible(),/Saved entry 19/);
 assert.doesNotMatch(visible(),/Saved entry 20"/);
 await act(async()=>button().props.onClick());
 await act(async()=>button().props.onClick());
 assert.match(visible(),/Saved entry 36/);
 assert.equal(root.root.findAllByType('button').length,0);
 await act(async()=>root.unmount());
});
test('no mutation, name-based inferred office, or automatic scan initiation',()=>{
 const docs=[document()],p=profile(docs),before=JSON.stringify(p);
 const first=summarizeSavedSelectorSources(p);
 assert.equal(JSON.stringify(p),before);
 assert.ok(!Object.keys(first[0]).includes('authority_verified'));
 assert.equal(first[0].stored_url,'https://archives.example/files/permit.pdf');
 const source=readFileSync('src/components/permitting/SelectorScanActions.jsx','utf8');
 assert.match(source,/SelectorSavedSourceReview/);
 assert.match(source,/!duplicate&&<SelectorSavedSourceReview key=\{profile.id\} profile=\{profile\}/);
 assert.match(source,/hasDuplicateRepositoryIdentity/);
 assert.match(source,/findRepositoryJurisdictionMatches/);
 assert.match(source,/Research evidence follow-up/);
 assert.doesNotMatch(readFileSync('src/components/permitting/SelectorSavedSourceReview.jsx','utf8'),/runAction\(|\.create\(|\.update\(/);
});
