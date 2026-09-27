import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const out = 'public/permitting/sources/kenton-ky';
const manifestPath = 'docs/permitting-kenton-ky-fee-schedules-manifest-2026-09-26.json';
const extractedPath = 'docs/permitting-kenton-ky-fee-schedules-text-2026-09-26.json';
const sources = [
  { filename: 'pds-commercial-building-fees-fy26-2025.pdf',
    url: 'https://pdskc.govbuilt.com/media/Downloadable%20Forms/Fees/Building%20-%20HVAC/FY26%20-%20Commercial%20Building%20Fees.pdf',
    title: 'PDS FY26 Commercial Building Permit Fee Schedule — Effective July 1, 2025',
    classification: 'historical_effective_2025_07_01',
    note: 'Published PDS commercial schedule includes a sign line item and electrical permit fees; do not treat as current FY27 fees until PDS confirms.' },
  { filename: 'pds-zoning-fees-fy24-2023.pdf',
    url: 'https://www.pdskc.org/Portals/pdskc/Documents/OSS/FY24-Zoning-BOA%20Fees.pdf?ver=2023-06-30-115238-603',
    title: 'PDS FY24 Zoning and Board of Adjustment Fees — Effective July 1, 2023',
    classification: 'historical_effective_2023_07_01',
    note: 'Archived historical zoning fee schedule with sign line item. Not evidence of current 2026-27 sign zoning fees.' },
];
if(existsSync(manifestPath)||existsSync(extractedPath))throw Error('Kenton fee archive exists; inspect before overwriting');
await mkdir(out,{recursive:true});
const files=[];
for(const s of sources){
 const path=out+'/'+s.filename;
 if(existsSync(path))throw Error('Target original PDF already exists: '+path);
 const response=await fetch(s.url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(s.filename+' fetch failed HTTP '+response.status);
 const finalUrl=new URL(response.url);
 if(!['pdskc.govbuilt.com','www.pdskc.org','cdn.pdskc.org'].includes(finalUrl.hostname))
   throw Error('Official fee source redirected outside approved PDS hosts: '+finalUrl.hostname);
 const raw=Buffer.from(await response.arrayBuffer());
 if(raw.length<3000||raw.length>10*1024*1024||raw.subarray(0,5).toString()!=='%PDF-')
   throw Error('Source is not an expected nonempty PDF: '+s.filename);
 const task=getDocument({data:new Uint8Array(raw),useSystemFonts:true,isEvalSupported:false});
 const pdf=await task.promise, pages=[];
 for(let i=1;i<=pdf.numPages;i++){
   const content=await(await pdf.getPage(i)).getTextContent();
   const pageText=content.items.map(item=>item.str||'').join(' ').replace(/\s+/g,' ').trim();
   pages.push('Page '+i+'\n'+pageText);
 }
 await task.destroy();
 const text=pages.join('\n\n');
 if(!/sign/i.test(text)||!/fee/i.test(text)||text.length<1500)throw Error('Expected sign fee table not found: '+s.filename);
 const sha256=createHash('sha256').update(raw).digest('hex');
 await writeFile(path,raw,{flag:'wx'});
 const saved=await readFile(path);
 if(saved.length!==raw.length||createHash('sha256').update(saved).digest('hex')!==sha256)throw Error('Downloaded fee PDF failed stored SHA-256: '+s.filename);
 files.push({...s,url:s.url,repositoryPath:path,bytes:saved.length,sha256,pages:pdf.numPages,extractedChars:text.length,extracted_text:text});
 console.log('ARCHIVED',s.filename,saved.length+' bytes',pdf.numPages+' pages',text.length+' chars',sha256);
}
const checkedAt=new Date().toISOString();
await writeFile(manifestPath,JSON.stringify({
 jurisdictionId:'6ab882b012e05020a1202318',jurisdiction:'Unincorporated Kenton County',
 provider:'Planning and Development Services of Kenton County',checkedAt,
 currentFeeVerification:'OUTSTANDING: PDS FY27 zoning and building schedules must be confirmed. These downloaded fee PDFs are historical.',
 files:files.map(({extracted_text,...m})=>m)
},null,2)+'\n',{flag:'wx'});
await writeFile(extractedPath,JSON.stringify({
 jurisdictionId:'6ab882b012e05020a1202318',checkedAt,
 files:files.map(({filename,sha256,extracted_text,extractedChars,pages})=>({filename,sha256,extracted_text,extractedChars,pages}))
},null,2)+'\n',{flag:'wx'});
console.log('PASS: two genuine PDS PDFs downloaded into source repo and hash-verified; current FY27 fees explicitly unverified');
