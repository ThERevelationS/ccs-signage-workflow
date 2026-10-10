import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
const selections=[
 {name:'Sharonville',root:'docs/official-evidence/ohio-sharonville-2026-10-07',file:'building-zoning.html'},
 {name:'Symmes Township',root:'docs/official-evidence/ohio-harrison-symmes-townships-2026-10-07',file:'symmes-zoning.html'},
 {name:'Cincinnati',root:'docs/official-evidence/ohio-electrical-discovery-2026-10-06/publisher-review',file:'permit-center.html'}
];
const report={observed_on:'2026-10-10',method:'retained-official-page-replay',current_http_checked:false,
 production_records_changed:0,external_fetches:0,llm_calls:0,authority_established:false,pages:[]};
for(const selection of selections){
 const manifest=JSON.parse(readFileSync(selection.root+'/manifest.json','utf8'));
 const source=manifest.sources.find(s=>s.file===selection.file);
 const bytes=readFileSync(selection.root+'/'+selection.file);
 const hash=createHash('sha256').update(bytes).digest('hex');
 if(!source || source.status!=='archived' || hash!==source.sha256 || bytes.length!==source.bytes)
  throw Error('Retained source proof mismatch: '+selection.name);
 const url=source.final_url || source.official_url || source.source_url;
 const scan=await scanOfficialPermittingPages({seedUrl:url,maxPages:1,fetchPage:async target=>{
  if(target!==url)throw Error('Replay may read only its selected retained page.');
  return{html:bytes.toString('utf8'),finalUrl:url};
 }});
 report.pages.push({name:selection.name,source_page_url:url,retained_source_path:selection.root+'/'+selection.file,
  retained_source_sha256:hash,retained_source_bytes:bytes.length,original_retrieved_at:source.retrieved_at || source.observed_at,
  referral_count:scan.external_referrals.length,referrals:scan.external_referrals,
  pending_same_host_pages:scan.pending_pages.length,unresolved_gaps:scan.gaps.length,
  jurisdiction_coverage_complete:false});
}
writeFileSync('docs/permitting-external-referral-replay-2026-10-10.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.pages.map(p=>({name:p.name,external_referrals:p.referral_count}))));
