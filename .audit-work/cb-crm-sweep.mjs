// CRM archive: all contact events (paged) + per-contact notes and history events. Read-only, resumable.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { post } from './cb-http.mjs';
import { scrub } from './cb-orderlib.mjs';
const DIR = 'imports/corebridge-2026-11-16/reference/';
const unD = (t) => { let j; try { j = JSON.parse(t); } catch { return { raw: t.slice(0, 500) }; } let d = j.d ?? j; if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} } return d; };
const C = '/SalesModule/Contacts/Contact.asmx/';
// 1) all CRM events (scheduled/completed), paged
const ev = []; let total = null;
for (let start = 0; ; start += 500) {
  const d = scrub(unD((await post(C + 'GetContactEvents', { txSearch: '', sSearch_3: '', sSearch_6: '', pageIndex: Math.floor(start / 500) + 1, iDisplayStart: start, iDisplayLength: 500, sEcho: 1, sColumns: '', iColumns: 0, iSortCol_0: 0, sSortDir_0: 'asc' })).text), true);
  const rows = d?.aaData || []; total = d?.iTotalRecords ?? total; ev.push(...rows);
  if (!rows.length || ev.length >= (total || 0)) { if (!ev.length) ev.push({ first_response: d }); break; }
}
writeFileSync(DIR + 'crm_contact_events.json', JSON.stringify({ total, count: ev.length, data: ev }, null, 1));
console.log('events', total, ev.length);
// 2) per contact notes + history
const contacts = JSON.parse(readFileSync(DIR + 'crm_contacts.json', 'utf8')).data;
const OUT = DIR + 'crm_contact_detail.jsonl';
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).contact_id) : []);
const todo = contacts.map((c) => c.Id).filter((id) => id && !done.has(id));
let next = 0, n = 0;
async function worker() {
  while (next < todo.length) {
    const id = todo[next++];
    try {
      const notes = scrub(unD((await post(C + 'GetContactNoteAllByContactId', { id })).text), true);
      const hist = scrub(unD((await post(C + 'GetAllContactHistoryEventsByContactId', { contactId: id })).text), true);
      const evNotes = scrub(unD((await post(C + 'GetContactEventNotesByContactId', { contactId: id })).text), true);
      appendFileSync(OUT, JSON.stringify({ contact_id: id, notes, history: hist, event_notes: evNotes }) + '\n');
    } catch (e) { appendFileSync(DIR + 'crm_errors.jsonl', JSON.stringify({ contact_id: id, error: String(e.message).slice(0, 200) }) + '\n'); if (/REDIRECT/.test(e.message)) process.exit(3); }
    if (++n % 250 === 0) process.stdout.write(`\ncontacts ${n}/${todo.length}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`\nDONE contacts ${n}`);
