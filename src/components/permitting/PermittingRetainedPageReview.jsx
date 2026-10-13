import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {base44} from '@/api/base44Client';
import {checkRetainedElectricalPage} from './permittingRetainedElectricalPageCheck.mjs';

/** One manual historical PDF citation check at a time. Review never mutates or approves authority. */
export default function PermittingRetainedPageReview({candidates=[],readPage=checkRetainedElectricalPage,api=base44}) {
  const [busyId,setBusyId]=useState('');
  const [outcome,setOutcome]=useState(null);
  const [error,setError]=useState('');
  const generation=useRef(0),inFlight=useRef(false);
  useEffect(()=>()=>{generation.current++;},[]);
  async function check(candidate){
    if(inFlight.current)return;
    inFlight.current=true;
    const sequence=++generation.current;
    const isCurrent=()=>sequence===generation.current;
    setBusyId(candidate.review_id);
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
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {outcome&&<p role="status" className="text-sm">Review {outcome.review_id}, PDF page {outcome.physical_page}: {outcome.notice}</p>}
    <ul className="space-y-2 text-sm">
      {candidates.map(candidate=><li key={candidate.review_id} className="border-b pb-2 break-words">
        <strong>{candidate.state} {candidate.profile_name}</strong> — {candidate.role==='electrical_permit'?'Electrical permit issuer':'Electrical inspection provider'}.
        {' '}Review: {candidate.review_id}; source: {candidate.source_document_id}; physical page: {candidate.physical_page}.
        <div><Button type="button" variant="outline" className="mt-1 min-h-11 h-auto whitespace-normal"
          aria-label={'Check retained PDF page for electrical review '+candidate.review_id}
          disabled={Boolean(busyId)} onClick={()=>check(candidate)}>
          {busyId===candidate.review_id?'Checking retained page…':'Check retained PDF page'}
        </Button></div>
      </li>)}
    </ul>
  </details>;
}
