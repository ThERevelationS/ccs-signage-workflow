import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectHtmlText} from '../base44/shared/permittingHtmlEvidence.mjs';
const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/scope-review/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const source of manifest.sources){
 const bytes=readFileSync(source.retained_path);
 if(source.status!=='archived' || bytes.length!==source.bytes || hash(bytes)!==source.sha256)throw Error('Retained scope evidence differs.');
}
const html=manifest.sources.find(s=>s.file==='zoning-administration.html'),pdf=manifest.sources.find(s=>s.file==='zoning-verification-request.pdf');
const projection=projectHtmlText(readFileSync(html.retained_path,'utf8'),{includeLinks:true});
const excerpt='all land within the City of Cincinnati';
const scope=projection.blocks.find(b=>b.text.includes(excerpt));
const overlays=projection.blocks.find(b=>b.text.includes('base zoning district and overlay districts'));
if(!scope || !overlays || !projection.links.some(l=>l.url===pdf.official_url))throw Error('Current city scope, overlay or literal form-link evidence is missing.');
writeFileSync(root+'zoning-administration.txt',projection.text+'\n');
const packet={method:'retained-municipal-zoning-scope-candidate-v1',status:'review_pending',
 jurisdiction:{id:'6ac1a123edda6d8dd942690b',name:'Cincinnati',state:'OH',type:'city'},
 source:{official_url:html.official_url,retrieved_at:html.retrieved_at,raw_sha256:html.sha256,text_sha256:hash(projection.text)},
 scope_proof:{block:scope.block,excerpt},property_context:{block:overlays.block,review_required:['City boundary','Base zoning district','All applicable overlay districts','Sign type and work scope']},
 request_form:{official_url:pdf.official_url,final_url:pdf.final_url,retained_path:pdf.retained_path,sha256:pdf.sha256,bytes:pdf.bytes,fee_verified:false},
 compiled_code_status:manifest.chapter_text_acquisition,
 limitations:['Municipal zoning scope does not establish electrical-office service coverage.',
  'No job address has been resolved or verified.',
  'The dated handout has not been approved as a current legal exemption source.',
  'No current compiled sign chapter or intervening amendments have been verified.'],
 locality_coverage_approved:false,source_currentness_approved:false,electrical_roles_approved:false};
writeFileSync(root+'scope-review-packet.json',JSON.stringify(packet,null,2)+'\n');
copyFileSync(pdf.retained_path,'public/permitting-evidence/cincinnati-electrical/zoning-verification-request.pdf');
const path='src/components/permitting/cincinnatiElectricalResearch.json',research=JSON.parse(readFileSync(path));
research.scope_review={source:html.official_url,form_source:pdf.official_url,form_archive:'/permitting-evidence/cincinnati-electrical/zoning-verification-request.pdf',form_sha256:pdf.sha256,observed_on:html.retrieved_at.slice(0,10)};
writeFileSync(path,JSON.stringify(research,null,2)+'\n');
console.log(JSON.stringify({scope_evidence_retained:true,form_bytes:pdf.bytes,authority_approved:false,current_exemptions_verified:false}));
