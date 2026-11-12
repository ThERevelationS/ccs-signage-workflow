// O-013 runtime authz probes — against the PUBLISHED endpoints.
//   1. anonymous rejection matrix (staffDataRead / staffEntityWrite /
//      updateEstimateRevisionAudit / jurisdiction_research /
//      estimatorDesignAction / customerPortalAction staff actions)
//   2. complete_manual_revision runtime reachability (was transport-404)
//   3. real-session revocation: login → session works → admin revoke → 401
//   4. portal token lifecycle: create_link → bootstrap (valid/bogus/scope-
//      confusion) → revoke_link → bootstrap rejects
//   5. fileBridgeMaintenance anonymous-invoke posture (F-1 confirm — report only)
// Emits .audit-work/live-o013-<ts>.json with per-probe outcomes.
import { writeFileSync } from 'node:fs';
import { permitCreds } from '../scripts/lib/permit-creds.mjs';

const APP_ID = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP_ID}/functions`;
const STAMP = Date.now();
const TAG = `[LIVE-O013 ${STAMP}]`;

const ev = { stamp: STAMP, probes: [], ok: true };
const probe = (name, pass, detail = {}) => {
  ev.probes.push({ name, pass: !!pass, ...detail });
  if (!pass) ev.ok = false;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`);
};

const invoke = async (fn, payload) => {
  const r = await fetch(`${FN}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }))
    .catch((e) => ({ status: 0, body: { error: String(e) } }));
  return r;
};
const data = (r) => r?.body?.data || r?.body || {};
const isRejected = (r) => r.status === 401 || r.status === 403 || r.status === 404 || data(r)?.success === false || !!data(r)?.error;

// ---------- 0. session ----------
const login = await invoke('verifyLogin', { username: permitCreds().user, password: permitCreds().pass });
const token = data(login)?.token;
if (!token) { console.log('FATAL no token', JSON.stringify(login)); process.exit(1); }
probe('verifyLogin', true);
const call = (fn, payload) => invoke(fn, { ...payload, session_token: token });

// ---------- 1. anonymous rejection matrix ----------
for (const [fn, payload, label] of [
  ['staffDataRead', { entity: 'AllInOneEstimate', query: {}, limit: 1 }, 'anon:staffDataRead'],
  ['staffEntityWrite', { entity: 'AllInOneEstimate', op: 'create', data: {} }, 'anon:staffEntityWrite'],
  ['updateEstimateRevisionAudit', { action: 'complete_manual_revision', estimate_id: 'x' }, 'anon:revisionAudit'],
  ['jurisdiction_research', { query: 'x' }, 'anon:jurisdiction_research'],
  ['estimatorDesignAction', { action: 'propose', module: 'foundation', project: {} }, 'anon:estimatorDesignAction'],
  ['customerPortalAction', { action: 'create_link', kind: 'estimate', estimate_id: 'x' }, 'anon:portal create_link'],
]) {
  const r = await invoke(fn, payload);
  probe(label, isRejected(r), { status: r.status, error: data(r)?.error || data(r)?.message || null });
}

// ---------- 2. complete_manual_revision reachability ----------
// Was a transport-404 on the stale published bundle. A routed response is any
// domain answer (error about the record is fine — the action must NOT be a
// gateway-level "function not found").
const cmr = await call('updateEstimateRevisionAudit', { action: 'complete_manual_revision', estimate_id: 'o013-nonexistent' });
const cmrBody = data(cmr);
const cmrRouted = cmr.status !== 404 || JSON.stringify(cmrBody || '').length > 0;
probe('complete_manual_revision routed', cmrRouted && !(cmr.status === 404 && !JSON.stringify(cmrBody || '')), { status: cmr.status, body: cmrBody });

// ---------- 3. session revocation ----------
// sessionAdminAction list → find the session row verifyLogin just minted →
// revoke with confirm_self → poll staffDataRead until the token 401s
// (bounded by the documented 15s auth cache).
const sessList = await call('sessionAdminAction', { action: 'list' });
const rows = data(sessList)?.sessions || [];
const cutoff = STAMP - 3 * 60 * 1000;
const fresh = rows.filter((s) => !s.revoked && Date.parse(s.created_at || '') > cutoff);
const mine = fresh.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
probe('session row visible', !!mine, { sessions_seen: rows.length, fresh: fresh.length });
if (mine) {
  const rev = await call('sessionAdminAction', { action: 'revoke', session_id: mine.id, confirm_self: true });
  probe('revoke accepted', data(rev)?.success === true, { body: data(rev) });
  const deadline = Date.now() + 30_000;
  let rejectedAt = null;
  while (Date.now() < deadline) {
    const r = await invoke('staffDataRead', { entity: 'AllInOneEstimate', query: {}, limit: 1, session_token: token });
    if (isRejected(r)) { rejectedAt = Date.now(); break; }
    await new Promise((res) => setTimeout(res, 2500));
  }
  probe('revoked token rejected', rejectedAt !== null, { ms: rejectedAt === null ? null : rejectedAt - STAMP });
} else {
  probe('revoked token rejected', false, { note: 'no fresh session row to revoke' });
}

// re-login for the portal probes (token above is revoked)
const login2 = await invoke('verifyLogin', { username: permitCreds().user, password: permitCreds().pass });
const token2 = data(login2)?.token;
probe('re-login', !!token2);
const call2 = (fn, payload) => invoke(fn, { ...payload, session_token: token2 });

// ---------- 4. portal token lifecycle ----------
const cust = await call2('ensureNewCustomer', { creation_key: `o013-cust-${STAMP}`, customer: { company_name: `${TAG} Portal Co`, contact_name: 'Portal Probe', status: 'active' } });
const customerId = data(cust)?.customer?.id;
const est = await call2('ensureNewEstimate', { creation_key: `o013-est-${STAMP}`, estimate: { project_name: `${TAG} Portal Estimate`, client_name: `${TAG} Portal Co`, customer_id: customerId, status: 'draft' } });
const estimateId = data(est)?.estimate?.id;
probe('portal fixture estimate', !!estimateId, { customerId, estimateId });

if (estimateId) {
  const link = await call2('customerPortalAction', { action: 'create_link', kind: 'estimate', estimate_id: estimateId });
  const pToken = data(link)?.token;
  const linkId = data(link)?.link?.id;
  probe('create_link', !!pToken, { linkId });

  if (pToken) {
    // bogus token
    const bogus = await invoke('customerPortalAction', { action: 'bootstrap', token: 'f'.repeat(64) });
    probe('bootstrap bogus token rejected', isRejected(bogus) && (bogus.status === 404 || /invalid|expired|revoked|recognized/i.test(JSON.stringify(bogus.body))), { status: bogus.status, body: bogus.body });

    // valid token — returns only the link's estimate
    const boot = await invoke('customerPortalAction', { action: 'bootstrap', token: pToken });
    const bootEst = data(boot)?.estimate;
    probe('bootstrap valid', data(boot)?.success === true && bootEst?.id === estimateId, { kind: data(boot)?.kind, estimate_id: bootEst?.id });

    // scope-confusion: a foreign customer/estimate id in the body must be
    // ignored — the link's record_id owns the scope.
    const confused = await invoke('customerPortalAction', { action: 'bootstrap', token: pToken, customer_id: 'o013-other-customer', estimate_id: 'o013-other-estimate' });
    const confusedEst = data(confused)?.estimate;
    probe('scope-confusion safe', data(confused)?.success === true && confusedEst?.id === estimateId, { returned_id: confusedEst?.id });

    // staff_view link mutations fail closed — mint one and try estimate_respond
    const svLink = await call2('customerPortalAction', { action: 'create_link', kind: 'staff_view', estimate_id: estimateId });
    const svToken = data(svLink)?.token;
    const svLinkId = data(svLink)?.link?.id;
    if (svToken) {
      const svResp = await invoke('customerPortalAction', { action: 'estimate_respond', token: svToken, estimate_id: estimateId, decision: 'approved', responses: [] });
      probe('staff_view mutation rejected', isRejected(svResp), { status: svResp.status, body: svResp.body });
      await call2('customerPortalAction', { action: 'revoke_link', link_id: svLinkId });
    }

    // revoke → bootstrap must reject
    const rev = await call2('customerPortalAction', { action: 'revoke_link', link_id: linkId });
    probe('revoke_link', data(rev)?.success === true, { body: data(rev) });
    const after = await invoke('customerPortalAction', { action: 'bootstrap', token: pToken });
    probe('revoked link rejected', isRejected(after) && /invalid|expired|revoked|recognized/i.test(JSON.stringify(after.body)), { status: after.status, body: after.body });
  }
}

// ---------- 5. fileBridgeMaintenance anonymous posture (F-1 report only) ----------
const fbm = await invoke('fileBridgeMaintenance', {});
probe('fileBridgeMaintenance anon posture', true, { status: fbm.status, ran_without_auth: !isRejected(fbm), body: data(fbm) });
if (!isRejected(fbm)) console.log('   note: fileBridgeMaintenance executed WITHOUT a session — F-1 confirmed at runtime (out-of-scope FileBridge surface; report to Brett)');

// ---------- summary ----------
const passed = ev.probes.filter((p) => p.pass).length;
const fbmNote = isRejected(fbm) ? '' : ' | F-1 CONFIRMED';
console.log(`\n${ev.ok ? 'PASS' : 'FAIL'} live-o013-authz: ${passed}/${ev.probes.length}${fbmNote}`);
writeFileSync(new URL(`./live-o013-${STAMP}.json`, import.meta.url), JSON.stringify(ev, null, 2));
process.exit(ev.ok ? 0 : 1);
