import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fetchHtmlSnapshot} from '../base44/shared/permittingHtmlEvidence.mjs';
const dir='docs/official-evidence/cincinnati-currentness-2026-10-05';
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(dir,{recursive:true});
const manifest={llm_calls:0,authority_approved:false,sources:[]};
for(const [name,url] of [['sign-forms','https://www.cincinnati-oh.gov/buildings/building-permit-forms-applications/application-forms/sign/'],['outdoor-sign-forms','https://www.cincinnati-oh.gov/buildings/building-permit-forms-applications/application-forms/outdoor-advertising-sign/'],['zoning-administration','https://www.cincinnati-oh.gov/planning/zoning-administration/']]){
 const r=await fetchHtmlSnapshot({profile:{website_url:'https://www.cincinnati-oh.gov'},officialUrl:url});
 const bytes=Buffer.from(r.raw_html_base64,'base64');
 await writeFile(dir+'/'+name+'.html',bytes,{flag:'wx'});await writeFile(dir+'/'+name+'.txt',r.text,{flag:'wx'});
 manifest.sources.push({name,official_url:url,final_url:r.final_url,retrieved_at:r.retrieved_at,file_bytes:bytes.length,file_hash_sha256:hash(bytes),text_sha256:hash(r.text),raw_path:dir+'/'+name+'.html',text_path:dir+'/'+name+'.txt'});
 console.log(name,bytes.length);console.log(r.text.slice(-16000));
}
await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
