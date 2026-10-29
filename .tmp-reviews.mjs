const rows = await base44.entities.SmartsheetConflictReview.filter({ status: "open" }).catch(()=>[]);
console.log("open reviews:", rows.length);
const byRec = {};
for (const r of rows) { const k = r.entity_id; (byRec[k]=byRec[k]||[]).push(`${r.field_name}: local="${r.local_value}" remote="${r.remote_value}"`); }
for (const [id, fs] of Object.entries(byRec)) console.log(id, "→", fs.slice(0,4).join(" | "));
