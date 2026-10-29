const rows = await base44.entities.GlobalSettings.filter({});
const keys = rows.map(r => r.setting_key).filter(k => /sync|sales|smart/i.test(k||""));
console.log(keys.join("\n"));
const v = rows.find(r => r.setting_key === "smartsheetSalesSyncStatus");
console.log("raw row:", JSON.stringify(v).slice(0, 600));
