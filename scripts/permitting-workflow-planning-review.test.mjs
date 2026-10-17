import assert from 'node:assert/strict';
import test from 'node:test';
import {editPlanningReview, invalidatePlanningReview, planningReviewIssues, planningReviewSummary} from '../src/components/permitting/workflowPlanningReview.mjs';
import {compareSavedDrafts} from '../src/components/permitting/permitDraftComparison.mjs';
test('planning decisions preserve retained context and require reasons/open-area consistency',()=>{
 const previous={decision:'reviewed_for_planning',reason:'Retained reason',notes:'Retained notes',custom:'kept',follow_up:{office:false}};
 const before=structuredClone(previous),next=editPlanningReview(previous,'follow_up.office',true,'fixture-date');
 assert.deepEqual(previous,before);assert.equal(next.decision,'needs_follow_up');assert.equal(next.notes,'Retained notes');assert.equal(next.custom,'kept');
 assert.equal(planningReviewIssues([{staff_review:next}]).length,0);
 assert.equal(planningReviewIssues([{staff_review:editPlanningReview(next,'decision','reviewed_for_planning')}]).length,1);
 assert.equal(planningReviewIssues([{staff_review:{decision:'not_applicable_proposal',reason:'  '}}]).length,1);
 assert.equal(planningReviewIssues([{staff_review:{decision:'invented'}}]).length,1);
 assert.deepEqual(planningReviewSummary([{}, {staff_review:next}, {staff_review:{decision:'not_applicable_proposal',reason:'Fixture'}}]),{not_reviewed:1,needs_follow_up:1,reviewed_for_planning:0,not_applicable_proposal:1});
});
test('changed proposals invalidate the earlier review without erasing its reason, notes or areas',()=>{
 const prior={decision:'not_applicable_proposal',reason:'Saved reason',notes:'Saved notes',follow_up:{evidence:true}};
 const next=invalidatePlanningReview(prior,'office','fixture-date');
 assert.equal(prior.decision,'not_applicable_proposal');assert.equal(prior.follow_up.office,undefined);
 assert.equal(next.decision,'needs_follow_up');assert.equal(next.reason,prior.reason);assert.equal(next.notes,prior.notes);
 assert.deepEqual(next.follow_up,{evidence:true,office:true});assert.equal(next.invalidated_by_step_edit,'office');
 const renewed=editPlanningReview(next,'decision','reviewed_for_planning','new-date');assert.equal(renewed.invalidated_by_step_edit,undefined);
});
test('review comparisons retain unchanged annotations without changing evidence or approval basis',()=>{
 const old={snapshot:{jurisdiction:{jurisdiction_id:'fixture'},steps:[{basis:'pending_review',citations:[{rule_id:'r'}],staff_review:{decision:'needs_follow_up',reason:'Question'}}]},review_notes:'Saved notes'};
 const current=structuredClone(old),before=JSON.stringify(old);
 let rows=compareSavedDrafts(old,current);const retained=rows.find(row=>row.group==='Staff planning review');assert.equal(retained.always,true);assert.equal(retained.changed,false);
 current.snapshot.steps[0].staff_review=editPlanningReview(current.snapshot.steps[0].staff_review,'notes','Additional question','fixture-date');
 rows=compareSavedDrafts(old,current);assert.equal(rows.find(row=>row.group==='Staff planning review').changed,true);
 assert.equal(JSON.stringify(old),before);assert.equal(current.snapshot.steps[0].basis,'pending_review');assert.deepEqual(current.snapshot.steps[0].citations,old.snapshot.steps[0].citations);
});

