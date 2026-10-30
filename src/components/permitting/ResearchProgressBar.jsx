import { useResearchProgress } from './ResearchProgressContext';
export default function ResearchProgressBar({inline=false}){
 const {actions,clearProgress,refreshAction}=useResearchProgress(),rows=Object.values(actions);
 if(!rows.length)return null;
 return <aside aria-label="Scan activity" className={inline?"rounded-lg border bg-white p-3 space-y-3 min-w-0":"fixed bottom-3 right-3 z-40 w-[calc(100vw-1.5rem)] max-w-md max-h-[70vh] overflow-y-auto rounded-lg border bg-white p-3 shadow-lg space-y-3"}>
  <h2 className="text-sm font-semibold flex items-center gap-1.5">Scan activity · {rows.length} {rows.length===1?'action':'actions'}<span className="cursor-help text-gray-400" title="This shows what the system checked behind the scenes. You do not need it — it is for our team.">ⓘ</span></h2>
  {rows.map(row=>{const active=row.status==='running',stale=row.tracking_paused===true||(row.response_lost===true&&(active||row.status==='unknown')),total=row.total || 0,value=Math.min(row.processed || 0,total);return <section key={row.id} aria-label={row.label} className="min-w-0 rounded border p-2 space-y-2 text-xs">
   <div className="flex justify-between gap-2"><h3 className="font-semibold break-words">{row.label}</h3>{!active&&<button type="button" className="shrink-0 min-h-8 px-2" onClick={()=>clearProgress(row.id)} aria-label={`Dismiss ${row.label}`}>Dismiss</button>}</div>
   <p role="status">{stale?(row.tracking_paused?'Live updates paused — sign in to check this scan':'Live updates unavailable — check saved status'):(row.stage || row.status)?.replaceAll('_',' ')}</p>
   {stale&&<p>Last saved step: {(row.stage || row.status)?.replaceAll('_',' ')}</p>}
   <progress aria-label={`${row.label} progress`} max={total || 1} {...(stale?{value}:!row.indeterminate&&total?{value}:!active?{value:row.status==='complete'?total || 1:value}:{})} className="w-full h-3" />
   <p>{stale?(total?`Last saved progress: ${value}/${total} steps or pages`:'Progress is unavailable until saved status can be checked'):active&&row.indeterminate?'Scanning — total steps are not known yet':total?`${value}/${total} steps or pages in the current stage`:'Action status: '+row.status}</p>
   {row.current_url&&<p className="break-all">Current source: {row.current_url}</p>}
   {row.error&&<p className="text-red-700 break-words">{row.error}</p>}
   {(row.activity_warning || row.tracking_error)&&<p className="text-amber-800">{row.activity_warning || row.tracking_error}</p>}
   {row.response_lost&&<button type="button" className="min-h-9 underline" onClick={()=>refreshAction(row.id)}>Check saved action status</button>}
   <details><summary className="cursor-pointer min-h-9 py-2">Activity and findings ({row.events?.length || 0})</summary>
    {row.omitted_events>0&&<p>{row.omitted_events} older events omitted from this bounded activity view.</p>}
    <ol className="space-y-2">{(row.events || []).map((event,i)=><li key={i} className="border-t pt-2 min-w-0"><p>{event.at?new Date(event.at).toLocaleTimeString():''} · {event.kind?.replaceAll('_',' ')}</p>{event.url&&<p className="break-all">{event.url}</p>}{event.detail&&<pre className="whitespace-pre-wrap break-words font-sans">{event.detail}</pre>}{event.omitted_resources>0&&<p>{event.omitted_resources} additional resources omitted from this bounded event.</p>}{event.resources?.map((r,j)=><p key={j} className="break-all">Found: {r.title || r.kind || 'Resource'} — {r.url}</p>)}</li>)}</ol>
   </details>
  </section>;})}
 </aside>;
}
