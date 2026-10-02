import React, {useEffect,useState} from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { AlertTriangle } from 'lucide-react';
export default function SyncConflictAlert({currentUser,sessionToken}) {
  const [count,setCount]=useState(0),[records,setRecords]=useState(0),[error,setError]=useState('');
  useEffect(()=>{
    if(currentUser?.role!=='admin'){setCount(0);return;}
    let active=true;
    const refresh=async()=>{try{const response=await base44.functions.invoke('smartsheetSyncAction',{action:'conflict_count',session_token:sessionToken});if(active){setCount(response.data.count||0);setRecords(response.data.record_count||0);setError('');}}catch{if(active)setError('Conflict alerts unavailable');}};
    refresh();const timer=setInterval(refresh,30000);return()=>{active=false;clearInterval(timer);};
  },[currentUser?.role,sessionToken]);
  if(currentUser?.role!=='admin'||!count&&!error)return null;
  return <Link to="/AdminSettings?tab=sync_conflicts" role="status" className="fixed bottom-20 right-3 z-40 flex min-h-11 max-w-xs items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-lg"><AlertTriangle className="h-4 w-4 shrink-0"/>{error||`${count} value differences across ${records} record${records===1?'':'s'} — not write errors`}</Link>;
}