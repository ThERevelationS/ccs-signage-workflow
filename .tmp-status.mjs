for (const key of ["smartsheetSalesSyncStatus","smartsheetOrderSyncStatus","smartsheetSyncStatus"]) {
  const rows = await base44.entities.GlobalSettings.filter({ setting_key: key }).catch(()=>[]);
  const v = rows?.[0]?.setting_value;
  console.log("=== "+key+" ===");
  console.log(JSON.stringify(v, null, 1).slice(0, 3000));
}
