const val=x=>String(x??'').trim();
const num=x=>/^\d+$/.test(val(x)) && val(x)!=='0';

// Report competing durable Smartsheet row identities without making changes.
export function auditSalesPermanentRowOwners(links,attempts,sheetId) {
  const sheet=val(sheetId);
  if (!num(sheet)||!Array.isArray(links)||!Array.isArray(attempts))
    throw Error('Complete Sales claim sets and a numeric configured sheet are required.');
  const groups=new Map();
  // Linked and durable-attempt scans can return separate projections of the
  // same WorkOrder. Compare both claims by owner ID, not just within one row.
  const markersByOwner=new Map();
  for(const record of attempts) {
    if(!record?.id)throw Error('Unidentified creation-attempt WorkOrder found.');
    const owner=val(record.id);
    if(!markersByOwner.has(owner))markersByOwner.set(owner,[]);
    if(record.smartsheet_create_attempt)
      markersByOwner.get(owner).push(record.smartsheet_create_attempt);
  }
  const get=row=>{
    if(!groups.has(row))groups.set(row,{row_id:row,owners:new Set(),linked:new Set(),
      attempts:new Set(),missingSheet:new Set(),mismatch:new Set()});
    return groups.get(row);
  };
  for(const record of links) {
    if(!record?.id)throw Error('Unidentified linked WorkOrder found.');
    const row=val(record.smartsheet_row_id),s=val(record.smartsheet_sheet_id);
    if(!num(row)||(num(s)&&s!==sheet))continue;
    const g=get(row);g.owners.add(val(record.id));g.linked.add(val(record.id));
    if(s!==sheet)g.missingSheet.add(val(record.id));
    const owner=val(record.id);
    const markers=[record.smartsheet_create_attempt,...(markersByOwner.get(owner)||[])].filter(Boolean);
    if(markers.some(marker=>val(marker.row_id)!==row||val(marker.sheet_id)!==sheet))
      g.mismatch.add(owner);
  }
  for(const record of attempts) {
    if(!record?.id)throw Error('Unidentified creation-attempt WorkOrder found.');
    const marker=record.smartsheet_create_attempt;
    const row=val(marker?.row_id),s=val(marker?.sheet_id);
    if(!num(row)||(num(s)&&s!==sheet))continue;
    const g=get(row);g.owners.add(val(record.id));g.attempts.add(val(record.id));
    if(s!==sheet)g.missingSheet.add(val(record.id));
    if(num(record.smartsheet_row_id)&&(val(record.smartsheet_row_id)!==row||
      (num(record.smartsheet_sheet_id)&&val(record.smartsheet_sheet_id)!==sheet)))
      g.mismatch.add(val(record.id));
  }
  const cases=[];
  for(const g of groups.values()){
    const types=[];
    if(g.owners.size>1)types.push('competing_workorders');
    if(g.missingSheet.size)types.push('missing_sheet_identity');
    if(g.mismatch.size)types.push('inconsistent_create_marker');
    if(types.length)cases.push({row_id:g.row_id,types,owner_count:g.owners.size,
      workorder_ids:[...g.owners].sort().slice(0,20),owners_truncated:g.owners.size>20});
  }
  cases.sort((a,b)=>a.row_id.localeCompare(b.row_id,undefined,{numeric:true}));
  return {sheet_id:sheet,linked_records_examined:links.length,attempt_records_examined:attempts.length,
    permanent_rows_examined:groups.size,review_count:cases.length,
    competing_row_count:cases.filter(x=>x.types.includes('competing_workorders')).length,
    missing_sheet_count:cases.filter(x=>x.types.includes('missing_sheet_identity')).length,
    marker_mismatch_count:cases.filter(x=>x.types.includes('inconsistent_create_marker')).length,
    cases:cases.slice(0,30),cases_truncated:cases.length>30,
    read_only:true,writes_attempted:false,unique_constraint_verified:false};
}
