import assert from "node:assert/strict";
import test from "node:test";
import { requireCurrentMechanicGrantForCommittedResponse } from "../base44/shared/fleetMechanicCommittedResponse.ts";

class FakeAccess {
  constructor(grant) {
    this.grant = structuredClone(grant);
  }

  async get(id) {
    if (String(id) !== String(this.grant?.id || "")) return null;
    return structuredClone(this.grant);
  }

  mutate(patch) {
    this.grant = {...this.grant,...structuredClone(patch)};
  }
}

class FakeEntity {
  constructor(row) {
    this.row = structuredClone(row);
  }

  async update(id, patch) {
    assert.equal(String(id), String(this.row.id));
    this.row = {...this.row,...structuredClone(patch)};
    return structuredClone(this.row);
  }

  async get(id) {
    assert.equal(String(id), String(this.row.id));
    return structuredClone(this.row);
  }
}

const baseGrant = () => ({
  id:"grant-1",
  enabled:true,
  allowed_actions:["bootstrap","start","save","estimate_save","estimate_submit"],
  scope_mode:"all_active",
  allowed_equipment_ids:[],
  expires_at:"2099-01-01T00:00:00.000Z",
});

async function commitThenAttemptProtectedResponse({
  access,
  entity,
  entityId,
  patch,
  action,
  equipmentId,
  afterCommit,
  project,
}) {
  const persisted = await entity.update(entityId,patch);
  await afterCommit();
  await requireCurrentMechanicGrantForCommittedResponse(access,"grant-1",action,equipmentId,Date.parse("2026-10-04T22:00:00-04:00"));
  return project(persisted);
}

async function expectPostCommitBlock(config) {
  let exposed = null;
  let thrown = null;
  try {
    exposed = await commitThenAttemptProtectedResponse(config);
  } catch (error) {
    thrown = error;
  }
  assert.equal(exposed,null,"protected Fleet result must not be returned after the grant changes");
  assert.ok(thrown instanceof Error,"post-commit access change must reject the response");
  assert.equal(thrown.code,"FLEET_MECHANIC_ACCESS_REVOKED");
  assert.match(thrown.message,/may have been committed/);
  assert.match(thrown.message,/Check current server state with CCS before retrying/);
  return thrown;
}

test("Start Work stays durably committed when the mechanic link is revoked before its response", async () => {
  const access = new FakeAccess(baseGrant());
  const workOrders = new FakeEntity({id:"wo-1",equipment_id:"eq-1",status:"open",started_date:""});
  await expectPostCommitBlock({
    access,
    entity:workOrders,
    entityId:"wo-1",
    patch:{status:"in_progress",started_date:"2026-10-04",mechanic_operation_key:"mechanic:grant-1:wo-1:start:req-start"},
    action:"start",
    equipmentId:"eq-1",
    afterCommit:async()=>access.mutate({enabled:false}),
    project:(row)=>({success:true,work_order:row}),
  });
  const durable = await workOrders.get("wo-1");
  assert.equal(durable.status,"in_progress");
  assert.equal(durable.started_date,"2026-10-04");
  assert.match(durable.mechanic_operation_key,/start/);
});

test("Save Progress stays durably committed when equipment scope is removed before its response", async () => {
  const access = new FakeAccess(baseGrant());
  const workOrders = new FakeEntity({id:"wo-1",equipment_id:"eq-1",actual_hours:1,corrective_action:"",after_photos:[]});
  await expectPostCommitBlock({
    access,
    entity:workOrders,
    entityId:"wo-1",
    patch:{actual_hours:2.5,corrective_action:"Replaced belt",after_photos:["https://files.example/final.jpg"]},
    action:"save",
    equipmentId:"eq-1",
    afterCommit:async()=>access.mutate({scope_mode:"selected_equipment",allowed_equipment_ids:["eq-2"]}),
    project:(row)=>({success:true,work_order:row}),
  });
  const durable = await workOrders.get("wo-1");
  assert.equal(durable.actual_hours,2.5);
  assert.equal(durable.corrective_action,"Replaced belt");
  assert.deepEqual(durable.after_photos,["https://files.example/final.jpg"]);
});

test("Save Draft stays durably committed when estimate permission is removed before financial details return", async () => {
  const access = new FakeAccess(baseGrant());
  const estimates = new FakeEntity({id:"estimate-1",equipment_id:"eq-1",status:"draft",estimated_total:100});
  const error = await expectPostCommitBlock({
    access,
    entity:estimates,
    entityId:"estimate-1",
    patch:{estimated_total:4321.67,labor_total:1200,parts_total:3121.67,status:"draft"},
    action:"estimate_save",
    equipmentId:"eq-1",
    afterCommit:async()=>access.mutate({allowed_actions:["bootstrap","start","save","estimate_submit"]}),
    project:(row)=>({success:true,estimate:row}),
  });
  const durable = await estimates.get("estimate-1");
  assert.equal(durable.estimated_total,4321.67);
  assert.equal(durable.status,"draft");
  assert.equal(error.message.includes("4321.67"),false,"blocked response error must not leak estimate dollars");
});

test("Submit Estimate stays durably committed when the link expires before its response", async () => {
  const access = new FakeAccess(baseGrant());
  const estimates = new FakeEntity({id:"estimate-1",equipment_id:"eq-1",status:"draft",estimated_total:2200});
  await expectPostCommitBlock({
    access,
    entity:estimates,
    entityId:"estimate-1",
    patch:{status:"submitted",submitted_at:"2026-10-04T22:00:00.000Z",approval_required:true},
    action:"estimate_submit",
    equipmentId:"eq-1",
    afterCommit:async()=>access.mutate({expires_at:"2026-10-04T21:59:59-04:00"}),
    project:(row)=>({success:true,estimate:row}),
  });
  const durable = await estimates.get("estimate-1");
  assert.equal(durable.status,"submitted");
  assert.equal(durable.approval_required,true);
});
