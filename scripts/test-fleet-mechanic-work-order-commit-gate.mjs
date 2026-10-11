// Synthetic acceptance for the real Fleet mechanic receiving-service commit gate.
// No Base44 network, entities, or live Fleet records are accessed.
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import {readFileSync} from "node:fs";
import path from "node:path";

const root=process.cwd();
const transpile=file=>ts.transpileModule(
  readFileSync(path.join(root,file),"utf8"),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}},
).outputText;
const recoveryUrl="data:text/javascript;base64,"+Buffer.from(
  transpile("base44/shared/fleetMechanicMutationRecovery.ts")
).toString("base64");
const gateJs=transpile("base44/shared/fleetMechanicWorkOrderCommitGate.ts")
  .replace("'./fleetMechanicMutationRecovery.ts'",JSON.stringify(recoveryUrl));
const gateUrl="data:text/javascript;base64,"+Buffer.from(gateJs).toString("base64");
const {verifyFleetMechanicWorkOrderCommit:verify}=await import(gateUrl);
const {buildMechanicRecoveryPatch}=await import(recoveryUrl);

const grantId="grant-verified",workId="work-verified",requestId="request-check-123456",expected="version-1";
const key=action=>`mechanic:${grantId}:${workId}:${action}:${requestId}`;
const snapshot=()=>({
  id:workId,status:"in_progress",equipment_id:"equipment-good",updated_date:expected,
  actual_hours:1,corrective_action:"",notes:"Before mechanic",after_photos:[],
});
const urls=["https://files.example/one.jpg","https://files.example/two.jpg"];
const receipt=(action="save")=>({
  id:"receipt-one",operation_key:key(action),operation_type:action==="start"?"mechanic_start":"mechanic_progress_save",
  target_entity:"FleetMaintenanceWorkOrder",target_id:workId,
  actor_user_id:grantId,payload_fingerprint:"fingerprint-verified",status:"started",
  result_summary:{
    grant_id:grantId,action,request_id:requestId,expected_updated_date:expected,
    ...(action==="save"?{photo_count:2,uploaded_photo_urls:[...urls],retry_reservation_required:false}:{}),
    mutation_plan:action==="start"
      ?{started_date:"2026-10-10",appended_note:"[Mechanic] Start"}
      :{actual_hours:2.5,corrective_action:"Replaced belt",appended_note:"[Mechanic] Save"},
  },
});
function context(action="save"){
  const current=snapshot();
  const row=receipt(action);
  const grant={id:grantId,enabled:true,scope_mode:"all_active",allowed_actions:["bootstrap","start","save"],
    expires_at:"2099-01-01T00:00:00.000Z"};
  const source={id:"source-one",status:"started",payload_fingerprint:row.payload_fingerprint,
    result_summary:{grant_id:grantId,retry_reserved_by_request_id:requestId,uploaded_photo_urls:[urls[0]]}};
  const rows=[row];
  const Access={async get(id){return id===grantId?structuredClone(grant):null;}};
  const Receipt={
    async filter(filter){return rows.filter(item=>item.operation_key===filter.operation_key).map(item=>structuredClone(item));},
    async get(id){return id===source.id?structuredClone(source):id===row.id?structuredClone(row):null;},
  };
  const patch=buildMechanicRecoveryPatch(current,row,"2026-10-10T22:00:00.000Z").patch;
  const args={Access,Receipt,workOrder:current,patch,expectedUpdatedAt:expected,nowMs:Date.parse("2026-10-10T22:00:00Z")};
  return {args,row,rows,grant,source,current};
}
const accept=ctx=>verify(ctx.args);
const reject=async (ctx,pattern=/blocked before the work-order write/) =>
  assert.rejects(()=>accept(ctx),error=>error?.code==="FLEET_RECORD_CONFLICT"&&pattern.test(error.message));

test("ordinary CCS work-order edits do not require mechanic receipts",async()=>{
  const ctx=context();
  ctx.args.patch={notes:"Ordinary CCS update"};
  ctx.rows.length=0;ctx.grant.enabled=false;
  await accept(ctx);
});
test("valid Fleet mechanic Start and Save plans pass the service-edge gate",async()=>{
  await accept(context("start"));
  await accept(context("save"));
});
test("revoked, expired, disallowed, and out-of-scope grants stop a dispatched mechanic update",async()=>{
  for(const action of ["start","save"]){
    for(const mode of ["revoked","expired","action","scope"]){
      const ctx=context(action);
      if(mode==="revoked")ctx.grant.enabled=false;
      if(mode==="expired")ctx.grant.expires_at="2026-10-09T00:00:00.000Z";
      if(mode==="action")ctx.grant.allowed_actions=["bootstrap"];
      if(mode==="scope"){ctx.grant.scope_mode="selected_equipment";ctx.grant.allowed_equipment_ids=["other-equipment"];}
      await reject(ctx,new RegExp(mode==="action"?"action_not_allowed":mode==="scope"?"outside_scope":mode));
    }
  }
});
test("cancelled, failed, applied, duplicate and missing receipts block work writes",async()=>{
  for(const state of ["cancelled","failed","applied"]){const ctx=context();ctx.row.status=state;await reject(ctx);}
  const absent=context();absent.rows.length=0;await reject(absent,/missing or ambiguous/);
  const duplicate=context();duplicate.rows.push(structuredClone(duplicate.row));await reject(duplicate,/missing or ambiguous/);
});
test("immutable identities, equipment status and stale version are verified",async()=>{
  const scenarios=[
    ctx=>ctx.row.payload_fingerprint="other-fingerprint",
    ctx=>ctx.row.actor_user_id="other-grant",
    ctx=>ctx.row.target_id="other-work",
    ctx=>ctx.row.result_summary.grant_id="other-grant",
    ctx=>ctx.row.result_summary.request_id="other-request",
    ctx=>ctx.row.result_summary.expected_updated_date="different-version",
    ctx=>ctx.current.updated_date="different-version",
    ctx=>ctx.current.status="cancelled",
    ctx=>ctx.args.patch.mechanic_operation_key="mechanic:wrong:other:save:request-mismatched-987654",
    ctx=>ctx.args.patch.mechanic_operation_fingerprint="different-fingerprint",
  ];
  for(const change of scenarios){const ctx=context();change(ctx);await reject(ctx);}
});
test("service boundary rejects altered work, forged marker fields, and incomplete photo evidence",async()=>{
  const changes=[
    ctx=>ctx.args.patch.notes="Unauthorized content",
    ctx=>ctx.args.patch.actual_hours=9000,
    ctx=>ctx.args.patch.after_photos=["https://files.example/substituted.jpg"],
    ctx=>ctx.args.patch.parts_used=[{part_id:"not-authorized",quantity:1}],
    ctx=>ctx.row.result_summary.uploaded_photo_urls=[urls[0]],
    ctx=>ctx.row.result_summary.mutation_plan.corrective_action="Changed in receipt after dispatch",
  ];
  for(const change of changes){const ctx=context();change(ctx);await reject(ctx);}
});
test("reused-photo source reservation remains bound to exact operation and URL prefix",async()=>{
  const valid=context();
  valid.row.result_summary.retry_reservation_required=true;
  valid.row.result_summary.reused_upload_receipt_id=valid.source.id;
  await accept(valid);
  const changes=[
    ctx=>ctx.source.status="failed",
    ctx=>ctx.source.result_summary.retry_reserved_by_request_id="request-other-123456",
    ctx=>ctx.source.result_summary.uploaded_photo_urls=["https://files.example/replaced.jpg"],
    ctx=>ctx.source.payload_fingerprint="other",
  ];
  for(const change of changes){
    const ctx=context();
    ctx.row.result_summary.retry_reservation_required=true;
    ctx.row.result_summary.reused_upload_receipt_id=ctx.source.id;
    change(ctx);await reject(ctx,/reused-photo reservation/);
  }
});
test("admin cancellation during receiving-service grant read stops the pending work write",async()=>{
  for(const action of ["start","save"]){
    const ctx=context(action);
    let grantsRead=0;
    ctx.args.Access.get=async()=>{
      if(++grantsRead===1)ctx.row.status="cancelled";
      return structuredClone(ctx.grant);
    };
    await reject(ctx,/receipt changed during authorization/);
  }
});
test("revocation during receipt reread is rejected by the final grant read",async()=>{
  for(const action of ["start","save"]){
    const ctx=context(action);
    const originalGet=ctx.args.Receipt.get;
    ctx.args.Receipt.get=async id=>{
      if(id===ctx.row.id)ctx.grant.enabled=false;
      return originalGet(id);
    };
    await reject(ctx,/mechanic link changed to revoked/);
  }
});
test("changed receipt plan after initial verification cannot be committed",async()=>{
  for(const action of ["start","save"]){
    const ctx=context(action);
    const originalGet=ctx.args.Receipt.get;
    ctx.args.Receipt.get=async id=>{
      if(id===ctx.row.id)ctx.row.result_summary.mutation_plan.appended_note="Altered after first verification";
      return originalGet(id);
    };
    await reject(ctx,/mutation plan or photo evidence changed during authorization/);
  }
});
test("photo-retry reservation identity cannot disappear after the initial service check",async()=>{
  for(const change of [
    ctx=>{ctx.row.result_summary.retry_reservation_required=false;},
    ctx=>{ctx.row.result_summary.reused_upload_receipt_id="different-source";},
    ctx=>{ctx.row.result_summary.photo_count=1;},
  ]){
    const ctx=context();
    ctx.row.result_summary.retry_reservation_required=true;
    ctx.row.result_summary.reused_upload_receipt_id=ctx.source.id;
    const originalGet=ctx.args.Receipt.get;
    ctx.args.Receipt.get=async id=>{
      if(id===ctx.row.id)change(ctx);
      return originalGet(id);
    };
    await reject(ctx,/receipt changed during authorization/);
  }
});
test("reused-photo owner changed during grant authorization blocks receipt reconciliation",async()=>{
  const ctx=context();
  ctx.row.result_summary.retry_reservation_required=true;
  ctx.row.result_summary.reused_upload_receipt_id=ctx.source.id;
  let sourceReads=0;
  const originalGet=ctx.args.Receipt.get;
  ctx.args.Receipt.get=async id=>{
    if(id===ctx.source.id&&++sourceReads===2)
      ctx.source.result_summary.retry_reserved_by_request_id="request-other-owner-123456";
    return originalGet(id);
  };
  await reject(ctx,/photo reservation changed during authorization/);
});
test("a grant revoked after the final read cannot be made atomic with WorkOrder CAS",async()=>{
  const ctx=context("save");
  await accept(ctx);
  // Synthetic interleaving: the final gate has returned, then an admin revokes
  // the grant before updateMany. The documented entity API cannot join them.
  ctx.grant.enabled=false;
  const persistenceJs=transpile("base44/shared/fleetRecordPersistence.ts");
  const persistenceUrl="data:text/javascript;base64,"+Buffer.from(persistenceJs).toString("base64");
  const {updateFleetRecordIfCurrent}=await import(persistenceUrl);
  let writes=0;
  const live=structuredClone(ctx.current);
  const WorkOrder={
    async updateMany(filter,ops){
      if(filter.id!==live.id||filter.updated_date!==live.updated_date)return {updated:0};
      Object.assign(live,structuredClone(ops.$set),{updated_date:"version-2"});
      writes++;
      return {updated:1};
    },
    async get(){return structuredClone(live);},
  };
  const committed=await updateFleetRecordIfCurrent({
    entity:WorkOrder,id:workId,expectedUpdatedAt:expected,patch:ctx.args.patch,
  });
  assert.equal(writes,1,"The Fleet version CAS cannot also read the grant atomically");
  assert.equal(committed.mechanic_operation_key,key("save"));
  const committedResponseJs=transpile("base44/shared/fleetMechanicCommittedResponse.ts")
    .replace("'./fleetMechanicMutationRecovery.ts'",JSON.stringify(recoveryUrl));
  const committedResponseUrl="data:text/javascript;base64,"+Buffer.from(committedResponseJs).toString("base64");
  const {requireCurrentMechanicGrantForCommittedResponse}=await import(committedResponseUrl);
  await assert.rejects(
    ()=>requireCurrentMechanicGrantForCommittedResponse(ctx.args.Access,grantId,"save",ctx.current.equipment_id),
    error=>error?.code==="FLEET_MECHANIC_ACCESS_REVOKED",
    "The mechanic must not receive committed Fleet details after revocation",
  );
});

test("record version CAS is still required after service-edge authorization",async()=>{
  const helper=transpile("base44/shared/fleetRecordPersistence.ts");
  assert.match(helper,/updated_date:\s*expected/);
  const entry=readFileSync(path.join(root,"base44/functions/fleetWorkOrderAction/entry.ts"),"utf8");
  const start=entry.indexOf("await verifyFleetMechanicWorkOrderCommit({");
  const next=entry.indexOf("await updateFleetRecordIfCurrent({",start);
  assert.ok(start>0&&next>start,"Service-edge check remains directly before Fleet versioned CAS");
});
