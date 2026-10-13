import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {base44} from '@/api/base44Client';
import {checkRetainedElectricalPage} from './permittingRetainedElectricalPageCheck.mjs';

/** One manual historical PDF citation check at a time. Review never mutates or approves authority. */
export default function PermittingRetainedPageReview({candidates=[],readPage=checkRetainedElectricalPage,api=base44}) {
  const [busyId,setBusyId]=useState('');
  const [outcome,setOutcome]=useState(null);
  const [error,setError]=useState('');
  const [checkedId,setCheckedId]=useState('');
  const generation=useRef(0),inFlight=useRef(false);
  useEffect(()=>()=>{generation.current++;},[]);
  async function check(candidate){
    if(inFlight.current)return;
    inFlight.current=true;
    const sequence=++generation.current;
    const isCurrent=()=>sequence===generation.current;
    setBusyId(candidate.review_id);setCheckedId(candidate.review_id);
    setOutcome(null);setError('');
    try {
      const receipt=await readPage(api,candidate,isCurrent);
      if(isCurrent())setOutcome(receipt);
    }catch(e) {
      if(isCurrent())setError(e?.message||'Retained page evidence could not be read');
    }finally{
      if(isCurrent()){inFlight.current=false;setBusyId('');}
    }
  }
  if(!candidates.length)return <p className="text-sm">No historically linked electrical PDF citations are eligible for a retained-page check in this inventory. This does not indicate statewide coverage.</p>;
  return <details className="space-y-2">
    <summary className="min-h-11 cursor-pointer">Check individual retained PDF citations ({candidates.length})</summary>
    <p className="text-sm">Manually check one recorded review at a time. The check reads its latest relationship history, original PDF record and one retained physical text page. A matching text quote does not establish current permitting or inspection authority.</p>
    <p className="text-xs">These are recorded office and locality labels, not verified address matches. A shared office name or parent county never establishes where the authority applies.</p>
    <ul className="space-y-2 text-sm">
      {candidates.map(candidate=><li key={candidate.review_id} className="border-b pb-2 break-words">
        <strong>{candidate.state} {candidate.profile_name}</strong> — {candidate.role==='electrical_permit'?'Electrical permit issuer':'Electrical inspection provider'}.
        {' '}Review: {candidate.review_id}; source: {candidate.source_document_id}; physical page: {candidate.physical_page}.
        <div><Button type="button" variant="outline" className="mt-1 min-h-11 h-auto whitespace-normal"
          aria-label={'Check retained PDF page for electrical review '+candidate.review_id}
          disabled={Boolean(busyId)} onClick={()=>check(candidate)}>
          {busyId===candidate.review_id?'Checking retained page…':'Check retained PDF page'}
        </Button></div>
        {checkedId===candidate.review_id&&error&&<p role="alert" className="mt-2 text-red-700">PDF evidence could not be confirmed: {error} Refresh the coverage audit and request staff review; do not infer office authority.</p>}
        {outcome?.review_id===candidate.review_id&&<div role="status" aria-label={'Retained PDF text result for '+candidate.review_id} className="mt-3 space-y-2 rounded-md border p-3">
          <strong>Retained PDF text match only — not an authority approval</strong>
          <p>Review {outcome.review_id}, physical PDF page {outcome.physical_page}: the recorded quotation matches one validated retained text page.</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Recorded jurisdiction</dt><dd>{outcome.profile_state||candidate.state} {outcome.profile_name||candidate.profile_name} ({outcome.profile_type||'type not recorded'}). Profile ID: {outcome.profile_id||'not recorded'}.</dd></div>
            <div><dt className="font-semibold">Recorded responsibility</dt><dd>{outcome.role==='electrical_permit'?'Electrical permit issuance':'Electrical inspection performance'} — {outcome.recorded_office_name||'Office name not recorded'}. Canonical office ID: {outcome.canonical_office_id||'not recorded'}.</dd></div>
            <div><dt className="font-semibold">Claimed geographic coverage</dt><dd>{outcome.recorded_coverage_area||'not recorded'} ({outcome.recorded_coverage_kind||'coverage kind not recorded'}). Basis: {outcome.recorded_coverage_basis||'not recorded'}.</dd></div>
            <div><dt className="font-semibold">Stored evidence reference</dt><dd>Source ID: {outcome.source_document_id||candidate.source_document_id}; source scope review: {outcome.source_review_id||'not recorded'}; PDF page {outcome.physical_page}. No new government source was fetched.</dd></div>
          </dl>
          {!!outcome.recorded_quote&&<div><strong>Exact quotation found in retained PDF text</strong><blockquote className="mt-1 border-l-2 pl-3 text-sm">{outcome.recorded_quote}</blockquote></div>}
          <p className="text-sm"><strong>Still requires verification:</strong> current adopted rules, live official source, exact address and jurisdiction boundaries, issuing-versus-inspecting office identity, delegation validity, and applicability to the specific sign or electrical work.</p>
          <p className="text-xs">{outcome.notice}</p>
        </div>}
      </li>)}
    </ul>
  </details>;
}
