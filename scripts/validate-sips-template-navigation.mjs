import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../src/components/sips/TemplateBuilder.jsx',import.meta.url),'utf8');
const names=['blockNavigationWhileSaving','requestTabChange','requestClose','confirmNavigation'];
const blocks=names.map(name=>{const start=src.indexOf('  const '+name+' = ');assert(start>=0,name);const end=src.indexOf('\n  };',start);assert(end>start,name);return src.slice(start,end+6)});
const program=blocks.join('\n')+'\nthis.actions={blockNavigationWhileSaving,requestTabChange,requestClose,confirmNavigation}';
function setup(sub=false,product=false,drafts={}){
 const state={activeTab:'subtemplates',pendingNavigation:null,closed:false,subTemplateHasChanges:sub,productTypeHasChanges:product,subTemplateChecklistItems:['draft sub'],productTypeItems:['draft product'],subTemplateSaveStatus:'idle',productTypeSaveStatus:'idle',noticeDialog:null,newItemText:'',newSubTemplateName:'',newProductTypeName:'',newDropdownName:'',editingSubTemplateId:null,editingSubTemplateName:'',editingProductTypeName:null,editingProductTypeValue:'',editingDropdown:null,editingDropdownName:''};
 Object.assign(state,drafts);
 const ctx={...state,selectedSubTemplate:'sub1',selectedProductType:'prod1',subTemplateItems:{sub1:{items:['saved sub']}},productTypeTemplates:{prod1:{items:['saved product']}},subTemplates:[{id:'sub1',name:'Saved sub name'}],dropdownConditions:[{id:'drop1',name:'Saved condition'}],checklistSaveInFlight:{current:null},reloadInFlightRef:{current:false},onClose:()=>state.closed=true};
 for(const key of Object.keys(state)){ctx['set'+key[0].toUpperCase()+key.slice(1)]=v=>{ctx[key]=v;state[key]=v}}
 Object.defineProperty(ctx,'hasUnsavedNameDrafts',{get:()=>Boolean(ctx.newSubTemplateName.trim()||ctx.newProductTypeName.trim()||ctx.newDropdownName.trim()||(ctx.editingSubTemplateId&&ctx.editingSubTemplateName.trim()!==(ctx.subTemplates.find(x=>x.id===ctx.editingSubTemplateId)?.name||'').trim())||(ctx.editingProductTypeName&&ctx.editingProductTypeValue.trim()!==String(ctx.editingProductTypeName).trim())||(ctx.editingDropdown&&ctx.editingDropdownName.trim()!==(ctx.dropdownConditions.find(x=>x.id===ctx.editingDropdown)?.name||'').trim()))});
 Object.defineProperty(ctx,'hasUnsavedEditorChanges',{get:()=>ctx.subTemplateHasChanges||ctx.productTypeHasChanges||Boolean(ctx.newItemText.trim())||ctx.hasUnsavedNameDrafts});
 vm.createContext(ctx);vm.runInContext(program,ctx);
 return {state,...ctx.actions,cancel:()=>ctx.setPendingNavigation(null),startSave:()=>{ctx.checklistSaveInFlight.current={kind:'subTemplate'};}};
}
let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++}
test('clean tab switch',()=>{const x=setup();x.requestTabChange('selectors');assert.equal(x.state.activeTab,'selectors');assert.equal(x.state.pendingNavigation,null)});
test('dirty tab switch prompts',()=>{const x=setup(true);x.requestTabChange('selectors');assert.equal(x.state.activeTab,'subtemplates');assert.equal(x.state.pendingNavigation.kind,'tab')});
test('cancel preserves subtemplate draft',()=>{const x=setup(true);x.requestTabChange('selectors');x.cancel();assert.equal(x.state.subTemplateChecklistItems[0],'draft sub');assert.equal(x.state.subTemplateHasChanges,true)});
test('discard restores saved subtemplate',()=>{const x=setup(true);x.requestTabChange('selectors');x.confirmNavigation();assert.equal(x.state.subTemplateChecklistItems[0],'saved sub');assert.equal(x.state.activeTab,'selectors')});
test('cancel close preserves product draft',()=>{const x=setup(false,true);x.requestClose();x.cancel();assert.equal(x.state.closed,false);assert.equal(x.state.productTypeItems[0],'draft product')});
test('discard close restores saved product',()=>{const x=setup(false,true);x.requestClose();x.confirmNavigation();assert.equal(x.state.closed,true);assert.equal(x.state.productTypeItems[0],'saved product')});
test('discard restores both editors',()=>{const x=setup(true,true);x.requestClose();x.confirmNavigation();assert.equal(x.state.subTemplateChecklistItems[0],'saved sub');assert.equal(x.state.productTypeItems[0],'saved product')});
test('clean close',()=>{const x=setup();x.requestClose();assert.equal(x.state.closed,true);assert.equal(x.state.pendingNavigation,null)});
test('unfinished item prompts and cancel retains text',()=>{const x=setup(false,false,{newItemText:'unfinished item'});x.requestTabChange('selectors');assert.equal(x.state.pendingNavigation.kind,'tab');x.cancel();assert.equal(x.state.newItemText,'unfinished item')});
test('unfinished item discarded only on confirmation',()=>{const x=setup(false,false,{newItemText:'unfinished item'});x.requestClose();x.confirmNavigation();assert.equal(x.state.newItemText,'');assert.equal(x.state.closed,true)});
test('new checklist name prompts and clears on discard',()=>{const x=setup(false,false,{newSubTemplateName:'new option'});x.requestTabChange('selectors');assert.equal(x.state.pendingNavigation.kind,'tab');x.confirmNavigation();assert.equal(x.state.newSubTemplateName,'')});
test('edited product name prompts and cancel retains text',()=>{const x=setup(false,false,{editingProductTypeName:'Old name',editingProductTypeValue:'New name'});x.requestClose();assert.equal(x.state.pendingNavigation.kind,'close');x.cancel();assert.equal(x.state.editingProductTypeValue,'New name')});
test('edited condition name clears on confirmed discard',()=>{const x=setup(false,false,{editingDropdown:'drop1',editingDropdownName:'New condition'});x.requestClose();x.confirmNavigation();assert.equal(x.state.editingDropdown,null);assert.equal(x.state.editingDropdownName,'')});
test('unchanged existing name does not prompt',()=>{const x=setup(false,false,{editingSubTemplateId:'sub1',editingSubTemplateName:'Saved sub name'});x.requestClose();assert.equal(x.state.closed,true);assert.equal(x.state.pendingNavigation,null)});
test('tab switch waits while checklist save is in progress',()=>{const x=setup(true);x.startSave();x.requestTabChange('selectors');assert.equal(x.state.activeTab,'subtemplates');assert.equal(x.state.pendingNavigation,null);assert.equal(x.state.noticeDialog.title,'Checklist save in progress')});
test('close waits while checklist save is in progress',()=>{const x=setup(true);x.startSave();x.requestClose();assert.equal(x.state.closed,false);assert.equal(x.state.pendingNavigation,null)});
test('saved Work Order checklist safety is explicit when deleting a reusable option',()=>{assert.match(src,/Delete reusable checklist option\?/);assert.match(src,/Work Orders that already use this option keep their saved checklist rows and answers/);assert.match(src,/Delete Reusable Option/)});
test('product checklist removal wording matches retained template behavior',()=>{assert.match(src,/Remove product checklist from builder\?/);assert.match(src,/stored template configuration is retained internally/);assert.match(src,/confirmLabel: "Remove from Builder"/);assert.match(src,/aria-label={`Remove product checklist \$\{type\} from Template Builder`}/)});

const counterStart=src.indexOf('function countPendingChecklistAdditions(');
const counterEnd=src.indexOf('\n}',counterStart);
assert.ok(counterStart>=0&&counterEnd>counterStart,'Pending checklist count helper exists');
const countPending=vm.runInNewContext('('+src.slice(counterStart,counterEnd+2)+')');
const templates={Cabinet:{items:[{text:'base checklist'}]},Empty:{items:[]}};
const options=[{id:'opt1'},{id:'opt2'},{id:'retired'}];
const optionItems={opt1:{items:[{text:'option row'}]},opt2:{items:[]}};
const saved={id:'saved',productType:'Cabinet',isExisting:true,subTemplates:[]};
const newProduct={id:'new',productType:'Cabinet',isExisting:false,subTemplates:[]};
test('saved products do not count as pending additions',()=>{
 assert.equal(countPending([saved],templates,options,optionItems),0);
 assert.equal(countPending([{...saved,subTemplates:['opt2','retired']}],templates,options,optionItems),0);
});
test('new product checklist counts as one pending addition',()=>{
 assert.equal(countPending([saved,newProduct],templates,options,optionItems),1);
 assert.equal(countPending([{...newProduct,productType:'Empty'}],templates,options,optionItems),0);
});
test('valid selected option for saved product counts without reapplying saved base checklist',()=>{
 assert.equal(countPending([{...saved,subTemplates:['opt1']}],templates,options,optionItems),1);
 assert.equal(countPending([{...saved,subTemplates:['opt1','opt2','retired']}],templates,options,optionItems),1);
});
test('new product plus selected option counts two additions',()=>{
 assert.equal(countPending([{...newProduct,subTemplates:['opt1']}],templates,options,optionItems),2);
});
test('saved checklists cannot be dragged or deselected through pending selection controls',()=>{
 assert.match(src,/isDragDisabled=\{product\.isExisting\}/);
 assert.match(src,/\{!product\.isExisting && \(/);
 assert.match(src,/Saved checklist rows and answers stay unchanged/);
 assert.match(src,/Saved checklist — order unchanged/);
});
test('pending selection wording distinguishes deselection from saved deletion',()=>{
 assert.match(src,/Deselect pending checklist \$\{product\.customName\}; saved Work Order data is unchanged/);
 assert.match(src,/Deselect pending checklist option \$\{st\.name\} for \$\{product\.customName\}; saved answers stay unchanged/);
 assert.match(src,/Already saved on this Work Order — cannot be removed here/);
 assert.match(src,/Removing from Builder…/);
 assert.match(src,/>To add<\/span>/);
});
test('apply is disabled with saved-only selection and announces actual additions',()=>{
 assert.match(src,/disabled=\{pendingChecklistAdditions === 0\}/);
 assert.match(src,/Nothing new selected to add to project/);
 assert.match(src,/\{savedProductCount\} saved on Work Order · \{pendingChecklistAdditions\} new to add/);
});

const applyStart=src.indexOf('  const handleApplyTemplate = () => {');
const applyEnd=src.indexOf('\n  };',applyStart);
assert.ok(applyStart>=0&&applyEnd>applyStart,'Real Apply handler exists');
function runApply(selection, savedChecklist){
 let applied=null;
 let notice=null;
 let updatedSelection=null;
 const ctx={
  selectedProducts:selection,
  productTypeTemplates:templates,
  subTemplates:[{id:'opt1',name:'Safety Option'}],
  subTemplateItems:optionItems,
  existingChecklist:savedChecklist,
  onApplyTemplate:rows=>{applied=rows;},
  setSelectedProducts:rows=>{updatedSelection=rows;},
  setNoticeDialog:dialog=>{notice=dialog;},
  Date,Math,
 };
 vm.createContext(ctx);
 vm.runInContext(src.slice(applyStart,applyEnd+6)+'\nthis.apply=handleApplyTemplate;',ctx);
 ctx.apply();
 return {applied,notice,updatedSelection};
}
test('actual Apply handler does not reapply saved base checklist without additions',()=>{
 const savedAnswers=[{id:'persisted',product_name:'Saved Cabinet',status:'Completed',approved_by:'Supervisor'}];
 const result=runApply([{...saved,customName:'Saved Cabinet'}],savedAnswers);
 assert.equal(result.applied,null);
 assert.match(result.notice?.message||'',/Existing product checklists are preserved/);
 assert.equal(savedAnswers[0].status,'Completed');
 assert.equal(result.updatedSelection,null);
});
test('actual Apply handler only adds selected option to saved product',()=>{
 const savedAnswers=[{id:'persisted',product_name:'Saved Cabinet',status:'Continued',approved_by:'Supervisor'}];
 const result=runApply([{...saved,customName:'Saved Cabinet',subTemplates:['opt1']}],savedAnswers);
 assert.equal(result.applied.length,1);
 assert.equal(result.applied[0].type,'sub_template');
 assert.equal(result.applied[0].parentProduct,'Saved Cabinet');
 assert.equal(result.applied[0].items[0].text,'option row');
 assert.notEqual(result.applied[0].items[0].id,'persisted');
 assert.equal(savedAnswers[0].status,'Continued');
 assert.equal(result.notice,null);
 assert.equal(result.updatedSelection.length,0);
});
test('actual Apply handler creates a new base checklist for new product only',()=>{
 const result=runApply([{...newProduct,customName:'New Cabinet'}],[]);
 assert.equal(result.applied.length,1);
 assert.equal(result.applied[0].type,'product_header');
 assert.equal(result.applied[0].productName,'New Cabinet');
 assert.equal(result.applied[0].items[0].text,'base checklist');
 assert.equal(result.notice,null);
});
console.log(passed+'/'+passed+' SIPS navigation checks passed');
