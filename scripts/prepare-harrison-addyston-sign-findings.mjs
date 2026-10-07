import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='docs/official-evidence/ohio-harrison-addyston-2026-10-07/';
const extraction=JSON.parse(readFileSync(root+'pdf-text-extraction.json'));
const path='src/components/permitting/ohioMunicipalResearch.json',rows=JSON.parse(readFileSync(path));
function finding(file,page,label,text,needle){
 const doc=extraction.documents.find(d=>d.file===file),record=doc.pages.find(p=>p.page===page);
 const bytes=readFileSync(root+file);
 if(createHash('sha256').update(bytes).digest('hex')!==doc.source_sha256 || createHash('sha256').update(record.text).digest('hex')!==record.text_sha256 || !record.text.includes(needle))throw Error('Page evidence mismatch: '+label);
 return{label,text,physical_page:page,archive:'/permitting-evidence/harrison-addyston/'+file+'#page='+page,source_sha256:doc.source_sha256,text_sha256:record.text_sha256,verification_status:'needs_verification',authority_approved:false};
}
const addyston=rows.find(r=>r.id==='6ac1a0de30219cc619d6e7d3');
addyston.document_findings=[
finding('addyston-linked-zoning-ordinance.pdf',23,'General sign provisions',
'Retained page covers real-estate, home-occupation, institutional, nonconforming and temporary signs plus public right-of-way restrictions. Review sign type and current district applicability.','SECTION 15 - 801. Signs'),
finding('addyston-linked-zoning-ordinance.pdf',24,'Business/industrial dimensions and setbacks',
'Retained page covers wall projections, sign area related to frontage, freestanding/pole signs, district exceptions and setbacks. This is a candidate reference; no dimensions are approved for a job.','15 - 801.3 Business'),
finding('addyston-linked-zoning-ordinance.pdf',25,'Illumination and sign application package',
'Retained page covers illumination, permit exceptions, drawings, construction details and a printed application fee. Current exemptions and fees remain unverified.','15 - 801.7 Permits'),
finding('addyston-linked-zoning-ordinance.pdf',39,'Illuminated-sign electrical permit candidate',
'The retained clause calls for separate electrical permits and fees for illuminated signs/billboards and prints an IBI-like name. Canonical provider identity, currentness, permit issuer and inspection responsibility remain unapproved. The nearby building-code exemption must not be treated as a zoning-sign exemption.','separate electrical permits and feesare')];
addyston.notes=addyston.notes.map(note=>note.startsWith('Separate electrical permit issuance')?'The retained ordinance now supplies an illuminated-sign electrical permit candidate on physical page 39. Currentness, canonical electrical-office identity, permit issuance and electrical inspection remain separately unresolved. Building-inspector contact alone does not establish electrical responsibility.':note);
const harrison=rows.find(r=>r.id==='69a7043e496af8043b9e4f00');
const previousOcrFindings=(harrison.document_findings||[]).filter(f=>f.observation_method);
harrison.document_findings=[
finding('harrison-zoning-application.pdf',1,'Zoning application: sign options and site plan',
'Retained application includes permanent/temporary sign choices, display dates and a scaled site plan. Confirm current portal/paper route before using this older printed form.','Permanent Sign'),
finding('harrison-commercial-application.pdf',1,'Commercial application: sign and illumination fields',
'Retained application asks about illumination and ground-sign status. This form is separate from electrical approval.','Type of illumination?')];
harrison.document_findings.push(...previousOcrFindings);
if(!harrison.ocr_references)harrison.extraction_note='Both byte-identical sign-instruction PDFs have two physical pages and no embedded text. OCR/visual transcription is still required; no searchable instruction text is claimed.';
const packet={findings:[...addyston.document_findings,...harrison.document_findings],harrison_instruction_gap:harrison.extraction_note,authority_approved:false,currentness_approved:false,numeric_rule_imports_created:0,live_records_changed:0};
writeFileSync(root+'sign-content-review-packet.json',JSON.stringify(packet,null,2)+'\n');
writeFileSync(path,JSON.stringify(rows,null,2)+'\n');
console.log('Six page-linked research findings; Harrison OCR gap explicit; no approved rules.');
