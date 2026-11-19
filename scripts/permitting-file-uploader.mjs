#!/usr/bin/env node
// Bounded upload lane — swaps local:// archive urls for real storage file_urls.
// This is the ONLY remaining metered step in the document chain (1 UploadFile
// credit per stored file). Paced deliberately so uploads never bog the server:
// ~12/min, sha256-deduped, and a remote re-fetch verifies stored bytes match the
// local archive (the same readback-verification the app-side flow performs).
//
// Order matters: catalog rows are registered by the doc-pipeline only AFTER
// the real url lands, so archived_file_url is never local://.
// Usage: node scripts/permitting-file-uploader.mjs [--once]
import { existsSync, readFileSync, openSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { indexFile, officeKey, resolveOffice, keyFromPath } from './lib/office-files.mjs';

const ONCE = process.argv.includes('--once');
const PER_MIN = 12;
const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'file-uploader', ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token = null, callsAt = [];
async function budget(min = 25) {
  while (true) {
    const now = Date.now();
    callsAt = callsAt.filter((t) => now - t < 60_000);
    if (callsAt.length < min) { callsAt.push(now); return; }
    await sleep(60_000 - (now - callsAt[0]) + 50);
  }
}
async function login() {
  if (token) return token;
  const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
  token = t?.session_token || t?.token || null;
  return token;
}
async function call(fn, body, timeout = 120000) {
  await budget();
  const tk = await login(); if (!tk) return null;
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, ...body }), signal: AbortSignal.timeout(timeout) }).catch(() => null);
  const j = r ? await r.json().catch(() => null) : null;
  if (/rate limit/i.test(JSON.stringify(j || {}))) { emit({ stage: 'up_budget_wait', detail: 'shared budget hit — 65s' }); await sleep(65_000); }
  return j;
}

const MIME = { pdf: 'application/pdf', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

async function pass() {
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  const localityByProfile = new Map();
  for (const l of getMirror('localities')?.rows || [])
    if (l.jurisdiction_profile_id) localityByProfile.set(l.jurisdiction_profile_id, l);
  let uploaded = 0, verified = 0, errors = 0;
  outer: for (const profile of profiles) {
    const docs = (profile.documents || []).filter((d) => String(d.file_url || '').startsWith('local://'));
    for (const doc of docs) {
      if (uploaded >= PER_MIN) break outer;
      const localPath = doc.file_url.slice(8);
      if (!existsSync(localPath)) { errors += 1; continue; }
      try {
        const bytes = readFileSync(localPath);
        const sha = sha256(bytes);
        const name = localPath.split('/').pop();
        const ext = name.split('.').pop().toLowerCase();
        const up = await call('staffArchiveFile', { bytes_b64: bytes.toString('base64'), filename: name, mime: MIME[ext] || 'application/octet-stream' });
        const fileUrl = up?.file_url;
        if (!fileUrl) {
          const msg = JSON.stringify(up || {});
          // Monthly integrations quota hit — nothing will upload until reset.
          // Park the lane instead of burning calls + spamming errors per file.
          if (/limit of integrations|upgrade your plan/i.test(msg)) {
            emit({ stage: 'up_quota', address: profile.name, ok: false, detail: 'upload quota exhausted (monthly integrations cap) — lane parking 4h' });
            await new Promise((r) => setTimeout(r, 4 * 60 * 60_000));
            break outer;
          }
          errors += 1; emit({ stage: 'up_err', address: profile.name, ok: false, detail: `upload failed: ${msg.slice(0, 100)}` }); continue;
        }
        // Readback verification — same guarantee as the app-side verify step.
        const back = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) }).catch(() => null);
        const backBytes = back?.ok ? new Uint8Array(await back.arrayBuffer()) : null;
        const storedSha = backBytes ? sha256(backBytes) : null;
        if (storedSha !== sha) { errors += 1; emit({ stage: 'up_verify_err', address: profile.name, ok: false, detail: `stored bytes mismatch on ${doc.title?.slice(0, 40)}` }); continue; }
        verified += 1;
        // CAS re-stamp: point-read fresh, swap local:// → real url.
        const fresh = (await call('staffDataRead', { entity: 'JurisdictionProfile', query: { id: profile.id }, limit: 1 }))?.items?.[0];
        if (!fresh) continue;
        const curDoc = (fresh.documents || []).find((d) => d.id === doc.id && d.file_url === doc.file_url);
        if (!curDoc) continue; // doc changed underfoot — next pass reconciles
        const documents = fresh.documents.map((d) => d.id === doc.id ? {
          ...d, file_url: fileUrl, stored_sha256: storedSha, stored_bytes: backBytes.length, downloaded_at: new Date().toISOString(),
          archive_state: { ...(d.archive_state || {}), status: 'complete', file_url: fileUrl, uploaded_at: new Date().toISOString(), completed_at: new Date().toISOString(), lease_expires_at: '', error: '' },
        } : d);
        const w = await call('staffEntityWrite', { entity: 'JurisdictionProfile', op: 'update', id: fresh.id, data: { documents }, expected_updated_date: fresh.updated_date });
        if (w?.success) {
          uploaded += 1;
          mirrorApply(String(profile.state || '').toUpperCase() === 'KY' ? 'profiles-ky' : 'profiles-oh', { ...fresh, documents });
          // Index the office-file stage — key recovered from the file path when
          // it already lives under an office dir, else re-resolved (flat pool).
          try {
            const locality = localityByProfile.get(profile.id);
            const office = resolveOffice(locality, doc);
            const key = keyFromPath(localPath) || officeKey({ state: profile.state, jurisdictionName: profile.name, jurisdictionId: profile.id, officeName: office?.name, officeId: office?.id });
            indexFile(key, {
              jurisdiction_id: profile.id, jurisdiction_name: profile.name, state: profile.state,
              locality_id: locality?.id || null, office_id: office?.id || null,
              office_name: office?.name || 'unassigned', roles: office?.authority_roles || [],
            }, { sha256: sha, bytes: bytes.length, official_url: doc.url, file_url: fileUrl, local_path: localPath, name, stage: 'uploaded' });
          } catch {}
          emit({ stage: 'up_ok', address: `${profile.name}, ${profile.state}`, detail: `${doc.title?.slice(0, 50)} → storage (${(bytes.length / 1024).toFixed(0)}KB)` });
        }
      } catch (e) { errors += 1; emit({ stage: 'up_err', address: profile.name, ok: false, detail: String(e?.message || e).slice(0, 120) }); }
      await sleep(5000 / PER_MIN * 60); // pace ≈ PER_MIN/min
    }
  }
  emit({ stage: 'up_pass', detail: `uploaded+verified:${uploaded}/${verified} errors:${errors}` });
}

emit({ stage: 'up_boot', address: 'file uploader', ok: true, start: true, detail: `bounded upload lane — ${PER_MIN}/min` });
(async () => {
  while (true) {
    try { await pass(); } catch (e) { emit({ stage: 'up_err', ok: false, detail: String(e?.message || e).slice(0, 150) }); }
    if (ONCE) break;
    await sleep(2 * 60 * 1000);
  }
})();
