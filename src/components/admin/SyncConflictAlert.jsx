import React,{useEffect,useState} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, X } from 'lucide-react';
import { usePolling } from '@/lib/usePolling';
import { isFleetCoolingDown } from '@/components/fleet/fleetInvoke';

// The count call used to fire every 30s per open tab. Cache one answer for
// 5 minutes and share an in-flight request so mounted tabs cannot stack calls.
const CONFLICT_COUNT_CACHE_MS = 5 * 60 * 1000;
let conflictCountCache = { token: '', at: 0, value: null };
let conflictCountInFlight = null;

// Dismissal survives the Layout remounts that route changes cause. The badge
// reappears if the count changes (new conflicts or partial resolutions make
// the number worth re-showing); a reload clears it like any session state.
let dismissedCount = 0;
let dismissedError = false;

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
  const [ambientGate,setAmbientGate]=useState(false);
  const location = useLocation();
  // Gate the poll start — its 60s ticks cluster the mount wave's tail; first
  // call lands ~75s once the gate opens.
  useEffect(()=>{ const t=setTimeout(()=>setAmbientGate(true),15000); return ()=>clearTimeout(t); },[]);
  useEffect(()=>{ if(currentUser?.role!=='admin')setCount(0); },[currentUser?.role]);
  // Route changes are usually the admin returning from the conflict-review
  // tab — drop the 5-minute cache and refresh now so resolved conflicts clear
  // the badge instead of lingering until the cache window expires.
  useEffect(()=>{
    if(currentUser?.role!=='admin'||!ambientGate)return;
    conflictCountCache = { token: '', at: 0, value: null };
    loadConflictCount(sessionToken)
      .then(v=>{setCount(v.count);setRecords(v.records);setError('');})
      .catch(()=>{});
  },[location.pathname]);
  usePolling(async()=>{
    if(isFleetCoolingDown())return;
    try{const v=await loadConflictCount(sessionToken);setCount(v.count);setRecords(v.records);setError('');}catch{setError('Conflict alerts unavailable');}
  },60000,{enabled:currentUser?.role==='admin'&&ambientGate});
  if(currentUser?.role!=='admin')return null;
  if((!count||count===dismissedCount)&&(!error||dismissedError))return null;
  const dismiss=()=>{dismissedCount=count;dismissedError=!!error;setCount(0);setError('');};
  return (
    <div role="status" className="fixed bottom-20 right-3 z-40 flex max-w-xs items-center gap-1 rounded-xl border bg-card px-3 py-2 shadow-lg">
      <Link to="/AdminSettings?tab=sync_conflicts" className="flex min-h-11 flex-1 items-center gap-2 px-1 py-1 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0"/>{error||`${count} value differences across ${records} record${records===1?'':'s'} — not write errors`}
      </Link>
      <button type="button" aria-label="Dismiss sync conflict alert" onClick={dismiss}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
        <X className="h-4 w-4"/>
      </button>
    </div>
  );
}
