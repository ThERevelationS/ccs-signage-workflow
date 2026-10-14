import {CheckCircle2,AlertTriangle,MapPin,Loader2} from 'lucide-react';
export default function AddressSearchSummary({address,searching,result}){
 const located=result?.location_resolution?.status==='location_verified';
 const ready=located&&result?.apply_allowed===true&&Boolean(result?.suggested_locality?.id);
 const scans=result?.automatic_scan?.scans || [];
 const started=result?.automatic_scan?.started===true;
 const usableLink=item=>{try{const url=new URL(item?.url);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}};
 const links=scans.reduce((n,s)=>n+[...(s.documents || []),...(s.external_referrals || [])].filter(usableLink).length,0);
 const problems=scans.reduce((n,s)=>n+(s.gaps?.length || 0)+(s.error?1:0),0);
 const heading=searching?'Checking your address':!result?'Start with the property address':ready?'Ready to use this jurisdiction':result.geocoding_service?.issue?'Map lookup needs attention':located?'Location confirmed · offices need review':'Property location needs review';
 const Icon=searching?Loader2:ready?CheckCircle2:result?AlertTriangle:MapPin;
 const steps=[
  ['Find the property',searching?'Checking':located?'Confirmed':result?'Needs review':'Waiting'],
  ['Check the jurisdiction',located?'Boundary confirmed':searching?'Waiting for location':result?'Unconfirmed':'Waiting'],
  ['Find permitting information',ready?'Sign and zoning offices reviewed':searching?'Research starts if needed':started?(links?'Sources found · review needed':'No usable source found'):result?'Review needed':'Waiting'],
 ];
 return <section aria-label="Address search overview" className={'rounded-xl border p-4 space-y-3 '+(ready?'border-emerald-300 bg-emerald-50':result?'border-amber-300 bg-amber-50':'border-violet-200 bg-violet-50')}>
  <h3 className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden="true" className={'h-5 w-5 shrink-0 '+(searching?'animate-spin':'')}/>{heading}</h3>
  {(result||searching)&&<p className="text-sm break-words">{result?.geocode?.display_name || address}</p>}
  <ol className="space-y-2 text-sm">{steps.map(([label,status],index)=><li key={label} className="flex items-start gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white text-xs font-semibold">{index+1}</span><div className="min-w-0"><span className="font-medium">{label}</span><p className="text-xs text-gray-600">{status}</p></div></li>)}</ol>
  <p role="status" className="text-sm">{searching?'Keep this window open. Progress and sources appear below.':!result?'Enter a full street address and select Find my jurisdiction. If saved information is missing, research starts automatically.':ready?'Select Use this jurisdiction below to continue.':result.geocoding_service?.issue?'The address service needs administrator attention. You can open an unconfirmed map preview; no jurisdiction has been approved.':located?'An administrator must review the sign and zoning offices before this jurisdiction can be used.':'Do not choose a jurisdiction by postal city. An administrator must confirm the property location.'}</p>
  {result&&started&&<p className="rounded-lg border bg-white/70 p-2 text-xs"><strong>Automatic research:</strong> {links} usable source links · {problems} items needing review. Open What we checked below for sources and saved originals. Research does not approve a jurisdiction.</p>}
  {result&&!ready&&!started&&<p className="text-xs">Automatic research was not returned for this lookup. Check the scan activity before retrying.</p>}
 </section>;
}
