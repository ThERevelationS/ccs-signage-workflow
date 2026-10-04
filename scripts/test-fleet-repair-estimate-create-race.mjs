import test from "node:test";
import assert from "node:assert/strict";
import { createFleetRepairEstimateSafely } from "../base44/shared/fleetRepairEstimateCreate.ts";
import { FleetRecordConflictError } from "../base44/shared/fleetRecordPersistence.ts";

const clone = value => JSON.parse(JSON.stringify(value));
const matches = (row, query) => Object.entries(query).every(([key, value]) => row?.[key] === value);

class FakeGate {
  constructor(rows = [{ id:"gate-1",scope:"fleet_repair_estimate",status:"idle",updated_date:"g1" }]) {
    this.rows = clone(rows);
    this.revision = 1;
  }
  async filter(query) { return clone(this.rows.filter(row => matches(row, query))); }
  async get(id) { return clone(this.rows.find(row => row.id === id) || null); }
  async updateMany(query, update) {
    const hits = this.rows.filter(row => matches(row, query));
    for (const row of hits) {
      Object.assign(row, clone(update.$set || {}));
      row.updated_date = "g" + (++this.revision);
    }
    return { updated:hits.length };
  }
}

class FakeEstimate {
  constructor(rows = [], options = {}) {
    this.rows = clone(rows);
    this.createCount = 0;
    this.revision = rows.length + 1;
    this.createDelayMs = options.createDelayMs || 0;
    this.loseCreateAck = !!options.loseCreateAck;
    this.injectAfterCreate = options.injectAfterCreate || null;
    this.mutateBeforeDeleteIds = new Set(options.mutateBeforeDeleteIds || []);
  }
  async filter(query) { return clone(this.rows.filter(row => matches(row, query))); }
  async get(id) { return clone(this.rows.find(row => row.id === id) || null); }
  async create(payload) {
    this.createCount += 1;
    if (this.createDelayMs) await new Promise(resolve => setTimeout(resolve, this.createDelayMs));
    const row = { ...clone(payload), id:"estimate-" + this.createCount, updated_date:"e" + (++this.revision) };
    this.rows.push(row);
    if (this.injectAfterCreate) {
      const injected = typeof this.injectAfterCreate === "function" ? this.injectAfterCreate(clone(payload)) : clone(this.injectAfterCreate);
      this.rows.push({ ...injected, id:injected.id || "foreign-estimate", updated_date:injected.updated_date || "foreign-v1" });
      this.injectAfterCreate = null;
    }
    if (this.loseCreateAck) {
      this.loseCreateAck = false;
      throw new Error("Synthetic lost estimate create acknowledgment");
    }
    return clone(row);
  }
  async deleteMany(query) {
    const target = this.rows.find(row => matches(row, query));
    if (target && this.mutateBeforeDeleteIds.has(target.id)) {
      this.mutateBeforeDeleteIds.delete(target.id);
      target.notes = "Concurrent edit";
      target.updated_date = "e" + (++this.revision);
      return { deleted:0 };
    }
    const before = this.rows.length;
    this.rows = this.rows.filter(row => !matches(row, query));
    return { deleted:before - this.rows.length };
  }
}

const patch = overrides => ({
  equipment_id:"equipment-1",
  estimated_labor_hours:2,
  labor_rate:100,
  estimated_parts_total:25,
  estimated_fluids_total:5,
  misc_total:10,
  estimated_total:240,
  estimated_completion_date:"2026-10-01",
  parts_estimate:[{description:"Belt",quantity:1,estimated_cost:25}],
  fluids_estimate:[{description:"Oil",quantity:1,unit:"quarts",estimated_cost:5}],
  notes:"Initial repair estimate",
  approval_required:true,
  approval_tier:"Manager",
  ...overrides,
});
const args = (estimateEntity,gateEntity,overrides={}) => ({
  estimateEntity,
  gateEntity,
  workOrderId:"wo-1",
  creationKey:"repair-estimate:wo-1",
  desired:patch({}),
  ownerSource:"ccs_admin",
  ownerKey:"",
  gateAttempts:60,
  gateWaitMs:5,
  ...overrides,
});

test("simultaneous identical CCS admin first saves create exactly one estimate", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {createDelayMs:35});
  const [a,b] = await Promise.all([
    createFleetRepairEstimateSafely(args(estimate,gate)),
    createFleetRepairEstimateSafely(args(estimate,gate)),
  ]);
  assert.equal(estimate.createCount,1);
  assert.equal(estimate.rows.length,1);
  assert.equal(a.estimate.id,b.estimate.id);
  assert.deepEqual([a.reused,b.reused].sort(),[false,true]);
  assert.equal(gate.rows[0].status,"idle");
});

test("simultaneous identical same-mechanic first saves create exactly one estimate", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {createDelayMs:35});
  const mechanicArgs = args(estimate,gate,{
    ownerSource:"mechanic_portal",
    ownerKey:"grant-1",
    desired:patch({mechanic_name:"Mechanic A"}),
  });
  const [a,b] = await Promise.all([
    createFleetRepairEstimateSafely(mechanicArgs),
    createFleetRepairEstimateSafely(mechanicArgs),
  ]);
  assert.equal(estimate.createCount,1);
  assert.equal(estimate.rows.length,1);
  assert.equal(a.estimate.id,b.estimate.id);
  assert.equal(estimate.rows[0].mechanic_access_id,"grant-1");
  assert.equal(estimate.rows[0].estimate_source,"mechanic_portal");
});

test("CCS admin versus mechanic on the same work order can never create two estimates", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {createDelayMs:35});
  const admin = createFleetRepairEstimateSafely(args(estimate,gate));
  await new Promise(resolve => setTimeout(resolve,5));
  const mechanic = createFleetRepairEstimateSafely(args(estimate,gate,{
    ownerSource:"mechanic_portal",
    ownerKey:"grant-1",
    desired:patch({mechanic_name:"Mechanic A"}),
  }));
  const settled = await Promise.allSettled([admin,mechanic]);
  assert.equal(settled.filter(result=>result.status==="fulfilled").length,1);
  const rejected = settled.find(result=>result.status==="rejected");
  assert.ok(rejected?.reason instanceof FleetRecordConflictError);
  assert.match(rejected.reason.message,/different details or ownership|in progress/);
  assert.equal(estimate.createCount,1);
  assert.equal(estimate.rows.length,1);
  assert.equal(gate.rows[0].status,"idle");
});

test("two different mechanic grants on the same work order can never share ownership", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {createDelayMs:30});
  const first = createFleetRepairEstimateSafely(args(estimate,gate,{
    ownerSource:"mechanic_portal",ownerKey:"grant-1",desired:patch({mechanic_name:"Mechanic A"}),
  }));
  await new Promise(resolve => setTimeout(resolve,5));
  const second = createFleetRepairEstimateSafely(args(estimate,gate,{
    ownerSource:"mechanic_portal",ownerKey:"grant-2",desired:patch({mechanic_name:"Mechanic B"}),
  }));
  const settled = await Promise.allSettled([first,second]);
  assert.equal(settled.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(estimate.createCount,1);
  assert.equal(estimate.rows.length,1);
  assert.equal(estimate.rows[0].mechanic_access_id,"grant-1");
});

test("same owner with different first-save details is rejected rather than merged", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {createDelayMs:30});
  const first = createFleetRepairEstimateSafely(args(estimate,gate));
  await new Promise(resolve => setTimeout(resolve,5));
  const second = createFleetRepairEstimateSafely(args(estimate,gate,{desired:patch({notes:"Different details"})}));
  const settled = await Promise.allSettled([first,second]);
  assert.equal(settled.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(estimate.createCount,1);
  assert.equal(estimate.rows.length,1);
});

test("different work orders serialize through the singleton without collapsing either estimate", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {createDelayMs:20});
  const [a,b] = await Promise.all([
    createFleetRepairEstimateSafely(args(estimate,gate)),
    createFleetRepairEstimateSafely(args(estimate,gate,{
      workOrderId:"wo-2",
      creationKey:"repair-estimate:wo-2",
      desired:patch({equipment_id:"equipment-2",notes:"Second work order"}),
    })),
  ]);
  assert.equal(estimate.createCount,2);
  assert.equal(estimate.rows.length,2);
  assert.notEqual(a.estimate.id,b.estimate.id);
  assert.deepEqual(new Set(estimate.rows.map(row=>row.work_order_id)),new Set(["wo-1","wo-2"]));
});

test("lost create acknowledgment is idempotently recovered by the same owner and payload", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {loseCreateAck:true});
  await assert.rejects(()=>createFleetRepairEstimateSafely(args(estimate,gate)),/lost estimate create acknowledgment/);
  assert.equal(estimate.rows.length,1);
  assert.equal(gate.rows[0].status,"idle");
  const recovered = await createFleetRepairEstimateSafely(args(estimate,gate));
  assert.equal(recovered.reused,true);
  assert.equal(estimate.createCount,1);
  assert.equal(estimate.rows.length,1);
});

test("pre-create authorization guard can block a mechanic after gate acquisition without creating an estimate", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate();
  let checks = 0;
  await assert.rejects(
    ()=>createFleetRepairEstimateSafely(args(estimate,gate,{
      ownerSource:"mechanic_portal",
      ownerKey:"grant-1",
      desired:patch({mechanic_name:"Mechanic A"}),
      beforeCreate:()=>{
        checks += 1;
        const error = new Error("Mechanic access revoked before estimate creation");
        error.code = "FLEET_MECHANIC_ACCESS_REVOKED";
        throw error;
      },
    })),
    /Mechanic access revoked before estimate creation/,
  );
  assert.equal(checks,1);
  assert.equal(estimate.createCount,0);
  assert.equal(estimate.rows.length,0);
  assert.equal(gate.rows[0].status,"idle");
});

test("a bypassing foreign writer causes only this helper's unchanged losing row to be removed", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {
    injectAfterCreate: payload => ({
      ...payload,
      id:"foreign-estimate",
      updated_date:"foreign-v1",
      estimate_source:"mechanic_portal",
      mechanic_name:"Foreign Mechanic",
      mechanic_access_id:"foreign-grant",
    }),
  });
  await assert.rejects(
    ()=>createFleetRepairEstimateSafely(args(estimate,gate)),
    err=>err instanceof FleetRecordConflictError && /surviving estimate/.test(err.message),
  );
  assert.equal(estimate.rows.length,1);
  assert.equal(estimate.rows[0].id,"foreign-estimate");
  assert.equal(estimate.rows[0].mechanic_access_id,"foreign-grant");
});

test("this helper never deletes its losing row if that row changed before cleanup", async () => {
  const gate = new FakeGate();
  const estimate = new FakeEstimate([], {
    injectAfterCreate: payload => ({
      ...payload,
      id:"foreign-estimate",
      updated_date:"foreign-v1",
      estimate_source:"mechanic_portal",
      mechanic_name:"Foreign Mechanic",
      mechanic_access_id:"foreign-grant",
    }),
    mutateBeforeDeleteIds:["estimate-1"],
  });
  await assert.rejects(
    ()=>createFleetRepairEstimateSafely(args(estimate,gate)),
    err=>err instanceof FleetRecordConflictError && /newer data was preserved/.test(err.message),
  );
  assert.equal(estimate.rows.length,2);
  assert.equal(estimate.rows.find(row=>row.id==="estimate-1").notes,"Concurrent edit");
});

test("pre-existing duplicate estimates fail closed without deleting history", async () => {
  const d = patch({});
  const estimate = new FakeEstimate([
    {...d,id:"estimate-a",work_order_id:"wo-1",status:"draft",estimate_source:"ccs_admin",mechanic_access_id:"",creation_key:"repair-estimate:wo-1",updated_date:"e1"},
    {...d,id:"estimate-b",work_order_id:"wo-1",status:"draft",estimate_source:"ccs_admin",mechanic_access_id:"",creation_key:"repair-estimate:wo-1",updated_date:"e2"},
  ]);
  const gate = new FakeGate();
  await assert.rejects(
    ()=>createFleetRepairEstimateSafely(args(estimate,gate)),
    err=>err instanceof FleetRecordConflictError && /Existing records were preserved/.test(err.message),
  );
  assert.equal(estimate.rows.length,2);
  assert.equal(estimate.createCount,0);
});

test("missing or duplicate coordinators block all estimate writes", async () => {
  for (const gate of [
    new FakeGate([]),
    new FakeGate([
      {id:"gate-1",scope:"fleet_repair_estimate",status:"idle",updated_date:"g1"},
      {id:"gate-2",scope:"fleet_repair_estimate",status:"idle",updated_date:"g2"},
    ]),
  ]) {
    const estimate = new FakeEstimate();
    await assert.rejects(
      ()=>createFleetRepairEstimateSafely(args(estimate,gate)),
      err=>err instanceof FleetRecordConflictError && /coordinator is missing or ambiguous/.test(err.message),
    );
    assert.equal(estimate.createCount,0);
    assert.equal(estimate.rows.length,0);
  }
});
