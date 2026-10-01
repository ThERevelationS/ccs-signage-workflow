import React from 'react';
export default function FieldHistoryEntry({ entry }) {
  const date=entry.modified_at || entry.created_date;
  const formatted=date && !Number.isNaN(Date.parse(date)) ? new Date(date).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}) : 'Edit time unknown';
  return <article className="rounded-lg border bg-card p-3 text-sm">
    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{entry.actor_name || entry.changed_by_name || entry.changed_by_email || 'Unknown editor'} · {entry.source || 'Legacy app history'}</span><time>{formatted}</time></div>
    {!entry.modified_at && <p className="mt-1 text-xs text-muted-foreground">Recorded time only; not a verified field edit timestamp.</p>}
    <div className="mt-2 whitespace-pre-wrap break-words"><span className="text-muted-foreground">{entry.old_value === '' ? '(empty)' : entry.old_value ?? '(unknown previous value)'}</span><span className="mx-2">→</span>{entry.new_value === '' ? '(empty)' : entry.new_value ?? '(empty)'}</div>
    {entry.preview_truncated && <p className="mt-1 text-xs text-muted-foreground">Long value shown as a preview; its full fingerprint was preserved.</p>}
  </article>;
}