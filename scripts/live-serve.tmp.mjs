import http from 'node:http';
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
const rd=f=>{try{return readFileSync(f,'utf8');}catch{return null;}};
// Tail-read for unbounded jsonl feeds — at fleet scale .live-events.jsonl
// grows ~100MB/day; parsing it whole per status call kills the dashboard.
const tailRead=(f,bytes=4*1024*1024)=>{try{const sz=statSync(f).size;if(sz<=bytes)return rd(f);const fd=openSync(f,'r');const buf=Buffer.alloc(bytes);readSync(fd,buf,0,bytes,sz-bytes);closeSync(fd);const t=buf.toString('utf8');const i=t.indexOf('\n');return i<0?t:t.slice(i+1);}catch{return rd(f);}};
// Per-office file pipeline (LP-6) — the office-files index is a local JSON the
// doc-pipeline/uploader/extractor update; TTL-cached here, never remote.
let _ofCache={at:0,data:null};
const officeFiles=()=>{
  const now=Date.now();
  if(_ofCache.data&&now-_ofCache.at<15000)return _ofCache.data;
  let idx=null;try{idx=JSON.parse(rd('.audit-work/office-files/index.json'));}catch{}
  const offs=[];const totals={offices:0,files:0,stages:{}};
  for(const [key,o]of Object.entries(idx?.offices||{})){
    const files=(o.files||[]).filter(f=>!f.hidden);
    const stages={};
    for(const f of files){const st=f.stage||'?';stages[st]=(stages[st]||0)+1;totals.stages[st]=(totals.stages[st]||0)+1;}
    totals.files+=files.length;
    offs.push({key,office:o.office_name||'unassigned',jurisdiction:o.jurisdiction_name||key,state:o.state||'',roles:o.roles||[],stages,updated:o.updated_at||''});
  }
  offs.sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
  totals.offices=offs.length;
  _ofCache={at:now,data:{offices:offs.slice(0,24),totals}};
  return _ofCache.data;
};
const status=()=>{
  const cnt=f=>{try{return JSON.parse(rd(f)).length;}catch{return 0;}};
  const lines=f=>{const t=rd(f);return t?t.trim().split('\n'):[];};
  const bl2=lines('.fixture-5000-build.log');
  const lastCityLine=bl2.slice(-1)[0]||'';
  const m=lastCityLine.match(/total (\d+)/);
  const poolLive=lines('.fixture-pool-live.jsonl').length;
  const pass2live=Math.max(poolLive, m?Number(m[1]):0, cnt('.fixture-business-5000-src.json'));
  const mq=lastCityLine.match(/(\d+) queries/);
  // Cumulative scanned counter — persists across event-log rotation.
  // .audit-work/scan-total.json holds every address ever seen so the count
  // keeps growing instead of resetting when the tail rolls.
  const evs=((tailRead('.live-events-prev.jsonl',1024*1024)||'')+'\n'+(tailRead('.live-events.jsonl')||'')).trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
  const DONE_STAGES=new Set(['resolved','resolved_apply','resolved_needs_office_check','located_no_locality','location_verified','rule_created','rule_already_covered','office_created','office_exists','office_created_followup','research_queued_followup','seed_office_ok','seed_office_backfilled','seed_office_queued','seed_office_waiting','seed_office_scan_done','invalid_input']);
  for(const e of evs){if(e.address&&typeof e.address==='string'){if(!scanSet.has(e.address)){scanSet.add(e.address);scanDirty=true;}if(DONE_STAGES.has(e.stage)&&!doneSet.has(e.address)){doneSet.add(e.address);scanDirty=true;}}}
  // Event timestamps arrive in two shapes: epoch-ms numbers (validator, sweep)
  // and ISO strings (seed/research/feeder scripts). Normalize or every
  // comparison below silently NaNs and those workers go invisible.
  const tms=e=>{const t=typeof e.t==='number'?e.t:Date.parse(e.t);return Number.isNaN(t)?0:t;};
  const results=evs.filter(e=>!e.start&&!e.step);
  // latest event per address wins — a requery replaces the earlier pending row
  const byAddr={};
  for(const e of results){const k=e.address;(byAddr[k]===undefined||tms(e)>tms(byAddr[k]))&&(byAddr[k]=e);}
  // jurisdictions whose office record exists (office_created/office_exists emit under "Name, ST")
  const normJ=s=>String(s||'').toLowerCase().replace(/\s*\([^)]*\)\s*/g,'').trim();
  const jurisDone=new Set(),jurisQueued=new Set();
  for(const e of results){
    if(e.stage==='office_created'||e.stage==='office_exists')jurisDone.add(normJ(e.address));
    else if(e.stage==='research_queued'||e.stage==='profile_created'||e.stage==='research_queue_error')jurisQueued.add(normJ(e.address));
  }
  for(const e of Object.values(byAddr)){
    if(e.stage==='located_no_locality'){
      const st=(String(e.address).match(/, ([A-Z]{2})/)||[])[1]||'';
      const key=normJ(`${(e.detail||'').split(' — ')[0]}, ${st}`);
      if(jurisDone.has(key))e.stage='office_created_followup';
      else if(jurisQueued.has(key))e.stage='research_queued_followup';
    }
  }
  const deduped=Object.values(byAddr);
  const starts=evs.filter(e=>e.start);
  const steps=evs.filter(e=>e.step);
  const stepsBy={};for(const s of steps)(stepsBy[s.address]=stepsBy[s.address]||[]).push(s);
  // In-flight = a start event NEWER than the address's latest result. Using
  // timestamps (not address-set membership) means retried addresses correctly
  // show as "working" again instead of hiding behind their stale fail mark.
  const latestResult={};for(const e of results){if(e.address&&tms(e)>(latestResult[e.address]||0))latestResult[e.address]=tms(e);}
  // A start with no result after 15min is a zombie from a killed run, not
  // real in-flight work — the watchdog already requeued those addresses.
  const STALE_MS=15*60*1000,now=Date.now();
  // Latest pending start PER ADDRESS — a requeued address's older starts would
  // otherwise stack identical "working" lines.
  const pendLatest={};
  for(const e of starts){const t=tms(e);if(t>(latestResult[e.address]||0)&&now-t<STALE_MS&&(!pendLatest[e.address]||t>tms(pendLatest[e.address])))pendLatest[e.address]=e;}
  const pending=Object.values(pendLatest).map(e=>({...e,t:tms(e),liveSteps:(stepsBy[e.address]||[]).slice(-3)}));
  // Per-worker "right now" rollup for the header — what each agent is doing.
  const workingNow={};
  for(const p of pending){const w=p.worker||0;const step=(p.liveSteps||[]).slice(-1)[0];
    if(!workingNow[w]||tms(p)>workingNow[w].t)workingNow[w]={address:p.address,worker:w,t:tms(p),step:step?step.detail:''};}
  // Download/doc-lane events live in the DOWNLOADS panel — keep them out of
  // the address feed so failures/progress don't clog it.
  const isFeedNoise=(e)=>/^(dl_|doc_|rx_|up_|srcmon_|burn_)/.test(String(e.stage||''));
  const feedItems=[...pending,...deduped.filter(e=>!isFeedNoise(e)).map(e=>({...e,t:tms(e),liveSteps:(stepsBy[e.address]||[]).slice(-4)}))].sort((a,b)=>(b.start?1:0)-(a.start?1:0)||b.t-a.t).slice(0,80);
  // Pipeline-side stages (sweep/research/mirror/feeder/watchdog/cleanup) —
  // these are office-pipeline lifecycle events, never address outcomes. They
  // must not count toward "looked up" and must not inflate error cards.
  const genStages={office_created:1,office_exists:1,research_queued:1,research_queue_error:1,profile_created:1,profile_deduped:1,no_profile:1,office_error:1,seed_office_ok:1,seed_office_backfilled:1,seed_office_queued:1,seed_office_waiting:1,seed_office_error:1,seed_office_gap:1,seed_office_scan_done:1,
    office_res_done:1,office_res_error:1,office_res_retry:1,office_res_review:1,office_res_pass:1,office_res_idle:1,office_res_boot:1,
    sweep_start:1,sweep_enumerated:1,sweep_progress:1,sweep_done:1,sweep_skipped_fixlist:1,sweep_stuck:1,
    mirror_boot:1,mirror_page:1,mirror_synced:1,mirror_cycle:1,mirror_error:1,
    addr_feed_start:1,addr_feed_batch:1,addr_feed_idle:1,addr_feed_error:1,
    watchdog_alive:1,watchdog_seed:1,watchdog_retry_queued:1,watchdog_retry_launch:1,
    cleanup_start:1,cleanup_done:1,cleanup_error:1,research_dispatch_cycle:1,
    auth_verify_pass:1,auth_verify_ok:1,auth_verify_error:1,auth_verify_done:1,
    pending_apply_wait:1,pending_apply_done:1,pending_apply_error:1,
    parcel_resolve_pass:1,parcel_resolve_ok:1,parcel_resolve_mismatch:1,parcel_resolve_none:1,parcel_resolve_done:1,parcel_resolve_error:1,
    queue_hygiene_pass:1,queue_hygiene_done:1,queue_hygiene_error:1,
    outbox_flush:1,outbox_flushed:1,outbox_pass:1,outbox_error:1,
    zoning:1,index_skip:1,office_change:1,gis_ord_url:1,gis_ord_done:1,county_gis_hit:1,county_gis_miss:1,
    gap_res_pass:1,gap_res_done:1,gap_res_miss:1,gap_res_review:1,gap_res_error:1,gap_res_boot:1,
    fleet_respawn:1,fleet_respawn_batch:1,fleet_stall:1,fleet_boot:1,
    gis_boot:1,gis_done:1,gis_miss:1,hl_pass:1,hl_step:1,hl_miss:1,hl_done:1,hl_boot:1,
    ord_boot:1,pipe_forwarded:1,prop_pass:1,prop_done:1,repair_pass:1,repair_truth:1,repair_blocked:1,
    hollow_sweep:1,hollow_sweep_done:1,office_dedupe_done:1,full_audit_done:1,
    auth_verify_trigger:1,parcel_rule_refute:1,
    ord_step:1,ord_miss:1,ord_done:1,ord_blocked:1,ord_ok:1,ord_cycle:1,metrics_snapshot:1};
  const isPipeline=(e)=>genStages[e.stage]||/^(office_|mirror_|sweep_|addr_feed_|watchdog_|cleanup_|research_dispatch|seed_office_|profile_|draft_|research_|auth_verify_|parcel_resolve_|queue_hygiene_|outbox_|ord_|gis_ord_|county_gis_|office_diff|metric|batch_|gap_res_|fleet_|gis_|hl_|pipe_|prop_|repair_|hollow_|office_dedupe|full_audit|rule_|county_prop|loc_res_|regional_|bbs_|dl_|doc_|rx_|up_|srcmon_)/.test(String(e.stage||''))||e.stage==='zoning'||e.stage==='index_skip';
  const addrDone=deduped.filter(e=>!isPipeline(e)).length;
  // Failure buckets that are actually actionable vs stale marks awaiting the
  // retry pass. `needs_review` is a human-flag state, not an error; a
  // fail-stage address sitting inside .remaining-pool.json is already queued
  // for re-attempt (the "220" the card used to show conflated all three).
  const poolSet=new Set();
  for(const f of ['.remaining-pool.json','.retry-failed.json','.retry-pass.json']){try{for(const a of JSON.parse(rd(f))||[])poolSet.add(a);}catch{}}
  const FAILSET=new Set(['invoke','unresolved','office_error','city_conflict','geocode','boundary','draft_error','research_queue_error','seed_office_error','stuck']);
  let needsReview=0,retryQueued=0,failedNow=0;
  for(const e of deduped){
    if(e.stage==='needs_review')needsReview++;
    else if(FAILSET.has(e.stage)){if(poolSet.has(e.address)){e.queued_retry=true;retryQueued++;}else failedNow++;}
  }
  // Honest pool math: the real fixture + latest-stage done-set (same list the
  // pool rebuild uses) — not the stale hardcoded pass1/pass2 formula.
  let fixtureTotal=0,fixtureDone=0;
  try{const fx=JSON.parse(rd('.fixture-business-all.json'))||[];fixtureTotal=fx.length;
    for(const a of fx){const e=byAddr[a];if(e&&DONE_STAGES.has(e.stage))fixtureDone++;}
  }catch{}
  const poolRemaining=fixtureTotal?fixtureTotal-fixtureDone:0;
  // In-queue = what the forever-runner will still process (never-run + retryable
  // stages), matching buildPool() in permitting-forever-runner.mjs.
  const RETRY_STAGES=new Set(['needs_review','invoke','unresolved','city_conflict','geocode','boundary','draft_error','office_error','research_queue_error','seed_office_error','stuck','no_profile','located_no_locality']);
  let inQueue=0;
  try{const fx=JSON.parse(rd('.fixture-business-all.json'))||[];
    for(const a of fx){const e=byAddr[a];if(!e||RETRY_STAGES.has(e.stage))inQueue++;}
  }catch{}
  // Feeder stats: jurisdictions searched + addresses appended (from feed events).
  let feedSearched=0,feedAdded=0;
  for(const e of results){
    if(e.stage==='addr_feed_batch'){feedSearched++;const m2=String(e.detail||'').match(/^(\d+)/);feedAdded+=m2?Number(m2[1]):0;}
  }
  const lastWatchdog=[...evs].reverse().find(e=>String(e.stage||'').startsWith('watchdog_'));
  const lastMirror=[...evs].reverse().find(e=>String(e.stage||'').startsWith('mirror_'));
  let res=null;try{res=JSON.parse(rd('.validation-A.json'));}catch{}
  const stageCount={};
  for(const e of deduped)stageCount[e.stage]=(stageCount[e.stage]||0)+1;
  // Pipeline counters must be unique-EVER, not deduped-latest — a researched
  // jurisdiction superseded by a later event (seed_office_waiting etc.) would
  // otherwise make the card visibly count DOWN, which reads as broken.
  const everStage=new Set();
  for(const e of results){if(e.address)everStage.add(e.stage+'|'+e.address);}
  const ever=(st)=>{let n=0;for(const k of everStage){if(k.startsWith(st+'|'))n++;}return n;};
  // "Offices held" must track the LIVE fill path, not only the bulk-creator's
  // office_created/exists stream — the seed scan now fills offices via
  // seed_office_backfilled/seed_office_ok, which is where the growth is.
  const officesHeld=(()=>{const s=new Set();for(const k of everStage){const st=k.slice(0,k.indexOf('|'));if(st==='office_created'||st==='office_exists'||st==='seed_office_backfilled'||st==='seed_office_ok')s.add(k.slice(k.indexOf('|')+1));}return s.size;})();
  const researched=ever('office_res_done');
  // Office errors must be LATEST-stage aware — a jurisdiction that errored
  // then succeeded on retry isn't an active error. Ever-counting them pinned
  // "7 office errors" on the card long after the failures were fixed.
  const OFF_ERR=new Set(['office_res_error','sweep_stuck','office_error','seed_office_error','research_queue_error','auth_verify_error']);
  const OFF_OK=new Set(['office_created','office_exists','seed_office_backfilled','seed_office_ok','office_res_done']);
  const officeErr=(()=>{
    const latest={};
    for(const e of results){
      if(!e.address||(!OFF_ERR.has(e.stage)&&!OFF_OK.has(e.stage)))continue;
      const t=tms(e);if(!(e.address in latest)||t>latest[e.address].t)latest[e.address]={t,stage:e.stage};
    }
    return Object.values(latest).filter(x=>OFF_ERR.has(x.stage)).length;
  })();
  const verified=ever('auth_verify_ok');
  const zoned=ever('zoning');
  const indexSkipped=stageCount?.index_skip||0;
  const ordDone=ever('ord_done');
  const gisOrd=ever('gis_ord_url');
  // The scoreboard that matters: localities where sign_permit + zoning are
  // BOTH staff_verified on at least one office — same union gate as
  // findLocalityByAddress's apply_allowed. Read from the localities mirror
  // (daemon-synced ~10min), never remote.
  let applyReady=0,locTotal=0,locMirrorAt=null,totalOffices=0,verifiedOffices=0,verifiedLocs=0;
  try{const lm=JSON.parse(readFileSync('.audit-work/mirrors/localities.json','utf8'));
    locMirrorAt=lm.at;
    for(const l of lm.rows||[]){locTotal++;
      const offs=Array.isArray(l.offices)?l.offices:[];
      totalOffices+=offs.length;
      const vo=offs.filter(o=>o?.authority_verification_status==='staff_verified');
      verifiedOffices+=vo.length; if(vo.length)verifiedLocs++;
      let s=false,z=false;
      for(const o of (Array.isArray(l.offices)?l.offices:[])){
        if(o?.authority_verification_status!=='staff_verified')continue;
        const roles=Array.isArray(o.authority_roles)?o.authority_roles:[];
        if(roles.includes('sign_permit'))s=true;
        if(roles.includes('zoning'))z=true;
      }
      if(s&&z)applyReady++;
    }}catch{}
  // LP-7 burn-down metrics — verification backlog (localities mirror, same
  // read as above), queue blocked/not_started (queue mirror), human queue +
  // auto-import ledger (local files). Zero remote calls.
  let needsVerif=0,queueBlocked=0,queueNotStarted=0,humanQueue=0,ruleImports=0;
  try{const lm=JSON.parse(readFileSync('.audit-work/mirrors/localities.json','utf8'));
    for(const l of lm.rows||[])for(const o of l.offices||[])if(o?.authority_verification_status==='needs_verification')needsVerif++;}catch{}
  try{const q=JSON.parse(readFileSync('.audit-work/mirrors/queue.json','utf8'));
    for(const r of q.rows||[]){if(r.status==='blocked')queueBlocked++;else if(r.status==='not_started')queueNotStarted++;}}catch{}
  try{const h=JSON.parse(readFileSync('.audit-work/human-review-queue.json','utf8'));humanQueue=h.count||0;}catch{}
  try{ruleImports=Object.keys(JSON.parse(readFileSync('.audit-work/rule-import-claims.json','utf8'))||{}).length;}catch{}
  // Local write outbox — depth = writes queued for the capped-rate flusher;
  // flush events = writes actually landing on the app.
  let outboxDepth=0,outboxErrDepth=0,outboxDone=0;
  try{outboxDepth=readFileSync('.audit-work/outbox.jsonl','utf8').trim().split('\n').filter(Boolean).length}catch{}
  try{outboxErrDepth=readFileSync('.audit-work/outbox-errors.jsonl','utf8').trim().split('\n').filter(Boolean).length}catch{}
  try{outboxDone=readFileSync('.audit-work/outbox-done.jsonl','utf8').trim().split('\n').filter(Boolean).length}catch{}
  // Producer liveness — last event per worker class. Cards read this so a
  // frozen number shows "paused" (worker off) instead of looking broken.
  const lastOf=(pred)=>evs.reduce((m,e)=>pred(e)?Math.max(m,tms(e)):m,0);
  const producers={
    validators:lastOf(e=>/^[0-9]+$/.test(String(e.worker||''))||['resolved_apply','resolved_needs_office_check','invoke','unresolved','invalid_input','located_no_locality','needs_review'].includes(e.stage)),
    researchers:lastOf(e=>String(e.stage||'').startsWith('office_res_')),
    feeder:lastOf(e=>String(e.stage||'').startsWith('addr_feed_')),
    verifier:lastOf(e=>String(e.stage||'').startsWith('auth_verify_')),
    flusher:lastOf(e=>String(e.stage||'').startsWith('outbox_')),
    seedScan:lastOf(e=>String(e.stage||'').startsWith('seed_office_')),
    mirrorSync:lastOf(e=>String(e.stage||'').startsWith('mirror_')),
    sweep:lastOf(e=>String(e.stage||'').startsWith('sweep_')),
    watchdog:lastOf(e=>String(e.stage||'').startsWith('watchdog_')),
    hygiene:lastOf(e=>String(e.stage||'').startsWith('queue_hygiene_')),
    parcel:lastOf(e=>String(e.stage||'').startsWith('parcel_resolve_')),
    resolver:lastOf(e=>String(e.stage||'').startsWith('parcel_resolve_')||e.stage==='zoning'||/^local-res/.test(String(e.worker||''))),
    ordinance:lastOf(e=>String(e.stage||'').startsWith('ord_')||/^ord-/.test(String(e.worker||''))),
    gapRes:lastOf(e=>String(e.stage||'').startsWith('gap_res_')),
    gis:lastOf(e=>/^gis-/.test(String(e.worker||''))),
    forever:lastOf(e=>String(e.worker||'')==='forever'),
    repairBlocked:lastOf(e=>/^repair_/.test(String(e.stage||''))),
    supervisor:lastOf(e=>/^fleet_/.test(String(e.stage||''))),
    harvesters:lastOf(e=>/^(regional_|bbs_)/.test(String(e.stage||''))||/^(bbs|regional)-harvest$/.test(String(e.worker||''))),
    docPipeline:lastOf(e=>String(e.worker||'')==='doc-pipeline'),
    ruleExtractor:lastOf(e=>String(e.worker||'')==='rule-extractor'),
    fileUploader:lastOf(e=>String(e.worker||'')==='file-uploader'),
    sourceMonitor:lastOf(e=>String(e.worker||'')==='source-monitor'),
    reviewBurn:lastOf(e=>String(e.worker||'')==='review-burn'),
  };
  // Live workers panel — latest event per producer so the "working now"
  // section shows real activity even from workers that never emit `start`.
  const lastEv=(pred)=>{let best=null;for(const e of evs){if(pred(e)&&(!best||tms(e)>tms(best)))best=e;}return best;};
  const PRODUCER_META={
    validators:{label:'address validators',pred:e=>/^[0-9]+$/.test(String(e.worker||''))||['resolved_apply','resolved_needs_office_check','invoke','unresolved','invalid_input','located_no_locality','needs_review'].includes(e.stage)},
    researchers:{label:'office researchers',pred:e=>String(e.stage||'').startsWith('office_res_')},
    gapResearchers:{label:'gap researchers',pred:e=>/^gap-res/.test(String(e.worker||''))},
    headless:{label:'headless researchers',pred:e=>/^headless-res/.test(String(e.worker||''))},
    parcelDiscover:{label:'parcel discover',pred:e=>/^gis-/.test(String(e.worker||''))},
    ordScan:{label:'ordinance scan',pred:e=>/^ord-/.test(String(e.worker||''))},
    forever:{label:'forever runner',pred:e=>String(e.worker||'')==='forever'},
    repairBlocked:{label:'repair blocked',pred:e=>String(e.worker||'')==='repair-blocked'},
    supervisor:{label:'fleet supervisor',pred:e=>/^fleet_/.test(String(e.stage||''))},
    harvesters:{label:'state harvesters',pred:e=>/^(regional_|bbs_)/.test(String(e.stage||''))||/^(bbs|regional)-harvest$/.test(String(e.worker||''))},
    audit:{label:'audit/sweep',pred:e=>/^(hollow_sweep|full_audit|office_dedupe|hollow|fullaudit)/.test(String(e.stage||''))},
    countyProp:{label:'county propagation',pred:e=>String(e.worker||'')==='county-prop'},
    pipeTrigger:{label:'pipeline trigger',pred:e=>String(e.worker||'')==='pipe-trigger'},
    docPipeline:{label:'doc pipeline (local)',pred:e=>String(e.worker||'')==='doc-pipeline'},
    ruleExtractor:{label:'rule extractor (devin)',pred:e=>String(e.worker||'')==='rule-extractor'},
    fileUploader:{label:'file uploader',pred:e=>String(e.worker||'')==='file-uploader'},
    sourceMonitor:{label:'source monitor (local)',pred:e=>String(e.worker||'')==='source-monitor'},
    reviewBurn:{label:'review burn-down',pred:e=>String(e.worker||'')==='review-burn'},
    feeder:{label:'address feeder',pred:e=>String(e.stage||'').startsWith('addr_feed_')},
    verifier:{label:'authority verifier',pred:e=>String(e.stage||'').startsWith('auth_verify_')},
    flusher:{label:'write flusher',pred:e=>String(e.stage||'').startsWith('outbox_')},
    seedScan:{label:'office seed scan',pred:e=>String(e.stage||'').startsWith('seed_office_')},
    mirrorSync:{label:'entity mirror',pred:e=>String(e.stage||'').startsWith('mirror_')},
    hygiene:{label:'queue hygiene',pred:e=>String(e.stage||'').startsWith('queue_hygiene_')},
    parcel:{label:'parcel resolver',pred:e=>String(e.stage||'').startsWith('parcel_resolve_')},
    watchdog:{label:'watchdog',pred:e=>String(e.stage||'').startsWith('watchdog_')},
  };
  const LIVE_MS2=20*60*1000;
  // Distinct worker labels per class — the 16-slice research fleet and 8
  // resolver workers each emit their own worker tag (local-res-7, "3"…), so a
  // class row shows "office researchers ×14 live" instead of one collapsed entry.
  const WORKER_RE={researchers:/^local-res/,gapResearchers:/^gap-res/,headless:/^headless-res/,validators:/^[0-9]+$/,sweep:/^sweep-/,parcelDiscover:/^gis-/,ordScan:/^ord-/,harvesters:/^(bbs|regional)-harvest$/};
  const liveWorkers=Object.entries(PRODUCER_META).map(([k,m])=>{
    const e=lastEv(m.pred);
    let liveCount=0, totalSeen=0;
    if(WORKER_RE[k]){
      const seen=new Set(),live=new Set();
      for(const ev of evs){if(!m.pred(ev))continue;const w=String(ev.worker||'');if(!WORKER_RE[k].test(w))continue;seen.add(w);if(now-tms(ev)<LIVE_MS2)live.add(w);}
      liveCount=live.size;totalSeen=seen.size;
    }
    return {key:k,label:m.label+(liveCount?` ×${liveCount} live`:totalSeen?` (of ${totalSeen} seen)`:' '),alive:!!e&&(now-tms(e))<LIVE_MS2,at:e?tms(e):0,stage:e?.stage||'',detail:e?.detail||e?.jurisdiction||e?.address||''};
  }).sort((a,b)=>(b.alive?1:0)-(a.alive?1:0)||b.at-a.at);
  // Downloads — per-file progress from doc-pipeline dl_* events. Active =
  // dl_start/dl_progress without a dl_done; done = completed (with bytes).
  const dlActive={},dlDone=[],dlErr=[];let dlFilesToday=0,dlBytesToday=0,dlLinkOnly=0,dlTransient=0,dlStats=null;
  const dayStart=new Date();dayStart.setHours(0,0,0,0);
  for(const e of evs){
    const st=String(e.stage||'');
    if(!st.startsWith('dl_')&&!st.startsWith('doc_archive_'))continue;
    const t=tms(e),key=String(e.url||e.address||e.detail||'');
    if(st==='dl_stats'){if(!dlStats||t>dlStats.at)dlStats={files:e.files||0,bytes:e.bytes||0,at:t};continue;}
    if(st==='dl_start')dlActive[key]={name:e.detail||key,bytes:0,total:e.total||0,at:t};
    else if(st==='dl_progress'){const a=dlActive[key]||{name:e.detail||key};a.bytes=e.bytes||0;a.total=e.total||a.total||0;a.at=t;dlActive[key]=a;}
    else if(st==='dl_done'){delete dlActive[key];dlDone.push({name:e.detail||key,bytes:e.bytes||0,at:t});if(t>=dayStart){dlFilesToday++;dlBytesToday+=e.bytes||0;}}
    else if(st==='dl_retry'){const a=dlActive[key]||{name:key,bytes:0};a.retrying=e.detail||'retrying';a.at=t;dlActive[key]=a;}
    else if(st==='dl_err'){
      delete dlActive[key];
      // terminal→link-only is a RESOLUTION (dead URL converted to a link), not
      // a failure — don't count it. Transient/retryable errors sit in their
      // own bucket; only unhandled failures reach the errors list.
      if(/terminal → link-only/i.test(String(e.detail||''))){dlLinkOnly++;}
      else if(/stalled|timeout|ECONN|ETIMEDOUT|reset|terminated|fetch failed/i.test(String(e.detail||''))){dlTransient++;}
      else dlErr.push({name:e.detail||key,detail:'download failed',at:t});
    }
    else if(st==='doc_archive_err')dlErr.push({name:e.address||key,detail:e.detail||'',at:t});
    // Cap the error trail — thousands of failures per pass would flood the panel.
    if(dlErr.length>200)dlErr.splice(0,dlErr.length-200);
  }
  const downloads={
    // Entries silent >90s are zombies (dead process or stalled read) — show as
    // stalled, not "in flight".
    // Dead entries roll off at 3min — a file actively retrying keeps
    // refreshing `at` via dl_retry events, so only truly dead ones leave.
    active:Object.entries(dlActive).map(([url,a])=>({url,...a,stalled:now-a.at>8000})).filter(a=>now-a.at<180000).sort((a,b)=>b.at-a.at).slice(0,12),
    done:dlDone.slice(-12).reverse(),
    errors:[...new Map(dlErr.slice(-80).reverse().map(x=>[x.name,x])).values()].slice(0,5),
    filesToday:dlFilesToday,bytesToday:dlBytesToday,
    doneTotal:dlStats?dlStats.files:dlDone.length,totalBytes:dlStats?dlStats.bytes:0,errTotal:dlErr.length,linkOnly:dlLinkOnly,transient:dlTransient,
  };
  return{
    pass1:cnt('.fixture-business-1000-src.json'),
    pass2:pass2live,
    pass2Queries:mq?Number(mq[1]):0,
    pass2Cities:bl2.length,
    recentCities:bl2.slice(-4),
    sampled:cnt('.fixture-business-1000.json'),
    building:!existsSync('.fixture-business-5000-src.json'),
    done:addrDone,
    total:fixtureTotal,
    fixtureDone,poolRemaining,inQueue,feedSearched,feedAdded,
    pending:pending.length,
    workingNow:Object.values(workingNow),
    stages:stageCount,
    needsReview,retryQueued,failedNow,researched,officeErr,verified,applyReady,locTotal,locMirrorAt,officesHeld,totalOffices,verifiedOffices,verifiedLocs,outboxDepth,outboxErrDepth,outboxDone,producers,liveWorkers,zoned,indexSkipped,ordDone,gisOrd,officeFiles:officeFiles(),needsVerif,queueBlocked,queueNotStarted,humanQueue,ruleImports,downloads,scannedTotal:scanSet.size,processedTotal:doneSet.size,
    lastEventAt:evs.reduce((m,e)=>Math.max(m,tms(e)),0),
    eventsPerMin:evs.reduce((n,e)=>n+(now-tms(e)<60000?1:0),0),
    pipeErr:['pending_apply_error','seed_office_error','mirror_error','auth_verify_error','queue_hygiene_error','research_dispatch_error','office_res_error','sweep_stuck'].filter(k=>stageCount[k]),
    watchdog:lastWatchdog?{stage:lastWatchdog.stage,detail:lastWatchdog.detail,at:lastWatchdog.t}:null,
    mirror:lastMirror?{stage:lastMirror.stage,detail:lastMirror.detail,at:lastMirror.t}:null,
    events:feedItems,
    summary:res?.summary||null,
  };
};
const page=`<!doctype html><meta charset="utf-8"><title>1000-address run — live</title>
<style>body{background:#0f172a;color:#e2e8f0;font:14px/1.5 ui-monospace,Consolas,monospace;margin:0;padding:24px}
h1{font-size:18px;color:#a5b4fc;margin:0 0 4px} .dim{color:#64748b;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:12px 0}
.card{background:#1e293b;border-radius:8px;padding:8px 10px} .num{font-size:19px;font-weight:700;color:#f8fafc}
.num .sub{font-size:11px;color:#64748b;font-weight:400}
.ok{color:#34d399}.warn{color:#fbbf24}.bad{color:#f87171}
pre{background:#0b1120;border-radius:8px;padding:10px;overflow:auto;white-space:pre-wrap;margin:8px 0 0;max-height:none}
table{border-collapse:collapse;width:100%}td{padding:4px 8px;border-bottom:1px solid #1e293b}
.bar{height:10px;background:#334155;border-radius:5px;overflow:hidden;margin-top:6px}.bar>i{display:block;height:100%;background:#6366f1}
.ev{display:flex;gap:8px;padding:3px 8px;border-bottom:1px solid #162033;font-size:13px}
.ev .a{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ev .s{width:400px;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.blink{animation:bl 1.2s infinite}@keyframes bl{50%{opacity:.35}}
.el{color:#475569;font-size:10px;flex-shrink:0;width:64px;text-align:right;font-variant-numeric:tabular-nums}
.fresh{animation:freshpulse 2.4s ease-out}@keyframes freshpulse{0%{background:#1e3a5f}100%{background:transparent}}
#nowAddr,#nowOffice,#nowSup{max-height:160px;overflow-y:auto;padding-right:4px}
#nowAddr::-webkit-scrollbar,#nowOffice::-webkit-scrollbar,#nowSup::-webkit-scrollbar,.feed::-webkit-scrollbar{width:6px}
#nowAddr::-webkit-scrollbar-thumb,#nowOffice::-webkit-scrollbar-thumb,#nowSup::-webkit-scrollbar-thumb,.feed::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
.okc{color:#34d399}.warnc{color:#fbbf24}.badc{color:#f87171}.dimc{color:#64748b}
@keyframes fade{from{opacity:0}to{opacity:1}}
.feed{max-height:calc(100vh - 340px);min-height:420px;overflow-y:auto}</style>
<h1>Permitting — live address resolution</h1>
<div class="card" id="srv" style="margin-bottom:10px;border:1px solid #334155"></div>
<div class="dim" id="t"></div>
<div class="grid" id="cards"></div>
<div class="card"><div class="dim">address feeder — keeps the queue stocked</div><div id="fix"></div></div>
<div style="display:flex;gap:10px;margin-top:10px">
<div class="card" style="flex:1;border:1px solid #3730a3"><div class="dim" style="color:#a5b4fc;font-weight:600">ADDRESS WORKERS — resolving job addresses</div><div id="nowAddr"></div></div>
<div class="card" style="flex:1;border:1px solid #065f46"><div class="dim" style="color:#6ee7b7;font-weight:600">OFFICE SWEEP — profiling every OH/KY office</div><div id="nowOffice"></div></div>
</div>
<div class="card" style="margin-top:10px"><div class="dim" style="font-weight:600">WORKER FLEET — what is actually running</div><div id="nowSup"></div></div>
<div class="card" style="margin-top:10px"><div class="dim" style="font-weight:600;color:#38bdf8">DOWNLOADS — live file pull from jurisdiction sources</div><div id="dl"></div></div>
<div class="card" style="margin-top:10px"><div class="dim" style="font-weight:600">OFFICE FILES — per-office document pipeline (local dossiers)</div><div id="officeFiles"></div></div>
<div class="card" style="margin-top:10px"><div class="dim">LIVE — each address as the resolver answers it</div><div class="feed" id="feed"></div></div>
<script>
const okStages={resolved_apply:1,resolved_needs_office_check:1,draft_created:1,draft_exists:1,office_created:1,office_exists:1,profile_created:1,profile_deduped:1,office_created_followup:1,seed_office_ok:1,seed_office_backfilled:1,seed_office_scan_done:1,office_res_done:1,sweep_done:1,mirror_synced:1,mirror_cycle:1,cleanup_done:1,pending_apply_done:1,auth_verify_ok:1,gap_res_done:1,prop_pass:1,pipe_forwarded:1,repair_pass:1,hollow_sweep_done:1,office_dedupe_done:1,full_audit_done:1,hl_pass:1,rule_created:1,rule_already_covered:1,bbs_harvest_done:1,regional_harvest_done:1,dl_done:1,doc_archive_ok:1,doc_text_ok:1,up_ok:1,rx_run_ok:1};
const warnStages={draft_no_profile:1,no_profile:1,research_queued:1,located_no_locality:1,research_queued_followup:1,seed_office_queued:1,seed_office_waiting:1,needs_review:1,invalid_input:1,office_res_idle:1,office_res_pass:1,office_res_boot:1,sweep_start:1,sweep_enumerated:1,sweep_progress:1,sweep_skipped_fixlist:1,mirror_boot:1,mirror_page:1,addr_feed_start:1,addr_feed_batch:1,addr_feed_idle:1,watchdog_alive:1,watchdog_seed:1,watchdog_retry_queued:1,watchdog_retry_launch:1,cleanup_start:1,research_dispatch_cycle:1,dl_start:1,dl_progress:1,doc_archive_err:1,doc_pipe_boot:1,doc_pipe_pass:1,up_pass:1,rx_pass:1,srcmon_pass:1,pending_apply_wait:1,auth_verify_pass:1,office_res_review:1,office_res_retry:1,mirror_error:1,gap_res_pass:1,gap_res_miss:1,gap_res_boot:1,fleet_respawn:1,fleet_respawn_batch:1,fleet_stall:1,fleet_boot:1,gis_boot:1,hl_step:1,ord_boot:1,auth_verify_trigger:1,parcel_rule_refute:1,bbs_harvest_boot:1,bbs_harvest_progress:1,regional_harvest_boot:1,regional_harvest_progress:1,outbox_recovered:1,outbox_wait:1};
// Diff-render: setting innerHTML every tick repaints + flashes. Cache the last
// markup per element and only write when it actually changed.
const _h={};const _seen=new Set();const setH=(id,html)=>{if(_h[id]!==html){_h[id]=html;const el=document.getElementById(id);if(el)el.innerHTML=html;}};
const cls=s=>okStages[s]?'okc':(warnStages[s]?'warnc':'badc');
const lbl=s=>({resolved_apply:'resolved — office matched',resolved_needs_office_check:'resolved — verified · offices unverified',needs_review:'needs review',located_no_locality:'jurisdiction found — office record being created',office_created_followup:'office record created — matched',research_queued_followup:'office research queued',unresolved:'unresolved',city_conflict:'city sources conflict',geocode:'geocode miss',boundary:'boundary error',invoke:'call failed',draft_created:'office created',draft_exists:'office already exists',draft_no_profile:'no repo profile',draft_error:'office write failed',office_created:'OFFICE created',office_exists:'office already exists',profile_created:'repo profile created',no_profile:'no repo profile',office_error:'office write failed',research_queued:'queued for office research',research_queue_error:'research queue failed',profile_deduped:'duplicate profiles collapsed',seed_office_ok:'office data already complete',seed_office_backfilled:'office data filled from research',seed_office_queued:'queued for office research',seed_office_waiting:'research already queued — waiting',seed_office_error:'office seed write failed',seed_office_gap:'no profile — research queued',seed_office_ambiguous:'same-name profiles — needs human link',seed_office_scan_done:'office seed scan finished',stuck:'moved to fix list',invalid_input:'not a real address — skipped',watchdog_alive:'AGENT heartbeat',watchdog_seed:'AGENT seeded stale failures',watchdog_retry_queued:'AGENT queued a retry',watchdog_retry_launch:'AGENT launched retry pass',
 office_res_done:'office research completed',office_res_error:'office research failed',office_res_pass:'research pass finished',office_res_idle:'researcher idle — queue empty',office_res_boot:'researcher online',office_res_review:'office research held for review',office_res_retry:'office research retry',sweep_start:'sweep worker online',sweep_enumerated:'sweep enumerated jurisdictions',sweep_progress:'sweep pass progress',sweep_done:'sweep pass complete',sweep_skipped_fixlist:'skipped — on the fix list',sweep_stuck:'sweep stuck — moved to fix list',mirror_boot:'entity mirror online',mirror_page:'entity mirror syncing',mirror_synced:'entity mirror synced',mirror_cycle:'entity mirror pass complete',mirror_error:'entity mirror read stalled',addr_feed_start:'address feeder online',addr_feed_batch:'feeder searched a jurisdiction',addr_feed_idle:'address feeder idle',addr_feed_error:'address feeder failed',cleanup_start:'record cleanup started',cleanup_done:'record cleanup finished',cleanup_error:'record cleanup failed',research_dispatch_cycle:'research dispatch cycle',research_dispatch_error:'research dispatch failed',
 pending_apply_wait:'auto-apply queued — offices not verified yet',pending_apply_done:'auto-apply finished',pending_apply_error:'auto-apply failed',auth_verify_ok:'office authority auto-verified',auth_verify_pass:'authority verifier pass',auth_verify_done:'authority verifier pass complete',auth_verify_error:'authority verifier failed',auth_verify_trigger:'verifier batch triggered',queue_hygiene_error:'queue hygiene failed',rule_create_failed:'resolution rule write failed',seed_office_ambiguous:'same-name profiles — needs human link',parcel_resolve_error:'parcel resolve failed',parcel_rule_refute:'rule refuted — address re-flagged',sweep_enumerated:'sweep enumerated jurisdictions',
 gap_res_pass:'gap researcher pass',gap_res_done:'gap research completed',gap_res_miss:'gap re-crawl — no better evidence yet',gap_res_error:'gap research failed',gap_res_boot:'gap researcher online',fleet_respawn:'supervisor respawned a worker',fleet_respawn_batch:'supervisor respawned workers',fleet_stall:'supervisor killed a stalled worker',fleet_boot:'fleet supervisor online',gis_boot:'parcel discover online',hl_pass:'headless research pass',hl_step:'headless research step',pipe_forwarded:'trigger forwarded work to pipeline',prop_pass:'county propagation pass',repair_pass:'repair-blocked pass',hollow_sweep_done:'hollow-evidence sweep finished',office_dedupe_done:'office dedupe finished',full_audit_done:'full audit finished',
 doc_pipe_boot:'local doc pipeline online',doc_pipe_pass:'doc pipeline pass done',doc_pipe_err:'doc pipeline pass failed',doc_archive_ok:'source archived locally',doc_archive_err:'source archive deferred/failed',doc_text_ok:'source text extracted locally',doc_text_err:'source text extraction failed',
 dl_start:'download started',dl_progress:'downloading…',dl_done:'download complete',
 rx_boot:'rule extractor online',rx_pass:'extraction pass done',rx_run_err:'extraction run write failed',rx_unit_err:'extraction unit failed',rx_out_bad:'devin output failed validation',rx_auth_needed:'devin login required',rx_fatal:'rule extractor crashed',
 up_boot:'file uploader online',up_pass:'upload pass done',up_ok:'file uploaded to app storage',up_err:'file upload failed',up_verify_err:'upload verify failed',up_budget_wait:'upload budget pacing',
 srcmon_boot:'source monitor online',srcmon_pass:'source monitor pass done',srcmon_err:'source monitor error',srcmon_changed:'source document changed',
 burn_boot:'review burn-down online',burn_cycle:'burn-down cycle started',burn_p1_feed:'fed priority localities to verifier',burn_p2_triage:'queue triage pass',burn_p3_deadurl:'dead-URL rediscovery pass',burn_p45_ranked:'geocode/fixlist ranked',burn_p6_import:'rule candidates auto-imported',burn_queue_closed:'blocked queue row closed',burn_queue_requeued:'blocked row requeued',burn_url_fixed:'dead office URL repaired',burn_queue_depth:'human-review queue depth',burn_err:'burn-down error',
 outbox_flush:'write flusher online',outbox_flushed:'write landed on the app',outbox_pass:'write flusher drained a batch',outbox_error:'queued write failed permanently',outbox_recovered:'flusher requeued a crashed batch',outbox_wait:'flusher standby — backup holds lock',bbs_harvest_boot:'BBS certified-dept harvest online',bbs_harvest_progress:'BBS harvest enriching profiles',bbs_harvest_done:'BBS certified-dept harvest finished',regional_harvest_boot:'ADD/RPC regional harvest online',regional_harvest_progress:'regional harvest enriching profiles',regional_harvest_done:'ADD/RPC regional harvest finished'}[s]||s);
async function tick(){
 const s=await(await fetch('/status.json')).json();
 const evAge=s.lastEventAt?Math.max(0,Math.round((Date.now()-s.lastEventAt)/1000)):null;
 const live=evAge!==null&&evAge<120;
 const prod=s.producers||{};
 const LIVE_MS=20*60*1000;
 const alive=k=>prod[k]&&(Date.now()-prod[k])<LIVE_MS;
 const lv=(k)=>{const a=prod[k];if(!a)return '<span class="dim" style="font-size:10px"> · never ran</span>';const age=Math.round((Date.now()-a)/1000);return alive(k)?'<span class="ok" style="font-size:10px"> · ● live</span>':'<span class="dim" style="font-size:10px"> · ‖ paused '+(age>3600?Math.floor(age/3600)+'h':Math.floor(age/60)+'m')+' ago</span>';};
 const pausedList=['validators','researchers','feeder','seedScan','sweep','watchdog'].filter(k=>!alive(k));
 setH('t','updated '+new Date().toLocaleTimeString()+' · <b class="'+(live?'ok':'bad')+'">'+(evAge===null?'waiting for events':live?'● LIVE — last pipeline event '+evAge+'s ago':'■ STALLED — last event '+Math.floor(evAge/60)+'m ago')+'</b>'+(s.eventsPerMin!=null?' · '+s.eventsPerMin+' events/min':'')
  +(pausedList.length?' · <span class="dim" style="font-size:11px">idle: '+pausedList.join(', ')+'</span>':''));
 const juris=(s.stages.located_no_locality||0)+(s.stages.office_created_followup||0)+(s.stages.research_queued_followup||0)+(s.stages.resolved_apply||0)+(s.stages.resolved_needs_office_check||0);
 const office=(s.stages.resolved_apply||0)+(s.stages.resolved_needs_office_check||0)+(s.stages.office_created_followup||0);
 const fails=Object.entries(s.stages).filter(([k])=>!okStages[k]&&!warnStages[k]).reduce((a,[,n])=>a+n,0);
 const pct=s.total?Math.min(100,Math.round(s.done/s.total*100)):0;
 const wtag=(w)=>'<span style="color:#818cf8;font-size:10px">'+(/^[0-9]+$/.test(String(w))?'w':'')+(w||'?')+' </span>';
 const row=(w)=>'<div class="ev" style="border-bottom:none"><span class="a dimc">'+wtag(w.worker)+w.address+'</span><span class="s warn blink" style="width:220px">'+(w.step||'working…').slice(0,55)+'</span></div>';
 const all=s.workingNow||[];
 const addr=all.filter(w=>/^[0-9]+$/.test(String(w.worker)));
 const sweep=all.filter(w=>/^sweep/.test(String(w.worker)));
 const sup=all.filter(w=>!/^[0-9]+$/.test(String(w.worker))&&!/^sweep/.test(String(w.worker)));
 setH('nowAddr',addr.length?addr.map(row).join(''):'<div class="dim">idle — no lookups in flight</div>')
 setH('nowOffice',sweep.length?sweep.map(row).join(''):'<div class="dim">idle — no sweep tasks in flight</div>')
 const wrow=(w)=>{const age=w.at?Math.round((Date.now()-w.at)/1000):null;const tag=w.alive?'<span class="ok" style="font-size:10px">● LIVE'+(age!=null?' '+age+'s ago':'')+'</span>':'<span class="dim" style="font-size:10px">‖ paused'+(age!=null&&age>3600?' '+Math.floor(age/3600)+'h':age!=null?' '+Math.floor(age/60)+'m':'')+'</span>';return '<div class="ev" style="border-bottom:none"><span class="a dimc" style="width:170px">'+w.label+'</span>'+tag+'<span class="s '+(w.alive?'warn':'dimc')+'" style="width:340px;margin-left:8px">'+(w.detail||w.stage||'—').slice(0,80)+'</span></div>';};
 const lw=(s.liveWorkers||[]);
 setH('nowSup',lw.length?lw.map(wrow).join(''):(sup.length?sup.map(row).join(''):'<div class="dim">idle</div>'));
 const d=s.downloads||{active:[],done:[],errors:[],filesToday:0,bytesToday:0,doneTotal:0,errTotal:0};
 const mb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?(n/1024).toFixed(0)+' KB':n+' B';
 const dlRow=(a)=>{
  if(a.stalled)return '<div class="ev" style="border-bottom:1px solid #162033;font-size:12px"><span class="a badc">■ '+(a.name||a.url||'?')+'</span><span class="s" style="width:170px;font-size:11px">stalled — '+mb(a.bytes||0)+(a.total?' / '+mb(a.total):'')+'</span></div>';
  const pct=a.total?Math.min(100,Math.round(a.bytes/a.total*100)):null;
  const barw=pct!==null?pct:(a.bytes?Math.min(100,Math.round(a.bytes/524288*100)):2);
  const ind=pct===null?';animation:bl 1.2s infinite;background:#0e7490':'';
  return '<div style="margin:5px 0"><div style="display:flex;gap:8px;font-size:12px"><span class="a" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(a.name||a.url||'?')+(a.retrying?' <span class="warnc">· '+(a.retrying||'').slice(0,40)+'</span>':'')+'</span><span style="color:#38bdf8;flex-shrink:0">'+mb(a.bytes||0)+(a.total?' / '+mb(a.total)+(pct!==null?' · '+pct+'%':''):'')+'</span></div><div class="bar" style="height:6px;margin-top:3px"><i style="width:'+barw+'%;background:#38bdf8'+ind+'"></i></div></div>';
 };
 setH('dl',
  '<div class="dim" style="margin-bottom:4px"><b style="color:#38bdf8">'+(d.active?d.active.filter(a=>!a.stalled).length:0)+'</b> in flight · <b>'+(d.doneTotal||0)+'</b> files · <b>'+mb(d.totalBytes||0)+'</b> total · '+(d.filesToday||0)+' new today'+(d.errTotal?' · <span class="bad">'+d.errTotal+' failed</span>':'')+(d.linkOnly?' · '+d.linkOnly+' → link-only':'')+(d.transient?' · '+d.transient+' retrying':'')+'</div>'
  +(d.active&&d.active.length?d.active.map(dlRow).join(''):'')
  +(d.done&&d.done.length?'<div class="dim" style="margin-top:6px;font-size:11px">recent:</div>'+d.done.map(x=>'<div class="ev" style="border-bottom:1px solid #162033;font-size:12px"><span class="a"><span class="okc">✓</span> '+(x.name||'?')+'</span><span class="s" style="width:170px;font-size:11px">'+mb(x.bytes||0)+' · '+new Date(x.at).toLocaleTimeString()+'</span></div>').join(''):(d.active&&d.active.length?'':'<div class="dim">idle — files appear as researchers discover sources</div>'))
  +(d.errors&&d.errors.length?d.errors.map(x=>'<div class="ev" style="border-bottom:1px solid #162033;font-size:12px"><span class="a badc">✗ '+(x.name||'?')+'</span><span class="s" style="width:170px;font-size:11px">'+(x.detail||'').slice(0,60)+'</span></div>').join(''):''));
 const of=s.officeFiles||{offices:[],totals:{offices:0,files:0,stages:{}}};
 const STAGE_COLORS={fetched:'#6366f1',extracted:'#38bdf8',queued:'#a78bfa',analyzed:'#c084fc',validated:'#f472b6',uploaded:'#34d399',rules:'#fbbf24',link_only:'#f87171'};
 const stageOrder=Object.keys(STAGE_COLORS);
 const chip=(st,n)=>'<span style="background:#0b1120;border:1px solid '+(STAGE_COLORS[st]||'#475569')+';border-radius:8px;padding:1px 7px;margin-right:4px;font-size:11px;white-space:nowrap">'+st.replace('_',' ')+' '+n+'</span>';
 setH('officeFiles',
  '<div class="dim" style="margin-bottom:6px">'+of.totals.offices+' offices · '+of.totals.files+' files '+(stageOrder.filter(st=>of.totals.stages[st]).map(st=>chip(st,of.totals.stages[st])).join(''))+'</div>'
  +(of.offices.length?of.offices.map(o=>'<div class="ev" style="border-bottom:1px solid #162033;align-items:baseline"><span class="a" style="width:320px;overflow:hidden;text-overflow:ellipsis">'+(o.jurisdiction||'')+' <span class="dimc">/ '+(o.office||'unassigned')+'</span></span><span class="s" style="width:auto;text-align:left">'+(stageOrder.filter(st=>o.stages[st]).map(st=>chip(st,o.stages[st])).join('')||'<span class="dim">dossier only — no files yet</span>')+'</span></div>').join(''):'<div class="dim">no office files yet — pipeline populates as archives land</div>'));
 setH('cards',
  '<div class="card"><div class="dim">addresses'+lv('validators')+'</div><div class="num">'+(s.fixtureDone||s.done)+'<span class="sub"> done · '+(s.inQueue||0)+' queued · '+(s.total||0)+' total · '+(s.processedTotal||0)+' processed · '+(s.scannedTotal||0)+' scanned · '+juris+' jurisdictions</span></div></div>'
 +'<div class="card"><div class="dim">office records'+lv('seedScan')+'</div><div class="num ok">'+(s.totalOffices||0)+'<span class="sub"> · '+(s.verifiedOffices||0)+' verified / '+(s.locTotal||0)+' jurisdictions</span></div></div>'
 +'<div class="card"><div class="dim">apply-ready (sign+zoning verified)'+lv('verifier')+'</div><div class="num ok">'+(s.applyReady||0)+'<span class="sub"> / '+(s.locTotal||0)+(s.locTotal?' · '+Math.round(100*(s.applyReady||0)/s.locTotal)+'%':'')+'</span></div></div>'
 +'<div class="card"><div class="dim">write outbox → app'+lv('flusher')+'</div><div class="num'+(s.outboxDepth?' warn':' ok')+'">'+(s.outboxDepth||0)+'<span class="sub"> queued · '+(s.outboxDone||0)+' landed'+(s.outboxErrDepth?' · <span class="bad">'+s.outboxErrDepth+' dropped</span>':'')+'</span></div></div>'
 +'<div class="card"><div class="dim">errors — needs attention</div><div class="num '+(Math.max(0,s.failedNow-(s.stages.geocode||0))?'bad':'ok')+'">'+Math.max(0,s.failedNow-(s.stages.geocode||0))+'<span class="sub"> · '+(s.stages.geocode||0)+' geocode auto-resolving · '+(s.retryQueued||0)+' retrying · '+(s.needsReview||0)+' flagged</span></div></div>'
 +'<div class="card"><div class="dim">backlog'+lv('reviewBurn')+'</div><div class="num warn">'+(s.needsVerif||0)+'<span class="sub"> needs verification · '+(s.queueNotStarted||0)+' not-started · '+(s.queueBlocked||0)+' blocked</span><span class="'+(s.humanQueue?'bad':'ok')+' sub" style="display:block">'+(s.humanQueue||0)+' need a human</span></div></div>'
 +'<div class="card"><div class="dim">watchdog'+lv('watchdog')+'</div><div class="num" style="font-size:13px;line-height:1.3">'+(s.watchdog?lbl(s.watchdog.stage).replace('AGENT ','')+'<br><span class="sub">'+(s.watchdog.detail||'').slice(0,60)+'</span>':'<span class="sub">offline</span>')+'</div></div>');
 const citiesDone=s.pass2Cities||0;
 setH('fix','queue: <b>'+(s.inQueue||0)+'</b> addresses waiting'+(alive('validators')?' · <b>'+(s.feedSearched||0)+'</b> jurisdictions searched · added <b class="ok">'+(s.feedAdded||0)+'</b> new addresses · pool size '+(s.total||0):' · <span class="dim">validators + feeder paused (spend freeze) — pool size '+(s.total||0)+'</span>')
  +(s.mirror?' · <span style="color:#6ee7b7">entity mirror '+(s.mirror.stage==='mirror_synced'||s.mirror.stage==='mirror_cycle'?'✓ ':'')+(s.mirror.detail||'')+' · '+new Date(s.mirror.at).toLocaleTimeString()+'</span>':''));
 setH('feed',s.events.length?s.events.map(e=>{
   const wtag=e.worker?'<span style="color:#818cf8;font-size:10px">'+(/^[0-9]+$/.test(String(e.worker))?'w':'')+e.worker+' </span>':'';
   if(e.start){const steps=e.liveSteps||[];const last=steps.length?steps[steps.length-1].detail:'calling resolver…';
     // Pulse only the first time a row renders — re-running the animation on
     // every innerHTML rewrite is what makes the feed flash.
     const k=String(e.address)+'|'+e.t;const fresh=!_seen.has(k)?' fresh':'';_seen.add(k);if(_seen.size>5000)_seen.clear();
     const substeps=steps.map(x=>'<div style="font-size:11px;color:#7dd3fc;padding:1px 8px 1px 24px;white-space:normal">› '+x.detail+'</div>').join('');
     return '<div class="ev'+fresh+'"><span class="a dimc">'+wtag+e.address+'</span><span class="s warn blink" style="width:330px">'+last+'</span><span class="el" data-t="'+e.t+'"></span></div>'+substeps;}
   const stepsTrace=(e.liveSteps||[]).map(x=>'<div style="font-size:10px;color:#475569;padding:0 8px 0 24px;white-space:normal">› '+x.detail+'</div>').join('');
   let extra=e.suggested?' · '+e.suggested:(e.targets?' · '+e.targets:'');
   if(e.detail)extra+=' · '+e.detail;
   if(e.ms)extra+=' · '+(e.ms/1000).toFixed(1)+'s';
   if(e.busy_waits)extra+=' · waited '+e.busy_waits+'x';
   const trace=e.trace?'<div style="font-size:11px;color:#7dd3fc;padding:0 8px 4px;white-space:normal">↳ '+e.trace+'</div>':'';
   return '<div class="ev"><span class="a dimc">'+wtag+e.address+'</span><span class="s '+(e.queued_retry?'warnc':cls(e.stage))+'">'+lbl(e.stage)+(e.queued_retry?' — queued for retry':'')+extra+'</span></div>'+stepsTrace+trace;
 }).join(''):'<div class="dim" style="padding:8px">waiting for lookups…</div>');

}
// ── permit-server control bar (proxied to 127.0.0.1:4175) ──────────────
let lastLedger=null,lastLedgerAt=0,lastSrv=null;
async function fetchLedger(){const n=Date.now();if(n-lastLedgerAt<15000&&lastLedger)return lastLedger;try{const r=await fetch('/api/verification-ledger',{cache:'no-store'});if(r.ok){lastLedger=await r.json();lastLedgerAt=n;}}catch(e){}return lastLedger;}
async function srvCmd(p,body){try{const r=await fetch('/api/server/'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});if(r.status===409){const j=await r.json().catch(()=>({}));alert(j.error||'conflict');}}catch(e){}}
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
const BTN='cursor:pointer;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:5px;padding:3px 10px;font:12px ui-monospace,monospace';
async function srvTick(){
 let s=null;
 try{const r=await fetch('/api/server/status',{cache:'no-store'});if(r.ok)s=await r.json();}catch(e){}
 const el=document.getElementById('srv');if(!el)return;
 if(!s){setH('srv','<div class="dim"><b style="color:#f87171">permit-server controller OFFLINE</b> — start it with the CCS Permit Server desktop icon or <span style="color:#94a3b8">node scripts/permit-server.mjs</span></div>');return;}
 const stCol={running:'#34d399',paused:'#fbbf24',stopped:'#f87171'}[s.state]||'#94a3b8';
 const g=s.guard||{level:0},mem=s.memory||{},lim=s.limits||{},R=g.researchers||{};
 const gtxt=s.state==='stopped'?'':(g.level===2?' · <b class="bad">memory guard L2: workers paused · researchers draining</b>':g.level===1?' · <b class="warn">memory guard L1: draining researchers until free recovers</b>':' · guard ok');
 lastSrv=s;
 if(window._pendingMax){const rm=(s.guard&&s.guard.researchers&&s.guard.researchers.max);if(rm===window._pendingMax.v||Date.now()-window._pendingMax.at>10000)window._pendingMax=null;}
 let btns='';
 if(s.state!=='running')btns+='<button style="'+BTN+';border-color:#34d399" data-cmd="start">▶ Start</button> ';
 if(s.state==='running')btns+='<button style="'+BTN+';border-color:#fbbf24" data-cmd="pause">⏸ Pause</button> ';
 if(s.state==='paused')btns+='<button style="'+BTN+';border-color:#34d399" data-cmd="resume">▶ Resume</button> ';
 if(s.state!=='stopped')btns+='<button style="'+BTN+';border-color:#f87171" data-cmd="stop">■ Stop</button> ';
 btns+='<button style="'+BTN+';border-color:'+(s.verification?'#34d399':'#475569')+'" data-cmd="verification" data-on="'+(s.verification?0:1)+'">Verification '+(s.verification?'ON':'OFF')+'</button> ';
 if(s.expansion_locked)btns+='<button style="'+BTN+';opacity:.5" disabled title="locked until verification is done">Expansion 🔒</button> ';
 else btns+='<button style="'+BTN+';border-color:'+(s.expansion?'#34d399':'#475569')+'" data-cmd="expansion" data-on="'+(s.expansion?0:1)+'">Expansion '+(s.expansion?'ON':'OFF')+'</button> ';
 btns+='<button style="'+BTN+';background:#7f1d1d;border-color:#f87171" title="Stop every researcher immediately — sets researchers max to 0" data-cmd="killres">⛔ Kill all researchers</button> ';
 const grpBadge={core:'#38bdf8',verification:'#a78bfa',expansion:'#f472b6',dashboard:'#64748b'};
 const stColor={'running':'#34d399','idle':'#6ee7b7','paused-by-guard':'#fbbf24','culled-by-memory':'#fb923c','blocked-by-memory':'#fb923c','stopped-by-user':'#94a3b8','done':'#38bdf8','stopped':'#64748b'};
 const noCtl={'write-flusher':1,'mirror-sync':1,'dashboard':1};
 const rowBtn=(w)=>{
  if(noCtl[w.name])return '<span class="dim" style="font-size:10px">core</span>';
  if(w.alive)return '<button style="'+BTN+';padding:1px 7px;font-size:10px" data-cmd="wstop" data-name="'+esc(w.name)+'">stop</button>';
  if(['stopped-by-user','stopped','culled-by-memory','blocked-by-memory'].includes(w.status))return '<button style="'+BTN+';padding:1px 7px;font-size:10px;border-color:#34d399" data-cmd="wstart" data-name="'+esc(w.name)+'">start</button>';
  return '';
 };
 const wrow=(w)=>{
  const hb=w.last_heartbeat||{};
  const hbAge=hb.at?Math.round((Date.now()-new Date(hb.at).getTime())/1000):null;
  const st=w.status||(w.alive?'running':'stopped');
  const dot=w.alive?'<span class="ok">●</span>':'<span class="bad">■</span>';
  const hbTxt=hb.state?esc(hb.state)+(hb.item?' · '+esc(hb.item).slice(0,44):'')+(hbAge!=null?' ('+hbAge+'s)':''):'—';
  const ev=w.last_event?esc(w.last_event.stage||'')+' '+esc(w.last_event.detail||'').slice(0,52):'—';
  const loop=w.crash_looping?' <span class="bad">CRASH-LOOP</span>':'';
  const up=w.uptime_s!=null?(w.uptime_s>3600?Math.floor(w.uptime_s/3600)+'h'+Math.floor(w.uptime_s%3600/60)+'m':w.uptime_s>60?Math.floor(w.uptime_s/60)+'m':w.uptime_s+'s'):'—';
  return '<tr style="font-size:11px"><td style="padding:1px 8px">'+dot+' '+esc(w.name)+loop+'</td>'
   +'<td style="padding:1px 8px"><span style="color:'+(grpBadge[w.group]||'#64748b')+'">'+esc(w.group)+'</span></td>'
   +'<td style="padding:1px 8px"><span style="color:'+(stColor[st]||'#94a3b8')+'">'+esc(st)+'</span></td>'
   +'<td style="padding:1px 8px" class="dim">'+(w.pid||'—')+'</td>'
   +'<td style="padding:1px 8px" class="dim">'+(w.rss_mb!=null?w.rss_mb+' MB':'—')+'</td>'
   +'<td style="padding:1px 8px" class="dim">'+up+'</td>'
   +'<td style="padding:1px 8px" class="dim">'+(w.restarts||0)+'</td>'
   +'<td style="padding:1px 8px" class="dim">'+hbTxt+'</td>'
   +'<td style="padding:1px 8px" class="dim">'+ev+'</td>'
   +'<td style="padding:1px 8px">'+rowBtn(w)+'</td></tr>';
 };
 const running=(s.workers||[]).filter(w=>w.alive).length;
 const resAlive=(s.workers||[]).filter(w=>/^local-res-\d+$/.test(w.name)&&w.alive).length;
 const hist=mem.history||[];
 const memPanel='<div style="margin-top:8px;border-top:1px solid #1e293b;padding-top:6px">'
  +'<b>MEMORY</b> <span class="dim" style="font-size:11px">free <b style="color:#e2e8f0">'+mem.free_gb+'</b>/'+mem.total_gb+' GB · fleet RSS <b style="color:#e2e8f0">'+(mem.fleet_rss_gb||0)+'</b> GB · guard level '+(g.level||0)+' (L1 &lt;3.5GB free · L2 &lt;1.5GB) · reserve '
  +'<input type="number" min="2" max="10" step="0.5" value="'+(lim.reserve_gb||4)+'" style="width:52px;background:#0b1120;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:0 3px;font-size:11px" data-cmd="reserve"> GB min headroom · fleet budget '
  +'<input type="number" min="1" max="28" step="1" value="'+(lim.fleet_budget_gb||12)+'" style="width:52px;background:#0b1120;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:0 3px;font-size:11px" data-cmd="budget"> GB cap</span>'
  +'<canvas id="memspark" width="620" height="54" style="display:block;margin-top:5px;background:#0b1120;border-radius:4px"></canvas>'
  +'<div class="dim" style="font-size:10px;margin-top:1px">green = free GB · orange = fleet RSS GB · last 30 min</div></div>';
 const resPanel='<div style="margin-top:8px;border-top:1px solid #1e293b;padding-top:6px">'
  +'<b>RESEARCHERS</b> <span style="color:#e2e8f0">'+resAlive+' running / '+(R.total||16)+'</span>'
  +' · <button style="'+BTN+';padding:1px 8px;font-size:11px;'+(R.mode!=='manual'?'border-color:#34d399':'opacity:.5')+'" data-cmd="mode-auto">Auto</button>'
  +'<button style="'+BTN+';padding:1px 8px;font-size:11px;'+(R.mode==='manual'?'border-color:#34d399':'opacity:.5')+'" data-cmd="mode-manual">Manual</button>'
  +' <button style="'+BTN+';padding:1px 7px;font-size:12px" '+(R.max<=0?'disabled ':'')+'data-cmd="max-dec">−</button>'
  +' <b id="resmax" style="font-size:13px">'+(R.max!=null?R.max:16)+'</b>'
  +' <button style="'+BTN+';padding:1px 7px;font-size:12px" '+(R.max>=16?'disabled ':'')+'data-cmd="max-inc">+</button>'
  +(R.mode==='manual'?'<span class="dim" style="font-size:11px"> · requested '+(R.max||0)+' · memory allows '+(R.memory_allows!=null?R.memory_allows:'?')+'</span>':'<span class="dim" style="font-size:11px"> · auto limit '+(R.allowed||0)+' (your cap '+(R.max!=null?R.max:16)+')</span>')
  +'<span class="dim" style="font-size:11px"> · avg RSS '+(R.avg_rss_mb||'?')+' MB</span>'
  +((R.disabled||[]).length?' <span class="dim" style="font-size:11px;color:#fbbf24"> · user-stopped: '+esc(R.disabled.join(', '))+'</span>':'')
  +((R.mem_blocked||[]).length?' <span class="dim" style="font-size:11px;color:#fb923c"> · memory-blocked: '+esc(R.mem_blocked.slice(0,6).join(', '))+((R.mem_blocked.length>6)?' +'+(R.mem_blocked.length-6)+' more':'')+'</span>':'')
  +'</div>';
 const actions=(g.actions||[]).slice(-4).reverse();
 const actHtml=actions.length?'<div class="dim" style="font-size:10px;margin-top:6px">guard: '+actions.map(a=>esc(a.detail).slice(0,110)).join(' · ')+'</div>':'';
 // ── Verification progress panel (ledger summary via /status) ──────────
 const vp=s.verification_progress;
 let vpHtml='';
 if(vp){
  const o=vp.offices||{},j=vp.jurisdictions||{};
  const pct=o.total?Math.round(100*(o.staff_verified||0)/o.total):0;
  const gaps=Object.entries(vp.gap_reasons||{}).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const p=vp.promotions||{},eta=vp.eta||{};
  vpHtml='<div style="margin-top:8px;border-top:1px solid #1e293b;padding-top:6px">'
   +'<b>VERIFICATION PROGRESS</b> <span class="dim" style="font-size:11px">'+(vp.at?esc(vp.at).slice(0,19).replace('T',' ')+' UTC':'')+'</span>'
   +'<div style="height:8px;background:#1e293b;border-radius:4px;margin:4px 0;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:#34d399"></div></div>'
   +'<span class="dim" style="font-size:11px">offices <b style="color:#e2e8f0">'+(o.staff_verified||0)+'/'+(o.total||0)+'</b> verified ('+pct+'%) · '+(o.needs_verification||0)+' pending · '+(o.needs_review||0)+' need review · jurisdictions all '+(j.all_verified||0)+' · some '+(j.some_verified||0)+' · none '+(j.none_verified||0)+' · no offices '+(j.no_offices||0)+'</span>'
   +'<div class="dim" style="font-size:11px;margin-top:2px">promotions '+(p.last_hour||0)+'/h · '+(p.last_24h||0)+'/24h · ETA '+(eta.hours!=null?eta.hours+'h':'—')+' · held relinks '+(vp.held_relinks||0)+'</div>'
   +(gaps.length?'<table style="margin-top:4px;font-size:11px">'+gaps.map(g=>'<tr><td style="padding:0 8px" class="dim">'+esc(g[0])+'</td><td style="padding:0 8px">'+g[1]+'</td></tr>').join('')+'</table>':'');
  if((vp.needs_review_total||0)+(vp.held_relinks||0)>0){
   const lg=await fetchLedger();
   if(lg){
    const nr=(lg.needs_review||[]).slice(0,15),hr=(lg.held_relinks||[]).slice(0,10);
    if(nr.length||hr.length){
     vpHtml+='<div style="margin-top:4px;font-size:11px"><b class="warn">Needs a person</b><table>'
      +nr.map(r=>'<tr><td style="padding:0 8px">'+esc(r.jurisdiction||'')+'</td><td style="padding:0 8px" class="dim">'+esc(r.office||'')+'</td><td style="padding:0 8px" class="dim">'+esc((r.reasons||[]).join(',')||'')+'</td><td style="padding:0 8px" class="dim">x'+(r.attempts||0)+'</td></tr>').join('')
      +hr.map(r=>'<tr><td style="padding:0 8px">'+esc((r.name||'')+', '+(r.state||''))+'</td><td style="padding:0 8px" class="dim" colspan="2">relink held: '+esc(r.reason||'')+'</td></tr>').join('')
      +'</table>'+((vp.needs_review_total||0)>15?'<div class="dim">+'+(vp.needs_review_total-15)+' more in .audit-work/verification-ledger.json</div>':'')+'</div>';
    }
   }
  }
  vpHtml+='</div>';
 }
 if(Date.now()>=srvHoldUntil)setH('srv',
  '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
  +'<b>PERMIT SERVER</b> <b style="color:'+stCol+'">'+esc(s.state).toUpperCase()+'</b>'
  +'<span class="dim">'+running+'/'+((s.workers||[]).length-1)+' workers · free '+mem.free_gb+'/'+mem.total_gb+' GB'+gtxt+'</span>'
  +'<span style="flex:1"></span>'+btns+'</div>'
  +resPanel
  +memPanel
  +'<table style="margin-top:8px"><tr class="dim" style="font-size:10px"><td style="padding:0 8px">worker</td><td style="padding:0 8px">group</td><td style="padding:0 8px">status</td><td style="padding:0 8px">pid</td><td style="padding:0 8px">rss</td><td style="padding:0 8px">uptime</td><td style="padding:0 8px">restarts</td><td style="padding:0 8px">doing</td><td style="padding:0 8px">last event</td><td></td></tr>'+(s.workers||[]).map(wrow).join('')+'</table>'
  +actHtml
  +vpHtml);
 const cv=document.getElementById('memspark');
 if(cv&&hist.length>1&&Date.now()>=srvHoldUntil){
  const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);
  const mx=Math.max((mem.total_gb||32)*1.02,...hist.map(h=>Math.max(h.free_gb||0,h.fleet_gb||0)));
  const draw=(key,col)=>{ctx.strokeStyle=col;ctx.lineWidth=1.4;ctx.beginPath();hist.forEach((h,i)=>{const x=i/(hist.length-1)*cv.width;const y=cv.height-3-((h[key]||0)/mx)*(cv.height-8);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
  draw('free_gb','#34d399');draw('fleet_gb','#fb923c');
 }
}
// Interaction hold: #srv re-renders every 3s, which swaps nodes mid-gesture —
// clicks can land on a detached element and number inputs get wiped while
// typing. Suppress the re-render briefly after any interaction inside #srv.
let srvHoldUntil=0;
document.addEventListener('pointerdown',e=>{if(e.target.closest&&e.target.closest('#srv'))srvHoldUntil=Date.now()+1200;},true);
document.addEventListener('focusin',e=>{if(e.target.closest&&e.target.closest('#srv'))srvHoldUntil=Date.now()+2500;},true);
document.addEventListener('keydown',e=>{if(e.target.closest&&e.target.closest('#srv'))srvHoldUntil=Date.now()+2500;},true);
// data-cmd button wiring — keeps onclick attributes free of quote escaping.
if(!window._srvCmdWired){window._srvCmdWired=1;document.addEventListener('click',(e)=>{
 const b=e.target.closest('[data-cmd]');if(!b)return;
 const c=b.dataset.cmd,R=(lastSrv&&lastSrv.guard&&lastSrv.guard.researchers)||{};
 // Stepper reads the pending (optimistic) value first — lastSrv only refreshes
 // every 3s, so without it a quick second click re-sends the same target.
 const max=(window._pendingMax&&window._pendingMax.v!=null)?window._pendingMax.v:(R.max!=null?R.max:16);
 if(c==='start'||c==='pause'||c==='resume'||c==='stop')srvCmd(c);
 else if(c==='verification')srvCmd('verification',{on:b.dataset.on==='1'});
 else if(c==='expansion')srvCmd('expansion',{on:b.dataset.on==='1'});
 else if(c==='killres')srvCmd('researchers',{max:0});
 else if(c==='mode-auto')srvCmd('researchers',{mode:'auto'});
 else if(c==='mode-manual')srvCmd('researchers',{mode:'manual'});
 else if(c==='max-dec'||c==='max-inc'){
  const v=c==='max-dec'?Math.max(0,max-1):Math.min(16,max+1);
  window._pendingMax={v,at:Date.now()};
  const el=document.getElementById('resmax');if(el)el.textContent=v;
  srvCmd('researchers',{mode:'manual',max:v});
 }
 else if(c==='wstop')srvCmd('worker',{name:b.dataset.name,action:'stop'});
 else if(c==='wstart')srvCmd('worker',{name:b.dataset.name,action:'start'});
});document.addEventListener('change',(e)=>{
 const i=e.target.closest('input[data-cmd]');if(!i)return;
 if(i.dataset.cmd==='reserve')srvCmd('limits',{reserve_gb:Number(i.value)});
 if(i.dataset.cmd==='budget')srvCmd('limits',{fleet_budget_gb:Number(i.value)});
});}
srvTick();setInterval(srvTick,3000);
tick();setInterval(tick,2000);
// Live elapsed counters — every in-flight line ticks its own age every second.
setInterval(()=>{const n=Date.now();document.querySelectorAll('.el').forEach(el=>{const s=Math.max(0,Math.round((n-Number(el.dataset.t||0))/1000));el.textContent=s<60?s+'s':Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s';});},1000);
</script>`;
let lastGoodStatus=null,lastStatusAt=0;
// status() is heavy (~6s at fleet scale) — compute it in the background and
// serve the last payload instantly. Previously the page polled /status.json
// every 100ms and stampeded the single-threaded server: every section on the
// page stayed empty because requests queued behind the storm.
let statusBuilding=false;
setInterval(()=>{if(statusBuilding)return;statusBuilding=true;try{lastGoodStatus=JSON.stringify(status());lastStatusAt=Date.now();}catch(e){try{console.error('status build:',e?.message||e)}catch{}}finally{statusBuilding=false;}},2000).unref();
try{lastGoodStatus=JSON.stringify(status());lastStatusAt=Date.now();}catch{}
// Cumulative scanned counter — a persistent set of every address ever seen
// so "scanned" grows across event-log rotation instead of resetting to the
// current pool. Seeded from .audit-work/scan-total.json; flushed on change.
const scanSet=new Set(),doneSet=new Set();let scanDirty=false;
try{const st=JSON.parse(require('fs').readFileSync('.audit-work/scan-total.json','utf8'));for(const a of st.addresses||[])scanSet.add(a);for(const a of st.done||[])doneSet.add(a);}catch{}
setInterval(()=>{if(scanDirty){scanDirty=false;try{require('fs').writeFileSync('.audit-work/scan-total.json',JSON.stringify({addresses:[...scanSet],done:[...doneSet],at:Date.now()}));}catch{}}},30000);
process.on('uncaughtException',(e)=>{try{console.error('uncaught:',e?.message||e)}catch{}});
process.on('unhandledRejection',(e)=>{try{console.error('unhandled:',e?.message||e)}catch{}});
http.createServer((req,res)=>{
  try{
    if(req.url.startsWith('/api/server/')){
      // Same-origin proxy to the permit-server control API (127.0.0.1:4175).
      const p=req.url.slice('/api/server'.length);
      const pr=http.request({host:'127.0.0.1',port:4175,path:p,method:req.method,headers:{'content-type':'application/json'}},(r)=>{res.writeHead(r.statusCode,{'content-type':'application/json','cache-control':'no-store'});r.pipe(res);});
      pr.on('error',()=>{res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"permit-server offline"}');});
      req.pipe(pr);return;
    }
    if(req.url==='/api/verification-ledger'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(rd('.audit-work/verification-ledger.json')||'{"error":"no ledger yet"}');return;
    }
    if(req.url.startsWith('/status.json')){
      const payload=lastGoodStatus||'{"error":"status building"}';
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(payload);return;
    }
    res.writeHead(200,{'content-type':'text/html'});res.end(page);
  }catch(e){res.writeHead(500);res.end('server error');}
}).listen(+(process.env.DASH_PORT||4173),()=>console.log('live on '+(process.env.DASH_PORT||4173)));
