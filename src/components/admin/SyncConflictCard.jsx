import React from 'react';
import { Button } from '@/components/ui/button';
const date=value=>value && Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'Unknown field edit time';
export default function SyncConflictCard({item,busy,onResolve}) {
  return <article className="rounded-xl border bg-card p-4">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{item.record_label}</h3><span className="text-xs text-muted-foreground">{item.dataset==='sales'?'Sales Pipeline':'Order Form'} · {item.status}</span></div>
    <p className="mt-1 text-sm font-medium">{item.field_label}</p><p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{[['app','This app',item.local_value,item.local_modified_at],['smartsheet','Smartsheet',item.remote_value,item.remote_modified_at]].map(([choice,title,value,time])=><div key={choice} className="rounded-lg border p-3"><h4 className="text-sm font-semibold">{title}</h4><p className="mt-1 text-xs text-muted-foreground">{date(time)}</p><p className="my-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">{value||'(empty)'}</p>{['open','approved'].includes(item.status)&&<Button className="min-h-11" variant={item.decision===choice?'default':'outline'} disabled={busy} onClick={()=>onResolve(item,choice)}>{item.decision===choice?'Chosen: ':'Keep '}{title}</Button>}</div>)}</div>
    <p className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">Last verified baseline: {item.baseline_value||'(empty)'}</p>
  </article>;
}