import assert from 'node:assert/strict';
import test from 'node:test';
import {savedDraftReviewView, savedFollowUpAreas} from '../src/components/permitting/savedDraftReviewFilters.mjs';
const step=(decision,follow_up,notes='')=>({step_index:99,permit_type:'Saved step',staff_review:{decision,follow_up,notes}});
test('decision, area and step-note search match one retained step, never unrelated steps',()=>{
 const row={id:'fixture',state:'OH',title:'Saved snapshot',snapshot:{steps:[step('needs_follow_up',{evidence:true},'First note'),step('reviewed_for_planning',{office:true},'Office needle')]}};
 assert.equal(savedDraftReviewView(row,{decision:'needs_follow_up',area:'office'}).matches,false);
 assert.equal(savedDraftReviewView(row,{decision:'needs_follow_up',query:'office needle'}).matches,false);
 const view=savedDraftReviewView(row,{decision:'reviewed_for_planning',area:'office',query:'office needle'});
 assert.equal(view.matches,true);assert.equal(view.matchingSteps[0].index,1);assert.equal(view.matchingSteps[0].step.step_index,99);
 assert.equal(savedDraftReviewView(row,{state:'KY'}).matches,false);
 assert.equal(savedDraftReviewView(row,{query:'saved snapshot',decision:'needs_follow_up',area:'evidence'}).matches,true);
});
test('legacy missing reviews, unknown decisions/areas and zero-step snapshots stay explicit',()=>{
 const legacy={snapshot:{steps:[{}]}};
 assert.equal(savedDraftReviewView(legacy,{decision:'not_reviewed'}).summary.missing_review,1);
 assert.equal(savedDraftReviewView(legacy,{area:'any'}).matches,false);
 const unknown={snapshot:{steps:[step('unrecognized_old_value',{custom:true})]}};
 const view=savedDraftReviewView(unknown,{decision:'unrecognized',area:'any'});
 assert.equal(view.matches,true);assert.equal(view.summary.not_reviewed,0);assert.equal(view.summary.unrecognized,1);
 assert.deepEqual(savedFollowUpAreas(unknown.snapshot.steps[0]),['Other recorded area']);
 assert.equal(savedDraftReviewView({snapshot:{steps:[]}}).matches,true);
 assert.equal(savedDraftReviewView({snapshot:{steps:[]}},{decision:'not_reviewed'}).matches,false);
});
test('filtering never merges sibling snapshots or changes retained rows and revision links',()=>{
 const common={draft_revision:{root_draft_id:'same-root',parent_draft_id:'ancestor',revision_number:2},steps:[step('needs_follow_up',{office:true})]};
 const rows=[{id:'branch-a',title:'A',snapshot:structuredClone(common)},{id:'branch-b',title:'B',snapshot:structuredClone(common)}],before=JSON.stringify(rows);
 const views=rows.map(row=>savedDraftReviewView(row,{decision:'needs_follow_up',area:'office'})).filter(view=>view.matches);
 assert.deepEqual(views.map(view=>view.row.id),['branch-a','branch-b']);assert.equal(JSON.stringify(rows),before);
});

