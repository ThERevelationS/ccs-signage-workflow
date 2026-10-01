import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
export default function useFieldHistory({isOpen,entityType,entityId,fieldName}) {
  const [state,setState]=useState({loading:true,entries:[],remote:[],error:'',warning:''});
  const load=useCallback(async (more=false)=>{
    setState(s=>({...s,loading:true,error:''}));
    try {
      const response=await base44.functions.invoke('fieldHistoryAction',{action:'history',session_token:localStorage.getItem('sss_session_token')||'',entity_type:entityType,entity_id:entityId,field_name:fieldName,...(more?{cursor:state.cursor,legacy_cursor:state.legacyCursor,remote_page:(state.remotePage||1)+1}: {})});
      const data=response.data;
      if(!data?.success)throw new Error(data?.error || 'Field history could not be loaded.');
      const entries=[...data.audit.items,...data.legacy.items];
      const remote=(data.remote?.data||[]).map((e,i)=>({id:`remote-${data.remote.pageNumber}-${i}`,modified_at:e.modifiedAt,actor_name:e.modifiedBy?.name||e.modifiedBy?.email,source:'Smartsheet',new_value:String(e.displayValue??e.value??'')}));
      setState(s=>({...s,loading:false,entries:more?[...s.entries,...entries.filter(e=>!s.entries.some(old=>old.id===e.id))]:entries,remote:more?[...s.remote,...remote.filter(e=>!s.remote.some(old=>old.id===e.id))]:remote,error:'',warning:data.remote_error||'',cursor:data.audit.next_cursor,legacyCursor:data.legacy.next_cursor,remotePage:data.remote?.pageNumber||1,hasMore:data.audit.has_more||data.legacy.has_more||(data.remote?.pageNumber<data.remote?.totalPages)}));
    }catch(error){setState(s=>({...s,loading:false,error:error?.response?.data?.error||error.message}));}
  },[entityType,entityId,fieldName,state.cursor,state.legacyCursor,state.remotePage]);
  useEffect(()=>{if(isOpen)load(false);},[isOpen,entityType,entityId,fieldName]);
  return {...state,load};
}