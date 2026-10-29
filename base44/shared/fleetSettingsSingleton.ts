// Canonical accessor for the FleetSettings singleton row (setting_type:'general').
// The FleetSettings admin UI lists rows by '-updated_date' and edits the newest;
// every backend reader and the fleetSettingsAction writer must elect the same
// row so a duplicate record can never split what the UI shows from what the
// server applies.
export const canonicalFleetSettingsRow = (rows:any[]=[]) =>
  (rows || []).slice().sort((a:any,b:any) => {
    const at = Date.parse(a?.updated_date || a?.created_date || '') || 0;
    const bt = Date.parse(b?.updated_date || b?.created_date || '') || 0;
    if (at !== bt) return bt - at;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;

export async function getCanonicalFleetSettings(base44:any) {
  const rows = await base44.asServiceRole.entities.FleetSettings.filter({ setting_type:'general' });
  return canonicalFleetSettingsRow(rows);
}
