import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../src/components/sips/TemplateBuilder.jsx',import.meta.url),'utf8');
const names=['requestTabChange','requestClose','confirmNavigation'];
const blocks=names.map(name=>{const start=src.indexOf('  const '+name+' = ');assert(start>=0,name);const end=src.indexOf('\n  };',start);assert(end>start,name);return src.slice(start,end+6)});
const program=blocks.join('\n')+'\nthis.actions={requestTabChange,requestClose,confirmNavigation}';
function setup(sub=false,product=false){
 const state={activeTab:'subtemplates',pendingNavigation:null,closed:false,subTemplateHasChanges:sub,productTypeHasChanges:product,subTemplateChecklistItems:['draft sub'],productTypeItems:['draft product'],subTemplateSaveStatus:'idle',productTypeSaveStatus:'idle',newItemText:'',newSubTemplateName:'',newProductTypeName:'',newDropdownName:'',editingSubTemplateId:null,editingSubTemplateName:'',editingProductTypeName:null,editingProductTypeValue:'',editingDropdown:null,editingDropdownName:''};
 const ctx={...state,selectedSubTemplate:'sub1',selectedProductType:'prod1',subTemplateItems:{sub1:{items:['saved sub']}},productTypeTemplates:{prod1:{items:['saved product']}},onClose:()=>state.closed=true};
 for(const key of Object.keys(state)){ctx['set'+key[0].toUpperCase()+key.slice(1)]=v=>{ctx[key]=v;state[key]=v}}
 Object.defineProperty(ctx,'hasUnsavedNameDrafts',{get:()=>false});
 Object.defineProperty(ctx,'hasUnsavedEditorChanges',{get:()=>ctx.subTemplateHasChanges||ctx.productTypeHasChanges||ctx.hasUnsavedNameDrafts});
 vm.createContext(ctx);vm.runInContext(program,ctx);
 return {state,...ctx.actions,cancel:()=>ctx.setPendingNavigation(null)};
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
console.log(passed+'/'+passed+' SIPS navigation checks passed');
