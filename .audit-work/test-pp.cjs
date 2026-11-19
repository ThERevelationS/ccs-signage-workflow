const t = require('fs').readFileSync('.audit-work/sdr.cjs','utf8');
const start = t.indexOf('const FIELD_DENYLIST');
const end = t.indexOf('function cleanLimit');
const T = new Function(t.slice(start, end) + ';return {projectItem,cleanQuery,cleanSort};')();
const { projectItem, cleanQuery } = T;
const bob = { role: 'staff', email: 'bob@shop.com' };
const admin = { role: 'admin', email: 'boss@shop.com' };
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++} else {fail++; console.log('FAIL:',m)} };
const throws=(fn,m)=>{ try{fn();fail++;console.log('FAIL(no-throw):',m)}catch(e){pass++} };
const pp = { label:'Dec 1-15', status:'finalized', finalized_summary:{total_hours:900}, finalization_note:'x', reopened_by:'boss@x.c' };
ok(projectItem('TimeClockPayPeriod', pp, bob).finalized_summary===undefined, 'staff sees finalized_summary');
ok(projectItem('TimeClockPayPeriod', pp, bob).reopened_by===undefined, 'staff sees reopened_by');
ok(projectItem('TimeClockPayPeriod', pp, bob).finalization_note===undefined, 'staff sees note');
ok(projectItem('TimeClockPayPeriod', pp, bob).label==='Dec 1-15', 'staff keeps label');
ok(projectItem('TimeClockPayPeriod', pp, bob).status==='finalized', 'staff keeps status');
ok(projectItem('TimeClockPayPeriod', pp, admin).finalized_summary!==undefined, 'admin keeps summary');
ok(projectItem('TimeClockPayPeriod', pp, admin).reopened_by!==undefined, 'admin keeps reopened_by');
throws(()=>cleanQuery({finalized_summary:{$exists:true}},'TimeClockPayPeriod',bob), 'staff filter summary');
throws(()=>cleanQuery({reopen_reason:'x'},'TimeClockPayPeriod',bob), 'staff eq reopen_reason');
try { cleanQuery({status:'finalized'},'TimeClockPayPeriod',bob); pass++ } catch(e){ fail++; console.log('FAIL: period status filter', e.message) }
try { cleanQuery({status:{$in:['finalized','open']}},'TimeClockPayPeriod',bob); pass++ } catch(e){ fail++; console.log('FAIL: period in filter', e.message) }
console.log(`PP: ${pass} pass / ${fail} fail`);
process.exit(fail?1:0);
