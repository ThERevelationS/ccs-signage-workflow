// Extract and unit-test the pure functions from staffDataRead
const fs = require('fs');
const t = fs.readFileSync('base44/functions/staffDataRead/entry.ts','utf8');
// strip types crudely for the functions we need
let code = t
  .replace(/: Record<string, string\[\]>/g,'')
  .replace(/\(entityName: string, /g,'(entityName, ')
  .replace(/\(value: unknown, /g,'(value, ')
  .replace(/, user\?: any\)/g,', user)')
  .replace(/item: any/g,'item')
  .replace(/user: any/g,'user')
  .replace(/field: string/g,'field')
  .replace(/denied: Set<string>/g,'denied')
  .replace(/operator: string/g,'operator')
  .replace(/node: any/g,'node')
  .replace(/const stack: any\[\]/g,'const stack')
  .replace(/key: string/g,'key')
  .replace(/value: unknown/g,'value');
const start = code.indexOf('const FIELD_DENYLIST');
const end = code.indexOf('function cleanLimit');
const block = code.slice(start, end);
eval(block + `
;globalThis.T = { projectItem, cleanQuery, cleanSort, isDeniedField, ownerDeniedForItem, ownerDeniedForQuery, checkOperatorValue };
`);
const { projectItem, cleanQuery, cleanSort } = globalThis.T;
const staff = { role: 'staff', email: 'alice@shop.com' };
const bob = { role: 'staff', email: 'bob@shop.com' };
const admin = { role: 'admin', email: 'boss@shop.com' };
const row = { email: 'alice@shop.com', full_name: 'Alice', hr_data: { phone: '555-1', dob: '1990' }, password_hash: 'x' };
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++} else {fail++; console.log('FAIL:',m)} };
const throws=(fn,m)=>{ try{fn();fail++;console.log('FAIL(no-throw):',m)}catch(e){pass++} };

ok(projectItem('AuthorizedEmail', row, bob).hr_data===undefined, 'bob sees alice hr_data');
ok(projectItem('AuthorizedEmail', row, alice).hr_data!==undefined, 'alice keeps own hr_data');
ok(projectItem('AuthorizedEmail', row, admin).hr_data!==undefined, 'admin keeps hr_data');
ok(projectItem('AuthorizedEmail', row, bob).password_hash===undefined, 'denylist still strips');
ok(projectItem('AuthorizedEmail', row, admin).password_hash===undefined, 'denylist strips for admin too');
ok(projectItem('AuthorizedEmail', row, bob).full_name==='Alice', 'name still readable');

throws(()=>cleanQuery({hr_data:{phone:'555'}},'AuthorizedEmail',bob), 'bob equality on hr_data');
throws(()=>cleanQuery({hr_data:{$exists:true}},'AuthorizedEmail',bob), 'bob exists on hr_data');
throws(()=>cleanQuery({'hr_data.phone':'555'},'AuthorizedEmail',bob), 'bob nested-path hr_data');
throws(()=>cleanQuery({password_hash:'abc'},'AuthorizedEmail',admin), 'ADMIN equality on password_hash (equality gap closed for all)');
throws(()=>cleanQuery({password_hash:{$eq:'abc'}},'AuthorizedEmail',admin), 'admin op on password_hash');
try { cleanQuery({full_name:'Alice'},'AuthorizedEmail',bob); pass++ } catch(e){ fail++; console.log('FAIL: bob name filter', e.message) }
try { cleanQuery({hr_data:{phone:'555'}},'AuthorizedEmail',admin); pass++ } catch(e){ fail++; console.log('FAIL: admin hr_data filter blocked', e.message) }

throws(()=>cleanSort('hr_data','AuthorizedEmail',bob), 'bob sort hr_data');
throws(()=>cleanSort('hr_data.phone','AuthorizedEmail',bob), 'bob sort hr_data.phone');
try { cleanSort('hr_data','AuthorizedEmail',admin); pass++ } catch(e){ fail++; console.log('FAIL: admin sort hr_data', e.message) }
try { cleanSort('full_name','AuthorizedEmail',bob); pass++ } catch(e){ fail++; console.log('FAIL: bob sort name', e.message) }

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail?1:0);
