import {useState} from 'react';
import {summarizeSavedSelectorSources} from './selectorSavedSourceEvidence.mjs';
import {summarizeSelectorElectricalOfficeHandoff} from './selectorElectricalOfficeHandoff.mjs';
import SelectorSourceOfficeReviewLookup from './SelectorSourceOfficeReviewLookup';

export default function SelectorSavedSourceReview({profile,locality}){
  const [limit,setLimit]=useState(10);
  const sources=summarizeSavedSelectorSources(profile);
  const handoff=summarizeSelectorElectricalOfficeHandoff(profile,locality);
  return <details aria-label={'Saved source links for '+(profile?.name||'this office')} className="rounded border p-2 text-xs">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Saved source links ({sources.length})</summary>
    <p>Saved on profile {typeof profile?.id==='string'&&profile.id.trim()?profile.id:'unknown'}. Research links don't prove who issues, who inspects, or what the current rules are. Check the office's own pages for its exact identity and coverage.</p>
    {!sources.length&&<p>No saved links. Check Scan activity and ask the office for its real permit/inspection info — don't guess.</p>}
    <ul className="space-y-2">{sources.slice(0,limit).map((source,index)=><li key={source.key} className="rounded border p-2">
      <p className="font-semibold break-words">{source.title}</p>
      <p>{source.category} · {source.provenance}{source.protected?' · Hand-saved proof — keep it':''}</p>
      <div className="flex flex-wrap gap-3">
        {source.source_url&&<a className="inline-flex min-h-11 items-center underline break-all" href={source.source_url} target="_blank" rel="noopener noreferrer">Open the saved link</a>}
        {source.referral_url&&<a className="inline-flex min-h-11 items-center underline break-all" href={source.referral_url} target="_blank" rel="noopener noreferrer">Open where it was found</a>}
        {source.stored_url&&<a className="inline-flex min-h-11 items-center underline break-all" href={source.stored_url} target="_blank" rel="noopener noreferrer">Open the matching saved PDF</a>}
      </div>
      {!source.source_url&&<p>No usable link saved — ask for a source check.</p>}
      {source.archive_status==='archive_not_verified'&&<p>A file is saved but its PDF fingerprint isn't verified — keep it for a staff check.</p>}
      {source.archive_status==='archive_not_recorded'&&<p>No verified PDF saved. Keep forms and portals as links.</p>}
      {source.archive_status==='verified_pdf_fingerprint'&&<p>The saved PDF's fingerprint matches — that doesn't confirm it's official or applies.</p>}
      <SelectorSourceOfficeReviewLookup key={source.key+':'+profile?.id} profile={profile} document={profile?.documents?.[index]}/>
    </li>)}</ul>
    {sources.length>limit&&<button type="button" className="min-h-11 underline" onClick={()=>setLimit(n=>n+10)}>Show more saved links ({sources.length-limit} left)</button>}
    <section aria-label="Electrical office checklist" className="mt-3 space-y-2 rounded border border-amber-200 bg-amber-50 p-2">
      <p className="font-semibold">Next: sort out the saved electrical offices</p>
      <p>{handoff.notice}</p>
      {handoff.legacy_broad_role_present&&<p>An old generic electrical role is saved — it doesn't settle who issues the permit or inspects.</p>}
      <dl className="space-y-2">{handoff.roles.map(item=><div key={item.role} className="border-t border-amber-200 pt-2">
        <dt className="font-semibold">{item.label}</dt>
        <dd>
          {item.status==='not_assessed'&&'No profile link to compare — check the town link first.'}
          {item.status==='not_recorded'&&'No office is saved for this job. Find the office\'s own page proving it — don\'t guess.'}
          {item.status==='needs_staff_review'&&'One office is saved but not checked — verify what it covers.'}
          {item.status==='staff_review_reference'&&'One saved office was checked before — but whether it\'s still official and covers this address is unverified.'}
          {item.status==='office_identity_conflict'&&'The office\'s saved ID is missing, broken, or doubled — fix that before assigning it.'}
          {item.status==='canonical_identity_conflict'&&'The official office ID is missing or broken — sort out which office it really is first.'}
          {item.status==='multiple_saved_offices'&&'More than one saved office claims this job. Check each one and its coverage separately — none was picked.'}
        </dd>
        {!!item.offices.length&&<dd><ul className="mt-1 space-y-2">
          {item.offices.map((office,i)=><li key={office.id+'-'+i} className="border-l-2 border-amber-300 pl-2">
            <strong>{office.name}</strong> — saved office ID: {office.id||'not saved'}; official office ID: {office.canonical_id||'not saved'}.
            <p>Flag: {office.recorded_review==='staff_reviewed'?'checked before (old mark)':'needs a look'}; {office.has_review_notes?'notes saved':'no notes'}; {office.has_reviewer?'who checked saved':'no checker saved'}.</p>
            {!office.canonical_identity_unique&&<p>{office.canonical_identity_issue==='missing_or_malformed'?'The official office identity is missing or broken.':'This official office ID shows up in more than one saved copy — sort out each copy and its coverage.'} Keep the old flags and notes; names and websites alone can't fix this.</p>}
            {office.website&&<a className="inline-flex min-h-11 items-center underline break-all" href={office.website} target="_blank" rel="noopener noreferrer">Open the saved office site (reference only)</a>}
          </li>)}
        </ul></dd>}
      </div>)}</dl>
      <p>Compare the official pages above with each job. Use the office editor for the staff check — a rescan or document link can't approve an office or match an address.</p>
    </section>
    <p>Check who issues permits and who inspects separately. No link or filename proves an office is responsible.</p>
  </details>;
}
