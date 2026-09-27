import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeWorkOrderHistory } from "../base44/shared/workOrderHistoricalEvidence.mjs";

const logs = [
  {id:"old",created_date:"2026-01-16T15:38:36Z",results:[{type:"workorders",success:true,filename:"January.xlsx"}]},
  {id:"last",created_date:"2026-09-22T14:40:10Z",results:[{type:"workorders",success:true,filename:"September.xlsx"}]},
  {id:"skipped",created_date:"2026-09-23T07:00:00Z",results:[{type:"workorders",success:false,skipped:true}]},
  {id:"failed",created_date:"2026-09-23T08:00:00Z",results:[{type:"workorders",success:false,error:"failed"}]},
  {id:"sales-before",created_date:"2026-09-23T21:14:19Z",results:[{type:"smartsheet_sales",success:true,filename:"pre_sync_only"}]},
  {id:"sales-after",created_date:"2026-09-24T10:00:00Z",results:[{type:"smartsheet_sales",success:true}]},
  {id:"sales-failed",created_date:"2026-09-25T10:00:00Z",results:[{type:"smartsheet_sales",success:false,error:"unavailable"}]},
];
const importJobs=[
  {id:"march",created_date:"2026-03-12T09:00:00Z",status:"cancelled",import_type:"sales_pipeline"},
  {id:"sept",created_date:"2026-09-23T11:00:00Z",status:"completed",import_type:"csv"},
];
const audit={creation_days:[{name:"2026-09-24",count:3},{name:"(missing)",count:1},{name:"2026-09-23",count:3031}]};
const original = structuredClone({logs,importJobs,audit});
const result=summarizeWorkOrderHistory(logs,importJobs,audit);
const expect = {
 backup_log_count:7,workorder_backup_attempts:4,workorder_backup_logged_success:2,
 workorder_backup_skipped:1,workorder_backup_failed:1,
 sales_presync_log_count:3,sales_presync_logged_success:2,
 first_sales_presync_log:"2026-09-23T21:14:19Z",
 latest_sales_presync_log:"2026-09-24T10:00:00Z",
 import_job_count:2,import_jobs_on_first_creation_day:1,
 workorders_created_after_last_logged_backup_day:3034,backup_files_verified:false,
};
for(const [key,value] of Object.entries(expect)) assert.deepEqual(result[key],value,key);
assert.deepEqual(result.last_logged_successful_workorder_backup,
  {logged_at:"2026-09-22T14:40:10Z",filename:"September.xlsx"});
assert.deepEqual(result.import_statuses,{cancelled:1,completed:1});
assert.deepEqual(result.import_types,{sales_pipeline:1,csv:1});
assert(!JSON.stringify(result).includes("pre_sync_only"),"pre-sync metadata must not be misrepresented as backup file");
assert.match(result.description,/does not verify/);
assert.deepEqual({logs,importJobs,audit},original,"source records must remain untouched");
assert.equal(summarizeWorkOrderHistory([],[],{creation_days:[]}).last_logged_successful_workorder_backup,null);
assert.equal(summarizeWorkOrderHistory([],[],{creation_days:[]}).workorders_created_after_last_logged_backup_day,null);
assert.throws(()=>summarizeWorkOrderHistory(null,[],audit),/complete/);
assert.throws(()=>summarizeWorkOrderHistory([],null,audit),/complete/);
assert.throws(()=>summarizeWorkOrderHistory([],[],{}),/complete/);
assert.throws(()=>summarizeWorkOrderHistory([{id:"x"},{id:"x"}],[],audit),/duplicated/);
assert.throws(()=>summarizeWorkOrderHistory([],[{id:"x"},{id:"x"}],audit),/duplicated/);
const gateway=readFileSync(new URL("../base44/functions/corebridgeApiAction/entry.ts",import.meta.url),"utf8");
assert(gateway.includes("authenticateSignShopSession"),"admin sign shop auth required");
assert(gateway.includes("summarizeWorkOrderHistory(backups, imports, audit)"),"backend must return complete summary");
assert(gateway.includes("loadHistoryRows(base44.asServiceRole.entities.BackupLog"),"backup history must be server-read");
assert(gateway.includes("loadHistoryRows(base44.asServiceRole.entities.ImportJob"),"import history must be server-read");
assert(!gateway.includes("safeExternalFetch")&&!gateway.includes("COREBRIDGE_SUBSCRIPTION_KEY"),"no CoreBridge requests");
assert(!/\.(create|update|delete|bulkCreate|bulkUpdate)\s*\(/.test(gateway),"no entity writes on retired gateway");
const ui=readFileSync(new URL("../src/components/admin/CorebridgeApiSettings.jsx",import.meta.url),"utf8");
assert(ui.includes("Historical backup and import evidence"),"admin UI must display provenance");
assert(ui.includes("BackupLog entries alone do not prove file availability"),"UI must disclose unverified backup bytes");
console.log("WorkOrder historical metadata: synthetic safety and integration checks PASS");
