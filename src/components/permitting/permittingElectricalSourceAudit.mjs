const ROLES=['electrical_permit','electrical_inspection'];
const clean=value=>typeof value==='string'?value.trim():'';
const stable=value=>typeof value==='string'&&value.trim()!==''&&value===value.trim();
const hash=value=>/^[0-9a-f]{64}$/.test(clean(value));
const goodNumber=value=>Number.isSafeInteger(value)&&value>0;
const states=['OH','KY'];
const counters=()=>Object.fromEntries(['histories','recorded_source_reference','no_visible_source','source_identity_conflict',
  'source_snapshot_changed','retained_archive_missing','page_citation_incomplete','unsupported_electrical_html',
  'ambiguous_history','uncommitted_or_uncertain','revoked','malformed_review'].map(k=>[k,0]));
const totals=()=>Object.fromEntries(ROLES.map(role=>[role,counters()]));
const comparisonKeys=['id','jurisdiction_id','official_url','archived_file_url','file_hash_sha256','file_bytes',
  'content_status','verification_status','authority_classification','authority_review'];
const compare=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sort=(a,b)=>states.indexOf(a.state)-states.indexOf(b.state)
  || a.profile_name.localeCompare(b.profile_name)||a.profile_id.localeCompare(b.profile_id)
  || ROLES.indexOf(a.role)-ROLES.indexOf(b.role)||a.review_id.localeCompare(b.review_id);

/** Exact-ID, metadata-only source lookup. Chunking bounds each request, not the manual read total.
 * No PDF bytes, extracted text, HTML bytes, LLM calls or production mutations.
 */
export async function readElectricalEvidenceSourceMetadata(api, events, {isCurrent=()=>true,onProgress=()=>{}}={}) {
  if (!Array.isArray(events)) throw Error('Invalid electrical evidence event inventory');
  const ids=[...new Set(events.filter(e=>e?.method==='office-authority-v1'&&ROLES.includes(e.role)
    &&e.action==='verify').map(e=>e.source_document_id).filter(stable))].sort();
  const output=[],seen=new Set();
  for(let start=0;start<ids.length;start+=25){
    if(!isCurrent())throw Error('Electrical evidence read superseded');
    const chunk=ids.slice(start,start+25),allowed=new Set(chunk),cursors=new Set();
    let cursor;
    do {
      if(!isCurrent())throw Error('Electrical evidence read superseded');
      const page=await api.entities.PermittingSourceDocument.filter({id:{$in:chunk}},{
        sort:'id',limit:50,fields:['id','jurisdiction_id','official_url','archived_file_url',
          'file_hash_sha256','file_bytes','content_status','verification_status','authority_classification','authority_review'],
        ...(cursor?{cursor}:{})
      });
      if(!isCurrent())throw Error('Electrical evidence read superseded');
      if(!page||!Array.isArray(page.items)||typeof page.has_more!=='boolean')throw Error('Invalid electrical source metadata page');
      for(const source of page.items){
        if(!stable(source?.id)||!allowed.has(source.id)||seen.has(source.id))
          throw Error('Electrical evidence source identity repeated or outside requested IDs');
        seen.add(source.id);output.push(source);
      }
      if(!page.has_more)break;
      if(!stable(page.next_cursor)||cursors.has(page.next_cursor))throw Error('Electrical source cursor did not advance');
      cursors.add(page.next_cursor);cursor=page.next_cursor;
    }while(true);
    onProgress({requested:Math.min(start+25,ids.length),found:output.length});
  }
  return output;
}

/** Historical, non-atomic evidence inventory. Positive matches mean references only,
 * never live official-source currentness, legal applicability or electrical responsibility.
 */
export function reconcileRecordedElectricalEvidence(profiles,events,pdfSources){
  if(![profiles,events,pdfSources].every(Array.isArray))throw Error('Invalid electrical source reconciliation input');
  const profileMap=new Map(),seenEvents=new Set(),sourceMap=new Map();
  for(const p of profiles){
    if(!stable(p?.id)||profileMap.has(p.id))throw Error('Invalid or duplicate electrical profile ID');
    profileMap.set(p.id,p);
  }
  for(const source of pdfSources){
    if(!stable(source?.id)||sourceMap.has(source.id))throw Error('Invalid or duplicate electrical source ID');
    sourceMap.set(source.id,source);
  }
  const relations=new Map();
  for(const event of events){
    if(!stable(event?.id)||seenEvents.has(event.id))throw Error('Invalid or duplicate electrical event ID');
    seenEvents.add(event.id);
    if(event.method!=='office-authority-v1'||!ROLES.includes(event.role))continue;
    const profile=profileMap.get(event.jurisdiction_id);
    const state=clean(profile?.state||event.profile_snapshot?.state).toUpperCase();
    if(!states.includes(state))continue;
    // Missing relation keys cannot merge with similarly named offices.
    const key=JSON.stringify([event.jurisdiction_id,stable(event.relation_key)?event.relation_key:'invalid:'+event.id]);
    if(!relations.has(key))relations.set(key,[]);
    relations.get(key).push(event);
  }
  const summary={OH:totals(),KY:totals()},items=[];
  for(const history of relations.values()){
    const initial=history[0],profile=profileMap.get(initial.jurisdiction_id);
    const state=clean(profile?.state||initial.profile_snapshot?.state).toUpperCase();
    const role=initial.role,counts=summary[state][role];counts.histories++;
    const receipt=profile?.office_authority_review_state,seq=receipt?.committed_sequence??0;
    const pending=!Number.isSafeInteger(seq)||seq<0||['creating','uncertain'].includes(receipt?.status);
    const committed=history.filter(e=>goodNumber(e.sequence)&&e.sequence<=seq);
    const lastSeq=committed.reduce((max,e)=>Math.max(max,e.sequence),0);
    const heads=committed.filter(e=>e.sequence===lastSeq);
    const latest=heads[0]||initial;
    const item={state,role,profile_id:clean(initial.jurisdiction_id),profile_name:clean(profile?.name||initial.profile_snapshot?.name)||'Unreadable profile',
      review_id:latest.id,source_document_id:clean(latest.source_document_id),html_evidence_id:clean(latest.html_evidence_id),
      office_id:clean(latest.office_snapshot?.government_office_id),status:''};
    let status='';
    if(!profile||pending||!committed.length||history.some(e=>!goodNumber(e.sequence)||e.sequence>seq))status='uncommitted_or_uncertain';
    else if(heads.length!==1)status='ambiguous_history';
    else if(latest.action==='revoke')status='revoked';
    else if(latest.action!=='verify'||!stable(latest.relation_key)||latest.profile_snapshot?.id!==profile.id||
      clean(latest.profile_snapshot?.state).toUpperCase()!==state||!stable(latest.office_snapshot?.government_office_id)||
      !clean(latest.coverage_area)||latest.responsibility_confirmed!==true||latest.address_authority_resolved!==false)
      status='malformed_review';
    else if(latest.evidence_kind==='official_html'||item.html_evidence_id)
      status='unsupported_electrical_html';
    else if(!stable(latest.source_document_id)||!latest.source_snapshot||
      typeof latest.source_snapshot!=='object')status='malformed_review';
    else {
      const source=sourceMap.get(latest.source_document_id);
      if(!source)status='no_visible_source';
      else if(source.id!==latest.source_document_id||
        clean(source.jurisdiction_id)!==clean(latest.source_snapshot.jurisdiction_id))
        status='source_identity_conflict';
      else if(comparisonKeys.some(key=>!compare(source[key]??null,latest.source_snapshot[key]??null)))
        status='source_snapshot_changed';
      else if(!hash(source.file_hash_sha256)||!goodNumber(source.file_bytes)||
        !/^https:\/\//i.test(clean(source.archived_file_url)))
        status='retained_archive_missing';
      else if(!goodNumber(latest.role_proof?.physical_page)||
        !hash(latest.role_proof?.text_sha256)||!clean(latest.role_proof?.excerpt))
        status='page_citation_incomplete';
      else status='recorded_source_reference';
    }
    counts[status]++;item.status=status;
    if(status!=='recorded_source_reference'&&status!=='revoked')items.push(item);
  }
  items.sort(sort);
  return {states:summary,items,authority_verified:false,current_source_verified:false,complete:false,
    notice:'Read-only source-record cross-check, not an independent document authenticity or current-law check. A matching historical source snapshot and recorded page citation cannot prove that PDF pages remain extractable or that an office issues permits or performs inspections today. Missing source IDs may be outside read permissions. Ohio is listed first; electrical issuing and inspecting are distinct roles. The backend alone performs fresh evidence verification.'};
}
