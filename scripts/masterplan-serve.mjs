// Live masterplan dashboard — run: node scripts/masterplan-serve.mjs
// Serves http://localhost:5170 — worker cards, workstream progress, event feed.
// Reads .masterplan-claims/*.jsonl + ESTIMATOR_MASTERPLAN.md. Zero deps.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PORT = Number(process.env.MP_DASH_PORT || 5170);
const rd = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const lines = (p) => rd(p).split('\n').filter(Boolean);
const jlines = (p) => lines(p).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

function parseLedger() {
  const mp = rd('ESTIMATOR_MASTERPLAN.md');
  const ws = {};
  let cur = 'Z';
  for (const line of mp.split('\n')) {
    const h = line.match(/^## WS-([A-Z])/);
    if (h) cur = h[1];
    const m = line.match(/^- \[(?:x| )?\] \*?\*?`?([A-Z]-\d+[a-z]?)`?.*?(\[OPEN\]|\[DONE\]|\[DOING(?:[^\]]*)\]|\[BLOCKED[^\]]*\]|\[DEFERRED\])/i);
    if (!m) continue;
    const [, id, state] = m;
    (ws[cur] = ws[cur] || { open: 0, done: 0, doing: 0, blocked: 0, deferred: 0 });
    if (/DONE/i.test(state)) ws[cur].done++;
    else if (/DOING/i.test(state)) ws[cur].doing++;
    else if (/BLOCKED/i.test(state)) ws[cur].blocked++;
    else if (/DEFERRED/i.test(state)) ws[cur].deferred++;
    else ws[cur].open++;
  }
  const totals = Object.values(ws).reduce((a, s) => ({ open: a.open + s.open, done: a.done + s.done, doing: a.doing + s.doing, blocked: a.blocked + s.blocked, deferred: a.deferred + s.deferred }), { open: 0, done: 0, doing: 0, blocked: 0, deferred: 0 });
  return { ws, totals };
}

function workersFromClaims(claims) {
  const w = {};
  for (const c of claims) {
    if (!c.worker) continue;
    w[c.worker] = w[c.worker] || { id: c.worker, status: 'idle', item: null, owned_files: [], started: null, history: [] };
    const r = w[c.worker];
    r.history.push({ ts: c.ts, item: c.item, status: c.status });
    if (c.status === 'claimed') { r.status = 'running'; r.item = c.item; r.owned_files = c.owned_files || []; r.started = c.ts; }
    else if (['integrated', 'failed', 'released'].includes(c.status)) { r.status = c.status === 'integrated' ? 'done' : c.status; if (r.item === c.item) { r.item = null; r.owned_files = []; r.started = null; } }
  }
  for (const r of Object.values(w)) {
    if (r.status === 'done' || r.status === 'failed' || r.status === 'released') r.status = 'idle';
    r.elapsed = r.started ? Math.round((Date.now() - Date.parse(r.started)) / 1000) : null;
    r.history = r.history.slice(-8);
  }
  return Object.values(w);
}

function status() {
  const claims = jlines('.masterplan-claims/claims.jsonl');
  const events = jlines('.masterplan-claims/events.jsonl');
  const { ws, totals } = parseLedger();
  const workers = workersFromClaims(claims);
  const done = totals.done, total = totals.open + totals.done + totals.doing + totals.blocked + totals.deferred;
  let lastCheckpoint = null;
  for (const e of events) if (e.type === 'checkpoint') lastCheckpoint = e;
  let flags = { active: existsSync('.devin/MASTERPLAN_SESSION_ACTIVE'), done: existsSync('.devin/MASTERPLAN_DONE') };
  let churn = [];
  try { churn = execSync('git status --short', { encoding: 'utf8', timeout: 5000 }).split('\n').filter(Boolean).slice(0, 15); } catch {}
  return {
    updated: new Date().toISOString(),
    flags, totals, pct: total ? Math.round(done / total * 100) : 0,
    workstreams: ws, workers,
    events: events.slice(-80).reverse(),
    last_checkpoint: lastCheckpoint,
    churn,
  };
}

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Masterplan Live</title><style>
body{background:#0b0f14;color:#dbe4ee;font:13px/1.45 ui-monospace,Consolas,monospace;margin:0;padding:14px}
h1{font-size:15px;margin:0 0 4px} .dim{color:#6b7d8f} .card{background:#131a22;border:1px solid #223040;border-radius:8px;padding:10px 14px;margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.stat{background:#0e141b;border:1px solid #1d2a38;border-radius:6px;padding:8px 10px;text-align:center}
.stat b{font-size:20px;display:block} .okc{color:#4ade80}.warnc{color:#facc15}.badc{color:#f87171}.runc{color:#60a5fa}
.bar{height:7px;background:#1d2a38;border-radius:4px;overflow:hidden}.bar>div{height:100%;background:#4ade80}
.wrow{display:flex;gap:10px;align-items:baseline;border-bottom:1px solid #1b2632;padding:5px 0}
.wid{font-weight:bold;min-width:70px}.pill{border-radius:10px;padding:0 8px;font-size:11px}
.feed{max-height:420px;overflow:auto}.ev{border-bottom:1px solid #18222d;padding:3px 0;white-space:pre-wrap;word-break:break-all}
.tag{display:inline-block;min-width:90px;color:#9fb3c8}
.ws{display:flex;align-items:center;gap:8px;padding:2px 0}.wsb{flex:1}
pre{margin:0;font-size:11px;color:#8fa5ba}
</style></head><body>
<h1>Estimator Masterplan — live</h1>
<div class="dim" id="t"></div>
<div class="card"><div class="grid" id="stats"></div></div>
<div class="card"><div class="dim">WORKERS</div><div id="workers"></div></div>
<div class="card"><div class="dim">WORKSTREAMS</div><div id="ws"></div></div>
<div class="card"><div class="dim">EVENTS (latest first)</div><div class="feed" id="feed"></div></div>
<div class="card"><div class="dim">RECENT FILE CHURN (git status)</div><pre id="churn"></pre></div>
<script>
const fmt=s=>s==null?'—':s>=3600?Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m':s>=60?Math.floor(s/60)+'m '+s%60+'s':s+'s';
const pill=st=>({running:'<span class="pill runc" style="background:#123">RUNNING</span>',idle:'<span class="pill dim">idle</span>'})[st]||'<span class="pill">'+st+'</span>';
async function tick(){
 const s=await(await fetch('/status.json')).json();
 document.getElementById('t').textContent='updated '+new Date(s.updated).toLocaleTimeString()+' · refreshes 4s · session flag: '+(s.flags.active?'ARMED':'off')+(s.flags.done?' · DONE':'');
 const t=s.totals;
 document.getElementById('stats').innerHTML=[
  ['DONE','<b class="okc">'+t.done+'</b>'],['DOING','<b class="runc">'+t.doing+'</b>'],['OPEN','<b>'+t.open+'</b>'],
  ['BLOCKED','<b class="warnc">'+t.blocked+'</b>'],['PROGRESS','<b>'+s.pct+'%</b>'],
  ['WORKERS','<b>'+s.workers.filter(w=>w.status==='running').length+'/'+s.workers.length+'</b>']]
  .map(([k,v])=>'<div class="stat">'+v+'<span class="dim">'+k+'</span></div>').join('');
 document.getElementById('workers').innerHTML=s.workers.length?s.workers.map(w=>
  '<div class="wrow"><span class="wid">'+w.id+'</span>'+pill(w.status)+'<span>'+(w.item||'—')+'</span><span class="dim">'+(w.elapsed!=null?fmt(w.elapsed):'')+'</span><span class="dim">'+(w.owned_files||[]).slice(0,3).join(', ')+((w.owned_files||[]).length>3?'…':'')+'</span></div>'
 ).join(''):'<div class="dim">no workers dispatched yet</div>';
 document.getElementById('ws').innerHTML=Object.entries(s.workstreams).sort().map(([k,v])=>{
  const tot=v.open+v.done+v.doing+v.blocked+v.deferred,p=tot?Math.round(v.done/tot*100):0;
  return '<div class="ws"><b style="min-width:30px">'+k+'</b><div class="wsb bar"><div style="width:'+p+'%"></div></div><span class="dim" style="min-width:150px">'+v.done+'/'+tot+' done · '+v.doing+' doing · '+v.blocked+' blk</span></div>';
 }).join('');
 document.getElementById('feed').innerHTML=s.events.map(e=>{
  const cls=/fail|error|violation/i.test(JSON.stringify(e))?'badc':(/checkpoint|integrated|done/i.test(e.type||e.status||'')?'okc':'');
  return '<div class="ev '+cls+'"><span class="tag">'+(e.ts||'').slice(11,19)+'</span> <b>'+(e.type||e.status||'?')+'</b> '+(e.item||'')+' '+(e.detail||e.note||'')+'</div>';
 }).join('')||'<div class="dim">no events yet</div>';
 document.getElementById('churn').textContent=s.churn.join('\\n')||'clean';
}
tick();setInterval(tick,4000);
</script></body></html>`;

createServer((req, res) => {
  if (req.url === '/status.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status()));
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(HTML);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`masterplan dashboard → http://localhost:${PORT}`));
