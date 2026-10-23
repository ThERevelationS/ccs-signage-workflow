// Canonical accessor for the FleetCutoverState singleton row.
// fleetCutoverControl's create path elects the lowest-id row as canonical and
// retires concurrent-create losers. Every reader must use the same election so
// a legacy duplicate row can never make cutover gates non-deterministic.
export const canonicalCutoverRow = (rows:any[]=[]) =>
  (rows || []).slice().sort((a:any,b:any)=>String(a?.id||'').localeCompare(String(b?.id||'')))[0] || null;

export async function getCanonicalCutoverState(base44:any) {
  const rows = await base44.asServiceRole.entities.FleetCutoverState.filter({ state_key:'primary' });
  return canonicalCutoverRow(rows);
}
