// Local coordination only: the persistence helper remains responsible for durable identity/dedupe.
export async function runPickerDraftAction({pending,isCurrent,prepare,create,apply}){
 if(pending.current||!isCurrent())return {status:'skipped'};
 const attempt={};pending.current=attempt;
 try{
  const prepared=prepare ? await prepare() : undefined;
  if(!isCurrent())return {status:'stale'};
  const result=await create(prepared);
  if(!isCurrent())return {status:'stale'};
  if(!result?.record?.id)throw Error('Draft creation was not confirmed. Reload localities before retrying.');
  apply(result.record);
  return {status:'applied'};
 }finally{if(pending.current===attempt)pending.current=null;}
}

// Recheck the reviewed source; persistence still owns durable draft deduplication.
// allowDuplicate: the admin picked one specific row, which resolves the
// sibling-name ambiguity the duplicate check otherwise guards against.
export function requireReviewedRepositoryProfile({reviewed,rows,hasDuplicate,toDraft,allowDuplicate}) {
 const matches=Array.isArray(rows) ? rows.filter(row=>row?.id===reviewed?.id) : [];
 if(!reviewed?.id || matches.length!==1 || (!allowDuplicate && hasDuplicate(rows,matches[0])))
  throw Error('This repository profile is missing or ambiguous. Reopen the picker and review it again.');
 const current=matches[0];
 const snapshot=row=>JSON.stringify([row.name,row.state,row.type,row.parent_county,toDraft(row)]);
 if(snapshot(current)!==snapshot(reviewed))
  throw Error('This repository profile changed since review. Reopen the picker and review it again.');
 return toDraft(current);
}
