import {textSha256,PDF_TEXT_METHOD,assembledSourceText} from '../base44/shared/jurisdictionSourcePdfText.mjs';
const clone=value=>structuredClone(value);
export async function ruleFixture({source={},createRun='ok',createRule='ok',failLlm=false}={}) {
 const text='3401. Sign permits are required before installation. Maximum area is 50 square feet. Submit two drawings with the application.';
 const hash='a'.repeat(64),page={page:1,text,source_document_id:'source',source_sha256:hash,
  text_sha256:await textSha256(new TextEncoder().encode(text)),method:PDF_TEXT_METHOD,truncated:false,needs_ocr_review:false};
 let time=Date.parse('2026-10-04T17:00:00Z'),version=1;
 let row={id:'source',jurisdiction_id:'profile',jurisdiction_name:'Pilot',title:'Pilot code',issuing_office:'Planning',
  official_url:'https://gov.test/code.pdf',archived_file_url:'https://storage.test/code.pdf',file_hash_sha256:hash,file_bytes:100,
  authority_classification:'current_adopted',content_status:'current',verification_status:'verified',updated_date:'source1',
  extracted_pages:[page],text_extraction_state:{method:PDF_TEXT_METHOD,status:'complete',source_sha256:hash,
  archived_file_url:'https://storage.test/code.pdf',pages_extracted:1,next_page:2,total_pages:1,complete_document_text:true},...source};
 row.extracted_text=assembledSourceText(row,row.extracted_pages);
 const runs=[],rules=[],calls={llm:0,runCreates:0,ruleCreates:0,sourceWrites:0,runWrites:0,ruleWrites:0};
 let runIntent,ruleIntent,sourceLost=false,runLost=false;
 const sourceEntity={get:async()=>clone(row),updateMany:async(q,p)=>{
  if(q.updated_date!==row.updated_date)return{updated:0};row={...row,...p.$set,updated_date:'source'+(++version)};calls.sourceWrites++;
  if(sourceLost){sourceLost=false;throw Error('lost source acknowledgement');}return{updated:1};}};
 function repository(rows,name) {
  return {get:async id=>{const r=rows.find(x=>x.id===id);if(!r)throw Error('Not found');return clone(r);},
   filter:async(q,sort,limit,skip=0)=>{if(typeof sort!=='string' || !Number.isInteger(limit)||!Number.isInteger(skip))throw Error('Wrong SDK filter signature');
     const result=rows.filter(r=>Object.entries(q).every(([k,v])=>r[k]===v));return clone(result.slice(skip,skip+limit));},
   updateMany:async(q,p)=>{const r=rows.find(x=>x.id===q.id);if(!r || r.updated_date!==q.updated_date || (q.version && r.version!==q.version))return{updated:0};
    Object.assign(r,clone(p.$set),{updated_date:name+(++version)});calls[name+'Writes']++;
    if(name==='run' && runLost){runLost=false;throw Error('lost run acknowledgement');}return{updated:1};},
   create:async data=>{calls[name+'Creates']++;if(name==='run')runIntent=clone(data);else ruleIntent=clone(data);
    const mode=name==='run'?createRun:createRule;if(mode==='missing')throw Error('unknown create');
    const r={...clone(data),id:name+(rows.length+1),updated_date:name+(++version)};rows.push(r);
    if(mode==='lost')throw Error('lost create acknowledgement');return clone(r);
   }};
 }
 const raw={physical_page:1,rule_category:'dimensional',excerpt:'Maximum area is 50 square feet.',
  requirement:'Maximum area is 50 square feet.',numeric_literal:'50 square feet',confidence:'high',section_reference:'3401.'};
 const api={sourceEntity,segmentEntity:{filter:async()=>{throw Error('Unexpected segment scan');}},
  runEntity:repository(runs,'run'),ruleEntity:repository(rules,'rule'),sourceDocumentId:'source',startPage:1,pageCount:1,
  requestId:'manual-request-00000001',requestedBy:'admin@example.test',now:()=>time,normalizeSignType:()=>null,
  invokeLlm:async()=>{calls.llm++;if(failLlm)throw Error('known LLM failure');return{rules:[clone(raw)]};}};
 return {api,raw,page,text,runs,rules,calls,source:()=>row,advance:()=>{time+=4*60*60_000;},
  patchSource:p=>{row={...row,...clone(p),updated_date:'source'+(++version)};},
  lateRun:()=>runs.push({...clone(runIntent),id:'lateRun',updated_date:'run'+(++version)}),
  lateRule:()=>rules.push({...clone(ruleIntent),id:'lateRule',updated_date:'rule'+(++version)}),
  loseSource:()=>{sourceLost=true;},loseRun:()=>{runLost=true;}};
}
