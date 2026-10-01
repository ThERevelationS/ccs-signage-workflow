import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import FieldHistoryEntry from '@/components/shared/FieldHistoryEntry';
import useFieldHistory from '@/components/shared/useFieldHistory';
export default function FieldHistoryDialog(props) {
  const state=useFieldHistory(props);
  const entries=[...state.entries,...state.remote].sort((a,b)=>Date.parse(b.modified_at||b.created_date||0)-Date.parse(a.modified_at||a.created_date||0));
  return <Dialog open={props.isOpen} onOpenChange={open=>{if(!open)props.onClose();}}><DialogContent className="max-w-2xl bg-card"><DialogHeader><DialogTitle>Field History: {props.fieldLabel||props.fieldName}</DialogTitle></DialogHeader>
    <p className="text-xs text-muted-foreground">Field edit times are separate from sync times. Older changes without a verified timestamp remain unknown.</p>
    <div className="max-h-[65vh] space-y-3 overflow-y-auto">
      {state.error && <p role="alert" className="text-destructive">{state.error} <Button variant="outline" onClick={()=>state.load(false)}>Retry</Button></p>}
      {state.warning && <p role="status" className="text-sm text-muted-foreground">App history loaded. {state.warning}</p>}
      {entries.map(entry=><FieldHistoryEntry key={entry.id} entry={entry}/>)}
      {!state.loading && !state.error && !entries.length && <p className="py-6 text-center text-muted-foreground">No recorded changes for this field yet.</p>}
      {state.loading && <Loader2 aria-label="Loading field history" className="mx-auto h-5 w-5 animate-spin"/>}
      {state.hasMore && <Button variant="outline" disabled={state.loading} onClick={()=>state.load(true)}>Load more history</Button>}
    </div></DialogContent></Dialog>;
}