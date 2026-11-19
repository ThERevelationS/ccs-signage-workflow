const t = require('fs').readFileSync('.audit-work/sdr.cjs','utf8');
const start = t.indexOf('const FIELD_DENYLIST');
const end = t.indexOf('function cleanLimit');
const T = new Function(t.slice(start, end) + ';return {projectItem,cleanQuery,cleanSort};')();
const { projectItem, cleanQuery, cleanSort } = T;
const staff = { role: 'staff', email: 'alice@shop.com' };
const bob = { role: 'staff', email: 'bob@shop.com' };
const admin = { role: 'admin', email: 'boss@shop.com' };
const row = { email: 'alice@shop.com', full_name: 'Alice', hr_data: { phone: '555-1' }, password_hash: 'x' };
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++} else {fail++; console.log('FAIL:',m)} };
const throws=(fn,m)=>{ try{fn();fail++;console.log('FAIL(no-throw):',m)}catch(e){pass++} };

ok(projectItem('AuthorizedEmail', row, bob).hr_data===undefined, 'bob sees alice hr_data');
ok(projectItem('AuthorizedEmail', row, staff).hr_data!==undefined, 'alice keeps own hr_data');
ok(projectItem('AuthorizedEmail', row, admin).hr_data!==undefined, 'admin keeps hr_data');
ok(projectItem('AuthorizedEmail', row, bob).password_hash===undefined, 'denylist strips');
ok(projectItem('AuthorizedEmail', row, bob).full_name==='Alice', 'name readable');

throws(()=>cleanQuery({hr_data:{phone:'555'}},'AuthorizedEmail',bob), 'bob equality hr_data');
throws(()=>cleanQuery({hr_data:{$exists:true}},'AuthorizedEmail',bob), 'bob exists hr_data');
throws(()=>cleanQuery({'hr_data.phone':'555'},'AuthorizedEmail',bob), 'bob nested hr_data.phone');
throws(()=>cleanQuery({password_hash:'abc'},'AuthorizedEmail',admin), 'ADMIN equality password_hash');
throws(()=>cleanQuery({password_hash:{$eq:'abc'}},'AuthorizedEmail',admin), 'admin op password_hash');
throws(()=>cleanQuery({session_not_before:'2026-01-01'},'AuthorizedEmail',staff), 'equality session_not_before');
try { cleanQuery({full_name:'Alice'},'AuthorizedEmail',bob); pass++ } catch(e){ fail++; console.log('FAIL: name filter', e.message) }
try { cleanQuery({hr_data:{phone:'555'}},'AuthorizedEmail',admin); pass++ } catch(e){ fail++; console.log('FAIL: admin hr filter', e.message) }
try { cleanQuery({email:{$in:['a@b.c']}, full_name:'x'},'AuthorizedEmail',bob); pass++ } catch(e){ fail++; console.log('FAIL: multi-field ok', e.message) }

throws(()=>cleanSort('hr_data','AuthorizedEmail',bob), 'bob sort hr_data');
throws(()=>cleanSort('-hr_data.phone','AuthorizedEmail',bob), 'bob sort hr_data.phone');
try { cleanSort('hr_data','AuthorizedEmail',admin); pass++ } catch(e){ fail++; console.log('FAIL: admin sort', e.message) }
try { cleanSort('-full_name','AuthorizedEmail',bob); pass++ } catch(e){ fail++; console.log('FAIL: bob sort name', e.message) }

try { cleanQuery({stage:'quoted'},'WorkOrder',bob); pass++ } catch(e){ fail++; console.log('FAIL: WO filter', e.message) }
ok(projectItem('WorkOrder',{title:'x'},bob).title==='x','WO untouched');

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail?1:0);

// --- PayPeriod unscope + staff denial ---
const pp = { label:'Dec 1-15', status:'finalized', finalized_summary:{total_hours:900}, finalization_note:'x', reopened_by:'boss@x.c' };
ok(projectItem('TimeClockPayPeriod', pp, bob).finalized_summary===undefined, 'staff sees finalized_summary');
ok(projectItem('TimeClockPayPeriod', pp, bob).reopened_by===undefined, 'staff sees reopened_by');
ok(projectItem('TimeClockPayPeriod', pp, bob).label==='Dec 1-15', 'staff keeps label');
ok(projectItem('TimeClockPayPeriod', pp, admin).finalized_summary!==undefined, 'admin keeps summary');
throws(()=>cleanQuery({finalized_summary:{$exists:true}},'TimeClockPayPeriod',bob), 'staff filter summary');
try { cleanQuery({status:'finalized'},'TimeClockPayPeriod',bob); pass++ } catch(e){ fail++; console.log('FAIL: period status filter', e.message) }
console.log(`PAYPERIOD: cumulative ${pass} pass / ${fail} fail`);
process.exit(fail?1:0);
