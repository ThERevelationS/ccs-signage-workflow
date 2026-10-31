import {CheckCircle2,AlertTriangle,MapPin,Loader2} from 'lucide-react';
export default function AddressSearchSummary({address,searching,result,advanced}){
 const located=result?.location_resolution?.status==='location_verified';
 const ready=located&&result?.apply_allowed===true&&Boolean(result?.suggested_locality?.id);
 const scans=result?.automatic_scan?.scans || [];
 const started=result?.automatic_scan?.started===true;
 const usableLink=item=>{try{const url=new URL(item?.url);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}};
 const links=scans.reduce((n,s)=>n+[...(s.documents || []),...(s.external_referrals || [])].filter(usableLink).length,0);
 const problems=scans.reduce((n,s)=>n+(s.gaps?.length || 0)+(s.error?1:0),0);
 const heading=searching?'Looking up your address':!result?'Type in the job address':ready?'All set — this town or township is ready':result.geocoding_service?.issue?'Our map tool had a problem':located?'Found the spot — an adult needs to check the offices':'We need a closer look at this address';
 const Icon=searching?Loader2:ready?CheckCircle2:result?AlertTriangle:MapPin;
 const steps=[
  ['Find the property on the map',searching?'Looking…':located?'Found it':result?'Not sure yet':'Waiting'],
  ['Check which town or township it is in',located?'Confirmed':searching?'Finding the spot first':result?'Not sure yet':'Waiting'],
  ['Check who handles sign permits there',ready?'Checked — the offices are verified':searching?'Checking if needed':started?(links?'Found some info — needs a review':'Could not find clear info'):result?'Needs a review':'Waiting'],
 ];
 return <section aria-live="polite" aria-label="Address search overview" className={'rounded-xl border p-4 space-y-3 '+(ready?'border-emerald-300 bg-emerald-50':result?'border-amber-300 bg-amber-50':'border-violet-200 bg-violet-50')}>
  <h3 className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden="true" className={'h-5 w-5 shrink-0 '+(searching?'animate-spin motion-reduce:animate-none':'')}/>{heading}</h3>
  {(result||searching)&&<p className="text-sm break-words">{result?.geocode?.display_name || address}</p>}
  <ol className="space-y-2 text-sm">{steps.map(([label,status],index)=><li key={label} className="flex items-start gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white text-xs font-semibold">{index+1}</span><div className="min-w-0"><span className="font-medium">{label}</span><p className="text-xs text-gray-600">{status}</p></div></li>)}</ol>
  <p role="status" className="text-sm">{searching?'Hang on — this can take a little bit.':!result?'Type the full street address and press Find my office.':ready?'Press Use this office at the bottom to finish.':result.geocoding_service?.issue?'The map lookup had trouble. You can still see the general area on the map, but nothing is picked yet.':located?'We found the town or township — you can still use it; its lines will be marked needs-a-check.':'Please do not pick the town just because the ZIP code matches — we need to confirm the exact spot first.'}</p>
  {advanced&&result&&started&&<p className="rounded-lg border bg-white/70 p-2 text-xs"><strong>What we found online:</strong> {links} useful links · {problems} things that still need checking. This does not pick the office for you.</p>}
  {advanced&&result&&!ready&&!started&&<p className="text-xs">More research tools are below if you want to dig deeper.</p>}
 </section>;
}
