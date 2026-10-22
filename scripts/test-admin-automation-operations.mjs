import test from "node:test";
import assert from "node:assert/strict";
import { reviewAutomationOperation as review } from "../src/components/admin/automationOperationReconciliation.js";
const toggle = {kind:"toggle", id:"r1", enabled:false};
const row = {id:"r1", updated_date:"v1", enabled:false, name:"Rule"};
test("Toggle review distinguishes requested state, different state, and absence", () => {
  assert.equal(review(toggle,[row]).status,"matching");
  assert.equal(review(toggle,[{...row,enabled:true}]).status,"different");
  assert.equal(review(toggle,[]).status,"absent");
});
test("Delete review requires a complete valid list and never treats a present rule as deleted", () => {
  assert.equal(review({...toggle,kind:"delete"},[row]).status,"present");
  assert.equal(review({...toggle,kind:"delete"},[]).status,"absent");
  for(const rows of [null,{},[null],[{}],[row,row],[{...row,updated_date:null}],[{...row,enabled:null}]]){
    assert.throws(()=>review(toggle,rows));
  }
});
test("Acknowledgment evidence detects version, content, identity and presence changes", () => {
  const evidence=review(toggle,[row]).snapshot;
  for(const rows of [[],[{...row,updated_date:"v2"}],[{...row,name:"Changed"}],[{...row,id:"other"}]]){
    assert.notEqual(review(toggle,rows).snapshot,evidence);
  }
  assert.equal(review(toggle,[row]).snapshot,evidence);
});
