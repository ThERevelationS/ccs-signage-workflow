import {useState} from 'react';
import {summarizeSavedSelectorSources} from './selectorSavedSourceEvidence.mjs';
import {summarizeSelectorElectricalOfficeHandoff} from './selectorElectricalOfficeHandoff.mjs';
import SelectorSourceOfficeReviewLookup from './SelectorSourceOfficeReviewLookup';

export default function SelectorSavedSourceReview({profile,locality}){
  const [limit,setLimit]=useState(10);
  const sources=summarizeSavedSelectorSources(profile);
  const handoff=summarizeSelectorElectricalOfficeHandoff(profile,locality);
  return <details aria-label={'Saved source links for '+(profile?.name||'jurisdiction')} className="rounded border p-2 text-xs">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Review saved source links ({sources.length})</summary>
    <p>Saved on profile ID {profile?.id||'unknown'}. Research links do not verify electrical issuers, inspectors, local authority, or current adopted code. Check exact office IDs, geography and county overlays with official sources.</p>
    {!sources.length&&<p>No saved links. Inspect Scan activity and request official permit/inspection materials; do not guess an office.</p>}
    <ul className="space-y-2">{sources.slice(0,limit).map((source,index)=><li key={source.key} className="rounded border p-2">
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
      <SelectorSourceOfficeReviewLookup key={source.key+':'+profile?.id} profile={profile} document={profile?.documents?.[index]}/>
    </li>)}</ul>
    {sources.length>limit&&<button type="button" className="min-h-11 underline" onClick={()=>setLimit(n=>n+10)}>Show next saved links ({sources.length-limit} remaining)</button>}
    <section aria-label="Electrical office source-to-review checklist" className="mt-3 space-y-2 rounded border border-amber-200 bg-amber-50 p-2">
      <p className="font-semibold">Next: reconcile the saved electrical office roles</p>
      <p>{handoff.notice}</p>
      {handoff.legacy_broad_role_present&&<p>A legacy broad electrical role is recorded; it does not establish a permit issuer or inspection provider.</p>}
      <dl className="space-y-2">{handoff.roles.map(item=><div key={item.role} className="border-t border-amber-200 pt-2">
        <dt className="font-semibold">{item.label}</dt>
        <dd>
          {item.status==='not_assessed'&&'No exact profile link for this comparison. Ask staff to verify the locality link first.'}
          {item.status==='not_recorded'&&'No specific office assigned this role in the saved locality. Find explicit official role and service-area evidence; do not guess.'}
          {item.status==='needs_staff_review'&&'One office is configured, but its role has not been staff reviewed. Check official responsibilities and service area.'}
          {item.status==='staff_review_reference'&&'One saved office is marked staff reviewed; fresh official authority and site applicability are still unverified.'}
          {item.status==='office_identity_conflict'&&'The office has a missing or duplicated saved office ID. Repair identity before assigning responsibility.'}
          {item.status==='multiple_saved_offices'&&'Multiple saved offices carry this role. Each office and geographic service area needs separate review; no single office was chosen.'}
        </dd>
        {!!item.offices.length&&<dd><ul className="mt-1 space-y-2">
          {item.offices.map((office,i)=><li key={office.id+'-'+i} className="border-l-2 border-amber-300 pl-2">
            <strong>{office.name}</strong> — saved office ID: {office.id||'not recorded'}; canonical government office ID: {office.canonical_id||'not recorded'}.
            <p>Local role flag: {office.recorded_review==='staff_reviewed'?'staff reviewed (historical tracker flag)':'requires review'}; {office.has_review_notes?'notes recorded':'no supporting review notes'}; {office.has_reviewer?'reviewer and date recorded':'reviewer/date missing'}.</p>
            {office.website&&<a className="inline-flex min-h-11 items-center underline break-all" href={office.website} target="_blank" rel="noopener noreferrer">Open configured office website (reference only)</a>}
          </li>)}
        </ul></dd>}
      </div>)}</dl>
      <p>Compare official sources above against each specific role. Use the existing locality office editor for staff review; a website rescan or document link cannot approve an office or match a job address.</p>
    </section>
    <p>Review permit issuance and inspection evidence separately. No link or filename automatically approves the responsible office.</p>
  </details>;
}
