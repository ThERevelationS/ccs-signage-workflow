import React,{useEffect,useState} from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { AlertTriangle } from 'lucide-react';
import { usePolling } from '@/lib/usePolling';
import { isFleetCoolingDown } from '@/components/fleet/fleetInvoke';

// The count call used to fire every 30s per open tab. Cache one answer for
// 5 minutes and share an in-flight request so mounted tabs cannot stack calls.
const CONFLICT_COUNT_CACHE_MS = 5 * 60 * 1000;
let conflictCountCache = { token: '', at: 0, value: null };
let conflictCountInFlight = null;

async function loadConflictCount(sessionToken) {
  const now = Date.now();
  if (conflictCountCache.token === sessionToken && conflictCountCache.value && now - conflictCountCache.at < CONFLICT_COUNT_CACHE_MS) return conflictCountCache.value;
  if (conflictCountInFlight && conflictCountInFlight.token === sessionToken) return conflictCountInFlight.promise;
  const promise = (async () => {
    const response = await base44.functions.invoke('smartsheetSyncAction', { action: 'conflict_count', session_token: sessionToken });
    const data = response?.data || response || {};
    return { count: data.count || 0, records: data.record_count || 0 };
  })();
  conflictCountInFlight = { token: sessionToken, promise };
  try {
    const value = await promise;
    conflictCountCache = { token: sessionToken, at: Date.now(), value };
    return value;
  } finally {
    if (conflictCountInFlight?.promise === promise) conflictCountInFlight = null;
  }
}

export default function SyncConflictAlert({currentUser,sessionToken}) {
  const [count,setCount]=useState(0),[records,setRecords]=useState(0),[error,setError]=useState('');
  useEffect(()=>{ if(currentUser?.role!=='admin')setCount(0); },[currentUser?.role]);
  usePolling(async()=>{
    if(isFleetCoolingDown())return;
    try{const v=await loadConflictCount(sessionToken);setCount(v.count);setRecords(v.records);setError('');}catch{setError('Conflict alerts unavailable');}
  },60000,{enabled:currentUser?.role==='admin'});
  if(currentUser?.role!=='admin'||!count&&!error)return null;
  return <Link to="/AdminSettings?tab=sync_conflicts" role="status" className="fixed bottom-20 right-3 z-40 flex min-h-11 max-w-xs items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-lg"><AlertTriangle className="h-4 w-4 shrink-0"/>{error||`${count} value differences across ${records} record${records===1?'':'s'} — not write errors`}</Link>;
}
