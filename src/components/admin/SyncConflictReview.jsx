import React, {useCallback,useEffect,useRef,useState} from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import SyncConflictCard from '@/components/admin/SyncConflictCard';
import { usePolling } from '@/lib/usePolling';
export default function SyncConflictReview({sessionToken}) {
  const [items,setItems]=useState([]),[count,setCount]=useState(0),[page,setPage]=useState({}),[status,setStatus]=useState('open'),[dataset,setDataset]=useState('all'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const flight=useRef(false);
  const load=useCallback(async cursor=>{
    setLoading(true);
    try{const response=await base44.functions.invoke('smartsheetSyncAction',{action:'conflict_list',session_token:sessionToken,status,dataset,cursor});const data=response.data;if(!data?.success)throw new Error(data?.error||'Reviews could not be loaded.');setItems(old=>cursor?[...old,...data.page.items]:data.page.items);setPage(data.page);setCount(data.count);}catch(error){setMessage(error?.response?.data?.error||error.message);}finally{setLoading(false);}
  },[sessionToken,status,dataset]);
  usePolling(()=>{if(!flight.current)return load();},60000,{runOnMount:false});
  useEffect(()=>{load();},[load]);
  const bulkResolve=async(decision)=>{
    const open=items.filter(i=>i.status==='open');
    if(!open.length||busy||flight.current)return;
    if(!window.confirm(`Apply the ${decision==='app'?'app':'Smartsheet'} value to all ${open.length} pending conflicts? Each is still rechecked before applying.`))return;
    setBusy(true);flight.current=true;
    let failed=0;
    for(const item of open){
      try{await base44.functions.invoke('smartsheetSyncAction',{action:'resolve_conflict',session_token:sessionToken,conflict_id:item.id,decision});}
      catch{failed++;}
    }
    setMessage(failed?`Bulk apply finished with ${failed} failure(s) — review remaining items.`:`Applied ${open.length} ${decision==='app'?'app':'Smartsheet'} choices.`);
    await load();flight.current=false;setBusy(false);
  };

  const resolve=async(item,decision)=>{
    if(flight.current)return;
    if(!window.confirm(`Keep the ${decision==='app'?'app':'Smartsheet'} value for ${item.field_label} on ${item.record_label}? Both sides will be rechecked before applying it.`))return;
    flight.current=true;setBusy(true);setMessage('');
    try{const response=await base44.functions.invoke('smartsheetSyncAction',{action:'resolve_conflict',session_token:sessionToken,conflict_id:item.id,decision});setMessage(response.data.message||'Choice saved.');}catch(error){setMessage(error?.response?.data?.error||error.message);}finally{await load();flight.current=false;setBusy(false);}
  };
  return <section className="space-y-4"><header><h1 className="text-xl font-semibold">Sync Conflict Review</h1><p className="mt-1 text-sm text-muted-foreground">{count} {status==='resolved'?'resolved':'pending'} value differences, not failed sync writes. “Unknown” baseline means older data cannot prove which version changed—not that both were edited. Choices apply only while the reviewed field values are unchanged.</p></header>
    <div className="flex flex-wrap items-center gap-2"><label className="text-sm">Show <select className="ml-2 min-h-11 rounded border bg-background px-3" value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}><option value="open">Pending review</option><option value="resolved">Resolved history</option></select></label><label className="text-sm">Area <select className="ml-2 min-h-11 rounded border bg-background px-3" value={dataset} disabled={busy} onChange={e=>setDataset(e.target.value)}><option value="all">Both areas</option><option value="sales">Sales Pipeline</option><option value="orders">Order Form</option></select></label><Button variant="outline" disabled={busy||loading} onClick={()=>load()}>Refresh</Button>
    {status==='open'&&items.length>1&&<>
      <Button variant="outline" disabled={busy} onClick={()=>bulkResolve('app')}>Keep all app values</Button>
      <Button variant="outline" disabled={busy} onClick={()=>bulkResolve('smartsheet')}>Keep all Smartsheet values</Button>
    </>}</div>
    {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    {items.map(item=><SyncConflictCard key={item.id} item={item} busy={busy} onResolve={resolve}/>)}
    {loading&&<Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Loading reviews"/>}
    {!loading&&!items.length&&<p className="py-8 text-center text-muted-foreground">No {status==='resolved'?'resolved':'pending'} field conflicts.</p>}
    {page.has_more&&<Button disabled={busy||loading} variant="outline" onClick={()=>load(page.next_cursor)}>Load more</Button>}
  </section>;
}