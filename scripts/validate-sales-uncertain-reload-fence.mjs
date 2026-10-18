import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
let n=0;
const ok=(v,msg)=>{assert.ok(v,msg);n++;};
const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);n++;};
const src=readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
const start=src.indexOf("  const discardPendingQuickEdits = async () => {");
const stop=src.indexOf("\n  const [deleteConfirm",start);
ok(start>0&&stop>start,"Real Reload latest handler is used, not a test-only implementation.");
const code=src.slice(start,stop)+"\nglobalThis.reload=discardPendingQuickEdits;";
ok(src.includes("if (requestId !== loadRequestRef.current || scopeAtStart !== activeRecordScopeRef.current) return false;"),
 "Superseded reload cannot be reported successful.");
ok(src.includes("      return true;\n    } catch (error)")&&src.includes("      return false;\n    } finally {"),
 "Production loader distinguishes a verified reload from a failed request.");
ok(src.includes("if (reloadingSalesQuickEditsRef.current)")&&
 src.includes("disabled={reloadingSalesQuickEdits}"),
 "Second Reload latest press is blocked synchronously and in UI.");

const id="synthetic-Sales-uncertain";
const before={lead_source:"Phone"};
const next={lead_source:"Website"};
function harness(outcome){
 let fetches=0,warning="older uncertain save warning",renders=0,timersCancelled=0;
 let finishLoad;
 const reloadingSalesQuickEditsRef={current:false};
 const pendingChangesRef={current:{[id]:next}};
 const pendingBaselinesRef={current:{[id]:before}};
 const pendingSalesGuardsRef={current:{[id]:{sales_status:"lead"}}};
 const pendingFollowUpGuardsRef={current:{[id]:{follow_up_date:"2026-10-15"}}};
 const blockedFollowUpSavesRef={current:new Set([id])};
 const pendingHistoryFieldsRef={current:{[id]:new Set(["lead_source"])}};
 const pendingRecordScopesRef={current:{[id]:"current"}};
 const pendingSameTaskRepairRef={current:new Set([id])};
 const failedSameTaskRepairRef={current:new Map([[id,"prior repair failed"]])};
 const resolvedReviewExitRef={current:{id,filterKey:"current"}};
 const debounceTimers={current:{[id]:44}};
 const ctx={
  reloadingSalesQuickEditsRef,pendingChangesRef,pendingBaselinesRef,
  pendingSalesGuardsRef,pendingFollowUpGuardsRef,blockedFollowUpSavesRef,
  pendingHistoryFieldsRef,pendingRecordScopesRef,pendingSameTaskRepairRef,
  failedSameTaskRepairRef,resolvedReviewExitRef,debounceTimers,
  Object,Map,Set,Promise,
  setReloadingSalesQuickEdits:v=>{renders++;},
  setQuickEditError:v=>{warning=v;},
  refreshSameTaskSaveNotice:fn=>{renders++;},
  clearTimeout:()=>{timersCancelled++;},
  loadWorkOrders:async()=>{
   fetches++;
   ok(!pendingChangesRef.current[id]&&!blockedFollowUpSavesRef.current.has(id),
    "Authoritative refresh never overlays uncertain local changes.");
   if(outcome==="deferred")return new Promise(resolve=>{finishLoad=resolve;});
   return outcome==="success";
  },
 };
 runInNewContext(code,ctx,{timeout:3000});
 return {ctx,get fetches(){return fetches;},get warning(){return warning;},
  get renders(){return renders;},get timersCancelled(){return timersCancelled;},
  finish(value){finishLoad(value);},reload:()=>ctx.reload()};
}
const failed=harness("fail");
await failed.reload();
eq(failed.fetches,1,"Failed reload attempts one read.");
ok(failed.ctx.blockedFollowUpSavesRef.current.has(id),"Failed reload restores original safety fence.");
eq(failed.ctx.pendingChangesRef.current[id],next,"Failed reload preserves original queued values.");
eq(failed.ctx.pendingBaselinesRef.current[id],before,"Failed reload preserves original baselines.");
ok(failed.ctx.pendingSameTaskRepairRef.current.has(id),"Failed reload preserves pending same-task repair.");
ok(failed.ctx.failedSameTaskRepairRef.current.has(id),"Failed reload preserves same-task error evidence.");
ok(failed.ctx.pendingHistoryFieldsRef.current[id].has("lead_source"),"Failed reload restores history intentions.");
ok(failed.warning.includes("save safety block are preserved"),"Failure warning does not claim reload success.");
eq(failed.ctx.reloadingSalesQuickEditsRef.current,false,"Failed reload releases the click lock.");
eq(failed.timersCancelled,1,"Reload cancels stale scheduled writes without silently retrying.");

const succeeded=harness("success");
await succeeded.reload();
eq(succeeded.fetches,1,"Successful reload performs one read.");
ok(!succeeded.ctx.blockedFollowUpSavesRef.current.has(id),"Only a successful reload releases the safety fence.");
ok(!succeeded.ctx.pendingChangesRef.current[id],"Successful explicit reload clears unsaved optimistic intent.");
ok(!succeeded.ctx.pendingSalesGuardsRef.current[id],"Successful reload clears obsolete Sales guards.");
eq(succeeded.warning,"","Successful reload clears the stale save warning.");
eq(succeeded.ctx.reloadingSalesQuickEditsRef.current,false,"Successful reload releases button lock.");

const simultaneous=harness("deferred");
const first=simultaneous.reload();
await Promise.resolve();
const second=simultaneous.reload();
await second;
eq(simultaneous.fetches,1,"Rapid double-click cannot trigger a second reload.");
ok(simultaneous.ctx.reloadingSalesQuickEditsRef.current,"Original reload retains lock until resolved.");
simultaneous.finish(false);
await first;
ok(simultaneous.ctx.blockedFollowUpSavesRef.current.has(id),
 "Superseded/failed refresh cannot unlock uncertain Sales save.");
eq(simultaneous.ctx.reloadingSalesQuickEditsRef.current,false,"Reload lock releases after terminal outcome.");
console.log("Sales Phase 6N verified Reload latest write fencing: "+n+"/"+n+" PASS.");
