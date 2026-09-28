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
 const ctx={...state,selectedSubTemplate:'sub1',selectedProductType:'prod1',subTemplateItems:{sub1:{items:['saved sub']}},productTypeTemplates:{prod1:{items:['saved product']}},subTemplates:[{id:'sub1',name:'Saved sub name'}],dropdownConditions:[{id:'drop1',name:'Saved condition'}],checklistSaveInFlight:{current:null},onClose:()=>state.closed=true};
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
console.log(passed+'/'+passed+' SIPS navigation checks passed');
