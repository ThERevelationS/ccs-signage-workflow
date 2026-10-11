function webUrl(value){
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function SourceLink({url,label}){
 const href=webUrl(url);
 return href?<a className="underline text-blue-700 break-all" href={href} target="_blank" rel="noopener noreferrer">{label || href}</a>:<span>{label || 'Invalid source link'} — link unavailable</span>;
}
const TYPE_LABELS={permit_application:'Application or form',fee_schedule:'Fees',checklist:'Checklist',sign_ordinance:'Sign rules',zoning_code:'Zoning or code',other:'Reference'};
const GAP_LABELS={page_fetch_failed:'Page could not be read',depth_frontier:'More pages need scanning',page_link_limit:'More links remain on this page',oversized_resource_url:'Link needs review'};
export default function AutomaticAddressScanResults({scanResult}){
 if(!scanResult?.started)return null;
 return <section className="rounded-lg border bg-white p-3 space-y-2" aria-label="Automatic address scan results">
  <h4 className="font-semibold text-sm">What we checked</h4>
  <p className="text-xs text-gray-700">These are source links, not saved documents or approved permitting instructions. An administrator must review them.</p>
  {(scanResult.scans || []).map((scan,index)=><details key={index} className="border rounded p-2">
   <summary className="min-h-11 text-sm cursor-pointer">{scan.target?.name || 'Address research'}: {scan.documents?.length || 0} source links; {scan.external_referrals?.length || 0} outside links</summary>
   {scan.error&&<p className="text-xs text-amber-800">{scan.error}</p>}
   <div className="space-y-3 text-xs">
    {!!scan.documents?.length&&<div><h5 className="font-semibold">Forms, rules and reference links</h5><ul className="space-y-2 mt-2">{scan.documents.map((doc,i)=><li key={i}><SourceLink url={doc.url} label={doc.title}/><p>{TYPE_LABELS[doc.doc_type] || 'Reference'} — not downloaded or saved</p>{doc.discovery_page_url&&<p>Found on: <SourceLink url={doc.discovery_page_url}/></p>}</li>)}</ul></div>}
    {!!scan.external_referrals?.length&&<div><h5 className="font-semibold">Outside application sites and sources</h5><p>Linked by the source website. These destinations have not been scanned or approved.</p><ul className="space-y-2 mt-2">{scan.external_referrals.map((ref,i)=><li key={i}><SourceLink url={ref.url} label={ref.title}/>{ref.source_page_url&&<p>Found on: <SourceLink url={ref.source_page_url}/></p>}</li>)}</ul></div>}
    {!!scan.pages?.length&&<details><summary className="min-h-11 cursor-pointer">Pages checked ({scan.pages.length})</summary><ul className="space-y-2">{scan.pages.map((page,i)=><li key={i}><SourceLink url={page.final_url || page.url}/><p>{page.status==='failed'?'Could not read this page':page.status==='classified_pdf'?'PDF signature checked; full download still needed':page.status==='redirect_duplicate'?'Redirected to a page already checked':'Page scanned'}{page.error?': '+page.error:''}</p></li>)}</ul></details>}
    {!!scan.pending_pages?.length&&<details><summary className="min-h-11 cursor-pointer">Pages still waiting ({scan.pending_pages.length})</summary><ul className="space-y-2">{scan.pending_pages.map((page,i)=><li key={i}><SourceLink url={page.url}/></li>)}</ul></details>}
    {!!scan.gaps?.length&&<details><summary className="min-h-11 cursor-pointer">Problems to review ({scan.gaps.length})</summary><ul className="space-y-2">{scan.gaps.map((gap,i)=><li key={i}><SourceLink url={gap.url}/><p>{GAP_LABELS[gap.reason] || gap.reason || 'Needs review'}{gap.detail?': '+gap.detail:''}</p></li>)}</ul></details>}
    <p className="text-amber-800">This first scan does not establish complete coverage. Findings need administrator review.</p>
   </div>
  </details>)}
 </section>;
}
