import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const directory = 'public/permitting/sources/kenton-ky';
const manifestPath = 'docs/permitting-kenton-ky-primary-sources-2026-09-26.json';
const dataPath = 'docs/permitting-kenton-ky-research-import-2026-09-26.json';
const pdfSources = [
  {
    filename: 'commercial-joint-zoning-building-application.pdf',
    url: 'https://www.pdskc.org/Portals/pdskc/Documents/applications_forms/AdditionalForms/Commercial_Joint_Application_Fillable.pdf',
    type: 'permit_application',
    title: 'PDS commercial joint zoning/building permit application — includes new signs and sign face changes',
    caveat: 'County-hosted legacy form; confirm PDS still accepts it. The live online submission portal is preferred.',
  },
  {
    filename: 'commercial-permit-checklist-2024.pdf',
    url: 'https://cdn.pdskc.org/Documents/applications_forms/checklists/Checklist_Comm%20Project.pdf?ver=2024-10-10-141613-683',
    type: 'checklist',
    title: 'PDS commercial building/zoning application checklist — October 2024',
    caveat: 'General commercial construction checklist, not a sign-specific checklist. Confirm applicability to each sign installation.',
  },
];
const ordinanceSource = {
  filename: 'adopted-unincorporated-kenton-article-xiv.html',
  url: 'https://online.encodeplus.com/regs/kentoncounty-ky/doc-view.aspx?secid=480&ajax=0',
  type: 'sign_ordinance',
  title: 'Unincorporated Kenton County zoning ordinance — Article XIV Sign Regulations',
  caveat: 'Applies to the unincorporated county. Separate city ordinances may govern properties inside incorporated municipalities.',
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function retrieve(source) {
  const response = await fetch(source.url, {signal:AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error(source.filename+' returned HTTP '+response.status);
  const finalUrl = new URL(response.url);
  if (!['pdskc.org','www.pdskc.org','cdn.pdskc.org','online.encodeplus.com'].includes(finalUrl.hostname))
    throw new Error(source.filename+' redirected to an unexpected host');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1800 || bytes.length > 25*1024*1024) throw new Error(source.filename+' unsafe size '+bytes.length);
  if (source.filename.endsWith('.pdf')) {
    if (bytes.subarray(0,5).toString() !== '%PDF-') throw new Error(source.filename+' was not a PDF');
  } else {
    const html = bytes.toString('utf8');
    if (!html.includes('ARTICLE XIV SIGN REGULATIONS') || !html.includes('SECTION 14.1'))
      throw new Error('Unexpected or empty official unincorporated sign ordinance');
  }
  await writeFile(directory+'/'+source.filename,bytes,{flag:'wx'});
  return {...source, bytes:bytes.length, sha256:sha256(bytes),
    repositoryPath:directory+'/'+source.filename, savedAt:new Date().toISOString()};
}
function decodeHtml(value){
  const named = {'nbsp':' ','amp':'&','lt':'<','gt':'>','quot':'"','apos':"'",'ndash':'–','mdash':'—','rsquo':"'",'ldquo':'"','rdquo':'"'};
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi,(_,entity)=>{
    if (entity.startsWith('#')){const numeric=entity[1]?.toLowerCase()==='x'
      ? parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
      return numeric>0&&numeric<=0x10ffff?String.fromCodePoint(numeric):' ';}
    return named[entity.toLowerCase()]??' ';
  });
}
async function extractPdf(source){
  const bytes = await readFile(source.repositoryPath);
  if(sha256(bytes)!==source.sha256)throw Error('PDF archive changed before extraction: '+source.filename);
  const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false});
  const pdf=await task.promise;
  const pages=[];
  for(let index=1;index<=pdf.numPages;index++){
    const content=await(await pdf.getPage(index)).getTextContent();
    pages.push('Page '+index+'\n'+content.items.map(item=>item.str||'').join(' ').replace(/\s+/g,' ').trim());
  }
  const extracted_text=pages.join('\n\n');
  await task.destroy();
  if(extracted_text.length<350)throw Error('PDF needs separate OCR or manual review: '+source.filename);
  if(source.filename.includes('joint')&&!/sign/i.test(extracted_text))
    throw Error('Joint application did not mention sign activity');
  return {pageCount:pages.length,extracted_text,characters:extracted_text.length};
}
function extractOrdinance(source,bytes){
  const html=bytes.toString('utf8');
  const start=html.indexOf('id="thePage"');
  if(start<0)throw Error('Official Article XIV content not found');
  let main=html.slice(start);
  const first=main.indexOf('<section');
  const last=main.lastIndexOf('</section>');
  if(first<0||last<first)throw Error('Official sign sections missing');
  main=main.slice(first,last+'</section>'.length)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/[ \t\r\f]+/g,' ')
    .replace(/\n[ \t]*/g,'\n');
  const extracted_text=decodeHtml(main).replace(/\s+/g,' ').trim();
  if(extracted_text.length<4000 || !extracted_text.includes('SECTION 14.1') || !extracted_text.includes('SIGN REGULATIONS'))
    throw Error('Insufficient sign ordinance extracted text');
  return {extracted_text,characters:extracted_text.length};
}
await mkdir(directory,{recursive:true});
const archived=[];
for (const source of [...pdfSources,ordinanceSource]) {
  if ((await import('node:fs')).existsSync(directory+'/'+source.filename)) throw Error('Source already archived; inspect before re-downloading');
  archived.push(await retrieve(source));
}
const enriched=[];
for(const source of archived){
  const bytes=await readFile(source.repositoryPath);
  if(sha256(bytes)!==source.sha256)throw Error('Saved checksum mismatch: '+source.filename);
  enriched.push({...source,...(source.filename.endsWith('.pdf')?await extractPdf(source):extractOrdinance(source,bytes))});
  console.log('ARCHIVED',source.filename,source.bytes,source.sha256.slice(0,14),'text chars',enriched.at(-1).characters);
}
const timestamp=new Date().toISOString();
await writeFile(manifestPath,JSON.stringify({jurisdiction:'Unincorporated Kenton County',state:'KY',savedAt:timestamp,sources:archived.map(({filename,url,type,title,caveat,bytes,sha256,repositoryPath,savedAt})=>({filename,url,type,title,caveat,bytes,sha256,repositoryPath,savedAt})),
  portal:'https://pdskc.govbuilt.com/',formLibrary:'https://pdskc.govbuilt.com/downloadable-forms',
  provider:'Planning and Development Services of Kenton County',status:'source repository archive only — not Base44 live File Storage'},null,2)+'\n',{flag:'wx'});
await writeFile(dataPath,JSON.stringify({jurisdiction:'Unincorporated Kenton County',state:'KY',savedAt:timestamp,
  sources:enriched.map(({filename,url,type,title,caveat,bytes,sha256,repositoryPath,characters,pageCount,extracted_text})=>({filename,url,type,title,caveat,bytes,sha256,repositoryPath,characters,pageCount,extracted_text}))},null,2)+'\n',{flag:'wx'});
console.log('PASS: 2 actual PDF forms and 1 adopted ordinance HTML archived, hashed and indexed; no published changes or File Storage upload claimed');
