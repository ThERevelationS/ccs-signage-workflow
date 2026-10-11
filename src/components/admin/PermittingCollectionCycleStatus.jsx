export default function PermittingCollectionCycleStatus({cycle}){
 if(!cycle)return <p className="text-xs text-gray-500">No saved document collection cycle yet.</p>;
 const active=cycle.status==='running',expired=active&&Date.parse(cycle.lease_expires_at || '')<=Date.now();
 return <section aria-label="Document collection status" className="rounded-lg border p-3 space-y-1 text-xs">
  <p className="font-semibold">Document collection: {expired?'interrupted; lease expired':active?'running':cycle.status==='completed_with_errors'?'completed with errors':'complete'}</p>
  <p>Started: {new Date(cycle.started_at).toLocaleString()}</p>
  {cycle.completed_at&&<p>Finished: {new Date(cycle.completed_at).toLocaleString()}</p>}
  {Object.entries(cycle.stages || {}).map(([name,stage])=><p key={name} className="break-words"><span className="capitalize">{name}</span>: {stage.status?.replaceAll('_',' ')}{stage.archived?` · ${stage.archived} archived`:''}{stage.error?` · ${stage.error}`:''}</p>)}
  <p className="text-gray-500">Collection runs separately from the daily AI research allowance. A completed cycle does not establish locality coverage.</p>
 </section>;
}
