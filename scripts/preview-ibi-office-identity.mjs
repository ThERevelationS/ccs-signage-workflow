import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function previewIbiIdentity(snapshot){
 const office=snapshot?.office;
 if(snapshot?.setting_key!=='permitOfficeCatalog' || !snapshot.id || !snapshot.updated_date ||
   office?.id!=='1776692961965-0.8021021998915965' || office.name!=='(IBI) Inspection Bureau, Inc.')
  throw new Error('Exact versioned legacy IBI catalog identity is required.');
 if(office.government_office_id || office.government_office || office.office_candidate_registration)
  throw new Error('Existing canonical identity or candidate review must be reconciled before preview.');
 if(snapshot.other_office_ids?.includes(office.id))throw new Error('Duplicate catalog identity requires review.');
 return {
  method:'ibi-existing-office-identity-preview-v1',dry_run:true,applied:false,
  expected_catalog:{id:snapshot.id,setting_key:snapshot.setting_key,updated_date:snapshot.updated_date},
  expected_office_sha256:digest(office),
  catalog_office_id:office.id,
  proposed_office:{...structuredClone(office),government_office_id:office.id,
   government_office:{name:'The Inspection Bureau, Inc.',state:'OH',phone:'513-381-6080',
    website:'https://www.inspectionbureau.com/',address:'250 W Court St #125W, Cincinnati, OH 45202',
    email:'',verification_status:'needs_verification',verified_by:'',verified_at:'',
    source_url:'https://www.inspectionbureau.com/',
    verification_notes:'Regional provider identity candidate. Address differs from City FAQ. No statewide or locality coverage approval. Legacy email is not independently confirmed.'}},
  evidence:{
   identity:{provider_url:'https://www.inspectionbureau.com/',original_html_archived:false,
    corroboration:'City electrical inspection contract page links provider domain; matching phone supports identity research.',
    conflict:'City FAQ address 205 W Court Street differs from provider address 250 W Court Street #125W.'},
   electrical_permit:{status:'needs_review',archive:'cincinnati-signs-handout.pdf',physical_page:2,
    sha256:'a535c6728b536e98d2a5cf36e3611fd977da18dd53cebb842b78667c940615fb',
    limitation:'May 2017 guidance identifies a separate electrical permit and IBI contact; it does not independently prove present permit issuance authority. September 2026 provider migration changes submission routing.'},
   electrical_inspection:{status:'needs_review',archive:'cincinnati-signs-handout.pdf',physical_page:2,
    sha256:'a535c6728b536e98d2a5cf36e3611fd977da18dd53cebb842b78667c940615fb',
    limitation:'City guidance directs illuminated/wired signs to IBI, but staff review and current project scope are unresolved.'}},
  authority_verified:false,staff_approved:false,locality_links_changed:false,
  blockers:['Canonical identity staff review','Official source archive/catalog/page registration before role review',
   'Permit issuer evidence distinguished from submission portal','Inspection applicability and current scheduling'],
  apply_requirements:['Re-read exactly one versioned catalog row','Match catalog id, key and updated_date',
   'Match exact office snapshot hash and unique canonical IDs','Preserve every other catalog entry and existing workflow',
   'Use atomic guarded catalog update and readback; never retry an uncertain write blindly']
 };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/sign-scope/';
 const result=previewIbiIdentity(JSON.parse(readFileSync(root+'ibi-catalog-preview-snapshot.json','utf8')));
 writeFileSync(root+'ibi-office-identity-proposal.json',JSON.stringify(result,null,2)+'\n');
 console.log('Saved dry-run identity proposal; no production mutation.');
}
