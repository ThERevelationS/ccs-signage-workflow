import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectHtmlText} from '../base44/shared/permittingHtmlEvidence.mjs';
const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/electrical-office-review/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
const city=manifest.sources.find(s=>s.file==='city-electrical-contract.html');
const bytes=readFileSync(city.retained_path),hash=b=>createHash('sha256').update(b).digest('hex');
if(city.status!=='archived' || bytes.length!==city.bytes || hash(bytes)!==city.sha256)throw Error('Municipal electrical evidence identity differs.');
const raw=bytes.toString('utf8'),projection=projectHtmlText(raw,{includeLinks:true});
const quote='The City contracts with Inspections Bureau, Inc. or IBI to review and inspect all electrical permits.';
const block=projection.blocks.find(b=>b.text.includes(quote));
if(!block)throw Error('Municipal responsibility clause is missing.');
const literalHttpLink='http://www.inspectionbureau.com/';
if(!raw.includes('href="'+literalHttpLink+'"'))throw Error('Recorded original provider link differs.');
writeFileSync(root+'city-electrical-contract.txt',projection.text+'\n');
const packet={method:'municipal-electrical-responsibility-research-v1',status:'review_blocked',
 jurisdiction_id:'6ac1a123edda6d8dd942690b',government_office_id:'1776692961965-0.8021021998915965',
 evidence:{official_url:city.official_url,observed_at:city.retrieved_at,raw_sha256:city.sha256,text_sha256:hash(projection.text),
  block:block.block,excerpt:quote,printed_office_name:'Inspections Bureau, Inc. or IBI',literal_provider_link:literalHttpLink},
 roles:{electrical_inspection:{explicit_municipal_responsibility_clause_retained:true,approved:false},
  electrical_permit:{explicit_issuer_established:false,approved:false,reason:'Electrical plan-review/permit application routing does not establish permit issuance responsibility.'}},
 blockers:[{kind:'canonical_identity',status:'needs_verification',reason:'Provider contact page is web-readable but original HTML retrieval returned 406; canonical office is not staff verified.'},
  {kind:'identity_link',status:'needs_review',reason:'Original municipal link uses HTTP; retained HTTPS identity-link verification cannot equate it with an HTTPS URL or infer a redirect.'},
  {kind:'review_route',status:'unsupported',reason:'Native HTML delegation supports zoning only; PDF delegation cannot consume this HTML block.'}],
 provider_contact_retrieval:manifest.sources.find(s=>s.file==='ibi-contact.html'),
 canonical_name_rewritten:false,original_link_upgraded:false,redirect_verified:false,
 locality_authority_approved:false,address_authority_resolved:false,
 next_action:'Keep Cincinnati blocked items visible and continue other Ohio office reconciliation; do not repeat identical failed retrievals or manufacture publisher/provider aliases.'};
writeFileSync(root+'electrical-office-review-packet.json',JSON.stringify(packet,null,2)+'\n');
const path='src/components/permitting/cincinnatiElectricalResearch.json';
const research=JSON.parse(readFileSync(path));
research.role_findings=[{role:'Electrical inspection',status:'Explicit City statement retained; approval pending',
 note:'The City names IBI for electrical review and inspection. Canonical identity, the original HTTP provider link, and the HTML review route remain unresolved.',source:city.official_url},
 {role:'Electrical permit issuance',status:'Issuer responsibility unresolved',note:'A separate electrical permit and an application portal do not establish who issues the permit.',source:research.resources[0].source}];
writeFileSync(path,JSON.stringify(research,null,2)+'\n');
console.log(JSON.stringify({municipal_inspection_clause_retained:true,permit_issuer_verified:false,blockers:packet.blockers.length,authority_approved:false}));
