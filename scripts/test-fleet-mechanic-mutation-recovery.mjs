import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMechanicRecoveryPatch,
  mechanicGrantAllowsMutation,
  selectReusableMechanicUploads,
} from "../base44/shared/fleetMechanicMutationRecovery.ts";

const current = (overrides={}) => ({
  id:"wo-1",
  updated_date:"v1",
  status:"in_progress",
  started_date:"2026-09-30",
  actual_hours:1,
  corrective_action:"Existing",
  notes:"Existing note",
  after_photos:["https://files.example/existing.jpg"],
  ...overrides,
});

const receipt = (overrides={}) => ({
  id:"receipt-1",
  operation_key:"mechanic:grant:wo-1:save:req-1",
  payload_fingerprint:"fingerprint-1",
  status:"started",
  created_date:"2026-09-30T12:00:00.000Z",
  result_summary:{
    action:"save",
    expected_updated_date:"v1",
    photo_count:2,
    uploaded_photo_urls:[
      "https://files.example/photo-a.jpg",
      "https://files.example/photo-b.jpg",
    ],
    mutation_plan:{
      actual_hours:2.5,
      corrective_action:"Replaced belt",
      appended_note:"[Mechanic – Test]\nCompleted repair",
    },
  },
  ...overrides,
});

test("complete stranded Save Progress can recover without re-uploading photos", () => {
  const result = buildMechanicRecoveryPatch(current(),receipt(),"2026-09-30T12:05:00.000Z");
  assert.equal(result.recoverable,true);
  assert.deepEqual(result.patch.after_photos,[
    "https://files.example/existing.jpg",
    "https://files.example/photo-a.jpg",
    "https://files.example/photo-b.jpg",
  ]);
  assert.equal(result.patch.actual_hours,2.5);
  assert.equal(result.patch.corrective_action,"Replaced belt");
  assert.match(result.patch.notes,/Completed repair/);
  assert.equal(result.patch.mechanic_operation_key,"mechanic:grant:wo-1:save:req-1");
  assert.equal(result.patch.mechanic_operation_fingerprint,"fingerprint-1");
});

test("recovery patch never duplicates already attached photo URLs or note text", () => {
  const row = current({
    notes:"Existing note\n\n[Mechanic – Test]\nCompleted repair",
    after_photos:["https://files.example/existing.jpg","https://files.example/photo-a.jpg"],
  });
  const result = buildMechanicRecoveryPatch(row,receipt(),"2026-09-30T12:05:00.000Z");
  assert.equal(result.recoverable,true);
  assert.equal((result.patch.notes.match(/Completed repair/g)||[]).length,1);
  assert.deepEqual(result.patch.after_photos,[
    "https://files.example/existing.jpg",
    "https://files.example/photo-a.jpg",
    "https://files.example/photo-b.jpg",
  ]);
});

test("partial uploaded-photo evidence fails closed instead of inventing or re-uploading", () => {
  const row = receipt({
    result_summary:{
      ...receipt().result_summary,
      photo_count:2,
      uploaded_photo_urls:["https://files.example/photo-a.jpg"],
    },
  });
  const result = buildMechanicRecoveryPatch(current(),row,"2026-09-30T12:05:00.000Z");
  assert.deepEqual(result,{recoverable:false,reason:"incomplete_upload_evidence"});
});

test("changed work-order version prevents automatic replay", () => {
  const result = buildMechanicRecoveryPatch(current({updated_date:"v2"}),receipt(),"2026-09-30T12:05:00.000Z");
  assert.deepEqual(result,{recoverable:false,reason:"work_order_version_changed"});
});

test("Start Work receipt contains enough plan data to recover once", () => {
  const startReceipt = receipt({
    operation_key:"mechanic:grant:wo-1:start:req-2",
    payload_fingerprint:"start-fingerprint",
    result_summary:{
      action:"start",
      expected_updated_date:"v1",
      mutation_plan:{
        started_date:"2026-09-30",
        appended_note:"[Mechanic – Test]\\nStarting repair",
      },
    },
  });
  const result = buildMechanicRecoveryPatch(current({status:"open",started_date:""}),startReceipt,"2026-09-30T12:06:00.000Z");
  assert.equal(result.recoverable,true);
  assert.equal(result.patch.status,"in_progress");
  assert.equal(result.patch.started_date,"2026-09-30");
  assert.match(result.patch.notes,/Starting repair/);
});

test("identical retry reuses the longest failed upload prefix only", () => {
  const rows = [
    receipt({
      id:"failed-short",
      status:"failed",
      payload_fingerprint:"same",
      created_date:"2026-09-30T12:00:00.000Z",
      result_summary:{action:"save",uploaded_photo_urls:["https://files.example/a.jpg"]},
    }),
    receipt({
      id:"failed-long",
      status:"failed",
      payload_fingerprint:"same",
      created_date:"2026-09-30T12:01:00.000Z",
      result_summary:{action:"save",uploaded_photo_urls:["https://files.example/a.jpg","https://files.example/b.jpg"]},
    }),
    receipt({
      id:"wrong-payload",
      status:"failed",
      payload_fingerprint:"different",
      result_summary:{action:"save",uploaded_photo_urls:["https://files.example/x.jpg","https://files.example/y.jpg","https://files.example/z.jpg"]},
    }),
    receipt({
      id:"already-applied",
      status:"applied",
      payload_fingerprint:"same",
      result_summary:{action:"save",uploaded_photo_urls:["https://files.example/used.jpg"]},
    }),
  ];
  const reusable = selectReusableMechanicUploads(rows,"same",3);
  assert.equal(reusable.receipt_id,"failed-long");
  assert.deepEqual(reusable.urls,["https://files.example/a.jpg","https://files.example/b.jpg"]);
});

test("malformed stored URLs are never reused", () => {
  const rows = [receipt({
    id:"bad-url",
    status:"failed",
    payload_fingerprint:"same",
    result_summary:{action:"save",uploaded_photo_urls:["javascript:alert(1)"]},
  })];
  assert.deepEqual(selectReusableMechanicUploads(rows,"same",1),{urls:[],receipt_id:"",operation_key:""});
});

test("live mechanic authorization rejects revoked and expired grants", () => {
  const base = {enabled:true,allowed_actions:["bootstrap","start","save"],scope_mode:"all_active",allowed_equipment_ids:[]};
  assert.deepEqual(mechanicGrantAllowsMutation({...base,enabled:false},"save","eq-1",1000),{allowed:false,reason:"revoked"});
  assert.deepEqual(mechanicGrantAllowsMutation({...base,expires_at:"1970-01-01T00:00:00.500Z"},"save","eq-1",1000),{allowed:false,reason:"expired"});
});

test("live mechanic authorization enforces current action and equipment scope", () => {
  const grant = {enabled:true,allowed_actions:["bootstrap","start"],scope_mode:"selected_equipment",allowed_equipment_ids:["eq-1"]};
  assert.deepEqual(mechanicGrantAllowsMutation(grant,"save","eq-1",1000),{allowed:false,reason:"action_not_allowed"});
  assert.deepEqual(mechanicGrantAllowsMutation(grant,"start","eq-2",1000),{allowed:false,reason:"outside_scope"});
  assert.deepEqual(mechanicGrantAllowsMutation(grant,"start","eq-1",1000),{allowed:true,reason:""});
});

test("live mechanic estimate authorization fails closed after permission or equipment scope removal", () => {
  const grant = {
    enabled:true,
    allowed_actions:["bootstrap","start","save","estimate_save","estimate_submit"],
    scope_mode:"selected_equipment",
    allowed_equipment_ids:["eq-1"],
  };
  assert.deepEqual(mechanicGrantAllowsMutation(grant,"estimate_save","eq-1",1000),{allowed:true,reason:""});
  assert.deepEqual(mechanicGrantAllowsMutation(grant,"estimate_submit","eq-1",1000),{allowed:true,reason:""});
  assert.deepEqual(mechanicGrantAllowsMutation({...grant,allowed_actions:["bootstrap","start","save"]},"estimate_save","eq-1",1000),{allowed:false,reason:"action_not_allowed"});
  assert.deepEqual(mechanicGrantAllowsMutation({...grant,allowed_actions:["bootstrap","start","save"]},"estimate_submit","eq-1",1000),{allowed:false,reason:"action_not_allowed"});
  assert.deepEqual(mechanicGrantAllowsMutation({...grant,allowed_equipment_ids:["eq-2"]},"estimate_save","eq-1",1000),{allowed:false,reason:"outside_scope"});
  assert.deepEqual(mechanicGrantAllowsMutation({...grant,allowed_equipment_ids:["eq-2"]},"estimate_submit","eq-1",1000),{allowed:false,reason:"outside_scope"});
});
