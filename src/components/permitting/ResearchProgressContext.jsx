import React, { createContext, useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
export const ResearchProgressContext=createContext(null);
export function ResearchProgressProvider({children}){
 const [actions,setActions]=useState({});const legacy=useRef(null);
 const put=useCallback((id,patch)=>setActions(prev=>({...prev,[id]:{...prev[id],...patch}})),[]);
 const startResearch=useCallback((total,label='Locality research batch')=>{const id=crypto.randomUUID();legacy.current=id;put(id,{id,label,total,processed:0,updated:0,skipped:0,status:'running',stage:'Starting',events:[],indeterminate:false});return id;},[put]);
 const updateProgress=useCallback((updates,id=legacy.current)=>{if(id)put(id,{...updates,stage:updates.currentJurisdiction || updates.stage || 'Researching'});},[put]);
 const completeResearch=useCallback((updated,skipped,error=null,id=legacy.current)=>{if(id)put(id,{status:error?'failed':'complete',updated,skipped,error,indeterminate:false,stage:error?'Failed':'Complete',processed:updated+skipped});},[put]);
 const clearProgress=useCallback(id=>setActions(prev=>{const next={...prev};delete next[id];return next;}),[]);
 const runAction=useCallback(async(name,payload,label)=>{
  const id=crypto.randomUUID();put(id,{id,label,status:'running',stage:'Submitting action',indeterminate:true,events:[],started_at:new Date().toISOString()});
  let stopped=false,polling=false;
  async function poll(){if(stopped||polling)return;polling=true;try{const res=await base44.functions.invoke('permittingScanStatus',{action_token:id});const run=res?.data?.run;if(run)put(id,{...run,id,label});}catch(e){put(id,{activity_warning:'Live activity temporarily unavailable; request may still be running.'});}finally{polling=false;}}
  const timer=setInterval(()=>void poll(),1500);
  try{
   const res=await base44.functions.invoke(name,{...payload,action_token:id});const data=res?.data || res;
   await poll();if(data.scan_run)put(id,{...data.scan_run,id,label});
   if(data.error || data.success===false){put(id,{status:'failed',stage:'Failed',error:data.error || 'Action incomplete',indeterminate:false});throw Error(data.error || 'Action incomplete');}
   if(!data.scan_run)put(id,{status:'complete',stage:'Complete',indeterminate:false});
   return res;
  }catch(error){await poll();put(id,{activity_warning:error?.response?.data?.error || error.message || 'Request response was lost; check saved activity.',response_lost:true});throw error;
  }finally{stopped=true;clearInterval(timer);}
 },[put]);
 const refreshAction=useCallback(async id=>{const res=await base44.functions.invoke('permittingScanStatus',{action_token:id});if(res?.data?.run)put(id,{...res.data.run,id,response_lost:false,activity_warning:null});},[put]);
 return <ResearchProgressContext.Provider value={{actions,runAction,refreshAction,startResearch,updateProgress,completeResearch,clearProgress}}>{children}</ResearchProgressContext.Provider>;
}
export function useResearchProgress(){const context=React.useContext(ResearchProgressContext);if(!context)throw Error('useResearchProgress must be used within ResearchProgressProvider');return context;}
