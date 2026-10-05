import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fetchHtmlSnapshot} from '../base44/shared/permittingHtmlEvidence.mjs';
const dir='docs/official-evidence/cincinnati-submission-2026-10-05';await mkdir(dir,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const root='https://www.cincinnati-oh.gov/buildings/building-permit-forms-applications/';
const sources=[['submission-guidance',root+'permit-guide/submit-permit-application-other-required-documents/','html'],['building-application',root+'application-forms/all-forms-handouts-checklists-alphabetical-list/building-permit-application-fillable-form/','pdf'],['site-plan',root+'application-forms/all-forms-handouts-checklists-alphabetical-list/site-plan-information/','pdf']];
const manifest={llm_calls:0,authority_approved:false,sources:[]};
for(const [name,url,kind] of sources){
 if(kind==='html'){
 const r=await fetchHtmlSnapshot({profile:{website_url:'https://www.cincinnati-oh.gov'},officialUrl:url});const bytes=Buffer.from(r.raw_html_base64,'base64');
 await writeFile(dir+'/'+name+'.html',bytes,{flag:'wx'});await writeFile(dir+'/'+name+'.txt',r.text,{flag:'wx'});
 manifest.sources.push({name,url,final_url:r.final_url,retrieved_at:r.retrieved_at,file_bytes:bytes.length,sha256:sha(bytes),path:dir+'/'+name+'.html',text_path:dir+'/'+name+'.txt',text_sha256:sha(r.text),kind});
 console.log(r.text);
 }else{
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{let current=url,response;for(let hop=0;hop<4;hop++){response=await fetch(current,{signal:ctl.signal,redirect:'manual'});if([301,302,303,307,308].includes(response.status)){const next=new URL(response.headers.get('location'),current);if(next.protocol!=='https:'||next.hostname!=='www.cincinnati-oh.gov'||hop===3)throw Error('Unapproved redirect');current=next.href;continue;}break;}
 if(!response.ok||!response.headers.get('content-type')?.includes('application/pdf'))throw Error('Expected official PDF');const chunks=[];let length=0;for await(const c of response.body){length+=c.length;if(length>2000000)throw Error('PDF over capture bound');chunks.push(c);}const bytes=Buffer.concat(chunks);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF');await writeFile(dir+'/'+name+'.pdf',bytes,{flag:'wx'});manifest.sources.push({name,url,final_url:current,retrieved_at:new Date().toISOString(),file_bytes:bytes.length,sha256:sha(bytes),path:dir+'/'+name+'.pdf',kind});console.log(name,bytes.length,sha(bytes));
 }finally{clearTimeout(timer);}
 }
}
await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
