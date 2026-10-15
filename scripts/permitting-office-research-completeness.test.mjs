import test from 'node:test';
import assert from 'node:assert/strict';
import {officeResearchChecklist} from '../base44/shared/permittingOfficeResearch.mjs';
import {assessOfficeResearchRole,assessOfficeResearchRoles} from '../src/components/permitting/officeResearchCompleteness.mjs';

function completeFinding(roleKey) {
  const role=officeResearchChecklist.roles.find(item=>item.key===roleKey);
  const research_fields=Object.fromEntries([
    ...officeResearchChecklist.common_research_fields,
    ...(role.research_fields||[]),
  ].map(key=>[key,'Retained official research detail']));
  return {
    role:roleKey,office_name:'Example Government Office',official_source_url:'https://example.gov/permits',
    responsibility_quote:'Official text describing this office responsibility.',service_area:'Example City',
    applicability:'potentially_applicable',research_fields,
  };
}

test('electrical issuer and inspection findings are independently assessed',()=>{
  const issuer=completeFinding('electrical_permit');
  const inspection=completeFinding('electrical_inspection');
  assert.equal(assessOfficeResearchRole([issuer],'electrical_permit').status,'metadata_present_unverified');
  assert.equal(assessOfficeResearchRole([issuer],'electrical_inspection').status,'missing');
  assert.equal(assessOfficeResearchRole([inspection],'electrical_inspection').status,'metadata_present_unverified');
  assert.equal(assessOfficeResearchRole([inspection],'electrical_permit').status,'missing');
});

test('unknown applicability, empty fields and unresolved placeholders remain gaps',()=>{
  const row=completeFinding('electrical_inspection');
  row.applicability='unknown';
  row.service_area='Not found yet';
  row.research_fields.inspection_provider='Unknown';
  const result=assessOfficeResearchRole([row],'electrical_inspection');
  assert.equal(result.status,'incomplete');
  assert.ok(result.findings[0].missing_evidence.includes('Applicability unresolved'));
  assert.ok(result.findings[0].missing_evidence.includes('Service area missing'));
  assert.ok(result.findings[0].missing_fields.includes('inspection_provider'));
});

test('multiple same-role findings remain ambiguous instead of being merged',()=>{
  const row=completeFinding('electrical_permit');
  const result=assessOfficeResearchRole([row,{...row,office_name:'Second Office'}],'electrical_permit');
  assert.equal(result.status,'ambiguous');
  assert.equal(result.findings.length,2);
});

test('unsafe sources and missing role evidence cannot appear metadata-complete',()=>{
  const row=completeFinding('electrical_permit');
  row.official_source_url='javascript:alert(1)';
  row.responsibility_quote='';
  const result=assessOfficeResearchRole([row],'electrical_permit');
  assert.equal(result.status,'incomplete');
  assert.ok(result.findings[0].missing_evidence.includes('Usable HTTPS source link missing'));
  assert.ok(result.findings[0].missing_evidence.includes('Official responsibility quote missing'));
});

test('filled research fields only means metadata present, never authority verified',()=>{
  const roles=officeResearchChecklist.roles.map(role=>completeFinding(role.key));
  const result=assessOfficeResearchRoles(roles);
  assert.equal(result.roles_with_findings,7);
  assert.equal(result.roles_with_gaps,0);
  assert.equal(result.research_complete,false);
  assert.equal(result.authority_verified,false);
  assert.equal(result.roles.find(row=>row.role==='electrical_permit').authority_verified,false);
  assert.equal(result.roles.find(row=>row.role==='electrical_inspection').applicable_to_project,false);
});

test('unsupported role keys fail closed',()=>{
  assert.throws(()=>assessOfficeResearchRole([], 'electrical'),/Unsupported office research role/);
});
