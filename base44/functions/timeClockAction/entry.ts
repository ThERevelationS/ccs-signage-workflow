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
    updated_date: entry?.updated_date || null,
  };
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

async function recoverTransition({ stateEntity, entryEntity, auditEntity, state, target, actor }: any) {
  if (!['clocking_in', 'clocking_out'].includes(String(state?.status || ''))) return state;
  const requestId = String(state.last_request_id || '');
  const started = state.pending_started_at ? new Date(state.pending_started_at) : null;
  const ageMs = started && Number.isFinite(started.getTime()) ? Date.now() - started.getTime() : Number.POSITIVE_INFINITY;

  if (state.status === 'clocking_in') {
    const matches = requestId ? await entryEntity.filter({ user_email: target.email, clock_in_request_id: requestId, archived_test_data: { $ne: true }, archived_admin: { $ne: true } }) : [];
    if (Array.isArray(matches) && matches.length === 1) {
      const entry = matches[0];
      const recovered = await setState(stateEntity, state, 'clocking_in', requestId, {
        status: 'clocked_in',
        active_entry_id: entry.id,
        last_action_at: entry.clock_in,
        pending_started_at: null,
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: 'Recovered interrupted clock-in finalization',
        });
        return recovered;
      }
    }
    if ((!Array.isArray(matches) || matches.length === 0) && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setState(stateEntity, state, 'clocking_in', requestId, {
        status: 'clocked_out', active_entry_id: null, pending_started_at: null,
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
      const recovered = await setState(stateEntity, state, 'clocking_out', requestId, {
        status: 'clocked_out', active_entry_id: null, last_action_at: entry.archived_at || new Date().toISOString(), pending_started_at: null,
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: 'Recovered interrupted administrative archive finalization',
        });
        return recovered;
      }
    }
    if (entry?.id && entry.status === 'clocked_out' && String(entry.clock_out_request_id || '') === requestId) {
      const recovered = await setState(stateEntity, state, 'clocking_out', requestId, {
        status: 'clocked_out', active_entry_id: null, last_action_at: entry.clock_out, pending_started_at: null,
      });
      if (recovered) {
        await audit(auditEntity, {
          action: 'state_recovery', outcome: 'recovered', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actor.email, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: 'Recovered interrupted clock-out finalization',
        });
        return recovered;
      }
    }
    if (entry?.id && entry.status === 'clocked_in' && ageMs > 5 * 60 * 1000) {
      const rolledBack = await setState(stateEntity, state, 'clocking_out', requestId, {
        status: 'clocked_in', active_entry_id: entry.id, pending_started_at: null,
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
    state = await recoverTransition({ stateEntity, entryEntity, auditEntity, state, target, actor });

    if (action === 'status') {
      if (state.status === 'clocked_in' && state.active_entry_id) {
        const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
        if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
          return Response.json({ success: false, error: 'Stored clock state does not match the active TimeEntry. Admin review is required.' }, { status: 409 });
        }
        return Response.json({ success: true, status: 'clocked_in', entry, user: publicEmployee(target) });
      }
      if (state.status === 'clocked_out') return Response.json({ success: true, status: 'clocked_out', entry: null, user: publicEmployee(target) });
      return Response.json({ success: false, error: 'A Time Clock action is still in progress. Retry shortly.' }, { status: 409 });
    }

    if (!requestId) return Response.json({ success: false, error: 'A valid request id is required.' }, { status: 400 });

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
      if (actor.role === 'badge') {
        return Response.json({ success: false, error: 'A signed-in employee session is required to edit notes.' }, { status: 403 });
      }
      const entryId = String(body?.entry_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      const notes = String(body?.notes || '').trim();
      if (!entryId || !expectedUpdatedDate) {
        return Response.json({ success: false, error: 'The loaded TimeEntry version is required before editing notes.' }, { status: 400 });
      }
      if (notes.length > 4000) return Response.json({ success: false, error: 'Time entry notes are limited to 4,000 characters.' }, { status: 400 });

      const entry = await entryEntity.get(entryId).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'TimeEntry was not found or is archived.' }, { status: 404 });
      }
      const now = new Date().toISOString();
      const intent = await auditEntity.create({
        action: 'notes_update', outcome: 'pending', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target),
        server_timestamp: now, request_id: requestId, time_entry_id: entry.id,
        details: { previous_notes: entry.notes || '', requested_notes: notes },
      });
      if (!intent?.id) throw new Error('Notes audit intent could not be persisted. No TimeEntry was changed.');

      const updateResult = await entryEntity.updateMany(
        { id: entry.id, updated_date: expectedUpdatedDate, user_email: target.email, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
        { $set: { notes } },
      );
      if (!updateResult || updateResult.updated !== 1) {
        await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked' } });
        return Response.json({ success: false, error: 'This time entry changed in another session. Reload before editing its notes.' }, { status: 409 });
      }
      const savedEntry = await entryEntity.get(entry.id);
      await auditEntity.updateMany({ id: intent.id }, { $set: {
        outcome: 'confirmed', server_timestamp: new Date().toISOString(),
        details: { previous_notes: entry.notes || '', new_notes: notes },
      } });
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
        if (asEmail(priorByRequest.user_email) !== target.email) return Response.json({ success: false, error: 'Correction request id is already in use.' }, { status: 409 });
        return Response.json({ success: true, request: priorByRequest, reused: true });
      }

      const entry = await entryEntity.get(entryId).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'TimeEntry was not found or is archived.' }, { status: 404 });
      }
      if (entry.status !== 'clocked_out' || !entry.clock_out) {
        return Response.json({ success: false, error: 'Correction requests can only be submitted for completed shifts.' }, { status: 400 });
      }
      if (String(entry.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ success: false, error: 'This time entry changed since it was loaded. Reload before requesting a correction.' }, { status: 409 });
      }
      const openRequests = await correctionRequestEntity.filter({ time_entry_id: entry.id, status: { $in: ['pending', 'reviewing'] } });
      if (!Array.isArray(openRequests)) throw new Error('Correction request lookup did not return a record list.');
      if (openRequests.length > 0) return Response.json({ success: false, error: 'A correction request for this shift is already awaiting manager review.' }, { status: 409 });

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
      await audit(auditEntity, {
        action: 'correction_request', outcome: 'confirmed', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target), server_timestamp: now,
        request_id: requestId, time_entry_id: entry.id, reason,
        details: { correction_request_id: correctionRequest.id, requested_changes: requestedChanges },
      });
      return Response.json({ success: true, request: correctionRequest });
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

      let correctionRequest = await correctionRequestEntity.get(correctionRequestId).catch(() => null);
      if (!correctionRequest?.id || asEmail(correctionRequest.user_email) !== target.email) return Response.json({ success: false, error: 'Correction request was not found.' }, { status: 404 });
      if (['approved', 'approved_modified', 'rejected'].includes(correctionRequest.status)) {
        if (String(correctionRequest.review_request_id || '') === requestId) return Response.json({ success: true, request: correctionRequest, reused: true });
        return Response.json({ success: false, error: 'This correction request has already been reviewed.' }, { status: 409 });
      }
      const resumingReview = correctionRequest.status === 'reviewing' && String(correctionRequest.review_request_id || '') === requestId;
      if (correctionRequest.status === 'reviewing' && !resumingReview) return Response.json({ success: false, error: 'Another manager review is already in progress.' }, { status: 409 });
      if (correctionRequest.status === 'pending') {
        if (String(correctionRequest.updated_date || '') !== expectedRequestUpdatedDate) return Response.json({ success: false, error: 'This correction request changed since it was loaded.' }, { status: 409 });
        const claimTime = new Date().toISOString();
        const claimed = await correctionRequestEntity.updateMany(
          { id: correctionRequest.id, updated_date: expectedRequestUpdatedDate, status: 'pending' },
          { $set: { status: 'reviewing', review_started_at: claimTime, reviewer_email: actorEmail, reviewer_reason: reviewerReason, review_request_id: requestId } },
        );
        if (!claimed || claimed.updated !== 1) return Response.json({ success: false, error: 'This correction request was claimed by another manager. Reload before reviewing.' }, { status: 409 });
        correctionRequest = await correctionRequestEntity.get(correctionRequest.id);
      }

      if (decision === 'reject') {
        const finalized = await correctionRequestEntity.updateMany(
          { id: correctionRequest.id, status: 'reviewing', review_request_id: requestId },
          { $set: { status: 'rejected', reviewed_at: new Date().toISOString(), reviewer_email: actorEmail, reviewer_reason: reviewerReason } },
        );
        if (!finalized || finalized.updated !== 1) return Response.json({ success: false, retry_same_request: true, error: 'The rejection could not be finalized safely. Retry the same review.' }, { status: 409 });
        const savedRequest = await correctionRequestEntity.get(correctionRequest.id);
        await audit(auditEntity, {
          action: 'correction_review', outcome: 'confirmed', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: savedRequest.reviewed_at,
          request_id: requestId, time_entry_id: correctionRequest.time_entry_id, reason: reviewerReason,
          details: { correction_request_id: correctionRequest.id, decision: 'rejected' },
        });
        return Response.json({ success: true, request: savedRequest });
      }

      let entry = await entryEntity.get(correctionRequest.time_entry_id).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin || entry.status !== 'clocked_out' || !entry.clock_out) {
        await correctionRequestEntity.updateMany({ id: correctionRequest.id, status: 'reviewing', review_request_id: requestId }, { $set: { status: 'pending' } });
        return Response.json({ success: false, error: 'The underlying completed TimeEntry is no longer eligible for this correction.' }, { status: 409 });
      }

      const alreadyApplied = String(entry.last_correction_request_id || '') === correctionRequest.id;
      let correctionAuditId = String(correctionRequest.applied_audit_id || '');
      if (!alreadyApplied) {
        if (String(entry.updated_date || '') !== String(correctionRequest.time_entry_updated_date || '')) {
          await correctionRequestEntity.updateMany({ id: correctionRequest.id, status: 'reviewing', review_request_id: requestId }, { $set: { status: 'pending' } });
          return Response.json({ success: false, error: 'The TimeEntry changed after this request was submitted. Reload the entry and review the differences before approving.' }, { status: 409 });
        }
        const requestedCorrection = decision === 'approve_modified' ? (body?.correction || {}) : (correctionRequest.requested_changes || {});
        const clockIn = new Date(String(requestedCorrection?.clock_in || entry.clock_in || ''));
        const clockOut = new Date(String(requestedCorrection?.clock_out || entry.clock_out || ''));
        const lunchMinutes = Math.round(Number(requestedCorrection?.lunch_minutes ?? entry.lunch_minutes ?? 0));
        if (!Number.isFinite(clockIn.getTime()) || !Number.isFinite(clockOut.getTime()) || clockOut.getTime() < clockIn.getTime()) {
          await correctionRequestEntity.updateMany({ id: correctionRequest.id, status: 'reviewing', review_request_id: requestId }, { $set: { status: 'pending' } });
          return Response.json({ success: false, error: 'Approved punch times are invalid.' }, { status: 400 });
        }
        const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
        if (!Number.isFinite(lunchMinutes) || lunchMinutes < 0 || lunchMinutes > 240 || lunchMinutes > totalMinutes) {
          await correctionRequestEntity.updateMany({ id: correctionRequest.id, status: 'reviewing', review_request_id: requestId }, { $set: { status: 'pending' } });
          return Response.json({ success: false, error: 'Approved lunch minutes are invalid for this shift.' }, { status: 400 });
        }
        const now = new Date().toISOString();
        const normalizedAllocations = (Array.isArray(entry.job_allocations) ? entry.job_allocations : []).map((job: any) => {
          const minutes = minutesFromAllocation(job);
          return { ...job, minutes, hours: minutes / 60 };
        });
        const nextFields = {
          clock_in: clockIn.toISOString(), clock_out: clockOut.toISOString(), lunch_minutes: lunchMinutes,
          total_hours: (totalMinutes - lunchMinutes) / 60,
          notes: String(requestedCorrection?.notes ?? entry.notes ?? '').trim().slice(0, 4000),
          job_allocations: normalizedAllocations, status: 'clocked_out', clock_source: 'admin_correction',
          last_corrected_at: now, last_corrected_by: actorEmail, last_correction_reason: reviewerReason,
          last_correction_request_id: correctionRequest.id,
        };
        const intent = await auditEntity.create({
          action: 'admin_correction', outcome: 'pending', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: now,
          request_id: requestId, time_entry_id: entry.id, reason: reviewerReason,
          details: { original: entryAuditSnapshot(entry), requested: nextFields, correction_request_id: correctionRequest.id },
        });
        if (!intent?.id) throw new Error('Correction audit intent could not be persisted. No TimeEntry was changed.');
        correctionAuditId = intent.id;
        const updated = await entryEntity.updateMany(
          { id: entry.id, updated_date: entry.updated_date, user_email: target.email, status: 'clocked_out', archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
          { $set: nextFields },
        );
        if (!updated || updated.updated !== 1) {
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked' } });
          await correctionRequestEntity.updateMany({ id: correctionRequest.id, status: 'reviewing', review_request_id: requestId }, { $set: { status: 'pending' } });
          return Response.json({ success: false, error: 'The TimeEntry changed before the correction could be applied. Reload before reviewing again.' }, { status: 409 });
        }
        entry = await entryEntity.get(entry.id);
        await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'confirmed', server_timestamp: new Date().toISOString(), details: { original: correctionRequest.original_snapshot, corrected: entryAuditSnapshot(entry), correction_request_id: correctionRequest.id } } });
      }

      const finalStatus = decision === 'approve_modified' ? 'approved_modified' : 'approved';
      const finalized = await correctionRequestEntity.updateMany(
        { id: correctionRequest.id, status: 'reviewing', review_request_id: requestId },
        { $set: { status: finalStatus, reviewed_at: new Date().toISOString(), reviewer_email: actorEmail, reviewer_reason: reviewerReason, applied_audit_id: correctionAuditId } },
      );
      if (!finalized || finalized.updated !== 1) return Response.json({ success: false, retry_same_request: true, error: 'The TimeEntry correction was applied, but request finalization was interrupted. Retry this same review to recover safely.' }, { status: 409 });
      const savedRequest = await correctionRequestEntity.get(correctionRequest.id);
      await audit(auditEntity, {
        action: 'correction_review', outcome: 'confirmed', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target), server_timestamp: savedRequest.reviewed_at,
        request_id: requestId, time_entry_id: correctionRequest.time_entry_id, reason: reviewerReason,
        details: { correction_request_id: correctionRequest.id, decision: finalStatus, applied_audit_id: correctionAuditId },
      });
      return Response.json({ success: true, request: savedRequest, entry, audit_id: correctionAuditId });
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
      if (String(entry.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ success: false, error: 'This time entry changed in another session. Reload before correcting it.' }, { status: 409 });
      }

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
      const lunchMinutes = Math.round(Number(correction?.lunch_minutes || 0));
      if (!Number.isFinite(lunchMinutes) || lunchMinutes < 0 || lunchMinutes > 240) {
        return Response.json({ success: false, error: 'Lunch minutes must be between 0 and 240.' }, { status: 400 });
      }
      const totalMinutes = clockOut ? Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000) : null;
      if (totalMinutes !== null && lunchMinutes > totalMinutes) return Response.json({ success: false, error: 'Lunch time cannot exceed the corrected shift duration.' }, { status: 400 });
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
      const now = new Date().toISOString();
      const nextFields: any = {
        clock_in: clockIn.toISOString(),
        clock_out: clockOut ? clockOut.toISOString() : null,
        lunch_minutes: lunchMinutes,
        total_hours: totalMinutes === null ? Number(entry.total_hours || 0) : (totalMinutes - lunchMinutes) / 60,
        status: clockOut ? 'clocked_out' : 'clocked_in',
        notes: String(correction?.notes || '').trim(),
        job_allocations: normalizedAllocations,
        clock_source: 'admin_correction',
        last_corrected_at: now,
        last_corrected_by: actorEmail,
        last_correction_reason: reason,
      };
      if (entry.status === 'clocked_in' && clockOut) nextFields['clock_out_request_id'] = requestId;

      if (entry.status === 'clocked_in' && !(state.status === 'clocked_in' && state.active_entry_id === entry.id)) {
        return Response.json({ success: false, error: 'The active TimeEntry does not match authoritative employee state. Resolve the state mismatch before correcting it.' }, { status: 409 });
      }

      const intent = await auditEntity.create({
        action: 'admin_correction', outcome: 'pending', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target), server_timestamp: now, request_id: requestId,
        time_entry_id: entry.id, reason,
        details: { original: entryAuditSnapshot(entry), requested: nextFields },
      });
      if (!intent?.id) throw new Error('Correction audit intent could not be persisted. No TimeEntry was changed.');

      let claimedState: any = null;
      if (entry.status === 'clocked_in' && clockOut) {
        claimedState = await setState(stateEntity, state, 'clocked_in', null, {
          status: 'clocking_out', last_request_id: requestId, pending_started_at: now,
        });
        if (!claimedState) {
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { original: entryAuditSnapshot(entry), reason: 'Authoritative state changed before correction claim.' } } });
          return Response.json({ success: false, error: 'The employee clock state changed before the correction could be applied. Reload and review the shift.' }, { status: 409 });
        }
      }

      const updateResult = await entryEntity.updateMany(
        { id: entry.id, updated_date: expectedUpdatedDate, user_email: target.email, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
        { $set: nextFields },
      );
      if (!updateResult || updateResult.updated !== 1) {
        if (claimedState) {
          const freshClaim = await freshState(stateEntity, claimedState.id);
          await setState(stateEntity, freshClaim, 'clocking_out', requestId, {
            status: 'clocked_in', active_entry_id: entry.id, pending_started_at: null,
          });
        }
        await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { original: entryAuditSnapshot(entry), reason: 'TimeEntry changed before correction update.' } } });
        return Response.json({ success: false, error: 'This time entry changed in another session. The correction was not applied.' }, { status: 409 });
      }

      const savedEntry = await entryEntity.get(entry.id);
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
      if (claimedState) {
        const freshClaim = await freshState(stateEntity, claimedState.id);
        const finalized = await setState(stateEntity, freshClaim, 'clocking_out', requestId, {
          status: 'clocked_out', active_entry_id: null, last_action_at: savedEntry.clock_out,
          pending_started_at: null,
        });
        if (!finalized) {
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { original: entryAuditSnapshot(entry), corrected: entryAuditSnapshot(savedEntry), reason: 'Correction saved but authoritative state finalization requires review.' } } });
          return Response.json({ success: false, error: 'The correction was saved, but employee clock state could not be finalized safely. Admin review is required before another punch.' }, { status: 409 });
        }
      }

      await auditEntity.updateMany({ id: intent.id }, { $set: {
        outcome: 'confirmed', server_timestamp: new Date().toISOString(),
        details: { original: entryAuditSnapshot(entry), corrected: entryAuditSnapshot(savedEntry) },
      } });
      return Response.json({ success: true, entry: savedEntry, audit_id: intent.id });
    }

    if (action === 'admin_archive_entry') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Administrator access is required to archive time entries.' }, { status: 403 });
      const entryId = String(body?.entry_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      const reason = String(body?.reason || '').trim();
      if (!entryId || !expectedUpdatedDate) return Response.json({ success: false, error: 'The loaded TimeEntry version is required before archiving it.' }, { status: 400 });
      if (reason.length < 3 || reason.length > 500) return Response.json({ success: false, error: 'An archive reason between 3 and 500 characters is required.' }, { status: 400 });

      const entry = await entryEntity.get(entryId).catch(() => null);
      if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'TimeEntry was not found or is already archived.' }, { status: 404 });
      }
      if (String(entry.updated_date || '') !== expectedUpdatedDate) return Response.json({ success: false, error: 'This time entry changed in another session. Reload before archiving it.' }, { status: 409 });
      if (entry.status === 'clocked_in' && !(state.status === 'clocked_in' && state.active_entry_id === entry.id)) {
        return Response.json({ success: false, error: 'The active TimeEntry does not match authoritative employee state. Resolve the mismatch before archiving it.' }, { status: 409 });
      }

      const now = new Date().toISOString();
      const intent = await auditEntity.create({
        action: 'admin_archive', outcome: 'pending', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target), server_timestamp: now, request_id: requestId,
        time_entry_id: entry.id, reason, details: { original: entryAuditSnapshot(entry) },
      });
      if (!intent?.id) throw new Error('Archive audit intent could not be persisted. No TimeEntry was changed.');

      let claimedState: any = null;
      if (entry.status === 'clocked_in') {
        claimedState = await setState(stateEntity, state, 'clocked_in', null, {
          status: 'clocking_out', last_request_id: requestId, pending_started_at: now,
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
          });
        }
        await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked' } });
        return Response.json({ success: false, error: 'This time entry changed in another session. It was not archived.' }, { status: 409 });
      }

      if (claimedState) {
        const freshClaim = await freshState(stateEntity, claimedState.id);
        const finalized = await setState(stateEntity, freshClaim, 'clocking_out', requestId, {
          status: 'clocked_out', active_entry_id: null, last_action_at: now, pending_started_at: null,
        });
        if (!finalized) {
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { original: entryAuditSnapshot(entry), reason: 'Entry archived but authoritative state finalization requires review.' } } });
          return Response.json({ success: false, error: 'The entry was archived, but authoritative employee state could not be finalized. Admin review is required.' }, { status: 409 });
        }
      }

      await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'confirmed', server_timestamp: new Date().toISOString() } });
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

      const officialClockIn = resumingClockIn && state.pending_started_at
        ? state.pending_started_at
        : new Date().toISOString();
      const claimed = resumingClockIn
        ? state
        : await setState(stateEntity, state, 'clocked_out', null, {
            status: 'clocking_in', active_entry_id: null, last_request_id: requestId,
            pending_started_at: officialClockIn,
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
      const finalized = await setState(stateEntity, currentClaim, 'clocking_in', requestId, {
        status: 'clocked_in', active_entry_id: entry.id, last_action_at: entry.clock_in,
        pending_started_at: null,
      });
      if (!finalized) {
        return Response.json({ success: false, retry_same_request: true, error: 'Clock-in was saved but state finalization was interrupted. Retry this same action to recover safely.' }, { status: 409 });
      }

      const auditSaved = await audit(auditEntity, {
        action: 'clock_in', outcome: 'confirmed', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target),
        server_timestamp: entry.clock_in, request_id: requestId, time_entry_id: entry.id,
      });
      return Response.json({ success: true, status: 'clocked_in', entry, user: publicEmployee(target), audit_saved: auditSaved });
    }

    if (action === 'clock_out') {
      if (state.status === 'clocked_out') {
        const prior = await uniqueRow(entryEntity, { user_email: target.email, clock_out_request_id: requestId, archived_test_data: { $ne: true }, archived_admin: { $ne: true } }, 'Clock-out request');
        if (prior?.id && prior.status === 'clocked_out') {
          return Response.json({ success: true, status: 'already_clocked_out', entry: prior, reused: true, user: publicEmployee(target) });
        }
        return Response.json({ success: false, error: 'Employee is not currently clocked in.' }, { status: 409 });
      }
      const resumingClockOut = state.status === 'clocking_out' && String(state.last_request_id || '') === requestId;
      if ((state.status !== 'clocked_in' && !resumingClockOut) || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Another Time Clock action is still in progress or the active entry is missing.' }, { status: 409 });
      }

      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }

      const lunchMinutes = Math.round(Number(body?.lunch_minutes));
      if (!Number.isFinite(lunchMinutes) || lunchMinutes < 0 || lunchMinutes > 240) {
        return Response.json({ success: false, error: 'Lunch minutes must be between 0 and 240.' }, { status: 400 });
      }
      const allocations = Array.isArray(body?.job_allocations) ? body.job_allocations : [];
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
      const workableMinutes = totalMinutes - lunchMinutes;
      if (workableMinutes < 0) return Response.json({ success: false, error: 'Lunch time cannot exceed the shift duration.' }, { status: 400 });
      const allocatedMinutes = allocations.reduce((sum: number, job: any) => sum + minutesFromAllocation(job), 0);
      if (Math.abs(allocatedMinutes - workableMinutes) > 5) {
        return Response.json({ success: false, error: `Allocated time must match official worked time within 5 minutes. Official remaining difference is ${Math.abs(allocatedMinutes - workableMinutes)} minutes.` }, { status: 400 });
      }

      const claimed = resumingClockOut
        ? state
        : await setState(stateEntity, state, 'clocked_in', null, {
            status: 'clocking_out', last_request_id: requestId, pending_started_at: officialClockOut,
          });
      if (!claimed) return Response.json({ success: false, error: 'Clock-out lost a concurrency race. Reload status before retrying.' }, { status: 409 });

      const nextFields = {
        clock_out: officialClockOut,
        clock_out_request_id: requestId,
        lunch_minutes: lunchMinutes,
        total_hours: workableMinutes / 60,
        job_allocations: allocations.map((job: any) => ({ ...job, minutes: minutesFromAllocation(job), hours: minutesFromAllocation(job) / 60 })),
        notes: String(body?.notes || '').trim(),
        status: 'clocked_out',
        clock_source: 'server',
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
      }
      const savedEntry = await entryEntity.get(entry.id);

      const currentClaim = await freshState(stateEntity, claimed.id);
      const finalized = await setState(stateEntity, currentClaim, 'clocking_out', requestId, {
        status: 'clocked_out', active_entry_id: null, last_action_at: savedEntry.clock_out,
        pending_started_at: null,
      });
      if (!finalized) {
        return Response.json({ success: false, retry_same_request: true, error: 'Clock-out was saved but state finalization was interrupted. Retry this same action to recover safely.' }, { status: 409 });
      }

      const auditSaved = await audit(auditEntity, {
        action: 'clock_out', outcome: 'confirmed', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target),
        server_timestamp: savedEntry.clock_out, request_id: requestId, time_entry_id: savedEntry.id,
        details: { lunch_minutes: lunchMinutes, total_hours: savedEntry.total_hours },
      });
      return Response.json({ success: true, status: 'clocked_out', entry: savedEntry, user: publicEmployee(target), audit_saved: auditSaved });
    }

    return Response.json({ success: false, error: 'Unsupported Time Clock action.' }, { status: 400 });
  } catch (error) {
    console.error('timeClockAction error:', error?.message || error);
    return Response.json({ success: false, error: 'Time Clock action could not be completed safely.' }, { status: 500 });
  }
});
