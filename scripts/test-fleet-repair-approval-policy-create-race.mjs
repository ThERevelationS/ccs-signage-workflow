import test from "node:test";
import assert from "node:assert/strict";
import { createFleetRepairApprovalPolicySafely } from "../base44/shared/fleetRepairApprovalPolicyCreate.ts";
import { FleetRecordConflictError } from "../base44/shared/fleetRecordPersistence.ts";

const clone = value => JSON.parse(JSON.stringify(value));
const matches = (row, query) => Object.entries(query).every(([key, value]) => row?.[key] === value);

class FakeGate {
  constructor(rows = [{ id:"gate-1", scope:"fleet_repair_approval_policy", status:"idle", creation_key:"", payload_fingerprint:"", claim_token:"", updated_date:"g1" }]) {
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
    return { updated: hits.length };
  }
}

class FakePolicy {
  constructor(rows = [], { createDelayMs = 0, mutateBeforeDeleteIds = [] } = {}) {
    this.rows = clone(rows);
    this.createDelayMs = createDelayMs;
    this.createCount = 0;
    this.revision = rows.length + 1;
    this.mutateBeforeDeleteIds = new Set(mutateBeforeDeleteIds);
  }
  async filter(query) { return clone(this.rows.filter(row => matches(row, query))); }
  async get(id) { return clone(this.rows.find(row => row.id === id) || null); }
  async create(payload) {
    this.createCount += 1;
    if (this.createDelayMs) await new Promise(resolve => setTimeout(resolve, this.createDelayMs));
    const row = { ...clone(payload), id:"policy-" + this.createCount, updated_date:"p" + (++this.revision) };
    this.rows.push(row);
    return clone(row);
  }
  async deleteMany(query) {
    const target = this.rows.find(row => matches(row, query));
    if (target && this.mutateBeforeDeleteIds.has(target.id)) {
      this.mutateBeforeDeleteIds.delete(target.id);
      target.notes = "Concurrent edit";
      target.updated_date = "p" + (++this.revision);
      return { deleted: 0 };
    }
    const before = this.rows.length;
    this.rows = this.rows.filter(row => !matches(row, query));
    return { deleted: before - this.rows.length };
  }
}

const desired = overrides => ({
  name:"Manager Approval",
  enabled:true,
  minimum_amount:0,
  maximum_amount:5000,
  approval_tier:"Manager",
  approval_required:true,
  approver_role:"admin",
  notes:"",
  sort_order:0,
  ...overrides,
});

test("simultaneous same-key creates serialize to exactly one policy", async () => {
  const gate = new FakeGate();
  const policy = new FakePolicy([], { createDelayMs: 35 });
  const args = { policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-same-identity", desired:desired({}), gateAttempts:50, gateWaitMs:5 };
  const [a,b] = await Promise.all([
    createFleetRepairApprovalPolicySafely(args),
    createFleetRepairApprovalPolicySafely(args),
  ]);
  assert.equal(policy.createCount,1);
  assert.equal(policy.rows.length,1);
  assert.deepEqual([a.reused,b.reused].sort(),[false,true]);
  assert.equal(a.policy.id,b.policy.id);
  assert.equal(gate.rows[0].status,"idle");
});

test("same creation identity with different payload never creates a second threshold", async () => {
  const gate = new FakeGate();
  const policy = new FakePolicy([], { createDelayMs: 35 });
  const first = createFleetRepairApprovalPolicySafely({
    policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-conflict-key",
    desired:desired({name:"Manager Approval"}), gateAttempts:50, gateWaitMs:5,
  });
  await new Promise(resolve => setTimeout(resolve,5));
  const second = createFleetRepairApprovalPolicySafely({
    policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-conflict-key",
    desired:desired({name:"Director Approval",approval_tier:"Director"}), gateAttempts:50, gateWaitMs:5,
  });
  const settled = await Promise.allSettled([first,second]);
  assert.equal(settled.filter(result => result.status === "fulfilled").length,1);
  const rejected = settled.find(result => result.status === "rejected");
  assert.ok(rejected?.reason instanceof FleetRecordConflictError);
  assert.match(rejected.reason.message,/different threshold details/);
  assert.equal(policy.createCount,1);
  assert.equal(policy.rows.length,1);
  assert.equal(gate.rows[0].status,"idle");
});

test("different creation identities are serialized without collapsing valid policies", async () => {
  const gate = new FakeGate();
  const policy = new FakePolicy([], { createDelayMs: 20 });
  const [a,b] = await Promise.all([
    createFleetRepairApprovalPolicySafely({
      policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-key-aaaa",
      desired:desired({name:"Tier A",approval_tier:"A"}), gateAttempts:50, gateWaitMs:5,
    }),
    createFleetRepairApprovalPolicySafely({
      policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-key-bbbb",
      desired:desired({name:"Tier B",approval_tier:"B",minimum_amount:5000}), gateAttempts:50, gateWaitMs:5,
    }),
  ]);
  assert.equal(policy.createCount,2);
  assert.equal(policy.rows.length,2);
  assert.notEqual(a.policy.id,b.policy.id);
  assert.equal(gate.rows[0].status,"idle");
});

test("identical crash leftovers converge to one canonical policy with versioned deletes", async () => {
  const d = desired({});
  const policy = new FakePolicy([
    {...d,id:"policy-a",creation_key:"fleet-policy-crash-key",updated_date:"p1"},
    {...d,id:"policy-b",creation_key:"fleet-policy-crash-key",updated_date:"p2"},
  ]);
  const gate = new FakeGate();
  const result = await createFleetRepairApprovalPolicySafely({
    policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-crash-key", desired:d,
  });
  assert.equal(result.reused,true);
  assert.equal(result.policy.id,"policy-a");
  assert.equal(policy.createCount,0);
  assert.deepEqual(policy.rows.map(row=>row.id),["policy-a"]);
});

test("different crash leftovers fail closed and preserve both records", async () => {
  const d = desired({});
  const policy = new FakePolicy([
    {...d,id:"policy-a",creation_key:"fleet-policy-mixed-key",updated_date:"p1"},
    {...d,name:"Different",approval_tier:"Different",id:"policy-b",creation_key:"fleet-policy-mixed-key",updated_date:"p2"},
  ]);
  const gate = new FakeGate();
  await assert.rejects(
    () => createFleetRepairApprovalPolicySafely({
      policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-mixed-key", desired:d,
    }),
    err => err instanceof FleetRecordConflictError && /different threshold details/.test(err.message),
  );
  assert.equal(policy.createCount,0);
  assert.equal(policy.rows.length,2);
  assert.equal(gate.rows[0].status,"idle");
});

test("duplicate changed during cleanup is never deleted", async () => {
  const d = desired({});
  const policy = new FakePolicy([
    {...d,id:"policy-a",creation_key:"fleet-policy-cleanup-key",updated_date:"p1"},
    {...d,id:"policy-b",creation_key:"fleet-policy-cleanup-key",updated_date:"p2"},
  ], { mutateBeforeDeleteIds:["policy-b"] });
  const gate = new FakeGate();
  await assert.rejects(
    () => createFleetRepairApprovalPolicySafely({
      policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-cleanup-key", desired:d,
    }),
    err => err instanceof FleetRecordConflictError && /newer data was preserved/.test(err.message),
  );
  assert.equal(policy.rows.length,2);
  assert.equal(policy.rows.find(row=>row.id==="policy-b").notes,"Concurrent edit");
  assert.equal(gate.rows[0].status,"idle");
});

test("missing coordinator blocks creation before any policy write", async () => {
  const gate = new FakeGate([]);
  const policy = new FakePolicy();
  await assert.rejects(
    () => createFleetRepairApprovalPolicySafely({
      policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-no-gate", desired:desired({}),
    }),
    err => err instanceof FleetRecordConflictError && /coordinator is missing or ambiguous/.test(err.message),
  );
  assert.equal(policy.createCount,0);
  assert.equal(policy.rows.length,0);
});

test("duplicate coordinators block creation before any policy write", async () => {
  const gate = new FakeGate([
    {id:"gate-1",scope:"fleet_repair_approval_policy",status:"idle",updated_date:"g1"},
    {id:"gate-2",scope:"fleet_repair_approval_policy",status:"idle",updated_date:"g2"},
  ]);
  const policy = new FakePolicy();
  await assert.rejects(
    () => createFleetRepairApprovalPolicySafely({
      policyEntity:policy, gateEntity:gate, creationKey:"fleet-policy-two-gates", desired:desired({}),
    }),
    err => err instanceof FleetRecordConflictError && /coordinator is missing or ambiguous/.test(err.message),
  );
  assert.equal(policy.createCount,0);
});
