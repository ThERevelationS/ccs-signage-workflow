// Local coordination only: the persistence helper remains responsible for durable identity/dedupe.
export async function runPickerDraftAction({pending,isCurrent,create,apply}){
 if(pending.current||!isCurrent())return {status:'skipped'};
 const attempt={};pending.current=attempt;
 try{
  const result=await create();
  if(!isCurrent())return {status:'stale'};
  if(!result?.record?.id)throw Error('Draft creation was not confirmed. Reload localities before retrying.');
  apply(result.record);
  return {status:'applied'};
 }finally{if(pending.current===attempt)pending.current=null;}
}
