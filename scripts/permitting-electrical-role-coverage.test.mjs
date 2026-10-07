import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMatchedLocalityAuthority as summary,summarizeElectricalRoleCoverage as coverage} from '../base44/shared/permittingAddressLocality.js';
const office=(roles,status='staff_verified')=>({authority_roles:roles,authority_verification_status:status});
test('legacy broad role never fulfills either specific requirement',()=>{
 const r=summary({id:'town',offices:[office(['electrical'])]});assert.deepEqual(r.verified_roles,['electrical']);assert.deepEqual(r.electrical_coverage.missing_roles,['electrical_permit','electrical_inspection']);assert.equal(r.electrical_coverage.legacy_broad_role_present,true);
});
test('issuer only leaves inspection missing; reversed case stays separate',()=>{
 for(const role of ['electrical_permit','electrical_inspection']){const r=summary({id:'town',offices:[office([role])]});assert.deepEqual(r.verified_roles,[role]);assert.equal(r.electrical_coverage.roles[role],'staff_verified');assert.equal(r.electrical_coverage.missing_roles.length,1);assert.notEqual(r.electrical_coverage.missing_roles[0],role);}
});
test('separate reviewed roles can share or use separate offices without legal completeness claims',()=>{
 for(const offices of [[office(['electrical_permit','electrical_inspection'])],[office(['electrical_permit']),office(['electrical_inspection'])]]){const r=summary({id:'town',offices});assert.equal(r.electrical_coverage.status,'specific_roles_reviewed');assert.deepEqual(r.electrical_coverage.missing_roles,[]);assert.equal(r.electrical_coverage.complete_legal_coverage,false);assert.equal(r.electrical_coverage.applicability_verified,false);}
});
test('unreviewed inspection remains a gap even beside reviewed issuer',()=>{
 const r=summary({id:'town',offices:[office(['electrical_permit']),office(['electrical_inspection'],'needs_verification')]});assert.deepEqual(r.verified_roles,['electrical_permit']);assert.equal(r.electrical_coverage.roles.electrical_inspection,'needs_review');assert.deepEqual(r.electrical_coverage.missing_roles,['electrical_inspection']);
});
test('descriptive office type and unsupported roles cannot count as verified specific roles',()=>{
 for(const item of [{office_type:'Electrical'},office(['electrical_permit','invented_role'])]){const r=summary({id:'town',offices:[item]});assert.deepEqual(r.verified_roles,[]);assert.equal(r.electrical_coverage.missing_roles.length,2);}
});
test('unresolved locality and duplicate legacy roles preserve separate gaps without mutation',()=>{
 assert.equal(summary(null).electrical_coverage.missing_roles.length,2);const input=['electrical','electrical'];assert.equal(coverage(input).missing_roles.length,2);assert.deepEqual(input,['electrical','electrical']);
});
