// Live masterplan dashboard — run: node scripts/masterplan-serve.mjs
// Serves http://localhost:5170 — per-workstream live consoles (last 4 lines each),
// worker strip, global stats. Push-updates via SSE on file change; zero deps.
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { watch } from 'node:fs';
import { exec } from 'node:child_process';

const PORT = Number(process.env.MP_DASH_PORT || 5170);
const CLAIMS_DIR = '.masterplan-claims';
const rd = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const lines = (p) => rd(p).split('\n').filter(Boolean);
const jlines = (p) => lines(p).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const wsOfItem = (item) => (item && /^[A-Z]-\d/.test(item) ? item[0] : null);
const hhmmss = (iso) => { try { return new Date(iso).toTimeString().slice(0, 8); } catch { return '—'; } };

function parseLedger() {
  const mp = rd('ESTIMATOR_MASTERPLAN.md');
  const ws = {}; const titles = {};
  for (const line of mp.split('\n')) {
    const h = line.match(/^## WS-([A-Z])[ —:-]+(.+)/);
    if (h) { titles[h[1]] = h[2].slice(0, 42); }
    const m = line.match(/^- \[(?:x| )?\] \*?\*?`?([A-Z])-\d+[a-z]?`?.*?(\[OPEN\]|\[DONE\]|\[DOING(?:[^\]]*)\]|\[BLOCKED[^\]]*\]|\[DEFERRED\])/i);
    if (!m) continue;
    const [, k, state] = m;
    (ws[k] = ws[k] || { open: 0, done: 0, doing: 0, blocked: 0, deferred: 0 });
    if (/DONE/i.test(state)) ws[k].done++;
    else if (/DOING/i.test(state)) ws[k].doing++;
    else if (/BLOCKED/i.test(state)) ws[k].blocked++;
    else if (/DEFERRED/i.test(state)) ws[k].deferred++;
    else ws[k].open++;
  }
  const totals = Object.values(ws).reduce((a, s) => ({ open: a.open + s.open, done: a.done + s.done, doing: a.doing + s.doing, blocked: a.blocked + s.blocked, deferred: a.deferred + s.deferred }), { open: 0, done: 0, doing: 0, blocked: 0, deferred: 0 });
  return { ws, titles, totals };
}

function workersFromClaims(claims) {
  const w = {};
  for (const c of claims) {
    if (!c.worker) continue;
    w[c.worker] = w[c.worker] || { id: c.worker, status: 'idle', item: null, owned_files: [], started: null };
    const r = w[c.worker];
    if (c.status === 'claimed') { r.status = 'running'; r.item = c.item; r.owned_files = c.owned_files || []; r.started = c.ts; }
    else if (['integrated', 'failed', 'released'].includes(c.status) && r.item === c.item) { r.status = 'idle'; r.item = null; r.owned_files = []; r.started = null; }
  }
  for (const r of Object.values(w)) {
    r.elapsed = r.started ? Math.round((Date.now() - Date.parse(r.started)) / 1000) : null;
    try { r.last_line = lines(`${CLAIMS_DIR}/worker-${r.id}.log`).slice(-1)[0] || null; } catch { r.last_line = null; }
  }
  return Object.values(w);
}

// Build per-workstream activity: last-N real text lines, oldest→newest (terminal style)
function activityByWs(claims, events) {
  const act = {};
  const push = (ws, ts, who, text) => { if (!ws) return; (act[ws] = act[ws] || []).push({ ts: Date.parse(ts) || 0, when: hhmmss(ts), who, text }); };
  for (const e of events) {
    const ws = e.ws || wsOfItem(e.item);
    push(ws, e.ts, 'orch', `${e.type}${e.item ? ' ' + e.item : ''}${e.detail ? ' — ' + e.detail : ''}${e.note ? ' (' + e.note + ')' : ''}`);
  }
  for (const c of claims) {
    push(wsOfItem(c.item), c.ts, c.worker, `${c.status} ${c.item}`);
  }
  try {
    for (const f of readdirSync(CLAIMS_DIR).filter((f) => /^worker-.+\.log$/.test(f))) {
      const who = f.replace(/^worker-/, '').replace(/\.log$/, '');
      const mtime = statSync(`${CLAIMS_DIR}/${f}`).mtimeMs;
      const claim = claims.slice().reverse().find((c) => c.worker === who && c.status === 'claimed');
      const curWs = wsOfItem(claim && claim.item);
      for (const l of lines(`${CLAIMS_DIR}/${f}`).slice(-30)) {
        const m = l.match(/^(\d{2}:\d{2}:\d{2})\s+(.*)/);
        const itemM = l.match(/\b([A-Z]-\d+[a-z]?)\b/);
        push(itemM ? itemM[1][0] : curWs, new Date(mtime).toISOString(), who, m ? m[2] : l);
      }
    }
  } catch {}
  for (const ws of Object.keys(act)) act[ws] = act[ws].sort((a, b) => a.ts - b.ts).slice(-4);
  return act;
}

let churn = 0;
const refreshChurn = () => exec('git status --short', { timeout: 8000 }, (e, out) => { if (!e) churn = out.split('\n').filter(Boolean).length; });
refreshChurn(); setInterval(refreshChurn, 15000); // async — never blocks the loop on a dirty repo

let cache = { t: 0, json: '{}' };
function status() {
  if (Date.now() - cache.t < 400) return cache.json; // coalesce watch-storms
  const claims = jlines(`${CLAIMS_DIR}/claims.jsonl`);
  const events = jlines(`${CLAIMS_DIR}/events.jsonl`);
  const { ws, titles, totals } = parseLedger();
  const workers = workersFromClaims(claims);
  const total = totals.open + totals.done + totals.doing + totals.blocked + totals.deferred;
  const json = JSON.stringify({
    updated: new Date().toISOString(),
    flags: { active: existsSync('.devin/MASTERPLAN_SESSION_ACTIVE'), done: existsSync('.devin/MASTERPLAN_DONE') },
    totals, pct: total ? Math.round(totals.done / total * 100) : 0,
    workstreams: ws, ws_titles: titles, workers,
    activity: activityByWs(claims, events),
    events: events.slice(-14).reverse(),
    churn,
  });
  cache = { t: Date.now(), json };
  return json;
}

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Masterplan Live</title><style>
body{background:#0b0f14;color:#dbe4ee;font:12px/1.4 ui-monospace,Consolas,monospace;margin:0;padding:10px}
h1{font-size:14px;margin:0 0 2px} .dim{color:#6b7d8f}
.strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.stat{background:#0e141b;border:1px solid #1d2a38;border-radius:6px;padding:5px 10px;text-align:center;min-width:76px}
.stat b{font-size:17px;display:block} .okc{color:#4ade80}.warnc{color:#facc15}.badc{color:#f87171}.runc{color:#60a5fa}
.wgrid{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.wcard{background:#101822;border:1px solid #24405c;border-radius:6px;padding:4px 9px;min-width:230px;flex:1}
.wcard .who{color:#60a5fa;font-weight:bold}.pill{border-radius:8px;padding:0 6px;font-size:10px}
.wsgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ws{background:#101822;border:1px solid #223040;border-radius:6px;padding:6px 8px}
.wshead{display:flex;gap:8px;align-items:baseline;justify-content:space-between}
.wshead b{color:#9fd0ff}.bar{height:5px;background:#1d2a38;border-radius:3px;overflow:hidden;margin:3px 0 4px}
.bar>div{height:100%;background:#4ade80;transition:width .4s}
.console{background:#070b10;border-radius:4px;padding:4px 6px;min-height:64px;font-size:11px}
.console div{white-space:pre-wrap;word-break:break-all;color:#a9bfd4}
.console .lt{color:#54687e}.console .who{color:#7dd3fc}
.feed{max-height:150px;overflow:auto;margin-top:6px}.ev{padding:1px 0;white-space:pre-wrap;word-break:break-all;border-bottom:1px solid #141d28}
</style></head><body>
<h1>Estimator Masterplan — live</h1>
<div class="dim" id="t"></div>
<div class="strip" id="stats"></div>
<div class="dim">WORKERS</div><div class="wgrid" id="workers"></div>
<div class="dim">WORKSTREAMS — last 4 live lines each</div><div class="wsgrid" id="ws"></div>
<div class="dim">ORCHESTRATOR EVENTS</div><div class="feed" id="feed"></div>
<script>
const fmt=s=>s==null?'':s>=3600?Math.floor(s/3600)+'h'+Math.floor(s%3600/60)+'m':s>=60?Math.floor(s/60)+'m'+s%60+'s':s+'s';
function render(s){
 document.getElementById('t').textContent='updated '+new Date(s.updated).toLocaleTimeString()+' · live push · flag: '+(s.flags.active?'ARMED':'off')+(s.flags.done?' · DONE':'')+' · '+s.churn+' dirty files';
 const t=s.totals;
 document.getElementById('stats').innerHTML=[
  ['DONE','<b class="okc">'+t.done+'</b>'],['DOING','<b class="runc">'+t.doing+'</b>'],['OPEN','<b>'+t.open+'</b>'],
  ['BLOCKED','<b class="warnc">'+t.blocked+'</b>'],['PROGRESS','<b>'+s.pct+'%</b>'],
  ['WORKERS','<b class="runc">'+s.workers.filter(w=>w.status==='running').length+'</b>/'+s.workers.length]]
  .map(([k,v])=>'<div class="stat">'+v+'<span class="dim">'+k+'</span></div>').join('');
 document.getElementById('workers').innerHTML=s.workers.length?s.workers.map(w=>
  '<div class="wcard"><span class="who">'+w.id+'</span> '+(w.status==='running'?'<span class="pill runc" style="background:#0d2a4a">RUNNING</span>':'<span class="pill dim">idle</span>')
  +' <b>'+(w.item||'—')+'</b> <span class="dim">'+fmt(w.elapsed)+'</span><div class="dim" style="font-size:10px">'+(w.last_line||'')
  +'</div></div>').join(''):'<div class="wcard dim">no workers dispatched yet</div>';
 document.getElementById('ws').innerHTML=Object.entries(s.workstreams).sort().map(([k,v])=>{
  const tot=v.open+v.done+v.doing+v.blocked+v.deferred,p=tot?Math.round(v.done/tot*100):0;
  const lines=(s.activity[k]||[]).map(a=>'<div><span class="lt">'+a.when+'</span> <span class="who">'+a.who+'</span> '+a.text+'</div>').join('')||'<div class="dim">— idle —</div>';
  return '<div class="ws"><div class="wshead"><b>WS-'+k+'</b><span class="dim">'+(s.ws_titles[k]||'')+'</span><span class="dim">'+v.done+'/'+tot+(v.doing?' · '+v.doing+' doing':'')+(v.blocked?' · '+v.blocked+' blk':'')+'</span></div><div class="bar"><div style="width:'+p+'%"></div></div><div class="console">'+lines+'</div></div>';
 }).join('');
 document.getElementById('feed').innerHTML=s.events.map(e=>{
  const bad=/fail|error|violation/i.test(JSON.stringify(e)),good=/checkpoint|integrated/i.test(e.type||'');
  return '<div class="ev '+(bad?'badc':good?'okc':'')+'"><span class="lt">'+(e.ts||'').slice(11,19)+'</span> <b>'+(e.type||'?')+'</b> '+(e.item||'')+' '+(e.detail||'')+' '+(e.note||'')+'</div>';
 }).join('')||'<div class="dim">no events yet</div>';
}
fetch('/status.json').then(r=>r.json()).then(render);
try{ const es=new EventSource('/stream'); es.onmessage=m=>render(JSON.parse(m.data)); }
catch(e){ setInterval(()=>fetch('/status.json').then(r=>r.json()).then(render),3000); }
</script></body></html>`;

const clients = new Set();
const push = () => { const s = 'data: ' + status() + '\n\n'; for (const r of clients) { try { r.write(s); } catch { clients.delete(r); } } };
let timer = null;
const poke = () => { clearTimeout(timer); timer = setTimeout(push, 250); };
try { watch(CLAIMS_DIR, poke); } catch {}
try { watch('ESTIMATOR_MASTERPLAN.md', poke); } catch {}
setInterval(push, 5000); // heartbeat keeps elapsed timers + clock live even when files are quiet

createServer((req, res) => {
  if (req.url === '/status.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(status()); }
  if (req.url === '/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write('data: ' + status() + '\n\n');
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(HTML);
}).listen(PORT, '127.0.0.1', () => console.log(`masterplan dashboard → http://localhost:${PORT}`));
