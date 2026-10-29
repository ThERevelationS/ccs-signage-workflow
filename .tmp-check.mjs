const rows = await base44.entities.GlobalSettings.filter({ setting_key: 'smartsheetSalesSyncStatus' });
const v = rows[0].setting_value;
console.log('sales status:', v.status, '| completed:', v.completed_at);
const pull = (v.results||[]).find(r=>r.direction==='pull');
console.log('orphans flagged:', pull?.orphans_flagged_for_review, '| soft-deleted:', pull?.orphans_soft_deleted, '| ids:', JSON.stringify(pull?.orphans_soft_deleted_record_ids));
const wo = await base44.entities.WorkOrder.get('6adabff1d8bdac6656452c97').catch(e=>({err:e.message}));
console.log('DBL Law deleted:', wo?.deleted, '| by:', wo?.deleted_by, '| at:', wo?.deleted_at);
const alert = await base44.entities.GlobalSettings.filter({ setting_key: 'smartsheetSyncAlertConfig' });
console.log('alert dedup state:', JSON.stringify({sig: alert?.[0]?.setting_value?.last_alert_signature, at: alert?.[0]?.setting_value?.last_alert_at}));
