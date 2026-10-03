import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildJurisdictionRewriteAuthorityUpdate } from '../base44/shared/jurisdictionRewriteAuthorityVerification.mjs';

const jurisdiction={id:'union-record-id',name:'City of Union'};
const actor={role:'admin',full_name:'Reviewer'};

test('authority verification requires official evidence before verified statuses can be persisted',()=>{
  assert.throws(()=>buildJurisdictionRewriteAuthorityUpdate({
    jurisdiction,actor,input:{adoptionStatus:'verified',effectiveDateStatus:'not_verified'}
  }),/Official adoption evidence URL is required/i);

  assert.throws(()=>buildJurisdictionRewriteAuthorityUpdate({
    jurisdiction,actor,input:{
      adoptionStatus:'verified',
      adoption_evidence_url:'https://union.example/ordinance',
      adoption_evidence_reference:'Ordinance 2026-20',
      effectiveDateStatus:'verified'
    }
  }),/Official effective-date\/applicability evidence URL is required/i);

  assert.throws(()=>buildJurisdictionRewriteAuthorityUpdate({
    jurisdiction,actor,input:{
      adoptionStatus:'not_verified',
      effectiveDateStatus:'verified',
      effective_date:'2026-11-01',
      effective_date_evidence_url:'https://union.example/effective'
    }
  }),/cannot be verified until legislative adoption is verified/i);
});

test('valid verified authority is bound to the live jurisdiction and reviewer',()=>{
  const out=buildJurisdictionRewriteAuthorityUpdate({
    jurisdiction,
    actor,
    now:()=> '2026-10-03T22:00:00.000Z',
    input:{
      jurisdiction_id:'florence-should-not-win',
      jurisdiction_name:'City of Florence',
      adoptionStatus:'verified',
      adoption_evidence_url:'https://union.example/ordinance',
      adoption_evidence_reference:'Ordinance 2026-20',
      effectiveDateStatus:'verified',
      effective_date:'2026-11-01',
      effective_date_evidence_url:'https://union.example/effective',
      verification_notes:'Reviewed against enacted ordinance.'
    }
  });
  assert.equal(out.jurisdiction_id,'union-record-id');
  assert.equal(out.jurisdiction_name,'City of Union');
  assert.equal(out.adoption_verified_by,'Reviewer');
  assert.equal(out.effective_date_verified_by,'Reviewer');
  assert.equal(out.adoption_verified_at,'2026-10-03T22:00:00.000Z');
  assert.equal(out.effective_date_verified_at,'2026-10-03T22:00:00.000Z');
});

test('admin UI calls only the admin backend mutation and backend uses versioned CAS',()=>{
  const ui=readFileSync('src/components/admin/JurisdictionRewriteAuthorityAdmin.jsx','utf8');
  const backend=readFileSync('base44/functions/updateJurisdictionRewriteAuthority/entry.ts','utf8');
  const page=readFileSync('src/pages/AdminPermittingSettings.jsx','utf8');

  assert.match(ui,/functions\.invoke\("updateJurisdictionRewriteAuthority"/);
  assert.match(ui,/expected_updated_date:\s*selected\.updated_date/);
  assert.doesNotMatch(ui,/JurisdictionProfile\.update/);

  assert.match(backend,/user\.role !== 'admin'/);
  assert.match(backend,/updated_date:\s*expectedUpdatedDate/);
  assert.match(backend,/updateMany\(/);
  assert.match(backend,/buildJurisdictionRewriteAuthorityUpdate/);

  assert.match(page,/JurisdictionRewriteAuthorityAdmin/);
  assert.match(page,/key: "authority", label: "Rewrite Authority"/);
});
