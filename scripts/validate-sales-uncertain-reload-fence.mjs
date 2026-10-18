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
 const activeRecordScopeRef={current:"current"};
 const liveViewSessionKeyRef={current:"filter-initial"};
 const liveEditPinsRef={current:{[id]:{source:"active-in-this-view"}}};
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
  activeRecordScopeRef,liveViewSessionKeyRef,liveEditPinsRef,
  Object,Map,Set,Promise,
  setLiveEditPinVersion:fn=>{renders++;},
  setReloadingSalesQuickEdits:v=>{renders++;},
  setQuickEditError:v=>{warning=v;},
  refreshSameTaskSaveNotice:fn=>{renders++;},
  clearTimeout:()=>{timersCancelled++;},
  loadWorkOrders:async(_loading,scope,requiredIds)=>{
   fetches++;
   eq(scope,"current","Reload request retains its original workspace.");
   eq([...requiredIds],[id],"Reload requires the affected WorkOrder to be present.");
   ok(!pendingChangesRef.current[id]&&!blockedFollowUpSavesRef.current.has(id) &&
      !liveEditPinsRef.current[id],
    "Authoritative refresh never overlays uncertain local changes or pins.");
   if(outcome==="deferred")return new Promise(resolve=>{finishLoad=resolve;});
   if(outcome==="missing")return "missing_required";
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
ok(!!failed.ctx.liveEditPinsRef.current[id],"Failed same-view reload restores the original live-edit pin.");
eq(failed.ctx.reloadingSalesQuickEditsRef.current,false,"Failed reload releases the click lock.");
eq(failed.timersCancelled,1,"Reload cancels stale scheduled writes without silently retrying.");

const succeeded=harness("success");
await succeeded.reload();
eq(succeeded.fetches,1,"Successful reload performs one read.");
ok(!succeeded.ctx.blockedFollowUpSavesRef.current.has(id),"Only a successful reload releases the safety fence.");
ok(!succeeded.ctx.pendingChangesRef.current[id],"Successful explicit reload clears unsaved optimistic intent.");
ok(!succeeded.ctx.pendingSalesGuardsRef.current[id],"Successful reload clears obsolete Sales guards.");
ok(!succeeded.ctx.liveEditPinsRef.current[id],"Successful reload removes stale live-edit pins, even for out-of-scope rows.");
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
const absent=harness("missing");
await absent.reload();
ok(absent.ctx.blockedFollowUpSavesRef.current.has(id),"A row missing from the scoped result never clears an unresolved-save block.");
ok(!absent.ctx.liveEditPinsRef.current[id],"A row that moved out of the workspace is not re-pinned as a phantom row.");
ok(absent.warning.includes("Outcomes or All Records"),"Moved rows direct the user to a workspace where authoritative values can be inspected.");
const changedWorkspace=harness("deferred");
const changedWorkspaceRequest=changedWorkspace.reload();
changedWorkspace.ctx.activeRecordScopeRef.current="outcomes";
changedWorkspace.ctx.liveViewSessionKeyRef.current="filter-outcomes";
changedWorkspace.finish(true);
await changedWorkspaceRequest;
ok(changedWorkspace.ctx.blockedFollowUpSavesRef.current.has(id),"Workspace change during a successful old request cannot unlock the save.");
ok(!changedWorkspace.ctx.liveEditPinsRef.current[id],"Old workspace pins do not reappear after navigation.");
ok(changedWorkspace.warning.includes("workspace or filter changed"),"Workspace changes require a fresh explicit reload.");
const changedFilter=harness("deferred");
const changedFilterRequest=changedFilter.reload();
changedFilter.ctx.liveViewSessionKeyRef.current="different-filter";
changedFilter.finish(true);
await changedFilterRequest;
ok(changedFilter.ctx.blockedFollowUpSavesRef.current.has(id),"Filter change during reload preserves the safety fence.");
ok(!changedFilter.ctx.liveEditPinsRef.current[id],"Old filter pins are not restored after a view change.");
console.log("Sales Phase 6N verified Reload latest write fencing: "+n+"/"+n+" PASS.");
