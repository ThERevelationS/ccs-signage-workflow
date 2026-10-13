import {useState} from 'react';
import {summarizeSavedSelectorSources} from './selectorSavedSourceEvidence.mjs';

export default function SelectorSavedSourceReview({profile}){
  const [limit,setLimit]=useState(10);
  const sources=summarizeSavedSelectorSources(profile);
  return <details aria-label={'Saved source links for '+(profile?.name||'jurisdiction')} className="rounded border p-2 text-xs">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Review saved source links ({sources.length})</summary>
    <p>Saved on profile ID {profile?.id||'unknown'}. Research links do not verify electrical issuers, inspectors, local authority, or current adopted code. Check exact office IDs, geography and county overlays with official sources.</p>
    {!sources.length&&<p>No saved links. Inspect Scan activity and request official permit/inspection materials; do not guess an office.</p>}
    <ul className="space-y-2">{sources.slice(0,limit).map(source=><li key={source.key} className="rounded border p-2">
      <p className="font-semibold break-words">{source.title}</p>
      <p>{source.category} · {source.provenance}{source.protected?' · Protected/manual evidence — preserve':''}</p>
      <div className="flex flex-wrap gap-3">
        {source.source_url&&<a className="inline-flex min-h-11 items-center underline break-all" href={source.source_url} target="_blank" rel="noopener noreferrer">Open recorded source link</a>}
        {source.referral_url&&<a className="inline-flex min-h-11 items-center underline break-all" href={source.referral_url} target="_blank" rel="noopener noreferrer">Open discovery page</a>}
        {source.stored_url&&<a className="inline-flex min-h-11 items-center underline break-all" href={source.stored_url} target="_blank" rel="noopener noreferrer">Open fingerprint-matched retained PDF</a>}
      </div>
      {!source.source_url&&<p>A usable original URL is not recorded; request source review.</p>}
      {source.archive_status==='archive_not_verified'&&<p>A stored file exists but its PDF fingerprint has not been verified; keep it for staff review.</p>}
      {source.archive_status==='archive_not_recorded'&&<p>No verified PDF archive recorded. Retain HTML forms and portals as links.</p>}
      {source.archive_status==='verified_pdf_fingerprint'&&<p>Stored PDF fingerprint matches. Legal authority and applicability are not confirmed.</p>}
    </li>)}</ul>
    {sources.length>limit&&<button type="button" className="min-h-11 underline" onClick={()=>setLimit(n=>n+10)}>Show next saved links ({sources.length-limit} remaining)</button>}
    <p>Review permit issuance and inspection evidence separately. No link or filename automatically approves the responsible office.</p>
  </details>;
}
