import test from 'node:test';
import assert from 'node:assert/strict';
import {handleIdentityCorrection as handle} from '../base44/shared/jurisdictionIdentityCorrectionAction.mjs';
import {ohioTypeCorrectionProposals as proposals} from '../base44/shared/ohioIdentityTypeCorrectionProposals.mjs';
const id='6ac19f0cd3b3f47e53ac0596',p=proposals[id];
const profile=()=>({id,name:p.name,state:'OH',type:p.old_type,parent_county_name:p.parent_county_name,website_url:p.website_url,permitting_url:p.permitting_url,updated_date:'v1',activity_log:[],documents:[{url:'keep.pdf'}]});
const request=b=>new Request('https://example.test',{method:'POST',body:JSON.stringify(b)});
const body=()=>({jurisdiction_id:id,action:'preview',expected:profile(),request_id:'correction_request_01'});
function client(user={role:'admin',email:'actual-admin@example.test'},record=profile()){
 let writes=0;return {auth:{me:async()=>user},asServiceRole:{entities:{JurisdictionProfile:{get:async()=>record,updateMany:async(q,u)=>{writes++;assert.equal(q.updated_date,'v1');Object.assign(record,u.$set);return {updated:1};}}}},writes:()=>writes};
}
test('anonymous and non-admin requests cannot read or write profiles',async()=>{
 for(const [user,status] of [[null,401],[{role:'user',email:'x'},403]]){const c=client(user);c.asServiceRole.entities.JurisdictionProfile.get=()=>{throw Error('must not read');};assert.equal((await handle(request(body()),c)).status,status);assert.equal(c.writes(),0);}
});
test('preview never writes and ignores client-supplied actor/evidence/type',async()=>{
 const c=client(),b={...body(),actor:'fake',newType:'township',evidence:{sha256:'fake'}};
 const r=await (await handle(request(b),c)).json();assert.equal(r.patch.type,'city');assert.equal(r.patch.activity_log[0].user,'actual-admin@example.test');assert.equal(r.patch.activity_log[0].changes.evidence.sha256,p.evidence.sha256);assert.equal(c.writes(),0);
});
test('unknown profiles and missing action fail closed',async()=>{
 for(const b of [{...body(),jurisdiction_id:'other'},{...body(),action:undefined}]){const c=client();assert.equal((await handle(request(b),c)).status,400);assert.equal(c.writes(),0);}
});
test('changed county, URLs, type or name blocks even a fresh expected snapshot',async()=>{
 for(const field of ['name','state','type','parent_county_name','website_url','permitting_url']){const r=profile();r[field]='changed';const c=client(undefined,r);assert.equal((await handle(request({...body(),expected:r,action:'apply'}),c)).status,409);assert.equal(c.writes(),0);}
});
test('apply uses authenticated actor and one conditional write; keeps documents',async()=>{
 const c=client();const r=await (await handle(request({...body(),action:'apply'}),c)).json();assert.equal(r.success,true);assert.equal(c.writes(),1);assert.equal(r.jurisdiction.type,'city');assert.deepEqual(r.jurisdiction.documents,[{url:'keep.pdf'}]);assert.equal(r.authority_verified,false);
});
test('all four proposals are separate IDs, including both Cleves profiles',()=>{assert.equal(Object.keys(proposals).length,4);assert.equal(proposals['69b30b6e1e5a58b2a3379aa1'].new_type,'village');assert.equal(proposals['6ac1a161934312388bd3ca04'].new_type,'village');});
