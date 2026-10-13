import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve('node_modules/.cache/coverage-sdk-acceptance');await mkdir(dir,{recursive:true});
globalThis.window={self:null,top:null};
try{
await build({entryPoints:['src/components/permitting/PermittingRecordedCoverage.jsx'],outfile:dir+'/panel.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic',alias:{'@':resolve('src')},external:['react','react/jsx-runtime'],plugins:[{name:'no-api',setup(b){b.onResolve({filter:/base44Client|EmailGate|PermitSettingsDialog/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path.includes('EmailGate')?'export const useAuth=()=>({currentUser:null,isRegistered:false});':args.path.includes('PermitSettingsDialog')?'export default function Dialog(){return null;}':'export const base44={};'}));}}]});
const {readRecordedCoverage}=await import(dir+'/panel.mjs');
let calls=[],progress=[];
const queue={id:'q',state:'OH',jurisdiction_name:'Miami Township',jurisdiction_type:'township',parent_county_name:'Hamilton County'};
const profile={id:'p',state:'OH',name:'Miami Township',type:'township',parent_county:{name:'Hamilton County'},office_authority_review_state:{status:'complete',committed_sequence:1}};
const pdf={id:'pdf-1',jurisdiction_id:'p',official_url:'https://gov.example/permit.pdf',archived_file_url:'https://archives.example/pdf-1',file_hash_sha256:'a'.repeat(64),file_bytes:101,content_status:'current',verification_status:'verified',authority_classification:'current_adopted',authority_review:{status:'active',review_id:'source-review',scope_kind:'named_jurisdiction',named_areas:['Miami Township']}};
const api={entities:{
SourceCollectionQueue:{filter:async(query,options)=>{calls.push({entity:'queue',query,options});return options.cursor?{items:[],has_more:false,next_cursor:null}:{items:[queue],has_more:true,next_cursor:'queue-next'};}},
JurisdictionProfile:{filter:async(query,options)=>{calls.push({entity:'profile',query,options});return {items:[profile],has_more:false,next_cursor:null};}},
PermitLocality:{filter:async(query,options)=>{calls.push({entity:'locality',query,options});return options.cursor?{items:[{id:'ky-locality',state:'KY',name:'Kentucky fixture'}],has_more:false}:{items:[{id:'locality',state:'OH',name:'Office gap fixture',jurisdiction_profile_id:'p',offices:[{authority_roles:['electrical_permit'],authority_verification_status:'staff_verified'}]}],has_more:true,next_cursor:'locality-next'};}},
PermittingOfficeAuthorityReview:{filter:async(query,options)=>{calls.push({entity:'reviews',query,options});return {items:[{id:'review-1',method:'office-authority-v1',jurisdiction_id:'p',sequence:1,relation_key:'scope',role:'electrical_permit',action:'verify',profile_snapshot:{id:'p',state:'OH'},office_snapshot:{government_office_id:'canonical-office',name:'Official office'},coverage_area:'Miami Township',coverage_kind:'named_jurisdiction',coverage_basis:'same_profile_scope',source_review_id:'source-review',responsibility_confirmed:true,address_authority_resolved:false,source_document_id:'pdf-1',source_snapshot:pdf,role_proof:{physical_page:1,text_sha256:'b'.repeat(64),excerpt:'Electrical permits are issued by the office'}}],has_more:false};}},
PermittingSourceDocument:{filter:async(query,options)=>{calls.push({entity:'pdf',query,options});return {items:[pdf],has_more:false};}}
}};
const result=await readRecordedCoverage(()=>true,value=>progress.push(value),api);
assert.equal(calls.length,7);assert.equal(calls[4].options.cursor,'locality-next');assert.equal(calls[1].options.cursor,'queue-next');assert.equal(calls[2].options.cursor,undefined);
for(const c of calls){assert.deepEqual(c.query,c.entity==='reviews'?{method:'office-authority-v1'}:c.entity==='pdf'?{id:{$in:['pdf-1']}}:{state:{$in:['OH','KY']}});assert.equal(c.options.limit,c.entity==='pdf'?50:500);assert.equal(c.options.sort,'id');assert.ok(c.options.fields.includes('id'));assert.ok(!c.options.fields.includes('documents'));}
assert.equal(result.electrical_source_evidence.states.OH.electrical_permit.recorded_source_reference,1);assert.equal(result.electrical_source_evidence.states.OH.electrical_inspection.histories,0);assert.equal(result.electrical_source_evidence.current_source_verified,false);assert.ok(progress.includes('Checked 1 referenced electrical source IDs; 1 visible source records'));assert.ok(calls.find(c=>c.entity==='reviews').options.fields.includes('role_proof'));
assert.equal(result.electrical_offices.states.OH.roles.electrical_permit.staff_verified,1);assert.equal(result.electrical_offices.states.KY.roles.electrical_inspection.missing,1);assert.equal(result.electrical_offices.inventory_complete,false);assert.ok(progress.includes('Read 2 saved locality office setups'));
assert.equal(result.authority_events.states.OH.saved_verified_role_assignments,1);assert.equal(result.authority_events.states.OH.unresolved_link_or_office,1);assert.equal(result.authority_events.authority_verified,false);assert.ok(progress.includes('Read 1 recorded office authority events'));assert.ok(calls.find(c=>c.entity==='profile').options.fields.includes('office_authority_review_state'));
assert.equal(result.unmirrored_authority_reviews.states.OH.no_saved_office,1);assert.equal(result.unmirrored_authority_reviews.items[0].canonical_office_id,'canonical-office');assert.equal(result.unmirrored_authority_reviews.authority_verified,false);
assert.equal(result.office_evidence.states.OH.office_count,1);assert.equal(result.office_evidence.states.OH.recorded_staff_verified_offices,1);assert.equal(result.office_evidence.states.OH.canonical_office_identity_missing,1);assert.equal(result.office_evidence.states.OH.profile_link_review,1);assert.equal(result.office_evidence.states.OH.verification_provenance_review,1);assert.equal(result.office_evidence.states.KY.office_count,0);assert.equal(result.office_evidence.authority_verified,false);
assert.equal(result.saved_profile_links.states.OH.saved,1);assert.equal(result.saved_profile_links.states.OH.name_review,1);assert.equal(result.saved_profile_links.states.KY.unlinked,1);assert.equal(result.saved_profile_links.reviews.length,2);assert.equal(result.saved_profile_links.authority_verified,false);assert.ok(calls.find(c=>c.entity==='locality').options.fields.includes('jurisdiction_profile_id'));
assert.equal(result.items.length,1);assert.deepEqual(result.official.candidate_counts,{OH:2318,KY:530});assert.ok(progress.includes('Read 1 queue records'));
let repeatedPages=0,afterRepeatedRead=0;
await assert.rejects(readRecordedCoverage(()=>true,()=>{}, {entities:{
 SourceCollectionQueue:{filter:async()=>({items:[queue],has_more:++repeatedPages===1,next_cursor:'repeat'})},
 JurisdictionProfile:{filter:async()=>{afterRepeatedRead++;}}
}}),/repeated during pagination/);
assert.equal(afterRepeatedRead,0);
let current=true,profilesRead=0;
await assert.rejects(readRecordedCoverage(()=>current,()=>{}, {entities:{SourceCollectionQueue:{filter:async()=>{current=false;return {items:[],has_more:false};}},JurisdictionProfile:{filter:async()=>{profilesRead++;}}}}),/superseded/);assert.equal(profilesRead,0);
await assert.rejects(readRecordedCoverage(()=>true,()=>{}, {entities:{SourceCollectionQueue:{filter:async()=>({items:[],has_more:false})},JurisdictionProfile:{filter:async()=>{throw Error('Profile access unavailable');}}}}),/Profile access unavailable/);
await assert.rejects(readRecordedCoverage(()=>true,()=>{}, {entities:{SourceCollectionQueue:{filter:async()=>({items:[],has_more:false})},JurisdictionProfile:{filter:async()=>({items:[],has_more:false})},PermitLocality:{filter:async()=>{throw Error('Office access unavailable');}}}}),/Office access unavailable/);
await assert.rejects(readRecordedCoverage(()=>true,()=>{}, {entities:{
SourceCollectionQueue:{filter:async()=>({items:[],has_more:false})},JurisdictionProfile:{filter:async()=>({items:[],has_more:false})},PermitLocality:{filter:async()=>({items:[],has_more:false})},PermittingOfficeAuthorityReview:{filter:async()=>{throw Error('Review record access unavailable');}}}}),/Review record access unavailable/);
let stopAtReviews=true;
await assert.rejects(readRecordedCoverage(()=>stopAtReviews,()=>{}, {entities:{
SourceCollectionQueue:{filter:async()=>({items:[],has_more:false})},JurisdictionProfile:{filter:async()=>({items:[],has_more:false})},PermitLocality:{filter:async()=>({items:[],has_more:false})},PermittingOfficeAuthorityReview:{filter:async()=>{stopAtReviews=false;return {items:[],has_more:false};}}}}),/superseded/);
await assert.rejects(readRecordedCoverage(()=>true,()=>{}, {entities:{
SourceCollectionQueue:{filter:async()=>({items:[],has_more:false})},JurisdictionProfile:{filter:async()=>({items:[],has_more:false})},PermitLocality:{filter:async()=>({items:[],has_more:false})},PermittingOfficeAuthorityReview:{filter:async()=>({items:[{id:'e',method:'office-authority-v1',role:'electrical_inspection',action:'verify',source_document_id:'pdf'}],has_more:false})},PermittingSourceDocument:{filter:async()=>{throw Error('Electrical source metadata access failed');}}}}),/Electrical source metadata access failed/);
console.log('SDK adapter acceptance passed: OH/KY scope, projected identity fields, cursor handoff/repeated-identity rejection, cancellation before next entity and failure propagation. Mocked SDK only.');
}finally{delete globalThis.window;await rm(dir,{recursive:true,force:true});}
