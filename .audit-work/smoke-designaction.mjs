import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const r = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());

// 1. unauthenticated
const noauth = await fetch(`${FN}/estimatorDesignAction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'next_questions', module_key: 'foundation' }) }).then((x) => x.json());
console.log('noauth →', JSON.stringify(noauth));

// 2. unknown module (fail-closed)
const badmod = await fetch(`${FN}/estimatorDesignAction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'propose', module_key: 'pylon', session_token: r.token }) }).then((x) => x.json());
console.log('pylon →', JSON.stringify(badmod));

// 3. real propose on foundation — expect draft + server-stamped base revision
const prop = await fetch(`${FN}/estimatorDesignAction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'propose', module_key: 'foundation', project: { project_name: 'Smoke test proposal', foundation_type: 'spread_footing' }, notes: 'Two-pole monument sign, 8x4 cabinet.', session_token: r.token }) }).then((x) => x.json());
console.log('propose →', JSON.stringify(prop).slice(0, 700));
