import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fetchHtmlSnapshot} from '../base44/shared/permittingHtmlEvidence.mjs';
const sources=[["buildings-about","/buildings/about-buildings-inspections/"],["buildings-contact","/buildings/contact-us/"],["permit-center","/buildings/about-buildings-inspections/permit-center/"],["planning-about","/planning/about-city-planning/"],["planning-contact","/planning/about-city-planning/contact-us/"],["zoning-relocation","/planning/zoning-administration/relocation-of-zoning-division-to-the-city-planning-and-engagement-department/"],["sign-forms","/buildings/building-permit-forms-applications/application-forms/sign/"],["sign-handout","/buildings/building-permit-forms-applications/application-forms/all-forms-handouts-checklists-alphabetical-list/signs-informational-handout/","pdf"],["outdoor-advertising-application","/buildings/building-permit-forms-applications/application-forms/all-forms-handouts-checklists-alphabetical-list/outdoor-advertising-sign-application/","pdf"]];
const dir='docs/official-evidence/cincinnati-2026-10-05';await mkdir(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=[];
for(const [name,path,kind] of sources){
 const url='https://www.cincinnati-oh.gov'+path;
 if(kind!=='pdf'){
 const r=await fetchHtmlSnapshot({profile:{website_url:'https://www.cincinnati-oh.gov'},officialUrl:url});
 const bytes=Buffer.from(r.raw_html_base64,'base64'),raw=dir+'/'+name+'.html',text=dir+'/'+name+'.txt';
 await writeFile(raw,bytes,{flag:'wx'});await writeFile(text,r.text,{flag:'wx'});
 manifest.push({name,official_url:url,final_url:r.final_url,retrieved_at:r.retrieved_at,content_type:r.content_type,file_bytes:bytes.length,file_hash_sha256:hash(bytes),text_sha256:hash(r.text),archived_repo_path:raw,normalized_text_path:text});
 }else{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
 let current=url,response;
 for(let hop=0;hop<4;hop++){
 response=await fetch(current,{signal:controller.signal,redirect:'manual'});
 if([301,302,303,307,308].includes(response.status)){
 const next=new URL(response.headers.get('location'),current);if(next.protocol!=='https:'||next.hostname!=='www.cincinnati-oh.gov'||hop===3)throw Error('Unapproved redirect');current=next.href;continue;
 }break;}
 if(!response.ok||!response.headers.get('content-type')?.includes('application/pdf'))throw Error('Not official PDF');
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>2000000)throw Error('PDF over manual capture limit');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF signature');
 const retained=dir+'/'+name+'.pdf';await writeFile(retained,bytes,{flag:'wx'});
 manifest.push({name,official_url:url,final_url:current,retrieved_at:new Date().toISOString(),content_type:'application/pdf',file_bytes:bytes.length,file_hash_sha256:hash(bytes),archived_repo_path:retained,authority_status:'unreviewed',app_storage_archive_completed:false});
 }finally{clearTimeout(timer);}
 }
 console.log(name,manifest.at(-1).file_bytes);
}
await writeFile(dir+'/manifest.json',JSON.stringify({method:'bounded-manual-official-capture-v1',llm_calls:0,authority_verified:false,sources:manifest},null,2)+'\n',{flag:'wx'});
