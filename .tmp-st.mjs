const rows = await base44.entities.GlobalSettings.filter({ setting_key: "smartsheetSalesSyncStatus" });
console.log("rows:", rows.length, rows.length ? Object.keys(rows[0]) : "");
const v = rows[0]?.setting_value ?? rows[0]?.value ?? null;
console.log("value type:", typeof v, v ? JSON.stringify(v).slice(0,400) : "null");
