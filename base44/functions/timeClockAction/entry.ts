import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function b64urlEncode(str: string) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string) {
  let value = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  return atob(value);
}

async function hmacSign(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifySessionToken(token: string, secret: string, authorized: any) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (!constantTimeEqual(expectedSig, providedSig)) return null;

  let payload: any;
  try {
    payload = JSON.parse(b64urlDecode(payloadStr));
  } catch {
    return null;
  }
  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  if (
    !payload?.email ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt
  ) return null;

  const rows = await authorized.filter({ email: String(payload.email).trim().toLowerCase() });
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const user = rows[0];
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) return null;
  return user;
}

function asEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: any, key) => {
    out[key] = canonicalize(value[key]);
    return out;
  }, {});
}

async function payloadHash(value: any) {
  return sha256Hex(JSON.stringify(canonicalize(value)));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authenticationMethodFor(actor: any, target: any) {
  if (actor?.role === 'badge') return 'badge';
  return asEmail(actor?.email) === asEmail(target?.email) ? 'session' : 'admin_kiosk';
}

function publicEmployee(target: any) {
  return {
    id: target?.id,
    email: asEmail(target?.email),
    full_name: target?.full_name || asEmail(target?.email),
    username: target?.username || '',
  };
}

async function verifyBadgeCredential(code: string, badgeEntity: any, authorized: any) {
  const parts = String(code || '').trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'TIMECLOCK2') return null;

  let email = '';
  try {
    email = asEmail(b64urlDecode(parts[1]));
  } catch {
    return null;
  }
  const version = Number(parts[2]);
  const rawToken = String(parts[3] || '').trim().toLowerCase();
  if (!email || !Number.isInteger(version) || version < 1 || !/^[a-f0-9]{64}$/.test(rawToken)) return null;

  const targetRows = await authorized.filter({ email });
  if (!Array.isArray(targetRows) || targetRows.length !== 1) return null;
  const badgeRows = await badgeEntity.filter({ user_email: email });
  if (!Array.isArray(badgeRows)) return null;
  const activeBadges = badgeRows.filter((row: any) => !row?.revoked_at);
  if (activeBadges.length !== 1) return null;
  const badge = activeBadges[0];
  if (Number(badge.badge_version) !== version) return null;

  const expectedHash = await sha256Hex(`${email}|${version}|${rawToken}`);
  if (!constantTimeEqual(String(badge.token_hash || ''), expectedHash)) return null;

  badgeEntity.updateMany(
    { id: badge.id, updated_date: badge.updated_date, user_email: email, badge_version: version },
    { $set: { last_used_at: new Date().toISOString() } },
  ).catch((error: any) => console.error('Time Clock badge last-used update failed:', error?.message || error));

  return { target: targetRows[0], badge };
}

function validRequestId(value: unknown) {
  const id = String(value || '').trim();
  return id.length >= 8 && id.length <= 128 ? id : '';
}

function minutesFromAllocation(job: any) {
  const minutes = Number(job?.minutes);
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes);
  const hours = Number(job?.hours);
  if (Number.isFinite(hours) && hours > 0) return Math.round(hours * 60);
  return 0;
}

function allocationForStorage(job: any) {
  const minutes = minutesFromAllocation(job);
  return {
    work_order_id: String(job?.work_order_id || '').trim(),
    work_order_title: String(job?.work_order_title || '').trim(),
    client_name: String(job?.client_name || '').trim(),
    hours: minutes / 60,
    minutes,
    is_inhouse: job?.is_inhouse === true,
    inhouse_task: String(job?.inhouse_task || '').trim(),
  };
}

function clockOutSubmissionForHash(body: any) {
  const submittedLunch = Number(body?.lunch_minutes);
  const allocations = Array.isArray(body?.job_allocations) ? body.job_allocations : [];
  return {
    lunch_minutes: Number.isFinite(submittedLunch) ? Math.round(submittedLunch) : null,
    job_allocations: allocations.map((job: any) => allocationForStorage(job)),
    notes: String(body?.notes || '').trim(),
  };
}

function entryAuditSnapshot(entry: any) {
  return {
    id: entry?.id || null,
    user_email: asEmail(entry?.user_email),
    user_name: entry?.user_name || '',
    clock_in: entry?.clock_in || null,
    clock_out: entry?.clock_out || null,
    lunch_minutes: Number(entry?.lunch_minutes || 0),
    total_hours: Number(entry?.total_hours || 0),
    status: entry?.status || '',
    notes: entry?.notes || '',
    job_allocations: Array.isArray(entry?.job_allocations) ? entry.job_allocations : [],
    clock_source: entry?.clock_source || '',
    approval_status: entry?.approval_status || 'unreviewed',
    approved_at: entry?.approved_at || null,
    approved_by: entry?.approved_by || '',
    approval_note: entry?.approval_note || '',
    approval_request_id: entry?.approval_request_id || '',
    pay_period_id: entry?.pay_period_id || '',
    pay_period_locked_at: entry?.pay_period_locked_at || null,
    pay_period_locked_by: entry?.pay_period_locked_by || '',
    updated_date: entry?.updated_date || null,
  };
}

const COMPANY_TIME_ZONE = 'America/New_York';

function dateKeyInCompanyTime(value: any) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function entryFallsInPeriod(entry: any, startDate: string, endDate: string) {
  const key = dateKeyInCompanyTime(entry?.clock_in);
  return Boolean(key && key >= startDate && key <= endDate);
}

function activeEntryMayOverlapPeriod(entry: any, endDate: string) {
  if (entry?.status !== 'clocked_in' || entry.archived_test_data || entry.archived_admin) return false;
  const clockInDay = dateKeyInCompanyTime(entry.clock_in);
  // A missing or malformed active punch cannot safely be ruled out of any period.
  // Require audited manager investigation rather than silently finalizing past it.
  return !clockInDay || clockInDay <= endDate;
}

function entryIsPayPeriodLocked(entry: any) {
  return Boolean(String(entry?.pay_period_id || '').trim());
}

function validDateKey(value: unknown) {
  const key = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const parsed = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : '';
}

async function uniqueRow(entity: any, query: any, label: string) {
  const rows = await entity.filter(query);
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
  if (rows.length > 1) throw new Error(`${label} is ambiguous (${rows.length} records).`);
  return rows[0] || null;
}

async function audit(auditEntity: any, data: any) {
  try {
    await auditEntity.create(data);
    return true;
  } catch (error) {
    console.error('timeClockAction audit write failed:', error?.message || error);
    return false;
  }
}

async function ensureActionAudit(auditEntity: any, data: any, label = 'Time Clock action audit') {
  const action = String(data?.action || '').trim();
  const requestId = String(data?.request_id || '').trim();
  const entryId = String(data?.time_entry_id || '').trim();
  if (!action || !requestId || !entryId) throw new Error(`${label} is missing its action, request id, or TimeEntry id.`);

  const query = { action, request_id: requestId, time_entry_id: entryId };
  let existing = await uniqueRow(auditEntity, query, label);
  if (existing?.id) {
    if (asEmail(existing.user_email) !== asEmail(data.user_email)) {
      throw new Error(`${label} belongs to a different employee.`);
    }
    return { audit: existing, reused: true };
  }

  try {
    const created = await auditEntity.create(data);
    if (created?.id) return { audit: created, reused: false };
  } catch (error) {
    console.error(`${label} write failed; checking for a concurrent confirmed audit:`, error?.message || error);
  }

  existing = await uniqueRow(auditEntity, query, label);
  if (existing?.id && asEmail(existing.user_email) === asEmail(data.user_email)) {
    return { audit: existing, reused: true };
  }
  throw new Error(`${label} could not be persisted. The action remains in a recoverable transition state.`);
}

async function ensureUserActionAudit(auditEntity: any, data: any, label = 'Time Clock user action audit') {
  const action = String(data?.action || '').trim();
  const requestId = String(data?.request_id || '').trim();
  const userEmail = asEmail(data?.user_email);
  if (!action || !requestId || !userEmail) throw new Error(`${label} is missing its action, request id, or employee email.`);

  const query = { action, request_id: requestId, user_email: userEmail };
  let existing = await uniqueRow(auditEntity, query, label);
  if (existing?.id) return { audit: existing, reused: true };

  try {
    const created = await auditEntity.create(data);
    if (created?.id) return { audit: created, reused: false };
  } catch (error) {
    console.error(`${label} write failed; checking for a concurrent audit:`, error?.message || error);
  }

  existing = await uniqueRow(auditEntity, query, label);
  if (existing?.id) return { audit: existing, reused: true };
  throw new Error(`${label} could not be persisted. Retry the same request.`);
}

async function clockOutAuditForRequest(auditEntity: any, requestId: string, entryId: string) {
  return uniqueRow(auditEntity, { action: 'clock_out', request_id: requestId, time_entry_id: entryId }, 'Clock-out audit request');
}

async function ensureClockInAudit({ auditEntity, entry, target, actor, requestId }: any) {
  if (!entry?.id || entry.status !== 'clocked_in' || String(entry.clock_in_request_id || '') !== requestId) {
    throw new Error('A matching active TimeEntry is required before its Clock In audit can be confirmed.');
  }
  return ensureActionAudit(auditEntity, {
    action: 'clock_in', outcome: 'confirmed', user_email: target.email,
    user_name: target.full_name || target.email, actor_email: asEmail(actor.email), actor_role: actor.role,
    authentication_method: authenticationMethodFor(actor, target),
    server_timestamp: entry.clock_in, request_id: requestId, time_entry_id: entry.id,
  }, 'Clock In audit');
}

async function ensureState(stateEntity: any, target: any) {
  const email = asEmail(target?.email);
  let rows = await stateEntity.filter({ user_email: email });
  if (!Array.isArray(rows)) throw new Error('Time Clock state lookup did not return a record list.');
  if (rows.length > 1) throw new Error(`Time Clock state is ambiguous for ${email}.`);
  if (rows.length === 1) return rows[0];

  await stateEntity.create({
    user_email: email,
    user_name: target?.full_name || email,
    status: 'clocked_out',
    break_status: 'working',
    work_pause_status: 'working',
    labor_status: 'idle',
  });
  rows = await stateEntity.filter({ user_email: email });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Time Clock state could not be initialized uniquely for ${email}.`);
  }
  return rows[0];
}

async function freshState(stateEntity: any, id: string) {
  const state = await stateEntity.get(id);
  if (!state?.id) throw new Error('Time Clock state could not be re-read.');
  return state;
}

async function claimTimeOffCreateLock(stateEntity: any, stateId: string, requestId: string) {
  const claimToken = crypto.randomUUID();
  const staleMs = 30_000;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await freshState(stateEntity, stateId);
    const rawStatus = String(current.time_off_create_status || '');

    if (!rawStatus) {
      const initialized = await stateEntity.updateMany(
        { id: current.id, updated_date: current.updated_date },
        { $set: {
          time_off_create_status: 'idle',
          time_off_create_request_id: '',
          time_off_create_claim_token: '',
          time_off_create_started_at: null,
        } },
      );
      if (!initialized || typeof initialized.updated !== 'number') throw new Error('Time Off create lock initialization could not be verified.');
      continue;
    }

    if (rawStatus === 'idle') {
      const startedAt = new Date().toISOString();
      const claimed = await stateEntity.updateMany(
        { id: current.id, updated_date: current.updated_date, time_off_create_status: 'idle' },
        { $set: {
          time_off_create_status: 'creating',
          time_off_create_request_id: requestId,
          time_off_create_claim_token: claimToken,
          time_off_create_started_at: startedAt,
        } },
      );
      if (!claimed || typeof claimed.updated !== 'number') throw new Error('Time Off create lock claim could not be verified.');
      if (claimed.updated === 1) {
        return { acquired: true, claim_token: claimToken, state: await freshState(stateEntity, stateId), recovered: false };
      }
      continue;
    }

    if (rawStatus !== 'creating') {
      return { acquired: false, investigation: true, error: 'Time Off create lock is in an invalid state. Admin review is required.' };
    }

    const heldRequestId = String(current.time_off_create_request_id || '');
    if (heldRequestId !== requestId) {
      return { acquired: false, different_request: true, error: 'Another Time Off submission is still being processed. Finish or recover that request before starting a new one.' };
    }

    const startedMs = Date.parse(String(current.time_off_create_started_at || ''));
    const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : Number.POSITIVE_INFINITY;
    if (ageMs < staleMs) {
      return { acquired: false, retry_same_request: true, error: 'This Time Off submission is already being processed. Retry the same request after status refresh.' };
    }

    const recoveredAt = new Date().toISOString();
    const recovered = await stateEntity.updateMany(
      {
        id: current.id,
        updated_date: current.updated_date,
        time_off_create_status: 'creating',
        time_off_create_request_id: requestId,
        time_off_create_claim_token: String(current.time_off_create_claim_token || ''),
      },
      { $set: {
        time_off_create_claim_token: claimToken,
        time_off_create_started_at: recoveredAt,
      } },
    );
    if (!recovered || typeof recovered.updated !== 'number') throw new Error('Time Off create lock recovery could not be verified.');
    if (recovered.updated === 1) {
      return { acquired: true, claim_token: claimToken, state: await freshState(stateEntity, stateId), recovered: true };
    }
  }

  return { acquired: false, retry_same_request: true, error: 'Time Off create lock changed concurrently. Retry the same request after status refresh.' };
}

async function releaseTimeOffCreateLock(stateEntity: any, stateId: string, requestId: string, claimToken: string) {
  const current = await freshState(stateEntity, stateId).catch(() => null);
  if (!current?.id) return false;
  if (
    String(current.time_off_create_status || '') !== 'creating' ||
    String(current.time_off_create_request_id || '') !== requestId ||
    String(current.time_off_create_claim_token || '') !== claimToken
  ) return false;

  const released = await stateEntity.updateMany(
    {
      id: current.id,
      updated_date: current.updated_date,
      time_off_create_status: 'creating',
      time_off_create_request_id: requestId,
      time_off_create_claim_token: claimToken,
    },
    { $set: {
      time_off_create_status: 'idle',
      time_off_create_request_id: '',
      time_off_create_claim_token: '',
      time_off_create_started_at: null,
    } },
  );
  if (!released || typeof released.updated !== 'number') throw new Error('Time Off create lock release could not be verified.');
  return released.updated === 1;
}

async function claimCorrectionCreateLock(
  stateEntity: any,
  stateId: string,
  requestId: string,
  timeEntryId: string,
  payloadHashValue: string,
) {
  const claimToken = crypto.randomUUID();
  const staleMs = 30_000;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await freshState(stateEntity, stateId);
    const rawStatus = String(current.correction_create_status || '');

    if (!rawStatus) {
      const initialized = await stateEntity.updateMany(
        { id: current.id, updated_date: current.updated_date },
        { $set: {
          correction_create_status: 'idle',
          correction_create_request_id: '',
          correction_create_time_entry_id: '',
          correction_create_payload_hash: '',
          correction_create_claim_token: '',
          correction_create_started_at: null,
        } },
      );
      if (!initialized || typeof initialized.updated !== 'number') throw new Error('Correction create lock initialization could not be verified.');
      continue;
    }

    if (rawStatus === 'idle') {
      const startedAt = new Date().toISOString();
      const claimed = await stateEntity.updateMany(
        { id: current.id, updated_date: current.updated_date, correction_create_status: 'idle' },
        { $set: {
          correction_create_status: 'creating',
          correction_create_request_id: requestId,
          correction_create_time_entry_id: timeEntryId,
          correction_create_payload_hash: payloadHashValue,
          correction_create_claim_token: claimToken,
          correction_create_started_at: startedAt,
        } },
      );
      if (!claimed || typeof claimed.updated !== 'number') throw new Error('Correction create lock claim could not be verified.');
      if (claimed.updated === 1) {
        return { acquired: true, claim_token: claimToken, state: await freshState(stateEntity, stateId), recovered: false };
      }
      continue;
    }

    if (rawStatus !== 'creating') {
      return { acquired: false, investigation: true, error: 'Correction create lock is in an invalid state. Admin review is required.' };
    }

    const heldRequestId = String(current.correction_create_request_id || '');
    if (heldRequestId !== requestId) {
      return { acquired: false, different_request: true, error: 'Another correction submission is still being processed. Finish or recover that request before starting a new one.' };
    }

    const heldEntryId = String(current.correction_create_time_entry_id || '');
    const heldPayloadHash = String(current.correction_create_payload_hash || '');
    if (heldEntryId !== timeEntryId || !heldPayloadHash || !constantTimeEqual(heldPayloadHash, payloadHashValue)) {
      return { acquired: false, investigation: true, error: 'This correction request id is already bound to different correction details. Admin review is required.' };
    }

    const startedMs = Date.parse(String(current.correction_create_started_at || ''));
    const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : Number.POSITIVE_INFINITY;
    if (ageMs < staleMs) {
      return { acquired: false, retry_same_request: true, error: 'This correction submission is already being processed. Retry the same request after status refresh.' };
    }

    const recoveredAt = new Date().toISOString();
    const recovered = await stateEntity.updateMany(
      {
        id: current.id,
        updated_date: current.updated_date,
        correction_create_status: 'creating',
        correction_create_request_id: requestId,
        correction_create_time_entry_id: timeEntryId,
        correction_create_payload_hash: heldPayloadHash,
        correction_create_claim_token: String(current.correction_create_claim_token || ''),
      },
      { $set: {
        correction_create_claim_token: claimToken,
        correction_create_started_at: recoveredAt,
      } },
    );
    if (!recovered || typeof recovered.updated !== 'number') throw new Error('Correction create lock recovery could not be verified.');
    if (recovered.updated === 1) {
      return { acquired: true, claim_token: claimToken, state: await freshState(stateEntity, stateId), recovered: true };
    }
  }

  return { acquired: false, retry_same_request: true, error: 'Correction create lock changed concurrently. Retry the same request after status refresh.' };
}

async function releaseCorrectionCreateLock(
  stateEntity: any,
  stateId: string,
  requestId: string,
  timeEntryId: string,
  payloadHashValue: string,
  claimToken: string,
) {
  const current = await freshState(stateEntity, stateId).catch(() => null);
  if (!current?.id) return false;
  if (
    String(current.correction_create_status || '') !== 'creating' ||
    String(current.correction_create_request_id || '') !== requestId ||
    String(current.correction_create_time_entry_id || '') !== timeEntryId ||
    !constantTimeEqual(String(current.correction_create_payload_hash || ''), payloadHashValue) ||
    String(current.correction_create_claim_token || '') !== claimToken
  ) return false;

  const released = await stateEntity.updateMany(
    {
      id: current.id,
      updated_date: current.updated_date,
      correction_create_status: 'creating',
      correction_create_request_id: requestId,
      correction_create_time_entry_id: timeEntryId,
      correction_create_payload_hash: payloadHashValue,
      correction_create_claim_token: claimToken,
    },
    { $set: {
      correction_create_status: 'idle',
      correction_create_request_id: '',
      correction_create_time_entry_id: '',
      correction_create_payload_hash: '',
      correction_create_claim_token: '',
      correction_create_started_at: null,
    } },
  );
  if (!released || typeof released.updated !== 'number') throw new Error('Correction create lock release could not be verified.');
  return released.updated === 1;
}

async function releaseCompletedCorrectionCreateLock(
  stateEntity: any,
  stateId: string,
  requestId: string,
  timeEntryId: string,
  payloadHashValue: string,
) {
  const current = await freshState(stateEntity, stateId).catch(() => null);
  if (!current?.id) return false;

  const rawStatus = String(current.correction_create_status || '');
  if (!rawStatus || rawStatus === 'idle') return true;
  if (rawStatus !== 'creating') return false;

  const heldRequestId = String(current.correction_create_request_id || '');
  if (heldRequestId !== requestId) return true;

  const heldEntryId = String(current.correction_create_time_entry_id || '');
  const heldPayloadHash = String(current.correction_create_payload_hash || '');
  if (heldEntryId !== timeEntryId || !heldPayloadHash || !constantTimeEqual(heldPayloadHash, payloadHashValue)) return false;

  const heldClaimToken = String(current.correction_create_claim_token || '');
  const released = await stateEntity.updateMany(
    {
      id: current.id,
      updated_date: current.updated_date,
      correction_create_status: 'creating',
      correction_create_request_id: requestId,
      correction_create_time_entry_id: timeEntryId,
      correction_create_payload_hash: heldPayloadHash,
      correction_create_claim_token: heldClaimToken,
    },
    { $set: {
      correction_create_status: 'idle',
      correction_create_request_id: '',
      correction_create_time_entry_id: '',
      correction_create_payload_hash: '',
      correction_create_claim_token: '',
      correction_create_started_at: null,
    } },
  );
  if (!released || typeof released.updated !== 'number') throw new Error('Completed correction create lock release could not be verified.');
  if (released.updated === 1) return true;

  const fresh = await freshState(stateEntity, stateId).catch(() => null);
  if (!fresh?.id) return false;
  const freshStatus = String(fresh.correction_create_status || '');
  if (!freshStatus || freshStatus === 'idle') return true;
  if (freshStatus === 'creating' && String(fresh.correction_create_request_id || '') !== requestId) return true;
  return false;
}

async function recoverCompletedClockInMutationGate(
  stateEntity: any,
  entryEntity: any,
  auditEntity: any,
  state: any,
  target: any,
) {
  if (String(state?.correction_create_status || '') !== 'creating') return state;
  const heldRequestId = String(state.correction_create_request_id || '');
  const gateEntryId = `clock_in:${asEmail(target?.email)}`;
  if (!heldRequestId || String(state.correction_create_time_entry_id || '') !== gateEntryId) return state;
  if (state.status !== 'clocked_in' || !state.active_entry_id) return state;

  const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
  if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== asEmail(target.email) ||
      String(entry.clock_in_request_id || '') !== heldRequestId || entry.archived_test_data || entry.archived_admin) return state;

  const expectedHash = await payloadHash({ action: 'clock_in', user_email: asEmail(target.email) });
  if (!constantTimeEqual(String(state.correction_create_payload_hash || ''), expectedHash)) return state;
  // A saved active state is not enough to certify an interrupted Clock In.
  // Keep its shared mutation gate held until the exact entry's audit exists.
  const clockInAudit = await uniqueRow(auditEntity, {
    action: 'clock_in', request_id: heldRequestId, time_entry_id: entry.id,
  }, 'Completed Clock In recovery audit');
  if (!clockInAudit?.id || !['confirmed', 'recovered'].includes(String(clockInAudit.outcome || '')) ||
      asEmail(clockInAudit.user_email) !== asEmail(target.email) ||
      String(clockInAudit.server_timestamp || '') !== String(entry.clock_in || '')) return state;
  const released = await releaseCompletedCorrectionCreateLock(
    stateEntity, state.id, heldRequestId, gateEntryId, expectedHash,
  );
  return released ? await freshState(stateEntity, state.id) : state;
}

// The caller must hold the shared per-employee correction/approval gate.
async function ensureCorrectionSubmissionNeedsReview({
  entryEntity, correctionRequestEntity, auditEntity, requestRecord, correctionAudit,
  requestId, requestHash, target,
}: any) {
  const original = requestRecord?.original_snapshot || {};
  if (String(original.approval_status || 'unreviewed') !== 'approved' || requestRecord.status !== 'pending') return requestRecord;
  if (!correctionAudit?.id || !['confirmed', 'recovered'].includes(String(correctionAudit.outcome || '')) ||
      asEmail(correctionAudit.user_email) !== target.email ||
      String(correctionAudit.details?.correction_request_id || '') !== requestRecord.id ||
      !constantTimeEqual(String(correctionAudit.details?.payload_hash || ''), requestHash)) return null;
  const originalVersion = String(original.updated_date || '');
  if (!originalVersion) return null;
  let entry = await entryEntity.get(requestRecord.time_entry_id).catch(() => null);
  if (!entry?.id || asEmail(entry.user_email) !== target.email ||
      entry.archived_test_data || entry.archived_admin || entry.status !== 'clocked_out') return null;

  const previousTransition = correctionAudit.details?.approval_transition;
  const transitionVersion = String(previousTransition?.saved_entry_updated_date || '');
  if (previousTransition && (
    String(previousTransition.correction_request_id || '') !== requestRecord.id ||
    String(previousTransition.from || '') !== 'approved' ||
    String(previousTransition.to || '') !== 'needs_review' || !transitionVersion
  )) return null;
  if (transitionVersion && String(requestRecord.time_entry_updated_date || '') === transitionVersion) return requestRecord;

  if (String(entry.correction_needs_review_request_id || '') !== requestId) {
    if (entry.approval_status !== 'approved' || entryIsPayPeriodLocked(entry) ||
        String(entry.updated_date || '') !== originalVersion ||
        String(requestRecord.time_entry_updated_date || '') !== originalVersion) return null;
    const changedAt = new Date().toISOString();
    const saved = await entryEntity.updateMany({
      id: entry.id, updated_date: originalVersion, user_email: target.email,
      status: 'clocked_out', approval_status: 'approved', pay_period_id: { $in: [null, ''] },
      archived_test_data: { $ne: true }, archived_admin: { $ne: true },
    }, {
      $set: {
        approval_status: 'needs_review', correction_needs_review_request_id: requestId,
        correction_needs_review_at: changedAt,
      },
      $unset: { approved_at: '', approved_by: '', approval_note: '', approval_request_id: '' },
    });
    if (!saved || typeof saved.updated !== 'number') return null;
    entry = await entryEntity.get(entry.id).catch(() => null);
  }
  if (!entry?.id || asEmail(entry.user_email) !== target.email ||
      String(entry.correction_needs_review_request_id || '') !== requestId ||
      entry.approval_status !== 'needs_review' || entryIsPayPeriodLocked(entry) ||
      String(entry.clock_in || '') !== String(original.clock_in || '') ||
      String(entry.clock_out || '') !== String(original.clock_out || '') ||
      Number(entry.lunch_minutes || 0) !== Number(original.lunch_minutes || 0) ||
      String(entry.notes || '') !== String(original.notes || '')) return null;

  if (String(requestRecord.time_entry_updated_date || '') === originalVersion) {
    const updatedVersion = await correctionRequestEntity.updateMany({
      id: requestRecord.id, request_id: requestId, user_email: target.email,
      status: 'pending', time_entry_updated_date: originalVersion,
    }, { $set: { time_entry_updated_date: entry.updated_date } });
    if (!updatedVersion || typeof updatedVersion.updated !== 'number') return null;
    requestRecord = await correctionRequestEntity.get(requestRecord.id).catch(() => null);
  }
  if (!requestRecord?.id ||
      String(requestRecord.time_entry_updated_date || '') !== String(entry.updated_date || '')) return null;

  const transition = {
    from: 'approved', to: 'needs_review', correction_request_id: requestRecord.id,
    request_id: requestId, saved_entry_updated_date: entry.updated_date,
    changed_at: entry.correction_needs_review_at,
  };
  const updatedAudit = await auditEntity.updateMany({
    id: correctionAudit.id, action: 'correction_request', outcome: { $in: ['confirmed', 'recovered'] },
    request_id: requestId, time_entry_id: entry.id, user_email: target.email,
  }, { $set: { details: { ...(correctionAudit.details || {}), approval_transition: transition } } });
  if (!updatedAudit || typeof updatedAudit.updated !== 'number') return null;
  const finalAudit = await auditEntity.get(correctionAudit.id).catch(() => null);
  if (!finalAudit?.id || !['confirmed', 'recovered'].includes(String(finalAudit.outcome || '')) ||
      asEmail(finalAudit.user_email) !== target.email ||
      String(finalAudit.details?.correction_request_id || '') !== requestRecord.id ||
      !constantTimeEqual(String(finalAudit.details?.payload_hash || ''), requestHash) ||
      String(finalAudit.details?.approval_transition?.saved_entry_updated_date || '') !==
        String(entry.updated_date || '')) return null;
  return requestRecord;
}

async function setState(stateEntity: any, state: any, expectedStatus: string, expectedRequestId: string | null, nextFields: any) {
  const query: any = {
    id: state.id,
    updated_date: state.updated_date,
    status: expectedStatus,
  };
  if (expectedRequestId !== null) query.last_request_id = expectedRequestId;
  const result = await stateEntity.updateMany(query, { $set: nextFields });
  if (!result || typeof result.updated !== 'number') throw new Error('Time Clock state update could not be verified.');
  if (result.updated !== 1) return null;
  return freshState(stateEntity, state.id);
}

function breakStatusOf(state: any) {
  const value = String(state?.break_status || 'working');
  return ['working', 'starting_break', 'on_break', 'ending_break'].includes(value) ? value : 'working';
}

async function setBreakState(stateEntity: any, state: any, expectedBreakStatus: string, expectedRequestId: string | null, nextFields: any) {
  const query: any = {
    id: state.id,
    updated_date: state.updated_date,
    status: 'clocked_in',
    break_status: expectedBreakStatus,
  };
  if (expectedRequestId !== null) query.last_break_request_id = expectedRequestId;
  const result = await stateEntity.updateMany(query, { $set: nextFields });
  if (!result || typeof result.updated !== 'number') throw new Error('Time Clock break-state update could not be verified.');
  if (result.updated !== 1) return null;
  return freshState(stateEntity, state.id);
}

async function ensureBreakAudit({ auditEntity, action, breakRow, target, actor, requestId, entryId }: any) {
  if (!breakRow?.id || !['break_start', 'break_end'].includes(action)) throw new Error('A valid break record is required before its audit can be confirmed.');
  const isEnd = action === 'break_end';
  return ensureActionAudit(auditEntity, {
    action, outcome: 'confirmed', user_email: target.email,
    user_name: target.full_name || target.email, actor_email: asEmail(actor.email), actor_role: actor.role,
    authentication_method: authenticationMethodFor(actor, target),
    server_timestamp: isEnd ? breakRow.ended_at : breakRow.started_at,
    request_id: requestId, time_entry_id: entryId,
    details: {
      break_id: breakRow.id,
      break_type: breakRow.break_type,
      is_paid: breakRow.is_paid,
      ...(isEnd ? { duration_minutes: breakRow.duration_minutes } : {}),
    },
  }, isEnd ? 'Break end audit' : 'Break start audit');
}

async function breakSummaryForEntry(breakEntity: any, entryId: string, userEmail: string) {
  const rows = await breakEntity.filter({ time_entry_id: entryId, user_email: userEmail, status: 'completed' });
  if (!Array.isArray(rows)) throw new Error('Completed break lookup did not return a record list.');
  let total = 0;
  let paid = 0;
  let unpaid = 0;
  for (const row of rows) {
    const minutes = Math.max(0, Math.round(Number(row?.duration_minutes || 0)));
    total += minutes;
    if (row?.is_paid === true) paid += minutes;
    else unpaid += minutes;
  }
  return {
    count: rows.length,
    total_minutes: total,
    paid_minutes: paid,
    unpaid_minutes: unpaid,
  };
}

async function recoverBreakTransition({ stateEntity, breakEntity, auditEntity, state, target, actor }: any) {
  if (state?.status !== 'clocked_in') return state;
  const breakStatus = breakStatusOf(state);
  if (!['starting_break', 'ending_break'].includes(breakStatus)) return state;
  const requestId = String(state.last_break_request_id || '');
  const started = state.break_pending_started_at ? new Date(state.break_pending_started_at) : null;
  const ageMs = started && Number.isFinite(started.getTime()) ? Date.now() - started.getTime() : Number.POSITIVE_INFINITY;

  if (breakStatus === 'starting_break') {
    const matches = requestId
      ? await breakEntity.filter({ user_email: target.email, time_entry_id: state.active_entry_id, start_request_id: requestId })
      : [];
    if (!Array.isArray(matches)) throw new Error('Break-start recovery lookup did not return a record list.');
    if (matches.length > 1) throw new Error('Break-start recovery is ambiguous.');
    if (matches.length === 1 && matches[0]?.status === 'active') {
      const breakRow = matches[0];
      const auditClaim = await setBreakState(stateEntity, state, 'starting_break', requestId, {
        break_pending_started_at: state.break_pending_started_at || breakRow.started_at,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      await ensureBreakAudit({ auditEntity, action: 'break_start', breakRow, target, actor, requestId, entryId: state.active_entry_id });
      const recovered = await setBreakState(stateEntity, auditClaim, 'starting_break', requestId, {
        break_status: 'on_break', active_break_id: breakRow.id, break_pending_started_at: null,
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: 'Recovered interrupted break-start finalization', details: { break_id: breakRow.id },
        });
        return recovered;
      }
    }
    if (matches.length === 1 && matches[0]?.status === 'completed' && matches[0]?.end_request_id) {
      const breakRow = matches[0];
      const auditClaim = await setBreakState(stateEntity, state, 'starting_break', requestId, {
        break_pending_started_at: state.break_pending_started_at || breakRow.started_at,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      await ensureBreakAudit({ auditEntity, action: 'break_start', breakRow, target, actor, requestId, entryId: state.active_entry_id });
      await ensureBreakAudit({ auditEntity, action: 'break_end', breakRow, target, actor, requestId: String(breakRow.end_request_id), entryId: state.active_entry_id });
      const recovered = await setBreakState(stateEntity, auditClaim, 'starting_break', requestId, {
        break_status: 'working', active_break_id: null,
        last_break_request_id: String(breakRow.end_request_id), break_pending_started_at: null,
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: 'Recovered stale break-start state after the matching break had already ended',
          details: { break_id: breakRow.id, end_request_id: breakRow.end_request_id },
        });
        return recovered;
      }
    }
    if (matches.length === 0 && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setBreakState(stateEntity, state, 'starting_break', requestId, {
        break_status: 'working', active_break_id: null, break_pending_started_at: null,
      });
      if (rolledBack) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: 'Rolled back abandoned break-start transition with no break record',
        });
        return rolledBack;
      }
    }
  }

  if (breakStatus === 'ending_break') {
    const breakRow = state.active_break_id ? await breakEntity.get(state.active_break_id).catch(() => null) : null;
    if (breakRow?.id && breakRow.status === 'completed' && String(breakRow.end_request_id || '') === requestId) {
      const auditClaim = await setBreakState(stateEntity, state, 'ending_break', requestId, {
        break_pending_started_at: state.break_pending_started_at || breakRow.ended_at,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      await ensureBreakAudit({ auditEntity, action: 'break_end', breakRow, target, actor, requestId, entryId: state.active_entry_id });
      const recovered = await setBreakState(stateEntity, auditClaim, 'ending_break', requestId, {
        break_status: 'working', active_break_id: null, break_pending_started_at: null,
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: 'Recovered interrupted break-end finalization', details: { break_id: breakRow.id },
        });
        return recovered;
      }
    }
    if (breakRow?.id && breakRow.status === 'active' && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setBreakState(stateEntity, state, 'ending_break', requestId, {
        break_status: 'on_break', active_break_id: breakRow.id, break_pending_started_at: null,
      });
      if (rolledBack) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: 'Rolled back abandoned break-end transition before break update', details: { break_id: breakRow.id },
        });
        return rolledBack;
      }
    }
  }

  return freshState(stateEntity, state.id);
}

function workPauseStatusOf(state: any) {
  const value = String(state?.work_pause_status || 'working');
  return ['working', 'pausing', 'paused', 'resuming'].includes(value) ? value : 'working';
}

async function setWorkPauseState(stateEntity: any, state: any, expectedPauseStatus: string, expectedRequestId: string | null, nextFields: any) {
  const query: any = {
    id: state.id,
    updated_date: state.updated_date,
    status: 'clocked_in',
    work_pause_status: expectedPauseStatus,
  };
  if (expectedRequestId !== null) query.last_work_pause_request_id = expectedRequestId;
  const result = await stateEntity.updateMany(query, { $set: nextFields });
  if (!result || typeof result.updated !== 'number') throw new Error('Time Clock Work Pause state update could not be verified.');
  if (result.updated !== 1) return null;
  return freshState(stateEntity, state.id);
}

async function ensureWorkPauseAudit({ auditEntity, action, pauseRow, target, actor, requestId, entryId }: any) {
  if (!pauseRow?.id || !['work_pause_start', 'work_pause_resume'].includes(action)) throw new Error('A valid Work Pause record is required before its audit can be confirmed.');
  const isResume = action === 'work_pause_resume';
  return ensureActionAudit(auditEntity, {
    action, outcome: 'confirmed', user_email: target.email,
    user_name: target.full_name || target.email, actor_email: asEmail(actor.email), actor_role: actor.role,
    authentication_method: authenticationMethodFor(actor, target),
    server_timestamp: isResume ? pauseRow.resumed_at : pauseRow.started_at,
    request_id: requestId, time_entry_id: entryId,
    details: {
      work_pause_id: pauseRow.id,
      ...(isResume ? { duration_minutes: pauseRow.duration_minutes } : {}),
    },
  }, isResume ? 'Work Pause resume audit' : 'Work Pause start audit');
}

async function workPauseSummaryForEntry(workPauseEntity: any, entryId: string, userEmail: string) {
  const rows = await workPauseEntity.filter({ time_entry_id: entryId, user_email: userEmail, status: 'completed' });
  if (!Array.isArray(rows)) throw new Error('Completed Work Pause lookup did not return a record list.');
  let total = 0;
  for (const row of rows) total += Math.max(0, Math.round(Number(row?.duration_minutes || 0)));
  return { count: rows.length, total_minutes: total };
}

async function recoverWorkPauseTransition({ stateEntity, workPauseEntity, auditEntity, state, target, actor }: any) {
  if (state?.status !== 'clocked_in') return state;
  const pauseStatus = workPauseStatusOf(state);
  if (!['pausing', 'resuming'].includes(pauseStatus)) return state;
  const requestId = String(state.last_work_pause_request_id || '');
  const started = state.work_pause_pending_started_at ? new Date(state.work_pause_pending_started_at) : null;
  const ageMs = started && Number.isFinite(started.getTime()) ? Date.now() - started.getTime() : Number.POSITIVE_INFINITY;

  if (pauseStatus === 'pausing') {
    const matches = requestId
      ? await workPauseEntity.filter({ user_email: target.email, time_entry_id: state.active_entry_id, start_request_id: requestId })
      : [];
    if (!Array.isArray(matches)) throw new Error('Work Pause start recovery lookup did not return a record list.');
    if (matches.length > 1) throw new Error('Work Pause start recovery is ambiguous.');
    if (matches.length === 1 && matches[0]?.status === 'active') {
      const pauseRow = matches[0];
      const auditClaim = await setWorkPauseState(stateEntity, state, 'pausing', requestId, {
        work_pause_pending_started_at: state.work_pause_pending_started_at || pauseRow.started_at,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_start', pauseRow, target, actor, requestId, entryId: state.active_entry_id });
      const recovered = await setWorkPauseState(stateEntity, auditClaim, 'pausing', requestId, {
        work_pause_status: 'paused', active_work_pause_id: pauseRow.id, work_pause_pending_started_at: null,
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: 'Recovered interrupted Work Pause start finalization', details: { work_pause_id: pauseRow.id },
        });
        return recovered;
      }
    }
    if (matches.length === 1 && matches[0]?.status === 'completed' && matches[0]?.resume_request_id) {
      const pauseRow = matches[0];
      const auditClaim = await setWorkPauseState(stateEntity, state, 'pausing', requestId, {
        work_pause_pending_started_at: state.work_pause_pending_started_at || pauseRow.started_at,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_start', pauseRow, target, actor, requestId, entryId: state.active_entry_id });
      await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_resume', pauseRow, target, actor, requestId: String(pauseRow.resume_request_id), entryId: state.active_entry_id });
      const recovered = await setWorkPauseState(stateEntity, auditClaim, 'pausing', requestId, {
        work_pause_status: 'working', active_work_pause_id: null,
        last_work_pause_request_id: String(pauseRow.resume_request_id || requestId),
        work_pause_pending_started_at: null,
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: 'Recovered stale Work Pause start state after the matching pause had already been resumed',
          details: { work_pause_id: pauseRow.id, resume_request_id: pauseRow.resume_request_id },
        });
        return recovered;
      }
    }
    if (matches.length === 0 && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setWorkPauseState(stateEntity, state, 'pausing', requestId, {
        work_pause_status: 'working', active_work_pause_id: null, work_pause_pending_started_at: null,
      });
      if (rolledBack) return rolledBack;
    }
  }

  if (pauseStatus === 'resuming') {
    const pauseRow = state.active_work_pause_id ? await workPauseEntity.get(state.active_work_pause_id).catch(() => null) : null;
    if (pauseRow?.id && pauseRow.status === 'completed' && String(pauseRow.resume_request_id || '') === requestId) {
      const auditClaim = await setWorkPauseState(stateEntity, state, 'resuming', requestId, {
        work_pause_pending_started_at: state.work_pause_pending_started_at || pauseRow.resumed_at,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_resume', pauseRow, target, actor, requestId, entryId: state.active_entry_id });
      const recovered = await setWorkPauseState(stateEntity, auditClaim, 'resuming', requestId, {
        work_pause_status: 'working', active_work_pause_id: null, work_pause_pending_started_at: null,
      });
      if (recovered) return recovered;
    }
    if (pauseRow?.id && pauseRow.status === 'active' && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setWorkPauseState(stateEntity, state, 'resuming', requestId, {
        work_pause_status: 'paused', active_work_pause_id: pauseRow.id, work_pause_pending_started_at: null,
      });
      if (rolledBack) return rolledBack;
    }
  }

  return freshState(stateEntity, state.id);
}

async function ensureLaborStartAudit({ auditEntity, action, segment, target, actor, requestId, entryId }: any) {
  if (!segment?.id || !['labor_start', 'labor_change'].includes(action)) throw new Error('A valid Current Work segment is required before its start/change audit can be confirmed.');
  return ensureActionAudit(auditEntity, {
    action, outcome: 'confirmed', user_email: target.email,
    user_name: target.full_name || target.email, actor_email: asEmail(actor.email), actor_role: actor.role,
    authentication_method: authenticationMethodFor(actor, target), server_timestamp: segment.started_at,
    request_id: requestId, time_entry_id: entryId,
    details: {
      labor_segment_id: segment.id,
      activity_type: segment.activity_type,
      work_order_id: segment.work_order_id || null,
      work_order_title: segment.work_order_title || '',
      client_name: segment.client_name || '',
    },
  }, action === 'labor_change' ? 'Current Work change audit' : 'Current Work start audit');
}

function laborStatusOf(state: any) {
  const value = String(state?.labor_status || 'idle');
  return ['idle', 'starting', 'changing', 'stopping'].includes(value) ? value : 'idle';
}

async function setLaborState(stateEntity: any, state: any, expectedLaborStatus: string, expectedRequestId: string | null, nextFields: any) {
  const query: any = {
    id: state.id,
    updated_date: state.updated_date,
    status: 'clocked_in',
    labor_status: expectedLaborStatus,
  };
  if (expectedRequestId !== null) query.last_labor_request_id = expectedRequestId;
  const result = await stateEntity.updateMany(query, { $set: nextFields });
  if (!result || typeof result.updated !== 'number') throw new Error('Time Clock Current Work state update could not be verified.');
  if (result.updated !== 1) return null;
  return freshState(stateEntity, state.id);
}

async function recoverLaborTransition({ stateEntity, laborEntity, auditEntity, state, target, actor }: any) {
  if (state?.status !== 'clocked_in') return state;
  const laborStatus = laborStatusOf(state);
  if (laborStatus === 'idle') return state;
  const requestId = String(state.last_labor_request_id || '');
  const started = state.labor_pending_started_at ? new Date(state.labor_pending_started_at) : null;
  const ageMs = started && Number.isFinite(started.getTime()) ? Date.now() - started.getTime() : Number.POSITIVE_INFINITY;
  const base = { user_email: target.email, time_entry_id: state.active_entry_id };

  if (laborStatus === 'starting' || laborStatus === 'changing') {
    const startedRows = requestId ? await laborEntity.filter({ ...base, start_request_id: requestId }) : [];
    if (!Array.isArray(startedRows)) throw new Error('Current Work start recovery lookup did not return a record list.');
    if (startedRows.length > 1) throw new Error('Current Work start recovery is ambiguous.');
    if (startedRows.length === 1) {
      const auditClaim = await setLaborState(stateEntity, state, laborStatus, requestId, {
        labor_pending_started_at: state.labor_pending_started_at || startedRows[0].started_at,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      if (laborStatus === 'changing') {
        const endedRows = await laborEntity.filter({ ...base, end_request_id: requestId });
        if (!Array.isArray(endedRows)) throw new Error('Current Work change recovery lookup did not return a record list.');
        if (endedRows.length > 1) throw new Error('Current Work change recovery is ambiguous.');
        if (endedRows.length === 1) {
          await ensureLaborStopAudit({
            auditEntity, entry: { id: state.active_entry_id }, target, actor, actorEmail: asEmail(actor.email),
            requestId, endReason: endedRows[0].end_reason || 'change_work', segment: endedRows[0],
          });
        }
      }
      await ensureLaborStartAudit({
        auditEntity,
        action: laborStatus === 'changing' ? 'labor_change' : 'labor_start',
        segment: startedRows[0], target, actor, requestId, entryId: state.active_entry_id,
      });
      const recovered = await setLaborState(stateEntity, auditClaim, laborStatus, requestId, {
        labor_status: 'idle', labor_pending_started_at: null, labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: laborStatus === 'changing' ? 'Recovered interrupted Current Work change finalization' : 'Recovered interrupted Current Work start finalization',
          details: { labor_segment_id: startedRows[0].id },
        });
        return recovered;
      }
    }

    if (laborStatus === 'changing' && requestId) {
      const endedRows = await laborEntity.filter({ ...base, end_request_id: requestId });
      if (!Array.isArray(endedRows)) throw new Error('Current Work change recovery lookup did not return a record list.');
      if (endedRows.length > 1) throw new Error('Current Work change recovery is ambiguous.');
      if (endedRows.length === 1 && ageMs <= 5 * 60 * 1000) return state;
    }

    if (startedRows.length === 0 && ageMs > 5 * 60 * 1000) {
      let rollbackClaim = state;
      if (laborStatus === 'changing' && requestId) {
        const endedRows = await laborEntity.filter({ ...base, end_request_id: requestId });
        if (!Array.isArray(endedRows)) throw new Error('Current Work abandoned-change audit lookup did not return a record list.');
        if (endedRows.length > 1) throw new Error('Current Work abandoned-change recovery is ambiguous.');
        if (endedRows.length === 1) {
          rollbackClaim = await setLaborState(stateEntity, state, laborStatus, requestId, {
            labor_pending_started_at: state.labor_pending_started_at || endedRows[0].ended_at,
          });
          if (!rollbackClaim) return freshState(stateEntity, state.id);
          await ensureLaborStopAudit({
            auditEntity, entry: { id: state.active_entry_id }, target, actor, actorEmail: asEmail(actor.email),
            requestId, endReason: endedRows[0].end_reason || 'change_work', segment: endedRows[0],
          });
        }
      }
      const rolledBack = await setLaborState(stateEntity, rollbackClaim, laborStatus, requestId || null, {
        labor_status: 'idle', labor_pending_started_at: null, labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (rolledBack) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: laborStatus === 'changing'
            ? 'Rolled back abandoned Current Work change transition; any already-ended segment remains preserved'
            : 'Rolled back abandoned Current Work start transition with no labor segment',
        });
        return rolledBack;
      }
    }
  }

  if (laborStatus === 'stopping') {
    const endedRows = requestId ? await laborEntity.filter({ ...base, end_request_id: requestId }) : [];
    if (!Array.isArray(endedRows)) throw new Error('Current Work stop recovery lookup did not return a record list.');
    if (endedRows.length > 1) throw new Error('Current Work stop recovery is ambiguous.');
    if (endedRows.length === 1 && endedRows[0]?.status === 'completed') {
      const auditClaim = await setLaborState(stateEntity, state, 'stopping', requestId, {
        labor_pending_started_at: state.labor_pending_started_at || endedRows[0].ended_at,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      await ensureLaborStopAudit({
        auditEntity, entry: { id: state.active_entry_id }, target, actor, actorEmail: asEmail(actor.email),
        requestId, endReason: endedRows[0].end_reason || 'manual_stop', segment: endedRows[0],
      });
      const recovered = await setLaborState(stateEntity, auditClaim, 'stopping', requestId, {
        labor_status: 'idle', labor_pending_started_at: null, labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
          request_id: requestId, time_entry_id: state.active_entry_id,
          reason: 'Recovered interrupted Current Work stop finalization', details: { labor_segment_id: endedRows[0].id },
        });
        return recovered;
      }
    }
    if (endedRows.length === 0 && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setLaborState(stateEntity, state, 'stopping', requestId || null, {
        labor_status: 'idle', labor_pending_started_at: null, labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (rolledBack) return rolledBack;
    }
  }

  return freshState(stateEntity, state.id);
}

const LABOR_ACTIVITY_TYPES = new Set(['fabrication','cnc','laser','paint','welding','electrical','installation','service','survey','design','permitting','estimating','admin','shop','travel','other']);

async function laborSummaryForEntry(laborEntity: any, entryId: string, userEmail: string) {
  const rows = await laborEntity.filter({ time_entry_id: entryId, user_email: userEmail, status: 'completed' });
  if (!Array.isArray(rows)) throw new Error('Completed labor lookup did not return a record list.');
  const total = rows.reduce((sum: number, row: any) => sum + Math.max(0, Math.round(Number(row?.duration_minutes || 0))), 0);
  return { count: rows.length, total_minutes: total };
}

function laborActivityLabel(value: string) {
  const labels: Record<string, string> = {
    fabrication: 'Fabrication', cnc: 'CNC', laser: 'Laser', paint: 'Paint', welding: 'Welding',
    electrical: 'Electrical', installation: 'Installation', service: 'Service', survey: 'Survey',
    design: 'Design', permitting: 'Permitting', estimating: 'Estimating', admin: 'Admin',
    shop: 'Shop', travel: 'Travel', other: 'Other',
  };
  return labels[String(value || '').trim()] || 'Other';
}

async function laborAllocationPreviewForEntry(laborEntity: any, entryId: string, userEmail: string, serverNow = new Date()) {
  const rows = await laborEntity.filter({ time_entry_id: entryId, user_email: userEmail });
  if (!Array.isArray(rows)) throw new Error('Labor allocation preview lookup did not return a record list.');
  const grouped = new Map<string, any>();
  let trackedMinutes = 0;

  for (const row of rows) {
    let minutes = 0;
    if (row.status === 'completed') {
      minutes = Math.max(0, Math.round(Number(row.duration_minutes || 0)));
    } else if (row.status === 'active' && row.started_at) {
      const startedMs = new Date(row.started_at).getTime();
      if (Number.isFinite(startedMs) && serverNow.getTime() >= startedMs) {
        minutes = Math.max(0, Math.floor((serverNow.getTime() - startedMs) / 60000));
      }
    }
    if (minutes <= 0) continue;
    trackedMinutes += minutes;

    const workOrderId = String(row.work_order_id || '').trim();
    const activityType = String(row.activity_type || 'other').trim();
    const key = workOrderId ? `wo:${workOrderId}` : `activity:${activityType}`;
    const existing = grouped.get(key) || (workOrderId ? {
      work_order_id: workOrderId,
      work_order_title: String(row.work_order_title || ''),
      client_name: String(row.client_name || ''),
      hours: 0,
      minutes: 0,
      is_inhouse: false,
      inhouse_task: '',
      suggested_from_current_work: true,
    } : {
      work_order_id: '',
      work_order_title: 'Tracked Activity',
      client_name: 'Internal',
      hours: 0,
      minutes: 0,
      is_inhouse: true,
      inhouse_task: laborActivityLabel(activityType),
      suggested_from_current_work: true,
    });
    existing.minutes += minutes;
    existing.hours = existing.minutes / 60;
    grouped.set(key, existing);
  }

  return {
    generated_at: serverNow.toISOString(),
    segment_count: rows.length,
    tracked_minutes: trackedMinutes,
    suggested_allocations: [...grouped.values()],
  };
}

async function activeLaborForEntry(laborEntity: any, entryId: string, userEmail: string) {
  const rows = await laborEntity.filter({ time_entry_id: entryId, user_email: userEmail, status: 'active' });
  if (!Array.isArray(rows)) throw new Error('Active labor lookup did not return a record list.');
  if (rows.length > 1) throw new Error('Multiple active labor segments were found. Admin review is required.');
  return rows[0] || null;
}

async function ensureLaborStopAudit({ auditEntity, entry, target, actor, actorEmail, requestId, endReason, segment }: any) {
  if (!segment?.id || segment.status !== 'completed') throw new Error('Completed Current Work labor is required before its stop audit can be confirmed.');
  return ensureActionAudit(auditEntity, {
    action: 'labor_stop', outcome: 'confirmed',
    user_email: target.email, user_name: target.full_name || target.email,
    actor_email: actorEmail, actor_role: actor.role,
    authentication_method: authenticationMethodFor(actor, target), server_timestamp: segment.ended_at,
    request_id: requestId, time_entry_id: entry.id, reason: endReason || segment.end_reason || 'manual_stop',
    details: { labor_segment_id: segment.id, activity_type: segment.activity_type, work_order_id: segment.work_order_id || null, duration_minutes: segment.duration_minutes },
  }, 'Current Work stop audit');
}

async function closeActiveLaborSegment({ laborEntity, auditEntity, entry, target, actor, actorEmail, requestId, endReason, officialEnd, deferAudit = false }: any) {
  const prior = await uniqueRow(laborEntity, { user_email: target.email, time_entry_id: entry.id, end_request_id: requestId }, 'Labor-end request');
  if (prior?.id && prior.status === 'completed') {
    if (!deferAudit) await ensureLaborStopAudit({ auditEntity, entry, target, actor, actorEmail, requestId, endReason: endReason || prior.end_reason, segment: prior });
    return prior;
  }
  let active = await activeLaborForEntry(laborEntity, entry.id, target.email);
  if (!active?.id) return null;
  const endAt = officialEnd || new Date().toISOString();
  const startedMs = new Date(active.started_at).getTime();
  const endedMs = new Date(endAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) throw new Error('Stored labor timestamps are invalid.');
  const durationMinutes = Math.max(0, Math.floor((endedMs - startedMs) / 60000));
  const updated = await laborEntity.updateMany(
    { id: active.id, updated_date: active.updated_date, status: 'active', user_email: target.email, time_entry_id: entry.id },
    { $set: { ended_at: endAt, duration_minutes: durationMinutes, status: 'completed', end_request_id: requestId, end_reason: endReason } },
  );
  if (!updated || updated.updated !== 1) {
    const fresh = await laborEntity.get(active.id).catch(() => null);
    if (!(fresh?.status === 'completed' && String(fresh.end_request_id || '') === requestId)) throw new Error('Active labor segment changed before it could be ended safely.');
    active = fresh;
  } else {
    active = await laborEntity.get(active.id);
  }
  if (!deferAudit) await ensureLaborStopAudit({ auditEntity, entry, target, actor, actorEmail, requestId, endReason, segment: active });
  return active;
}

async function recoverTransition({ stateEntity, entryEntity, auditEntity, laborEntity, state, target, actor }: any) {
  if (!['clocking_in', 'clocking_out'].includes(String(state?.status || ''))) return state;
  const requestId = String(state.last_request_id || '');
  const started = state.pending_started_at ? new Date(state.pending_started_at) : null;
  const ageMs = started && Number.isFinite(started.getTime()) ? Date.now() - started.getTime() : Number.POSITIVE_INFINITY;

  if (state.status === 'clocking_in') {
    const matches = requestId ? await entryEntity.filter({ user_email: target.email, clock_in_request_id: requestId, archived_test_data: { $ne: true }, archived_admin: { $ne: true } }) : [];
    if (Array.isArray(matches) && matches.length === 1) {
      const entry = matches[0];
      if (entry?.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email) return state;
      const auditClaim = await setState(stateEntity, state, 'clocking_in', requestId, {
        pending_started_at: state.pending_started_at || entry.clock_in,
      });
      if (!auditClaim) return freshState(stateEntity, state.id);
      await ensureClockInAudit({ auditEntity, entry, target, actor, requestId });
      const recovered = await setState(stateEntity, auditClaim, 'clocking_in', requestId, {
        status: 'clocked_in',
        active_entry_id: entry.id,
        last_action_at: entry.clock_in,
        pending_started_at: null,
        break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
        work_pause_status: 'working', active_work_pause_id: null, last_work_pause_request_id: null, work_pause_pending_started_at: null,
        labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
        labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: 'Recovered interrupted clock-in after confirming the required Clock In audit',
        });
        return recovered;
      }
    }
    if ((!Array.isArray(matches) || matches.length === 0) && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setState(stateEntity, state, 'clocking_in', requestId, {
        status: 'clocked_out', active_entry_id: null, pending_started_at: null,
        break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
        work_pause_status: 'working', active_work_pause_id: null, last_work_pause_request_id: null, work_pause_pending_started_at: null,
        labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
        labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (rolledBack) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId,
          reason: 'Rolled back abandoned clock-in transition with no TimeEntry',
        });
        return rolledBack;
      }
    }
  }

  if (state.status === 'clocking_out') {
    const entry = state.active_entry_id ? await entryEntity.get(state.active_entry_id).catch(() => null) : null;
    if (entry?.id && entry.archived_admin && requestId) {
      const archiveAudits = await auditEntity.filter({ action: 'admin_archive', request_id: requestId, time_entry_id: entry.id });
      if (!Array.isArray(archiveAudits)) throw new Error('Administrative archive recovery audit lookup did not return a record list.');
      if (archiveAudits.length > 1) throw new Error('Administrative archive recovery is ambiguous because multiple audit records exist.');
      const archiveAudit = archiveAudits[0] || null;
      if (!archiveAudit || !['pending', 'confirmed', 'recovered'].includes(String(archiveAudit.outcome || ''))) return state;
      if (archiveAudit.outcome === 'pending' && ageMs <= 5000) return state;

      const recoveryClaim = await setState(stateEntity, state, 'clocking_out', requestId, {
        pending_started_at: state.pending_started_at || entry.archived_at || new Date().toISOString(),
      });
      if (!recoveryClaim) return freshState(stateEntity, state.id);
      state = recoveryClaim;

      const archiveActor = {
        email: asEmail(archiveAudit.actor_email) || target.email,
        role: String(archiveAudit.actor_role || 'admin'),
      };
      const archiveEnd = entry.archived_at || state.pending_started_at || new Date().toISOString();
      const activeLabor = await activeLaborForEntry(laborEntity, entry.id, target.email);
      if (activeLabor?.id) {
        const laborStartMs = new Date(activeLabor.started_at).getTime();
        const archiveEndMs = new Date(archiveEnd).getTime();
        if (!Number.isFinite(laborStartMs) || !Number.isFinite(archiveEndMs) || archiveEndMs < laborStartMs) {
          throw new Error('Archived shift ends before its active Current Work segment began. Admin review is required.');
        }
        await closeActiveLaborSegment({
          laborEntity, auditEntity, entry, target, actor: archiveActor,
          actorEmail: asEmail(archiveActor.email), requestId,
          endReason: 'admin_archive', officialEnd: archiveEnd,
        });
      }

      if (archiveAudit.outcome === 'pending') {
        const auditFinalized = await auditEntity.updateMany(
          { id: archiveAudit.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id },
          { $set: {
            outcome: 'confirmed', server_timestamp: new Date().toISOString(),
            details: {
              ...(archiveAudit.details || {}),
              archived_entry: entryAuditSnapshot(entry),
              recovered_after_entry_save: true,
            },
          } },
        );
        if (!auditFinalized || auditFinalized.updated !== 1) {
          const freshAudit = await auditEntity.get(archiveAudit.id).catch(() => null);
          if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) return state;
        }
      }

      const recovered = await setState(stateEntity, state, 'clocking_out', requestId, {
        status: 'clocked_out', active_entry_id: null, last_action_at: archiveEnd, pending_started_at: null,
        break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
        work_pause_status: 'working', active_work_pause_id: null, last_work_pause_request_id: null, work_pause_pending_started_at: null,
        labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
        labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: 'Recovered interrupted administrative archive after labor and audit reconciliation',
          details: { admin_archive_audit_id: archiveAudit.id },
        });
        return recovered;
      }
    }

    if (entry?.id && entry.status === 'clocked_out' && entry.clock_source === 'admin_correction' && String(entry.clock_out_request_id || '') === requestId) {
      const correctionAudits = await auditEntity.filter({ action: 'admin_correction', request_id: requestId, time_entry_id: entry.id });
      if (!Array.isArray(correctionAudits)) throw new Error('Administrative correction recovery audit lookup did not return a record list.');
      if (correctionAudits.length > 1) throw new Error('Administrative correction recovery is ambiguous because multiple audit records exist.');
      const correctionAudit = correctionAudits[0] || null;
      if (!correctionAudit || !['pending', 'confirmed', 'recovered'].includes(String(correctionAudit.outcome || ''))) return state;
      if (correctionAudit.outcome === 'pending' && ageMs <= 5000) return state;

      const recoveryClaim = await setState(stateEntity, state, 'clocking_out', requestId, {
        pending_started_at: state.pending_started_at || entry.clock_out || new Date().toISOString(),
      });
      if (!recoveryClaim) return freshState(stateEntity, state.id);
      state = recoveryClaim;

      const correctionActor = {
        email: asEmail(correctionAudit.actor_email) || target.email,
        role: String(correctionAudit.actor_role || 'admin'),
      };
      const activeLabor = await activeLaborForEntry(laborEntity, entry.id, target.email);
      if (activeLabor?.id) {
        const laborStartMs = new Date(activeLabor.started_at).getTime();
        const correctedEndMs = new Date(entry.clock_out).getTime();
        if (!Number.isFinite(laborStartMs) || !Number.isFinite(correctedEndMs) || correctedEndMs < laborStartMs) {
          throw new Error('Corrected clock-out is earlier than active Current Work start. Admin review is required.');
        }
        await closeActiveLaborSegment({
          laborEntity, auditEntity, entry, target, actor: correctionActor,
          actorEmail: asEmail(correctionActor.email), requestId,
          endReason: 'admin_correction', officialEnd: entry.clock_out,
        });
      }

      if (correctionAudit.outcome === 'pending') {
        const auditFinalized = await auditEntity.updateMany(
          { id: correctionAudit.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id },
          { $set: {
            outcome: 'confirmed', server_timestamp: new Date().toISOString(),
            details: {
              ...(correctionAudit.details || {}),
              corrected: entryAuditSnapshot(entry),
              recovered_after_entry_save: true,
            },
          } },
        );
        if (!auditFinalized || auditFinalized.updated !== 1) {
          const freshAudit = await auditEntity.get(correctionAudit.id).catch(() => null);
          if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) return state;
        }
      }

      const recovered = await setState(stateEntity, state, 'clocking_out', requestId, {
        status: 'clocked_out', active_entry_id: null, last_action_at: entry.clock_out, pending_started_at: null,
        break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
        work_pause_status: 'working', active_work_pause_id: null, last_work_pause_request_id: null, work_pause_pending_started_at: null,
        labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
        labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: 'Recovered interrupted active-shift administrative correction after labor and audit reconciliation',
          details: { admin_correction_audit_id: correctionAudit.id },
        });
        return recovered;
      }
    }
    if (entry?.id && entry.status === 'clocked_out' && String(entry.clock_out_request_id || '') === requestId) {
      let clockOutAudit = await clockOutAuditForRequest(auditEntity, requestId, entry.id);
      const statePayloadHash = String(state.last_request_payload_hash || '');

      if (!clockOutAudit && statePayloadHash && ageMs > 5000) {
        const auditRecoveryClaim = await setState(stateEntity, state, 'clocking_out', requestId, {
          pending_started_at: state.pending_started_at || new Date().toISOString(),
        });
        if (!auditRecoveryClaim) return freshState(stateEntity, state.id);
        state = auditRecoveryClaim;

        const reconstructedSubmission = clockOutSubmissionForHash({
          lunch_minutes: entry.lunch_minutes,
          job_allocations: entry.job_allocations,
          notes: entry.notes,
        });
        const reconstructedHash = await payloadHash(reconstructedSubmission);
        if (!constantTimeEqual(statePayloadHash, reconstructedHash)) {
          throw new Error('Stored clock-out data does not match the payload bound to the interrupted request.');
        }
        const recoveryAuditSaved = await audit(auditEntity, {
          action: 'clock_out', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: entry.clock_out, request_id: requestId, time_entry_id: entry.id,
          reason: 'Recovered missing Clock Out audit from the saved authoritative TimeEntry during status recovery',
          details: {
            payload_hash: reconstructedHash,
            submitted_lunch_minutes: reconstructedSubmission.lunch_minutes,
            lunch_minutes: Number(entry.lunch_minutes || 0),
            total_hours: Number(entry.total_hours || 0),
            tracked_break_minutes: Number(entry.tracked_break_minutes || 0),
            tracked_unpaid_break_minutes: Number(entry.tracked_unpaid_break_minutes || 0),
            tracked_work_pause_minutes: Number(entry.tracked_work_pause_minutes || 0),
            recovered_after_entry_save: true,
            recovered_via_status: true,
          },
        });
        if (recoveryAuditSaved) clockOutAudit = await clockOutAuditForRequest(auditEntity, requestId, entry.id);
      }

      const auditReady = clockOutAudit && ['confirmed', 'recovered', 'reused'].includes(String(clockOutAudit.outcome || ''));
      if (!auditReady) return state;
      const auditPayloadHash = String(clockOutAudit?.details?.payload_hash || '');
      if (statePayloadHash && auditPayloadHash && !constantTimeEqual(statePayloadHash, auditPayloadHash)) {
        throw new Error('Clock-out state and audit payload hashes do not match.');
      }
      const recovered = await setState(stateEntity, state, 'clocking_out', requestId, {
        status: 'clocked_out', active_entry_id: null, last_action_at: entry.clock_out, pending_started_at: null,
        break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
        work_pause_status: 'working', active_work_pause_id: null, last_work_pause_request_id: null, work_pause_pending_started_at: null,
        labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
        labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: 'Recovered interrupted clock-out finalization after confirmed clock-out audit',
        });
        return recovered;
      }
    }
    if (entry?.id && entry.status === 'clocked_in' && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setState(stateEntity, state, 'clocking_out', requestId, {
        status: 'clocked_in', active_entry_id: entry.id, pending_started_at: null, last_request_payload_hash: null,
        break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
        work_pause_status: 'working', active_work_pause_id: null, last_work_pause_request_id: null, work_pause_pending_started_at: null,
        labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
        labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (rolledBack) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: 'Rolled back abandoned clock-out transition before TimeEntry update',
        });
        return rolledBack;
      }
    }
  }

  return freshState(stateEntity, state.id);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const sessionToken = String(body?.session_token || '').trim();
    const badgeCode = String(body?.badge_code || '').trim();
    const targetEmail = asEmail(body?.target_email);
    const requestId = validRequestId(body?.request_id);
    const secret = Deno.env.get('SESSION_SIGNING_SECRET') || '';

    const authorized = base44.asServiceRole.entities.AuthorizedEmail;
    const entryEntity = base44.asServiceRole.entities.TimeEntry;
    const stateEntity = base44.asServiceRole.entities.TimeClockEmployeeState;
    const auditEntity = base44.asServiceRole.entities.TimeClockAudit;
    const badgeEntity = base44.asServiceRole.entities.TimeClockBadge;
    const correctionRequestEntity = base44.asServiceRole.entities.TimeClockCorrectionRequest;
    const breakEntity = base44.asServiceRole.entities.TimeClockBreak;
    const workPauseEntity = base44.asServiceRole.entities.TimeClockWorkPause;
    const payPeriodEntity = base44.asServiceRole.entities.TimeClockPayPeriod;
    const laborEntity = base44.asServiceRole.entities.TimeClockLaborSegment;
    const workOrderEntity = base44.asServiceRole.entities.WorkOrder;
    const timeOffRequestEntity = base44.asServiceRole.entities.TimeOffRequest;

    let actor: any = await verifySessionToken(sessionToken, secret, authorized);
    let target: any = null;

    if (actor?.id) {
      const actorEmail = asEmail(actor.email);
      const wantedEmail = targetEmail || actorEmail;
      if (!wantedEmail) return Response.json({ success: false, error: 'Employee identity is required.' }, { status: 400 });
      if (wantedEmail !== actorEmail && actor.role !== 'admin') {
        return Response.json({ success: false, error: 'Admin access is required to clock another employee.' }, { status: 403 });
      }
      target = await uniqueRow(authorized, { email: wantedEmail }, 'Authorized employee');
    } else if (badgeCode) {
      const badgeAuth = await verifyBadgeCredential(badgeCode, badgeEntity, authorized);
      if (!badgeAuth?.target?.id) {
        return Response.json({ success: false, error: 'Time Clock badge is invalid, expired, or has been replaced.' }, { status: 401 });
      }
      target = badgeAuth.target;
      target.email = asEmail(target.email);
      if (targetEmail && targetEmail !== target.email) {
        return Response.json({ success: false, error: 'Badge identity does not match the requested employee.' }, { status: 403 });
      }
      actor = { id: `badge:${target.id}`, email: target.email, role: 'badge' };
    } else {
      return Response.json({ success: false, error: 'A valid signed-in session or Time Clock badge is required.' }, { status: 401 });
    }

    if (!target?.id) return Response.json({ success: false, error: 'Authorized employee not found.' }, { status: 404 });
    target.email = asEmail(target.email);
    const actorEmail = asEmail(actor.email);

    let state = await ensureState(stateEntity, target);
    state = await recoverTransition({ stateEntity, entryEntity, auditEntity, laborEntity, state, target, actor });
    state = await recoverBreakTransition({ stateEntity, breakEntity, auditEntity, state, target, actor });
    state = await recoverWorkPauseTransition({ stateEntity, workPauseEntity, auditEntity, state, target, actor });
    state = await recoverLaborTransition({ stateEntity, laborEntity, auditEntity, state, target, actor });
    state = await recoverCompletedClockInMutationGate(stateEntity, entryEntity, auditEntity, state, target);

    if (action === 'status') {
      if (state.status === 'clocked_in' && state.active_entry_id) {
        const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
        if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
          return Response.json({ success: false, error: 'Stored clock state does not match the active TimeEntry. Admin review is required.' }, { status: 409 });
        }
        const currentBreakStatus = breakStatusOf(state);
        const currentWorkPauseStatus = workPauseStatusOf(state);
        const currentLaborStatus = laborStatusOf(state);
        const activeBreak = state.active_break_id ? await breakEntity.get(state.active_break_id).catch(() => null) : null;
        const activeWorkPause = state.active_work_pause_id ? await workPauseEntity.get(state.active_work_pause_id).catch(() => null) : null;
        const safeActiveBreak = activeBreak?.id && asEmail(activeBreak.user_email) === target.email && activeBreak.time_entry_id === entry.id ? activeBreak : null;
        const safeActiveWorkPause = activeWorkPause?.id && asEmail(activeWorkPause.user_email) === target.email && activeWorkPause.time_entry_id === entry.id ? activeWorkPause : null;
        const breakSummary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
        const workPauseSummary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
        const laborSummary = await laborSummaryForEntry(laborEntity, entry.id, target.email);

        const shiftSubtransition = ['starting_break', 'ending_break'].includes(currentBreakStatus)
          ? {
              transition: currentBreakStatus === 'starting_break' ? 'break_start' : 'break_end',
              transition_started_at: state.break_pending_started_at || null,
            }
          : ['pausing', 'resuming'].includes(currentWorkPauseStatus)
            ? {
                transition: currentWorkPauseStatus === 'pausing' ? 'work_pause_start' : 'work_pause_resume',
                transition_started_at: state.work_pause_pending_started_at || null,
              }
            : currentLaborStatus !== 'idle'
              ? {
                  transition: currentLaborStatus === 'starting' ? 'labor_start' : currentLaborStatus === 'changing' ? 'labor_change' : 'labor_stop',
                  transition_started_at: state.labor_pending_started_at || null,
                }
              : null;

        if (shiftSubtransition) {
          return Response.json({
            success: true, status: 'clocked_in', entry, user: publicEmployee(target),
            ...shiftSubtransition,
            break_status: currentBreakStatus, active_break: safeActiveBreak, break_summary: breakSummary,
            work_pause_allowed: target.can_work_pause === true,
            employment_type: target.employment_type || 'hourly',
            work_pause_status: currentWorkPauseStatus,
            active_work_pause: safeActiveWorkPause,
            work_pause_summary: workPauseSummary,
            labor_status: currentLaborStatus,
            active_labor: null,
            labor_summary: laborSummary,
          });
        }

        if (currentBreakStatus === 'on_break') {
          if (!activeBreak?.id || activeBreak.status !== 'active' || asEmail(activeBreak.user_email) !== target.email || activeBreak.time_entry_id !== entry.id) {
            return Response.json({ success: false, error: 'Stored break state does not match the active break record. Admin review is required.' }, { status: 409 });
          }
        } else if (state.active_break_id || activeBreak?.id) {
          return Response.json({ success: false, error: 'Stored break state contains an unexpected active break. Admin review is required.' }, { status: 409 });
        }
        if (currentWorkPauseStatus === 'paused') {
          if (!activeWorkPause?.id || activeWorkPause.status !== 'active' || asEmail(activeWorkPause.user_email) !== target.email || activeWorkPause.time_entry_id !== entry.id) {
            return Response.json({ success: false, error: 'Stored Work Pause state does not match the active pause record. Admin review is required.' }, { status: 409 });
          }
        } else if (state.active_work_pause_id || activeWorkPause?.id) {
          return Response.json({ success: false, error: 'Stored Work Pause state contains an unexpected active pause. Admin review is required.' }, { status: 409 });
        }
        const activeLabor = await activeLaborForEntry(laborEntity, entry.id, target.email);
        return Response.json({
          success: true, status: 'clocked_in', entry, user: publicEmployee(target),
          break_status: currentBreakStatus, active_break: activeBreak || null, break_summary: breakSummary,
          work_pause_allowed: target.can_work_pause === true,
          employment_type: target.employment_type || 'hourly',
          work_pause_status: currentWorkPauseStatus,
          active_work_pause: activeWorkPause || null,
          work_pause_summary: workPauseSummary,
          active_labor: activeLabor || null,
          labor_summary: laborSummary,
        });
      }
      if (state.status === 'clocked_out') return Response.json({
        success: true, status: 'clocked_out', entry: null, user: publicEmployee(target),
        break_status: 'working', active_break: null, break_summary: { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
        work_pause_allowed: target.can_work_pause === true,
        employment_type: target.employment_type || 'hourly',
        work_pause_status: 'working', active_work_pause: null, work_pause_summary: { count: 0, total_minutes: 0 },
        active_labor: null, labor_summary: { count: 0, total_minutes: 0 },
      });
      if (['clocking_in', 'clocking_out'].includes(state.status)) {
        return Response.json({
          success: true,
          status: state.status,
          transition: state.status === 'clocking_out' ? 'clock_out' : 'clock_in',
          transition_started_at: state.pending_started_at || null,
          user: publicEmployee(target),
          entry: null,
          break_status: 'working', active_break: null, break_summary: { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
          work_pause_allowed: target.can_work_pause === true,
          employment_type: target.employment_type || 'hourly',
          work_pause_status: 'working', active_work_pause: null, work_pause_summary: { count: 0, total_minutes: 0 },
          active_labor: null, labor_summary: { count: 0, total_minutes: 0 },
        });
      }
      return Response.json({ success: false, error: 'A Time Clock action is still in progress. Retry shortly.' }, { status: 409 });
    }

    if (action === 'labor_allocation_preview') {
      if (state.status !== 'clocked_in' || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Employee must be clocked in to preview Current Work allocations.' }, { status: 409 });
      }
      if (actor.role !== 'badge' && actorEmail !== target.email) {
        return Response.json({ success: false, error: 'Employees can only preview allocations for their own active shift.' }, { status: 403 });
      }
      if (breakStatusOf(state) !== 'working' || state.active_break_id) {
        return Response.json({ success: false, error: 'End the active break before refreshing Clock Out reconciliation.' }, { status: 409 });
      }
      if (workPauseStatusOf(state) !== 'working' || state.active_work_pause_id) {
        return Response.json({ success: false, error: 'Resume Work before refreshing Clock Out reconciliation.' }, { status: 409 });
      }
      if (laborStatusOf(state) !== 'idle') {
        return Response.json({ success: false, error: 'Current Work is changing. Retry Clock Out reconciliation after the server confirms that action.' }, { status: 409 });
      }
      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }
      await activeLaborForEntry(laborEntity, entry.id, target.email);
      const serverNow = new Date();
      const clockInMs = new Date(entry.clock_in).getTime();
      if (!Number.isFinite(clockInMs) || serverNow.getTime() < clockInMs) {
        return Response.json({ success: false, error: 'The stored clock-in timestamp is invalid.' }, { status: 409 });
      }
      const breakSummary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
      const workPauseSummary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
      const preview = await laborAllocationPreviewForEntry(laborEntity, entry.id, target.email, serverNow);
      preview.elapsed_minutes = Math.max(0, Math.floor((serverNow.getTime() - clockInMs) / 60000));
      preview.tracked_unpaid_minutes = breakSummary.unpaid_minutes;
      preview.work_pause_minutes = workPauseSummary.total_minutes;
      return Response.json({ success: true, status: 'clocked_in', entry, preview, user: publicEmployee(target) });
    }

    if (!requestId) return Response.json({ success: false, error: 'A valid request id is required.' }, { status: 400 });

    if (action === 'pay_period_create') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Administrator access is required to create pay periods.' }, { status: 403 });
      const label = String(body?.label || '').trim();
      const startDate = validDateKey(body?.start_date);
      const endDate = validDateKey(body?.end_date);
      if (label.length < 2 || label.length > 100) return Response.json({ success: false, error: 'Pay period label must be between 2 and 100 characters.' }, { status: 400 });
      if (!startDate || !endDate || startDate > endDate) return Response.json({ success: false, error: 'A valid pay-period start and end date are required.' }, { status: 400 });

      const createPayloadHash = await payloadHash({ label, start_date: startDate, end_date: endDate });
      const createAudits = await auditEntity.filter({ action: 'pay_period_create', request_id: requestId });
      if (!Array.isArray(createAudits)) throw new Error('Pay-period create audit lookup did not return a record list.');
      if (createAudits.length > 1) return Response.json({ success: false, error: 'This pay-period create request has multiple audit records. Admin investigation is required.' }, { status: 409 });
      let createIntent = createAudits[0] || null;
      const priorCreateHash = String(createIntent?.details?.payload_hash || '');
      if (createIntent && priorCreateHash && !constantTimeEqual(priorCreateHash, createPayloadHash)) {
        return Response.json({ success: false, error: 'This pay-period request id is already bound to different create details. Submit a new create action.' }, { status: 409 });
      }
      if (createIntent && !priorCreateHash) {
        const details = createIntent.details || {};
        if (
          String(details.label || '') !== label ||
          String(details.start_date || '') !== startDate ||
          String(details.end_date || '') !== endDate
        ) {
          return Response.json({ success: false, error: 'This pay-period request id is already bound to different create details. Submit a new create action.' }, { status: 409 });
        }
      }
      if (createIntent?.outcome === 'blocked') return Response.json({ success: false, error: 'This pay-period create request was previously blocked. Submit a new create action.' }, { status: 409 });

      const prior = await payPeriodEntity.filter({ last_request_id: requestId });
      if (!Array.isArray(prior)) throw new Error('Pay period idempotency lookup did not return a record list.');
      if (prior.length > 1) return Response.json({ success: false, error: 'This pay-period request id is ambiguous. Admin investigation is required.' }, { status: 409 });
      if (prior.length === 1) {
        const period = prior[0];
        if (period.label !== label || period.start_date !== startDate || period.end_date !== endDate) {
          return Response.json({ success: false, error: 'This pay-period request id is already associated with different period details.' }, { status: 409 });
        }
        if (!createIntent?.id) {
          return Response.json({ success: false, error: 'The pay period exists but its required create audit is missing. Admin investigation is required.' }, { status: 409 });
        }
        if (createIntent.outcome === 'pending') {
          const recovered = await auditEntity.updateMany(
            { id: createIntent.id, outcome: 'pending', request_id: requestId },
            { $set: {
              outcome: 'confirmed', server_timestamp: new Date().toISOString(),
              details: { ...(createIntent.details || {}), payload_hash: createPayloadHash, label: period.label, start_date: period.start_date, end_date: period.end_date, pay_period_id: period.id, recovered_after_interruption: true },
            } },
          );
          if (!recovered || recovered.updated !== 1) {
            const freshAudit = await auditEntity.get(createIntent.id).catch(() => null);
            if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) {
              return Response.json({ success: false, retry_same_request: true, error: 'The pay period exists but its create audit is still being finalized. Retry the same create action.' }, { status: 409 });
            }
          }
        }
        const finalAudit = await auditEntity.get(createIntent.id).catch(() => null);
        if (!finalAudit || !['confirmed', 'recovered'].includes(String(finalAudit.outcome || ''))) {
          return Response.json({ success: false, retry_same_request: true, error: 'The pay period exists but a confirmed create audit could not be verified yet. Retry the same create action.' }, { status: 409 });
        }
        return Response.json({ success: true, period, audit_id: createIntent.id, reused: true });
      }
      if (createIntent?.outcome === 'confirmed' || createIntent?.outcome === 'recovered') {
        return Response.json({ success: false, error: 'This pay-period create audit is confirmed but the matching period request marker is missing. Admin investigation is required.' }, { status: 409 });
      }

      const existingPeriods = await payPeriodEntity.filter({});
      if (!Array.isArray(existingPeriods)) throw new Error('Pay period lookup did not return a record list.');
      const overlap = existingPeriods.find((period: any) => {
        const existingStart = validDateKey(period.start_date);
        const existingEnd = validDateKey(period.end_date);
        return existingStart && existingEnd && !(endDate < existingStart || startDate > existingEnd);
      });
      if (overlap?.id) {
        if (createIntent?.id && createIntent.outcome === 'pending') await auditEntity.updateMany({ id: createIntent.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
        return Response.json({ success: false, error: `Pay period overlaps ${overlap.label || 'an existing period'} (${overlap.start_date} to ${overlap.end_date}).` }, { status: 409 });
      }

      const now = new Date().toISOString();
      if (!createIntent) {
        createIntent = await auditEntity.create({
          action: 'pay_period_create', outcome: 'pending', user_email: actorEmail,
          user_name: actor.full_name || actorEmail, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: 'session', server_timestamp: now, request_id: requestId,
          reason: `Create pay period ${label}`, details: { payload_hash: createPayloadHash, label, start_date: startDate, end_date: endDate },
        });
      }
      if (!createIntent?.id) throw new Error('Pay-period audit intent could not be persisted. No period was created.');

      const period = await payPeriodEntity.create({
        label, start_date: startDate, end_date: endDate, status: 'open',
        created_at: now, created_by: actorEmail, last_request_id: requestId,
      });
      if (!period?.id) throw new Error('Pay period could not be created.');
      const auditFinalized = await auditEntity.updateMany({ id: createIntent.id, outcome: 'pending', request_id: requestId }, { $set: {
        outcome: 'confirmed', server_timestamp: new Date().toISOString(),
        details: { ...(createIntent.details || {}), payload_hash: createPayloadHash, label, start_date: startDate, end_date: endDate, pay_period_id: period.id },
      } });
      if (!auditFinalized || auditFinalized.updated !== 1) {
        const freshAudit = await auditEntity.get(createIntent.id).catch(() => null);
        if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) {
          return Response.json({ success: false, retry_same_request: true, error: 'The pay period was created but audit finalization was interrupted. Retry the same create action.' }, { status: 409 });
        }
      }
      return Response.json({ success: true, period, audit_id: createIntent.id });
    }

    if (action === 'pay_period_status') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Administrator access is required to manage pay periods.' }, { status: 403 });
      const periodId = String(body?.pay_period_id || '').trim();
      const decision = String(body?.decision || '').trim();
      const note = String(body?.note || '').trim();
      if (!periodId) return Response.json({ success: false, error: 'Pay period id is required.' }, { status: 400 });
      if (!['review', 'finalize', 'reopen'].includes(decision)) return Response.json({ success: false, error: 'A valid pay-period action is required.' }, { status: 400 });
      if (note.length > 500) return Response.json({ success: false, error: 'Pay-period notes are limited to 500 characters.' }, { status: 400 });
      if (decision === 'reopen' && note.length < 3) return Response.json({ success: false, error: 'A reason is required to reopen a finalized pay period.' }, { status: 400 });

      let period = await payPeriodEntity.get(periodId).catch(() => null);
      if (!period?.id) return Response.json({ success: false, error: 'Pay period was not found.' }, { status: 404 });
      const expectedStatus = decision === 'review' ? 'review' : decision === 'finalize' ? 'finalized' : 'review';
      const statusPayloadHash = await payloadHash({ pay_period_id: period.id, decision, note });
      const statusAuditRows = await auditEntity.filter({ action: 'pay_period_status', request_id: requestId });
      if (!Array.isArray(statusAuditRows)) throw new Error('Pay-period audit lookup did not return a record list.');
      if (statusAuditRows.length > 1) return Response.json({ success: false, error: 'This pay-period action has multiple audit records. Admin investigation is required.' }, { status: 409 });
      let intent = statusAuditRows[0] || null;
      if (intent && asEmail(intent.actor_email) !== actorEmail) {
        return Response.json({ success: false, error: 'This pay-period request belongs to another administrator.' }, { status: 409 });
      }
      const priorStatusHash = String(intent?.details?.payload_hash || '');
      if (intent && priorStatusHash && !constantTimeEqual(priorStatusHash, statusPayloadHash)) {
        return Response.json({ success: false, error: 'This pay-period request id is already bound to a different period action. Submit a new action.' }, { status: 409 });
      }
      if (intent && !priorStatusHash) {
        const details = intent.details || {};
        const expectedReason = note || `${decision} pay period`;
        if (
          String(details.pay_period_id || '') !== period.id ||
          String(details.decision || '') !== decision ||
          (String(intent.reason || '') && String(intent.reason || '') !== expectedReason)
        ) {
          return Response.json({ success: false, error: 'This pay-period request id is already bound to a different period action. Submit a new action.' }, { status: 409 });
        }
      }
      if (intent?.outcome === 'blocked') return Response.json({ success: false, error: 'This pay-period request was previously blocked. Reload and submit a new action.' }, { status: 409 });

      const ensureStatusAuditConfirmed = async (recoveredAfterInterruption = false) => {
        if (!intent?.id) return false;
        if (intent.outcome === 'pending') {
          const finalized = await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId },
            { $set: {
              outcome: 'confirmed', server_timestamp: new Date().toISOString(),
              details: { ...(intent.details || {}), payload_hash: statusPayloadHash, pay_period_id: period.id, decision, note, status: period.status, ...(recoveredAfterInterruption ? { recovered_after_interruption: true } : {}) },
            } },
          );
          if (!finalized || finalized.updated !== 1) {
            const freshAudit = await auditEntity.get(intent.id).catch(() => null);
            if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) return false;
          }
        }
        const finalAudit = await auditEntity.get(intent.id).catch(() => null);
        return Boolean(finalAudit && ['confirmed', 'recovered'].includes(String(finalAudit.outcome || '')));
      };

      const unlockFinalizedPeriodEntries = async () => {
        // Unlock only locks owned by the finalization being reopened. A delayed
        // duplicate reopen must not erase locks from a later finalization.
        const lockAt = String(period.finalized_summary?.lock_timestamp || period.finalized_at || '');
        const lockedBy = asEmail(period.finalized_summary?.locked_by || period.finalized_by);
        if (!lockAt || !lockedBy) return false;
        const currentLocks = await entryEntity.filter({ pay_period_id: period.id });
        if (!Array.isArray(currentLocks)) throw new Error('Pay-period reopen lock lookup did not return a record list.');
        if (currentLocks.some((entry: any) => String(entry.pay_period_locked_at || '') !== lockAt ||
            asEmail(entry.pay_period_locked_by) !== lockedBy)) return false;
        if (currentLocks.length) {
          const unlocked = await entryEntity.updateMany(
            { pay_period_id: period.id, pay_period_locked_at: lockAt, pay_period_locked_by: lockedBy },
            { $unset: { pay_period_id: '', pay_period_locked_at: '', pay_period_locked_by: '' } },
          );
          if (!unlocked || typeof unlocked.updated !== 'number') return false;
        }
        const stillLocked = await entryEntity.filter({ pay_period_id: period.id });
        if (!Array.isArray(stillLocked)) throw new Error('Pay-period unlock verification did not return a record list.');
        return stillLocked.length === 0;
      };

      if (decision === 'reopen' && period.status === 'review' && String(period.last_request_id || '') === requestId) {
        if (!await unlockFinalizedPeriodEntries()) return Response.json({ success: false, retry_same_request: true, error: 'The period was reopened but its original entry locks could not be safely cleared. Retry the same reopen action or request admin investigation.' }, { status: 409 });
        if (!await ensureStatusAuditConfirmed(true)) return Response.json({ success: false, retry_same_request: true, error: 'The period was reopened but its audit is still being finalized. Retry the same reopen action.' }, { status: 409 });
        return Response.json({ success: true, period, audit_id: intent.id, reused: true });
      }
      if (String(period.last_request_id || '') === requestId && period.status === expectedStatus) {
        if (decision === 'finalize') {
          // A saved period marker alone is not sufficient evidence of completed
          // entry locking. Verify the committed lock snapshot before audit reuse.
          const expectedCount = Number(period.finalized_summary?.entry_count);
          const savedLockAt = String(period.finalized_summary?.lock_timestamp || '');
          const savedLockedBy = asEmail(period.finalized_summary?.locked_by);
          if (!Number.isInteger(expectedCount) || expectedCount < 0 || !savedLockAt || !savedLockedBy ||
              String(period.finalized_summary?.request_id || '') !== requestId) {
            return Response.json({ success: false, error: 'The finalized period lacks a matching entry-lock snapshot. Admin investigation is required.' }, { status: 409 });
          }
          const committedLocks = await entryEntity.filter({ pay_period_id: period.id });
          if (!Array.isArray(committedLocks)) throw new Error('Finalization recovery lock lookup did not return a record list.');
          if (committedLocks.length !== expectedCount || committedLocks.some((entry: any) =>
            String(entry.pay_period_locked_at || '') !== savedLockAt ||
            asEmail(entry.pay_period_locked_by) !== savedLockedBy ||
            entry.status !== 'clocked_out' || entry.approval_status !== 'approved')) {
            return Response.json({ success: false, error: 'The finalized period and stored entry locks do not match. Admin investigation is required.' }, { status: 409 });
          }
          // Interrupted responses can leave a completed finalization's gates held.
          const staleGates = await stateEntity.filter({
            correction_create_status: 'creating',
            correction_create_request_id: requestId,
            correction_create_time_entry_id: `pay_period:${period.id}`,
          });
          if (!Array.isArray(staleGates)) throw new Error('Finalization gate recovery lookup did not return a record list.');
          for (const gate of staleGates) {
            if (!constantTimeEqual(String(gate.correction_create_payload_hash || ''), statusPayloadHash) ||
                !await releaseCompletedCorrectionCreateLock(
                  stateEntity, gate.id, requestId, `pay_period:${period.id}`, statusPayloadHash,
                )) {
              return Response.json({ success: false, retry_same_request: true, error: 'This pay period was finalized, but a shared employee gate could not be released safely. Retry the same action or request admin investigation.' }, { status: 409 });
            }
          }
        }
        if (!await ensureStatusAuditConfirmed(true)) return Response.json({ success: false, retry_same_request: true, error: 'The pay-period action is saved but its confirmed audit could not be verified yet. Retry the same action.' }, { status: 409 });
        return Response.json({ success: true, period, audit_id: intent.id, reused: true });
      }
      if (intent?.outcome === 'confirmed' || intent?.outcome === 'recovered') {
        return Response.json({ success: false, error: 'This pay-period audit is confirmed but the period request marker does not match. Admin investigation is required.' }, { status: 409 });
      }
      if (decision === 'finalize' && period.status === 'review' && String(period.last_request_id || '') !== requestId) {
        const earlierRequest = String(period.last_request_id || '');
        if (earlierRequest) {
          const earlierAudit = await uniqueRow(auditEntity, { action: 'pay_period_status', request_id: earlierRequest }, 'Prior pay-period action');
          if (!earlierAudit || (earlierAudit.outcome === 'pending' && String(earlierAudit.details?.pay_period_id || '') === period.id)) {
            return Response.json({ success: false, error: 'An earlier pay-period action is still being recovered. Retry that exact request before starting another finalization.' }, { status: 409 });
          }
        }
      }
      if (decision === 'reopen' && period.status === 'finalized') {
        const finalizationAudit = await uniqueRow(auditEntity, {
          action: 'pay_period_status', request_id: String(period.last_request_id || ''),
        }, 'Pay-period finalization audit');
        if (!finalizationAudit || !['confirmed', 'recovered'].includes(String(finalizationAudit.outcome || '')) ||
            String(finalizationAudit.details?.pay_period_id || '') !== period.id ||
            String(finalizationAudit.details?.decision || '') !== 'finalize') {
          return Response.json({ success: false, error: 'The finalization audit is not confirmed. Recover the exact finalization request before reopening.' }, { status: 409 });
        }
      }
      if (decision === 'review' && period.status !== 'open') return Response.json({ success: false, error: 'Only an open pay period can move to review.' }, { status: 409 });
      if (decision === 'finalize' && period.status !== 'review') return Response.json({ success: false, error: 'Only a pay period in Review can be finalized.' }, { status: 409 });
      if (decision === 'reopen' && period.status !== 'finalized') return Response.json({ success: false, error: 'Only a finalized pay period can be reopened.' }, { status: 409 });

      const now = new Date().toISOString();
      if (!intent) {
        intent = await auditEntity.create({
          action: 'pay_period_status', outcome: 'pending', user_email: actorEmail,
          user_name: actor.full_name || actorEmail, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: 'session', server_timestamp: now, request_id: requestId,
          reason: note || `${decision} pay period`,
          details: { payload_hash: statusPayloadHash, pay_period_id: period.id, decision, note, prior_status: period.status },
        });
      }
      if (!intent?.id) throw new Error('Pay-period audit intent could not be persisted. No status change was made.');

      if (decision === 'finalize' && String(period.last_request_id || '') !== requestId) {
        // Claim the period before writing any entry locks. Other requests must
        // recover the claimed action before they can replace its marker.
        const claimedPeriod = await payPeriodEntity.updateMany(
          { id: period.id, updated_date: period.updated_date, status: 'review' },
          { $set: { last_request_id: requestId } },
        );
        if (!claimedPeriod || claimedPeriod.updated !== 1) {
          const latest = await payPeriodEntity.get(period.id);
          if (latest.status !== 'review' || String(latest.last_request_id || '') !== requestId) {
            const blocked = await auditEntity.updateMany(
              { id: intent.id, outcome: 'pending', request_id: requestId },
              { $set: { outcome: 'blocked', details: { ...(intent.details || {}), blocked_reason: 'period_claim_lost' } } },
            );
            if (!blocked || blocked.updated !== 1) return Response.json({ success: false, retry_same_request: true, error: 'The pay-period claim conflicted and its pending audit could not be resolved. Retry the same request.' }, { status: 409 });
            return Response.json({ success: false, error: 'Another pay-period action claimed or changed this period. Reload before submitting a new request.' }, { status: 409 });
          }
          period = latest;
        } else {
          period = await payPeriodEntity.get(period.id);
        }
      }

      // Pending audit timestamp is the lock owner; retries reuse it exactly.
      const lockTimestamp = String(intent.server_timestamp || '');
      const releaseStagedPeriodLocks = async () => {
        if (!lockTimestamp) return false;
        const existing = await entryEntity.filter({ pay_period_id: period.id });
        if (!Array.isArray(existing)) throw new Error('Pay-period staged-lock lookup did not return a record list.');
        if (existing.some((entry: any) => String(entry.pay_period_locked_at || '') !== lockTimestamp ||
            asEmail(entry.pay_period_locked_by) !== asEmail(intent.actor_email))) return false;
        if (existing.length) {
          const rollback = await entryEntity.updateMany(
            { pay_period_id: period.id, pay_period_locked_at: lockTimestamp, pay_period_locked_by: intent.actor_email },
            { $unset: { pay_period_id: '', pay_period_locked_at: '', pay_period_locked_by: '' } },
          );
          if (!rollback || typeof rollback.updated !== 'number') return false;
        }
        const remaining = await entryEntity.filter({ pay_period_id: period.id });
        if (!Array.isArray(remaining)) throw new Error('Pay-period staged-lock rollback verification did not return a record list.');
        return remaining.length === 0;
      };

      if (decision === 'review') {
        const updated = await payPeriodEntity.updateMany(
          { id: period.id, updated_date: period.updated_date, status: 'open' },
          { $set: { status: 'review', review_started_at: now, review_started_by: actorEmail, last_request_id: requestId } },
        );
        if (!updated || updated.updated !== 1) return Response.json({ success: false, error: 'Pay period changed in another session. Reload before continuing.' }, { status: 409 });
      } else if (decision === 'finalize') {
        const startDate = validDateKey(period.start_date);
        const endDate = validDateKey(period.end_date);
        if (!startDate || !endDate) return Response.json({ success: false, error: 'Stored pay-period dates are invalid.' }, { status: 409 });

        let allEntries = await entryEntity.filter({ archived_test_data: { $ne: true }, archived_admin: { $ne: true } });
        if (!Array.isArray(allEntries)) throw new Error('TimeEntry pay-period readiness lookup did not return a record list.');
        let periodEntries = allEntries.filter((entry: any) => entryFallsInPeriod(entry, startDate, endDate));
        let activeOverlap = allEntries.filter((entry: any) => activeEntryMayOverlapPeriod(entry, endDate));
        let invalidActiveClockInCount = activeOverlap.filter((entry: any) => !dateKeyInCompanyTime(entry.clock_in)).length;
        let completedEntries = periodEntries.filter((entry: any) => entry.status === 'clocked_out' && entry.clock_out);
        const previousLocks = await entryEntity.filter({ pay_period_id: period.id });
        if (!Array.isArray(previousLocks)) throw new Error('Prior pay-period lock lookup did not return a record list.');
        let completedIds = new Set(completedEntries.map((entry: any) => entry.id));
        if (previousLocks.some((entry: any) => !completedIds.has(entry.id) ||
            String(entry.pay_period_locked_at || '') !== lockTimestamp ||
            asEmail(entry.pay_period_locked_by) !== asEmail(intent.actor_email))) {
          return Response.json({ success: false, error: 'This period has entry locks that cannot be attributed to this exact finalization. Admin investigation is required.' }, { status: 409 });
        }
        let unapproved = completedEntries.filter((entry: any) => (entry.approval_status || 'unreviewed') !== 'approved');
        let lockedElsewhere = completedEntries.filter((entry: any) => entryIsPayPeriodLocked(entry) && entry.pay_period_id !== period.id);
        let activeCorrections = await correctionRequestEntity.filter({ status: { $in: ['pending', 'reviewing'] } });
        if (!Array.isArray(activeCorrections)) throw new Error('Correction readiness lookup did not return a record list.');
        let periodEntryIds = new Set(periodEntries.map((entry: any) => entry.id));
        let pendingCorrections = activeCorrections.filter((request: any) => periodEntryIds.has(request.time_entry_id));

        if (activeOverlap.length || unapproved.length || pendingCorrections.length || lockedElsewhere.length) {
          if (!await releaseStagedPeriodLocks()) return Response.json({ success: false, retry_same_request: true, error: 'Finalization is blocked and its staged entry locks could not be safely cleared. Retry the same request or request admin investigation.' }, { status: 409 });
          await auditEntity.updateMany({ id: intent.id, outcome: 'pending' }, { $set: {
            outcome: 'blocked', details: {
              ...(intent.details || {}), payload_hash: statusPayloadHash, pay_period_id: period.id, decision, note,
              active_shift_count: activeOverlap.length, invalid_active_clock_in_count: invalidActiveClockInCount,
              unapproved_count: unapproved.length, pending_correction_count: pendingCorrections.length,
              locked_elsewhere_count: lockedElsewhere.length,
            },
          } });
          return Response.json({
            success: false,
            error: `Pay period is not ready to finalize: ${activeOverlap.length} active shift(s)${invalidActiveClockInCount ? ` (${invalidActiveClockInCount} missing or invalid clock-in timestamp)` : ''}, ${unapproved.length} unapproved shift(s), ${pendingCorrections.length} pending correction(s), ${lockedElsewhere.length} conflicting lock(s).`,
            readiness: {
              active_shift_count: activeOverlap.length, invalid_active_clock_in_count: invalidActiveClockInCount,
              unapproved_count: unapproved.length, pending_correction_count: pendingCorrections.length,
              locked_elsewhere_count: lockedElsewhere.length,
            },
          }, { status: 409 });
        }

        // Hold every currently authorized employee's shared mutation gate.
        // Clock In, correction creation, and manager approval all serialize here,
        // so a new shift cannot arrive after the readiness scan and before commit.
        const finalizationGates: Array<{ stateId: string; claimToken: string }> = [];
        const gateEntryId = `pay_period:${period.id}`;
        try {
          const authorizedEmployees = await authorized.filter({});
          if (!Array.isArray(authorizedEmployees)) throw new Error('Authorized employee lookup did not return a record list.');
          const employeeEmails = authorizedEmployees.map((employee: any) => asEmail(employee.email));
          if (employeeEmails.some((email: string) => !email) || new Set(employeeEmails).size !== employeeEmails.length) {
            return Response.json({ success: false, error: 'Authorized employee identities are incomplete or duplicated. Admin investigation is required before finalization.' }, { status: 409 });
          }
          authorizedEmployees.sort((a: any, b: any) => asEmail(a.email).localeCompare(asEmail(b.email)));
          for (const employee of authorizedEmployees) {
            const employeeState = await ensureState(stateEntity, employee);
            const claimed = await claimCorrectionCreateLock(
              stateEntity, employeeState.id, requestId, gateEntryId, statusPayloadHash,
            );
            if (!claimed?.acquired) {
              return Response.json({
                success: false, retry_same_request: true,
                error: 'An employee Clock In, correction, or manager approval is in progress. Retry this same finalization after the action finishes.',
              }, { status: 409 });
            }
            finalizationGates.push({ stateId: employeeState.id, claimToken: String(claimed.claim_token || '') });
          }

          // Rebuild readiness from authoritative TimeEntry state after all employee
          // gates are held. This catches a shift that arrived or completed between
          // the first readiness read and acquisition of that employee's gate.
          allEntries = await entryEntity.filter({ archived_test_data: { $ne: true }, archived_admin: { $ne: true } });
          if (!Array.isArray(allEntries)) throw new Error('Post-gate TimeEntry readiness lookup did not return a record list.');
          periodEntries = allEntries.filter((entry: any) => entryFallsInPeriod(entry, startDate, endDate));
          activeOverlap = allEntries.filter((entry: any) => activeEntryMayOverlapPeriod(entry, endDate));
          invalidActiveClockInCount = activeOverlap.filter((entry: any) => !dateKeyInCompanyTime(entry.clock_in)).length;
          completedEntries = periodEntries.filter((entry: any) => entry.status === 'clocked_out' && entry.clock_out);
          completedIds = new Set(completedEntries.map((entry: any) => entry.id));
          unapproved = completedEntries.filter((entry: any) => (entry.approval_status || 'unreviewed') !== 'approved');
          lockedElsewhere = completedEntries.filter((entry: any) => entryIsPayPeriodLocked(entry) && entry.pay_period_id !== period.id);
          activeCorrections = await correctionRequestEntity.filter({ status: { $in: ['pending', 'reviewing'] } });
          if (!Array.isArray(activeCorrections)) throw new Error('Post-gate correction readiness lookup did not return a record list.');
          periodEntryIds = new Set(periodEntries.map((entry: any) => entry.id));
          pendingCorrections = activeCorrections.filter((request: any) => periodEntryIds.has(request.time_entry_id));

          if (activeOverlap.length || unapproved.length || pendingCorrections.length || lockedElsewhere.length) {
            if (!await releaseStagedPeriodLocks()) return Response.json({ success: false, retry_same_request: true, error: 'Finalization readiness changed and staged entry locks could not be safely cleared. Retry the same request or request admin investigation.' }, { status: 409 });
            await auditEntity.updateMany(
              { id: intent.id, outcome: 'pending', request_id: requestId },
              { $set: {
                outcome: 'blocked',
                details: {
                  ...(intent.details || {}), payload_hash: statusPayloadHash,
                  pay_period_id: period.id, decision, note,
                  blocked_reason: 'readiness_changed_after_employee_gates',
                  active_shift_count: activeOverlap.length,
                  invalid_active_clock_in_count: invalidActiveClockInCount,
                  unapproved_count: unapproved.length,
                  pending_correction_count: pendingCorrections.length,
                  locked_elsewhere_count: lockedElsewhere.length,
                },
              } },
            );
            return Response.json({
              success: false,
              error: `Pay-period readiness changed during finalization: ${activeOverlap.length} active shift(s)${invalidActiveClockInCount ? ` (${invalidActiveClockInCount} missing or invalid clock-in timestamp)` : ''}, ${unapproved.length} unapproved shift(s), ${pendingCorrections.length} pending correction(s), ${lockedElsewhere.length} conflicting lock(s). Reload and review before finalizing again.`,
            }, { status: 409 });
          }

          const latestCorrections = await correctionRequestEntity.filter({ status: { $in: ['pending', 'reviewing'] } });
          if (!Array.isArray(latestCorrections)) throw new Error('Post-gate correction readiness lookup did not return a record list.');
          const newlyPending = latestCorrections.filter((request: any) => periodEntryIds.has(request.time_entry_id));
          if (newlyPending.length) {
            if (!await releaseStagedPeriodLocks()) return Response.json({ success: false, retry_same_request: true, error: 'A late correction blocked finalization, but staged entry locks could not be safely cleared. Retry the same request.' }, { status: 409 });
            await auditEntity.updateMany(
              { id: intent.id, outcome: 'pending', request_id: requestId },
              { $set: {
                outcome: 'blocked',
                details: {
                  ...(intent.details || {}), payload_hash: statusPayloadHash,
                  pay_period_id: period.id, decision, note,
                  blocked_reason: 'correction_submitted_during_finalization',
                  pending_correction_count: newlyPending.length,
                },
              } },
            );
            return Response.json({
              success: false,
              error: 'An employee correction was submitted while the pay period was being checked. Reload and resolve the correction before finalizing.',
            }, { status: 409 });
          }

        const lockableIds = completedEntries.filter((entry: any) => !entry.pay_period_id || entry.pay_period_id === period.id).map((entry: any) => entry.id);
        const newlyLockableIds = completedEntries.filter((entry: any) => !entry.pay_period_id).map((entry: any) => entry.id);
        if (newlyLockableIds.length) {
          const lockResult = await entryEntity.updateMany(
            {
              id: { $in: newlyLockableIds },
              status: 'clocked_out',
              approval_status: 'approved',
              pay_period_id: { $in: [null, ''] },
              archived_test_data: { $ne: true },
              archived_admin: { $ne: true },
            },
            { $set: { pay_period_id: period.id, pay_period_locked_at: lockTimestamp, pay_period_locked_by: actorEmail } },
          );
          if (!lockResult || typeof lockResult.updated !== 'number') return Response.json({ success: false, retry_same_request: true, error: 'Pay-period entry locking could not be verified. Retry the same finalization after reloading.' }, { status: 409 });
        }
        if (lockableIds.length) {
          const lockedRows = await entryEntity.filter({ pay_period_id: period.id });
          if (!Array.isArray(lockedRows)) throw new Error('Pay-period lock verification did not return a record list.');
          const lockedIds = new Set(lockedRows.map((entry: any) => entry.id));
          const missingLocks = lockableIds.filter((id: string) => !lockedIds.has(id));
          if (missingLocks.length) {
            // Include locks staged by an earlier interrupted attempt with this
            // same request, not just locks acquired during the current retry.
            if (!await releaseStagedPeriodLocks()) {
              return Response.json({ success: false, retry_same_request: true, error: 'Approval changed and staged pay-period locks could not be fully rolled back. Retry the same request or request admin investigation.' }, { status: 409 });
            }
            await auditEntity.updateMany(
              { id: intent.id, outcome: 'pending', request_id: requestId },
              { $set: {
                outcome: 'blocked',
                details: {
                  ...(intent.details || {}),
                  payload_hash: statusPayloadHash,
                  pay_period_id: period.id,
                  decision,
                  note,
                  blocked_reason: 'entry_approval_changed_during_finalization',
                  missing_lock_count: missingLocks.length,
                },
              } },
            );
            return Response.json({
              success: false,
              error: 'One or more shift approvals changed while the pay period was being finalized. Newly acquired locks were rolled back; reload and review the period again.',
            }, { status: 409 });
          }
        }
        const confirmedLocks = await entryEntity.filter({ pay_period_id: period.id });
        if (!Array.isArray(confirmedLocks)) throw new Error('Final pay-period lock lookup did not return a record list.');
        if (confirmedLocks.length !== completedEntries.length || confirmedLocks.some((entry: any) =>
          !completedIds.has(entry.id) || String(entry.pay_period_locked_at || '') !== lockTimestamp ||
          asEmail(entry.pay_period_locked_by) !== actorEmail || entry.status !== 'clocked_out' || entry.approval_status !== 'approved')) {
          return Response.json({ success: false, retry_same_request: true, error: 'Final pay-period lock ownership or approvals changed. Retry this finalization for investigation before committing.' }, { status: 409 });
        }
        const totalHours = completedEntries.reduce((sum: number, entry: any) => sum + Number(entry.total_hours || 0), 0);
        const summary = {
          entry_count: completedEntries.length,
          employee_count: new Set(completedEntries.map((entry: any) => asEmail(entry.user_email))).size,
          total_hours: totalHours,
          lock_timestamp: lockTimestamp,
          locked_by: actorEmail,
          request_id: requestId,
        };
        const finalized = await payPeriodEntity.updateMany(
          { id: period.id, updated_date: period.updated_date, status: 'review', last_request_id: requestId },
          { $set: { status: 'finalized', finalized_at: now, finalized_by: actorEmail, finalization_note: note, last_request_id: requestId, finalized_summary: summary } },
        );
        if (!finalized || finalized.updated !== 1) return Response.json({ success: false, retry_same_request: true, error: 'Entries were locked but pay-period finalization was interrupted. Retry the same finalization request.' }, { status: 409 });
        } finally {
          let releaseFailed = false;
          for (const gate of finalizationGates.reverse()) {
            try {
              const released = await releaseCorrectionCreateLock(
                stateEntity, gate.stateId, requestId, gateEntryId, statusPayloadHash, gate.claimToken,
              );
              if (!released) {
                const current = await freshState(stateEntity, gate.stateId).catch(() => null);
                const gateStatus = String(current?.correction_create_status || '');
                const safe = current?.id && (
                  gateStatus === 'idle' ||
                  (gateStatus === 'creating' && String(current.correction_create_request_id || '') !== requestId)
                );
                if (!safe) releaseFailed = true;
              }
            } catch {
              releaseFailed = true;
            }
          }
          if (releaseFailed) throw new Error('A pay-period finalization employee gate could not be released safely. Retry this same finalization request for recovery.');
        }
      } else {
        const reopened = await payPeriodEntity.updateMany(
          { id: period.id, updated_date: period.updated_date, status: 'finalized' },
          { $set: { status: 'review', reopened_at: now, reopened_by: actorEmail, reopen_reason: note, last_request_id: requestId } },
        );
        if (!reopened || reopened.updated !== 1) {
          const latest = await payPeriodEntity.get(period.id);
          if (latest?.status !== 'review' || String(latest.last_request_id || '') !== requestId) {
            const blocked = await auditEntity.updateMany(
              { id: intent.id, outcome: 'pending', request_id: requestId },
              { $set: { outcome: 'blocked', details: { ...(intent.details || {}), blocked_reason: 'reopen_claim_lost' } } },
            );
            if (!blocked || blocked.updated !== 1) return Response.json({ success: false, retry_same_request: true, error: 'The reopen claim conflicted and its audit could not be resolved. Retry the same request.' }, { status: 409 });
            return Response.json({ success: false, error: 'Another pay-period action won the reopen race. Reload before submitting a new request.' }, { status: 409 });
          }
          period = latest;
        }
        if (!await unlockFinalizedPeriodEntries()) return Response.json({ success: false, retry_same_request: true, error: 'The period was reopened but its original entry locks could not be safely cleared. Retry the same reopen request or request admin investigation.' }, { status: 409 });
      }

      period = await payPeriodEntity.get(period.id);
      const auditFinalized = await auditEntity.updateMany({ id: intent.id, outcome: 'pending', request_id: requestId }, { $set: {
        outcome: 'confirmed', server_timestamp: new Date().toISOString(),
        details: { ...(intent.details || {}), payload_hash: statusPayloadHash, pay_period_id: period.id, decision, note, status: period.status },
      } });
      if (!auditFinalized || auditFinalized.updated !== 1) {
        const freshAudit = await auditEntity.get(intent.id).catch(() => null);
        if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) return Response.json({ success: false, retry_same_request: true, error: 'The pay-period action was saved but audit finalization was interrupted. Retry the same action.' }, { status: 409 });
      }
      return Response.json({ success: true, period, audit_id: intent.id });
    }

    if (['labor_start', 'labor_change', 'labor_stop'].includes(action)) {
      if (state.status !== 'clocked_in' || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Employee must be clocked in to track current work.' }, { status: 409 });
      }
      if (actor.role !== 'badge' && actorEmail !== target.email) {
        return Response.json({ success: false, error: 'Employees can only track their own current work.' }, { status: 403 });
      }
      if (breakStatusOf(state) !== 'working' || state.active_break_id) {
        return Response.json({ success: false, error: 'End the active break before changing current work.' }, { status: 409 });
      }
      if (workPauseStatusOf(state) !== 'working' || state.active_work_pause_id) {
        return Response.json({ success: false, error: 'Resume Work before changing current work.' }, { status: 409 });
      }

      const expectedLaborStatus = action === 'labor_start' ? 'starting' : action === 'labor_change' ? 'changing' : 'stopping';
      const currentLaborStatus = laborStatusOf(state);
      const resumingLaborAction = currentLaborStatus === expectedLaborStatus && String(state.last_labor_request_id || '') === requestId;
      if (currentLaborStatus !== 'idle' && !resumingLaborAction) {
        return Response.json({ success: false, error: 'Another Current Work action is still in progress. Retry after status refresh.' }, { status: 409 });
      }

      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }

      if (action === 'labor_stop') {
        const priorEnd = await uniqueRow(laborEntity, { user_email: target.email, time_entry_id: entry.id, end_request_id: requestId }, 'Labor-stop request');
        if (priorEnd?.id && priorEnd.status === 'completed' && currentLaborStatus === 'idle') {
          await ensureLaborStopAudit({ auditEntity, entry, target, actor, actorEmail, requestId, endReason: priorEnd.end_reason || 'manual_stop', segment: priorEnd });
          const summary = await laborSummaryForEntry(laborEntity, entry.id, target.email);
          return Response.json({ success: true, status: 'clocked_in', entry, active_labor: null, ended_labor: priorEnd, labor_summary: summary, user: publicEmployee(target), reused: true });
        }

        const active = await activeLaborForEntry(laborEntity, entry.id, target.email);
        if (!active?.id && !resumingLaborAction) {
          const summary = await laborSummaryForEntry(laborEntity, entry.id, target.email);
          return Response.json({ success: true, status: 'clocked_in', entry, active_labor: null, ended_labor: null, labor_summary: summary, user: publicEmployee(target), reused: false });
        }

        const officialEnd = resumingLaborAction && state.labor_pending_started_at
          ? state.labor_pending_started_at
          : new Date().toISOString();
        const claimed = resumingLaborAction
          ? state
          : await setLaborState(stateEntity, state, 'idle', null, {
              labor_status: 'stopping', last_labor_request_id: requestId,
              labor_pending_started_at: officialEnd, labor_pending_activity_type: '', labor_pending_work_order_id: '',
            });
        if (!claimed) return Response.json({ success: false, error: 'Current Work stop lost a concurrency race. Reload status before retrying.' }, { status: 409 });

        const ended = await closeActiveLaborSegment({
          laborEntity, auditEntity, entry, target, actor, actorEmail, requestId,
          endReason: 'manual_stop', officialEnd, deferAudit: true,
        });
        const currentClaim = await freshState(stateEntity, claimed.id);
        const auditClaim = await setLaborState(stateEntity, currentClaim, 'stopping', requestId, {
          labor_pending_started_at: currentClaim.labor_pending_started_at || officialEnd,
        });
        if (!auditClaim) return Response.json({ success: false, retry_same_request: true, error: 'Current Work stop is being recovered in another session. Retry the same action after status refresh.' }, { status: 409 });
        if (ended?.id) {
          await ensureLaborStopAudit({ auditEntity, entry, target, actor, actorEmail, requestId, endReason: ended.end_reason || 'manual_stop', segment: ended });
        }
        const finalized = await setLaborState(stateEntity, auditClaim, 'stopping', requestId, {
          labor_status: 'idle', labor_pending_started_at: null, labor_pending_activity_type: '', labor_pending_work_order_id: '',
        });
        if (!finalized) return Response.json({ success: false, retry_same_request: true, error: 'Current Work stop and its audit were saved but state finalization was interrupted. Retry the same action to recover safely.' }, { status: 409 });
        const summary = await laborSummaryForEntry(laborEntity, entry.id, target.email);
        return Response.json({ success: true, status: 'clocked_in', entry, active_labor: null, ended_labor: ended, labor_summary: summary, user: publicEmployee(target), reused: Boolean(priorEnd?.id) });
      }

      const activityType = String(body?.activity_type || '').trim();
      if (!LABOR_ACTIVITY_TYPES.has(activityType)) return Response.json({ success: false, error: 'A valid work activity is required.' }, { status: 400 });
      const workOrderId = String(body?.work_order_id || '').trim();
      if (resumingLaborAction) {
        const pendingActivity = String(state.labor_pending_activity_type || '').trim();
        const pendingWorkOrderId = String(state.labor_pending_work_order_id || '').trim();
        if (pendingActivity !== activityType || pendingWorkOrderId !== workOrderId) {
          return Response.json({ success: false, error: 'This Current Work request id is already bound to different work details. Retry with the original activity and WorkOrder.' }, { status: 409 });
        }
      }

      let workOrder: any = null;
      if (workOrderId) {
        workOrder = await workOrderEntity.get(workOrderId).catch(() => null);
        if (!workOrder?.id || workOrder.deleted === true) return Response.json({ success: false, error: 'Selected WorkOrder was not found or is unavailable.' }, { status: 404 });
      }

      const priorStart = await uniqueRow(laborEntity, { user_email: target.email, time_entry_id: entry.id, start_request_id: requestId }, 'Labor-start request');
      if (priorStart?.id) {
        if (String(priorStart.activity_type || '') !== activityType || String(priorStart.work_order_id || '') !== workOrderId) {
          return Response.json({ success: false, error: 'This Current Work request id is already bound to different labor details. Retry with the original activity and WorkOrder.' }, { status: 409 });
        }

        if (action === 'labor_change') {
          const priorEnded = await uniqueRow(laborEntity, { user_email: target.email, time_entry_id: entry.id, end_request_id: requestId }, 'Labor-change end request');
          if (!priorEnded?.id || priorEnded.status !== 'completed') {
            return Response.json({ success: false, retry_same_request: true, error: 'The Current Work change created its new segment but the previous segment close is not yet verified. Retry the same change.' }, { status: 409 });
          }
          await ensureLaborStopAudit({
            auditEntity, entry, target, actor, actorEmail, requestId,
            endReason: priorEnded.end_reason || 'change_work', segment: priorEnded,
          });
        }

        await ensureLaborStartAudit({
          auditEntity,
          action: action === 'labor_change' ? 'labor_change' : 'labor_start',
          segment: priorStart, target, actor, requestId, entryId: entry.id,
        });

        if (currentLaborStatus !== 'idle') {
          const currentClaim = await freshState(stateEntity, state.id);
          if (laborStatusOf(currentClaim) !== expectedLaborStatus || String(currentClaim.last_labor_request_id || '') !== requestId) {
            return Response.json({ success: false, retry_same_request: true, error: 'Current Work was saved, but its authoritative state is being reconciled. Retry the same action after status refresh.' }, { status: 409 });
          }
          const finalized = await setLaborState(stateEntity, currentClaim, expectedLaborStatus, requestId, {
            labor_status: 'idle', labor_pending_started_at: null, labor_pending_activity_type: '', labor_pending_work_order_id: '',
          });
          if (!finalized) {
            return Response.json({ success: false, retry_same_request: true, error: 'Current Work and its audit were saved but state finalization was interrupted. Retry the same action to recover safely.' }, { status: 409 });
          }
        }

        const summary = await laborSummaryForEntry(laborEntity, entry.id, target.email);
        return Response.json({ success: true, status: 'clocked_in', entry, active_labor: priorStart.status === 'active' ? priorStart : null, labor_summary: summary, user: publicEmployee(target), reused: true });
      }

      const active = await activeLaborForEntry(laborEntity, entry.id, target.email);
      if (action === 'labor_start' && active?.id) return Response.json({ success: false, error: 'Current Work is already active. Use Change Work instead.' }, { status: 409 });
      if (action === 'labor_change' && !active?.id && !resumingLaborAction) return Response.json({ success: false, error: 'No Current Work is active. Use Start Work instead.' }, { status: 409 });

      const officialStart = resumingLaborAction && state.labor_pending_started_at
        ? state.labor_pending_started_at
        : new Date().toISOString();
      const claimed = resumingLaborAction
        ? state
        : await setLaborState(stateEntity, state, 'idle', null, {
            labor_status: expectedLaborStatus, last_labor_request_id: requestId,
            labor_pending_started_at: officialStart,
            labor_pending_activity_type: activityType,
            labor_pending_work_order_id: workOrderId,
          });
      if (!claimed) return Response.json({ success: false, error: 'Current Work changed in another tab or device before this action could be claimed. Reload status before retrying.' }, { status: 409 });

      let endedLabor: any = null;
      if (action === 'labor_change') {
        endedLabor = await closeActiveLaborSegment({
          laborEntity, auditEntity, entry, target, actor, actorEmail, requestId,
          endReason: 'change_work', officialEnd: officialStart, deferAudit: true,
        });
      }

      let segment = await uniqueRow(laborEntity, { user_email: target.email, time_entry_id: entry.id, start_request_id: requestId }, 'Labor-start request');
      if (!segment) {
        segment = await laborEntity.create({
          user_email: target.email,
          user_name: target.full_name || target.email,
          time_entry_id: entry.id,
          activity_type: activityType,
          work_order_id: workOrder?.id || '',
          work_order_title: workOrder?.title || '',
          client_name: workOrder?.client_name || '',
          started_at: officialStart,
          status: 'active',
          start_request_id: requestId,
          source: 'server',
        });
      }
      if (!segment?.id) throw new Error('Current Work labor segment could not be created.');
      if (String(segment.activity_type || '') !== activityType || String(segment.work_order_id || '') !== workOrderId) {
        return Response.json({ success: false, error: 'This Current Work request id is already bound to different labor details. Admin review is required.' }, { status: 409 });
      }

      const currentClaim = await freshState(stateEntity, claimed.id);
      const auditClaim = await setLaborState(stateEntity, currentClaim, expectedLaborStatus, requestId, {
        labor_pending_started_at: currentClaim.labor_pending_started_at || officialStart,
      });
      if (!auditClaim) return Response.json({ success: false, retry_same_request: true, error: 'Current Work is being recovered in another session. Retry the same action after status refresh.' }, { status: 409 });
      if (endedLabor?.id) {
        await ensureLaborStopAudit({ auditEntity, entry, target, actor, actorEmail, requestId, endReason: endedLabor.end_reason || 'change_work', segment: endedLabor });
      }
      await ensureLaborStartAudit({
        auditEntity,
        action: action === 'labor_change' ? 'labor_change' : 'labor_start',
        segment, target, actor, requestId, entryId: entry.id,
      });
      const finalized = await setLaborState(stateEntity, auditClaim, expectedLaborStatus, requestId, {
        labor_status: 'idle', labor_pending_started_at: null, labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (!finalized) return Response.json({ success: false, retry_same_request: true, error: 'Current Work and its audit were saved but state finalization was interrupted. Retry the same action to recover safely.' }, { status: 409 });
      const summary = await laborSummaryForEntry(laborEntity, entry.id, target.email);
      return Response.json({ success: true, status: 'clocked_in', entry, active_labor: segment, labor_summary: summary, user: publicEmployee(target), reused: resumingLaborAction });
    }

    if (action === 'break_start') {
      if (state.status !== 'clocked_in' || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Employee must be clocked in before starting a break.' }, { status: 409 });
      }
      if (workPauseStatusOf(state) !== 'working' || state.active_work_pause_id) {
        return Response.json({ success: false, error: 'Resume Work before starting a break or lunch.' }, { status: 409 });
      }
      if (laborStatusOf(state) !== 'idle') {
        return Response.json({ success: false, error: 'Current Work is still changing. Retry the break after that server action finishes.' }, { status: 409 });
      }
      const breakType = String(body?.break_type || '').trim();
      if (!['lunch', 'break', 'other'].includes(breakType)) {
        return Response.json({ success: false, error: 'A valid break type is required.' }, { status: 400 });
      }
      if (typeof body?.is_paid !== 'boolean') {
        return Response.json({ success: false, error: 'Break pay status must be explicitly specified.' }, { status: 400 });
      }
      const isPaid = body.is_paid === true;
      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }

      const currentBreakStatus = breakStatusOf(state);
      if (currentBreakStatus === 'on_break') {
        const activeBreak = state.active_break_id ? await breakEntity.get(state.active_break_id).catch(() => null) : null;
        if (activeBreak?.id && activeBreak.status === 'active' && activeBreak.time_entry_id === entry.id && asEmail(activeBreak.user_email) === target.email) {
          if (String(activeBreak.start_request_id || '') !== requestId) {
            return Response.json({ success: false, error: 'A break is already active. End the current break before starting another.' }, { status: 409 });
          }
          if (activeBreak.break_type !== breakType || activeBreak.is_paid !== isPaid) {
            return Response.json({ success: false, error: 'This break-start request id is already bound to different break details.' }, { status: 409 });
          }
          await ensureBreakAudit({ auditEntity, action: 'break_start', breakRow: activeBreak, target, actor, requestId, entryId: entry.id });
          const summary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
          return Response.json({ success: true, status: 'already_on_break', break_status: 'on_break', break: activeBreak, break_summary: summary, entry, user: publicEmployee(target), reused: true });
        }
        return Response.json({ success: false, error: 'Break state says the employee is on break, but the active break record is invalid. Admin review is required.' }, { status: 409 });
      }
      const resumingStart = currentBreakStatus === 'starting_break' && String(state.last_break_request_id || '') === requestId;
      if (currentBreakStatus !== 'working' && !resumingStart) {
        return Response.json({ success: false, error: 'Another break action is still in progress. Retry shortly.' }, { status: 409 });
      }

      const activeBreaks = await breakEntity.filter({ user_email: target.email, time_entry_id: entry.id, status: 'active' });
      if (!Array.isArray(activeBreaks)) throw new Error('Active break lookup did not return a record list.');
      if (activeBreaks.length > 1) return Response.json({ success: false, error: 'Multiple active break records were found. Admin review is required.' }, { status: 409 });
      if (activeBreaks.length === 1 && String(activeBreaks[0].start_request_id || '') !== requestId) {
        return Response.json({ success: false, error: 'An active break record already exists. Reload Time Clock status before retrying.' }, { status: 409 });
      }

      const officialStart = resumingStart && state.break_pending_started_at
        ? state.break_pending_started_at
        : new Date().toISOString();
      const claimed = resumingStart
        ? state
        : await setBreakState(stateEntity, state, 'working', null, {
            break_status: 'starting_break', active_break_id: null,
            last_break_request_id: requestId, break_pending_started_at: officialStart,
          });
      if (!claimed) return Response.json({ success: false, error: 'Break start lost a concurrency race. Reload status before retrying.' }, { status: 409 });

      await closeActiveLaborSegment({
        laborEntity, auditEntity, entry, target, actor, actorEmail, requestId,
        endReason: 'break', officialEnd: officialStart,
      });

      let breakRow = await uniqueRow(breakEntity, { user_email: target.email, time_entry_id: entry.id, start_request_id: requestId }, 'Break-start request');
      if (!breakRow) {
        breakRow = await breakEntity.create({
          user_email: target.email,
          user_name: target.full_name || target.email,
          time_entry_id: entry.id,
          break_type: breakType,
          is_paid: isPaid,
          started_at: officialStart,
          status: 'active',
          start_request_id: requestId,
          source: 'server',
        });
      }
      if (!breakRow?.id) throw new Error('Break record could not be created.');
      if (breakRow.status !== 'active' || breakRow.break_type !== breakType || breakRow.is_paid !== isPaid) {
        return Response.json({ success: false, error: 'This break-start request is already bound to different break details.' }, { status: 409 });
      }

      const currentClaim = await freshState(stateEntity, claimed.id);
      const auditClaim = await setBreakState(stateEntity, currentClaim, 'starting_break', requestId, {
        break_pending_started_at: currentClaim.break_pending_started_at || officialStart,
      });
      if (!auditClaim) return Response.json({ success: false, retry_same_request: true, error: 'Break start is being recovered in another session. Retry the same action after status refresh.' }, { status: 409 });
      await ensureBreakAudit({ auditEntity, action: 'break_start', breakRow, target, actor, requestId, entryId: entry.id });
      const finalized = await setBreakState(stateEntity, auditClaim, 'starting_break', requestId, {
        break_status: 'on_break', active_break_id: breakRow.id, break_pending_started_at: null,
      });
      if (!finalized) {
        return Response.json({ success: false, retry_same_request: true, error: 'Break start and its audit were saved but state finalization was interrupted. Retry this same action to recover safely.' }, { status: 409 });
      }
      const summary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
      const laborSummary = await laborSummaryForEntry(laborEntity, entry.id, target.email);
      return Response.json({ success: true, status: 'clocked_in', break_status: 'on_break', break: breakRow, break_summary: summary, active_labor: null, labor_summary: laborSummary, entry, user: publicEmployee(target), audit_saved: true });
    }

    if (action === 'break_end') {
      if (state.status !== 'clocked_in' || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Employee must be clocked in to end a break.' }, { status: 409 });
      }
      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }

      const currentBreakStatus = breakStatusOf(state);
      if (currentBreakStatus === 'working') {
        const prior = await uniqueRow(breakEntity, { user_email: target.email, time_entry_id: entry.id, end_request_id: requestId }, 'Break-end request');
        if (prior?.id && prior.status === 'completed') {
          await ensureBreakAudit({ auditEntity, action: 'break_end', breakRow: prior, target, actor, requestId, entryId: entry.id });
          const summary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
          return Response.json({ success: true, status: 'clocked_in', break_status: 'working', break: prior, break_summary: summary, entry, user: publicEmployee(target), reused: true });
        }
        return Response.json({ success: false, error: 'Employee is not currently on break.' }, { status: 409 });
      }
      const resumingEnd = currentBreakStatus === 'ending_break' && String(state.last_break_request_id || '') === requestId;
      if (currentBreakStatus !== 'on_break' && !resumingEnd) {
        return Response.json({ success: false, error: 'Another break action is still in progress. Retry shortly.' }, { status: 409 });
      }
      if (!state.active_break_id) return Response.json({ success: false, error: 'The active break record is missing. Admin review is required.' }, { status: 409 });

      let breakRow = await breakEntity.get(state.active_break_id).catch(() => null);
      if (!breakRow?.id || asEmail(breakRow.user_email) !== target.email || breakRow.time_entry_id !== entry.id) {
        return Response.json({ success: false, error: 'The active break does not match this employee shift. Admin review is required.' }, { status: 409 });
      }
      if (breakRow.status === 'completed' && String(breakRow.end_request_id || '') === requestId) {
        await ensureBreakAudit({ auditEntity, action: 'break_end', breakRow, target, actor, requestId, entryId: entry.id });
        const currentState = await freshState(stateEntity, state.id);
        if (breakStatusOf(currentState) === 'ending_break') {
          const recovered = await setBreakState(stateEntity, currentState, 'ending_break', requestId, {
            break_status: 'working', active_break_id: null, break_pending_started_at: null,
          });
          if (!recovered) return Response.json({ success: false, retry_same_request: true, error: 'Break end was saved but state finalization is still incomplete. Retry this same action.' }, { status: 409 });
        }
        const summary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
        return Response.json({ success: true, status: 'clocked_in', break_status: 'working', break: breakRow, break_summary: summary, entry, user: publicEmployee(target), reused: true });
      }
      if (breakRow.status !== 'active') return Response.json({ success: false, error: 'The active break is not in an endable state.' }, { status: 409 });

      const officialEnd = resumingEnd && state.break_pending_started_at
        ? state.break_pending_started_at
        : new Date().toISOString();
      const startedMs = new Date(breakRow.started_at).getTime();
      const endedMs = new Date(officialEnd).getTime();
      if (!Number.isFinite(startedMs) || endedMs < startedMs) return Response.json({ success: false, error: 'The stored break-start timestamp is invalid.' }, { status: 409 });
      const durationMinutes = Math.max(0, Math.floor((endedMs - startedMs) / 60000));
      const claimed = resumingEnd
        ? state
        : await setBreakState(stateEntity, state, 'on_break', null, {
            break_status: 'ending_break', last_break_request_id: requestId,
            break_pending_started_at: officialEnd,
          });
      if (!claimed) return Response.json({ success: false, error: 'Break end lost a concurrency race. Reload status before retrying.' }, { status: 409 });

      const updateResult = await breakEntity.updateMany(
        { id: breakRow.id, updated_date: breakRow.updated_date, user_email: target.email, time_entry_id: entry.id, status: 'active' },
        { $set: { ended_at: officialEnd, duration_minutes: durationMinutes, status: 'completed', end_request_id: requestId } },
      );
      if (!updateResult || updateResult.updated !== 1) {
        const freshBreak = await breakEntity.get(breakRow.id).catch(() => null);
        if (!(freshBreak?.status === 'completed' && String(freshBreak.end_request_id || '') === requestId)) {
          return Response.json({ success: false, retry_same_request: true, error: 'Break end could not safely update the break record. Retry the same request after status reload.' }, { status: 409 });
        }
        breakRow = freshBreak;
      } else {
        breakRow = await breakEntity.get(breakRow.id);
      }

      const currentClaim = await freshState(stateEntity, claimed.id);
      const auditClaim = await setBreakState(stateEntity, currentClaim, 'ending_break', requestId, {
        break_pending_started_at: currentClaim.break_pending_started_at || officialEnd,
      });
      if (!auditClaim) return Response.json({ success: false, retry_same_request: true, error: 'Break end is being recovered in another session. Retry the same action after status refresh.' }, { status: 409 });
      await ensureBreakAudit({ auditEntity, action: 'break_end', breakRow, target, actor, requestId, entryId: entry.id });
      const finalized = await setBreakState(stateEntity, auditClaim, 'ending_break', requestId, {
        break_status: 'working', active_break_id: null, break_pending_started_at: null,
      });
      if (!finalized) return Response.json({ success: false, retry_same_request: true, error: 'Break end and its audit were saved but state finalization was interrupted. Retry this same action to recover safely.' }, { status: 409 });
      const summary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
      return Response.json({ success: true, status: 'clocked_in', break_status: 'working', break: breakRow, break_summary: summary, entry, user: publicEmployee(target), audit_saved: true });
    }

    if (action === 'work_pause_start') {
      if (state.status !== 'clocked_in' || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Employee must be clocked in before pausing work.' }, { status: 409 });
      }
      if (target.can_work_pause !== true) {
        return Response.json({ success: false, error: 'Work Pause is not enabled for this employee.' }, { status: 403 });
      }
      if (actor.role !== 'badge' && actorEmail !== target.email) {
        return Response.json({ success: false, error: 'Employees can only pause their own work time.' }, { status: 403 });
      }
      if (breakStatusOf(state) !== 'working' || state.active_break_id) {
        return Response.json({ success: false, error: 'End the active break or lunch before pausing work.' }, { status: 409 });
      }
      if (laborStatusOf(state) !== 'idle') {
        return Response.json({ success: false, error: 'Current Work is still changing. Retry Work Pause after that server action finishes.' }, { status: 409 });
      }
      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }

      const pauseStatus = workPauseStatusOf(state);
      if (pauseStatus === 'paused') {
        const activePause = state.active_work_pause_id ? await workPauseEntity.get(state.active_work_pause_id).catch(() => null) : null;
        if (activePause?.id && activePause.status === 'active' && activePause.time_entry_id === entry.id && asEmail(activePause.user_email) === target.email) {
          if (String(activePause.start_request_id || '') !== requestId) {
            return Response.json({ success: false, error: 'Work is already paused. Resume Work before starting another pause.' }, { status: 409 });
          }
          await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_start', pauseRow: activePause, target, actor, requestId, entryId: entry.id });
          const summary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
          return Response.json({ success: true, status: 'already_paused', work_pause_status: 'paused', work_pause: activePause, work_pause_summary: summary, entry, user: publicEmployee(target), reused: true, work_pause_allowed: true });
        }
        return Response.json({ success: false, error: 'Work Pause state is active but its record is invalid. Admin review is required.' }, { status: 409 });
      }
      const resumingStart = pauseStatus === 'pausing' && String(state.last_work_pause_request_id || '') === requestId;
      if (pauseStatus !== 'working' && !resumingStart) {
        return Response.json({ success: false, error: 'Another Work Pause action is still in progress. Retry shortly.' }, { status: 409 });
      }

      const priorStartRequest = await uniqueRow(workPauseEntity, { user_email: target.email, time_entry_id: entry.id, start_request_id: requestId }, 'Work Pause start request');
      if (priorStartRequest?.id && !resumingStart) {
        return Response.json({
          success: false,
          error: priorStartRequest.status === 'completed'
            ? 'This Work Pause request was already completed. Start Pause Work again to use a new request.'
            : 'This Work Pause request is already bound to an existing pause. Reload authoritative status before continuing.',
        }, { status: 409 });
      }

      const activePauses = await workPauseEntity.filter({ user_email: target.email, time_entry_id: entry.id, status: 'active' });
      if (!Array.isArray(activePauses)) throw new Error('Active Work Pause lookup did not return a record list.');
      if (activePauses.length > 1) return Response.json({ success: false, error: 'Multiple active Work Pause records were found. Admin review is required.' }, { status: 409 });
      if (activePauses.length === 1 && String(activePauses[0].start_request_id || '') !== requestId) {
        return Response.json({ success: false, error: 'An active Work Pause already exists. Reload Time Clock status before retrying.' }, { status: 409 });
      }

      const officialStart = resumingStart && state.work_pause_pending_started_at
        ? state.work_pause_pending_started_at
        : new Date().toISOString();
      const claimed = resumingStart
        ? state
        : await setWorkPauseState(stateEntity, state, 'working', null, {
            work_pause_status: 'pausing', active_work_pause_id: null,
            last_work_pause_request_id: requestId, work_pause_pending_started_at: officialStart,
          });
      if (!claimed) return Response.json({ success: false, error: 'Work Pause start lost a concurrency race. Reload status before retrying.' }, { status: 409 });

      await closeActiveLaborSegment({
        laborEntity, auditEntity, entry, target, actor, actorEmail, requestId,
        endReason: 'work_pause', officialEnd: officialStart,
      });

      let pauseRow = await uniqueRow(workPauseEntity, { user_email: target.email, time_entry_id: entry.id, start_request_id: requestId }, 'Work Pause start request');
      if (!pauseRow) {
        pauseRow = await workPauseEntity.create({
          user_email: target.email,
          user_name: target.full_name || target.email,
          time_entry_id: entry.id,
          started_at: officialStart,
          status: 'active',
          start_request_id: requestId,
          source: 'server',
        });
      }
      if (!pauseRow?.id) throw new Error('Work Pause record could not be created.');
      if (pauseRow.status !== 'active') return Response.json({ success: false, error: 'This Work Pause request is not in an active state.' }, { status: 409 });

      const currentClaim = await freshState(stateEntity, claimed.id);
      const auditClaim = await setWorkPauseState(stateEntity, currentClaim, 'pausing', requestId, {
        work_pause_pending_started_at: currentClaim.work_pause_pending_started_at || officialStart,
      });
      if (!auditClaim) return Response.json({ success: false, retry_same_request: true, error: 'Work Pause is being recovered in another session. Retry the same action after status refresh.' }, { status: 409 });
      await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_start', pauseRow, target, actor, requestId, entryId: entry.id });
      const finalized = await setWorkPauseState(stateEntity, auditClaim, 'pausing', requestId, {
        work_pause_status: 'paused', active_work_pause_id: pauseRow.id, work_pause_pending_started_at: null,
      });
      if (!finalized) return Response.json({ success: false, retry_same_request: true, error: 'Work Pause and its audit were saved but state finalization was interrupted. Retry this same action to recover safely.' }, { status: 409 });
      const summary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
      const laborSummary = await laborSummaryForEntry(laborEntity, entry.id, target.email);
      return Response.json({ success: true, status: 'clocked_in', work_pause_status: 'paused', work_pause: pauseRow, work_pause_summary: summary, active_labor: null, labor_summary: laborSummary, entry, user: publicEmployee(target), audit_saved: true, work_pause_allowed: true });
    }

    if (action === 'work_pause_resume') {
      if (state.status !== 'clocked_in' || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Employee must be clocked in to resume work.' }, { status: 409 });
      }
      if (actor.role !== 'badge' && actorEmail !== target.email) {
        return Response.json({ success: false, error: 'Employees can only resume their own work time.' }, { status: 403 });
      }
      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }

      const pauseStatus = workPauseStatusOf(state);
      if (pauseStatus === 'working') {
        const prior = await uniqueRow(workPauseEntity, { user_email: target.email, time_entry_id: entry.id, resume_request_id: requestId }, 'Work Pause resume request');
        if (prior?.id && prior.status === 'completed') {
          await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_resume', pauseRow: prior, target, actor, requestId, entryId: entry.id });
          const summary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
          return Response.json({ success: true, status: 'clocked_in', work_pause_status: 'working', work_pause: prior, work_pause_summary: summary, entry, user: publicEmployee(target), reused: true, work_pause_allowed: target.can_work_pause === true });
        }
        return Response.json({ success: false, error: 'Employee is not currently Work Paused.' }, { status: 409 });
      }
      const resumingEnd = pauseStatus === 'resuming' && String(state.last_work_pause_request_id || '') === requestId;
      if (pauseStatus !== 'paused' && !resumingEnd) {
        return Response.json({ success: false, error: 'Another Work Pause action is still in progress. Retry shortly.' }, { status: 409 });
      }
      if (!state.active_work_pause_id) return Response.json({ success: false, error: 'The active Work Pause record is missing. Admin review is required.' }, { status: 409 });

      let pauseRow = await workPauseEntity.get(state.active_work_pause_id).catch(() => null);
      if (!pauseRow?.id || asEmail(pauseRow.user_email) !== target.email || pauseRow.time_entry_id !== entry.id) {
        return Response.json({ success: false, error: 'The active Work Pause does not match this employee shift. Admin review is required.' }, { status: 409 });
      }
      if (pauseRow.status === 'completed' && String(pauseRow.resume_request_id || '') === requestId) {
        await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_resume', pauseRow, target, actor, requestId, entryId: entry.id });
        const currentState = await freshState(stateEntity, state.id);
        const currentPauseStatus = workPauseStatusOf(currentState);
        if (currentPauseStatus === 'resuming') {
          const recovered = await setWorkPauseState(stateEntity, currentState, 'resuming', requestId, {
            work_pause_status: 'working', active_work_pause_id: null, work_pause_pending_started_at: null,
          });
          if (!recovered) return Response.json({ success: false, retry_same_request: true, error: 'Resume Work was saved but state finalization is incomplete. Retry this same action.' }, { status: 409 });
        } else if (currentPauseStatus === 'paused' && currentState.active_work_pause_id === pauseRow.id) {
          const recovered = await setWorkPauseState(stateEntity, currentState, 'paused', null, {
            work_pause_status: 'working', active_work_pause_id: null,
            last_work_pause_request_id: requestId, work_pause_pending_started_at: null,
          });
          if (!recovered) return Response.json({ success: false, retry_same_request: true, error: 'Resume Work record is complete but authoritative state still needs recovery. Retry status.' }, { status: 409 });
        }
        const summary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
        return Response.json({ success: true, status: 'clocked_in', work_pause_status: 'working', work_pause: pauseRow, work_pause_summary: summary, entry, user: publicEmployee(target), reused: true, work_pause_allowed: target.can_work_pause === true });
      }
      if (pauseRow.status !== 'active') return Response.json({ success: false, error: 'The active Work Pause is not resumable.' }, { status: 409 });

      const priorResumeRequest = await uniqueRow(workPauseEntity, { user_email: target.email, time_entry_id: entry.id, resume_request_id: requestId }, 'Work Pause resume request');
      if (priorResumeRequest?.id && priorResumeRequest.id !== pauseRow.id) {
        return Response.json({ success: false, error: 'This Resume Work request was already used for an earlier pause. Retry with a new request.' }, { status: 409 });
      }

      const officialResume = resumingEnd && state.work_pause_pending_started_at
        ? state.work_pause_pending_started_at
        : new Date().toISOString();
      const startedMs = new Date(pauseRow.started_at).getTime();
      const resumedMs = new Date(officialResume).getTime();
      if (!Number.isFinite(startedMs) || resumedMs < startedMs) return Response.json({ success: false, error: 'The stored Work Pause start timestamp is invalid.' }, { status: 409 });
      const durationMinutes = Math.max(0, Math.floor((resumedMs - startedMs) / 60000));
      const claimed = resumingEnd
        ? state
        : await setWorkPauseState(stateEntity, state, 'paused', null, {
            work_pause_status: 'resuming', last_work_pause_request_id: requestId,
            work_pause_pending_started_at: officialResume,
          });
      if (!claimed) return Response.json({ success: false, error: 'Resume Work lost a concurrency race. Reload status before retrying.' }, { status: 409 });

      const updateResult = await workPauseEntity.updateMany(
        { id: pauseRow.id, updated_date: pauseRow.updated_date, user_email: target.email, time_entry_id: entry.id, status: 'active' },
        { $set: { resumed_at: officialResume, duration_minutes: durationMinutes, status: 'completed', resume_request_id: requestId } },
      );
      if (!updateResult || updateResult.updated !== 1) {
        const freshPause = await workPauseEntity.get(pauseRow.id).catch(() => null);
        if (!(freshPause?.status === 'completed' && String(freshPause.resume_request_id || '') === requestId)) {
          return Response.json({ success: false, retry_same_request: true, error: 'Resume Work could not safely update the pause record. Retry the same request after status reload.' }, { status: 409 });
        }
        pauseRow = freshPause;
      } else {
        pauseRow = await workPauseEntity.get(pauseRow.id);
      }

      const currentClaim = await freshState(stateEntity, claimed.id);
      const auditClaim = await setWorkPauseState(stateEntity, currentClaim, 'resuming', requestId, {
        work_pause_pending_started_at: currentClaim.work_pause_pending_started_at || officialResume,
      });
      if (!auditClaim) return Response.json({ success: false, retry_same_request: true, error: 'Resume Work is being recovered in another session. Retry the same action after status refresh.' }, { status: 409 });
      await ensureWorkPauseAudit({ auditEntity, action: 'work_pause_resume', pauseRow, target, actor, requestId, entryId: entry.id });
      const finalized = await setWorkPauseState(stateEntity, auditClaim, 'resuming', requestId, {
        work_pause_status: 'working', active_work_pause_id: null, work_pause_pending_started_at: null,
      });
      if (!finalized) return Response.json({ success: false, retry_same_request: true, error: 'Resume Work and its audit were saved but state finalization was interrupted. Retry this same action to recover safely.' }, { status: 409 });
      const summary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
      return Response.json({ success: true, status: 'clocked_in', work_pause_status: 'working', work_pause: pauseRow, work_pause_summary: summary, entry, user: publicEmployee(target), audit_saved: true, work_pause_allowed: target.can_work_pause === true });
    }

    if (action === 'time_off_request_create' || action === 'time_off_request_update') {
      if (actor.role === 'badge' || actorEmail !== target.email) {
        return Response.json({ success: false, error: 'Employees must use their own signed-in Time Clock session to manage time-off requests.' }, { status: 403 });
      }

      const requestType = String(body?.request_type || '').trim();
      const startDate = validDateKey(body?.start_date);
      const endDate = validDateKey(body?.end_date);
      const hoursRequested = Number(body?.hours_requested);
      const reason = String(body?.reason || '').trim().slice(0, 1000);
      if (!['vacation', 'sick', 'personal', 'bereavement', 'jury_duty', 'other'].includes(requestType)) {
        return Response.json({ success: false, error: 'A valid time-off request type is required.' }, { status: 400 });
      }
      if (!startDate || !endDate || endDate < startDate) {
        return Response.json({ success: false, error: 'Valid time-off start and end dates are required.' }, { status: 400 });
      }
      if (!Number.isFinite(hoursRequested) || hoursRequested <= 0 || hoursRequested > 2000) {
        return Response.json({ success: false, error: 'Requested time-off hours must be greater than zero.' }, { status: 400 });
      }

      const requestedFields = {
        request_type: requestType,
        start_date: startDate,
        end_date: endDate,
        hours_requested: hoursRequested,
        reason,
      };

      if (action === 'time_off_request_create') {
        const timeOffCreateLock = await claimTimeOffCreateLock(stateEntity, state.id, requestId);
        if (!timeOffCreateLock?.acquired) {
          return Response.json({
            success: false,
            ...(timeOffCreateLock?.retry_same_request === true ? { retry_same_request: true } : {}),
            error: timeOffCreateLock?.error || 'Time Off request creation could not acquire its authoritative lock.',
          }, { status: 409 });
        }

        try {
        const createPayloadHash = await payloadHash(requestedFields);
        const createClaimToken = crypto.randomUUID();
        const CREATE_CLAIM_STALE_MS = 30_000;
        let createAudit = await uniqueRow(
          auditEntity,
          { action: 'time_off_request_create', request_id: requestId, user_email: target.email },
          'Time-off request create audit',
        );
        let ownsCreateClaim = false;

        if (!createAudit?.id) {
          const intentTimestamp = new Date().toISOString();
          try {
            await auditEntity.create({
              action: 'time_off_request_create',
              outcome: 'pending',
              user_email: target.email,
              user_name: target.full_name || target.email,
              actor_email: actorEmail,
              actor_role: actor.role,
              authentication_method: authenticationMethodFor(actor, target),
              server_timestamp: intentTimestamp,
              request_id: requestId,
              reason,
              details: {
                payload_hash: createPayloadHash,
                request_type: requestType,
                start_date: startDate,
                end_date: endDate,
                hours_requested: hoursRequested,
                requested_reason: reason,
                create_claim_token: createClaimToken,
              },
            });
          } catch (error) {
            console.error('Time-off create audit intent write was ambiguous; verifying exact request:', error?.message || error);
          }

          const intentRows = await auditEntity.filter({
            action: 'time_off_request_create',
            request_id: requestId,
            user_email: target.email,
          });
          if (!Array.isArray(intentRows)) throw new Error('Time-off create audit intent lookup did not return a record list.');
          if (intentRows.length > 1) {
            return Response.json({ success: false, error: 'This time-off submission has multiple audit intents. No request was created by this attempt; admin investigation is required.' }, { status: 409 });
          }
          if (intentRows.length !== 1) {
            return Response.json({ success: false, retry_same_request: true, error: 'The time-off audit intent could not be verified. Retry the same request.' }, { status: 409 });
          }
          createAudit = intentRows[0];
          ownsCreateClaim = String(createAudit.details?.create_claim_token || '') === createClaimToken;
        }

        const priorHash = String(createAudit?.details?.payload_hash || '');
        if (priorHash && !constantTimeEqual(priorHash, createPayloadHash)) {
          return Response.json({ success: false, error: 'This time-off request id is already bound to different request details.' }, { status: 409 });
        }
        if (createAudit?.outcome === 'blocked') {
          return Response.json({ success: false, error: 'This time-off request was previously blocked. Reload before submitting again.' }, { status: 409 });
        }
        if (['confirmed', 'recovered', 'reused'].includes(String(createAudit?.outcome || ''))) {
          const priorId = String(createAudit.details?.time_off_request_id || '');
          const priorRecord = priorId ? await timeOffRequestEntity.get(priorId).catch(() => null) : null;
          if (!priorRecord?.id || asEmail(priorRecord.user_email) !== target.email) {
            return Response.json({ success: false, error: 'The time-off create audit is complete but its request record is missing. Admin investigation is required.' }, { status: 409 });
          }
          return Response.json({ success: true, request: priorRecord, audit_id: createAudit.id, reused: true });
        }
        if (String(createAudit?.outcome || '') !== 'pending') {
          return Response.json({ success: false, error: 'The time-off create audit is not in a recoverable state.' }, { status: 409 });
        }

        let saved = await uniqueRow(
          timeOffRequestEntity,
          { user_email: target.email, last_request_id: requestId },
          'Time-off create request id',
        );
        let createdNow = false;
        let reusedExisting = false;

        if (saved?.id) {
          const storedHash = String(saved.last_request_payload_hash || '');
          if (storedHash && !constantTimeEqual(storedHash, createPayloadHash)) {
            return Response.json({ success: false, error: 'This time-off request id is already bound to different request details.' }, { status: 409 });
          }
        } else {
          const matching = await timeOffRequestEntity.filter({
            user_email: target.email,
            request_type: requestType,
            start_date: startDate,
            end_date: endDate,
            status: 'pending',
            archived_test_data: { $ne: true },
          });
          if (!Array.isArray(matching)) throw new Error('Pending time-off request lookup did not return a record list.');
          if (matching.length > 1) {
            await auditEntity.updateMany(
              { id: createAudit.id, outcome: 'pending', request_id: requestId },
              { $set: { outcome: 'blocked' } },
            );
            return Response.json({ success: false, error: 'Multiple matching pending time-off requests already exist. Admin review is required before another is submitted.' }, { status: 409 });
          }
          if (matching.length === 1) {
            const existing = matching[0];
            if (
              Number(existing.hours_requested || 0) !== hoursRequested ||
              String(existing.reason || '') !== reason
            ) {
              await auditEntity.updateMany(
                { id: createAudit.id, outcome: 'pending', request_id: requestId },
                { $set: { outcome: 'blocked' } },
              );
              return Response.json({ success: false, error: 'A pending request already exists for these dates and type with different details. Edit that request instead.' }, { status: 409 });
            }
            saved = existing;
            reusedExisting = true;
          }
        }

        if (!saved?.id && !ownsCreateClaim) {
          const claimTimestampMs = Date.parse(String(createAudit.server_timestamp || ''));
          const claimAgeMs = Number.isFinite(claimTimestampMs) ? Date.now() - claimTimestampMs : 0;
          if (!Number.isFinite(claimTimestampMs) || claimAgeMs < CREATE_CLAIM_STALE_MS) {
            return Response.json({ success: false, retry_same_request: true, error: 'This time-off submission is already being processed. Retry the same request after status refresh.' }, { status: 409 });
          }

          const takeoverTimestamp = new Date().toISOString();
          const takeoverDetails = {
            ...(createAudit.details || {}),
            payload_hash: createPayloadHash,
            create_claim_token: createClaimToken,
            claim_recovered_at: takeoverTimestamp,
          };
          const claimed = await auditEntity.updateMany(
            {
              id: createAudit.id,
              outcome: 'pending',
              request_id: requestId,
              user_email: target.email,
              server_timestamp: createAudit.server_timestamp,
            },
            { $set: { server_timestamp: takeoverTimestamp, details: takeoverDetails } },
          );
          if (!claimed || claimed.updated !== 1) {
            return Response.json({ success: false, retry_same_request: true, error: 'Another session is recovering this time-off submission. Retry the same request after status refresh.' }, { status: 409 });
          }
          createAudit = await auditEntity.get(createAudit.id);
          ownsCreateClaim = String(createAudit?.details?.create_claim_token || '') === createClaimToken;
          if (!ownsCreateClaim) {
            return Response.json({ success: false, retry_same_request: true, error: 'The time-off submission recovery claim could not be verified. Retry the same request.' }, { status: 409 });
          }
        }

        if (!saved?.id) {
          saved = await timeOffRequestEntity.create({
            user_email: target.email,
            user_name: target.full_name || target.email,
            ...requestedFields,
            status: 'pending',
            last_request_id: requestId,
            last_request_payload_hash: createPayloadHash,
          });
          if (!saved?.id) {
            return Response.json({ success: false, retry_same_request: true, error: 'The time-off request could not be verified after create. Retry the same request.' }, { status: 409 });
          }
          createdNow = true;
          const requestRows = await timeOffRequestEntity.filter({ user_email: target.email, last_request_id: requestId });
          if (!Array.isArray(requestRows) || requestRows.length !== 1 || requestRows[0]?.id !== saved.id) {
            await auditEntity.updateMany(
              { id: createAudit.id, outcome: 'pending', request_id: requestId },
              { $set: { outcome: 'blocked' } },
            );
            return Response.json({ success: false, error: 'Time-off request creation could not be verified uniquely. Admin review is required.' }, { status: 409 });
          }
        }

        const finalOutcome = reusedExisting ? 'reused' : createdNow ? 'confirmed' : 'recovered';
        const finalized = await auditEntity.updateMany(
          { id: createAudit.id, outcome: 'pending', request_id: requestId, user_email: target.email },
          { $set: {
            outcome: finalOutcome,
            server_timestamp: new Date().toISOString(),
            reason,
            details: {
              ...(createAudit.details || {}),
              payload_hash: createPayloadHash,
              time_off_request_id: saved.id,
              request_type: requestType,
              start_date: startDate,
              end_date: endDate,
              hours_requested: hoursRequested,
              requested_reason: reason,
              reused_existing: reusedExisting,
              recovered_after_request_save: !createdNow && !reusedExisting,
            },
          } },
        );
        if (!finalized || finalized.updated !== 1) {
          const freshAudit = await auditEntity.get(createAudit.id).catch(() => null);
          if (!freshAudit || !['confirmed', 'recovered', 'reused'].includes(String(freshAudit.outcome || ''))) {
            return Response.json({ success: false, retry_same_request: true, error: 'The time-off request was saved but its audit could not be finalized. Retry the same request.' }, { status: 409 });
          }
          createAudit = freshAudit;
        } else {
          createAudit = await auditEntity.get(createAudit.id).catch(() => createAudit);
        }

        return Response.json({
          success: true,
          request: saved,
          audit_id: createAudit.id,
          reused: finalOutcome !== 'confirmed',
        });
        } finally {
          try {
            await releaseTimeOffCreateLock(
              stateEntity,
              state.id,
              requestId,
              String(timeOffCreateLock.claim_token || ''),
            );
          } catch (error) {
            console.error('Time Off create lock release failed; stale same-request recovery remains available:', error?.message || error);
          }
        }
      }

      const timeOffRequestId = String(body?.time_off_request_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      if (!timeOffRequestId || !expectedUpdatedDate) {
        return Response.json({ success: false, error: 'The loaded time-off request version is required before editing it.' }, { status: 400 });
      }
      const updatePayloadHash = await payloadHash({
        time_off_request_id: timeOffRequestId,
        expected_updated_date: expectedUpdatedDate,
        ...requestedFields,
      });
      let requestRecord = await timeOffRequestEntity.get(timeOffRequestId).catch(() => null);
      if (!requestRecord?.id || asEmail(requestRecord.user_email) !== target.email || requestRecord.archived_test_data) {
        return Response.json({ success: false, error: 'Time-off request was not found or is archived.' }, { status: 404 });
      }

      const updatedFieldsMatch = (row: any) => (
        row?.id === timeOffRequestId &&
        String(row.request_type || '') === requestType &&
        String(row.start_date || '') === startDate &&
        String(row.end_date || '') === endDate &&
        Number(row.hours_requested) === hoursRequested &&
        String(row.reason || '') === reason
      );
      const auditQuery = { action: 'time_off_request_update', request_id: requestId, user_email: target.email };
      let updateIntent = await uniqueRow(auditEntity, auditQuery, 'Time-off request update audit');
      if (updateIntent?.id) {
        const priorHash = String(updateIntent.details?.payload_hash || '');
        if (!priorHash || !constantTimeEqual(priorHash, updatePayloadHash) ||
          String(updateIntent.details?.time_off_request_id || '') !== timeOffRequestId) {
          return Response.json({ success: false, error: 'This time-off update request id has mismatched or incomplete audit details. Admin investigation is required.' }, { status: 409 });
        }
        if (updateIntent.outcome === 'blocked') {
          return Response.json({ success: false, error: 'This time-off update was previously blocked. Reload before submitting another edit.' }, { status: 409 });
        }
        if (['confirmed', 'recovered'].includes(String(updateIntent.outcome || ''))) {
          if (String(requestRecord.last_request_id || '') !== requestId ||
              !constantTimeEqual(String(requestRecord.last_request_payload_hash || ''), updatePayloadHash) ||
              !updatedFieldsMatch(requestRecord)) {
            return Response.json({ success: false, error: 'The completed time-off edit audit no longer matches the request record. Admin investigation is required.' }, { status: 409 });
          }
          return Response.json({ success: true, request: requestRecord, audit_id: updateIntent.id, reused: true });
        }
        if (updateIntent.outcome !== 'pending') {
          return Response.json({ success: false, error: 'This time-off edit audit is not in a recoverable state.' }, { status: 409 });
        }
      }

      const sameRequestSaved = String(requestRecord.last_request_id || '') === requestId;
      if (sameRequestSaved && (
        !constantTimeEqual(String(requestRecord.last_request_payload_hash || ''), updatePayloadHash) ||
        !updatedFieldsMatch(requestRecord)
      )) {
        return Response.json({ success: false, error: 'This time-off update request id no longer matches the saved edit. Admin investigation is required.' }, { status: 409 });
      }
      if (!sameRequestSaved && (
        requestRecord.status !== 'pending' || String(requestRecord.updated_date || '') !== expectedUpdatedDate
      )) {
        return Response.json({ success: false, error: 'This time-off request is no longer pending at its loaded version. Reload before editing.' }, { status: 409 });
      }

      const hadPendingAudit = updateIntent?.outcome === 'pending';
      if (!updateIntent?.id) {
        try {
          const ensured = await ensureUserActionAudit(auditEntity, {
            action: 'time_off_request_update',
            outcome: 'pending',
            user_email: target.email,
            user_name: target.full_name || target.email,
            actor_email: actorEmail,
            actor_role: actor.role,
            authentication_method: authenticationMethodFor(actor, target),
            server_timestamp: new Date().toISOString(),
            request_id: requestId,
            reason,
            details: {
              payload_hash: updatePayloadHash,
              time_off_request_id: timeOffRequestId,
              expected_updated_date: expectedUpdatedDate,
              previous_fields: {
                request_type: requestRecord.request_type,
                start_date: requestRecord.start_date,
                end_date: requestRecord.end_date,
                hours_requested: requestRecord.hours_requested,
                reason: requestRecord.reason,
              },
              requested_fields: requestedFields,
            },
          }, 'Time-off request update audit intent');
          updateIntent = ensured.audit;
        } catch {
          return Response.json({ success: false, retry_same_request: true, error: 'The time-off edit audit intent could not be verified. Retry the same update.' }, { status: 409 });
        }
      }
      // Audit creation can race; never mutate while the request id has ambiguous audit evidence.
      updateIntent = await uniqueRow(auditEntity, auditQuery, 'Time-off request update audit intent');
      if (!updateIntent?.id || updateIntent.outcome !== 'pending' ||
        !constantTimeEqual(String(updateIntent.details?.payload_hash || ''), updatePayloadHash) ||
        String(updateIntent.details?.time_off_request_id || '') !== timeOffRequestId) {
        return Response.json({ success: false, error: 'The time-off edit audit intent is ambiguous or no longer pending. Admin review is required.' }, { status: 409 });
      }

      if (!sameRequestSaved) {
        if (requestRecord.status !== 'pending') {
          return Response.json({ success: false, error: 'Only pending time-off requests can be edited.' }, { status: 409 });
        }
        if (String(requestRecord.updated_date || '') !== expectedUpdatedDate) {
          return Response.json({ success: false, error: 'This time-off request changed in another session. Reload before editing it.' }, { status: 409 });
        }
        const updated = await timeOffRequestEntity.updateMany(
          { id: requestRecord.id, updated_date: expectedUpdatedDate, user_email: target.email, status: 'pending', archived_test_data: { $ne: true } },
          { $set: { ...requestedFields, last_request_id: requestId, last_request_payload_hash: updatePayloadHash } },
        );
        if (!updated || updated.updated !== 1) {
          const raced = await timeOffRequestEntity.get(requestRecord.id).catch(() => null);
          if (raced?.id && String(raced.last_request_id || '') === requestId &&
            constantTimeEqual(String(raced.last_request_payload_hash || ''), updatePayloadHash) &&
            updatedFieldsMatch(raced)) {
            requestRecord = raced; // The exact same request succeeded in another session.
          } else {
            await auditEntity.updateMany(
              { id: updateIntent.id, outcome: 'pending', request_id: requestId, user_email: target.email },
              { $set: { outcome: 'blocked' } },
            );
            return Response.json({ success: false, error: 'This time-off request changed in another session. Reload before editing it.' }, { status: 409 });
          }
        } else {
          requestRecord = await timeOffRequestEntity.get(requestRecord.id);
        }
      }

      // A saved edit is never success without the exact record fields, request marker,
      // and a confirmed/recovered audit for this employee and request id.
      if (!requestRecord?.id ||
        String(requestRecord.last_request_id || '') !== requestId ||
        !constantTimeEqual(String(requestRecord.last_request_payload_hash || ''), updatePayloadHash) ||
        !updatedFieldsMatch(requestRecord)) {
        return Response.json({ success: false, error: 'The saved time-off edit no longer matches its audit intent. Admin investigation is required.' }, { status: 409 });
      }

      const finalOutcome = hadPendingAudit || sameRequestSaved ? 'recovered' : 'confirmed';
      const finalized = await auditEntity.updateMany(
        { id: updateIntent.id, outcome: 'pending', request_id: requestId, user_email: target.email },
        { $set: {
          outcome: finalOutcome,
          server_timestamp: new Date().toISOString(),
          details: {
            ...(updateIntent.details || {}),
            payload_hash: updatePayloadHash,
            time_off_request_id: timeOffRequestId,
            saved_updated_date: requestRecord.updated_date,
            requested_fields: requestedFields,
          },
        } },
      );
      if (!finalized || finalized.updated !== 1) {
        const fresh = await uniqueRow(auditEntity, auditQuery, 'Time-off update audit finalization');
        if (!fresh?.id || fresh.id !== updateIntent.id ||
          !['confirmed', 'recovered'].includes(String(fresh.outcome || '')) ||
          !constantTimeEqual(String(fresh.details?.payload_hash || ''), updatePayloadHash) ||
          String(fresh.details?.time_off_request_id || '') !== timeOffRequestId) {
          return Response.json({ success: false, retry_same_request: true, error: 'The time-off edit was saved but its audit finalization is incomplete. Retry the same update.' }, { status: 409 });
        }
        updateIntent = fresh;
      } else {
        updateIntent = await uniqueRow(auditEntity, auditQuery, 'Confirmed time-off edit audit');
      }

      const confirmedRecord = await timeOffRequestEntity.get(timeOffRequestId).catch(() => null);
      if (!updateIntent?.id || !['confirmed', 'recovered'].includes(String(updateIntent.outcome || '')) ||
        !constantTimeEqual(String(updateIntent.details?.payload_hash || ''), updatePayloadHash) ||
        String(updateIntent.details?.time_off_request_id || '') !== timeOffRequestId ||
        !confirmedRecord?.id || asEmail(confirmedRecord.user_email) !== target.email ||
        String(confirmedRecord.last_request_id || '') !== requestId ||
        !constantTimeEqual(String(confirmedRecord.last_request_payload_hash || ''), updatePayloadHash) ||
        !updatedFieldsMatch(confirmedRecord)) {
        return Response.json({ success: false, error: 'The time-off edit and confirmed audit do not agree. Admin investigation is required.' }, { status: 409 });
      }
      return Response.json({ success: true, request: confirmedRecord, audit_id: updateIntent.id, reused: finalOutcome === 'recovered' });
    }

    if (action === 'list_correction_requests') {
      if (actor.role === 'badge') return Response.json({ success: false, error: 'A signed-in session is required to view correction requests.' }, { status: 403 });
      const adminScope = actor.role === 'admin' && String(body?.scope || '') === 'admin';
      const query = adminScope
        ? { status: { $in: ['pending', 'reviewing'] } }
        : { user_email: target.email };
      const requests = await correctionRequestEntity.filter(query);
      if (!Array.isArray(requests)) throw new Error('Correction request list did not return records.');
      requests.sort((a: any, b: any) => new Date(b.requested_at || b.created_date || 0).getTime() - new Date(a.requested_at || a.created_date || 0).getTime());
      return Response.json({ success: true, requests });
    }

    if (action === 'update_notes') {
      if (actor.role === 'badge' || actorEmail !== target.email) {
        return Response.json({ success: false, error: 'Employees must use their own signed-in Time Clock session to edit notes.' }, { status: 403 });
      }
      const entryId = String(body?.entry_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      const notes = String(body?.notes || '').trim();
      if (!entryId || !expectedUpdatedDate) {
        return Response.json({ success: false, error: 'The loaded TimeEntry version is required before editing notes.' }, { status: 400 });
      }
      if (notes.length > 4000) return Response.json({ success: false, error: 'Time entry notes are limited to 4,000 characters.' }, { status: 400 });

      let entry = await entryEntity.get(entryId).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'TimeEntry was not found or is archived.' }, { status: 404 });
      }

      const notesPayloadHash = await payloadHash({ entry_id: entry.id, expected_updated_date: expectedUpdatedDate, notes });
      const savedByThisRequest = (record: any) => Boolean(
        record?.id &&
        asEmail(record.user_email) === target.email &&
        String(record.notes || '') === notes &&
        String(record.last_notes_request_id || '') === requestId &&
        constantTimeEqual(String(record.last_notes_payload_hash || ''), notesPayloadHash)
      );
      const auditMatchesThisRequest = (auditRow: any) => Boolean(
        auditRow?.id &&
        asEmail(auditRow.user_email) === target.email &&
        asEmail(auditRow.actor_email) === actorEmail &&
        constantTimeEqual(String(auditRow.details?.payload_hash || ''), notesPayloadHash) &&
        String(auditRow.details?.expected_updated_date || '') === expectedUpdatedDate
      );

      const auditQuery = { action: 'notes_update', request_id: requestId, time_entry_id: entry.id };
      const priorAudits = await auditEntity.filter(auditQuery);
      if (!Array.isArray(priorAudits)) throw new Error('Notes audit lookup did not return a record list.');
      if (priorAudits.length > 1) return Response.json({ success: false, error: 'This notes update has multiple audit records. Admin investigation is required.' }, { status: 409 });
      let intent: any = priorAudits[0] || null;

      if (intent?.id) {
        if (!auditMatchesThisRequest(intent)) {
          return Response.json({ success: false, error: 'This notes request id is already bound to different employee, version, or note details. Admin investigation is required.' }, { status: 409 });
        }
        if (intent.outcome === 'blocked') {
          return Response.json({ success: false, error: 'This notes request was previously blocked. Reload and submit a new notes update.' }, { status: 409 });
        }
        if (['confirmed', 'recovered'].includes(String(intent.outcome || ''))) {
          return Response.json({
            success: true,
            entry,
            audit_id: intent.id,
            reused: true,
            superseded: !savedByThisRequest(entry),
          });
        }
        if (intent.outcome === 'pending' && savedByThisRequest(entry)) {
          const recoveredAt = new Date().toISOString();
          const recovered = await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id, user_email: target.email },
            { $set: {
              outcome: 'recovered',
              server_timestamp: recoveredAt,
              details: {
                ...(intent.details || {}),
                payload_hash: notesPayloadHash,
                expected_updated_date: expectedUpdatedDate,
                new_notes: notes,
                saved_updated_date: entry.updated_date,
                recovered_after_entry_save: true,
              },
            } },
          );
          if (!recovered || recovered.updated !== 1) {
            const freshAudit = await auditEntity.get(intent.id).catch(() => null);
            if (
              !freshAudit ||
              !['confirmed', 'recovered'].includes(String(freshAudit.outcome || '')) ||
              !auditMatchesThisRequest(freshAudit)
            ) {
              return Response.json({ success: false, retry_same_request: true, error: 'The notes were saved but their audit is still being finalized. Retry the same notes update.' }, { status: 409 });
            }
            intent = freshAudit;
          } else {
            intent = await auditEntity.get(intent.id);
          }
          entry = await entryEntity.get(entry.id);
          if (!savedByThisRequest(entry) || !auditMatchesThisRequest(intent)) {
            return Response.json({ success: false, error: 'The recovered notes update no longer matches its TimeEntry marker or audit. Admin investigation is required.' }, { status: 409 });
          }
          return Response.json({ success: true, entry, audit_id: intent.id, reused: true });
        }
        if (intent.outcome === 'pending' && String(entry.updated_date || '') !== expectedUpdatedDate) {
          await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id, user_email: target.email },
            { $set: {
              outcome: 'blocked',
              details: { ...(intent.details || {}), blocked_reason: entryIsPayPeriodLocked(entry) ? 'pay_period_locked_before_note_save' : 'time_entry_changed_before_note_save' },
            } },
          );
          if (entryIsPayPeriodLocked(entry)) {
            return Response.json({ success: false, error: 'This shift was locked by a finalized pay period before the notes update could be saved. Reopen that pay period before editing notes.' }, { status: 409 });
          }
          return Response.json({ success: false, error: 'This time entry changed in another session before the notes update could be saved. Reload before editing its notes.' }, { status: 409 });
        }
      }

      if (entryIsPayPeriodLocked(entry)) {
        if (intent?.id && intent.outcome === 'pending') {
          await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id, user_email: target.email },
            { $set: {
              outcome: 'blocked',
              details: { ...(intent.details || {}), blocked_reason: 'pay_period_locked_before_note_save' },
            } },
          );
        }
        return Response.json({ success: false, error: 'This shift is locked by a finalized pay period. Reopen that pay period before editing notes.' }, { status: 409 });
      }

      const now = new Date().toISOString();
      if (!intent) {
        try {
          await auditEntity.create({
            action: 'notes_update', outcome: 'pending', user_email: target.email,
            user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
            authentication_method: authenticationMethodFor(actor, target),
            server_timestamp: now, request_id: requestId, time_entry_id: entry.id,
            details: { payload_hash: notesPayloadHash, expected_updated_date: expectedUpdatedDate, previous_notes: entry.notes || '', requested_notes: notes },
          });
        } catch (error) {
          console.error('Notes audit intent write was ambiguous; verifying exact request:', error?.message || error);
        }
        const createdAudits = await auditEntity.filter(auditQuery);
        if (!Array.isArray(createdAudits)) throw new Error('Notes audit intent verification did not return a record list.');
        if (createdAudits.length > 1) {
          return Response.json({ success: false, error: 'This notes update has multiple audit intents. No note was changed by this attempt; admin investigation is required.' }, { status: 409 });
        }
        intent = createdAudits[0] || null;
      }
      if (!intent?.id || intent.outcome !== 'pending' || !auditMatchesThisRequest(intent)) {
        return Response.json({ success: false, retry_same_request: true, error: 'The notes audit intent could not be verified. Retry the same notes update.' }, { status: 409 });
      }

      const savedAt = new Date().toISOString();
      const updateResult = await entryEntity.updateMany(
        { id: entry.id, updated_date: expectedUpdatedDate, user_email: target.email, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
        { $set: {
          notes,
          last_notes_request_id: requestId,
          last_notes_payload_hash: notesPayloadHash,
          last_notes_updated_at: savedAt,
          last_notes_updated_by: actorEmail,
        } },
      );

      let savedEntry = await entryEntity.get(entry.id).catch(() => null);
      if (!updateResult || updateResult.updated !== 1) {
        if (!savedByThisRequest(savedEntry)) {
          await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id, user_email: target.email },
            { $set: {
              outcome: 'blocked',
              details: {
                ...(intent.details || {}),
                blocked_reason: entryIsPayPeriodLocked(savedEntry) ? 'pay_period_locked_before_note_save' : 'time_entry_changed_before_note_save',
              },
            } },
          );
          if (entryIsPayPeriodLocked(savedEntry)) {
            return Response.json({ success: false, error: 'This shift was locked by a finalized pay period before the notes update could be saved. Reopen that pay period before editing notes.' }, { status: 409 });
          }
          return Response.json({ success: false, error: 'This time entry changed in another session. Reload before editing its notes.' }, { status: 409 });
        }
      }

      if (!savedByThisRequest(savedEntry)) {
        return Response.json({ success: false, error: 'The notes update response was ambiguous and its TimeEntry request marker could not be verified. Admin investigation is required.' }, { status: 409 });
      }

      const auditFinalized = await auditEntity.updateMany(
        { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id, user_email: target.email },
        { $set: {
          outcome: 'confirmed',
          server_timestamp: new Date().toISOString(),
          details: {
            ...(intent.details || {}),
            payload_hash: notesPayloadHash,
            expected_updated_date: expectedUpdatedDate,
            previous_notes: entry.notes || '',
            new_notes: notes,
            saved_updated_date: savedEntry.updated_date,
          },
        } },
      );
      if (!auditFinalized || auditFinalized.updated !== 1) {
        const freshAudit = await auditEntity.get(intent.id).catch(() => null);
        if (
          !freshAudit ||
          !['confirmed', 'recovered'].includes(String(freshAudit.outcome || '')) ||
          !auditMatchesThisRequest(freshAudit)
        ) {
          return Response.json({ success: false, retry_same_request: true, error: 'The notes were saved but audit finalization was interrupted. Retry the same notes update.' }, { status: 409 });
        }
        intent = freshAudit;
      } else {
        intent = await auditEntity.get(intent.id);
      }

      savedEntry = await entryEntity.get(entry.id).catch(() => null);
      if (!savedByThisRequest(savedEntry) || !auditMatchesThisRequest(intent) || !['confirmed', 'recovered'].includes(String(intent?.outcome || ''))) {
        return Response.json({ success: false, error: 'The saved notes and audit do not agree. Admin investigation is required.' }, { status: 409 });
      }
      return Response.json({ success: true, entry: savedEntry, audit_id: intent.id });
    }

    if (action === 'submit_correction_request') {
      if (actor.role === 'badge' || actorEmail !== target.email) {
        return Response.json({ success: false, error: 'Employees must use their own signed-in Time Clock session to request a correction.' }, { status: 403 });
      }
      const entryId = String(body?.entry_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      const reason = String(body?.reason || '').trim();
      const requested = body?.requested_changes || {};
      if (!entryId || !expectedUpdatedDate) return Response.json({ success: false, error: 'The loaded TimeEntry version is required before requesting a correction.' }, { status: 400 });
      if (reason.length < 3 || reason.length > 1000) return Response.json({ success: false, error: 'Describe the correction in 3 to 1,000 characters.' }, { status: 400 });

      const priorByRequest = await uniqueRow(correctionRequestEntity, { request_id: requestId }, 'Correction request id');
      if (priorByRequest?.id) {
        if (asEmail(priorByRequest.user_email) !== target.email || String(priorByRequest.time_entry_id || '') !== entryId) {
          return Response.json({ success: false, error: 'Correction request id is already in use.' }, { status: 409 });
        }
        const priorChanges = priorByRequest.requested_changes || {};
        const retryClockIn = new Date(String(requested?.clock_in ?? priorChanges.clock_in ?? ''));
        const retryClockOut = new Date(String(requested?.clock_out ?? priorChanges.clock_out ?? ''));
        const retryLunchMinutes = Math.round(Number(requested?.lunch_minutes ?? priorChanges.lunch_minutes ?? 0));
        if (!Number.isFinite(retryClockIn.getTime()) || !Number.isFinite(retryClockOut.getTime()) || retryClockOut.getTime() < retryClockIn.getTime()) {
          return Response.json({ success: false, error: 'Retrying this correction request requires the original valid punch values.' }, { status: 400 });
        }
        const retryChanges = {
          clock_in: retryClockIn.toISOString(),
          clock_out: retryClockOut.toISOString(),
          lunch_minutes: retryLunchMinutes,
          notes: String(requested?.notes ?? priorChanges.notes ?? '').trim().slice(0, 4000),
        };
        const retryHash = await payloadHash({ entry_id: entryId, expected_updated_date: expectedUpdatedDate, reason, requested_changes: retryChanges });
        // A correction submitted against an approved shift advances the review
        // version when approval returns to Needs Review. Idempotency stays bound
        // to the immutable version in the employee's original snapshot.
        const originalSubmissionVersion = String(
          priorByRequest.original_snapshot?.updated_date || priorByRequest.time_entry_updated_date || '',
        );
        const storedHash = await payloadHash({
          entry_id: priorByRequest.time_entry_id,
          expected_updated_date: originalSubmissionVersion,
          reason: priorByRequest.employee_reason,
          requested_changes: priorChanges,
        });
        if (!constantTimeEqual(retryHash, storedHash)) {
          return Response.json({ success: false, error: 'This correction request id is already bound to different correction details. Submit a new request.' }, { status: 409 });
        }

        const priorAudits = await auditEntity.filter({ action: 'correction_request', request_id: requestId, time_entry_id: entryId });
        if (!Array.isArray(priorAudits)) throw new Error('Correction-request audit lookup did not return a record list.');
        if (priorAudits.length > 1) return Response.json({ success: false, error: 'This correction request has multiple audit records. Admin investigation is required.' }, { status: 409 });
        let correctionAudit = priorAudits[0] || null;
        const priorAuditHash = String(correctionAudit?.details?.payload_hash || '');
        const priorAuditRequestId = String(correctionAudit?.details?.correction_request_id || '');
        if (correctionAudit?.id && (
          asEmail(correctionAudit.user_email) !== target.email ||
          (priorAuditRequestId && priorAuditRequestId !== priorByRequest.id) ||
          (priorAuditHash && !constantTimeEqual(priorAuditHash, storedHash))
        )) {
          return Response.json({ success: false, error: 'This correction audit does not match the saved employee, correction record, or payload. Admin investigation is required.' }, { status: 409 });
        }
        if (correctionAudit?.outcome === 'pending') {
          await auditEntity.updateMany(
            { id: correctionAudit.id, outcome: 'pending', request_id: requestId, time_entry_id: entryId },
            { $set: {
              outcome: 'confirmed',
              server_timestamp: new Date().toISOString(),
              details: { ...(correctionAudit.details || {}), payload_hash: storedHash, correction_request_id: priorByRequest.id, requested_changes: priorChanges, recovered_after_request_save: true },
            } },
          );
          correctionAudit = await auditEntity.get(correctionAudit.id).catch(() => null);
        }
        if (!correctionAudit?.id) {
          try {
            const ensured = await ensureActionAudit(auditEntity, {
              action: 'correction_request', outcome: 'confirmed', user_email: target.email,
              user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
              authentication_method: authenticationMethodFor(actor, target), server_timestamp: priorByRequest.requested_at || new Date().toISOString(),
              request_id: requestId, time_entry_id: entryId, reason: priorByRequest.employee_reason,
              details: { payload_hash: storedHash, correction_request_id: priorByRequest.id, requested_changes: priorChanges, recovered_after_request_save: true },
            }, 'Correction-request audit');
            correctionAudit = ensured.audit;
          } catch {
            return Response.json({ success: false, retry_same_request: true, error: 'The correction request is saved but its audit is still being finalized. Retry the same request.' }, { status: 409 });
          }
        }
        if (!correctionAudit || !['confirmed', 'recovered'].includes(String(correctionAudit.outcome || ''))) {
          return Response.json({ success: false, retry_same_request: true, error: 'The correction request is saved but a confirmed audit could not be verified yet. Retry the same request.' }, { status: 409 });
        }
        if (
          asEmail(correctionAudit.user_email) !== target.email ||
          String(correctionAudit.details?.correction_request_id || '') !== priorByRequest.id ||
          !constantTimeEqual(String(correctionAudit.details?.payload_hash || ''), storedHash)
        ) {
          return Response.json({ success: false, error: 'The completed correction audit could not be tied to this exact request and payload. Admin investigation is required.' }, { status: 409 });
        }
        let recoveredRequest = priorByRequest;
        if (String(priorByRequest.original_snapshot?.approval_status || '') === 'approved' && priorByRequest.status === 'pending') {
          const recoveryGate = await claimCorrectionCreateLock(stateEntity, state.id, requestId, entryId, storedHash);
          if (!recoveryGate?.acquired) {
            return Response.json({ success: false, retry_same_request: true, error: 'The saved correction is awaiting its Needs Review transition. Retry this same request after the current action finishes.' }, { status: 409 });
          }
          try {
            const transitioned = await ensureCorrectionSubmissionNeedsReview({
              entryEntity, correctionRequestEntity, auditEntity, requestRecord: priorByRequest,
              correctionAudit, requestId, requestHash: storedHash, target,
            });
            if (!transitioned) {
              return Response.json({ success: false, retry_same_request: true, error: 'The saved correction cannot yet return its approved shift to Needs Review safely. Retry the same request or ask an admin to investigate.' }, { status: 409 });
            }
            recoveredRequest = transitioned;
          } finally {
            const released = await releaseCorrectionCreateLock(
              stateEntity, state.id, requestId, entryId, storedHash, String(recoveryGate.claim_token || ''),
            );
            if (!released) throw new Error('Saved correction recovery could not release its shared approval gate.');
          }
        }
        let completedLockReleased = false;
        try {
          completedLockReleased = await releaseCompletedCorrectionCreateLock(
            stateEntity,
            state.id,
            requestId,
            entryId,
            storedHash,
          );
        } catch (error) {
          console.error('Completed correction request lock cleanup failed:', error?.message || error);
        }
        if (!completedLockReleased) {
          return Response.json({ success: false, retry_same_request: true, error: 'The correction request and audit are saved, but its create lock could not be released safely. Retry the same request.' }, { status: 409 });
        }
        return Response.json({ success: true, request: recoveredRequest, audit_id: correctionAudit.id, reused: true });
      }

      let entry = await entryEntity.get(entryId).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'TimeEntry was not found or is archived.' }, { status: 404 });
      }
      if (entry.status !== 'clocked_out' || !entry.clock_out) {
        return Response.json({ success: false, error: 'Correction requests can only be submitted for completed shifts.' }, { status: 400 });
      }
      if (entryIsPayPeriodLocked(entry)) return Response.json({ success: false, error: 'This shift is locked by a finalized pay period. Ask a manager to reopen that pay period before requesting a correction.' }, { status: 409 });
      if (String(entry.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ success: false, error: 'This time entry changed since it was loaded. Reload before requesting a correction.' }, { status: 409 });
      }

      const clockIn = new Date(String(requested?.clock_in || entry.clock_in || ''));
      const clockOut = new Date(String(requested?.clock_out || entry.clock_out || ''));
      const lunchMinutes = Math.round(Number(requested?.lunch_minutes ?? entry.lunch_minutes ?? 0));
      if (!Number.isFinite(clockIn.getTime()) || !Number.isFinite(clockOut.getTime()) || clockOut.getTime() < clockIn.getTime()) {
        return Response.json({ success: false, error: 'Requested punch times are invalid.' }, { status: 400 });
      }
      const shiftMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
      if (!Number.isFinite(lunchMinutes) || lunchMinutes < 0 || lunchMinutes > 240 || lunchMinutes > shiftMinutes) {
        return Response.json({ success: false, error: 'Requested lunch minutes are invalid for this shift.' }, { status: 400 });
      }
      const requestedChanges = {
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        lunch_minutes: lunchMinutes,
        notes: String(requested?.notes ?? entry.notes ?? '').trim().slice(0, 4000),
      };
      const submissionHash = await payloadHash({
        entry_id: entry.id,
        expected_updated_date: entry.updated_date,
        reason,
        requested_changes: requestedChanges,
      });
      const correctionCreateLock = await claimCorrectionCreateLock(
        stateEntity,
        state.id,
        requestId,
        entry.id,
        submissionHash,
      );
      if (!correctionCreateLock?.acquired) {
        return Response.json({
          success: false,
          ...(correctionCreateLock?.retry_same_request === true ? { retry_same_request: true } : {}),
          error: correctionCreateLock?.error || 'Correction request creation could not acquire its authoritative lock.',
        }, { status: 409 });
      }

      try {
        entry = await entryEntity.get(entry.id).catch(() => null);
        if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
          return Response.json({ success: false, error: 'TimeEntry was not found or is archived.' }, { status: 404 });
        }
        if (entry.status !== 'clocked_out' || !entry.clock_out || entryIsPayPeriodLocked(entry) || String(entry.updated_date || '') !== expectedUpdatedDate) {
          return Response.json({ success: false, error: 'This time entry changed while the correction request was being submitted. Reload before trying again.' }, { status: 409 });
        }

        const openRequests = await correctionRequestEntity.filter({ time_entry_id: entry.id, status: { $in: ['pending', 'reviewing'] } });
        if (!Array.isArray(openRequests)) throw new Error('Correction request lookup did not return a record list.');
        if (openRequests.length > 0) {
          return Response.json({ success: false, error: 'A correction request for this shift is already awaiting manager review.' }, { status: 409 });
        }

        const now = new Date().toISOString();
        const correctionRequest = await correctionRequestEntity.create({
          user_email: target.email,
          user_name: target.full_name || target.email,
          time_entry_id: entry.id,
          time_entry_updated_date: entry.updated_date,
          request_id: requestId,
          requested_at: now,
          employee_reason: reason,
          original_snapshot: entryAuditSnapshot(entry),
          requested_changes: requestedChanges,
          status: 'pending',
        });
        if (!correctionRequest?.id) throw new Error('Correction request could not be persisted.');

        let correctionAudit: any = null;
        try {
          const ensured = await ensureActionAudit(auditEntity, {
            action: 'correction_request', outcome: 'confirmed', user_email: target.email,
            user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
            authentication_method: authenticationMethodFor(actor, target), server_timestamp: now,
            request_id: requestId, time_entry_id: entry.id, reason,
            details: { payload_hash: submissionHash, correction_request_id: correctionRequest.id, requested_changes: requestedChanges },
          }, 'Correction-request audit');
          correctionAudit = ensured.audit;
        } catch {
          return Response.json({ success: false, retry_same_request: true, error: 'The correction request was saved but audit finalization was interrupted. Retry the same request.' }, { status: 409 });
        }
        if (!correctionAudit || !['confirmed', 'recovered'].includes(String(correctionAudit.outcome || ''))) {
          return Response.json({ success: false, retry_same_request: true, error: 'The correction request was saved but a confirmed audit could not be verified yet. Retry the same request.' }, { status: 409 });
        }
        const readyRequest = await ensureCorrectionSubmissionNeedsReview({
          entryEntity, correctionRequestEntity, auditEntity, requestRecord: correctionRequest,
          correctionAudit, requestId, requestHash: submissionHash, target,
        });
        if (!readyRequest) {
          return Response.json({ success: false, retry_same_request: true, error: 'The correction was saved but the approved shift has not yet returned to Needs Review safely. Retry the same correction request.' }, { status: 409 });
        }
        return Response.json({ success: true, request: readyRequest, audit_id: correctionAudit.id });
      } finally {
        try {
          await releaseCorrectionCreateLock(
            stateEntity,
            state.id,
            requestId,
            entryId,
            submissionHash,
            String(correctionCreateLock.claim_token || ''),
          );
        } catch (error) {
          console.error('Correction create lock release failed; stale same-request recovery remains available:', error?.message || error);
        }
      }
    }

    if (action === 'review_correction_request') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Administrator access is required to review correction requests.' }, { status: 403 });
      const correctionRequestId = String(body?.correction_request_id || '').trim();
      const expectedRequestUpdatedDate = String(body?.expected_request_updated_date || '').trim();
      const decision = String(body?.decision || '').trim();
      const reviewerReason = String(body?.reason || '').trim();
      if (!correctionRequestId || !expectedRequestUpdatedDate) return Response.json({ success: false, error: 'The loaded correction request version is required.' }, { status: 400 });
      if (!['approve', 'approve_modified', 'reject'].includes(decision)) return Response.json({ success: false, error: 'A valid correction-review decision is required.' }, { status: 400 });
      if (reviewerReason.length < 3 || reviewerReason.length > 500) return Response.json({ success: false, error: 'A manager review reason between 3 and 500 characters is required.' }, { status: 400 });

      let normalizedModifiedCorrection: any = null;
      if (decision === 'approve_modified') {
        const correction = body?.correction || {};
        const editedClockIn = new Date(String(correction?.clock_in || ''));
        const editedClockOut = new Date(String(correction?.clock_out || ''));
        const editedLunchMinutes = Math.round(Number(correction?.lunch_minutes ?? 0));
        if (!Number.isFinite(editedClockIn.getTime()) || !Number.isFinite(editedClockOut.getTime()) || editedClockOut.getTime() < editedClockIn.getTime()) {
          return Response.json({ success: false, error: 'Approved punch times are invalid.' }, { status: 400 });
        }
        const editedShiftMinutes = Math.floor((editedClockOut.getTime() - editedClockIn.getTime()) / 60000);
        if (!Number.isFinite(editedLunchMinutes) || editedLunchMinutes < 0 || editedLunchMinutes > 240 || editedLunchMinutes > editedShiftMinutes) {
          return Response.json({ success: false, error: 'Approved lunch minutes are invalid for this shift.' }, { status: 400 });
        }
        normalizedModifiedCorrection = {
          clock_in: editedClockIn.toISOString(),
          clock_out: editedClockOut.toISOString(),
          lunch_minutes: editedLunchMinutes,
          notes: String(correction?.notes || '').trim().slice(0, 4000),
        };
      }
      const reviewHash = await payloadHash({
        decision,
        reason: reviewerReason,
        correction: decision === 'approve_modified' ? normalizedModifiedCorrection : null,
      });

      let correctionRequest = await correctionRequestEntity.get(correctionRequestId).catch(() => null);
      if (!correctionRequest?.id || asEmail(correctionRequest.user_email) !== target.email) return Response.json({ success: false, error: 'Correction request was not found.' }, { status: 404 });

      const sameReviewPayload = () => {
        const storedHash = String(correctionRequest.review_payload_hash || '');
        const storedDecision = String(correctionRequest.review_decision || '');
        return Boolean(storedHash) && constantTimeEqual(storedHash, reviewHash) && storedDecision === decision;
      };
      const finalReviewStatus = decision === 'approve_modified' ? 'approved_modified' : decision === 'approve' ? 'approved' : 'rejected';
      const ensureReviewAuditConfirmed = async (requestRecord: any, recoveredAfterInterruption = false) => {
        const rows = await auditEntity.filter({
          action: 'correction_review',
          request_id: requestId,
          time_entry_id: correctionRequest.time_entry_id,
        });
        if (!Array.isArray(rows)) throw new Error('Correction-review audit lookup did not return a record list.');
        if (rows.length > 1) return { audit: null, investigation: true };
        let reviewAudit: any = rows[0] || null;
        const storedAuditHash = String(reviewAudit?.details?.review_payload_hash || '');
        const storedAuditCorrectionRequestId = String(reviewAudit?.details?.correction_request_id || '');
        if (reviewAudit?.id && (
          asEmail(reviewAudit.user_email) !== target.email ||
          (storedAuditCorrectionRequestId && storedAuditCorrectionRequestId !== correctionRequest.id) ||
          (storedAuditHash && !constantTimeEqual(storedAuditHash, reviewHash))
        )) return { audit: null, investigation: true };

        if (!reviewAudit?.id) {
          try {
            const ensured = await ensureActionAudit(auditEntity, {
              action: 'correction_review', outcome: 'confirmed', user_email: target.email,
              user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
              authentication_method: authenticationMethodFor(actor, target),
              server_timestamp: requestRecord?.reviewed_at || new Date().toISOString(),
              request_id: requestId, time_entry_id: correctionRequest.time_entry_id, reason: reviewerReason,
              details: {
                correction_request_id: correctionRequest.id,
                decision: finalReviewStatus,
                applied_audit_id: requestRecord?.applied_audit_id || undefined,
                review_payload_hash: reviewHash,
                ...(recoveredAfterInterruption ? { recovered_after_review_save: true } : {}),
              },
            }, 'Correction-review audit');
            reviewAudit = ensured.audit;
          } catch {
            return { audit: null, retry: true };
          }
        }

        if (reviewAudit?.outcome === 'pending') {
          const finalizedAudit = await auditEntity.updateMany(
            { id: reviewAudit.id, outcome: 'pending', request_id: requestId, time_entry_id: correctionRequest.time_entry_id },
            { $set: {
              outcome: 'confirmed',
              server_timestamp: requestRecord?.reviewed_at || new Date().toISOString(),
              details: {
                ...(reviewAudit.details || {}),
                correction_request_id: correctionRequest.id,
                decision: finalReviewStatus,
                applied_audit_id: requestRecord?.applied_audit_id || undefined,
                review_payload_hash: reviewHash,
                ...(recoveredAfterInterruption ? { recovered_after_review_save: true } : {}),
              },
            } },
          );
          if (!finalizedAudit || finalizedAudit.updated !== 1) {
            reviewAudit = await auditEntity.get(reviewAudit.id).catch(() => null);
          } else {
            reviewAudit = await auditEntity.get(reviewAudit.id);
          }
        }

        if (!reviewAudit || !['confirmed', 'recovered'].includes(String(reviewAudit.outcome || ''))) {
          return { audit: null, retry: true };
        }
        if (
          asEmail(reviewAudit.user_email) !== target.email ||
          String(reviewAudit.details?.correction_request_id || '') !== correctionRequest.id ||
          !constantTimeEqual(String(reviewAudit.details?.review_payload_hash || ''), reviewHash)
        ) {
          return { audit: null, investigation: true };
        }
        return { audit: reviewAudit };
      };
      const releaseReview = async (claimRequestId = requestId) => correctionRequestEntity.updateMany(
        { id: correctionRequest.id, status: 'reviewing', review_request_id: claimRequestId },
        {
          $set: { status: 'pending' },
          $unset: {
            review_started_at: '', reviewer_email: '', reviewer_reason: '', review_request_id: '',
            review_decision: '', review_payload_hash: '',
          },
        },
      );
      const adminCorrectionAuditMatches = (auditRow: any, expectedReviewHash: string) => Boolean(
        auditRow?.id &&
        expectedReviewHash &&
        asEmail(auditRow.user_email) === target.email &&
        String(auditRow.details?.correction_request_id || '') === correctionRequest.id &&
        constantTimeEqual(String(auditRow.details?.review_payload_hash || ''), expectedReviewHash)
      );

      if (['approved', 'approved_modified', 'rejected'].includes(correctionRequest.status)) {
        if (String(correctionRequest.review_request_id || '') === requestId) {
          if (!sameReviewPayload()) return Response.json({ success: false, error: 'This review request id is already bound to a different manager decision or payload.' }, { status: 409 });
          const reviewAuditResult = await ensureReviewAuditConfirmed(correctionRequest, true);
          if (reviewAuditResult.investigation) return Response.json({ success: false, error: 'This completed correction review has ambiguous or mismatched audit evidence. Admin investigation is required.' }, { status: 409 });
          if (!reviewAuditResult.audit) return Response.json({ success: false, retry_same_request: true, error: 'The correction review is saved but its audit is still being finalized. Retry the same review.' }, { status: 409 });
          return Response.json({ success: true, request: correctionRequest, review_audit_id: reviewAuditResult.audit.id, reused: true });
        }
        return Response.json({ success: false, error: 'This correction request has already been reviewed.' }, { status: 409 });
      }

      // An approved shift's employee submission is not reviewable until its
      // Needs Review transition, request-version update and audit are complete.
      if (correctionRequest.status === 'pending' &&
          String(correctionRequest.original_snapshot?.approval_status || '') === 'approved') {
        const reviewableEntry = await entryEntity.get(correctionRequest.time_entry_id).catch(() => null);
        const submissionAudit = await uniqueRow(auditEntity, {
          action: 'correction_request', request_id: correctionRequest.request_id,
          time_entry_id: correctionRequest.time_entry_id,
        }, 'Approved-shift correction submission audit');
        const transition = submissionAudit?.details?.approval_transition;
        const submittedHash = await payloadHash({
          entry_id: correctionRequest.time_entry_id,
          expected_updated_date: correctionRequest.original_snapshot?.updated_date,
          reason: correctionRequest.employee_reason,
          requested_changes: correctionRequest.requested_changes,
        });
        if (!reviewableEntry?.id || asEmail(reviewableEntry.user_email) !== target.email ||
            !constantTimeEqual(String(submissionAudit?.details?.payload_hash || ''), submittedHash) ||
            reviewableEntry.approval_status !== 'needs_review' ||
            String(reviewableEntry.correction_needs_review_request_id || '') !== String(correctionRequest.request_id || '') ||
            String(reviewableEntry.updated_date || '') !== String(correctionRequest.time_entry_updated_date || '') ||
            !submissionAudit?.id || !['confirmed', 'recovered'].includes(String(submissionAudit.outcome || '')) ||
            asEmail(submissionAudit.user_email) !== target.email ||
            String(submissionAudit.details?.correction_request_id || '') !== correctionRequest.id ||
            String(transition?.correction_request_id || '') !== correctionRequest.id ||
            String(transition?.saved_entry_updated_date || '') !== String(correctionRequest.time_entry_updated_date || '')) {
          return Response.json({
            success: false,
            error: 'The employee correction is still completing its audited Needs Review transition or the shift changed afterward. Refresh before reviewing this request.',
          }, { status: 409 });
        }
      }
      const resumingReview = correctionRequest.status === 'reviewing' && String(correctionRequest.review_request_id || '') === requestId;
      if (correctionRequest.status === 'reviewing' && !resumingReview) {
        const previousRequestId = String(correctionRequest.review_request_id || '');
        const previousDecision = String(correctionRequest.review_decision || '');
        const previousReviewHash = String(correctionRequest.review_payload_hash || '');
        if (!previousRequestId || !previousReviewHash) {
          return Response.json({ success: false, error: 'The abandoned manager review is missing its request or payload binding. Admin investigation is required.' }, { status: 409 });
        }
        const reviewStartedAt = correctionRequest.review_started_at ? new Date(correctionRequest.review_started_at) : null;
        const reviewAgeMs = reviewStartedAt && Number.isFinite(reviewStartedAt.getTime())
          ? Date.now() - reviewStartedAt.getTime()
          : Number.POSITIVE_INFINITY;
        if (reviewAgeMs <= 5 * 60 * 1000) {
          return Response.json({ success: false, error: 'Another manager review is already in progress.' }, { status: 409 });
        }

        const staleEntry = await entryEntity.get(correctionRequest.time_entry_id).catch(() => null);
        const staleAudits = previousRequestId
          ? await auditEntity.filter({ action: 'admin_correction', request_id: previousRequestId, time_entry_id: correctionRequest.time_entry_id })
          : [];
        if (!Array.isArray(staleAudits)) throw new Error('Stale correction audit recovery lookup did not return a record list.');
        if (staleAudits.length > 1) return Response.json({ success: false, error: 'The abandoned review has multiple correction audits. Admin investigation is required.' }, { status: 409 });
        const staleAudit = staleAudits[0] || null;
        if (staleAudit?.id && !adminCorrectionAuditMatches(staleAudit, previousReviewHash)) {
          return Response.json({ success: false, error: 'The abandoned correction audit does not match the employee, correction request, or review payload. Admin investigation is required.' }, { status: 409 });
        }
        const staleApplied = staleEntry?.id && String(staleEntry.last_correction_request_id || '') === correctionRequest.id;

        if (staleApplied) {
          if (!['approve', 'approve_modified'].includes(previousDecision) || !staleAudit?.id) {
            return Response.json({ success: false, error: 'An abandoned review changed the TimeEntry but cannot be recovered unambiguously. Admin investigation is required.' }, { status: 409 });
          }
          if (staleAudit.outcome === 'pending') {
            const recoveredAudit = await auditEntity.updateMany(
              { id: staleAudit.id, outcome: 'pending', request_id: previousRequestId, time_entry_id: staleEntry.id },
              { $set: {
                outcome: 'confirmed', server_timestamp: new Date().toISOString(),
                details: {
                  original: correctionRequest.original_snapshot,
                  corrected: entryAuditSnapshot(staleEntry),
                  correction_request_id: correctionRequest.id,
                  review_payload_hash: previousReviewHash,
                  recovered_after_abandoned_review: true,
                },
              } },
            );
            if (!recoveredAudit || recoveredAudit.updated !== 1) {
              const freshAudit = await auditEntity.get(staleAudit.id).catch(() => null);
              if (
                !['confirmed', 'recovered'].includes(String(freshAudit?.outcome || '')) ||
                !adminCorrectionAuditMatches(freshAudit, previousReviewHash)
              ) return Response.json({ success: false, error: 'The abandoned correction was applied but its audit could not be recovered safely.' }, { status: 409 });
            }
          } else if (!['confirmed', 'recovered'].includes(String(staleAudit.outcome || ''))) {
            return Response.json({ success: false, error: 'The abandoned correction has a non-terminal audit state. Admin investigation is required.' }, { status: 409 });
          }
          const recoveredStatus = previousDecision === 'approve_modified' ? 'approved_modified' : 'approved';
          const recovered = await correctionRequestEntity.updateMany(
            { id: correctionRequest.id, status: 'reviewing', review_request_id: previousRequestId },
            { $set: {
              status: recoveredStatus, reviewed_at: new Date().toISOString(),
              applied_audit_id: staleAudit.id,
            } },
          );
          if (!recovered || recovered.updated !== 1) return Response.json({ success: false, error: 'The abandoned correction was applied but its request could not be finalized safely.' }, { status: 409 });
          await audit(auditEntity, {
            action: 'correction_review', outcome: 'recovered', user_email: target.email,
            user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
            authentication_method: authenticationMethodFor(actor, target), server_timestamp: new Date().toISOString(),
            request_id: previousRequestId, time_entry_id: correctionRequest.time_entry_id,
            reason: correctionRequest.reviewer_reason || 'Recovered abandoned manager review',
            details: { correction_request_id: correctionRequest.id, decision: recoveredStatus, applied_audit_id: staleAudit.id },
          });
          return Response.json({ success: false, recovered: true, error: 'A previous interrupted manager approval was recovered. Reload the correction queue before taking another action.' }, { status: 409 });
        }

        if (staleAudit?.id && ['confirmed', 'recovered'].includes(String(staleAudit.outcome || ''))) {
          return Response.json({ success: false, error: 'The abandoned review has a terminal correction audit but no matching TimeEntry marker. Admin investigation is required.' }, { status: 409 });
        }
        if (staleAudit?.id && staleAudit.outcome === 'pending') {
          await auditEntity.updateMany({ id: staleAudit.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
        }
        const released = await releaseReview(previousRequestId);
        if (!released || released.updated !== 1) return Response.json({ success: false, error: 'The abandoned manager review could not be released safely.' }, { status: 409 });
        return Response.json({ success: false, recovered: true, error: 'An abandoned manager review was released safely. Reload the correction queue and review it again.' }, { status: 409 });
      }
      if (resumingReview && !sameReviewPayload()) {
        return Response.json({ success: false, error: 'Retrying a manager review requires the exact same decision, reason, and edited values.' }, { status: 409 });
      }
      if (correctionRequest.status === 'pending') {
        if (String(correctionRequest.updated_date || '') !== expectedRequestUpdatedDate) return Response.json({ success: false, error: 'This correction request changed since it was loaded.' }, { status: 409 });
        const claimTime = new Date().toISOString();
        const claimed = await correctionRequestEntity.updateMany(
          { id: correctionRequest.id, updated_date: expectedRequestUpdatedDate, status: 'pending' },
          { $set: {
            status: 'reviewing', review_started_at: claimTime, reviewer_email: actorEmail,
            reviewer_reason: reviewerReason, review_request_id: requestId, review_decision: decision,
            review_payload_hash: reviewHash,
          } },
        );
        if (!claimed || claimed.updated !== 1) return Response.json({ success: false, error: 'This correction request was claimed by another manager. Reload before reviewing.' }, { status: 409 });
        correctionRequest = await correctionRequestEntity.get(correctionRequest.id);
      }

      if (decision === 'reject') {
        const finalized = await correctionRequestEntity.updateMany(
          { id: correctionRequest.id, status: 'reviewing', review_request_id: requestId, review_payload_hash: reviewHash },
          { $set: { status: 'rejected', reviewed_at: new Date().toISOString(), reviewer_email: actorEmail, reviewer_reason: reviewerReason } },
        );
        if (!finalized || finalized.updated !== 1) return Response.json({ success: false, retry_same_request: true, error: 'The rejection could not be finalized safely. Retry the same review.' }, { status: 409 });
        const savedRequest = await correctionRequestEntity.get(correctionRequest.id);
        const reviewAuditResult = await ensureReviewAuditConfirmed(savedRequest);
        if (reviewAuditResult.investigation) return Response.json({ success: false, error: 'The rejection was saved but its review audit is ambiguous or mismatched. Admin investigation is required.' }, { status: 409 });
        if (!reviewAuditResult.audit) return Response.json({ success: false, retry_same_request: true, error: 'The rejection was saved but its review audit could not be confirmed. Retry the same review.' }, { status: 409 });
        return Response.json({ success: true, request: savedRequest, review_audit_id: reviewAuditResult.audit.id });
      }

      let entry = await entryEntity.get(correctionRequest.time_entry_id).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin || entry.status !== 'clocked_out' || !entry.clock_out) {
        await releaseReview();
        return Response.json({ success: false, error: 'The underlying completed TimeEntry is no longer eligible for this correction.' }, { status: 409 });
      }
      if (entryIsPayPeriodLocked(entry)) {
        await releaseReview();
        return Response.json({ success: false, error: 'This shift is locked by a finalized pay period. Reopen that pay period before applying a correction.' }, { status: 409 });
      }

      const auditRows = await auditEntity.filter({ action: 'admin_correction', request_id: requestId, time_entry_id: entry.id });
      if (!Array.isArray(auditRows)) throw new Error('Correction audit recovery lookup did not return a record list.');
      if (auditRows.length > 1) return Response.json({ success: false, error: 'Multiple correction audit records exist for this review request. Admin investigation is required.' }, { status: 409 });
      let correctionAudit: any = auditRows[0] || null;
      if (correctionAudit?.id && !adminCorrectionAuditMatches(correctionAudit, reviewHash)) {
        return Response.json({ success: false, error: 'This correction audit does not match the employee, correction request, or manager-review payload. Admin investigation is required.' }, { status: 409 });
      }
      const alreadyApplied = String(entry.last_correction_request_id || '') === correctionRequest.id;
      let correctionAuditId = String(correctionRequest.applied_audit_id || correctionAudit?.id || '');

      if (alreadyApplied) {
        if (!correctionAudit?.id) {
          return Response.json({ success: false, error: 'The TimeEntry correction is present but its required audit intent is missing. Admin investigation is required.' }, { status: 409 });
        }
        if (correctionAudit.outcome === 'pending') {
          const recoveredAudit = await auditEntity.updateMany(
            { id: correctionAudit.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id },
            { $set: {
              outcome: 'confirmed', server_timestamp: new Date().toISOString(),
              details: {
                original: correctionRequest.original_snapshot,
                corrected: entryAuditSnapshot(entry),
                correction_request_id: correctionRequest.id,
                review_payload_hash: reviewHash,
                recovered_after_interruption: true,
              },
            } },
          );
          if (!recoveredAudit || recoveredAudit.updated !== 1) {
            const freshAudit = await auditEntity.get(correctionAudit.id).catch(() => null);
            if (
              !['confirmed', 'recovered'].includes(String(freshAudit?.outcome || '')) ||
              !adminCorrectionAuditMatches(freshAudit, reviewHash)
            ) return Response.json({ success: false, retry_same_request: true, error: 'The correction was applied, but its audit could not be finalized. Retry the same review.' }, { status: 409 });
            correctionAudit = freshAudit;
          } else {
            correctionAudit = await auditEntity.get(correctionAudit.id);
          }
        }
        if (!['confirmed', 'recovered'].includes(String(correctionAudit.outcome || ''))) {
          return Response.json({ success: false, error: 'The applied correction has a non-terminal audit state. Admin investigation is required.' }, { status: 409 });
        }
        if (!adminCorrectionAuditMatches(correctionAudit, reviewHash)) {
          return Response.json({ success: false, error: 'The applied correction audit cannot be tied to this exact employee, correction request, and manager-review payload. Admin investigation is required.' }, { status: 409 });
        }
        correctionAuditId = correctionAudit.id;
      } else {
        if (String(entry.updated_date || '') !== String(correctionRequest.time_entry_updated_date || '')) {
          if (correctionAudit?.id && correctionAudit.outcome === 'pending') {
            await auditEntity.updateMany({ id: correctionAudit.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
          }
          await releaseReview();
          return Response.json({ success: false, error: 'The TimeEntry changed after this request was submitted. Reload the entry and review the differences before approving.' }, { status: 409 });
        }
        if (correctionAudit?.id && correctionAudit.outcome !== 'pending') {
          return Response.json({ success: false, error: 'This review has an unexpected prior audit state. Admin investigation is required.' }, { status: 409 });
        }

        const requestedCorrection = decision === 'approve_modified' ? normalizedModifiedCorrection : (correctionRequest.requested_changes || {});
        const clockIn = new Date(String(requestedCorrection?.clock_in || entry.clock_in || ''));
        const clockOut = new Date(String(requestedCorrection?.clock_out || entry.clock_out || ''));
        const lunchMinutes = Math.round(Number(requestedCorrection?.lunch_minutes ?? entry.lunch_minutes ?? 0));
        if (!Number.isFinite(clockIn.getTime()) || !Number.isFinite(clockOut.getTime()) || clockOut.getTime() < clockIn.getTime()) {
          if (correctionAudit?.id && correctionAudit.outcome === 'pending') await auditEntity.updateMany({ id: correctionAudit.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
          await releaseReview();
          return Response.json({ success: false, error: 'Approved punch times are invalid.' }, { status: 400 });
        }
        const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
        const trackedWorkPauseMinutes = Math.max(0, Math.round(Number(entry.tracked_work_pause_minutes || 0)));
        if (!Number.isFinite(lunchMinutes) || lunchMinutes < 0 || lunchMinutes > 240 || (lunchMinutes + trackedWorkPauseMinutes) > totalMinutes) {
          if (correctionAudit?.id && correctionAudit.outcome === 'pending') await auditEntity.updateMany({ id: correctionAudit.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
          await releaseReview();
          return Response.json({ success: false, error: 'Approved lunch minutes are invalid for this shift.' }, { status: 400 });
        }
        const now = new Date().toISOString();
        const normalizedAllocations = (Array.isArray(entry.job_allocations) ? entry.job_allocations : []).map((job: any) => {
          const minutes = minutesFromAllocation(job);
          return { ...job, minutes, hours: minutes / 60 };
        });
        const nextFields = {
          clock_in: clockIn.toISOString(), clock_out: clockOut.toISOString(), lunch_minutes: lunchMinutes,
          total_hours: (totalMinutes - lunchMinutes - trackedWorkPauseMinutes) / 60,
          notes: String(requestedCorrection?.notes ?? entry.notes ?? '').trim().slice(0, 4000),
          job_allocations: normalizedAllocations, status: 'clocked_out', clock_source: 'admin_correction',
          last_corrected_at: now, last_corrected_by: actorEmail, last_correction_reason: reviewerReason,
          last_correction_request_id: correctionRequest.id,
          approval_status: 'needs_review',
        };
        if (!correctionAudit?.id) {
          correctionAudit = await auditEntity.create({
            action: 'admin_correction', outcome: 'pending', user_email: target.email,
            user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
            authentication_method: authenticationMethodFor(actor, target), server_timestamp: now,
            request_id: requestId, time_entry_id: entry.id, reason: reviewerReason,
            details: {
              original: entryAuditSnapshot(entry), requested: nextFields,
              correction_request_id: correctionRequest.id, review_payload_hash: reviewHash,
            },
          });
          if (!correctionAudit?.id) throw new Error('Correction audit intent could not be persisted. No TimeEntry was changed.');
        }
        correctionAuditId = correctionAudit.id;
        const updated = await entryEntity.updateMany(
          { id: entry.id, updated_date: entry.updated_date, user_email: target.email, status: 'clocked_out', archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
          { $set: nextFields, $unset: { approved_at: '', approved_by: '', approval_note: '', approval_request_id: '' } },
        );
        if (!updated || updated.updated !== 1) {
          await auditEntity.updateMany({ id: correctionAudit.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
          await releaseReview();
          return Response.json({ success: false, error: 'The TimeEntry changed before the correction could be applied. Reload before reviewing again.' }, { status: 409 });
        }
        entry = await entryEntity.get(entry.id);
        const auditFinalized = await auditEntity.updateMany(
          { id: correctionAudit.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id },
          { $set: {
            outcome: 'confirmed', server_timestamp: new Date().toISOString(),
            details: {
              original: correctionRequest.original_snapshot,
              corrected: entryAuditSnapshot(entry),
              correction_request_id: correctionRequest.id,
              review_payload_hash: reviewHash,
            },
          } },
        );
        if (!auditFinalized || auditFinalized.updated !== 1) {
          const freshAudit = await auditEntity.get(correctionAudit.id).catch(() => null);
          if (!['confirmed', 'recovered'].includes(String(freshAudit?.outcome || ''))) return Response.json({ success: false, retry_same_request: true, error: 'The TimeEntry correction was applied, but its audit finalization was interrupted. Retry this same review.' }, { status: 409 });
        }
      }

      const finalStatus = decision === 'approve_modified' ? 'approved_modified' : 'approved';
      const finalized = await correctionRequestEntity.updateMany(
        { id: correctionRequest.id, status: 'reviewing', review_request_id: requestId, review_payload_hash: reviewHash },
        { $set: { status: finalStatus, reviewed_at: new Date().toISOString(), reviewer_email: actorEmail, reviewer_reason: reviewerReason, applied_audit_id: correctionAuditId } },
      );
      if (!finalized || finalized.updated !== 1) return Response.json({ success: false, retry_same_request: true, error: 'The TimeEntry correction was applied, but request finalization was interrupted. Retry this same review to recover safely.' }, { status: 409 });
      const savedRequest = await correctionRequestEntity.get(correctionRequest.id);
      const reviewAuditResult = await ensureReviewAuditConfirmed(savedRequest);
      if (reviewAuditResult.investigation) return Response.json({ success: false, error: 'The correction was applied but its review audit is ambiguous or mismatched. Admin investigation is required.' }, { status: 409 });
      if (!reviewAuditResult.audit) return Response.json({ success: false, retry_same_request: true, error: 'The correction was applied and review saved, but its review audit could not be confirmed. Retry the same review.' }, { status: 409 });
      return Response.json({ success: true, request: savedRequest, entry, audit_id: correctionAuditId, review_audit_id: reviewAuditResult.audit.id });
    }

    if (action === 'admin_correct_entry') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Administrator access is required to correct time entries.' }, { status: 403 });
      const entryId = String(body?.entry_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      const reason = String(body?.reason || '').trim();
      const correction = body?.correction || {};
      if (!entryId || !expectedUpdatedDate) return Response.json({ success: false, error: 'The loaded TimeEntry version is required before correcting it.' }, { status: 400 });
      if (reason.length < 3 || reason.length > 500) return Response.json({ success: false, error: 'A correction reason between 3 and 500 characters is required.' }, { status: 400 });

      const entry = await entryEntity.get(entryId).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'TimeEntry was not found or is archived.' }, { status: 404 });
      }
      if (entryIsPayPeriodLocked(entry)) return Response.json({ success: false, error: 'This shift is locked by a finalized pay period. Reopen that pay period before correcting it.' }, { status: 409 });

      const clockIn = new Date(String(correction?.clock_in || ''));
      const hasClockOut = Boolean(correction?.clock_out);
      const clockOut = hasClockOut ? new Date(String(correction.clock_out)) : null;
      if (!Number.isFinite(clockIn.getTime()) || (clockOut && !Number.isFinite(clockOut.getTime()))) {
        return Response.json({ success: false, error: 'Administrator corrections require valid punch timestamps.' }, { status: 400 });
      }
      if (clockOut && clockOut.getTime() < clockIn.getTime()) return Response.json({ success: false, error: 'Clock-out cannot be earlier than clock-in.' }, { status: 400 });
      if (entry.status === 'clocked_out' && !clockOut) {
        return Response.json({ success: false, error: 'A completed shift cannot be reopened by clearing its clock-out. Create a reviewed correction instead.' }, { status: 400 });
      }
      const submittedLunchMinutes = Math.round(Number(correction?.lunch_minutes || 0));
      if (!Number.isFinite(submittedLunchMinutes) || submittedLunchMinutes < 0 || submittedLunchMinutes > 240) {
        return Response.json({ success: false, error: 'Lunch minutes must be between 0 and 240.' }, { status: 400 });
      }
      const totalMinutes = clockOut ? Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000) : null;
      const activeForceClose = entry.status === 'clocked_in' && Boolean(clockOut);
      const breakSummary = activeForceClose
        ? await breakSummaryForEntry(breakEntity, entry.id, target.email)
        : {
            count: entry.break_tracking_used ? 1 : 0,
            total_minutes: Math.max(0, Math.round(Number(entry.tracked_break_minutes || 0))),
            paid_minutes: Math.max(0, Math.round(Number(entry.tracked_paid_break_minutes || 0))),
            unpaid_minutes: Math.max(0, Math.round(Number(entry.tracked_unpaid_break_minutes || 0))),
          };
      const workPauseSummary = activeForceClose
        ? await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email)
        : {
            count: entry.work_pause_tracking_used ? 1 : 0,
            total_minutes: Math.max(0, Math.round(Number(entry.tracked_work_pause_minutes || 0))),
          };
      const lunchMinutes = activeForceClose && breakSummary.unpaid_minutes > 0
        ? breakSummary.unpaid_minutes
        : submittedLunchMinutes;
      const trackedWorkPauseMinutes = workPauseSummary.total_minutes;
      if (totalMinutes !== null && (lunchMinutes + trackedWorkPauseMinutes) > totalMinutes) {
        return Response.json({ success: false, error: 'Unpaid Break/Lunch and Work Pause time cannot exceed the corrected shift duration.' }, { status: 400 });
      }
      let activeLaborAtCorrection: any = null;
      if (activeForceClose) {
        activeLaborAtCorrection = await activeLaborForEntry(laborEntity, entry.id, target.email);
        if (activeLaborAtCorrection?.id) {
          const laborStartMs = new Date(activeLaborAtCorrection.started_at).getTime();
          if (!Number.isFinite(laborStartMs) || clockOut!.getTime() < laborStartMs) {
            return Response.json({ success: false, error: 'Corrected clock-out cannot be earlier than the active Current Work segment start.' }, { status: 400 });
          }
        }
      }
      const allocations = Array.isArray(correction?.job_allocations) ? correction.job_allocations : [];
      const normalizedAllocations = allocations.map((job: any) => {
        const editedHours = Number(job?.hours);
        const storedMinutes = Number(job?.minutes);
        const minutes = Number.isFinite(editedHours) && editedHours >= 0
          ? Math.round(editedHours * 60)
          : Number.isFinite(storedMinutes) && storedMinutes >= 0
            ? Math.round(storedMinutes)
            : 0;
        return { ...job, minutes, hours: minutes / 60 };
      });
      const normalizedNotes = String(correction?.notes || '').trim();
      const correctionPayloadHash = await payloadHash({
        entry_id: entry.id,
        expected_updated_date: expectedUpdatedDate,
        reason,
        correction: {
          clock_in: clockIn.toISOString(),
          clock_out: clockOut ? clockOut.toISOString() : null,
          lunch_minutes: submittedLunchMinutes,
          notes: normalizedNotes,
          job_allocations: normalizedAllocations.map((job: any) => allocationForStorage(job)),
        },
      });
      const priorCorrectionAudits = await auditEntity.filter({ action: 'admin_correction', request_id: requestId, time_entry_id: entry.id });
      if (!Array.isArray(priorCorrectionAudits)) throw new Error('Administrative correction audit lookup did not return a record list.');
      if (priorCorrectionAudits.length > 1) return Response.json({ success: false, error: 'This administrative correction request has multiple audit records. Admin investigation is required.' }, { status: 409 });
      let intent = priorCorrectionAudits[0] || null;
      const priorPayloadHash = String(intent?.details?.payload_hash || '');
      if (intent && (!priorPayloadHash || !constantTimeEqual(priorPayloadHash, correctionPayloadHash))) {
        return Response.json({ success: false, error: 'This correction request id is already bound to different correction details. Submit a new correction request.' }, { status: 409 });
      }
      if (intent?.outcome === 'blocked') return Response.json({ success: false, error: 'This correction request was previously blocked. Reload and submit a new correction request.' }, { status: 409 });
      if (String(entry.last_correction_request_id || '') === requestId) {
        const savedForceClose = entry.status === 'clocked_out'
          && String(entry.clock_out_request_id || '') === requestId
          && state.status === 'clocking_out'
          && String(state.last_request_id || '') === requestId;
        if (savedForceClose) {
          const activeLabor = await activeLaborForEntry(laborEntity, entry.id, target.email);
          if (activeLabor?.id) {
            const laborStartMs = new Date(activeLabor.started_at).getTime();
            const correctedEndMs = new Date(entry.clock_out).getTime();
            if (!Number.isFinite(laborStartMs) || !Number.isFinite(correctedEndMs) || correctedEndMs < laborStartMs) {
              return Response.json({ success: false, error: 'The saved corrected clock-out is earlier than active Current Work. Admin review is required.' }, { status: 409 });
            }
            await closeActiveLaborSegment({
              laborEntity, auditEntity, entry, target, actor, actorEmail, requestId,
              endReason: 'admin_correction', officialEnd: entry.clock_out,
            });
          }
        }
        if (intent?.outcome === 'pending') {
          const auditFinalized = await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id },
            { $set: {
              outcome: 'confirmed', server_timestamp: new Date().toISOString(),
              details: { ...(intent.details || {}), corrected: entryAuditSnapshot(entry), recovered_after_entry_save: true },
            } },
          );
          if (!auditFinalized || auditFinalized.updated !== 1) {
            const freshAudit = await auditEntity.get(intent.id).catch(() => null);
            if (!['confirmed', 'recovered'].includes(String(freshAudit?.outcome || ''))) return Response.json({ success: false, retry_same_request: true, error: 'The correction is saved but its audit is still being finalized. Retry this same correction request.' }, { status: 409 });
          }
        }
        if (savedForceClose) {
          const freshStateRow = await freshState(stateEntity, state.id);
          const finalized = await setState(stateEntity, freshStateRow, 'clocking_out', requestId, {
            status: 'clocked_out', active_entry_id: null, last_action_at: entry.clock_out,
            pending_started_at: null, break_status: 'working', active_break_id: null,
            last_break_request_id: null, break_pending_started_at: null,
            work_pause_status: 'working', active_work_pause_id: null,
            last_work_pause_request_id: null, work_pause_pending_started_at: null,
            labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
            labor_pending_activity_type: '', labor_pending_work_order_id: '',
          });
          if (!finalized) return Response.json({ success: false, retry_same_request: true, error: 'The correction is saved and audited but employee state finalization is still incomplete. Retry this same correction request.' }, { status: 409 });
        }
        if (intent?.outcome === 'confirmed' || intent?.outcome === 'recovered' || intent?.outcome === 'pending') {
          return Response.json({ success: true, entry, audit_id: intent?.id || null, reused: true });
        }
      }
      if (intent?.outcome === 'confirmed' || intent?.outcome === 'recovered') {
        return Response.json({ success: false, error: 'This correction request was already confirmed but the TimeEntry request marker does not match. Admin investigation is required.' }, { status: 409 });
      }
      if (String(entry.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ success: false, error: 'This time entry changed in another session. Reload before correcting it.' }, { status: 409 });
      }
      const now = new Date().toISOString();
      const nextFields: any = {
        clock_in: clockIn.toISOString(),
        clock_out: clockOut ? clockOut.toISOString() : null,
        lunch_minutes: lunchMinutes,
        total_hours: totalMinutes === null ? Number(entry.total_hours || 0) : (totalMinutes - lunchMinutes - trackedWorkPauseMinutes) / 60,
        status: clockOut ? 'clocked_out' : 'clocked_in',
        notes: String(correction?.notes || '').trim(),
        job_allocations: normalizedAllocations,
        clock_source: 'admin_correction',
        last_corrected_at: now,
        last_corrected_by: actorEmail,
        last_correction_reason: reason,
        last_correction_request_id: requestId,
        approval_status: clockOut ? 'needs_review' : (entry.approval_status || 'unreviewed'),
        ...(activeForceClose ? {
          break_tracking_used: breakSummary.count > 0,
          tracked_break_minutes: breakSummary.total_minutes,
          tracked_paid_break_minutes: breakSummary.paid_minutes,
          tracked_unpaid_break_minutes: breakSummary.unpaid_minutes,
          work_pause_tracking_used: workPauseSummary.count > 0,
          tracked_work_pause_minutes: workPauseSummary.total_minutes,
        } : {}),
      };
      if (entry.status === 'clocked_in' && clockOut) nextFields['clock_out_request_id'] = requestId;

      if (entry.status === 'clocked_in' && !(state.status === 'clocked_in' && state.active_entry_id === entry.id)) {
        return Response.json({ success: false, error: 'The active TimeEntry does not match authoritative employee state. Resolve the state mismatch before correcting it.' }, { status: 409 });
      }
      if (entry.status === 'clocked_in' && (breakStatusOf(state) !== 'working' || state.active_break_id)) {
        return Response.json({ success: false, error: 'End the employee break before correcting an active shift.' }, { status: 409 });
      }
      if (entry.status === 'clocked_in' && (workPauseStatusOf(state) !== 'working' || state.active_work_pause_id)) {
        return Response.json({ success: false, error: 'Resume the employee Work Pause before correcting an active shift.' }, { status: 409 });
      }
      if (entry.status === 'clocked_in' && laborStatusOf(state) !== 'idle') {
        return Response.json({ success: false, error: 'Current Work is still changing. Retry the active-shift correction after that server action finishes.' }, { status: 409 });
      }

      if (!intent) {
        intent = await auditEntity.create({
          action: 'admin_correction', outcome: 'pending', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: now, request_id: requestId,
          time_entry_id: entry.id, reason,
          details: { payload_hash: correctionPayloadHash, original: entryAuditSnapshot(entry), requested: nextFields },
        });
      }
      if (!intent?.id) throw new Error('Correction audit intent could not be persisted. No TimeEntry was changed.');

      let claimedState: any = null;
      if (entry.status === 'clocked_in' && clockOut) {
        claimedState = await setState(stateEntity, state, 'clocked_in', null, {
          status: 'clocking_out', last_request_id: requestId, last_request_payload_hash: null, pending_started_at: now,
        });
        if (!claimedState) {
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { original: entryAuditSnapshot(entry), reason: 'Authoritative state changed before correction claim.' } } });
          return Response.json({ success: false, error: 'The employee clock state changed before the correction could be applied. Reload and review the shift.' }, { status: 409 });
        }
      }

      const updateResult = await entryEntity.updateMany(
        { id: entry.id, updated_date: expectedUpdatedDate, user_email: target.email, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
        { $set: nextFields, ...(clockOut ? { $unset: { approved_at: '', approved_by: '', approval_note: '', approval_request_id: '' } } : {}) },
      );
      if (!updateResult || updateResult.updated !== 1) {
        if (claimedState) {
          const freshClaim = await freshState(stateEntity, claimedState.id);
          await setState(stateEntity, freshClaim, 'clocking_out', requestId, {
            status: 'clocked_in', active_entry_id: entry.id, pending_started_at: null,
            labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
            labor_pending_activity_type: '', labor_pending_work_order_id: '',
          });
        }
        await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { original: entryAuditSnapshot(entry), reason: 'TimeEntry changed before correction update.' } } });
        return Response.json({ success: false, error: 'This time entry changed in another session. The correction was not applied.' }, { status: 409 });
      }

      const savedEntry = await entryEntity.get(entry.id);
      if (claimedState && savedEntry?.clock_out) {
        await closeActiveLaborSegment({
          laborEntity, auditEntity, entry, target, actor, actorEmail, requestId,
          endReason: 'admin_correction', officialEnd: savedEntry.clock_out,
        });
      }
      if (entry.status === 'clocked_in' && !clockOut) {
        const freshActiveState = await freshState(stateEntity, state.id);
        if (freshActiveState.status !== 'clocked_in' || freshActiveState.active_entry_id !== entry.id) {
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { original: entryAuditSnapshot(entry), corrected: entryAuditSnapshot(savedEntry), reason: 'Active entry corrected but authoritative state changed during correction.' } } });
          return Response.json({ success: false, error: 'The active shift was corrected, but employee clock state changed during the operation. Admin review is required.' }, { status: 409 });
        }
        await stateEntity.updateMany(
          { id: freshActiveState.id, updated_date: freshActiveState.updated_date, status: 'clocked_in', active_entry_id: entry.id },
          { $set: { last_action_at: savedEntry.clock_in } },
        );
      }
      const auditFinalized = await auditEntity.updateMany(
        { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id },
        { $set: {
          outcome: 'confirmed', server_timestamp: new Date().toISOString(),
          details: {
            ...(intent.details || {}),
            payload_hash: correctionPayloadHash,
            corrected: entryAuditSnapshot(savedEntry),
          },
        } },
      );
      if (!auditFinalized || auditFinalized.updated !== 1) {
        const freshAudit = await auditEntity.get(intent.id).catch(() => null);
        if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) {
          return Response.json({ success: false, retry_same_request: true, error: 'The correction was saved but its audit finalization was interrupted. Retry this same correction request.' }, { status: 409 });
        }
      }

      if (claimedState) {
        const freshClaim = await freshState(stateEntity, claimedState.id);
        const finalized = await setState(stateEntity, freshClaim, 'clocking_out', requestId, {
          status: 'clocked_out', active_entry_id: null, last_action_at: savedEntry.clock_out,
          pending_started_at: null, break_status: 'working', active_break_id: null,
          last_break_request_id: null, break_pending_started_at: null,
          work_pause_status: 'working', active_work_pause_id: null,
          last_work_pause_request_id: null, work_pause_pending_started_at: null,
          labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
          labor_pending_activity_type: '', labor_pending_work_order_id: '',
        });
        if (!finalized) {
          return Response.json({ success: false, retry_same_request: true, error: 'The correction and audit were saved but employee state finalization was interrupted. Retry this same correction request.' }, { status: 409 });
        }
      }

      return Response.json({ success: true, entry: savedEntry, audit_id: intent.id });
    }

    if (action === 'admin_set_entry_approval') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Administrator access is required to approve time entries.' }, { status: 403 });
      const entryId = String(body?.entry_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      const decision = String(body?.decision || '').trim();
      const note = String(body?.note || '').trim();
      if (!entryId || !expectedUpdatedDate) return Response.json({ success: false, error: 'The loaded TimeEntry version is required before approval.' }, { status: 400 });
      if (!['approve', 'reopen'].includes(decision)) return Response.json({ success: false, error: 'A valid approval decision is required.' }, { status: 400 });
      if (note.length > 500) return Response.json({ success: false, error: 'Approval notes are limited to 500 characters.' }, { status: 400 });
      if (decision === 'reopen' && note.length < 3) return Response.json({ success: false, error: 'A reason is required when sending an approved shift back for review.' }, { status: 400 });

      const entry = await entryEntity.get(entryId).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'TimeEntry was not found or is archived.' }, { status: 404 });
      }
      if (entry.status !== 'clocked_out' || !entry.clock_out) return Response.json({ success: false, error: 'Only completed shifts can be approved.' }, { status: 400 });
      const approvalPayloadHash = await payloadHash({
        entry_id: entry.id,
        expected_updated_date: expectedUpdatedDate,
        decision,
        note,
      });
      const approvalAuditQuery = { action: 'time_approval', request_id: requestId };
      const priorApprovalAudits = await auditEntity.filter(approvalAuditQuery);
      if (!Array.isArray(priorApprovalAudits)) throw new Error('Approval audit lookup did not return a record list.');
      if (priorApprovalAudits.length > 1) return Response.json({ success: false, error: 'This approval request has multiple audit records. Admin investigation is required.' }, { status: 409 });
      let intent = priorApprovalAudits[0] || null;
      const approvalAuditMatches = (auditRow: any) => Boolean(
        auditRow?.id &&
        String(auditRow.time_entry_id || '') === entry.id &&
        asEmail(auditRow.user_email) === target.email &&
        asEmail(auditRow.actor_email) === actorEmail &&
        constantTimeEqual(String(auditRow.details?.payload_hash || ''), approvalPayloadHash)
      );
      if (intent?.id && !approvalAuditMatches(intent)) {
        return Response.json({ success: false, error: 'This approval request id belongs to a different employee, manager, shift, or review payload. Admin investigation is required.' }, { status: 409 });
      }
      if (intent?.outcome === 'blocked') return Response.json({ success: false, error: 'This approval request was previously blocked. Reload and submit a new approval action.' }, { status: 409 });

      const expectedStatus = decision === 'approve' ? 'approved' : 'needs_review';
      const savedByThisApproval = (record: any) => Boolean(
        record?.id &&
        String(record.id) === entry.id &&
        asEmail(record.user_email) === target.email &&
        String(record.approval_request_id || '') === requestId &&
        String(record.approval_status || '') === expectedStatus &&
        (decision !== 'approve' || asEmail(record.approved_by) === actorEmail)
      );
      if (String(entry.approval_request_id || '') === requestId) {
        if ((entry.approval_status || 'unreviewed') !== expectedStatus) {
          return Response.json({ success: false, error: 'This approval request id is already associated with a different approval state.' }, { status: 409 });
        }
        if (!intent?.id) {
          return Response.json({ success: false, error: 'The approval is saved but its required audit record is missing. Admin review is required.' }, { status: 409 });
        }
        if (intent.outcome === 'pending') {
          const auditFinalized = await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id, user_email: target.email, actor_email: actorEmail },
            { $set: {
              outcome: 'recovered', server_timestamp: new Date().toISOString(),
              details: { ...(intent.details || {}), payload_hash: approvalPayloadHash, updated: entryAuditSnapshot(entry), decision, note, recovered_after_entry_save: true },
            } },
          );
          if (!auditFinalized || auditFinalized.updated !== 1) {
            const freshAudit = await auditEntity.get(intent.id).catch(() => null);
            if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || '')) || !approvalAuditMatches(freshAudit)) {
              return Response.json({ success: false, retry_same_request: true, error: 'The approval is saved but its audit is still being finalized. Retry the same approval action.' }, { status: 409 });
            }
          }
        }
        const finalAudit = await auditEntity.get(intent.id).catch(() => null);
        if (!finalAudit || !['confirmed', 'recovered'].includes(String(finalAudit.outcome || '')) ||
          !approvalAuditMatches(finalAudit) || !savedByThisApproval(entry)) {
          return Response.json({ success: false, retry_same_request: true, error: 'The saved approval and exact manager audit could not be verified. Retry the same approval action.' }, { status: 409 });
        }
        if (decision === 'approve') {
          const completedGateReleased = await releaseCompletedCorrectionCreateLock(
            stateEntity, state.id, requestId, entry.id, approvalPayloadHash,
          );
          if (!completedGateReleased) {
            return Response.json({ success: false, retry_same_request: true, error: 'The approval and audit are saved, but the shared correction/approval lock still needs recovery. Retry this same approval.' }, { status: 409 });
          }
        }
        return Response.json({ success: true, entry, audit_id: intent.id, reused: true });
      }
      if (intent?.outcome === 'confirmed' || intent?.outcome === 'recovered') {
        return Response.json({ success: false, error: 'This approval request was already confirmed but the TimeEntry marker does not match. Admin investigation is required.' }, { status: 409 });
      }
      if (entryIsPayPeriodLocked(entry)) {
        return Response.json({ success: false, error: 'This shift is locked by a finalized pay period. Reopen that pay period before changing manager approval.' }, { status: 409 });
      }
      if (String(entry.updated_date || '') !== expectedUpdatedDate) return Response.json({ success: false, error: 'This TimeEntry changed since it was loaded. Reload before approving it.' }, { status: 409 });

      // Serialize approval with employee correction creation using the existing
      // per-employee CAS gate, including the unresolved-correction check.
      let approvalGate: any = null;
      if (decision === 'approve') {
        approvalGate = await claimCorrectionCreateLock(
          stateEntity, state.id, requestId, entry.id, approvalPayloadHash,
        );
        if (!approvalGate?.acquired) {
          return Response.json({
            success: false,
            ...(approvalGate?.retry_same_request ? { retry_same_request: true } : {}),
            error: approvalGate?.investigation
              ? approvalGate.error
              : 'Another correction submission or approval is being processed for this employee. Retry after the current action finishes.',
          }, { status: 409 });
        }
      }
      try {
      if (decision === 'approve') {
        const unresolvedCorrections = await correctionRequestEntity.filter({
          time_entry_id: entry.id,
          status: { $in: ['pending', 'reviewing'] },
        });
        if (!Array.isArray(unresolvedCorrections)) throw new Error('Shift approval correction lookup did not return a record list.');
        if (unresolvedCorrections.length) {
          return Response.json({ success: false, error: 'This shift has an unresolved employee correction. Review the correction before approving the shift.' }, { status: 409 });
        }
      }

      const now = new Date().toISOString();
      if (!intent) {
        intent = await auditEntity.create({
          action: 'time_approval', outcome: 'pending', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: now,
          request_id: requestId, time_entry_id: entry.id, reason: note || (decision === 'approve' ? 'Manager reviewed completed shift' : 'Returned shift for manager review'),
          details: { payload_hash: approvalPayloadHash, original: entryAuditSnapshot(entry), decision, note },
        });
      }
      if (!intent?.id) throw new Error('Approval audit intent could not be persisted. No TimeEntry was changed.');
      const verifiedApprovalAudits = await auditEntity.filter(approvalAuditQuery);
      if (!Array.isArray(verifiedApprovalAudits) || verifiedApprovalAudits.length !== 1 ||
        String(verifiedApprovalAudits[0]?.id || '') !== intent.id || !approvalAuditMatches(verifiedApprovalAudits[0]) ||
        verifiedApprovalAudits[0].outcome !== 'pending') {
        return Response.json({ success: false, error: 'Approval audit intent is ambiguous or mismatched. No approval was changed by this attempt; admin investigation is required.' }, { status: 409 });
      }

      const update = decision === 'approve'
        ? {
            $set: {
              approval_status: 'approved', approved_at: now, approved_by: actorEmail,
              approval_note: note, approval_request_id: requestId,
            },
          }
        : {
            $set: { approval_status: 'needs_review', approval_request_id: requestId },
            $unset: { approved_at: '', approved_by: '', approval_note: '' },
          };
      const result = await entryEntity.updateMany(
        { id: entry.id, updated_date: expectedUpdatedDate, user_email: target.email, status: 'clocked_out', pay_period_id: { $in: [null, ''] }, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
        update,
      );
      const savedEntry = await entryEntity.get(entry.id).catch(() => null);
      if (!result || result.updated !== 1) {
        if (!savedByThisApproval(savedEntry)) {
          if (savedEntry?.id && !entryIsPayPeriodLocked(savedEntry) && String(savedEntry.updated_date || '') === expectedUpdatedDate) {
            return Response.json({ success: false, retry_same_request: true, error: 'The approval has not yet been saved and its audit is still pending. Retry this exact request.' }, { status: 409 });
          }
          await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id, user_email: target.email, actor_email: actorEmail },
            { $set: { outcome: 'blocked' } },
          );
          return Response.json({ success: false, error: 'The TimeEntry changed or became pay-period locked before this approval could be saved. Reload before trying again.' }, { status: 409 });
        }
      }
      if (!savedByThisApproval(savedEntry)) {
        return Response.json({ success: false, retry_same_request: true, error: 'The approval write could not be tied to its exact TimeEntry request marker. Retry this same approval action.' }, { status: 409 });
      }
      await auditEntity.updateMany(
        { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id, user_email: target.email, actor_email: actorEmail },
        { $set: {
          outcome: 'confirmed', server_timestamp: new Date().toISOString(),
          details: { ...(intent.details || {}), payload_hash: approvalPayloadHash, original: entryAuditSnapshot(entry), updated: entryAuditSnapshot(savedEntry), decision, note },
        } },
      );
      const finalAudit = await auditEntity.get(intent.id).catch(() => null);
      if (!finalAudit || !['confirmed', 'recovered'].includes(String(finalAudit.outcome || '')) || !approvalAuditMatches(finalAudit)) {
        return Response.json({ success: false, retry_same_request: true, error: 'The approval was saved but its exact manager audit could not be confirmed. Retry the same approval action.' }, { status: 409 });
      }
      return Response.json({ success: true, entry: savedEntry, audit_id: intent.id });
      } finally {
        if (approvalGate?.acquired) {
          const released = await releaseCorrectionCreateLock(
            stateEntity, state.id, requestId, entry.id, approvalPayloadHash,
            String(approvalGate.claim_token || ''),
          );
          if (!released) {
            const currentGate = await freshState(stateEntity, state.id).catch(() => null);
            const gateStatus = String(currentGate?.correction_create_status || '');
            const safelyReleased = currentGate?.id && (
              gateStatus === 'idle' ||
              (gateStatus === 'creating' && String(currentGate.correction_create_request_id || '') !== requestId)
            );
            if (!safelyReleased) {
              throw new Error('The approval gate could not be released or verified after processing. Retry the same approval request to recover its lock.');
            }
          }
        }
      }
    }

    if (action === 'admin_archive_entry') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Administrator access is required to archive time entries.' }, { status: 403 });
      const entryId = String(body?.entry_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      const reason = String(body?.reason || '').trim();
      if (!entryId || !expectedUpdatedDate) return Response.json({ success: false, error: 'The loaded TimeEntry version is required before archiving it.' }, { status: 400 });
      if (reason.length < 3 || reason.length > 500) return Response.json({ success: false, error: 'An archive reason between 3 and 500 characters is required.' }, { status: 400 });

      const entry = await entryEntity.get(entryId).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data) {
        return Response.json({ success: false, error: 'TimeEntry was not found or is unavailable.' }, { status: 404 });
      }
      const archivePayloadHash = await payloadHash({ entry_id: entry.id, expected_updated_date: expectedUpdatedDate, reason });
      const priorArchiveAudits = await auditEntity.filter({ action: 'admin_archive', request_id: requestId, time_entry_id: entry.id });
      if (!Array.isArray(priorArchiveAudits)) throw new Error('Administrative archive audit lookup did not return a record list.');
      if (priorArchiveAudits.length > 1) return Response.json({ success: false, error: 'This archive request has multiple audit records. Admin investigation is required.' }, { status: 409 });
      let intent = priorArchiveAudits[0] || null;
      const priorPayloadHash = String(intent?.details?.payload_hash || '');
      if (intent && priorPayloadHash && !constantTimeEqual(priorPayloadHash, archivePayloadHash)) {
        return Response.json({ success: false, error: 'This archive request id is already bound to different archive details. Submit a new archive request.' }, { status: 409 });
      }
      if (intent && !priorPayloadHash && String(intent.reason || '') !== reason) {
        return Response.json({ success: false, error: 'This archive request id is already bound to a different archive reason. Submit a new archive request.' }, { status: 409 });
      }
      if (intent?.outcome === 'blocked') return Response.json({ success: false, error: 'This archive request was previously blocked. Reload and submit a new archive request.' }, { status: 409 });
      const archiveTime = String(intent?.server_timestamp || entry.archived_at || new Date().toISOString());

      if (entry.archived_admin) {
        if (!intent?.id) return Response.json({ success: false, error: 'TimeEntry is already archived by a different or unknown request.' }, { status: 409 });
        if (state.status === 'clocking_out' && String(state.last_request_id || '') === requestId && state.active_entry_id === entry.id) {
          const activeLabor = await activeLaborForEntry(laborEntity, entry.id, target.email);
          if (activeLabor?.id) {
            const laborStartMs = new Date(activeLabor.started_at).getTime();
            const archiveEndMs = new Date(entry.archived_at || archiveTime).getTime();
            if (!Number.isFinite(laborStartMs) || !Number.isFinite(archiveEndMs) || archiveEndMs < laborStartMs) {
              return Response.json({ success: false, error: 'The saved archive time is earlier than active Current Work. Admin review is required.' }, { status: 409 });
            }
            await closeActiveLaborSegment({
              laborEntity, auditEntity, entry, target, actor, actorEmail, requestId,
              endReason: 'admin_archive', officialEnd: entry.archived_at || archiveTime,
            });
          }
        }
        if (intent.outcome === 'pending') {
          const auditFinalized = await auditEntity.updateMany(
            { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id },
            { $set: {
              outcome: 'confirmed', server_timestamp: new Date().toISOString(),
              details: { ...(intent.details || {}), payload_hash: archivePayloadHash, archived_entry: entryAuditSnapshot(entry), recovered_after_entry_save: true },
            } },
          );
          if (!auditFinalized || auditFinalized.updated !== 1) {
            const freshAudit = await auditEntity.get(intent.id).catch(() => null);
            if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) {
              return Response.json({ success: false, retry_same_request: true, error: 'The entry is archived but its audit is still being finalized. Retry this same archive request.' }, { status: 409 });
            }
          }
        }
        if (state.status === 'clocking_out' && String(state.last_request_id || '') === requestId && state.active_entry_id === entry.id) {
          const freshClaim = await freshState(stateEntity, state.id);
          const finalized = await setState(stateEntity, freshClaim, 'clocking_out', requestId, {
            status: 'clocked_out', active_entry_id: null, last_action_at: entry.archived_at || archiveTime, pending_started_at: null,
            break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
            work_pause_status: 'working', active_work_pause_id: null,
            last_work_pause_request_id: null, work_pause_pending_started_at: null,
            labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
            labor_pending_activity_type: '', labor_pending_work_order_id: '',
          });
          if (!finalized) return Response.json({ success: false, retry_same_request: true, error: 'The archive and audit are saved but employee state finalization is incomplete. Retry this same archive request.' }, { status: 409 });
        }
        return Response.json({ success: true, archived: true, time_entry_id: entry.id, audit_id: intent.id, reused: true });
      }

      if (intent?.outcome === 'confirmed' || intent?.outcome === 'recovered') {
        return Response.json({ success: false, error: 'This archive request was already confirmed but the TimeEntry is not archived. Admin investigation is required.' }, { status: 409 });
      }
      if (entryIsPayPeriodLocked(entry)) return Response.json({ success: false, error: 'This shift is locked by a finalized pay period. Reopen that pay period before archiving it.' }, { status: 409 });
      if (String(entry.updated_date || '') !== expectedUpdatedDate) return Response.json({ success: false, error: 'This time entry changed in another session. Reload before archiving it.' }, { status: 409 });
      if (entry.status === 'clocked_in' && !(state.status === 'clocked_in' && state.active_entry_id === entry.id)) {
        return Response.json({ success: false, error: 'The active TimeEntry does not match authoritative employee state. Resolve the mismatch before archiving it.' }, { status: 409 });
      }
      if (entry.status === 'clocked_in' && (breakStatusOf(state) !== 'working' || state.active_break_id)) {
        return Response.json({ success: false, error: 'End the employee break before archiving an active shift.' }, { status: 409 });
      }
      if (entry.status === 'clocked_in' && (workPauseStatusOf(state) !== 'working' || state.active_work_pause_id)) {
        return Response.json({ success: false, error: 'Resume the employee Work Pause before archiving an active shift.' }, { status: 409 });
      }
      if (entry.status === 'clocked_in' && laborStatusOf(state) !== 'idle') {
        return Response.json({ success: false, error: 'Current Work is still changing. Retry archival after that server action finishes.' }, { status: 409 });
      }

      const now = archiveTime;
      if (!intent) {
        intent = await auditEntity.create({
          action: 'admin_archive', outcome: 'pending', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: now, request_id: requestId,
          time_entry_id: entry.id, reason,
          details: { payload_hash: archivePayloadHash, original: entryAuditSnapshot(entry) },
        });
      }
      if (!intent?.id) throw new Error('Archive audit intent could not be persisted. No TimeEntry was changed.');

      if (entry.status === 'clocked_in') {
        const activeLabor = await activeLaborForEntry(laborEntity, entry.id, target.email);
        if (activeLabor?.id) {
          const laborStartMs = new Date(activeLabor.started_at).getTime();
          const archiveEndMs = new Date(now).getTime();
          if (!Number.isFinite(laborStartMs) || !Number.isFinite(archiveEndMs) || archiveEndMs < laborStartMs) {
            await auditEntity.updateMany({ id: intent.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
            return Response.json({ success: false, error: 'Archive time cannot be earlier than the active Current Work segment start.' }, { status: 409 });
          }
        }
      }

      let claimedState: any = null;
      if (entry.status === 'clocked_in') {
        claimedState = await setState(stateEntity, state, 'clocked_in', null, {
          status: 'clocking_out', last_request_id: requestId, last_request_payload_hash: null, pending_started_at: now,
        });
        if (!claimedState) {
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked' } });
          return Response.json({ success: false, error: 'The employee clock state changed before archival could be applied.' }, { status: 409 });
        }
      }

      const updateResult = await entryEntity.updateMany(
        { id: entry.id, updated_date: expectedUpdatedDate, user_email: target.email, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
        { $set: { archived_admin: true, archived_at: now, archived_by: actorEmail, archive_reason: reason } },
      );
      if (!updateResult || updateResult.updated !== 1) {
        if (claimedState) {
          const freshClaim = await freshState(stateEntity, claimedState.id);
          await setState(stateEntity, freshClaim, 'clocking_out', requestId, {
            status: 'clocked_in', active_entry_id: entry.id, pending_started_at: null,
            labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
            labor_pending_activity_type: '', labor_pending_work_order_id: '',
          });
        }
        await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked' } });
        return Response.json({ success: false, error: 'This time entry changed in another session. It was not archived.' }, { status: 409 });
      }

      const savedEntry = await entryEntity.get(entry.id);
      if (claimedState) {
        await closeActiveLaborSegment({
          laborEntity, auditEntity, entry: savedEntry, target, actor, actorEmail, requestId,
          endReason: 'admin_archive', officialEnd: now,
        });
      }

      const auditFinalized = await auditEntity.updateMany(
        { id: intent.id, outcome: 'pending', request_id: requestId, time_entry_id: entry.id },
        { $set: {
          outcome: 'confirmed', server_timestamp: new Date().toISOString(),
          details: {
            ...(intent.details || {}),
            payload_hash: archivePayloadHash,
            archived_entry: entryAuditSnapshot(savedEntry),
          },
        } },
      );
      if (!auditFinalized || auditFinalized.updated !== 1) {
        const freshAudit = await auditEntity.get(intent.id).catch(() => null);
        if (!freshAudit || !['confirmed', 'recovered'].includes(String(freshAudit.outcome || ''))) {
          return Response.json({ success: false, retry_same_request: true, error: 'The entry was archived but its audit finalization was interrupted. Retry this same archive request.' }, { status: 409 });
        }
      }

      if (claimedState) {
        const freshClaim = await freshState(stateEntity, claimedState.id);
        const finalized = await setState(stateEntity, freshClaim, 'clocking_out', requestId, {
          status: 'clocked_out', active_entry_id: null, last_action_at: now, pending_started_at: null,
          break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
          work_pause_status: 'working', active_work_pause_id: null,
          last_work_pause_request_id: null, work_pause_pending_started_at: null,
          labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
          labor_pending_activity_type: '', labor_pending_work_order_id: '',
        });
        if (!finalized) {
          return Response.json({ success: false, retry_same_request: true, error: 'The archive and audit were saved but employee state finalization was interrupted. Retry this same archive request.' }, { status: 409 });
        }
      }

      return Response.json({ success: true, archived: true, time_entry_id: entry.id, audit_id: intent.id });
    }

    if (action === 'clock_in') {
      if (state.status === 'clocked_in') {
        const entry = state.active_entry_id ? await entryEntity.get(state.active_entry_id).catch(() => null) : null;
        if (entry?.id && entry.status === 'clocked_in' && asEmail(entry.user_email) === target.email && !entry.archived_test_data && !entry.archived_admin) {
          return Response.json({ success: true, status: 'already_clocked_in', entry, reused: true, user: publicEmployee(target) });
        }
        return Response.json({ success: false, error: 'Clock state says this employee is already clocked in, but the active entry is invalid. Admin review is required.' }, { status: 409 });
      }
      const resumingClockIn = state.status === 'clocking_in' && String(state.last_request_id || '') === requestId;
      if (state.status !== 'clocked_out' && !resumingClockIn) {
        return Response.json({ success: false, error: 'Another Time Clock action is still in progress. Retry shortly.' }, { status: 409 });
      }

      const existingActives = await entryEntity.filter({ user_email: target.email, status: 'clocked_in', archived_test_data: { $ne: true }, archived_admin: { $ne: true } });
      if (!Array.isArray(existingActives)) throw new Error('Active TimeEntry lookup did not return a record list.');
      if (existingActives.length > 0) {
        return Response.json({ success: false, error: `Found ${existingActives.length} existing active TimeEntry record${existingActives.length === 1 ? '' : 's'}. Reset or admin review is required before clock-in.` }, { status: 409 });
      }

      const clockInGateEntryId = `clock_in:${target.email}`;
      const clockInGatePayloadHash = await payloadHash({ action: 'clock_in', user_email: target.email });
      const clockInGate = await claimCorrectionCreateLock(
        stateEntity, state.id, requestId, clockInGateEntryId, clockInGatePayloadHash,
      );
      if (!clockInGate?.acquired) {
        return Response.json({
          success: false, retry_same_request: true,
          error: 'Clock In is temporarily serialized with a pay-period finalization or another employee record change. Retry this same Clock In after status refresh.',
        }, { status: 409 });
      }
      state = clockInGate.state?.id ? clockInGate.state : await freshState(stateEntity, state.id);

      try {
        const officialClockIn = resumingClockIn && state.pending_started_at
          ? state.pending_started_at
          : new Date().toISOString();
        const claimed = resumingClockIn
          ? state
          : await setState(stateEntity, state, 'clocked_out', null, {
              status: 'clocking_in', active_entry_id: null, last_request_id: requestId, last_request_payload_hash: null,
              pending_started_at: officialClockIn, break_status: 'working', active_break_id: null,
              last_break_request_id: null, break_pending_started_at: null,
              work_pause_status: 'working', active_work_pause_id: null,
              last_work_pause_request_id: null, work_pause_pending_started_at: null,
              labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
              labor_pending_activity_type: '', labor_pending_work_order_id: '',
            });
        if (!claimed) return Response.json({ success: false, error: 'Clock-in lost a concurrency race. Reload status before retrying.' }, { status: 409 });

        let entry = await uniqueRow(entryEntity, { user_email: target.email, clock_in_request_id: requestId, archived_test_data: { $ne: true }, archived_admin: { $ne: true } }, 'Clock-in request');
        if (!entry) {
          entry = await entryEntity.create({
            user_email: target.email,
            user_name: target.full_name || target.email,
            clock_in: officialClockIn,
            clock_in_request_id: requestId,
            clock_source: 'server',
            status: 'clocked_in',
          });
        }
        if (!entry?.id) throw new Error('Clock-in TimeEntry could not be created.');

        const currentClaim = await freshState(stateEntity, claimed.id);
        const auditClaim = await setState(stateEntity, currentClaim, 'clocking_in', requestId, {
          pending_started_at: currentClaim.pending_started_at || entry.clock_in,
        });
        if (!auditClaim) {
          return Response.json({ success: false, retry_same_request: true, error: 'Clock-in is being recovered in another session. Retry the same action after status refresh.' }, { status: 409 });
        }
        await ensureClockInAudit({ auditEntity, entry, target, actor, requestId });
        const finalized = await setState(stateEntity, auditClaim, 'clocking_in', requestId, {
          status: 'clocked_in', active_entry_id: entry.id, last_action_at: entry.clock_in,
          pending_started_at: null, break_status: 'working', active_break_id: null,
          last_break_request_id: null, break_pending_started_at: null,
          work_pause_status: 'working', active_work_pause_id: null,
          last_work_pause_request_id: null, work_pause_pending_started_at: null,
          labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
          labor_pending_activity_type: '', labor_pending_work_order_id: '',
        });
        if (!finalized) {
          return Response.json({ success: false, retry_same_request: true, error: 'Clock-in and its audit were saved but state finalization was interrupted. Retry this same action to recover safely.' }, { status: 409 });
        }

        return Response.json({ success: true, status: 'clocked_in', entry, user: publicEmployee(target), audit_saved: true });
      } finally {
        let releaseFailed = false;
        try {
          const released = await releaseCorrectionCreateLock(
            stateEntity, state.id, requestId, clockInGateEntryId,
            clockInGatePayloadHash, String(clockInGate.claim_token || ''),
          );
          if (!released) {
            const current = await freshState(stateEntity, state.id).catch(() => null);
            const gateStatus = String(current?.correction_create_status || '');
            const safe = current?.id && (
              !gateStatus || gateStatus === 'idle' ||
              (gateStatus === 'creating' && String(current.correction_create_request_id || '') !== requestId)
            );
            if (!safe) releaseFailed = true;
          }
        } catch {
          releaseFailed = true;
        }
        if (releaseFailed) {
          throw new Error('Clock-in employee mutation gate could not be released safely. Retry this same Clock In for recovery.');
        }
      }
    }

    if (action === 'clock_out') {
      const submittedClockOut = clockOutSubmissionForHash(body);
      const clockOutPayloadHash = await payloadHash(submittedClockOut);

      if (state.status === 'clocked_out') {
        const prior = await uniqueRow(entryEntity, { user_email: target.email, clock_out_request_id: requestId, archived_test_data: { $ne: true }, archived_admin: { $ne: true } }, 'Clock-out request');
        if (prior?.id && prior.status === 'clocked_out') {
          const priorAudit = await clockOutAuditForRequest(auditEntity, requestId, prior.id);
          const stateHash = String(state.last_request_id || '') === requestId ? String(state.last_request_payload_hash || '') : '';
          const auditHash = String(priorAudit?.details?.payload_hash || '');
          if (stateHash && !constantTimeEqual(stateHash, clockOutPayloadHash)) {
            return Response.json({ success: false, error: 'This Clock Out request id is already bound to different reconciliation details.' }, { status: 409 });
          }
          if (auditHash && !constantTimeEqual(auditHash, clockOutPayloadHash)) {
            return Response.json({ success: false, error: 'This Clock Out request id is already bound to a different confirmed audit payload.' }, { status: 409 });
          }
          if (!priorAudit && stateHash) {
            return Response.json({ success: false, error: 'Clock-out is complete but its required audit record is missing. Admin review is required before this request can be treated as fully confirmed.' }, { status: 409 });
          }
          if (priorAudit && !['confirmed', 'recovered', 'reused'].includes(String(priorAudit.outcome || ''))) {
            return Response.json({ success: false, retry_same_request: true, error: 'Clock-out is saved but its audit is not finalized. Retry this same request.' }, { status: 409 });
          }
          return Response.json({ success: true, status: 'already_clocked_out', entry: prior, reused: true, user: publicEmployee(target), audit_saved: Boolean(priorAudit) });
        }
        return Response.json({ success: false, error: 'Employee is not currently clocked in.' }, { status: 409 });
      }

      let resumingClockOut = state.status === 'clocking_out' && String(state.last_request_id || '') === requestId;
      if (resumingClockOut) {
        const boundHash = String(state.last_request_payload_hash || '');
        if (boundHash && !constantTimeEqual(boundHash, clockOutPayloadHash)) {
          return Response.json({ success: false, error: 'This Clock Out request id is already bound to different reconciliation details. Retry with the original allocations, lunch, and notes.' }, { status: 409 });
        }
        if (!boundHash) {
          const rebound = await setState(stateEntity, state, 'clocking_out', requestId, { last_request_payload_hash: clockOutPayloadHash });
          if (!rebound) return Response.json({ success: false, retry_same_request: true, error: 'Clock-out recovery lost a concurrency race. Reload status and retry the same request.' }, { status: 409 });
          state = rebound;
          resumingClockOut = true;
        }
      }
      if ((state.status !== 'clocked_in' && !resumingClockOut) || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Another Time Clock action is still in progress or the active entry is missing.' }, { status: 409 });
      }

      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      const completedSameRequest = Boolean(
        resumingClockOut && entry?.id && entry.status === 'clocked_out' &&
        String(entry.clock_out_request_id || '') === requestId && asEmail(entry.user_email) === target.email &&
        !entry.archived_test_data && !entry.archived_admin
      );
      if (completedSameRequest) {
        let existingAudit = await clockOutAuditForRequest(auditEntity, requestId, entry.id);
        if (existingAudit) {
          const auditHash = String(existingAudit?.details?.payload_hash || '');
          if (auditHash && !constantTimeEqual(auditHash, clockOutPayloadHash)) {
            return Response.json({ success: false, error: 'This completed Clock Out has a different audit payload. Admin review is required.' }, { status: 409 });
          }
          if (!['confirmed', 'recovered', 'reused'].includes(String(existingAudit.outcome || ''))) {
            return Response.json({ success: false, retry_same_request: true, error: 'Clock-out is saved but audit finalization is still incomplete. Retry the same request.' }, { status: 409 });
          }
        } else {
          const pendingStarted = state.pending_started_at ? new Date(state.pending_started_at) : null;
          const pendingAgeMs = pendingStarted && Number.isFinite(pendingStarted.getTime()) ? Date.now() - pendingStarted.getTime() : Number.POSITIVE_INFINITY;
          if (pendingAgeMs < 5000) {
            return Response.json({ success: false, retry_same_request: true, error: 'Clock-out is saved and finalization is still in progress. Retry the same request.' }, { status: 409 });
          }
          const recoveryStartedAt = new Date().toISOString();
          const recoveryClaim = await setState(stateEntity, state, 'clocking_out', requestId, {
            pending_started_at: recoveryStartedAt,
            last_request_payload_hash: clockOutPayloadHash,
          });
          if (!recoveryClaim) {
            existingAudit = await clockOutAuditForRequest(auditEntity, requestId, entry.id);
            if (!existingAudit) return Response.json({ success: false, retry_same_request: true, error: 'Another Clock Out recovery is already in progress. Retry the same request.' }, { status: 409 });
          } else {
            state = recoveryClaim;
            const recoveryBreakSummary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
            const recoveryWorkPauseSummary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
            const recoveryAuditSaved = await audit(auditEntity, {
              action: 'clock_out', outcome: 'recovered', user_email: target.email,
              user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
              authentication_method: authenticationMethodFor(actor, target),
              server_timestamp: entry.clock_out, request_id: requestId, time_entry_id: entry.id,
              reason: 'Recovered interrupted Clock Out audit finalization',
              details: {
                payload_hash: clockOutPayloadHash,
                submitted_lunch_minutes: submittedClockOut.lunch_minutes,
                lunch_minutes: Number(entry.lunch_minutes || 0), total_hours: Number(entry.total_hours || 0),
                break_summary: recoveryBreakSummary, work_pause_summary: recoveryWorkPauseSummary,
                recovered_after_entry_save: true,
              },
            });
            if (!recoveryAuditSaved) return Response.json({ success: false, retry_same_request: true, error: 'Clock-out is saved but its audit recovery was interrupted. Retry the same request.' }, { status: 409 });
            existingAudit = await clockOutAuditForRequest(auditEntity, requestId, entry.id);
          }
        }

        const recoveredAuditHash = String(existingAudit?.details?.payload_hash || '');
        if (!existingAudit || !['confirmed', 'recovered', 'reused'].includes(String(existingAudit.outcome || ''))) {
          return Response.json({ success: false, retry_same_request: true, error: 'Clock-out is saved but a confirmed audit could not be verified yet. Retry the same request.' }, { status: 409 });
        }
        if (recoveredAuditHash && !constantTimeEqual(recoveredAuditHash, clockOutPayloadHash)) {
          return Response.json({ success: false, error: 'Clock-out audit recovery produced a payload mismatch. Admin review is required.' }, { status: 409 });
        }

        const currentRecoveryState = await freshState(stateEntity, state.id);
        const finalizedRecovery = await setState(stateEntity, currentRecoveryState, 'clocking_out', requestId, {
          status: 'clocked_out', active_entry_id: null, last_action_at: entry.clock_out,
          pending_started_at: null, break_status: 'working', active_break_id: null,
          last_break_request_id: null, break_pending_started_at: null,
          work_pause_status: 'working', active_work_pause_id: null,
          last_work_pause_request_id: null, work_pause_pending_started_at: null,
          labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
          labor_pending_activity_type: '', labor_pending_work_order_id: '',
        });
        if (!finalizedRecovery) return Response.json({ success: false, retry_same_request: true, error: 'Clock-out and audit are saved but state finalization was interrupted. Retry the same request.' }, { status: 409 });
        return Response.json({ success: true, status: 'clocked_out', entry, reused: true, recovered: true, user: publicEmployee(target), audit_saved: Boolean(existingAudit) });
      }

      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }

      if (breakStatusOf(state) !== 'working' || state.active_break_id) {
        return Response.json({ success: false, error: 'End the active break before clocking out.' }, { status: 409 });
      }
      if (workPauseStatusOf(state) !== 'working' || state.active_work_pause_id) {
        return Response.json({ success: false, error: 'Resume Work before clocking out.' }, { status: 409 });
      }
      if (laborStatusOf(state) !== 'idle') {
        return Response.json({ success: false, error: 'Current Work is still changing. Retry Clock Out after that server action finishes.' }, { status: 409 });
      }
      const breakSummary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
      const workPauseSummary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
      const trackedUnpaidMinutes = breakSummary.unpaid_minutes;
      const manualLunchMinutes = submittedClockOut.lunch_minutes;
      let lunchMinutes = trackedUnpaidMinutes;
      if (trackedUnpaidMinutes <= 0) {
        if (!Number.isFinite(manualLunchMinutes) || manualLunchMinutes < 0 || manualLunchMinutes > 240) {
          return Response.json({ success: false, error: 'Lunch minutes must be between 0 and 240 when no unpaid break was tracked.' }, { status: 400 });
        }
        lunchMinutes = manualLunchMinutes;
      }
      const allocations = submittedClockOut.job_allocations;
      if (allocations.length === 0) return Response.json({ success: false, error: 'At least one job allocation is required.' }, { status: 400 });
      for (const job of allocations) {
        if (minutesFromAllocation(job) <= 0) return Response.json({ success: false, error: 'Every job allocation must contain positive time.' }, { status: 400 });
        if (job?.is_inhouse && !String(job?.inhouse_task || '').trim()) {
          return Response.json({ success: false, error: 'Every in-house allocation requires a task.' }, { status: 400 });
        }
      }

      const officialClockOut = resumingClockOut && state.pending_started_at
        ? state.pending_started_at
        : new Date().toISOString();
      const clockInMs = new Date(entry.clock_in).getTime();
      const clockOutMs = new Date(officialClockOut).getTime();
      if (!Number.isFinite(clockInMs) || clockOutMs < clockInMs) {
        return Response.json({ success: false, error: 'The stored clock-in timestamp is invalid.' }, { status: 409 });
      }
      const totalMinutes = Math.floor((clockOutMs - clockInMs) / 60000);
      const workableMinutes = totalMinutes - lunchMinutes - workPauseSummary.total_minutes;
      if (workableMinutes < 0) return Response.json({ success: false, error: 'Unpaid lunch and Work Pause time cannot exceed the shift duration.' }, { status: 400 });
      const allocatedMinutes = allocations.reduce((sum: number, job: any) => sum + minutesFromAllocation(job), 0);
      if (Math.abs(allocatedMinutes - workableMinutes) > 5) {
        return Response.json({ success: false, error: `Allocated time must match official worked time within 5 minutes. Official remaining difference is ${Math.abs(allocatedMinutes - workableMinutes)} minutes.` }, { status: 400 });
      }

      const claimed = resumingClockOut
        ? state
        : await setState(stateEntity, state, 'clocked_in', null, {
            status: 'clocking_out', last_request_id: requestId, last_request_payload_hash: clockOutPayloadHash, pending_started_at: officialClockOut,
          });
      if (!claimed) return Response.json({ success: false, error: 'Clock-out lost a concurrency race. Reload status before retrying.' }, { status: 409 });

      await closeActiveLaborSegment({
        laborEntity, auditEntity, entry, target, actor, actorEmail, requestId,
        endReason: 'clock_out', officialEnd: officialClockOut,
      });

      const nextFields = {
        clock_out: officialClockOut,
        clock_out_request_id: requestId,
        lunch_minutes: lunchMinutes,
        total_hours: workableMinutes / 60,
        job_allocations: allocations,
        notes: submittedClockOut.notes,
        status: 'clocked_out',
        clock_source: 'server',
        break_tracking_used: breakSummary.count > 0,
        tracked_break_minutes: breakSummary.total_minutes,
        tracked_paid_break_minutes: breakSummary.paid_minutes,
        tracked_unpaid_break_minutes: breakSummary.unpaid_minutes,
        work_pause_tracking_used: workPauseSummary.count > 0,
        tracked_work_pause_minutes: workPauseSummary.total_minutes,
        approval_status: 'unreviewed',
      };
      const updateResult = await entryEntity.updateMany(
        { id: entry.id, updated_date: entry.updated_date, user_email: target.email, status: 'clocked_in' },
        { $set: nextFields },
      );
      if (!updateResult || typeof updateResult.updated !== 'number' || updateResult.updated !== 1) {
        const fresh = await entryEntity.get(entry.id).catch(() => null);
        if (!(fresh?.status === 'clocked_out' && String(fresh.clock_out_request_id || '') === requestId)) {
          return Response.json({ success: false, retry_same_request: true, error: 'Clock-out could not safely update the active TimeEntry. Retry the same request after status reload.' }, { status: 409 });
        }
        return Response.json({ success: false, retry_same_request: true, error: 'Clock-out was saved by this request in another execution. Retry the same request to complete audit and state finalization.' }, { status: 409 });
      }
      const savedEntry = await entryEntity.get(entry.id);

      const auditSaved = await audit(auditEntity, {
        action: 'clock_out', outcome: 'confirmed', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target),
        server_timestamp: savedEntry.clock_out, request_id: requestId, time_entry_id: savedEntry.id,
        details: {
          payload_hash: clockOutPayloadHash,
          submitted_lunch_minutes: submittedClockOut.lunch_minutes,
          lunch_minutes: lunchMinutes, total_hours: savedEntry.total_hours,
          break_summary: breakSummary, work_pause_summary: workPauseSummary,
        },
      });
      if (!auditSaved) {
        return Response.json({ success: false, retry_same_request: true, error: 'Clock-out was saved but its audit could not be confirmed. Retry this same request to recover safely.' }, { status: 409 });
      }

      const currentClaim = await freshState(stateEntity, claimed.id);
      const finalized = await setState(stateEntity, currentClaim, 'clocking_out', requestId, {
        status: 'clocked_out', active_entry_id: null, last_action_at: savedEntry.clock_out,
        pending_started_at: null, break_status: 'working', active_break_id: null,
        last_break_request_id: null, break_pending_started_at: null,
        work_pause_status: 'working', active_work_pause_id: null,
        last_work_pause_request_id: null, work_pause_pending_started_at: null,
        labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
        labor_pending_activity_type: '', labor_pending_work_order_id: '',
      });
      if (!finalized) {
        return Response.json({ success: false, retry_same_request: true, error: 'Clock-out and audit were saved but state finalization was interrupted. Retry this same action to recover safely.' }, { status: 409 });
      }

      return Response.json({ success: true, status: 'clocked_out', entry: savedEntry, user: publicEmployee(target), audit_saved: true });
    }

    return Response.json({ success: false, error: 'Unsupported Time Clock action.' }, { status: 400 });
  } catch (error) {
    console.error('timeClockAction error:', error?.message || error);
    return Response.json({ success: false, error: 'Time Clock action could not be completed safely.' }, { status: 500 });
  }
});
