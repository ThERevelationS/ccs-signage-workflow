import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileElectricalOfficeCoverage as reconcile} from '../src/components/permitting/permittingCoverageReader.mjs';
const office=(roles,status='staff_verified')=>({authority_roles:roles,authority_verification_status:status});
test('legacy office category cannot establish issuance or inspection',()=>{
 const r=reconcile([{id:'oh',state:'OH',name:'Ohio fixture',offices:[{office_type:'Electrical Inspectors'}]}]);
 assert.equal(r.states.OH.locality_count,1);assert.equal(r.states.OH.roles.electrical_permit.missing,1);assert.equal(r.states.OH.roles.electrical_inspection.missing,1);assert.equal(r.states.OH.both_roles_reviewed,0);
});
test('generic reviewed electrical role retains both specific gaps',()=>{
 const r=reconcile([{id:'oh',state:'OH',offices:[office(['electrical'])]}]);
 assert.equal(r.states.OH.legacy_broad_role_count,1);assert.equal(r.states.OH.roles.electrical_permit.staff_verified,0);assert.equal(r.gaps.length,1);
});
test('issuer review and pending inspection remain separate',()=>{
 const r=reconcile([{id:'oh',state:'OH',offices:[office(['electrical_permit']),office(['electrical_inspection'],'needs_verification')]}]);
 assert.equal(r.states.OH.roles.electrical_permit.staff_verified,1);assert.equal(r.states.OH.roles.electrical_inspection.needs_review,1);assert.equal(r.states.OH.both_roles_reviewed,0);
});
test('one office may cover both explicitly reviewed responsibilities without legal-completeness claims',()=>{
 const r=reconcile([{id:'ky',state:'KY',offices:[office(['electrical_permit','electrical_inspection'])]}]);
 assert.equal(r.states.KY.both_roles_reviewed,1);assert.equal(r.states.KY.roles.electrical_inspection.staff_verified,1);assert.equal(r.gaps.length,0);assert.equal(r.inventory_complete,false);assert.equal(r.applicability_verified,false);
});
test('unrecognized role in a reviewed office keeps the relationship under review',()=>{
 const r=reconcile([{id:'oh',state:'OH',offices:[office(['electrical_permit','invented_role'])]}]);
 assert.equal(r.states.OH.roles.electrical_permit.staff_verified,0);assert.equal(r.states.OH.roles.electrical_permit.needs_review,1);
});
test('Ohio gaps precede Kentucky and unsupported states stay explicit',()=>{
 const r=reconcile([{id:'ky',name:'A',state:'KY'},{id:'oh',name:'Z',state:'OH'},{id:'outside',state:'TN'}]);
 assert.deepEqual(r.gaps.map(row=>row.state),['OH','KY']);assert.deepEqual(r.excluded_record_ids,['outside']);
});
test('zero visible localities cannot imply statewide completion',()=>{
 const r=reconcile([]);assert.equal(r.states.OH.locality_count,0);assert.equal(r.states.KY.locality_count,0);assert.equal(r.inventory_complete,false);assert.match(r.notice,/read permissions/);
});
test('malformed or duplicate locality identities fail closed',()=>{
 assert.throws(()=>reconcile([{state:'OH'}]),/identity/);assert.throws(()=>reconcile([{id:'same',state:'OH'},{id:'same',state:'KY'}]),/duplicated/);assert.throws(()=>reconcile(null),/Invalid/);
});
