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
      // Live-sourced verified count — mirror-sync writes this from RAW remote
      // rows each cycle, so it can't be inflated by unflushed local upserts.
      // Prefer it when fresh (<35min); the mirror count is the fallback.
      try{const lv=JSON.parse(readFileSync('.audit-work/live-verified-count.json','utf8'));
        if(lv.staff_verified!=null&&Date.now()-Date.parse(lv.at)<35*60e3){verifiedOffices=lv.staff_verified;if(lv.offices!=null)totalOffices=lv.offices;}}catch{}
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
const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CCS Permit Server</title>
<style>
:root{--bg:#0b1120;--panel:#131c31;--panel2:#17223c;--line:#24304d;--txt:#e2e8f0;--dim:#8b9bb8;--faint:#5b6b8c;
 --green:#34d399;--amber:#fbbf24;--red:#f87171;--blue:#60a5fa;--purple:#a78bfa;
 --mono:ui-monospace,'Cascadia Mono',Consolas,monospace;
 --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--txt);font:14px/1.5 var(--sans);margin:0;padding:0}
header{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:12px;flex-wrap:wrap;
 background:rgba(11,17,32,.96);backdrop-filter:blur(6px);padding:12px 20px;border-bottom:1px solid var(--line)}
.brand{font-size:17px;font-weight:700;letter-spacing:.2px}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 12px;font-size:12.5px;font-weight:600;border:1px solid var(--line)}
.pill i{width:8px;height:8px;border-radius:50%;display:inline-block}
.pill.on{color:var(--green);border-color:#14532d;background:#052e1b}.pill.on i{background:var(--green)}
.pill.pause{color:var(--amber);border-color:#713f12;background:#2b1d04}.pill.pause i{background:var(--amber)}
.pill.off{color:var(--dim);border-color:var(--line);background:#151d31}.pill.off i{background:var(--faint)}
.pill.down{color:var(--red);border-color:#7f1d1d;background:#2a0f0f}.pill.down i{background:var(--red)}
button{font:600 12.5px var(--sans);color:var(--txt);background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:6px 14px;cursor:pointer}
button:hover:not(:disabled){border-color:var(--blue);background:#1b2a4d}
button:disabled{opacity:.38;cursor:not-allowed}
button.danger{background:#3b1215;border-color:#7f1d1d;color:#fca5a5}
button.danger:hover:not(:disabled){border-color:var(--red);background:#4c1a1a}
button.primary{border-color:#1d4ed8;background:#12306e}
.switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:12.5px;font-weight:600;user-select:none}
.switch input{appearance:none;width:34px;height:19px;border-radius:999px;background:#24304d;position:relative;cursor:pointer;transition:.15s;flex-shrink:0}
.switch input:checked{background:var(--green)}
.switch input::after{content:'';position:absolute;top:2.5px;left:3px;width:14px;height:14px;border-radius:50%;background:#e2e8f0;transition:.15s}
.switch input:checked::after{left:17px}
.switch input:disabled{cursor:not-allowed;opacity:.4}
.switch .swv{color:var(--dim);font-weight:400;font-size:11.5px}
.pipe{display:flex;align-items:stretch;gap:8px;flex-wrap:wrap}
.stage{background:#141c30;border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:120px;cursor:pointer;flex:0 1 auto}
.stage:hover{border-color:var(--blue)}
.stage.sel{border-color:var(--blue);background:#16223f}
.stage .sc.n{font:700 20px var(--mono)}
.stage .st{font-size:12px;font-weight:600;margin-top:2px}
.stage .ss{font-size:11px;margin-top:2px;max-width:160px}
.arrow{align-self:center;color:var(--dim);font-size:16px}
.acts{display:flex;gap:8px;flex-wrap:wrap;border-left:1px solid var(--line);padding-left:8px}
.badge{font-size:11.5px;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:3px 10px;cursor:help}
#banner{display:none;background:#3b1215;border-bottom:1px solid #7f1d1d;color:#fca5a5;padding:14px 20px;font-size:13.5px}
#banner.show{display:block}
nav.tabs{display:flex;gap:2px;padding:10px 20px 0;border-bottom:1px solid var(--line);background:var(--bg);flex-wrap:wrap}
nav.tabs button{background:none;border:none;border-bottom:2.5px solid transparent;border-radius:0;padding:8px 14px;font-size:13.5px;font-weight:600;color:var(--dim)}
nav.tabs button:hover:not(:disabled){color:var(--txt);background:none}
nav.tabs button[aria-selected="true"]{color:var(--txt);border-bottom-color:var(--blue)}
main{padding:18px 20px 40px;max-width:1240px;margin:0 auto}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:14px}
h2{font-size:14px;font-weight:700;margin:0 0 10px;letter-spacing:.2px}
h3{font-size:12.5px;font-weight:700;margin:14px 0 6px;color:var(--dim);text-transform:uppercase;letter-spacing:.6px}
.dim{color:var(--dim)}.small{font-size:12px}.mono{font-family:var(--mono)}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.blue{color:var(--blue)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0}
.tile{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile .t{font-size:11.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px}
.tile .v{font:700 22px var(--mono);margin-top:4px}
.tile .s{font-size:11.5px;color:var(--dim);margin-top:2px}
.bar{height:14px;background:#0b1120;border-radius:7px;overflow:hidden;display:flex}
.bar>i{display:block;height:100%}
.chip{display:inline-block;border-radius:999px;padding:1.5px 9px;font-size:11px;font-weight:600;white-space:nowrap}
.chip.g{color:var(--green);background:#052e1b;border:1px solid #14532d}
.chip.a{color:var(--amber);background:#2b1d04;border:1px solid #713f12}
.chip.r{color:var(--red);background:#2a0f0f;border:1px solid #7f1d1d}
.chip.n{color:var(--dim);background:#151d31;border:1px solid var(--line)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{border:none;border-radius:0;padding:6px 16px}
.seg button.on{background:#12306e;color:#fff}
.stepper{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-left:8px;vertical-align:middle}
.stepper button{border:none;border-radius:0;padding:6px 13px;font-size:15px}
.stepper b{font:700 15px var(--mono);padding:0 12px;min-width:34px;text-align:center}
.rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:10px;margin-top:12px}
.rcard{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.rcard .rn{font-weight:700;font-size:12.5px;margin-bottom:5px}
.rcard .town{font-size:12px;margin-top:6px;min-height:32px;color:var(--txt)}
.rcard .meta{font-size:11px;color:var(--dim);margin-top:4px}
.rcard button{padding:3px 10px;font-size:11px;margin-top:7px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
tr:last-child td{border-bottom:none}
.feed .row{display:flex;gap:10px;padding:5px 0;border-bottom:1px solid #1a2440;font-size:13px;align-items:baseline}
.feed .row .who{color:var(--blue);flex-shrink:0;width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.feed .row .msg{flex:1;overflow:hidden}
.feed .row .when{color:var(--faint);flex-shrink:0;font-size:11.5px;width:74px;text-align:right}
.fchips{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.fchips button{border-radius:999px;padding:4px 13px;font-size:12px}
.fchips button.on{border-color:var(--blue);background:#12306e;color:#fff}
details.mored{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-top:14px}
details.mored summary{cursor:pointer;font-weight:700;font-size:13px;color:var(--dim)}
details.mored[open] summary{margin-bottom:12px;color:var(--txt)}
canvas.chart{display:block;width:100%;background:#0b1120;border-radius:8px}
.legend{display:flex;gap:18px;font-size:12px;color:var(--dim);margin-top:6px;flex-wrap:wrap}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.setrow{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-top:8px}
.setrow label{display:block;font-size:12px;color:var(--dim);margin-bottom:4px}
.setrow input{width:76px;background:#0b1120;color:var(--txt);border:1px solid var(--line);border-radius:7px;padding:6px 9px;font:600 13px var(--mono)}
.setrow .ex{font-size:12px;color:var(--dim);max-width:330px}
#saveMsg{font-size:12.5px;font-weight:600;margin-left:6px}
.empty{color:var(--faint);font-size:13px;padding:10px 0}
.tip{border-bottom:1px dotted var(--faint);cursor:help}
@media (max-width:1000px){.tiles{grid-template-columns:repeat(2,1fr)}.feed .row .who{width:110px}header{gap:8px}}
</style></head>
<body>
<header>
 <div class="brand">CCS Permit Server</div>
 <span id="pill" class="pill off"><i></i>…</span>
 <span style="flex:1"></span>
 <button id="btnStart" disabled>Start</button>
 <button id="btnPause" disabled>Pause</button>
 <button id="btnStop" class="danger" disabled>Stop</button>
 <label class="switch" title="When on, the checker verifies office records and researchers collect evidence."><input type="checkbox" id="swVerify" disabled><span>Verify jurisdictions</span><span class="swv" id="swVerifyTxt"></span></label>
 <span class="badge" id="expBadge" title="Adding new jurisdictions unlocks automatically once every current one is verified.">🔒 Expansion locked</span>
 <span class="badge" id="awakeBadge" title="Windows sleep is prevented while the server runs so the fleet keeps working."></span>
</header>
<div id="banner"><b>Server is offline.</b> The permit server isn’t answering — nothing on this page is live right now. To start it, double-click <b>CCS Permit Server</b> on the desktop. This page keeps retrying automatically.</div>
<nav class="tabs" role="tablist">
 <button role="tab" data-tab="overview" aria-selected="true">Overview</button>
 <button role="tab" data-tab="researchers" aria-selected="false">Researchers</button>
 <button role="tab" data-tab="verification" aria-selected="false">Verification</button>
 <button role="tab" data-tab="audit" aria-selected="false">AI Audit</button>
 <button role="tab" data-tab="memory" aria-selected="false">Memory</button>
 <button role="tab" data-tab="activity" aria-selected="false">Activity</button>
 <button role="tab" data-tab="advanced" aria-selected="false">Advanced</button>
</nav>
<main>
 <section id="tab-overview"></section>
 <section id="tab-researchers" hidden></section>
 <section id="tab-verification" hidden></section>
 <section id="tab-audit" hidden></section>
 <section id="tab-memory" hidden></section>
 <section id="tab-activity" hidden></section>
 <section id="tab-advanced" hidden></section>
</main>
<script>
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num=n=>Number(n||0).toLocaleString('en-US');
const ago=(t)=>{const s=Math.max(0,Math.round((Date.now()-t)/1000));if(s<60)return s<3?'just now':s+' sec ago';const m=Math.floor(s/60);if(m<60)return m+' min ago';const h=Math.floor(m/60);if(h<24)return h+' hr ago';return Math.floor(h/24)+' days ago';};
const agoT=(t)=>{const ms=typeof t==='number'?t:Date.parse(t);return Number.isFinite(ms)?ago(ms):'—';};
const gb=n=>{const v=Number(n);return Number.isFinite(v)?(Math.round(v*10)/10)+' GB':'—';};
const _h={};const setH=(id,html)=>{if(_h[id]!==html){_h[id]=html;const el=$(id);if(el)el.innerHTML=html;}};
async function srvCmd(p,body){const r=await fetch('/api/server/'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||('HTTP '+r.status));}return r.json().catch(()=>({}));}
// Interaction hold — the page re-renders every 3s; without a hold a click can
// land on a just-replaced node and typing gets wiped. Any interaction inside
// the page pauses rendering briefly.
let holdUntil=0;
['pointerdown','focusin','keydown'].forEach(ev=>document.addEventListener(ev,e=>{if(e.target&&e.target.closest&&e.target.closest('main,header'))holdUntil=Date.now()+(ev==='pointerdown'?1200:2500);},true));
const held=()=>Date.now()<holdUntil;
// — plain-English mappings —
const FRIENDLY={
 'write-flusher':['Saver','sends queued changes to the app'],
 'mirror-sync':['Copier','keeps a local copy of app data up to date'],
 'seed-scan':['Office builder','builds office records for every jurisdiction'],
 'authority-verifier':['Checker','verifies offices from collected evidence'],
 'queue-hygiene':['Cleaner','keeps the work queue tidy'],
 'profile-relink':['Linker','fixes links to duplicate profiles'],
 'dashboard':['This page','the dashboard itself'],
 'forever-runner':['Expansion','adds new jurisdictions — locked until all current ones are verified'],
 'parcel-resolver':['Expansion','adds new jurisdictions — locked until all current ones are verified'],
};
const friendlyName=n=>{if(FRIENDLY[n])return FRIENDLY[n][0];const m=n.match(/^local-res-([0-9]+)$/);if(m)return 'Researcher '+(Number(m[1])+1);if(/^office-sweep-[0-9]+$/.test(n))return 'Expansion';return n;};
const friendlyDesc=n=>{if(FRIENDLY[n])return FRIENDLY[n][1];if(/^local-res-[0-9]+$/.test(n))return 'reads official town websites for evidence';if(/^office-sweep-[0-9]+$/.test(n))return 'adds new jurisdictions — locked until all current ones are verified';return '';};
const STATUS_PLAIN={running:['Working','g'],idle:['Waiting','n'],done:['Done','n'],
 'paused-by-guard':['Paused for memory','a'],'culled-by-memory':['Paused for memory','a'],
 'blocked-by-memory':['Waiting for memory','a'],'culled-by-cpu':['Paused — CPU busy','a'],
 'blocked-by-cpu':['Waiting — CPU busy','a'],'culled-idle':['Off — nothing to research','n'],
 'no-work':['Waiting — nothing to research','n'],'ramping':['Starting soon','a'],
 'stopped-by-user':['Stopped by you','r'],stopped:['Off','n']};
const chip=w=>{const p=STATUS_PLAIN[w.status]||['Off','n'];return '<span class="chip '+p[1]+'">'+p[0]+'</span>';};
const GAP_LABEL={no_research:'No research yet',no_quote:'No proof sentence found yet',no_role_match:'Research found, but not for this office’s job',
 unofficial_source:'Evidence only from unofficial sites',county_scope:'County office — coverage unclear',non_permit_body:'Not a permitting office',other:'Other checks failed'};
const GAP_NEXT={no_research:'Researchers will collect it automatically.',no_quote:'Researchers keep looking for a page that says this office handles permits.',
 no_role_match:'Researchers keep looking for evidence about this specific job.',unofficial_source:'Needs an official .gov or city page — researchers keep looking.',
 county_scope:'Needs proof the county office also covers areas outside cities.',non_permit_body:'Listed office is e.g. police or courts — will be skipped.',other:'The checker will try again on its next pass.'};
const ROLE_LABEL={sign_permit:'Sign permit',zoning:'Zoning',right_of_way:'Right-of-way',building:'Building permit',electrical_permit:'Electrical permit',electrical_inspection:'Electrical inspection',historic_review:'Historic review',plumbing:'Plumbing',mechanical:'HVAC / mechanical',demolition:'Demolition'};
const roleLabel=r=>ROLE_LABEL[r]||String(r||'').replace(/_/g,' ').replace(/(^| )[a-z]/g,m=>m.toUpperCase());
// Guard action strings → plain English for the Memory tab + activity feed.
const resWord=(a,b)=>'Researcher '+(Number(b)+1);
function plainAction(d){
 const s=String(d||'');
 let m=s.match(/(?:pressure|emergency|fleet budget) cull local-res-([0-9]+) — free ([[0-9].]+)GB/);
 if(m)return 'Stopped Researcher '+(Number(m[1])+1)+' to free memory (free dropped to '+m[2]+' GB)';
 m=s.match(/cull local-res-([0-9]+) — Windows memory headroom ([0-9.]+)GB/);
 if(m)return 'Stopped Researcher '+(Number(m[1])+1)+' — Windows was nearly out of memory space (down to '+m[2]+' GB)';
 m=s.match(/cull local-res-([0-9]+) — server using ([0-9.]+)GB/);
 if(m)return 'Stopped Researcher '+(Number(m[1])+1)+' — server was over its memory limit';
 m=s.match(/fleet budget cull local-res-([0-9]+)/);if(m)return 'Stopped Researcher '+(Number(m[1])+1)+' — server was over its memory limit';
 m=s.match(/CPU cull local-res-([0-9]+)/);if(m)return 'Stopped Researcher '+(Number(m[1])+1)+' — the processor was overloaded';
 m=s.match(/idle cull local-res-([0-9]+)/);if(m)return 'Stopped Researcher '+(Number(m[1])+1)+' — no research work was waiting';
 m=s.match(/spawn blocked local-res-([0-9]+) — CPU/);if(m)return 'Waiting to start Researcher '+(Number(m[1])+1)+' — processor busy';
 m=s.match(/spawn blocked local-res-([0-9]+) — only ([0-9]+) piece/);if(m)return 'Waiting to start Researcher '+(Number(m[1])+1)+' — only '+m[2]+' pieces of work left';
 m=s.match(/spawn blocked local-res-([0-9]+)/);if(m)return 'Waiting to start Researcher '+(Number(m[1])+1)+' — not enough free memory yet';
 m=s.match(/rotation — local-res-([0-9]+) rests, local-res-([0-9]+)/);
 if(m)return 'Researcher '+(Number(m[1])+1)+' finished its turn — Researcher '+(Number(m[2])+1)+' takes over';
 m=s.match(/memory emergency — free ([0-9.]+)GB/);if(m)return 'Memory emergency ('+m[1]+' GB free) — pausing background work';
 m=s.match(/memory recovered — free ([0-9.]+)GB/);if(m)return 'Memory recovered ('+m[1]+' GB free) — resuming';
 if(/margins held/.test(s))return 'Memory is steady again — researchers can restart';
 if(/kill-all/.test(s))return 'All researchers stopped by you';
 m=s.match(/guard level ([0-9]) — free ([[0-9].]+)GB/);if(m)return 'Memory low ('+m[2]+' GB free) — pausing background work';
 if(/guard cleared/.test(s)){m=s.match(/free ([[0-9].]+)GB/);return 'Memory recovered'+(m?' ('+m[1]+' GB free)':'')+' — resuming';}
 return s.replace(/local-res-([0-9]+)/g,resWord);
}
// — state —
let srv=null,srvAt=0,ledger=null,ledgerAt=0,promos=null,promosAt=0,legacy=null,legacyAt=0,feedFilter='all';
let pendingMax=null;
const TABS=['overview','researchers','verification','audit','memory','activity','advanced'];
let tab=(location.hash||'').replace('#/','')||'overview';if(!TABS.includes(tab))tab='overview';
function showTab(t){tab=t;location.hash='#/'+t;document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t?'true':'false'));TABS.forEach(x=>$('tab-'+x).hidden=x!==t);render();}
document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
window.addEventListener('hashchange',()=>{const t=(location.hash||'').replace('#/','');if(TABS.includes(t)&&t!==tab)showTab(t);});
// — polling (≤ every 3s, single cached build server-side) —
let offline=false;
async function pollSrv(){try{const r=await fetch('/api/server/status',{cache:'no-store'});if(r.ok){srv=await r.json();srvAt=Date.now();if(offline){offline=false;$('banner').classList.remove('show');}}}catch(e){}if(!srv||Date.now()-srvAt>8000){if(!offline){offline=true;$('banner').classList.add('show');}}}
async function pollLegacy(){try{const r=await fetch('/status.json',{cache:'no-store'});if(r.ok){legacy=await r.json();legacyAt=Date.now();}}catch(e){}}
async function pollLedger(){if(Date.now()-ledgerAt<15000)return;try{const r=await fetch('/api/verification-ledger',{cache:'no-store'});if(r.ok){ledger=await r.json();ledgerAt=Date.now();}}catch(e){}}
async function pollPromos(){if(Date.now()-promosAt<15000)return;try{const r=await fetch('/api/promotions',{cache:'no-store'});if(r.ok){promos=await r.json();promosAt=Date.now();}}catch(e){}}
// — shared derivations —
const workers=()=>srv&&srv.workers||[];
const resList=()=>workers().filter(w=>/^local-res-[0-9]+$/.test(w.name));
const resAlive=()=>resList().filter(w=>w.alive);
const resBusy=()=>resList().filter(w=>w.alive&&w.last_heartbeat&&w.last_heartbeat.state==='busy').length;
const findW=n=>workers().find(w=>w.name===n);
const vp=()=>srv&&srv.verification_progress;
function outboxDepth(){const w=findW('write-flusher');const m=w&&w.last_event&&String(w.last_event.detail||'').match(/depth ([0-9]+)/);return m?Number(m[1]):null;}
function rightNow(){
 if(!srv)return 'Connecting…';
 if(srv.state==='stopped')return 'The server is stopped. Press Start to begin again.';
 if(srv.state==='paused')return 'Everything is paused. Press Resume to continue.';
 const parts=[];
 const nb=resBusy(),na=resAlive().length;
 if(nb)parts.push(nb+' researcher'+(nb>1?'s are':' is')+' reading town websites');
 else if(na)parts.push(na+' researcher'+(na>1?'s are':' is')+' standing by');
 const v=findW('authority-verifier');
 if(v&&v.alive&&v.last_heartbeat&&v.last_heartbeat.state==='busy')parts.push('the checker is reviewing evidence');
 const od=outboxDepth();
 if(od!=null&&od>0)parts.push(num(od)+' change'+(od>1?'s':'')+' waiting to save to the app');
 return parts.length?parts.join('; ')+'.':'Everything is caught up right now.';
}
function etaText(){
 const e=vp()&&vp().eta;if(!e)return '—';
 if(e.hours==null)return 'Can’t estimate yet';
 const h=e.hours;if(h<48)return 'about '+Math.max(1,Math.round(h))+' hours at this pace';
 return 'about '+Math.round(h/24)+' days at this pace';
}
let nyShowAll=false;
function needsYou(){
 const out=[];const seen=new Set();
 if(ledger){
  for(const h of (ledger.held_relinks||[])){
   // ledger rows repeat per verifier pass — one row per distinct locality
   const key=h.locality_id||String(h.name||'').toLowerCase();
   if(seen.has(key))continue;seen.add(key);
   const note=(String(h.name||'').match(/[(]([^)]*)[)]/)||[])[1];
   const loc=String(h.name||'?').replace(/ *[(][^)]*[)]/g,'')+(h.state?', '+h.state:'');
   const bits=[h.candidates>1?num(h.candidates)+' possible profiles match — a person needs to pick the right one':'No matching profile found — a person needs to check'];
   if(note)bits.push(note);
   out.push({loc,reason:bits.join(' · ')});
  }
  for(const r of (ledger.needs_review||[])){
   const key='rev:'+String(r.jurisdiction||'')+'|'+String(r.office||'');
   if(seen.has(key))continue;seen.add(key);
   const rs=[...new Set((r.reasons||[]).map(x=>GAP_LABEL[x]||x))].slice(0,3).join('; ')||'verification stuck after several tries';
   out.push({loc:String(r.jurisdiction||'?'),office:r.office,reason:rs,tiers:r.tiers_tried});
  }
 }
 return out;
}
// — header —
function renderHeader(){
 const on=!!srv&&!offline;
 const st=!on?null:srv.state;
 const pill=$('pill');
 const map={running:['Running','on'],paused:['Paused','pause'],stopped:['Stopped','off']};
 const p=on?(map[st]||['…','off']):['Offline','down'];
 pill.className='pill '+p[1];pill.innerHTML='<i></i>'+p[0];
 $('btnStart').textContent=st==='paused'?'Resume':'Start';
 $('btnStart').disabled=!(on&&(st==='stopped'||st==='paused'));
 $('btnPause').disabled=!(on&&st==='running');
 $('btnStop').disabled=!(on&&(st==='running'||st==='paused'));
 const sw=$('swVerify');sw.disabled=!on||st==='stopped';sw.checked=on&&!!srv.verification;
 $('swVerifyTxt').textContent=on?(srv.verification?'On':'Off'):'';
 const badge=$('expBadge');
 if(on&&srv.expansion_locked===false){badge.textContent='Expansion unlocked';badge.title='New jurisdictions are being added.';}
 else{badge.innerHTML='🔒 Expansion locked';badge.title='Adding new jurisdictions unlocks automatically once every current one is verified.';}
 const ab=$('awakeBadge');
 if(on&&srv.keep_awake){ab.textContent='☕ PC kept awake';ab.style.color='var(--green)';}
 else if(on){ab.textContent='Sleep allowed (server stopped)';ab.style.color='';}
 else{ab.textContent='';}
}
$('btnStart').addEventListener('click',async()=>{try{await srvCmd(srv&&srv.state==='paused'?'resume':'start');}catch(e){alert(e.message);}});
$('btnPause').addEventListener('click',async()=>{try{await srvCmd('pause');}catch(e){alert(e.message);}});
$('btnStop').addEventListener('click',async()=>{if(!confirm('Stop the whole permit server? All workers will shut down (the saver finishes its current batch first).'))return;try{await srvCmd('stop');}catch(e){alert(e.message);}});
$('swVerify').addEventListener('change',async e=>{const on=e.target.checked;try{await srvCmd('verification',{on});}catch(err){e.target.checked=!on;alert(err.message);}});
// Dynamically-rendered toggles — delegated so re-renders don't drop them.
document.addEventListener('change',async e=>{
 const id=e.target&&e.target.id;
 try{
  if(id==='swExtract'){const on=e.target.checked;await srvCmd('ai-extract',{on});}
  else if(id==='swAudit'){const on=e.target.checked;await srvCmd('ai-audit',{on});}
  else if(id==='auditTypeF'){auditTypeV=e.target.value;auditPage=0;render();}
  else if(id==='auditActionF'){auditActionV=e.target.value;auditPage=0;render();}
 }catch(err){alert(err.message);}
});
// — Overview tab —
function renderOverview(){
 const o=vp()&&vp().offices||{},j=vp()&&vp().jurisdictions||{};
 const pct=o.total?Math.round(100*(o.staff_verified||0)/o.total):0;
 const mem=srv&&srv.memory||{};
 const R=(srv&&srv.guard&&srv.guard.researchers)||{};
 const res=resAlive().length;
 const ny=needsYou();
 setH('tab-overview',
 '<div class="card"><h2>Verification progress</h2>'
 +'<div style="font:700 26px var(--mono);margin-bottom:8px">'+num(o.staff_verified||0)+' of '+num(o.total||0)+' offices verified <span class="dim" style="font-size:15px">('+pct+'%)</span></div>'
 +'<div class="bar"><i style="width:'+pct+'%;background:var(--green)"></i></div>'
 +'<div class="dim small" style="margin-top:8px">Right now: '+esc(rightNow())+'</div>'
 +(srv&&srv.promote_hold?'<div class="warn" style="margin-top:6px">Promotions on hold — waiting for AI judge</div>':'')
 +'<div class="dim small" style="margin-top:3px"><span class="blue">Auto-scaling:</span> running '+res+' researcher'+(res===1?'':'s')+(R.mode==='manual'?' of '+ (R.max!=null?R.max:16) +' (manual)':' (auto, no limit)')+' — scales up and down automatically with memory, CPU and available work.</div>'
 +(R.hold_reason?'<div class="dim small" style="margin-top:3px">Holding at '+res+': '+esc(R.hold_reason)+'</div>':'')+'</div>'
 +'<div class="tiles">'
 +'<div class="tile"><div class="t">Verified in the last hour</div><div class="v ok">'+num((vp()&&vp().promotions&&vp().promotions.last_hour)||0)+'</div><div class="s">'+num((vp()&&vp().promotions&&vp().promotions.last_24h)||0)+' in the last 24 hours</div></div>'
 +'<div class="tile"><div class="t">Left to verify</div><div class="v">'+num(o.needs_verification||0)+'</div><div class="s">'+num(o.needs_review||0)+' need a person</div></div>'
 +'<div class="tile"><div class="t">Verified — needs re-check</div><div class="v">'+num(o.needs_recheck||0)+'</div><div class="s">verified earlier, now being re-proven</div></div>'
 +'<div class="tile"><div class="t">Estimated finish</div><div class="v" style="font-size:16px;line-height:1.35">'+esc(etaText())+'</div><div class="s">at the current pace</div></div>'
 +'<div class="tile"><div class="t">Memory</div><div class="v" style="font-size:16px;line-height:1.35">'+gb(mem.free_gb)+' free</div><div class="s">of '+gb(mem.total_gb)+' total · the server uses '+gb(mem.fleet_rss_gb)+'</div></div></div>'
 +'<div class="card"><h2>Needs you <span class="dim" style="font-weight:400">('+ny.length+')</span></h2>'
 +(ny.length?'<table>'+(nyShowAll?ny:ny.slice(0,8)).map(x=>'<tr><td style="width:260px"><b>'+esc(x.loc)+'</b>'+(x.office?'<div class="dim small">'+esc(x.office)+'</div>':'')+'</td><td class="dim">'+esc(x.reason)+'</td></tr>').join('')+'</table>'+(ny.length>8?'<div class="dim small" style="margin-top:6px"><a href="#/overview" data-cmd="ny-more">'+(nyShowAll?'Show fewer':'+'+(ny.length-8)+' more — show all')+'</a></div>':''):'<div class="empty">Nothing needs you right now.</div>')
 +'</div>');
}
// — Researchers tab —
function renderResearchers(){
 const R=(srv&&srv.guard&&srv.guard.researchers)||{};
 const ceil=R.ceiling||64;
 const max=pendingMax&&Date.now()-pendingMax.at<10000?pendingMax.v:(R.max!=null?R.max:16);
 const mode=R.killall?'killed':(R.mode||'auto');
 const memAllows=R.memory_allows!=null?R.memory_allows:null;
 // Dynamic list: cards for every worker doing something (running, held by a
 // gate, stopped by you). Slots that are simply off or were culled collapse
 // into one expandable group — with an uncapped pool they'd bury the page.
 const interesting=w=>w.alive||['stopped-by-user','no-work','ramping','blocked-by-memory','blocked-by-cpu','idle'].includes(w.status);
 const card=w=>{
  const m=w.name.match(/([0-9]+)$/);const label='Researcher '+(Number(m[1])+1);
  const hb=w.last_heartbeat||{};
  // Only show the town when the worker is actually alive — a dead slice
  // keeps its last heartbeat file and would lie about still working.
  const town=w.alive&&hb.state==='busy'&&hb.item?hb.item:'';
  const mem=w.alive&&w.rss_mb?w.rss_mb+' MB':'—';
  const onIt=w.alive&&hb.at&&hb.state==='busy'?'for '+agoT(hb.at):'';
  const btn=w.alive
   ?'<button data-cmd="wstop" data-name="'+esc(w.name)+'">Stop</button>'
   :'<button data-cmd="wstart" data-name="'+esc(w.name)+'">Start</button>';
  return '<div class="rcard"><div class="rn">'+label+'</div>'+chip(w)
   +'<div class="town">'+(town?esc(town):'<span class="dim">'+(w.status==='idle'?'between tasks':'not running')+'</span>')+'</div>'
   +'<div class="meta">'+(onIt?esc(onIt)+' · ':'')+mem+'</div>'+btn+'</div>';
 };
 const sorted=resList().sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 const shown=sorted.filter(interesting).map(card).join('');
 const hidden=sorted.filter(w=>!interesting(w));
 const disList=(R.disabled||[]).length?' · <span class="warn">you stopped: '+esc((R.disabled||[]).map(friendlyName).join(', '))+'</span>':'';
 const workTxt=R.work_available!=null?' · '+num(R.work_available)+' pieces of work waiting':'';
 const cpuTxt=R.cpu_pct!=null?' · CPU '+R.cpu_pct+'%':'';
 setH('tab-researchers',
 '<div class="card"><h2>Researchers</h2>'
 +'<div class="dim small" style="margin-bottom:12px">Researchers visit official town websites to collect evidence. More researchers = faster, but each uses about 0.5 GB of memory.</div>'
 +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
 +'<span class="seg"><button data-cmd="mode-auto" class="'+(mode==='auto'?'on':'')+'">Auto</button><button data-cmd="mode-manual" class="'+(mode==='manual'?'on':'')+'">Manual</button></span>'
 +'<span class="dim small">'+(mode==='manual'?'You pick the count — memory, CPU and work still cap it for safety.':(mode==='killed'?'All researchers are stopped — pick a mode or count to restart.':'Auto — no limit; memory, CPU and available work decide.'))+'</span></div>'
 +(mode==='manual'?'<div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
 +'<span class="dim small">Run exactly:</span><span class="stepper"><button data-cmd="max-dec"'+(max<=0?' disabled':'')+'>−</button><b id="resmax">'+max+'</b><button data-cmd="max-inc"'+(max>=ceil?' disabled':'')+'>+</button></span>'
 +(memAllows!=null?'<span class="dim small">Room for about <b class="num" style="color:var(--txt)">'+memAllows+'</b> more right now'+(max>memAllows?' — your count is capped by memory':'')+'</span>':'')
 +'</div>':'<div class="dim small" style="margin-top:8px">Safety ceiling: '+ceil+' researchers — the gates below usually hold it well under that.</div>')
 +'<div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
 +(R.hold_reason?'<span class="dim small">Holding at '+resAlive().length+': '+esc(R.hold_reason)+'</span>':'')
 +'<span style="flex:1"></span><button class="danger" data-cmd="killres">Stop all researchers</button></div>'
 +'<div class="dim small" style="margin-top:8px">'+resAlive().length+' running'+(mode==='auto'?' (auto, no limit)':'')+(R.avg_rss_mb?' · about '+R.avg_rss_mb+' MB each':'')+workTxt+cpuTxt+disList+'</div>'
 +((srv&&srv.ai&&srv.ai.boost_waiting)?'<div class="dim small" style="margin-top:6px"><b class="num" style="color:var(--txt)">'+num(srv.ai.boost_waiting)+'</b> audit fix'+(srv.ai.boost_waiting===1?'':'es')+' waiting — these go to the front of research work (see the AI Audit tab)</div>':'')
 +'</div>'
 +'<div class="rgrid">'+shown+'</div>'
 +(hidden.length?'<details style="margin-top:10px"><summary class="dim small" style="cursor:pointer">'+hidden.length+' more slots — off or recently stopped</summary><div class="rgrid" style="margin-top:10px">'+hidden.map(card).join('')+'</div></details>':'')
 +renderExtractCard());
}
// — AI extractor card (SWE-2.1 evidence hunts) —
function renderExtractCard(){
 const e=(srv&&srv.ai&&srv.ai.extract)||{};
 const w=(srv&&srv.workers||[]).find(x=>x.name==='ai-extractor')||{};
 const on=e.on!==false;
 const rej=Object.entries(e.rejected||{}).map(([k,v])=>esc(k)+' '+num(v)).join(' · ')||'—';
 const line=!on?'Off — researchers use regex extraction only'
  :w.alive?(e.acp&&e.acp.model?'Reading with '+esc(e.acp.model):'Running'):'Not running';
 return '<div class="card" style="margin-top:14px"><h2>SWE-2.1 evidence hunts <label class="switch" style="float:right"><input type="checkbox" id="swExtract" '+(on?'checked':'')+'><i></i></label></h2>'
 +'<div class="dim small" style="margin-bottom:10px">When a crawl still can’t quote an office, SWE-2.1 reads the official pages for a verbatim proof sentence. Every answer is checked in code — quotes must be copied exactly from the page — before it becomes a draft the checker re-judges.</div>'
 +'<div class="dim small" style="margin-bottom:10px">'+esc(line)+(e.acp&&e.acp.model?' · model '+esc(e.acp.model):'')+(srv&&srv.ai&&srv.ai.devin_rss_mb?' · '+srv.ai.devin_rss_mb+' MB':'' )+'</div>'
 +'<div class="tiles">'
 +'<div class="tile"><div class="t">Sent</div><div class="v">'+num(e.sent||0)+'</div><div class="s">'+num(e.queue_depth||0)+' waiting</div></div>'
 +'<div class="tile"><div class="t">Answered</div><div class="v">'+num(e.answered||0)+'</div><div class="s">'+(w.status||'—')+'</div></div>'
 +'<div class="tile"><div class="t">Accepted</div><div class="v ok">'+num(e.accepted||0)+'</div><div class="s">became drafts for the checker</div></div>'
 +'<div class="tile"><div class="t">Rejected</div><div class="v bad">'+num(Object.values(e.rejected||{}).reduce((a,b)=>a+b,0))+'</div><div class="s" title="'+rej+'">'+rej.slice(0,80)+'</div></div>'
 +'</div></div>';
}
// — AI Audit tab —
let auditFindings=[],auditFindingsAt=0,auditEvents=[],auditStage=null,auditPage=0,auditRate={done:0,t:0,perHr:null},auditTypeV='',auditActionV='';
const AUDIT_EVENT_LABEL={ai_audit_unit_sent:'unit sent',ai_audit_unit_answered:'answered',ai_audit_finding:'finding',ai_audit_action:'action',ai_audit_breaker:'safety',ai_audit_boot:'boot'};
const AUDIT_TYPES={wrong_jurisdiction:'Belongs to a different town',non_permit_body:'Not a permit office',junk_name:'Scraped or junk name',role_not_supported_by_quote:"Evidence doesn't prove the role",contact_mismatch:'Contact belongs to another entity',duplicate_office:'Looks like a duplicate',wrong_county_or_type:'Wrong county or type',paper_township:'Paper township',stale_or_placeholder:'Stale or placeholder',other:'Other'};
const AUDIT_ACTIONS={demoted:'Sent back to re-check',name_cleaned:'Name cleaned',sent_to_researchers:'Sent to researchers',logged:'Logged for review',logged_rule_agrees:'Logged (rule agrees)',review_rule_disagrees:'Needs a person to look',discarded_check_passed:'Discarded — evidence checks out',discarded_cleaner_noop:'Discarded — name already clean',cap_limited:'Waiting (hourly cap)',breaker_tripped:'Safety stop'};
const AUDIT_STAGE_ACTIONS={checks:['discarded_check_passed','discarded_cleaner_noop'],demoted:['demoted'],cleaned:['name_cleaned'],researchers:['sent_to_researchers'],logged:['logged','logged_rule_agrees','review_rule_disagrees']};
async function pollAudit(){if(tab!=='audit'||Date.now()-auditFindingsAt<1500)return;try{const [r1,r2]=await Promise.all([fetch('/api/ai-audit-findings',{cache:'no-store'}),fetch('/api/ai-audit-events',{cache:'no-store'})]);if(r1.ok){const j=await r1.json();auditFindings=j.items||[];}if(r2.ok){const j=await r2.json();auditEvents=j.items||[];}auditFindingsAt=Date.now();}catch(e){}}
function renderAudit(){
 const a=(srv&&srv.ai&&srv.ai.audit)||{};
 const w=(srv&&srv.workers||[]).find(x=>x.name==='ai-auditor')||{};
 const on=a.on!==false,paused=!!a.paused;
 const cov=a.coverage||{done:0,total:0};
 const set=a.settings||{demote_cap_hr:50,breaker_pct:5,sessions:3,sessions_mode:'auto'};
 // plain-English status line
 let statusLine;
 if(!on)statusLine='Off';
 else if(paused)statusLine='Paused by you';
 else if(w.status==='paused-by-guard')statusLine='Paused by memory guard';
 else if(w.last_heartbeat&&w.last_heartbeat.state==='idle'&&w.last_heartbeat.detail)statusLine=cap(w.last_heartbeat.detail);
 else if(a.current)statusLine='Reading '+a.current+'…';
 else if(w.alive)statusLine='Running';
 else statusLine='Not running';
 const model=a.acp&&a.acp.model?a.acp.model:'swe-2.1';
 // rate/hr from coverage deltas between polls
 const now=Date.now();
 if(cov.done!==auditRate.done){if(auditRate.t&&cov.done>auditRate.done){auditRate.perHr=Math.round((cov.done-auditRate.done)/((now-auditRate.t)/3600e3));}auditRate.done=cov.done;auditRate.t=now;}
 const pct=cov.total?Math.round(100*cov.done/cov.total):0;
 const eta=cov.total&&auditRate.perHr?Math.ceil((cov.total-cov.done)/auditRate.perHr):null;
 // stages
 const stage=(id,label,count,sub)=>'<div class="stage'+(auditStage===id?' sel':'')+'" data-cmd="audit-stage" data-stage="'+id+'"><div class="sc n">'+num(count)+'</div><div class="st">'+label+'</div><div class="ss dim small">'+sub+'</div></div>';
 const demoteToks=(a.demote_tokens||[]).filter(t=>now-t<3600e3).length;
 const reverts=(a.reverts||[]);
 const revertedIds=new Set(reverts.filter(r=>/^revert_/.test(r.action||'')).map(r=>r.entry_id));
 const actions=reverts.filter(r=>['demote','rename'].includes(r.action));
 // findings table — newest first, filters
 const tf=auditTypeV,af=auditActionV;
 const stageActs=auditStage&&AUDIT_STAGE_ACTIONS[auditStage]?AUDIT_STAGE_ACTIONS[auditStage]:null;
 let rows=auditFindings.filter(f=>(!tf||f.type===tf)&&(!af||f.action===af)&&(!stageActs||stageActs.includes(f.action)));
 rows=rows.slice().reverse();
 const PAGE=25,pages=Math.max(1,Math.ceil(rows.length/PAGE));
 auditPage=Math.min(auditPage,pages-1);
 const pageRows=rows.slice(auditPage*PAGE,auditPage*PAGE+PAGE);
 // group by jurisdiction
 const groups=new Map();
 for(const f of pageRows){const k=esc(f.jurisdiction||'?')+(f.state?', '+esc(f.state):'');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(f);}
 const table=pageRows.length?'<table>'+[...groups.entries()].map(([jur,fs])=>'<tr><td colspan="5" style="background:#141c30;font-weight:700">'+jur+'</td></tr>'+fs.map(f=>'<tr><td class="dim" style="width:170px">'+esc(f.office_name||f.office_id||'—')+'</td><td>'+esc(AUDIT_TYPES[f.type]||f.type)+(f.field?' <span class="dim small">'+esc(f.field)+'</span>':'')+'</td><td class="dim small" style="max-width:260px">'+esc(String(f.current||'').slice(0,80))+(f.suggested?' → '+esc(String(f.suggested).slice(0,60)):'')+'</td><td>'+esc(AUDIT_ACTIONS[f.action]||f.action)+'</td><td class="dim small" style="width:80px">'+agoT(f.at)+'</td></tr>').join('')).join('')+'</table>':'<div class="empty">No findings match this filter yet.</div>';
 const uniq=a=>[...new Set(auditFindings.map(f=>f[a]).filter(Boolean))].sort();
 const sel=(id,cur,opts)=>'<select id="'+id+'" style="background:#141c30;color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:12px"><option value="">all</option>'+opts.map(o=>'<option'+(o===cur?' selected':'')+' value="'+esc(o)+'">'+esc(AUDIT_TYPES[o]||AUDIT_ACTIONS[o]||o)+'</option>').join('')+'</select>';
 setH('tab-audit',
 '<div class="card"><h2>AI Audit <label class="switch" style="float:right"><input type="checkbox" id="swAudit" '+(on?'checked':'')+'><span class="swv">'+(on?'On':'Off')+'</span></label></h2>'
 +'<div class="dim small" style="margin-bottom:10px">SWE-2.1 reads every jurisdiction record looking for wrong, stale or unsupported data. Nothing changes on the model’s word alone — code re-checks every finding, and demotions only move offices to the safe side.</div>'
 +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b>'+esc(statusLine)+'</b><span class="dim small">model '+esc(model)+(srv&&srv.ai&&srv.ai.devin_rss_mb?' · '+srv.ai.devin_rss_mb+' MB':'')+'</span><span style="flex:1"></span>'
 +(paused?'<button data-cmd="audit-resume">Resume</button>':'<button data-cmd="audit-pause">Pause</button>')+'</div></div>'
 // pipeline
 +'<div class="card"><h2>How a record flows</h2><div class="pipe">'
 +stage('queue','Queue',cov.total-cov.done,'jurisdictions waiting, verified first')
 +'<div class="arrow">→</div>'
 +stage('reading','Reading',a.current?1:0,a.current?esc(a.current.slice(0,26)):'idle')
 +'<div class="arrow">→</div>'
 +stage('review','SWE-2.1 review',a.answered||0,'of '+num(a.sent||0)+' sent · '+num(a.failed||0)+' failed')
 +'<div class="arrow">→</div>'
 +stage('checks','Code checks',a.findings||0,'findings · '+num(a.discarded||0)+' discarded')
 +'<div class="arrow">→</div>'
 +'<div class="acts">'
 +stage('demoted','Demoted to re-check',a.demoted||0,'reversible')
 +stage('cleaned','Name cleaned',a.renamed||0,'reversible')
 +stage('researchers','Sent to researchers',a.boosted||0,(srv&&srv.ai&&srv.ai.boost_waiting?'<b>'+num(srv.ai.boost_waiting)+'</b> audit fix'+(srv.ai.boost_waiting===1?'':'es')+' waiting':'re-fetch official data'))
 +stage('logged','Logged for review',a.logged||0,'a person decides')
 +'</div></div></div>'
 // progress
 +'<div class="card"><h2>Coverage</h2>'
 +'<div style="font:700 20px var(--mono);margin-bottom:6px">'+num(cov.done)+' of '+num(cov.total)+' jurisdictions audited <span class="dim" style="font-size:13px">('+pct+'%)</span></div>'
 +'<div class="bar"><i style="width:'+pct+'%;background:var(--blue)"></i></div>'
 +'<div class="dim small" style="margin-top:6px">'+(auditRate.perHr?num(auditRate.perHr)+' per hour'+(eta?' · done in about '+eta+'h':''):'measuring speed…')+' · verified offices audited: '+num(a.verified_audited||0)+' ('+num(a.verified_flagged||0)+' flagged)</div></div>'
 // Live sessions panel
 +(function(){
  const sess=(srv&&srv.ai&&srv.ai.audit_sessions)||[];
  const rows=sess.length?sess.map(s=>{
   const el=s.since?Math.round((Date.now()-new Date(s.since).getTime())/1000):0;
   const unit=(s.units&&s.units[0])||'—';
   const detail=s.busy?(s.partial?esc(String(s.partial).slice(-120)):'thinking… '+el+'s'):'idle';
   return '<tr><td class="num" style="width:60px">'+(s.session+1)+'</td><td>'+esc(unit)+'</td><td class="dim">'+esc(s.stage||'—')+(s.busy&&s.since?' <span class="dim small">'+el+'s</span>':'')+'</td><td class="dim small" style="max-width:340px">'+detail+'</td><td class="dim small" style="width:150px">'+(s.last_finding?esc(s.last_finding.jurisdiction||'')+' — '+esc(s.last_finding.finding||''):'—')+'</td></tr>';
  }).join(''):'<tr><td colspan="5" class="dim">No sessions running.</td></tr>';
  return '<div class="card"><h2>Live</h2><div class="dim small" style="margin-bottom:8px">One row per SWE-2.1 audit session — what it’s reading right now.</div>'
  +'<table><tr><th>#</th><th>Reading</th><th>Stage</th><th>Latest output</th><th>Last finding</th></tr>'+rows+'</table></div>';
 })()
 // Live event ticker
 +(function(){
  const evs=(auditEvents||[]).slice(-50).reverse();
  const items=evs.length?evs.map(e=>'<div class="row" style="padding:4px 0;border-bottom:1px solid var(--line)"><span class="dim small" style="display:inline-block;width:70px">'+agoT(e.t)+'</span><b style="font-weight:600">'+(e.ok===false?'✗ ':'')+esc(AUDIT_EVENT_LABEL[e.stage]||e.stage)+'</b> <span class="dim">'+(e.address?esc(e.address)+' — ':'')+esc(String(e.detail||'').slice(0,140))+'</span></div>').join(''):'<div class="empty">No audit events yet.</div>';
  return '<div class="card"><h2>Event log</h2>'+items+'</div>';
 })()
 // findings
 +'<div class="card"><h2>Findings'+(auditStage?' — '+esc(auditStage)+' <a href="#/audit" data-cmd="audit-stage" data-stage="">clear</a>':'')+'</h2>'
 +'<div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;align-items:center"><span class="dim small">Problem:</span>'+sel('auditTypeF',tf,uniq('type'))+'<span class="dim small">Action:</span>'+sel('auditActionF',af,uniq('action'))+'<span class="dim small" style="margin-left:auto">'+num(rows.length)+' finding'+(rows.length===1?'':'s')+' · page '+(auditPage+1)+' of '+pages+'</span>'
 +(auditPage>0?'<button data-cmd="audit-page" data-dir="-1">←</button>':'')+(auditPage<pages-1?'<button data-cmd="audit-page" data-dir="1">→</button>':'')+'</div>'
 +table+'</div>'
 // auto-actions + breakers + settings
 +'<div class="card"><h2>Automatic actions</h2>'
 +(a.breaker_tripped?'<div class="warn" style="margin-bottom:10px">Safety stop: the audit flagged more than '+set.breaker_pct+'% of the verified offices it checked, so it stopped sending offices back to re-check. Review the list below, then press <button data-cmd="audit-resume-demote">Allow re-checks again</button>.</div>':'')
 +'<div class="dim small" style="margin-bottom:8px">Demotions this hour: '+num(demoteToks)+' of '+num(set.demote_cap_hr)+' allowed</div>'
 +(actions.length?'<table><tr><th>Office</th><th>Action</th><th>Why</th><th style="width:80px">When</th><th style="width:70px"></th></tr>'+actions.slice().reverse().map(r=>'<tr><td>'+esc(r.office_name||r.before_name||r.office_id||'—')+'</td><td>'+esc(r.action==='demote'?'sent back to re-check':'renamed'+(r.after_name?' → '+r.after_name:''))+'</td><td class="dim small">'+esc(String(r.reason||r.finding||'').slice(0,100))+'</td><td class="dim small">'+agoT(r.at)+'</td><td>'+(revertedIds.has(r.entry_id)?'<span class="dim small">undone</span>':'<button data-cmd="audit-revert" data-entry="'+esc(r.entry_id)+'">Undo</button>')+'</td></tr>').join('')+'</table>':'<div class="empty">No automatic actions yet — demotions and name fixes will appear here with an Undo button.</div>')+'</div>'
 +'<div class="card"><h2>Audit settings</h2>'
 +'<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">'
 +'<div><label class="dim small">Demotions per hour<br><input id="auditSetCap" type="number" min="1" max="500" value="'+set.demote_cap_hr+'" style="width:90px"></label><div class="dim small" style="max-width:220px">Most verified offices the audit may send back to re-check in one hour. Stops a bad AI run from un-verifying lots of offices at once.</div></div>'
 +'<div><label class="dim small">Safety stop %<br><input id="auditSetBreaker" type="number" min="1" max="50" value="'+set.breaker_pct+'" style="width:90px"></label><div class="dim small" style="max-width:220px">If the audit flags more than this share of the verified offices it has checked, it stops sending any back and waits for you.</div></div>'
 +'<div><label class="dim small">Sessions<br><select id="auditSetSessMode" style="width:90px"><option value="auto"'+(set.sessions_mode!=='manual'?' selected':'')+'>Auto</option><option value="manual"'+(set.sessions_mode==='manual'?' selected':'')+'>Manual</option></select> <input id="auditSetSessions" type="number" min="1" max="8" value="'+set.sessions+'" style="width:70px"></label><div class="dim small" style="max-width:220px">How many SWE-2.1 conversations run at once. Auto adds or removes them based on free memory.</div></div>'
 +'</div>'
 +'<div style="margin-top:10px"><button id="btnAuditSet">Save</button> <span id="auditSetMsg" class="dim small"></span></div></div>');
}
function cap(s){s=String(s||'');return s.charAt(0).toUpperCase()+s.slice(1);}
// — Verification tab —
function renderVerification(){
 const v=vp(),o=v&&v.offices||{},j=v&&v.jurisdictions||{};
 const tot=Math.max(1,(j.all_verified||0)+(j.some_verified||0)+(j.none_verified||0)+(j.no_offices||0));
 const seg=(n,c)=>'<i style="width:'+Math.round(1000*n/tot)/10+'%;background:'+c+'"></i>';
 const legend=[['Fully verified',j.all_verified,'var(--green)'],['Partly verified',j.some_verified,'#86efac'],['Not yet verified',j.none_verified,'var(--amber)'],['No offices yet',j.no_offices,'#3b4a6b']];
 const gaps=Object.entries((v&&v.gap_reasons)||{}).sort((a,b)=>b[1]-a[1]);
 const roles=Object.entries((v&&v.missing_roles)||{}).sort((a,b)=>b[1]-a[1]).slice(0,12);
 const plist=(promos&&promos.items)||[];
 const ny=needsYou();
 const np=(ledger&&ledger.not_permitting)||[];
 const wd=((srv&&srv.guard&&srv.guard.researchers)||{}).work_detail||{};
 const tierN=t=>num((wd.tiers||{})[t]||0);
 const auditLink='<div class="dim small" style="margin-bottom:10px">SWE-2.1 also audits every record for errors — see the <a href="#/audit">AI Audit tab</a>.</div>';
 // Group needs-a-person rows under their jurisdiction — one header per place,
 // office rows beneath, reasons already deduped by needsYou().
 const nyGroups=[];const gmap=new Map();
 for(const x of ny){let g=gmap.get(x.loc);if(!g){g={loc:x.loc,items:[]};gmap.set(x.loc,g);nyGroups.push(g);}g.items.push(x);}
 setH('tab-verification',
 '<div class="card"><h2>Jurisdictions</h2>'
 +'<div class="bar" style="height:18px">'+seg(j.all_verified||0,'var(--green)')+seg(j.some_verified||0,'#86efac')+seg(j.none_verified||0,'var(--amber)')+seg(j.no_offices||0,'#3b4a6b')+'</div>'
 +'<div class="legend" style="margin-top:8px">'+legend.map(l=>'<span><i style="background:'+l[2]+'"></i>'+l[0]+' <b class="num" style="color:var(--txt)">'+num(l[1]||0)+'</b></span>').join('')+'</div></div>'
 +'<div class="card"><h2>Research depth</h2><div class="dim small" style="margin-bottom:8px">Researchers work each jurisdiction in deeper passes until it verifies: a standard crawl, then a deep crawl, then county &amp; regional sites, then alternate official sites.</div>'
 +'<table><tr><td>Pass 1 — standard crawl</td><td class="num" style="width:90px">'+tierN(1)+'</td><td class="dim small" rowspan="4" style="vertical-align:middle">'+num(wd.exhausted||0)+' ran every pass and need a person'+(wd.next_release?'<br>Next cooldown lifts '+esc(new Date(wd.next_release).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})):'')+'</td></tr>'
 +'<tr><td>Pass 2 — deep crawl</td><td class="num">'+tierN(2)+'</td></tr>'
 +'<tr><td>Pass 3 — county &amp; regional sites</td><td class="num">'+tierN(3)+'</td></tr>'
 +'<tr><td>Pass 4 — alternate official sites</td><td class="num">'+tierN(4)+'</td></tr></table>'+auditLink+'</div>'
 +(np.length?'<div class="card"><h2>Not a permitting authority ('+np.length+')</h2><div class="dim small" style="margin-bottom:8px">These places don’t issue their own permits — they’re counted under the county or state office that actually does. They’re kept for records but skipped by the checker.</div><table>'+np.map(x=>'<tr><td style="width:260px"><b>'+esc(x.name)+(x.state?', '+esc(x.state):'')+'</b></td><td class="dim">'+esc(x.handled_by||'no permitting authority of its own')+'</td></tr>').join('')+'</table></div>':'')
 +'<div class="card"><h2>Why offices aren’t verified yet</h2>'
 +(gaps.length?'<table><tr><th>Reason</th><th style="width:90px">Offices</th><th>What happens next</th></tr>'+gaps.map(g=>'<tr><td>'+esc(GAP_LABEL[g[0]]||g[0])+'</td><td class="num">'+num(g[1])+'</td><td class="dim">'+esc(GAP_NEXT[g[0]]||'The checker will try again.')+'</td></tr>').join('')+'</table>':'<div class="empty">No gaps recorded yet.</div>')+'</div>'
 +(roles.length?'<div class="card"><h2>Most-missing office jobs</h2><div class="dim small" style="margin-bottom:8px">Roles researchers still need evidence for, across all jurisdictions.</div>'
  +'<table>'+roles.map(r=>'<tr><td>'+esc(roleLabel(r[0]))+'</td><td class="num" style="width:90px">'+num(r[1])+'</td></tr>').join('')+'</table></div>':'')
 +'<div class="card"><h2>Recently verified</h2>'
 +(plist.length?'<table><tr><th>Jurisdiction</th><th>Office</th><th>What was verified</th><th style="width:110px">When</th></tr>'+plist.slice(0,20).map(p=>'<tr><td>'+esc(p.jurisdiction||'?')+'</td><td class="dim">'+esc(p.office||'—')+'</td><td>'+esc((p.roles||[]).map(roleLabel).join(', ')||'office verified')+'</td><td class="dim small">'+agoT(p.at)+'</td></tr>').join('')+'</table>':'<div class="empty">Nothing verified yet — recent verifications will appear here.</div>')+'</div>'
 +(ny.length?'<div class="card"><h2>Needs a person ('+ny.length+')</h2><table>'+nyGroups.map(g=>'<tr><td colspan="2" style="padding-top:12px"><b>'+esc(g.loc)+'</b></td></tr>'+g.items.map(x=>'<tr><td class="dim" style="width:260px;padding-left:18px">'+esc(x.office||'—')+(x.tiers&&x.tiers.length?'<div class="dim small">tried '+x.tiers.map(t=>'pass '+t).join(', ')+'</div>':'')+'</td><td class="dim">'+esc(x.reason)+'</td></tr>').join('')).join('')+'</table></div>':''));
}
// — Memory tab —
function renderMemory(){
 const mem=srv&&srv.memory||{};const lim=srv&&srv.limits||{};
 const R=(srv&&srv.guard&&srv.guard.researchers)||{};
 const acts=(srv&&srv.guard&&srv.guard.actions||[]).slice(-12).reverse();
 setH('tab-memory',
 '<div class="card"><h2>Memory — last 30 minutes</h2>'
 +'<canvas id="memchart" class="chart" width="1100" height="240"></canvas>'
 +'<div class="legend"><span><i style="background:var(--green)"></i>Free memory (GB)</span><span><i style="background:var(--amber)"></i>Used by this server (GB)</span><span><i style="background:var(--purple)"></i>Windows memory headroom (GB)</span></div>'
 +'<div class="dim small" style="margin-top:8px">'+gb(mem.free_gb)+' free of '+gb(mem.total_gb)+' total · the server is using '+gb(mem.fleet_rss_gb)+(mem.commit_headroom_gb!=null?' · Windows can still hand out '+gb(mem.commit_headroom_gb):'')+(mem.cpu_pct!=null?' · CPU '+mem.cpu_pct+'%':'')+'</div>'
 +(R.hold_reason?'<div class="dim small" style="margin-top:4px">Holding researchers at '+resAlive().length+': '+esc(R.hold_reason)+'</div>':'')+'</div>'
 +'<div class="card"><h2>Limits</h2>'
 +'<div class="setrow"><div><label for="inReserve">Keep free for other programs (GB)</label><input id="inReserve" type="number" min="2" max="10" step="0.5" value="'+(lim.reserve_gb!=null?lim.reserve_gb:4)+'"></div>'
 +'<div class="ex">The server always keeps at least this much memory free for you and other apps. It slows itself down first.</div></div>'
 +'<div class="setrow"><div><label for="inBudget">Server memory limit (GB)</label><input id="inBudget" type="number" min="1" max="28" step="1" value="'+(lim.fleet_budget_gb!=null?lim.fleet_budget_gb:12)+'"></div>'
 +'<div class="ex">The most this whole server is allowed to use. If it goes over, researchers are stopped until it fits.</div></div>'
 +'<div class="setrow"><button id="btnSaveLim" class="primary">Save</button><span id="saveMsg"></span></div></div>'
 +'<div class="card"><h2>Recent memory actions</h2>'
 +(acts.length?'<div class="feed">'+acts.map(a=>'<div class="row"><span class="msg">'+esc(plainAction(a.detail))+'</span><span class="when">'+agoT(a.at)+'</span></div>').join('')+'</div>':'<div class="empty">No memory actions yet — the server hasn’t needed to slow anything down.</div>')+'</div>');
 drawChart(mem);
}
function drawChart(mem){
 const cv=$('memchart');if(!cv)return;const ctx=cv.getContext('2d');const W=cv.width,H=cv.height,padL=44,padB=22,padT=10;
 ctx.clearRect(0,0,W,H);
 const hist=(mem.history||[]).slice();
 const mx=Math.max(mem.total_gb||32,...hist.map(h=>Math.max(h.free_gb||0,h.fleet_gb||0,h.headroom_gb||0)))*1.05;
 ctx.strokeStyle='#24304d';ctx.fillStyle='#5b6b8c';ctx.font='11px '+getComputedStyle(document.body).fontFamily;ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const v=mx*i/4,y=padT+(H-padB-padT)*(1-i/4);ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-8,y);ctx.stroke();ctx.fillText(Math.round(v),8,y+4);}
 if(hist.length>1){
  const t0=hist[0].t,t1=hist[hist.length-1].t||t0+1;
  ['−30 min','−15 min','now'].forEach((l,i)=>{ctx.fillText(l,padL+i*(W-8-padL-40)/2,H-6);});
  const draw=(key,col)=>{ctx.strokeStyle=col;ctx.lineWidth=1.8;ctx.beginPath();hist.forEach((h,i)=>{const x=padL+(h.t-t0)/Math.max(1,t1-t0)*(W-8-padL);const y=padT+(H-padB-padT)*(1-(h[key]||0)/mx);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
  draw('free_gb','#34d399');draw('fleet_gb','#fbbf24');draw('headroom_gb','#a78bfa');
 }else{ctx.fillStyle='#8b9bb8';ctx.font='13px sans-serif';ctx.fillText('Collecting data — the chart fills in over the next 30 minutes.',padL+20,H/2);}
}
// — Activity tab —
const FEED_CLASS=e=>{
 const s=String(e.stage||'');
 if(/auth_verify_|verify/.test(s))return 'verifications';
 if(/error|fail|crash|stall/.test(s)||(e.ok===false))return 'problems';
 if(/office_res_|gap_res_|seed_office_|sweep_|research_|office_created|profile_|mirror_|relink/.test(s))return 'research';
 return 'other';
};
function feedLine(e){
 const w=String(e.worker||''),s=String(e.stage||''),d=String(e.detail||'');
 const who=w==='permit-server'?'Server':(w?friendlyName(w):'Server');
 let msg;
 if(s==='auth_verify_ok')msg='Verified: '+d;
 else if(s==='auth_verify_done')msg='Check pass complete — '+d;
 else if(/^office_res_step/.test(s))msg='Reading: '+d;
 else if(s==='office_res_done')msg='Finished research: '+d;
 else if(s==='office_res_idle')msg='Standing by — queue empty';
 else if(/^office_res_/.test(s))msg=d||s;
 else if(/^gap_res_/.test(s))msg='Gap research: '+d;
 else if(s==='outbox_pass')msg='Saved a batch of changes to the app';
 else if(/^mirror_/.test(s))msg='Updated the local copy of app data';
 else if(/^seed_office_/.test(s))msg=d||s;
 else if(/^queue_hygiene_/.test(s))msg='Tidied the work queue — '+d;
 else if(/relink/.test(s))msg='Linker: '+d;
 else if(s==='guard')msg=plainAction(d);
 else if(/^worker_(spawn|exit|stop)/.test(s))msg=d;
 else msg=d||s;
 return {who,msg:String(msg).replace(/local-res-([0-9]+)/g,resWord).slice(0,140)};
}
function renderActivity(){
 const evs=(legacy&&legacy.events)||[];
 const filtered=evs.filter(e=>feedFilter==='all'||FEED_CLASS(e)==feedFilter).slice(0,60);
 const mk=(k,label)=>'<button data-feed="'+k+'" class="'+(feedFilter===k?'on':'')+'">'+label+'</button>';
 setH('tab-activity',
 '<div class="card"><h2>Activity</h2>'
 +'<div class="fchips">'+mk('all','All')+mk('verifications','Verifications')+mk('research','Research')+mk('problems','Problems')+'</div>'
 +'<div class="feed">'+(filtered.length?filtered.map(e=>{const l=feedLine(e);const bad=FEED_CLASS(e)==='problems';return '<div class="row"><span class="who">'+esc(l.who)+'</span><span class="msg'+(bad?' bad':'')+'">'+esc(l.msg)+'</span><span class="when">'+agoT(e.t)+'</span></div>';}).join(''):'<div class="empty">Nothing to show yet.</div>')+'</div></div>'
 +'<details class="mored" id="mored"><summary>More details — raw numbers and background panels</summary><div id="legacyPanels"></div></details>');
 renderLegacy();
}
document.addEventListener('click',e=>{const b=e.target&&e.target.closest?e.target.closest('button[data-feed]'):null;if(b){feedFilter=b.dataset.feed;renderActivity();}});
// Legacy panels — same data as before, only rendered inside More details.
function renderLegacy(){
 const s=legacy;if(!s||!$('legacyPanels'))return;
 const mb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?(n/1024).toFixed(0)+' KB':n+' B';
 const d=s.downloads||{active:[],done:[],errors:[],filesToday:0,bytesToday:0,doneTotal:0,errTotal:0};
 const of=s.officeFiles||{offices:[],totals:{offices:0,files:0,stages:{}}};
 const lw=(s.liveWorkers||[]).slice(0,14);
 setH('legacyPanels',
 '<h3>Key numbers</h3><div class="dim small">'
 +'Offices in the app: <b class="num" style="color:var(--txt)">'+num(s.totalOffices||0)+'</b> · verified: <b class="num ok">'+num(s.verifiedOffices||0)+'</b> · apply-ready jurisdictions: <b class="num ok">'+num(s.applyReady||0)+'</b> of '+num(s.locTotal||0)
 +'<br>Changes waiting to save: <b class="num'+(s.outboxDepth?' warn':' ok')+'">'+num(s.outboxDepth||0)+'</b> · landed: '+num(s.outboxDone||0)+(s.outboxErrDepth?' · <span class="bad">'+num(s.outboxErrDepth)+' dropped</span>':'')
 +'<br>Address lookups (expansion): '+num(s.fixtureDone||s.done||0)+' done · '+num(s.inQueue||0)+' queued · flagged: '+num(s.needsReview||0)+'</div>'
 +'<h3>Address feeder</h3><div class="dim small">queue: <b>'+num(s.inQueue||0)+'</b> addresses waiting'+(s.mirror?' · local copy: '+esc(s.mirror.detail||'')+' '+agoT(s.mirror.at):'')+'</div>'
 +'<h3>Worker fleet <span class="dim" style="text-transform:none">(from event log)</span></h3>'+(lw.length?'<table>'+lw.map(w=>'<tr><td class="dim" style="width:200px">'+esc(w.label)+'</td><td style="width:110px">'+(w.alive?'<span class="ok small">● live</span>':'<span class="dim small">idle</span>')+'</td><td class="dim small">'+esc(String(w.detail||w.stage||'—').slice(0,80))+'</td><td class="dim small" style="width:80px">'+agoT(w.at)+'</td></tr>').join('')+'</table>':'<div class="empty">No worker events.</div>')
 +'<h3>Downloads</h3><div class="dim small">'+(d.active.filter(a=>!a.stalled).length)+' in flight · '+num(d.doneTotal||0)+' files · '+mb(d.totalBytes||0)+' total · '+(d.filesToday||0)+' today'+(d.errTotal?' · <span class="bad">'+d.errTotal+' failed</span>':'')+'</div>'
 +(d.active.length?'<table>'+d.active.slice(0,8).map(a=>'<tr><td class="small">'+esc(String(a.name||a.url||'?').slice(0,70))+'</td><td class="dim small" style="width:140px">'+(a.stalled?'stalled · ':'')+mb(a.bytes||0)+'</td></tr>').join('')+'</table>':'')
 +'<h3>Office files</h3><div class="dim small">'+num(of.totals.offices)+' offices · '+num(of.totals.files)+' files</div>'
 +(of.offices.length?'<table>'+of.offices.slice(0,10).map(o=>'<tr><td class="small" style="width:280px">'+esc(o.jurisdiction||'')+'</td><td class="dim small">'+esc(o.office||'')+'</td><td class="dim small">'+esc(Object.keys(o.stages||{}).join(', ')||'dossier only')+'</td></tr>').join('')+'</table>':''));
}
// — Advanced tab —
function renderAdvanced(){
 const g=srv&&srv.guard||{};const mem=srv&&srv.memory||{};
 const rows=workers().map(w=>{
  const canCtl=['stopped-by-user','stopped','culled-by-memory','culled-by-cpu','culled-idle','no-work','ramping','blocked-by-memory','blocked-by-cpu'].includes(w.status);
  const btn=w.group==='core'||w.group==='dashboard'?'':(w.alive?'<button data-cmd="wstop" data-name="'+esc(w.name)+'" style="padding:2px 10px;font-size:11px">stop</button>':canCtl?'<button data-cmd="wstart" data-name="'+esc(w.name)+'" style="padding:2px 10px;font-size:11px">start</button>':'');
  const ev=w.last_event?(w.last_event.stage||'')+(w.last_event.detail?' · '+String(w.last_event.detail).slice(0,60):''):'—';
  return '<tr><td><b>'+esc(friendlyName(w.name))+'</b> <span class="dim small">'+esc(w.name)+'</span><div class="dim small">'+esc(friendlyDesc(w.name))+'</div></td>'
   +'<td class="dim small">'+esc(w.group)+'</td><td>'+chip(w)+'</td>'
   +'<td class="num small">'+(w.pid||'—')+'</td><td class="num small">'+(w.rss_mb!=null?w.rss_mb+' MB':'—')+'</td>'
   +'<td class="num small">'+(w.uptime_s!=null?(w.uptime_s>3600?Math.floor(w.uptime_s/3600)+'h '+Math.floor(w.uptime_s%3600/60)+'m':Math.floor(w.uptime_s/60)+'m'):'—')+'</td>'
   +'<td class="num small">'+(w.restarts||0)+'</td><td class="dim small">'+esc(ev)+'</td><td>'+btn+'</td></tr>';
 }).join('');
 setH('tab-advanced',
 '<div class="card"><h2>All workers</h2><table><tr><th>Worker</th><th>Group</th><th>Status</th><th>PID</th><th>Memory</th><th>Uptime</th><th>Restarts</th><th>Last event</th><th></th></tr>'+rows+'</table></div>'
 +'<div class="card"><h2>Memory guard (technical)</h2><div class="dim small">'
 +'Level '+(g.level!=null?g.level:'—')+' — researchers are stopped whenever free memory nears the reserve; below <b class="num" style="color:var(--txt)">1.5 GB</b> free all background workers pause except the Saver.'
 +' Currently: '+gb(mem.free_gb)+' free · server using '+gb(mem.fleet_rss_gb)+' · keep-free reserve '+(srv&&srv.limits?srv.limits.reserve_gb:'—')+' GB · server limit '+(srv&&srv.limits?srv.limits.fleet_budget_gb:'—')+' GB.'
 +((g.paused||[]).length?'<br>Paused by the guard: '+esc(g.paused.join(', ')):'')+'</div></div>');
}
// — shared click wiring (data-cmd buttons + memory save) —
document.addEventListener('click',async e=>{
 const b=e.target&&e.target.closest?e.target.closest('button[data-cmd],a[data-cmd],#btnSaveLim'):null;if(!b||b.disabled)return;
 const R=(srv&&srv.guard&&srv.guard.researchers)||{};
 const cur=pendingMax&&Date.now()-pendingMax.at<10000?pendingMax.v:(R.max!=null?R.max:16);
 const ceil=R.ceiling||64;
 try{
  if(b.id==='btnSaveLim'){
   const rv=Number($('inReserve').value),bv=Number($('inBudget').value);
   const msg=$('saveMsg');
   try{await srvCmd('limits',{reserve_gb:rv,fleet_budget_gb:bv});msg.innerHTML='<span class="ok">Saved ✓</span>';setTimeout(()=>{if(msg.textContent.includes('Saved'))msg.textContent='';},4000);}
   catch(err){msg.innerHTML='<span class="bad">'+esc(err.message)+'</span>';}
   return;
  }
  const c=b.dataset.cmd;
  if(c==='ny-more'){e.preventDefault();nyShowAll=!nyShowAll;holdUntil=0;render(true);return;}
  if(c==='mode-auto')await srvCmd('researchers',{mode:'auto'});
  else if(c==='mode-manual')await srvCmd('researchers',{mode:'manual'});
  else if(c==='max-inc'||c==='max-dec'){const v=c==='max-inc'?Math.min(ceil,cur+1):Math.max(0,cur-1);pendingMax={v,at:Date.now()};const el=$('resmax');if(el)el.textContent=v;await srvCmd('researchers',{mode:'manual',max:v});}
  else if(c==='killres'){if(!confirm('Stop all researchers now? They stay off until you pick a mode or count again.'))return;await srvCmd('researchers',{killall:true});}
  else if(c==='wstop')await srvCmd('worker',{name:b.dataset.name,action:'stop'});
  else if(c==='wstart')await srvCmd('worker',{name:b.dataset.name,action:'start'});
  else if(c==='audit-stage'){e.preventDefault();auditStage=b.dataset.stage||null;auditPage=0;holdUntil=0;render(true);return;}
  else if(c==='audit-page'){auditPage=Math.max(0,auditPage+Number(b.dataset.dir||0));holdUntil=0;render(true);return;}
  else if(c==='audit-pause')await srvCmd('ai-audit',{paused:true});
  else if(c==='audit-resume')await srvCmd('ai-audit',{paused:false});
  else if(c==='audit-resume-demote')await srvCmd('ai-audit/resume-demotion');
  else if(c==='audit-revert'){if(!confirm('Undo this automatic change?'))return;await srvCmd('audit/revert',{entry_id:b.dataset.entry});}
 }catch(err){alert(err.message);}
});
// Audit settings save — lives outside the button dispatch (id, not data-cmd).
document.addEventListener('click',async e=>{
 if(e.target&&e.target.id==='btnAuditSet'){
  const msg=$('auditSetMsg');
  try{await srvCmd('audit/settings',{demote_cap_hr:Number($('auditSetCap').value),breaker_pct:Number($('auditSetBreaker').value),sessions:Number($('auditSetSessions').value),sessions_mode:$('auditSetSessMode').value});msg.innerHTML='<span class="ok">Saved ✓</span>';setTimeout(()=>{msg.textContent='';},4000);}
  catch(err){msg.innerHTML='<span class="bad">'+esc(err.message)+'</span>';}
 }
});
// — render dispatch —
function render(force){
 renderHeader();
 if(held()&&!force)return;
 if(tab==='overview')renderOverview();
 else if(tab==='researchers')renderResearchers();
 else if(tab==='verification')renderVerification();
 else if(tab==='audit')renderAudit();
 else if(tab==='memory')renderMemory();
 else if(tab==='activity')renderActivity();
 else if(tab==='advanced')renderAdvanced();
}
async function cycle(){await pollSrv();await pollLedger();if(tab==='verification'||tab==='overview')await pollPromos();if(tab==='audit')await pollAudit();render();}
async function legacyCycle(){await pollLegacy();if(tab==='activity'&&!held())renderActivity();}
document.addEventListener('keydown',e=>{if((e.key==='ArrowRight'||e.key==='ArrowLeft')&&document.activeElement===document.body){const i=TABS.indexOf(tab);showTab((i+(e.key==='ArrowRight'?1:-1)+TABS.length)%TABS.length);}});
TABS.forEach(x=>$('tab-'+x).hidden=x!==tab);
document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab?'true':'false'));
cycle();setInterval(cycle,3000);legacyCycle();setInterval(legacyCycle,3000);
</script></body></html>`;
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
    if(req.url==='/api/ai-audit-events'){
      // Tail of .live-events.jsonl filtered to ai_audit_* — the tab's ticker.
      const t=tailRead('.live-events.jsonl',256*1024)||'';
      const items=t.trim().split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(e=>e&&/^ai_audit_/.test(String(e.stage||''))).slice(-60);
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({items}));return;
    }
    if(req.url==='/api/ai-audit-findings'){
      // Tail of the auditor's findings log — the AI Audit tab's table.
      const t=tailRead('.audit-work/ai-audit-findings.jsonl',512*1024)||'';
      const items=t.trim().split('\n').filter(Boolean).slice(-400).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({items}));return;
    }
    if(req.url==='/api/promotions'){
      // Tail of the verifier's promotions log — the "recently verified" list.
      const t=tailRead('.audit-work/verify-promotions.jsonl',256*1024)||'';
      const items=t.trim().split('\n').filter(Boolean).slice(-20).reverse().map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({items}));return;
    }
    if(req.url.startsWith('/status.json')){
      const payload=lastGoodStatus||'{"error":"status building"}';
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(payload);return;
    }
    res.writeHead(200,{'content-type':'text/html'});res.end(page);
  }catch(e){res.writeHead(500);res.end('server error');}
}).listen(+(process.env.DASH_PORT||4173),()=>console.log('live on '+(process.env.DASH_PORT||4173)));
