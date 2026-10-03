import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessStoredRewriteAuthority } from '../base44/shared/jurisdictionResearchAuthorityGate.mjs';

const schema=JSON.parse(readFileSync('base44/entities/JurisdictionProfile.jsonc','utf8'));
const matrix=JSON.parse(readFileSync('docs/permitting-boone-ky-2026-rewrite-adoption-status-matrix-2026-10-03.json','utf8'));

test('JurisdictionProfile persists the rewrite authority state consumed by the ingestion gate',()=>{
  const authority=schema.properties.rewrite_authority;
  assert.equal(authority.type,'object');
  assert.deepEqual(authority.required,['adoptionStatus','effectiveDateStatus']);

  for(const key of ['adoptionStatus','effectiveDateStatus']){
    assert.deepEqual(authority.properties[key].enum,['not_verified','verified']);
    assert.equal(authority.properties[key].default,'not_verified');
  }

  assert.equal(authority.properties.jurisdiction_id.type,'string');
  assert.equal(authority.properties.jurisdiction_name.type,'string');
  assert.equal(authority.properties.adoption_evidence_url.type,'string');
  assert.equal(authority.properties.adoption_verified_at.format,'date-time');
  assert.equal(authority.properties.effective_date_evidence_url.type,'string');
  assert.equal(authority.properties.effective_date_verified_at.format,'date-time');
});

test('Boone matrix states map into the stored authority contract and fail closed independently',()=>{
  for(const row of matrix.jurisdictions){
    const jurisdiction={
      name:row.jurisdiction,
      rewrite_authority:{
        jurisdiction_name:row.jurisdiction,
        adoptionStatus:row.adoptionStatus,
        effectiveDateStatus:row.effectiveDateStatus,
      },
    };
    assert.deepEqual(assessStoredRewriteAuthority(jurisdiction),{
      promotable:false,
      reasons:['adoption_not_verified','effective_date_not_verified'],
    },row.id);
  }

  const unionVerified={
    name:'City of Union',
    rewrite_authority:{
      jurisdiction_name:'City of Union',
      adoptionStatus:'verified',
      effectiveDateStatus:'verified',
      adoption_evidence_url:'https://official.example/union/adoption',
      effective_date_evidence_url:'https://official.example/union/effective',
    },
  };
  assert.deepEqual(assessStoredRewriteAuthority(unionVerified),{promotable:true,reasons:[]});

  const florenceStillPending={
    name:'City of Florence',
    rewrite_authority:{
      jurisdiction_name:'City of Florence',
      adoptionStatus:'not_verified',
      effectiveDateStatus:'not_verified',
    },
  };
  assert.equal(assessStoredRewriteAuthority(florenceStillPending).promotable,false);
});
