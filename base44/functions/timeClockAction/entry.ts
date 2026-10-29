import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25'; import { withEmployeeAccessReads } from '../../shared/employeeAccessReads.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { buildStatusLite } from '../../shared/timeClockStatusLite.ts';
import { PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION, normalizedPayrollMembershipFromAudit, payrollMembershipConflictEvidenceIsMalformed, payrollMembershipFromAudit, validatePayrollMembershipConflictEvidence } from '../../shared/timeClockPayrollMembershipEvidence.mjs';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';

// Fire-and-forget automation emit — emit failures must never break a verified
// clock/PTO write, so this swallows and logs like the permit emit.
async function emitTimeClockEvent(base44: any, eventType: string, recordId: string, actor: string) {
  try {
    await processWorkflowTriggerEvent({
      base44,
      payload: { event_type: eventType, record: { id: recordId } },
      changedByOverride: actor,
    });
  } catch (error: any) {
    console.error(`Time Clock automation emit failed for ${eventType}:`, error?.message || error);
  }
}

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

// A payroll delta can be backed by a chain, but only if exactly one
// contiguous audit suffix explains its before and after state.
function uniqueAdminCorrectionSemanticSuffix(audits: any[], before: any, after: any) {
  if (!Array.isArray(audits) || audits.length < 2) return null;
  const semantic = (row: any) => ({
    clock_in: String(row?.clock_in || ''),
    clock_out: String(row?.clock_out || ''),
    total_hours: Number(row?.total_hours || 0),
  });
  const same = (left: any, right: any) =>
    left.clock_in === right.clock_in && left.clock_out === right.clock_out &&
    left.total_hours === right.total_hours;
  let matches = 0;
  let selected = null;
  for (let start = 0; start < audits.length; start += 1) {
    let state = semantic(before);
    let valid = true;
    for (let index = start; index < audits.length; index += 1) {
      const row = audits[index];
      if (!row?.id || String(row.action || '') !== 'admin_correction' ||
          !['confirmed', 'recovered'].includes(String(row.outcome || '')) ||
          !row.details?.original || !row.details?.corrected ||
          !same(semantic(row.details.original), state)) {
        valid = false;
        break;
      }
      state = semantic(row.details.corrected);
    }
    if (valid && same(state, semantic(after))) {
      matches += 1;
      selected = { start_audit_id: String(audits[start].id), terminal: audits[audits.length - 1] };
      if (matches > 1) return null;
    }
  }
  return matches === 1 ? selected : null;
}

// A single idempotent manager correction request may have only one
// authoritative completed audit. Duplicate completed audit evidence cannot
// be disambiguated by timestamps or opaque audit IDs.
function hasDuplicateConfirmedAdminCorrectionRequests(audits: any[]) {
  const seen = new Set<string>();
  for (const audit of Array.isArray(audits) ? audits : []) {
    if (String(audit?.action || '') !== 'admin_correction' ||
        !['confirmed', 'recovered'].includes(String(audit?.outcome || ''))) continue;
    const entryId = String(audit?.time_entry_id || '');
    const requestId = String(audit?.request_id || '');
    if (!entryId || !requestId) return true;
    const key = JSON.stringify([entryId, requestId]);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

// Finalization and history verification must reject even the first payroll
// generation when two completed corrections reuse one request ID across
// employees. Changed-generation causal chains alone are not sufficient.
async function payrollCorrectionRequestIdentityIsUnique(auditEntity: any, entries: any[], lockTimestamp: string) {
  const cutoff = Date.parse(String(lockTimestamp || ''));
  if (!Number.isFinite(cutoff) || !Array.isArray(entries)) return false;
  const checked = new Set<string>();
  for (const entry of entries) {
    const entryId = String(entry?.id || '');
    if (!entryId) return false;
    const audits = await auditEntity.filter({ time_entry_id: entryId });
    if (!Array.isArray(audits)) return false;
    for (const audit of audits) {
      if (String(audit?.action || '') !== 'admin_correction' ||
          !['confirmed', 'recovered'].includes(String(audit?.outcome || ''))) continue;
      const timestamp = Date.parse(String(audit.server_timestamp || ''));
      if (!Number.isFinite(timestamp)) return false;
      if (timestamp > cutoff) continue;
      const requestId = String(audit.request_id || '');
      if (!requestId) return false;
      if (checked.has(requestId)) continue;
      checked.add(requestId);
      const matching = await auditEntity.filter({ action: 'admin_correction', request_id: requestId });
      if (!Array.isArray(matching)) return false;
      const completed = matching.filter((row: any) =>
        ['confirmed', 'recovered'].includes(String(row?.outcome || '')));
      if (completed.length !== 1 ||
          String(completed[0]?.id || '') !== String(audit.id || '') ||
          String(completed[0]?.time_entry_id || '') !== entryId ||
          asEmail(completed[0]?.user_email) !== asEmail(entry.user_email)) return false;
    }
  }
  return true;
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
const MISSED_PUNCH_PROMPT_MS = 18 * 60 * 60 * 1000;
const MISSED_PUNCH_REPROMPT_MS = 8 * 60 * 60 * 1000;
const LATE_CLOCK_IN_MINUTES = 8 * 60; // After 8:00 AM company time — matches the admin trigger label.
const FULL_SHIFT_HOURS = 8; // Clocking out under a full worked day counts as early.
const LONG_SHIFT_HOURS = 10; // Worked length that raises the long-shift event.
const PTO_LOW_HOURS_THRESHOLD = 8; // Available balance under one workday counts as low.
const PTO_LOW_ALERT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // At most one low-balance alert per type per week.
const STALE_SHIFT_MONITOR_CAPABILITY_HASH = '5228d94ea9970926dcb7f6365da6f336f9b8c633c109991da94feba223ccfe17';

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

function payrollMembershipEnvelope(clockIn: any) {
  const normalizedClockIn = String(clockIn || '');
  const companyDate = dateKeyInCompanyTime(normalizedClockIn);
  if (!normalizedClockIn || !companyDate) return null;
  return { clock_in: normalizedClockIn, company_date: companyDate, time_zone: COMPANY_TIME_ZONE, version: 1 };
}

function minutesOfDayInCompanyTime(value: any) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: COMPANY_TIME_ZONE,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

async function hasStaleShiftMonitorCapability(body: any) {
  const token = String(body?._workflow_capability || '').trim();
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return false;
  const actualHash = await sha256Hex(token);
  return constantTimeEqual(actualHash, STALE_SHIFT_MONITOR_CAPABILITY_HASH);
}

function staleShiftMonitorEligibility(entry: any, serverNow: Date) {
  if (!entry?.id || entry.status !== 'clocked_in' || entry.archived_test_data || entry.archived_admin) {
    return { eligible: false, reason: 'not_active' };
  }
  const clockInMs = new Date(String(entry.clock_in || '')).getTime();
  if (!Number.isFinite(clockInMs)) return { eligible: false, reason: 'invalid_clock_in' };
  const crossedCompanyDate = dateKeyInCompanyTime(entry.clock_in) !== dateKeyInCompanyTime(serverNow.toISOString());
  if (!crossedCompanyDate) return { eligible: false, reason: 'same_company_date' };
  if ((serverNow.getTime() - clockInMs) < MISSED_PUNCH_PROMPT_MS) return { eligible: false, reason: 'under_threshold' };
  const acknowledgedMs = new Date(String(entry.stale_shift_acknowledged_at || '')).getTime();
  const acknowledgementFresh = Number.isFinite(acknowledgedMs) && (serverNow.getTime() - acknowledgedMs) < MISSED_PUNCH_REPROMPT_MS;
  if (acknowledgementFresh) return { eligible: false, reason: 'fresh_worked_through' };
  return { eligible: true, reason: 'stale' };
}

function entryFallsInPeriod(entry: any, startDate: string, endDate: string) {
  const key = dateKeyInCompanyTime(entry?.clock_in);
  return Boolean(key && key >= startDate && key <= endDate);
}

function activeEntryMayOverlapPeriod(entry: any, endDate: string) {
  if (!['clocked_in', 'needs_resolution'].includes(String(entry?.status || '')) || entry.archived_test_data || entry.archived_admin) return false;
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

function inCausalWindow(timestamp: any, start: any, end: any) {
  const value = Date.parse(String(timestamp || ''));
  const lower = Date.parse(String(start || ''));
  const upper = Date.parse(String(end || ''));
  return Number.isFinite(value) && Number.isFinite(lower) && Number.isFinite(upper) && lower <= value && value <= upper;
}

async function uniqueRow(entity: any, query: any, label: string) {
  const rows = await entity.filter(query);
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
  if (rows.length > 1) throw new Error(`${label} is ambiguous (${rows.length} records).`);
  return rows[0] || null;
}

async function loadAllFilteredRows(entity: any, query: any, sort: string, label: string) {
  const rows: any[] = [];
  const seen = new Set<string>();
  const pageSize = 500;
  for (let skip = 0; skip < 50_000; skip += pageSize) {
    const page = await entity.filter(query, sort, pageSize, skip);
    if (!Array.isArray(page)) throw new Error(`${label} could not be verified completely.`);
    for (const row of page) {
      const id = String(row?.id || '').trim();
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      rows.push(row);
    }
    if (page.length < pageSize) return rows;
  }
  throw new Error(`${label} exceeds the 50,000-record safety limit.`);
}

async function unresolvedPunchReviewSummary({ entryEntity, correctionRequestEntity, punchExceptionEntity, userEmail }: any) {
  const unresolvedEntries = (await loadAllFilteredRows(
    entryEntity,
    { user_email: userEmail, status: 'needs_resolution' },
    '-clock_in',
    'Unresolved punch-review shifts',
  )).filter((entry: any) => !entry.archived_test_data && !entry.archived_admin);
  if (unresolvedEntries.length === 0) return null;

  const items: any[] = [];
  for (const entry of unresolvedEntries) {
    const punchExceptionId = String(entry?.punch_exception_id || '').trim();
    const punchCase = punchExceptionId ? await punchExceptionEntity.get(punchExceptionId).catch(() => null) : null;
    const correctionRequestId = String(punchCase?.correction_request_id || '').trim();
    const correctionRequest = correctionRequestId ? await correctionRequestEntity.get(correctionRequestId).catch(() => null) : null;
    const correctionStatus = String(correctionRequest?.status || '');
    const punchStatus = String(punchCase?.status || '');
    const linkageOk = Boolean(
      punchCase?.id && correctionRequest?.id &&
      asEmail(punchCase.user_email) === userEmail &&
      asEmail(correctionRequest.user_email) === userEmail &&
      String(punchCase.time_entry_id || '') === String(entry.id) &&
      String(correctionRequest.time_entry_id || '') === String(entry.id) &&
      String(correctionRequest.punch_exception_id || '') === String(punchCase.id) &&
      String(punchCase.correction_request_id || '') === String(correctionRequest.id) &&
      String(correctionRequest.request_id || '') === String(punchCase.request_id || '') &&
      correctionRequest.request_kind === 'missed_clock_out' &&
      punchCase.exception_type === 'missed_clock_out'
    );
    const reviewState = !linkageOk
      ? 'needs_manager_investigation'
      : correctionStatus === 'rejected' || punchStatus === 'rejected'
        ? 'rejected_needs_followup'
        : ['pending', 'reviewing'].includes(correctionStatus) && punchStatus === 'pending_manager_review'
          ? 'awaiting_manager_review'
          : 'needs_manager_investigation';
    items.push({
      time_entry_id: entry.id,
      clock_in: entry.clock_in || null,
      approval_status: entry.approval_status || 'needs_review',
      punch_exception_id: punchCase?.id || punchExceptionId || null,
      punch_exception_status: punchStatus || null,
      correction_request_id: correctionRequest?.id || correctionRequestId || null,
      correction_status: correctionStatus || null,
      reported_clock_out: punchCase?.claimed_clock_out || correctionRequest?.requested_changes?.clock_out || null,
      review_state: reviewState,
      linkage_verified: linkageOk,
    });
  }

  return {
    count: items.length,
    has_integrity_issue: items.some((item: any) => item.review_state === 'needs_manager_investigation'),
    has_rejected_item: items.some((item: any) => item.review_state === 'rejected_needs_followup'),
    items,
  };
}

async function correctedShiftReviewSummary({ entryEntity, correctionRequestEntity, punchExceptionEntity, auditEntity, userEmail }: any) {
  const reviewEntries = (await loadAllFilteredRows(
    entryEntity,
    { user_email: userEmail, status: 'clocked_out', approval_status: 'needs_review' },
    '-clock_out',
    'Corrected shifts awaiting approval',
  )).filter((entry: any) => !entry.archived_test_data && !entry.archived_admin && (
    String(entry.last_correction_request_id || '').trim() ||
    String(entry.clock_source || '') === 'employee_attested_missed_clock_in'
  ));
  if (reviewEntries.length === 0) return null;

  const items: any[] = [];
  for (const entry of reviewEntries) {
    const correctionMarker = String(entry.last_correction_request_id || '').trim();
    if (correctionMarker) {
      const correctionRequest = await correctionRequestEntity.get(correctionMarker).catch(() => null);
      if (correctionRequest?.id) {
        const correctionStatus = String(correctionRequest.status || '');
        const linkageOk = Boolean(
          asEmail(correctionRequest.user_email) === userEmail &&
          String(correctionRequest.time_entry_id || '') === String(entry.id) &&
          String(correctionRequest.id || '') === correctionMarker &&
          ['approved', 'approved_modified'].includes(correctionStatus) &&
          Boolean(correctionRequest.applied_audit_id) &&
          (!entry.correction_needs_review_request_id ||
            String(entry.correction_needs_review_request_id || '') === String(correctionRequest.request_id || ''))
        );
        items.push({
          review_kind: 'corrected_shift',
          time_entry_id: entry.id,
          clock_in: entry.clock_in || null,
          clock_out: entry.clock_out || null,
          approval_status: entry.approval_status || 'needs_review',
          correction_request_id: correctionRequest.id,
          correction_status: correctionStatus || null,
          review_state: linkageOk ? 'awaiting_shift_approval' : 'needs_manager_investigation',
          linkage_verified: linkageOk,
        });
        continue;
      }

      if (String(entry.clock_source || '') === 'admin_correction') {
        const auditRows = await auditEntity.filter({
          action: 'admin_correction', request_id: correctionMarker, time_entry_id: entry.id,
        });
        const directAudit = Array.isArray(auditRows) && auditRows.length === 1 ? auditRows[0] : null;
        const corrected = directAudit?.details?.corrected || {};
        const linkageOk = Boolean(
          directAudit?.id &&
          ['confirmed', 'recovered'].includes(String(directAudit.outcome || '')) &&
          asEmail(directAudit.user_email) === userEmail &&
          String(directAudit.time_entry_id || '') === String(entry.id) &&
          String(directAudit.request_id || '') === correctionMarker &&
          String(corrected.clock_in || '') === String(entry.clock_in || '') &&
          String(corrected.clock_out || '') === String(entry.clock_out || '') &&
          Number(corrected.lunch_minutes || 0) === Number(entry.lunch_minutes || 0) &&
          String(corrected.notes || '') === String(entry.notes || '')
        );
        items.push({
          review_kind: 'direct_admin_correction',
          time_entry_id: entry.id,
          clock_in: entry.clock_in || null,
          clock_out: entry.clock_out || null,
          approval_status: entry.approval_status || 'needs_review',
          admin_correction_request_id: correctionMarker,
          admin_correction_audit_id: directAudit?.id || null,
          review_state: linkageOk ? 'awaiting_shift_approval' : 'needs_manager_investigation',
          linkage_verified: linkageOk,
        });
        continue;
      }

      items.push({
        review_kind: 'unknown_correction',
        time_entry_id: entry.id,
        clock_in: entry.clock_in || null,
        clock_out: entry.clock_out || null,
        approval_status: entry.approval_status || 'needs_review',
        review_state: 'needs_manager_investigation',
        linkage_verified: false,
      });
      continue;
    }

    const punchExceptionId = String(entry.punch_exception_id || '').trim();
    const punchCase = punchExceptionId ? await punchExceptionEntity.get(punchExceptionId).catch(() => null) : null;
    const punchStatus = String(punchCase?.status || '');
    const linkageOk = Boolean(
      punchCase?.id &&
      asEmail(punchCase.user_email) === userEmail &&
      String(punchCase.time_entry_id || '') === String(entry.id) &&
      String(punchCase.id || '') === punchExceptionId &&
      String(punchCase.exception_type || '') === 'late_clock_in' &&
      String(punchCase.employee_response || '') === 'missed_clock_in' &&
      String(punchCase.claimed_clock_in || '') === String(entry.clock_in || '') &&
      punchStatus === 'pending_manager_review'
    );
    items.push({
      review_kind: 'missed_clock_in',
      time_entry_id: entry.id,
      clock_in: entry.clock_in || null,
      clock_out: entry.clock_out || null,
      approval_status: entry.approval_status || 'needs_review',
      punch_exception_id: punchCase?.id || punchExceptionId || null,
      punch_exception_status: punchStatus || null,
      review_state: linkageOk ? 'awaiting_shift_approval' : 'needs_manager_investigation',
      linkage_verified: linkageOk,
    });
  }

  return {
    count: items.length,
    missed_clock_in_count: items.filter((item: any) => item.review_kind === 'missed_clock_in').length,
    corrected_shift_count: items.filter((item: any) => item.review_kind === 'corrected_shift').length,
    direct_admin_correction_count: items.filter((item: any) => item.review_kind === 'direct_admin_correction').length,
    has_integrity_issue: items.some((item: any) => item.review_state === 'needs_manager_investigation'),
    items,
  };
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
  const employeeAttested = entry.clock_source === 'employee_attested_missed_clock_in';
  return ensureActionAudit(auditEntity, {
    action: 'clock_in', outcome: 'confirmed', user_email: target.email,
    user_name: target.full_name || target.email, actor_email: asEmail(actor.email), actor_role: actor.role,
    authentication_method: authenticationMethodFor(actor, target),
    server_timestamp: employeeAttested ? (entry.missed_clock_in_reported_at || new Date().toISOString()) : entry.clock_in,
    request_id: requestId, time_entry_id: entry.id,
    ...(employeeAttested ? { reason: 'Employee-attested missed Clock In reconstruction' } : {}),
    details: {
      payroll_membership: payrollMembershipEnvelope(entry.clock_in),
      ...(employeeAttested ? {
        clock_source: entry.clock_source,
        employee_attested_clock_in: entry.clock_in,
        reported_at: entry.missed_clock_in_reported_at || null,
      } : {}),
    },
  }, 'Clock In audit');
}

async function canonicalLateClockInPayrollProvenance({
  entry, approvalEvidence, auditEntity, punchExceptionEntity, correctionRequestEntity,
  requireCurrentResolution = true, payrollGenerationContext = null, expectedProvenance = null,
}: any) {
  // Audited manager corrections change clock_source; the original missed-punch
  // report marker still requires independent employee-attestation verification.
  if (String(entry?.clock_source || '') !== 'employee_attested_missed_clock_in' &&
      !String(entry?.missed_clock_in_reported_at || '')) {
    return { applicable: false, provenance: null };
  }
  const entryId = String(entry?.id || '');
  const userEmail = asEmail(entry?.user_email);
  const requestId = String(entry?.clock_in_request_id || '');
  const reportedAt = String(entry?.missed_clock_in_reported_at || '');
  const payrollClockIn = String(entry?.clock_in || '');
  const punchExceptionId = String(entry?.punch_exception_id || '');
  const approvalRequestId = String(entry?.approval_request_id || '');
  const approvalAuditId = String(approvalEvidence?.id || '');
  if (!entryId || !userEmail || !requestId || !reportedAt || !payrollClockIn || !punchExceptionId ||
      !approvalRequestId || !approvalAuditId) {
    return { applicable: true, provenance: null };
  }

  const clockInRows = await auditEntity.filter({
    action: 'clock_in', request_id: requestId, time_entry_id: entryId,
  }).catch(() => null);
  const punchRows = await auditEntity.filter({
    action: 'punch_exception', request_id: requestId, time_entry_id: entryId,
  }).catch(() => null);
  const approvalRows = await auditEntity.filter({
    action: 'time_approval', request_id: approvalRequestId,
  }).catch(() => null);
  if (!Array.isArray(clockInRows) || clockInRows.length !== 1 ||
      !Array.isArray(punchRows) || punchRows.length !== 1 ||
      !Array.isArray(approvalRows) || approvalRows.length !== 1) {
    return { applicable: true, provenance: null };
  }

  const clockInAudit = clockInRows[0];
  const punchAudit = punchRows[0];
  const approvalAudit = approvalRows[0];
  const punchCase = await punchExceptionEntity.get(punchExceptionId).catch(() => null);
  if (!punchCase?.id) return { applicable: true, provenance: null };
  const claimedClockIn = String(punchCase.claimed_clock_in || '');
  const companyDate = dateKeyInCompanyTime(claimedClockIn);
  if (!claimedClockIn || !companyDate) return { applicable: true, provenance: null };

  const expectedRecoveryHash = await payloadHash({
    action: 'recover_missed_clock_in',
    user_email: userEmail,
    claimed_clock_in: claimedClockIn,
    company_date: companyDate,
  });
  const originalSnapshotHash = await payloadHash(punchCase.original_snapshot || {});
  const clockMembership = payrollMembershipFromAudit(clockInAudit);
  const actorPairValid = (row: any) => (
    asEmail(row?.actor_email) === userEmail &&
    ['employee', 'badge'].includes(String(row?.actor_role || '')) &&
    ['session', 'badge'].includes(String(row?.authentication_method || '')) &&
    (String(row?.actor_role || '') === 'badge') === (String(row?.authentication_method || '') === 'badge')
  );
  const approvalMatches = Boolean(
    String(approvalAudit.id || '') === approvalAuditId &&
    ['confirmed', 'recovered'].includes(String(approvalAudit.outcome || '')) &&
    String(approvalAudit.time_entry_id || '') === entryId &&
    String(approvalAudit.request_id || '') === approvalRequestId &&
    asEmail(approvalAudit.user_email) === userEmail &&
    String(approvalAudit.actor_role || '') === 'admin' &&
    ['session', 'admin_kiosk'].includes(String(approvalAudit.authentication_method || '')) &&
    asEmail(approvalAudit.actor_email) === asEmail(approvalEvidence?.approved_by) &&
    String(approvalAudit.server_timestamp || '') === String(approvalEvidence?.approved_at || '') &&
    String(approvalAudit.details?.decision || '') === 'approve'
  );
  const caseMatches = Boolean(
    String(punchCase.id || '') === punchExceptionId &&
    String(punchCase.case_key || '') === `late_clock_in:${entryId}` &&
    asEmail(punchCase.user_email) === userEmail &&
    String(punchCase.time_entry_id || '') === entryId &&
    String(punchCase.exception_type || '') === 'late_clock_in' &&
    String(punchCase.employee_response || '') === 'missed_clock_in' &&
    String(punchCase.claimed_clock_in || '') === claimedClockIn &&
    String(punchCase.request_id || '') === requestId &&
    String(punchCase.detected_clock_in || '') === claimedClockIn &&
    String(punchCase.detected_at || '') === reportedAt &&
    String(punchCase.submitted_at || '') === reportedAt &&
    punchCase.original_snapshot?.missing_clock_in === true &&
    String(punchCase.original_snapshot?.detected_at || '') === reportedAt &&
    String(punchCase.original_snapshot?.company_date || '') === companyDate &&
    (!requireCurrentResolution || (
      String(punchCase.status || '') === 'resolved' &&
      String(punchCase.resolution_audit_id || '') === approvalAuditId
    ))
  );
  const clockInMatches = Boolean(
    String(clockInAudit.id || '') &&
    ['confirmed', 'recovered'].includes(String(clockInAudit.outcome || '')) &&
    asEmail(clockInAudit.user_email) === userEmail &&
    actorPairValid(clockInAudit) &&
    String(clockInAudit.server_timestamp || '') === reportedAt &&
    String(clockInAudit.reason || '') === 'Employee-attested missed Clock In reconstruction' &&
    String(clockInAudit.details?.clock_source || '') === 'employee_attested_missed_clock_in' &&
    String(clockInAudit.details?.employee_attested_clock_in || '') === claimedClockIn &&
    String(clockInAudit.details?.reported_at || '') === reportedAt &&
    String(clockMembership?.company_date || '') === companyDate &&
    String(clockMembership?.clock_in || '') === claimedClockIn
  );
  const punchMatches = Boolean(
    String(punchAudit.id || '') &&
    ['confirmed', 'recovered'].includes(String(punchAudit.outcome || '')) &&
    asEmail(punchAudit.user_email) === userEmail &&
    actorPairValid(punchAudit) &&
    String(punchAudit.server_timestamp || '') === reportedAt &&
    String(punchAudit.reason || '') === 'Employee reported a missing Clock In during the late-day pre-clockout review' &&
    String(punchAudit.details?.punch_exception_id || '') === punchExceptionId &&
    String(punchAudit.details?.response || '') === 'missed_clock_in' &&
    String(punchAudit.details?.claimed_clock_in || '') === claimedClockIn &&
    String(punchAudit.details?.company_date || '') === companyDate &&
    constantTimeEqual(String(punchAudit.details?.payload_hash || ''), expectedRecoveryHash)
  );
  if (!approvalMatches || !caseMatches || !clockInMatches || !punchMatches) {
    return { applicable: true, provenance: null };
  }

  let payrollCorrectionEvidence = null;
  if (payrollClockIn !== claimedClockIn) {
    const corrections = await auditEntity.filter({
      action: 'admin_correction', time_entry_id: entryId,
    }).catch(() => null);
    if (!Array.isArray(corrections)) return { applicable: true, provenance: null };
    const expectedCorrectionEvidence = expectedProvenance?.payroll_correction_evidence || null;
    const expectedCorrectionIds = new Set(
      Array.isArray(expectedCorrectionEvidence?.correction_chain) && expectedCorrectionEvidence.correction_chain.length
        ? expectedCorrectionEvidence.correction_chain.map((item: any) => String(item?.audit_id || '')).filter(Boolean)
        : [String(expectedCorrectionEvidence?.audit_id || '')].filter(Boolean)
    );
    const constrainToFrozenCorrections = Boolean(expectedProvenance && expectedCorrectionEvidence);
    const eligible = corrections.filter((row: any) =>
      (!constrainToFrozenCorrections || expectedCorrectionIds.has(String(row.id || ''))) &&
      ['confirmed', 'recovered'].includes(String(row.outcome || '')) &&
      asEmail(row.user_email) === userEmail &&
      String(row.actor_role || '') === 'admin' &&
      ['session', 'admin_kiosk'].includes(String(row.authentication_method || '')) &&
      Boolean(asEmail(row.actor_email)) &&
      String(row.details?.original?.id || '') === entryId &&
      String(row.details?.corrected?.id || '') === entryId &&
      asEmail(row.details?.original?.user_email) === userEmail &&
      asEmail(row.details?.corrected?.user_email) === userEmail &&
      Boolean(String(row.details?.original?.clock_in || '')) &&
      Boolean(String(row.details?.corrected?.clock_in || '')) &&
      Number.isFinite(Date.parse(String(row.server_timestamp || ''))) &&
      Date.parse(String(row.server_timestamp)) <= Date.parse(String(approvalAudit.server_timestamp))
    );
    const matching = eligible.filter((row: any) =>
      String(row.details?.corrected?.clock_in || '') === payrollClockIn &&
      String(row.details?.corrected?.clock_out || '') === String(entry.clock_out || '') &&
      Number(row.details?.corrected?.total_hours || 0) === Number(entry.total_hours || 0)
    );
    if (!matching.length) return { applicable: true, provenance: null };
    const terminal = matching.sort((a: any, b: any) =>
      String(b.server_timestamp).localeCompare(String(a.server_timestamp)) ||
      String(b.id).localeCompare(String(a.id))
    )[0];

    const approvalTransitions = await auditEntity.filter({
      action: 'time_approval', time_entry_id: entryId,
    }).catch(() => null);
    if (!Array.isArray(approvalTransitions)) return { applicable: true, provenance: null };
    const expectedReviewIds = new Set(
      Array.isArray(expectedCorrectionEvidence?.review_transition_chain)
        ? expectedCorrectionEvidence.review_transition_chain.map((item: any) => String(item?.audit_id || '')).filter(Boolean)
        : []
    );
    const constrainToFrozenReviews = Boolean(expectedProvenance);
    const eligibleApprovalTransitions = [];
    for (const row of approvalTransitions) {
      const original = row?.details?.original || {};
      const updated = row?.details?.updated || {};
      const decision = String(row?.details?.decision || '');
      const note = String(row?.details?.note || '');
      const payrollFieldsUnchanged = Boolean(
        String(original.clock_in || '') === String(updated.clock_in || '') &&
        String(original.clock_out || '') === String(updated.clock_out || '') &&
        Number(original.lunch_minutes || 0) === Number(updated.lunch_minutes || 0) &&
        Number(original.total_hours || 0) === Number(updated.total_hours || 0) &&
        String(original.status || '') === String(updated.status || '') &&
        String(original.notes || '') === String(updated.notes || '') &&
        String(original.clock_source || '') === String(updated.clock_source || '') &&
        JSON.stringify(original.job_allocations || []) === JSON.stringify(updated.job_allocations || [])
      );
      const decisionMatches = decision === 'approve'
        ? (
            ['unreviewed', 'needs_review'].includes(String(original.approval_status || 'unreviewed')) &&
            String(updated.approval_status || '') === 'approved' &&
            String(updated.approval_request_id || '') === String(row.request_id || '') &&
            asEmail(updated.approved_by) === asEmail(row.actor_email) &&
            asEmail(row.actor_email) !== userEmail
          )
        : decision === 'reopen'
          ? (
              String(original.approval_status || '') === 'approved' &&
              String(updated.approval_status || '') === 'needs_review' &&
              String(updated.approval_request_id || '') === String(row.request_id || '') &&
              !asEmail(updated.approved_by)
            )
          : false;
      const expectedApprovalPayloadHash = String(original.updated_date || '')
        ? await payloadHash({
            entry_id: entryId,
            expected_updated_date: String(original.updated_date || ''),
            decision,
            note,
          })
        : '';
      if (
        (!constrainToFrozenReviews || expectedReviewIds.has(String(row.id || ''))) &&
        ['confirmed', 'recovered'].includes(String(row.outcome || '')) &&
        asEmail(row.user_email) === userEmail &&
        String(row.actor_role || '') === 'admin' &&
        ['session', 'admin_kiosk'].includes(String(row.authentication_method || '')) &&
        Boolean(asEmail(row.actor_email)) &&
        String(row.time_entry_id || '') === entryId &&
        String(original.id || '') === entryId &&
        String(updated.id || '') === entryId &&
        asEmail(original.user_email) === userEmail &&
        asEmail(updated.user_email) === userEmail &&
        Boolean(String(original.updated_date || '')) &&
        Boolean(String(updated.updated_date || '')) &&
        payrollFieldsUnchanged &&
        decisionMatches &&
        Boolean(expectedApprovalPayloadHash) &&
        constantTimeEqual(String(row.details?.payload_hash || ''), expectedApprovalPayloadHash) &&
        Number.isFinite(Date.parse(String(row.server_timestamp || ''))) &&
        Date.parse(String(row.server_timestamp)) <= Date.parse(String(approvalAudit.server_timestamp))
      ) {
        eligibleApprovalTransitions.push(row);
      }
    }

    const priorGenerations = Array.isArray(payrollGenerationContext?.prior_generations)
      ? payrollGenerationContext.prior_generations
      : payrollGenerationContext?.prior_generation ? [payrollGenerationContext.prior_generation] : [];
    const payrollPeriodId = String(payrollGenerationContext?.period_id || '');
    const payrollGenerationBridges = [];
    const usedPriorGenerationRequests = new Set();
    const snapshotWithoutPayrollVersion = (snapshot: any) => {
      const comparable = { ...(snapshot || {}) };
      delete comparable.updated_date;
      delete comparable.pay_period_id;
      delete comparable.pay_period_locked_at;
      delete comparable.pay_period_locked_by;
      return comparable;
    };
    const resolvePayrollGenerationBridge = async (cursorSnapshot: any) => {
      if (!priorGenerations.length || !payrollPeriodId) return null;
      const candidates = [];
      for (const priorGeneration of [...priorGenerations].reverse()) {
        const generationRequestId = String(priorGeneration?.request_id || '');
        if (!generationRequestId || usedPriorGenerationRequests.has(generationRequestId)) continue;
        if (Number(priorGeneration.snapshot_version || 0) < 27 ||
            priorGeneration.snapshot_active !== false ||
            !String(priorGeneration.invalidated_by_reopen_request_id || '')) continue;
        const priorRows = Array.isArray(priorGeneration.shift_manifest) ? priorGeneration.shift_manifest : [];
        const priorMatches = priorRows.filter((row: any) => String(row.id || '') === entryId);
        if (priorMatches.length !== 1) continue;
        const priorRow = priorMatches[0];
        const manifestHash = await payloadHash(priorRows);
        if (!String(priorGeneration.shift_manifest_hash || '') ||
            !constantTimeEqual(String(priorGeneration.shift_manifest_hash), manifestHash)) continue;
        if (
          asEmail(priorRow.user_email) !== userEmail ||
          String(priorRow.clock_in || '') !== String(cursorSnapshot?.clock_in || '') ||
          String(priorRow.clock_out || '') !== String(cursorSnapshot?.clock_out || '') ||
          Number(priorRow.total_hours || 0) !== Number(cursorSnapshot?.total_hours || 0) ||
          String(priorRow.approval_status || '') !== String(cursorSnapshot?.approval_status || '') ||
          String(priorRow.approval_request_id || '') !== String(cursorSnapshot?.approval_request_id || '') ||
          String(priorRow.late_clock_in_provenance?.claimed_clock_in || '') !== claimedClockIn ||
          String(priorRow.late_clock_in_provenance?.payroll_clock_in_at_finalization || '') !== String(cursorSnapshot?.clock_in || '')
        ) continue;
        const priorApproval = eligibleApprovalTransitions.filter((row: any) =>
          String(row.id || '') === String(priorRow.approval_evidence?.id || '') &&
          String(row.request_id || '') === String(priorRow.approval_request_id || '') &&
          String(row.details?.decision || '') === 'approve'
        );
        if (priorApproval.length !== 1) continue;
        if (!constantTimeEqual(
          await payloadHash(snapshotWithoutPayrollVersion(priorApproval[0].details?.updated || {})),
          await payloadHash(snapshotWithoutPayrollVersion(cursorSnapshot)),
        )) continue;
        const reopenRows = await auditEntity.filter({
          action: 'pay_period_status',
          request_id: String(priorGeneration.invalidated_by_reopen_request_id || ''),
        }).catch(() => null);
        if (!Array.isArray(reopenRows) || reopenRows.length !== 1) continue;
        const reopenAudit = reopenRows[0];
        if (
          !['confirmed', 'recovered'].includes(String(reopenAudit.outcome || '')) ||
          String(reopenAudit.actor_role || '') !== 'admin' ||
          String(reopenAudit.authentication_method || '') !== 'session' ||
          asEmail(reopenAudit.actor_email) !== asEmail(priorGeneration.invalidated_by) ||
          String(priorGeneration.invalidated_by_role || '') !== 'admin' ||
          String(priorGeneration.invalidation_authentication_method || '') !== 'session' ||
          String(reopenAudit.details?.decision || '') !== 'reopen' ||
          String(reopenAudit.details?.pay_period_id || '') !== payrollPeriodId ||
          String(reopenAudit.details?.note || '') !== String(priorGeneration.invalidation_reason || '')
        ) continue;
        candidates.push({
          priorGeneration,
          priorRow,
          priorApproval: priorApproval[0],
          reopenAudit,
        });
      }
      if (candidates.length !== 1) return null;
      const { priorGeneration, priorRow, priorApproval, reopenAudit } = candidates[0];
      usedPriorGenerationRequests.add(String(priorGeneration.request_id || ''));
      payrollGenerationBridges.unshift({
        period_id: payrollPeriodId,
        prior_generation_request_id: String(priorGeneration.request_id || ''),
        prior_generation_shift_manifest_hash: String(priorGeneration.shift_manifest_hash || ''),
        prior_shift_hash: await payloadHash(priorRow),
        reopen_request_id: String(priorGeneration.invalidated_by_reopen_request_id || ''),
        reopen_audit_id: String(reopenAudit.id || ''),
        reopen_audit_evidence_hash: await payloadHash({
          id: reopenAudit.id, request_id: reopenAudit.request_id,
          user_email: asEmail(reopenAudit.user_email), actor_email: asEmail(reopenAudit.actor_email),
          actor_role: reopenAudit.actor_role, authentication_method: reopenAudit.authentication_method,
          server_timestamp: reopenAudit.server_timestamp, outcome: reopenAudit.outcome, details: reopenAudit.details,
        }),
        prior_generation_evidence_hash: await payloadHash({
          request_id: priorGeneration.request_id,
          snapshot_version: priorGeneration.snapshot_version,
          shift_manifest_hash: priorGeneration.shift_manifest_hash,
          invalidated_at: priorGeneration.invalidated_at,
          invalidated_by: asEmail(priorGeneration.invalidated_by),
          invalidated_by_role: priorGeneration.invalidated_by_role,
          invalidation_authentication_method: priorGeneration.invalidation_authentication_method,
          invalidated_by_reopen_request_id: priorGeneration.invalidated_by_reopen_request_id,
          invalidation_reason: priorGeneration.invalidation_reason,
        }),
      });
      return priorApproval.details?.updated || null;
    };

    const correctionChain = [terminal];
    const reviewTransitionChain = [];
    const usedCorrectionIds = new Set([String(terminal.id || '')]);
    const usedReviewIds = new Set();
    let cursorOriginal = terminal.details?.original || {};
    while (String(cursorOriginal.clock_in || '') !== claimedClockIn) {
      const cursorHash = await payloadHash(cursorOriginal);
      const correctionPredecessors = [];
      for (const row of eligible) {
        if (usedCorrectionIds.has(String(row.id || ''))) continue;
        if (constantTimeEqual(await payloadHash(row.details?.corrected || {}), cursorHash)) {
          correctionPredecessors.push(row);
        }
      }
      const reviewPredecessors = [];
      for (const row of eligibleApprovalTransitions) {
        if (usedReviewIds.has(String(row.id || ''))) continue;
        if (constantTimeEqual(await payloadHash(row.details?.updated || {}), cursorHash)) {
          reviewPredecessors.push(row);
        }
      }
      if (correctionPredecessors.length === 1 && reviewPredecessors.length === 0) {
        const predecessor = correctionPredecessors[0];
        correctionChain.unshift(predecessor);
        usedCorrectionIds.add(String(predecessor.id || ''));
        cursorOriginal = predecessor.details?.original || {};
        continue;
      }
      if (correctionPredecessors.length === 0 && reviewPredecessors.length === 1) {
        const reviewPredecessor = reviewPredecessors[0];
        reviewTransitionChain.unshift(reviewPredecessor);
        usedReviewIds.add(String(reviewPredecessor.id || ''));
        cursorOriginal = reviewPredecessor.details?.original || {};
        continue;
      }
      if (correctionPredecessors.length === 0 && reviewPredecessors.length === 0) {
        const bridgedSnapshot = await resolvePayrollGenerationBridge(cursorOriginal);
        if (bridgedSnapshot) {
          cursorOriginal = bridgedSnapshot;
          continue;
        }
      }
      return { applicable: true, provenance: null };
    }
    if (correctionChain.length !== eligible.length) return { applicable: true, provenance: null };

    const auditEvidence = async (row: any) => ({
      audit_id: String(row.id || ''),
      request_id: String(row.request_id || ''),
      evidence_hash: await payloadHash({
        id: row.id, request_id: row.request_id, time_entry_id: row.time_entry_id,
        user_email: asEmail(row.user_email), actor_email: asEmail(row.actor_email),
        actor_role: row.actor_role, authentication_method: row.authentication_method,
        server_timestamp: row.server_timestamp, outcome: row.outcome, details: row.details,
      }),
    });
    const correctionEvidenceChain = [];
    for (const row of correctionChain) correctionEvidenceChain.push(await auditEvidence(row));
    const reviewTransitionEvidence = [];
    for (const row of reviewTransitionChain) reviewTransitionEvidence.push(await auditEvidence(row));

    const employeeCorrectionReviewChain = [];
    for (const row of correctionChain) {
      const correctionRequestId = String(row.details?.correction_request_id || '');
      if (!correctionRequestId) continue;
      if (!correctionRequestEntity) return { applicable: true, provenance: null };
      const correctionRequest = await correctionRequestEntity.get(correctionRequestId).catch(() => null);
      const requestKind = String(correctionRequest?.request_kind || 'standard');
      const reviewDecision = String(correctionRequest?.review_decision || '');
      const finalStatus = reviewDecision === 'approve_modified' ? 'approved_modified' : reviewDecision === 'approve' ? 'approved' : '';
      const submissionVersion = String(
        correctionRequest?.original_snapshot?.updated_date ||
        correctionRequest?.time_entry_updated_date || ''
      );
      if (
        !correctionRequest?.id ||
        requestKind !== 'standard' ||
        asEmail(correctionRequest.user_email) !== userEmail ||
        String(correctionRequest.time_entry_id || '') !== entryId ||
        !submissionVersion ||
        !String(correctionRequest.request_id || '') ||
        !String(correctionRequest.requested_at || '') ||
        !String(correctionRequest.employee_reason || '') ||
        !finalStatus ||
        String(correctionRequest.status || '') !== finalStatus ||
        String(correctionRequest.review_request_id || '') !== String(row.request_id || '') ||
        String(correctionRequest.applied_audit_id || '') !== String(row.id || '') ||
        asEmail(correctionRequest.reviewer_email) !== asEmail(row.actor_email) ||
        String(correctionRequest.review_payload_hash || '') !== String(row.details?.review_payload_hash || '')
      ) return { applicable: true, provenance: null };

      const requestedChanges = correctionRequest.requested_changes || {};
      const expectedSubmissionHash = await payloadHash({
        entry_id: correctionRequest.time_entry_id,
        expected_updated_date: submissionVersion,
        reason: correctionRequest.employee_reason,
        requested_changes: requestedChanges,
      });
      const submissionRows = await auditEntity.filter({
        action: 'correction_request',
        request_id: String(correctionRequest.request_id || ''),
        time_entry_id: entryId,
      }).catch(() => null);
      const reviewRows = await auditEntity.filter({
        action: 'correction_review',
        request_id: String(correctionRequest.review_request_id || ''),
        time_entry_id: entryId,
      }).catch(() => null);
      if (!Array.isArray(submissionRows) || submissionRows.length !== 1 ||
          !Array.isArray(reviewRows) || reviewRows.length !== 1) {
        return { applicable: true, provenance: null };
      }
      const submissionAudit = submissionRows[0];
      const reviewAudit = reviewRows[0];
      const requestedAtTime = Date.parse(String(correctionRequest.requested_at || ''));
      const reviewedAtTime = Date.parse(String(correctionRequest.reviewed_at || ''));
      const submissionAuditTime = Date.parse(String(submissionAudit.server_timestamp || ''));
      const reviewAuditTime = Date.parse(String(reviewAudit.server_timestamp || ''));
      if (
        !['confirmed', 'recovered'].includes(String(submissionAudit.outcome || '')) ||
        asEmail(submissionAudit.user_email) !== userEmail ||
        asEmail(submissionAudit.actor_email) !== userEmail ||
        !['session', 'badge'].includes(String(submissionAudit.authentication_method || '')) ||
        (String(submissionAudit.actor_role || '') === 'badge') !== (String(submissionAudit.authentication_method || '') === 'badge') ||
        String(submissionAudit.reason || '') !== String(correctionRequest.employee_reason || '') ||
        String(submissionAudit.details?.correction_request_id || '') !== correctionRequestId ||
        !constantTimeEqual(String(submissionAudit.details?.payload_hash || ''), expectedSubmissionHash) ||
        String(submissionAudit.details?.requested_changes?.clock_in || '') !== String(requestedChanges.clock_in || '') ||
        String(submissionAudit.details?.requested_changes?.clock_out || '') !== String(requestedChanges.clock_out || '') ||
        Number(submissionAudit.details?.requested_changes?.lunch_minutes || 0) !== Number(requestedChanges.lunch_minutes || 0) ||
        String(submissionAudit.details?.requested_changes?.notes || '') !== String(requestedChanges.notes || '') ||
        !['confirmed', 'recovered'].includes(String(reviewAudit.outcome || '')) ||
        asEmail(reviewAudit.user_email) !== userEmail ||
        asEmail(reviewAudit.actor_email) !== asEmail(correctionRequest.reviewer_email) ||
        String(reviewAudit.actor_role || '') !== 'admin' ||
        !['session', 'admin_kiosk'].includes(String(reviewAudit.authentication_method || '')) ||
        String(reviewAudit.reason || '') !== String(correctionRequest.reviewer_reason || '') ||
        String(reviewAudit.details?.correction_request_id || '') !== correctionRequestId ||
        String(reviewAudit.details?.decision || '') !== finalStatus ||
        String(reviewAudit.details?.applied_audit_id || '') !== String(row.id || '') ||
        !constantTimeEqual(
          String(reviewAudit.details?.review_payload_hash || ''),
          String(correctionRequest.review_payload_hash || ''),
        ) ||
        !Number.isFinite(requestedAtTime) || !Number.isFinite(reviewedAtTime) ||
        !Number.isFinite(submissionAuditTime) || !Number.isFinite(reviewAuditTime) ||
        submissionAuditTime < requestedAtTime || submissionAuditTime > reviewedAtTime ||
        reviewAuditTime !== reviewedAtTime
      ) return { applicable: true, provenance: null };

      const auditEvidenceHash = async (auditRow: any) => payloadHash({
        id: auditRow.id, action: auditRow.action, request_id: auditRow.request_id,
        time_entry_id: auditRow.time_entry_id, user_email: asEmail(auditRow.user_email),
        actor_email: asEmail(auditRow.actor_email), actor_role: auditRow.actor_role,
        authentication_method: auditRow.authentication_method, server_timestamp: auditRow.server_timestamp,
        outcome: auditRow.outcome, reason: auditRow.reason, details: auditRow.details,
      });
      employeeCorrectionReviewChain.push({
        applied_audit_id: String(row.id || ''),
        correction_request_id: correctionRequestId,
        submission_audit_id: String(submissionAudit.id || ''),
        submission_payload_hash: expectedSubmissionHash,
        submission_audit_evidence_hash: await auditEvidenceHash(submissionAudit),
        review_audit_id: String(reviewAudit.id || ''),
        review_payload_hash: String(correctionRequest.review_payload_hash || ''),
        review_audit_evidence_hash: await auditEvidenceHash(reviewAudit),
        correction_request_evidence_hash: await payloadHash({
          id: correctionRequest.id,
          request_kind: requestKind,
          user_email: asEmail(correctionRequest.user_email),
          time_entry_id: correctionRequest.time_entry_id,
          time_entry_updated_date: correctionRequest.time_entry_updated_date,
          request_id: correctionRequest.request_id,
          requested_at: correctionRequest.requested_at,
          employee_reason: correctionRequest.employee_reason,
          original_snapshot: correctionRequest.original_snapshot,
          requested_changes: correctionRequest.requested_changes,
          status: correctionRequest.status,
          reviewed_at: correctionRequest.reviewed_at,
          reviewer_email: asEmail(correctionRequest.reviewer_email),
          reviewer_reason: correctionRequest.reviewer_reason,
          review_request_id: correctionRequest.review_request_id,
          review_decision: correctionRequest.review_decision,
          review_payload_hash: correctionRequest.review_payload_hash,
          applied_audit_id: correctionRequest.applied_audit_id,
        }),
      });
    }
    const expectedEmployeeCorrectionChain =
      expectedProvenance?.payroll_correction_evidence?.employee_correction_review_chain;
    const includeEmployeeCorrectionChain = !expectedProvenance ||
      Array.isArray(expectedEmployeeCorrectionChain);

    const terminalEvidence = correctionEvidenceChain[correctionEvidenceChain.length - 1];
    payrollCorrectionEvidence = {
      audit_id: terminalEvidence.audit_id,
      request_id: terminalEvidence.request_id,
      evidence_hash: terminalEvidence.evidence_hash,
      ...(correctionEvidenceChain.length > 1 ? { correction_chain: correctionEvidenceChain } : {}),
      ...(reviewTransitionEvidence.length ? { review_transition_chain: reviewTransitionEvidence } : {}),
      ...(includeEmployeeCorrectionChain && employeeCorrectionReviewChain.length ? {
        employee_correction_review_chain: employeeCorrectionReviewChain,
      } : {}),
      ...(payrollGenerationBridges.length ? {
        payroll_generation_bridge: payrollGenerationBridges[payrollGenerationBridges.length - 1],
      } : {}),
      ...(payrollGenerationBridges.length > 1 ? {
        payroll_generation_bridge_chain: payrollGenerationBridges,
      } : {}),
    };
  }

  return {
    applicable: true,
    provenance: {
      ...(payrollCorrectionEvidence ? { payroll_correction_evidence: payrollCorrectionEvidence } : {}),
      source: 'employee_attested_missed_clock_in',
      request_id: requestId,
      reported_at: reportedAt,
      claimed_clock_in: claimedClockIn,
      payroll_clock_in_at_finalization: payrollClockIn,
      company_date: companyDate,
      punch_exception_id: punchExceptionId,
      punch_case_key: String(punchCase.case_key || ''),
      punch_case_status_at_finalization: 'resolved',
      punch_employee_response: 'missed_clock_in',
      punch_original_snapshot_hash: originalSnapshotHash,
      clock_in_audit_id: String(clockInAudit.id || ''),
      clock_in_audit_outcome: String(clockInAudit.outcome || ''),
      clock_in_actor_email: asEmail(clockInAudit.actor_email),
      clock_in_actor_role: String(clockInAudit.actor_role || ''),
      clock_in_authentication_method: String(clockInAudit.authentication_method || ''),
      punch_audit_id: String(punchAudit.id || ''),
      punch_audit_outcome: String(punchAudit.outcome || ''),
      punch_actor_email: asEmail(punchAudit.actor_email),
      punch_actor_role: String(punchAudit.actor_role || ''),
      punch_authentication_method: String(punchAudit.authentication_method || ''),
      punch_payload_hash: expectedRecoveryHash,
      manager_approval_audit_id: approvalAuditId,
      manager_approval_request_id: approvalRequestId,
      manager_approved_by: asEmail(approvalAudit.actor_email),
      manager_approved_at: String(approvalAudit.server_timestamp || ''),
    },
  };
}

function defaultTrackerPrefs(email: string, name: string) {
  return {
    tracker_enabled: false,
    daily_goal_minutes: 480,
    weekly_goal_minutes: 2400,
    show_week_strip: true,
    display_style: 'ring',
    count_mode: 'paid',
    direction: 'up',
    milestones_mode: 'goal',
    milestone_behavior: 'pulse',
    milestone_thresholds: [0.5, 0.75, 1],
    overtime_warning: false,
    milestone_sound: 'chime',
    show_overtime: true,
    show_projected_finish: true,
    show_pace: true,
    accent_color: 'indigo',
    privacy_blur: false,
    size: 'expanded',
    location: 'both',
    scale: 1,
    opacity: 1,
    font: 'default',
    background_style: 'minimal',
    update_interval_seconds: 60,
    animation_style: 'smooth',
    animation_target: 'all',
    time_format: 'hh_mm_ss',
    show_label: true,
    show_icon: true,
    show_seconds: true,
    show_percent: false,
    show_only_clocked_in: false,
    progressive_colors: true,
    blink_separator: false,
    hide_when_unfocused: false,
    timeclock_page_only: false,
    goal_celebrate: true,
    device_scope: 'all',
    custom_label: '',
    alert_minutes: [],
    reminders: [],
    hide_when_idle_minutes: 0,
    daily_goal_overrides: null,
    hide_on_weekend: false,
    weekly_celebrate: true,
  };
}

const TRACKER_ENUMS: Record<string, string[]> = {
  display_style: ['ring', 'bar', 'minimal', 'flip', 'roll', 'donut', 'arc', 'badge'],
  count_mode: ['paid', 'elapsed', 'pomodoro'],
  direction: ['up', 'down'],
  milestones_mode: ['off', 'goal', 'custom'],
  milestone_behavior: ['silent', 'pulse', 'toast', 'toast_sound'],
  milestone_sound: ['chime', 'bell', 'ding', 'fanfare', 'alert'],
  accent_color: ['indigo', 'emerald', 'amber', 'violet', 'rose', 'sky', 'cyan', 'teal', 'lime', 'orange', 'fuchsia', 'slate'],
  size: ['compact', 'expanded'],
  location: ['both', 'top', 'side', 'hidden'],
  font: ['default', 'mono', 'rounded', 'serif', 'light', 'heavy'],
  background_style: ['minimal', 'glass', 'solid', 'outline', 'soft', 'accent', 'halo', 'dotted', 'striped', 'elevated', 'inset', 'neon', 'pearl', 'carbon', 'mesh', 'aurora', 'dusk', 'forest', 'ocean', 'sunset', 'berry', 'mono'],
  animation_style: ['smooth', 'pulse', 'glow', 'breathe', 'sweep', 'wave', 'sparkle', 'float', 'flicker', 'rainbow', 'pop', 'wobble', 'ripple', 'shake', 'gradient', 'none'],
  animation_target: ['all', 'digits', 'ring', 'icon'],
  device_scope: ['all', 'desktop_only', 'mobile_only'],
  time_format: ['hh_mm_ss', 'hours_minutes', 'decimal'],
};

const TRACKER_BOOL_KEYS = ['tracker_enabled', 'show_week_strip', 'overtime_warning', 'show_overtime', 'show_projected_finish', 'show_pace', 'privacy_blur', 'show_label', 'show_icon', 'show_seconds', 'show_percent', 'show_only_clocked_in', 'progressive_colors', 'blink_separator', 'hide_when_unfocused', 'timeclock_page_only', 'goal_celebrate', 'weekly_celebrate', 'hide_on_weekend', 'low_data_mode'];
const TRACKER_EDITABLE_KEYS = [...TRACKER_BOOL_KEYS, 'daily_goal_minutes', 'weekly_goal_minutes', 'display_style', 'count_mode', 'direction', 'milestones_mode', 'milestone_behavior', 'milestone_thresholds', 'milestone_sound', 'accent_color', 'size', 'location', 'scale', 'opacity', 'font', 'background_style', 'update_interval_seconds', 'animation_style', 'animation_target', 'time_format', 'device_scope', 'custom_label', 'alert_minutes', 'reminders', 'hide_when_idle_minutes', 'daily_goal_overrides'];

function trackerClamp(value: any, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeTrackerPrefs(row: any, target: any) {
  const base = defaultTrackerPrefs(asEmail(target?.email), target?.full_name || '');
  if (!row || typeof row !== 'object') return base;
  const out: any = { ...base };
  for (const key of TRACKER_BOOL_KEYS) out[key] = row[key] === undefined ? base[key] : row[key] === true;
  for (const [key, choices] of Object.entries(TRACKER_ENUMS)) {
    const v = String(row?.[key] || '');
    if (choices.includes(v)) out[key] = v;
  }
  out.daily_goal_minutes = Math.round(trackerClamp(row.daily_goal_minutes, 240, 840, 480));
  out.weekly_goal_minutes = Math.round(trackerClamp(row.weekly_goal_minutes, 480, 5880, 2400));
  out.scale = trackerClamp(row.scale, 0.5, 2, 1);
  out.opacity = trackerClamp(row.opacity, 0.4, 1, 1);
  out.update_interval_seconds = Math.round(trackerClamp(row.update_interval_seconds, 15, 300, 60));
  out.hide_when_idle_minutes = Math.round(trackerClamp(row.hide_when_idle_minutes, 0, 480, 0));
  const rawOverrides = row.daily_goal_overrides && typeof row.daily_goal_overrides === 'object' ? row.daily_goal_overrides : {};
  const cleanOverrides: Record<string, number> = {};
  for (const k of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) {
    const v = Math.round(Number((rawOverrides as any)[k]));
    if (Number.isFinite(v) && v >= 60 && v <= 840) cleanOverrides[k] = v;
  }
  out.daily_goal_overrides = Object.keys(cleanOverrides).length ? cleanOverrides : null;
  const rawThresholds = Array.isArray(row.milestone_thresholds) ? row.milestone_thresholds : base.milestone_thresholds;
  out.milestone_thresholds = rawThresholds
    .map((t: any) => Number(t))
    .filter((t: number) => Number.isFinite(t) && t > 0 && t <= 1.5)
    .slice(0, 8);
  if (!out.milestone_thresholds.length) out.milestone_thresholds = [...base.milestone_thresholds];
  out.custom_label = String(row.custom_label || '').slice(0, 24).trim();
  const rawAccent = String(row.accent_color || '');
  if (/^#[0-9a-fA-F]{6}$/.test(rawAccent)) out.accent_color = rawAccent.toLowerCase();
  const reminderSource = Array.isArray(row.reminders) ? row.reminders
    : (Array.isArray(row.alert_minutes) ? row.alert_minutes : []);
  out.reminders = reminderSource
    .map((r: any) => {
      const percent = Number(typeof r === 'object' && r !== null ? r.percent : NaN);
      const minutes = Math.round(Number(typeof r === 'object' && r !== null ? r.minutes : r));
      const label = typeof r === 'object' && r !== null ? String(r.label || '').slice(0, 60).trim() : '';
      if (Number.isFinite(percent) && percent > 0 && percent <= 1.5) return { percent, label };
      return Number.isFinite(minutes) && minutes > 0 && minutes <= 1440 ? { minutes, label } : null;
    })
    .filter(Boolean)
    .filter((r: any, i: number, arr: any[]) => arr.findIndex((o: any) => o.minutes === r.minutes && o.percent === r.percent) === i)
    .slice(0, 12);
  out.alert_minutes = (Array.isArray(row.alert_minutes) ? row.alert_minutes : [])
    .map((m: any) => Math.round(Number(m)))
    .filter((m: number) => Number.isFinite(m) && m > 0 && m <= 1440)
    .slice(0, 6);
  return out;
}

async function trackerPaidMinutesForEntry({ entry, breakEntity, workPauseEntity, userEmail, nowMs }: any) {
  const startMs = new Date(String(entry?.clock_in || '')).getTime();
  const endMs = entry?.clock_out ? new Date(String(entry.clock_out)).getTime() : nowMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const elapsed = (endMs - startMs) / 60000;
  const breakSummary = await breakSummaryForEntry(breakEntity, entry.id, userEmail);
  const pauseSummary = await workPauseSummaryForEntry(workPauseEntity, entry.id, userEmail);
  const lunch = Math.max(0, Number(entry.lunch_minutes || 0));
  return Math.max(0, elapsed - Math.max(0, Number(breakSummary?.unpaid_minutes || 0)) - Math.max(0, Number(pauseSummary?.total_minutes || 0)) - lunch);
}

function companyWeekStartKey(nowIso: string) {
  const todayKey = dateKeyInCompanyTime(nowIso);
  if (!todayKey) return '';
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: COMPANY_TIME_ZONE, weekday: 'short' }).format(new Date(nowIso));
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  if (dayIndex < 0) return '';
  const daysSinceMonday = (dayIndex + 6) % 7;
  const d = new Date(`${todayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
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

async function runStaleShiftMonitor({ entryEntity, stateEntity, punchExceptionEntity, auditEntity, ptoBalanceEntity, base44 }: any) {
  const serverNow = new Date();
  const activeEntries = await loadAllFilteredRows(
    entryEntity,
    { status: 'clocked_in', archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
    'clock_in',
    'Active Time Clock shifts',
  );
  const clockedInStates = await loadAllFilteredRows(
    stateEntity,
    { status: 'clocked_in' },
    'user_email',
    'Clocked-in employee states',
  );
  const missedClockOutCases = await loadAllFilteredRows(
    punchExceptionEntity,
    { exception_type: 'missed_clock_out' },
    '-detected_at',
    'Missed Clock Out punch exceptions',
  );

  const statesByEmail = new Map<string, any[]>();
  const casesByKey = new Map<string, any[]>();
  const group = (map: Map<string, any[]>, key: string, row: any) => {
    if (!key) return;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  };
  for (const state of clockedInStates) group(statesByEmail, asEmail(state.user_email), state);
  for (const punchCase of missedClockOutCases) group(casesByKey, String(punchCase.case_key || ''), punchCase);

  const summary = {
    success: true,
    scanned: activeEntries.length,
    stale: 0,
    created: 0,
    existing: 0,
    acknowledged: 0,
    invalid_clock_in: 0,
    state_conflicts: 0,
    case_conflicts: 0,
    gate_busy: 0,
    changed_during_scan: 0,
    errors: 0,
  };

  for (const observedEntry of activeEntries) {
    const eligibility = staleShiftMonitorEligibility(observedEntry, serverNow);
    if (!eligibility.eligible) {
      if (eligibility.reason === 'fresh_worked_through') summary.acknowledged += 1;
      else if (eligibility.reason === 'invalid_clock_in') summary.invalid_clock_in += 1;
      continue;
    }
    summary.stale += 1;

    const email = asEmail(observedEntry.user_email);
    const matchingStates = (statesByEmail.get(email) || []).filter(
      (state) => state.active_entry_id === observedEntry.id && state.status === 'clocked_in',
    );
    if (matchingStates.length !== 1) {
      summary.state_conflicts += 1;
      continue;
    }
    const state = matchingStates[0];
    const caseKey = `missed_clock_out:${observedEntry.id}`;
    const gateEntryId = `punch_exception:${observedEntry.id}`;
    const requestDigest = await sha256Hex(String(observedEntry.id));
    const monitorRequestId = `stale-monitor-${requestDigest.slice(0, 32)}`;
    const monitorPayloadHash = await payloadHash({
      action: 'monitor_stale_shift',
      user_email: email,
      time_entry_id: observedEntry.id,
      clock_in: observedEntry.clock_in,
    });

    const knownCases = casesByKey.get(caseKey) || [];
    if (knownCases.length > 1) {
      summary.case_conflicts += 1;
      continue;
    }
    if (knownCases.length === 1) {
      const existingCase = knownCases[0];
      if (asEmail(existingCase.user_email) !== email || String(existingCase.time_entry_id || '') !== observedEntry.id) {
        summary.case_conflicts += 1;
        continue;
      }
      try {
        await ensureActionAudit(auditEntity, {
          action: 'punch_exception', outcome: 'confirmed', user_email: email,
          user_name: observedEntry.user_name || email, actor_email: 'system', actor_role: 'system',
          authentication_method: 'system', server_timestamp: existingCase.detected_at || serverNow.toISOString(),
          request_id: monitorRequestId, time_entry_id: observedEntry.id,
          reason: 'Scheduled stale-shift monitor detected a long-running active shift',
          details: {
            payload_hash: monitorPayloadHash,
            punch_exception_id: existingCase.id,
            source: 'scheduled_stale_shift_monitor',
            threshold_hours: MISSED_PUNCH_PROMPT_MS / (60 * 60 * 1000),
            punch_times_changed: false,
          },
        }, 'Scheduled stale-shift monitor audit');
        const released = await releaseCompletedCorrectionCreateLock(
          stateEntity, state.id, monitorRequestId, gateEntryId, monitorPayloadHash,
        );
        if (!released) throw new Error('Stale-shift monitor could not verify completed lock recovery.');
        summary.existing += 1;
      } catch (error) {
        summary.errors += 1;
        console.error('Stale-shift monitor existing-case recovery failed:', observedEntry.id, error?.message || error);
      }
      continue;
    }

    const gate = await claimCorrectionCreateLock(
      stateEntity, state.id, monitorRequestId, gateEntryId, monitorPayloadHash,
    );
    if (!gate?.acquired) {
      summary.gate_busy += 1;
      continue;
    }

    try {
      const entry = await entryEntity.get(observedEntry.id).catch(() => null);
      const freshStateRow = await freshState(stateEntity, state.id).catch(() => null);
      const freshEligibility = staleShiftMonitorEligibility(entry, serverNow);
      if (!entry?.id || asEmail(entry.user_email) !== email || !freshEligibility.eligible ||
          !freshStateRow?.id || freshStateRow.status !== 'clocked_in' || freshStateRow.active_entry_id !== entry.id) {
        const released = await releaseCorrectionCreateLock(
          stateEntity, state.id, monitorRequestId, gateEntryId, monitorPayloadHash, gate.claim_token,
        );
        if (!released) throw new Error('Stale-shift monitor could not verify release after the shift changed.');
        summary.changed_during_scan += 1;
        continue;
      }

      const existingCase = await uniqueRow(punchExceptionEntity, { case_key: caseKey }, 'Missed clock-out case');
      if (existingCase?.id) {
        if (asEmail(existingCase.user_email) !== email || String(existingCase.time_entry_id || '') !== entry.id) {
          throw new Error('Existing missed clock-out case does not match the stale shift.');
        }
        const released = await releaseCorrectionCreateLock(
          stateEntity, state.id, monitorRequestId, gateEntryId, monitorPayloadHash, gate.claim_token,
        );
        if (!released) throw new Error('Stale-shift monitor could not verify release after concurrent case creation.');
        summary.existing += 1;
        continue;
      }

      const createdCase = await punchExceptionEntity.create({
        case_key: caseKey,
        user_email: email,
        user_name: entry.user_name || email,
        time_entry_id: entry.id,
        exception_type: 'missed_clock_out',
        status: 'open',
        detected_at: serverNow.toISOString(),
        detected_clock_in: entry.clock_in,
        original_snapshot: entryAuditSnapshot(entry),
        resolution_note: 'Scheduled stale-shift monitor detected an active cross-date shift past the missed-punch review threshold. No punch time was changed.',
      });
      if (!createdCase?.id) throw new Error('Stale-shift monitor could not persist the punch exception.');

      await ensureActionAudit(auditEntity, {
        action: 'punch_exception', outcome: 'confirmed', user_email: email,
        user_name: entry.user_name || email, actor_email: 'system', actor_role: 'system',
        authentication_method: 'system', server_timestamp: createdCase.detected_at || serverNow.toISOString(),
        request_id: monitorRequestId, time_entry_id: entry.id,
        reason: 'Scheduled stale-shift monitor detected a long-running active shift',
        details: {
          payload_hash: monitorPayloadHash,
          punch_exception_id: createdCase.id,
          source: 'scheduled_stale_shift_monitor',
          threshold_hours: MISSED_PUNCH_PROMPT_MS / (60 * 60 * 1000),
          punch_times_changed: false,
        },
      }, 'Scheduled stale-shift monitor audit');

      const released = await releaseCorrectionCreateLock(
        stateEntity, state.id, monitorRequestId, gateEntryId, monitorPayloadHash, gate.claim_token,
      );
      if (!released) throw new Error('Stale-shift monitor created the exception but could not verify audit/lock release.');
      summary.created += 1;
      await emitTimeClockEvent(base44, 'time_entry_no_clock_out', entry.id, 'system');
    } catch (error) {
      summary.errors += 1;
      console.error('Stale-shift monitor entry failed:', observedEntry.id, error?.message || error);
      // Do not release an uncertain create lock here. The stable monitor request id and
      // exact payload let a later scheduled run safely recover it without duplicating a case.
    }
  }

  // Low PTO balances ride the same verified periodic scan: one alert per
  // (employee, time-off type, week) while a balance stays under the threshold.
  try {
    const balanceRows = await loadAllFilteredRows(
      ptoBalanceEntity, {}, 'user_email', 'PTO balances for the low-balance check',
    );
    const lowWeekKey = `w${Math.floor(serverNow.getTime() / PTO_LOW_ALERT_INTERVAL_MS)}`;
    for (const row of balanceRows) {
      const email = asEmail(row?.user_email);
      if (!row?.id || !email) continue;
      for (const bal of Array.isArray(row.balances) ? row.balances : []) {
        const typeId = String(bal?.type_id || bal?.type_name || '').trim();
        const available = Number(bal?.available_hours);
        if (!typeId || !Number.isFinite(available) || available >= PTO_LOW_HOURS_THRESHOLD) continue;
        const alertAudit = await ensureUserActionAudit(auditEntity, {
          action: 'pto_balance_low', outcome: 'confirmed', user_email: email,
          user_name: row.user_name || email, actor_email: 'system', actor_role: 'system',
          authentication_method: 'system', server_timestamp: serverNow.toISOString(),
          request_id: `pto-low-${email}-${typeId}-${lowWeekKey}`,
          reason: `PTO balance for ${bal?.type_name || typeId} fell below ${PTO_LOW_HOURS_THRESHOLD} hours`,
          details: { time_off_type_id: typeId, available_hours: available, pto_balance_id: row.id },
        }, 'Low PTO balance alert audit');
        if (alertAudit?.reused) continue;
        await emitTimeClockEvent(base44, 'pto_balance_low', row.id, 'system');
      }
    }
  } catch (error: any) {
    console.error('Low PTO balance scan failed:', error?.message || error);
  }

  return summary;
}

// Exactly one backend-only coordinator row must be provisioned before this action
// can run. Never create it on demand: simultaneous bootstraps would not be atomic.
async function acquirePayPeriodCreateGate(gateEntity: any, auditEntity: any, periodEntity: any, requestId: string, hash: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rows = await gateEntity.filter({});
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.scope !== 'company' || !rows[0]?.id) {
      return { acquired: false, error: 'Pay-period creation coordinator is missing or ambiguous. Admin setup or investigation is required.' };
    }
    const gate = rows[0];
    if (gate.status === 'idle') {
      // Only a clean preprovisioned or released coordinator is safe to claim.
      if (gate.request_id || gate.payload_hash || gate.claim_token || gate.started_at) {
        return { acquired: false, error: 'Idle pay-period creation coordinator has stale lock metadata. Admin investigation is required.' };
      }
      const token = crypto.randomUUID();
      const claimed = await gateEntity.updateMany(
        { id: gate.id, updated_date: gate.updated_date, scope: 'company', status: 'idle' },
        { $set: { status: 'creating', request_id: requestId, payload_hash: hash,
          claim_token: token, started_at: new Date().toISOString() } },
      );
      if (!claimed || typeof claimed.updated !== 'number') throw new Error('Pay-period create gate claim was not verified.');
      if (claimed.updated === 1) return { acquired: true, id: gate.id, token };
      continue;
    }
    if (gate.status !== 'creating' || !gate.request_id || !gate.payload_hash || !gate.claim_token) {
      return { acquired: false, error: 'Pay-period creation coordinator has an invalid lock. Admin investigation is required.' };
    }
    const sameRequest = gate.request_id === requestId;
    if (sameRequest && !constantTimeEqual(String(gate.payload_hash), hash)) {
      return { acquired: false, error: 'This pay-period request id is already bound to different details.' };
    }
    const prior = await periodEntity.filter({ last_request_id: gate.request_id });
    const audits = await auditEntity.filter({ action: 'pay_period_create', request_id: gate.request_id });
    if (!Array.isArray(prior) || !Array.isArray(audits) || prior.length > 1 || audits.length > 1) {
      return { acquired: false, error: 'The held pay-period creation has ambiguous records. Admin investigation is required.' };
    }
    const saved = prior[0];
    const audit = audits[0];
    const details = audit?.details || {};
    const consistent = saved && audit && constantTimeEqual(String(details.payload_hash || ''), String(gate.payload_hash)) &&
      details.label === saved.label && details.start_date === saved.start_date && details.end_date === saved.end_date;
    // A same-request retry may finish the pending audit ONLY after the saved
    // period is visible; never re-enter the create path on an uncertain write.
    if (sameRequest && consistent && (
      (audit.outcome === 'pending' && !details.pay_period_id) ||
      (['confirmed', 'recovered'].includes(audit.outcome) && details.pay_period_id === saved.id)
    )) {
      return { acquired: true, id: gate.id, token: gate.claim_token };
    }
    const completed = consistent && ['confirmed', 'recovered'].includes(audit.outcome) &&
      details.pay_period_id === saved.id;
    const safelyBlocked = !saved && audit?.outcome === 'blocked' &&
      constantTimeEqual(String(details.payload_hash || ''), String(gate.payload_hash));
    if (completed || safelyBlocked) {
      const released = await gateEntity.updateMany(
        { id: gate.id, updated_date: gate.updated_date, scope: 'company', status: 'creating',
          request_id: gate.request_id, payload_hash: gate.payload_hash, claim_token: gate.claim_token },
        { $set: { status: 'idle', request_id: '', payload_hash: '', claim_token: '', started_at: null } },
      );
      if (!released || typeof released.updated !== 'number') throw new Error('Completed pay-period gate recovery could not be verified.');
      if (released.updated === 1) continue;
      continue;
    }
    return { acquired: false, retry_same_request: sameRequest,
      error: sameRequest
        ? 'This pay-period request is still processing or its create result is uncertain. Retry the same request after recovery or request admin investigation.'
        : 'Another pay-period creation is in progress or has an uncertain result. Finish or investigate that request first.' };
  }
  return { acquired: false, retry_same_request: true, error: 'Pay-period creation gate changed concurrently. Retry the request.' };
}

// Cross-employee admin corrections must share a company-wide CAS claim.
// Exactly one coordinator must be provisioned; never bootstrap it on demand.
// Uncertain interrupted operations stay claimed for investigation rather than
// allowing unsafe stale-lease takeover while the original request may run.
async function claimAdminCorrectionGate(
  gateEntity: any, auditEntity: any, entryEntity: any, stateEntity: any,
  requestId: string, entryId: string, hash: string,
  correctionRequestEntity: any = null,
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rows = await gateEntity.filter({});
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.scope !== 'company' || !rows[0]?.id) {
      return { acquired: false, error: 'Company manager-correction coordinator is missing or ambiguous. Admin setup or investigation is required.' };
    }
    const gate = rows[0];
    if (gate.status === 'creating' && gate.request_id && gate.time_entry_id &&
        gate.payload_hash && gate.claim_token) {
      if (String(gate.time_entry_id).startsWith('review:')) {
        const heldReviewId = String(gate.time_entry_id).slice('review:'.length);
        if (correctionRequestEntity && heldReviewId &&
            await releaseManagerReviewDecisionGate(
              gateEntity, auditEntity, correctionRequestEntity, entryEntity,
              gate.id, gate.request_id, heldReviewId,
              gate.payload_hash, gate.claim_token,
            )) continue;
        return { acquired: false, retry_same_request: gate.request_id === requestId,
          error: 'The company manager-review coordinator is still processing or has uncertain outcome. Admin investigation or verified review recovery is required.' };
      }
      // Recover only after the originating employee mutation gate is idle and
      // the saved TimeEntry + completed/blocked audit prove a settled result.
      // A stale timestamp alone is never permission to take over a write.
      const priorEntry = await entryEntity.get(gate.time_entry_id).catch(() => null);
      const owners = priorEntry?.id
        ? await stateEntity.filter({ user_email: asEmail(priorEntry.user_email) })
        : null;
      const priorOwnerState = Array.isArray(owners) && owners.length === 1 ? owners[0] : null;
      const ownerIdle = String(priorOwnerState?.correction_create_status || '') === 'idle';
      // This request may already hold the same employee's newer mutation
      // gate. That proves the older gate was released only when its request
      // ID differs and the currently held entry/request match this caller.
      const newerClaimHeld = gate.request_id !== requestId &&
        String(priorOwnerState?.correction_create_status || '') === 'creating' &&
        String(priorOwnerState?.correction_create_request_id || '') === requestId &&
        String(priorOwnerState?.correction_create_time_entry_id || '') === entryId;
      if (priorOwnerState && (ownerIdle || newerClaimHeld)) {
        const recovered = await releaseAdminCorrectionGate(
          gateEntity, auditEntity, entryEntity, gate.id, gate.request_id,
          gate.time_entry_id, gate.payload_hash, gate.claim_token,
        );
        if (recovered) continue;
      }
      return { acquired: false, retry_same_request: gate.request_id === requestId,
        error: 'Manager correction is in progress or its result is uncertain. Its company coordinator cannot be reclaimed without verified completion.' };
    }
    if (gate.status !== 'idle') {
      return { acquired: false, error: 'Manager-correction coordinator has invalid state. Admin investigation is required.' };
    }
    if (gate.request_id || gate.time_entry_id || gate.payload_hash || gate.claim_token || gate.started_at) {
      return { acquired: false, error: 'Idle manager-correction coordinator contains stale metadata. Admin investigation is required.' };
    }
    const token = crypto.randomUUID();
    const claimed = await gateEntity.updateMany(
      { id: gate.id, updated_date: gate.updated_date, scope: 'company', status: 'idle' },
      { $set: { status: 'creating', request_id: requestId, time_entry_id: entryId,
        payload_hash: hash, claim_token: token, started_at: new Date().toISOString() } },
    );
    if (!claimed || typeof claimed.updated !== 'number') throw new Error('Manager-correction coordinator CAS claim was not verified.');
    if (claimed.updated === 1) return { acquired: true, id: gate.id, token };
  }
  return { acquired: false, error: 'Manager-correction coordinator changed concurrently. Retry after refresh.' };
}

async function releaseAdminCorrectionGate(
  gateEntity: any, auditEntity: any, entryEntity: any,
  gateId: string, requestId: string, entryId: string, hash: string, token: string,
  allowPrewriteRelease = false,
) {
  const gate = await gateEntity.get(gateId).catch(() => null);
  if (!gate?.id || gate.status !== 'creating' || gate.scope !== 'company' ||
      gate.request_id !== requestId || gate.time_entry_id !== entryId ||
      !constantTimeEqual(String(gate.payload_hash || ''), hash) || gate.claim_token !== token) return false;
  const audits = await auditEntity.filter({ action: 'admin_correction', request_id: requestId });
  const entry = await entryEntity.get(entryId).catch(() => null);
  if (!Array.isArray(audits) || !entry?.id || audits.length > 1) return false;
  const markerMatches = String(entry.last_correction_request_id || '') === requestId;
  const audit = audits[0] || null;
  // Only this actively executing request may release a clean pre-write claim.
  // Recovery of an abandoned claim must never mistake missing audit evidence
  // for proof that an interrupted write did not commit.
  if (!audit && (!allowPrewriteRelease || markerMatches)) return false;
  if (audit) {
    const auditDetails = audit.details || {};
    if (String(audit.time_entry_id || '') !== entryId ||
        asEmail(audit.user_email) !== asEmail(entry.user_email) ||
        String(audit.actor_role || '') !== 'admin' ||
        !String(audit.id || '') ||
        !String(audit.server_timestamp || '') ||
        !String(auditDetails.payload_hash || '') ||
        !constantTimeEqual(String(auditDetails.payload_hash), hash)) return false;
    if (['confirmed', 'recovered'].includes(String(audit.outcome || ''))) {
      const corrected = auditDetails.corrected || {};
      if (!markerMatches ||
          String(corrected.id || '') !== entryId ||
          asEmail(corrected.user_email) !== asEmail(entry.user_email) ||
          String(corrected.clock_in || '') !== String(entry.clock_in || '') ||
          String(corrected.clock_out || '') !== String(entry.clock_out || '') ||
          Number(corrected.lunch_minutes || 0) !== Number(entry.lunch_minutes || 0) ||
          Number(corrected.total_hours || 0) !== Number(entry.total_hours || 0) ||
          String(corrected.status || '') !== String(entry.status || '') ||
          String(corrected.notes || '') !== String(entry.notes || '')) return false;
    } else if (String(audit.outcome || '') !== 'blocked' || markerMatches) {
      return false;
    }
  }
  // Pending, mismatched, missing, or unproven evidence keeps the coordinator
  // claimed. There is no automatic timeout-based takeover.
  const released = await gateEntity.updateMany(
    { id: gateId, updated_date: gate.updated_date, scope: 'company', status: 'creating',
      request_id: requestId, time_entry_id: entryId, payload_hash: hash, claim_token: token },
    { $set: { status: 'idle', request_id: '', time_entry_id: '',
      payload_hash: '', claim_token: '', started_at: null } },
  );
  if (!released || typeof released.updated !== 'number') throw new Error('Manager-correction coordinator release was not verified.');
  return released.updated === 1;
}

// The same company coordinator also serializes employee-request reviews.
// A review claim is tagged by its correction-request ID, not a TimeEntry ID.
// Release an interrupted claim only when the reviewed request and BOTH audit
// streams prove a completely finalized decision; never expire an uncertain
// review based only on its age.
async function releaseManagerReviewDecisionGate(
  gateEntity: any, auditEntity: any, correctionRequestEntity: any, entryEntity: any,
  gateId: string, requestId: string, correctionRequestId: string, hash: string,
  token: string, allowPrewriteRelease = false,
) {
  const gate = await gateEntity.get(gateId).catch(() => null);
  if (!gate?.id || gate.scope !== 'company' || gate.status !== 'creating' ||
      String(gate.request_id || '') !== requestId ||
      String(gate.time_entry_id || '') !== `review:${correctionRequestId}` ||
      !constantTimeEqual(String(gate.payload_hash || ''), hash) ||
      String(gate.claim_token || '') !== token) return false;
  const request = await correctionRequestEntity.get(correctionRequestId).catch(() => null);
  const reviewAudits = await auditEntity.filter({ action: 'correction_review', request_id: requestId });
  const appliedAudits = await auditEntity.filter({ action: 'admin_correction', request_id: requestId });
  if (!request?.id || !Array.isArray(reviewAudits) || !Array.isArray(appliedAudits) ||
      reviewAudits.length > 1 || appliedAudits.length > 1) return false;

  const status = String(request.status || '');
  const terminal = ['approved', 'approved_modified', 'rejected'].includes(status);
  if (terminal) {
    const audit = reviewAudits[0];
    if (String(request.review_request_id || '') !== requestId ||
        !constantTimeEqual(String(request.review_payload_hash || ''), hash) ||
        !audit?.id || !['confirmed', 'recovered'].includes(String(audit.outcome || '')) ||
        String(audit.time_entry_id || '') !== String(request.time_entry_id || '') ||
        asEmail(audit.user_email) !== asEmail(request.user_email) ||
        String(audit.details?.correction_request_id || '') !== correctionRequestId ||
        !constantTimeEqual(String(audit.details?.review_payload_hash || ''), hash) ||
        String(audit.details?.decision || '') !== status) return false;
    if (status === 'rejected') {
      if (appliedAudits.length !== 0) return false;
    } else {
      const applied = appliedAudits[0];
      const entry = await entryEntity.get(request.time_entry_id).catch(() => null);
      const corrected = applied?.details?.corrected || {};
      if (!applied?.id || !['confirmed', 'recovered'].includes(String(applied.outcome || '')) ||
          String(applied.time_entry_id || '') !== String(request.time_entry_id || '') ||
          asEmail(applied.user_email) !== asEmail(request.user_email) ||
          String(applied.details?.correction_request_id || '') !== correctionRequestId ||
          !constantTimeEqual(String(applied.details?.review_payload_hash || ''), hash) ||
          String(request.applied_audit_id || '') !== String(applied.id || '') ||
          String(audit.details?.applied_audit_id || '') !== String(applied.id || '') ||
          !entry?.id || String(entry.last_correction_request_id || '') !== correctionRequestId ||
          String(entry.status || '') !== 'clocked_out' ||
          String(entry.approval_status || '') !== 'needs_review' ||
          String(corrected.id || '') !== String(entry.id || '') ||
          asEmail(corrected.user_email) !== asEmail(entry.user_email) ||
          String(corrected.clock_in || '') !== String(entry.clock_in || '') ||
          String(corrected.clock_out || '') !== String(entry.clock_out || '') ||
          Number(corrected.lunch_minutes || 0) !== Number(entry.lunch_minutes || 0) ||
          Number(corrected.total_hours || 0) !== Number(entry.total_hours || 0) ||
          String(corrected.status || '') !== String(entry.status || '') ||
          String(corrected.notes || '') !== String(entry.notes || '')) return false;
    }
  } else if (!(allowPrewriteRelease && status === 'pending' &&
      !request.review_request_id && !request.review_payload_hash &&
      reviewAudits.length === 0 && appliedAudits.length === 0)) {
    return false;
  }

  const released = await gateEntity.updateMany(
    { id: gateId, updated_date: gate.updated_date, scope: 'company', status: 'creating',
      request_id: requestId, time_entry_id: `review:${correctionRequestId}`,
      payload_hash: hash, claim_token: token },
    { $set: { status: 'idle', request_id: '', time_entry_id: '',
      payload_hash: '', claim_token: '', started_at: null } },
  );
  if (!released || typeof released.updated !== 'number') throw new Error('Manager-review coordinator release was not verified.');
  return released.updated === 1;
}

async function releasePayPeriodCreateGate(gateEntity: any, id: string, requestId: string, hash: string, token: string) {
  const gate = await gateEntity.get(id);
  if (!gate?.id) return false;
  // A concurrent exact-request retry may already have released the completed
  // gate; never clear a later request's claim.
  if (gate.status === 'idle' || (gate.status === 'creating' && gate.request_id !== requestId)) return true;
  if (gate.status !== 'creating' || gate.request_id !== requestId ||
      !constantTimeEqual(String(gate.payload_hash || ''), hash) || gate.claim_token !== token) return false;
  const released = await gateEntity.updateMany(
    { id, updated_date: gate.updated_date, scope: 'company', status: 'creating',
      request_id: requestId, payload_hash: hash, claim_token: token },
    { $set: { status: 'idle', request_id: '', payload_hash: '', claim_token: '', started_at: null } },
  );
  if (!released || typeof released.updated !== 'number') throw new Error('Pay-period create gate release was not verified.');
  return released.updated === 1;
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
        last_action_at: entry.clock_source === 'employee_attested_missed_clock_in'
          ? (entry.missed_clock_in_reported_at || entry.clock_in)
          : entry.clock_in,
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
            payroll_membership: payrollMembershipEnvelope(entry.clock_in),
            result_clock_in: entry.clock_in,
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
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
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
    const punchExceptionEntity = base44.asServiceRole.entities.TimeClockPunchException;
    const breakEntity = base44.asServiceRole.entities.TimeClockBreak;
    const workPauseEntity = base44.asServiceRole.entities.TimeClockWorkPause;
    const payPeriodEntity = base44.asServiceRole.entities.TimeClockPayPeriod;
    const shiftTemplateEntity = base44.asServiceRole.entities.TimeClockShiftTemplate;
    const payPeriodGateEntity = base44.asServiceRole.entities.TimeClockPayPeriodCreateGate;
    const adminCorrectionGateEntity = base44.asServiceRole.entities.TimeClockAdminCorrectionGate;
    const laborEntity = base44.asServiceRole.entities.TimeClockLaborSegment;
    const workOrderEntity = base44.asServiceRole.entities.WorkOrder;
    const timeOffRequestEntity = base44.asServiceRole.entities.TimeOffRequest;
    const ptoBalanceEntity = base44.asServiceRole.entities.UserPTOBalance;
    const prefsEntity = base44.asServiceRole.entities.TimeClockEmployeePreference;

    if (action === 'monitor_stale_shifts') {
      if (!(await hasStaleShiftMonitorCapability(body))) {
        return Response.json({ success: false, error: 'Verified scheduled Time Clock workflow is required.' }, { status: 403 });
      }
      const summary = await runStaleShiftMonitor({ entryEntity, stateEntity, punchExceptionEntity, auditEntity, ptoBalanceEntity, base44 });
      return Response.json(summary);
    }

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

    // Read-only operational diagnostics must run before ensureState and all
    // clock-state recovery hooks: viewing coordinator health may never mutate
    // payroll, attendance, audit, or employee state.
    if (action === 'admin_correction_gate_diagnostics') {
      if (!actor?.id || actor.role !== 'admin' || String(actor.id).startsWith('badge:')) {
        return Response.json({ success: false, error: 'Administrator session is required for correction coordinator diagnostics.' }, { status: 403 });
      }
      const gates = await adminCorrectionGateEntity.filter({});
      if (!Array.isArray(gates)) throw new Error('Manager-correction coordinator diagnostics could not read its records.');
      if (gates.length !== 1) {
        return Response.json({ success: true, coordinator_state: 'invalid_setup',
          record_count: gates.length, attention: 'Exactly one backend-provisioned company coordinator record is required.',
          read_only: true });
      }
      const gate = gates[0];
      const cleanIdle = gate?.scope === 'company' && gate?.status === 'idle' &&
        !gate.request_id && !gate.time_entry_id && !gate.payload_hash &&
        !gate.claim_token && !gate.started_at;
      if (cleanIdle) {
        return Response.json({ success: true, coordinator_state: 'ready',
          record_count: 1, read_only: true, attention: null });
      }
      if (gate?.scope !== 'company' || gate?.status !== 'creating' ||
          !gate.request_id || !gate.time_entry_id || !gate.payload_hash ||
          !gate.claim_token || !Number.isFinite(Date.parse(String(gate.started_at || '')))) {
        return Response.json({ success: true, coordinator_state: 'invalid_state',
          record_count: 1, read_only: true,
          attention: 'Coordinator has malformed claim or idle metadata. Investigate without clearing it.' });
      }
      const heldReview = String(gate.time_entry_id).startsWith('review:');
      const correctionRequestId = heldReview ? String(gate.time_entry_id).slice('review:'.length) : '';
      const request = heldReview && correctionRequestId
        ? await correctionRequestEntity.get(correctionRequestId).catch(() => null) : null;
      const entryId = heldReview ? String(request?.time_entry_id || '') : String(gate.time_entry_id);
      const entry = entryId ? await entryEntity.get(entryId).catch(() => null) : null;
      const correctionAudits = await auditEntity.filter({ action: 'admin_correction', request_id: gate.request_id });
      const reviewAudits = heldReview
        ? await auditEntity.filter({ action: 'correction_review', request_id: gate.request_id }) : [];
      if (!Array.isArray(correctionAudits) || !Array.isArray(reviewAudits)) {
        throw new Error('Manager-correction coordinator diagnostics could not read authoritative audit evidence.');
      }
      const auditEvidence = (rows: any[]) => ({
        count: rows.length,
        outcomes: rows.map((row: any) => String(row.outcome || 'unknown')),
        ownership_matches: rows.length === 1 && rows.every((row: any) =>
          row?.id && entry?.id && String(row.time_entry_id || '') === String(entry.id) &&
          asEmail(row.user_email) === asEmail(entry.user_email) &&
          (!heldReview || (String(row.details?.correction_request_id || '') === correctionRequestId &&
            constantTimeEqual(String(row.details?.review_payload_hash || ''), String(gate.payload_hash))))
        ),
      });
      const correction = correctionAudits[0] || null;
      const applied = correction?.details?.corrected || {};
      const entrySnapshotMatches = Boolean(entry?.id && correction?.id &&
        String(applied.id || '') === String(entry.id) &&
        asEmail(applied.user_email) === asEmail(entry.user_email) &&
        String(applied.clock_in || '') === String(entry.clock_in || '') &&
        String(applied.clock_out || '') === String(entry.clock_out || '') &&
        Number(applied.lunch_minutes || 0) === Number(entry.lunch_minutes || 0) &&
        Number(applied.total_hours || 0) === Number(entry.total_hours || 0) &&
        String(applied.status || '') === String(entry.status || '') &&
        String(applied.notes || '') === String(entry.notes || ''));
      const correctionEvidence = auditEvidence(correctionAudits);
      const reviewEvidence = auditEvidence(reviewAudits);
      // These flags describe observed evidence only. Never infer a stale lease
      // is safe to release, and never expose claim tokens or payload hashes.
      return Response.json({
        success: true, coordinator_state: 'claimed', read_only: true, record_count: 1,
        claim_kind: heldReview ? 'manager_review' : 'direct_manager_correction',
        request_id: String(gate.request_id), started_at: String(gate.started_at),
        ...(heldReview ? { correction_request_id: correctionRequestId,
          correction_request_status: request?.id ? String(request.status || 'unknown') : 'missing',
          review_request_binding_matches: Boolean(request?.id &&
            String(request.review_request_id || '') === String(gate.request_id) &&
            constantTimeEqual(String(request.review_payload_hash || ''), String(gate.payload_hash))),
        } : {}),
        time_entry_id: entryId || null, entry_found: Boolean(entry?.id),
        entry_request_marker_matches: Boolean(entry?.id &&
          String(entry.last_correction_request_id || '') ===
            (heldReview ? correctionRequestId : String(gate.request_id))),
        applied_entry_snapshot_matches: entrySnapshotMatches,
        correction_audit: correctionEvidence,
        ...(heldReview ? { review_audit: reviewEvidence } : {}),
        attention: 'A company correction claim is held. Inspect the request, audits, TimeEntry and employee state; never clear or time out the coordinator without authoritative reconciliation.',
      });
    }

    // status_lite is strictly read-only and returns only steady states. It must
    // run before ensureState and every recover* hook, for the same reason as the
    // diagnostics block above. Anything the full status action would recover or
    // reject comes back as requires_full_status and the caller retries 'status'.
    if (action === 'status_lite') {
      const liteResult = await buildStatusLite({
        stateEntity, entryEntity, breakEntity, workPauseEntity, target,
        helpers: {
          publicEmployee, breakStatusOf, workPauseStatusOf, laborStatusOf,
          breakSummaryForEntry, workPauseSummaryForEntry, dateKeyInCompanyTime,
          MISSED_PUNCH_PROMPT_MS, MISSED_PUNCH_REPROMPT_MS, asEmail,
        },
      });
      return Response.json(liteResult);
    }

    if (action === 'admin_load_data') {
      if (actor.role !== 'admin' || String(actor.id).startsWith('badge:')) {
        return Response.json({ success: false, error: 'Administrator session is required to load Time Clock review data.' }, { status: 403 });
      }
      const collection = String(body?.collection || '').trim();
      const skip = Number(body?.skip ?? 0);
      const pageSize = 100;
      if (!Number.isSafeInteger(skip) || skip < 0 || skip >= 50_000) {
        return Response.json({ success: false, error: 'Time Clock admin data page is outside the supported range.' }, { status: 400 });
      }
      const collections: Record<string, { entity: any; query: any; sort: string | null; label: string }> = {
        entries: { entity: entryEntity, query: { archived_test_data: { $ne: true }, archived_admin: { $ne: true } }, sort: '-clock_in', label: 'Time Clock admin entries' },
        states: { entity: stateEntity, query: {}, sort: null, label: 'Time Clock employee states' },
        breaks: { entity: breakEntity, query: { status: 'active' }, sort: '-started_at', label: 'Time Clock active breaks' },
        work_pauses: { entity: workPauseEntity, query: { status: 'active' }, sort: '-started_at', label: 'Time Clock active Work Pauses' },
        labor_segments: { entity: laborEntity, query: { status: 'active' }, sort: '-started_at', label: 'Time Clock active labor segments' },
        correction_requests: { entity: correctionRequestEntity, query: { status: { $in: ['pending', 'reviewing'] } }, sort: '-requested_at', label: 'Time Clock active correction requests' },
        punch_exceptions: { entity: punchExceptionEntity, query: {}, sort: '-detected_at', label: 'Time Clock punch exception reports' },
      };
      const selected = collections[collection];
      if (!selected) return Response.json({ success: false, error: 'Unknown Time Clock admin data collection.' }, { status: 400 });
      const rows = await selected.entity.filter(selected.query, selected.sort, pageSize, skip);
      if (!Array.isArray(rows)) throw new Error(`${selected.label} could not be verified completely.`);
      return Response.json({
        success: true,
        rows,
        next_skip: skip + rows.length,
        has_more: rows.length === pageSize,
      });
    }

    let state = await ensureState(stateEntity, target);
    state = await recoverTransition({ stateEntity, entryEntity, auditEntity, laborEntity, state, target, actor });
    state = await recoverBreakTransition({ stateEntity, breakEntity, auditEntity, state, target, actor });
    state = await recoverWorkPauseTransition({ stateEntity, workPauseEntity, auditEntity, state, target, actor });
    state = await recoverLaborTransition({ stateEntity, laborEntity, auditEntity, state, target, actor });
    state = await recoverCompletedClockInMutationGate(stateEntity, entryEntity, auditEntity, state, target);

    if (action === 'time_tracker_snapshot' || action === 'time_tracker_prefs_get') {
      // Read-only Time Tracker snapshot + preferences. Never mutates clock
      // state; sessions read their own row and admins may read a target.
      const prefRows = await prefsEntity.filter({ user_email: target.email });
      if (!Array.isArray(prefRows)) throw new Error('Time Tracker preference lookup did not return a record list.');
      if (prefRows.length > 1) return Response.json({ success: false, error: 'Time Tracker preferences are ambiguous. Admin review is required.' }, { status: 409 });
      const prefs = normalizeTrackerPrefs(prefRows[0] || null, target);
      const serverNow = new Date();
      const nowMs = serverNow.getTime();
      const employmentType = String(target.employment_type || 'hourly');

      if (action === 'time_tracker_prefs_get') {
        return Response.json({ success: true, prefs, employment_type: employmentType, server_time: serverNow.toISOString() });
      }

      const clockedIn = state.status === 'clocked_in' && !!state.active_entry_id;
      let entry: any = null;
      if (clockedIn) {
        entry = await entryEntity.get(state.active_entry_id).catch(() => null);
        if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
          return Response.json({ success: false, error: 'Stored clock state does not match the active TimeEntry. Admin review is required.' }, { status: 409 });
        }
      }

      let liveUnpaidMinutes = 0;
      let onUnpaidBreakNow = false;
      let pausedNow = false;
      if (entry) {
        const activeBreak = state.active_break_id ? await breakEntity.get(state.active_break_id).catch(() => null) : null;
        const safeActiveBreak = activeBreak?.id && activeBreak.status === 'active' && asEmail(activeBreak.user_email) === target.email && activeBreak.time_entry_id === entry.id ? activeBreak : null;
        const activePause = state.active_work_pause_id ? await workPauseEntity.get(state.active_work_pause_id).catch(() => null) : null;
        const safeActivePause = activePause?.id && activePause.status === 'active' && asEmail(activePause.user_email) === target.email && activePause.time_entry_id === entry.id ? activePause : null;
        if (safeActiveBreak && safeActiveBreak.is_paid !== true) {
          onUnpaidBreakNow = true;
          liveUnpaidMinutes += Math.max(0, (nowMs - new Date(safeActiveBreak.started_at).getTime()) / 60000);
        }
        if (safeActivePause) {
          pausedNow = true;
          liveUnpaidMinutes += Math.max(0, (nowMs - new Date(safeActivePause.started_at).getTime()) / 60000);
        }
      }

      let elapsedToday = 0;
      let paidToday = 0;
      let breakMinutes = 0;
      let paidBreakMinutes = 0;
      let pauseMinutes = 0;
      if (entry) {
        const breakSummary = await breakSummaryForEntry(breakEntity, entry.id, target.email);
        const pauseSummary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
        breakMinutes = Math.max(0, Number(breakSummary?.total_minutes || 0));
        paidBreakMinutes = Math.max(0, Number(breakSummary?.paid_minutes || 0));
        pauseMinutes = Math.max(0, Number(pauseSummary?.total_minutes || 0));
        const startMs = new Date(String(entry.clock_in || '')).getTime();
        elapsedToday = Number.isFinite(startMs) ? Math.max(0, (nowMs - startMs) / 60000) : 0;
        paidToday = Math.max(0, elapsedToday
          - Math.max(0, Number(breakSummary?.unpaid_minutes || 0))
          - pauseMinutes
          - liveUnpaidMinutes
          - Math.max(0, Number(entry.lunch_minutes || 0)));
      }

      const weekStartKey = companyWeekStartKey(serverNow.toISOString());
      const todayKey = dateKeyInCompanyTime(serverNow.toISOString());
      const monthKey = todayKey ? todayKey.slice(0, 7) : '';
      const weeklyDaily = [0, 0, 0, 0, 0, 0, 0];
      let weeklyPaid = 0;
      let monthlyPaid = 0;
      let lastClockOutMs = 0;
      const workedDayKeys = new Set<string>();
      if (weekStartKey) {
        const recent = await entryEntity.filter({ user_email: target.email }, '-clock_in', 90);
        if (!Array.isArray(recent)) throw new Error('Time Tracker weekly entry lookup did not return a record list.');
        for (const row of recent) {
          if (!row?.id || row.archived_test_data || row.archived_admin) continue;
          const dayKey = dateKeyInCompanyTime(row.clock_in);
          if (!dayKey) continue;
          if (dayKey < todayKey) workedDayKeys.add(dayKey);
          if (dayKey === todayKey && todayKey) workedDayKeys.add(todayKey);
          const outMs = row.clock_out ? new Date(String(row.clock_out)).getTime() : 0;
          if (Number.isFinite(outMs) && outMs > lastClockOutMs && outMs < nowMs) lastClockOutMs = outMs;
          const paid = row.id === entry?.id
            ? paidToday
            : await trackerPaidMinutesForEntry({ entry: row, breakEntity, workPauseEntity, userEmail: target.email, nowMs });
          if (monthKey && dayKey.startsWith(monthKey)) monthlyPaid += paid;
          if (dayKey < weekStartKey) continue;
          const dayIndex = (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
          weeklyDaily[dayIndex] += paid;
          weeklyPaid += paid;
        }
      }
      // Consecutive worked days ending today, and hours since the last punch out.
      let consecutiveDays = 0;
      if (todayKey) {
        let cursor = todayKey;
        while (workedDayKeys.has(cursor)) {
          consecutiveDays += 1;
          const d = new Date(`${cursor}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() - 1);
          cursor = d.toISOString().slice(0, 10);
        }
      }
      const restHours = lastClockOutMs > 0 ? (nowMs - lastClockOutMs) / 3600000 : null;

      // Upcoming approved time off and the pay period covering today.
      let nextTimeoff: any = null;
      if (todayKey) {
        const offRows = await timeOffRequestEntity.filter({ user_email: target.email, status: 'approved' }).catch(() => []);
        if (Array.isArray(offRows)) {
          const upcoming = offRows
            .filter((r: any) => String(r?.end_date || '') >= todayKey || String(r?.start_date || '') >= todayKey)
            .sort((a: any, b: any) => String(a.start_date).localeCompare(String(b.start_date)))[0];
          if (upcoming) nextTimeoff = { start_date: upcoming.start_date, end_date: upcoming.end_date, type: upcoming.request_type || upcoming.type || 'time off' };
        }
      }
      let payPeriod: any = null;
      if (todayKey) {
        const periods = await payPeriodEntity.filter({}).catch(() => []);
        if (Array.isArray(periods)) {
          const current = periods.find((p: any) => p && !p.archived_test_data && String(p.start_date || '') <= todayKey && String(p.end_date || '') >= todayKey);
          if (current) payPeriod = { label: current.label || 'Pay period', start_date: current.start_date, end_date: current.end_date, status: current.status };
        }
      }

      // Today's scheduled shift template (for variance/early-punch notices).
      let todaysSchedule: any = null;
      if (todayKey) {
        const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${todayKey}T12:00:00Z`).getUTCDay()];
        const templates = await shiftTemplateEntity.filter({ user_email: target.email, archived_admin: { $ne: true }, active: true }).catch(() => []);
        if (Array.isArray(templates)) {
          const match = templates.find((t: any) => Array.isArray(t.days) && t.days.includes(weekday) && t.start_time);
          if (match) todaysSchedule = { label: match.label || '', start_time: match.start_time, end_time: match.end_time || '', break_minutes: Number(match.break_minutes || 0) };
        }
      }

      // Privacy-safe team presence: a count only, never names.
      const inNow = await stateEntity.filter({ status: 'clocked_in', archived_test_data: { $ne: true } }).catch(() => []);
      const teamCount = Array.isArray(inNow) ? inNow.filter((s: any) => s?.user_email && s.user_email !== target.email).length : 0;

      let ptoBalance: any = null;
      const ptoRows = await ptoBalanceEntity.filter({ user_email: target.email }).catch(() => []);
      if (Array.isArray(ptoRows) && ptoRows[0]) {
        const r: any = ptoRows[0];
        ptoBalance = {
          available_minutes: Number(r.available_minutes ?? r.balance_minutes ?? 0),
          accrued_minutes: Number(r.accrued_minutes ?? 0),
          pending_minutes: Number(r.pending_minutes ?? 0),
        };
      }

      return Response.json({
        success: true,
        server_time: serverNow.toISOString(),
        employment_type: employmentType,
        status: clockedIn ? 'clocked_in' : 'clocked_out',
        clock_in: entry?.clock_in || null,
        paid_minutes_today: paidToday,
        elapsed_minutes_today: elapsedToday,
        break_minutes: breakMinutes,
        paid_break_minutes: paidBreakMinutes,
        pause_minutes: pauseMinutes,
        live_unpaid_minutes: liveUnpaidMinutes,
        on_unpaid_break_now: onUnpaidBreakNow,
        paused_now: pausedNow,
        accruing_paid: Boolean(entry) && !onUnpaidBreakNow && !pausedNow,
        weekly_paid_minutes: weeklyPaid,
        weekly_daily_minutes: weeklyDaily,
        monthly_paid_minutes: monthlyPaid,
        consecutive_worked_days: consecutiveDays,
        last_clock_out: lastClockOutMs > 0 ? new Date(lastClockOutMs).toISOString() : null,
        rest_hours_since_last_shift: restHours,
        pto_balance: ptoBalance,
        next_timeoff: nextTimeoff,
        pay_period: payPeriod,
        todays_schedule: todaysSchedule,
        team_clocked_in_count: teamCount,
        company_day: dateKeyInCompanyTime(serverNow.toISOString()),
        prefs,
      });
    }

    if (action === 'time_tracker_prefs_update') {
      if (!requestId) {
        return Response.json({ success: false, error: 'A request_id is required to update Time Tracker preferences.' }, { status: 400 });
      }
      if (String(actor.id).startsWith('badge:') || (actor.role !== 'admin' && actorEmail !== target.email)) {
        return Response.json({ success: false, error: 'A signed-in session can only update its own Time Tracker preferences.' }, { status: 403 });
      }
      const isSalary = String(target.employment_type || '') === 'salary';
      if (!isSalary && body?.prefs?.tracker_enabled === true) {
        return Response.json({ success: false, error: 'The Time Tracker is available to salary employees.' }, { status: 403 });
      }
      const requested = body?.prefs && typeof body.prefs === 'object' ? body.prefs : {};
      const prefRows = await prefsEntity.filter({ user_email: target.email });
      if (!Array.isArray(prefRows)) throw new Error('Time Tracker preference lookup did not return a record list.');
      if (prefRows.length > 1) return Response.json({ success: false, error: 'Time Tracker preferences are ambiguous. Admin review is required.' }, { status: 409 });
      const existing = prefRows[0] || null;
      if (existing && String(existing.last_request_id || '') === requestId) {
        return Response.json({ success: true, reused: true, prefs: normalizeTrackerPrefs(existing, target) });
      }
      const merged: any = { ...normalizeTrackerPrefs(existing, target) };
      for (const key of TRACKER_EDITABLE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(requested, key)) merged[key] = requested[key];
      }
      const normalized = normalizeTrackerPrefs(merged, target);
      if (!isSalary) normalized.tracker_enabled = false;
      const write = { ...normalized, user_email: target.email, user_name: target.full_name || target.email, last_request_id: requestId };
      if (existing?.id) {
        const updated = await prefsEntity.updateMany(
          { id: existing.id, updated_date: existing.updated_date },
          { $set: write },
        );
        if (!updated || updated.updated !== 1) {
          const fresh = await prefsEntity.get(existing.id).catch(() => null);
          if (String(fresh?.last_request_id || '') === requestId) {
            return Response.json({ success: true, reused: true, prefs: normalizeTrackerPrefs(fresh, target) });
          }
          return Response.json({ success: false, retry_same_request: true, error: 'Time Tracker preferences changed while saving. Reload and try again.' }, { status: 409 });
        }
        const fresh = await prefsEntity.get(existing.id);
        return Response.json({ success: true, prefs: normalizeTrackerPrefs(fresh, target) });
      }
      await prefsEntity.create(write);
      const verify = await prefsEntity.filter({ user_email: target.email });
      const row = Array.isArray(verify) && verify.length === 1 ? verify[0] : null;
      if (!row?.id || String(row.last_request_id || '') !== requestId) {
        return Response.json({ success: false, retry_same_request: true, error: 'Time Tracker preferences were saved but could not be verified. Retry the same request.' }, { status: 409 });
      }
      return Response.json({ success: true, prefs: normalizeTrackerPrefs(row, target) });
    }


    if (action === 'status') {
      const isManagerSession = actor.role === 'admin';
      const unresolvedPunchReview = isManagerSession ? await unresolvedPunchReviewSummary({
        entryEntity, correctionRequestEntity, punchExceptionEntity, userEmail: target.email,
      }) : null;
      const correctedShiftReview = isManagerSession ? await correctedShiftReviewSummary({
        entryEntity, correctionRequestEntity, punchExceptionEntity, auditEntity, userEmail: target.email,
      }) : null;
      const reviewNoticeFields = {
        ...(unresolvedPunchReview ? { unresolved_punch_review: unresolvedPunchReview } : {}),
        ...(correctedShiftReview ? { pending_shift_review: correctedShiftReview } : {}),
      };
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
            ...reviewNoticeFields,
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
        const serverNow = new Date();
        const clockInMs = new Date(entry.clock_in).getTime();
        const acknowledgedMs = new Date(String(entry.stale_shift_acknowledged_at || '')).getTime();
        const crossedCompanyDate = dateKeyInCompanyTime(entry.clock_in) !== dateKeyInCompanyTime(serverNow.toISOString());
        const acknowledgementFresh = Number.isFinite(acknowledgedMs) && (serverNow.getTime() - acknowledgedMs) < MISSED_PUNCH_REPROMPT_MS;
        const requiresPunchResolution = Number.isFinite(clockInMs) && crossedCompanyDate &&
          (serverNow.getTime() - clockInMs) >= MISSED_PUNCH_PROMPT_MS && !acknowledgementFresh;
        if (requiresPunchResolution) {
          const selfServiceBlockedReason = currentBreakStatus !== 'working' || state.active_break_id
            ? 'An active break is still attached to the old shift. A manager must review it before self-service missed clock-out recovery.'
            : currentWorkPauseStatus !== 'working' || state.active_work_pause_id
              ? 'Work Pause is still active on the old shift. A manager must review it before self-service missed clock-out recovery.'
              : activeLabor?.id
                ? 'Current Work is still active on the old shift. A manager must review it before self-service missed clock-out recovery.'
                : '';
          return Response.json({
            success: true, status: 'clocked_in', entry, user: publicEmployee(target),
            ...reviewNoticeFields,
            requires_punch_resolution: true,
            punch_resolution: {
              type: 'missed_clock_out',
              time_entry_id: entry.id,
              clock_in: entry.clock_in,
              detected_at: serverNow.toISOString(),
              self_service_blocked: Boolean(selfServiceBlockedReason),
              self_service_blocked_reason: selfServiceBlockedReason,
            },
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
        return Response.json({
          success: true, status: 'clocked_in', entry, user: publicEmployee(target),
          ...reviewNoticeFields,
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
      if (state.status === 'clocked_out') {
        const serverNow = new Date();
        const companyMinutes = minutesOfDayInCompanyTime(serverNow.toISOString());
        const lateClockAction = body?.clock_action_intent === true && Number.isInteger(companyMinutes) && companyMinutes >= 15 * 60;
        return Response.json({
          success: true, status: 'clocked_out', entry: null, user: publicEmployee(target),
          ...reviewNoticeFields,
          ...(lateClockAction ? {
            requires_late_clock_in_review: true,
            late_clock_in_review: {
              type: 'late_clock_in',
              cutoff_local_time: '15:00',
              company_date: dateKeyInCompanyTime(serverNow.toISOString()),
              detected_at: serverNow.toISOString(),
            },
          } : {}),
          break_status: 'working', active_break: null, break_summary: { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
          work_pause_allowed: target.can_work_pause === true,
          employment_type: target.employment_type || 'hourly',
          work_pause_status: 'working', active_work_pause: null, work_pause_summary: { count: 0, total_minutes: 0 },
          active_labor: null, labor_summary: { count: 0, total_minutes: 0 },
        });
      }
      if (['clocking_in', 'clocking_out'].includes(state.status)) {
        return Response.json({
          success: true,
          status: state.status,
          ...reviewNoticeFields,
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
      const createGate = await acquirePayPeriodCreateGate(
        payPeriodGateEntity, auditEntity, payPeriodEntity, requestId, createPayloadHash,
      );
      if (!createGate.acquired) return Response.json({ success: false, retry_same_request: !!createGate.retry_same_request,
        error: createGate.error }, { status: 409 });
      // An uncertain create must retain the gate until the same request recovers
      // its persisted period and confirms the audit. Never unlock in that case.
      let retainCreateGate = false;
      try {
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
        const finalDetails = finalAudit?.details || {};
        if (!finalAudit || !['confirmed', 'recovered'].includes(String(finalAudit.outcome || '')) ||
            finalDetails.pay_period_id !== period.id || finalDetails.label !== period.label ||
            finalDetails.start_date !== period.start_date || finalDetails.end_date !== period.end_date ||
            (finalDetails.payload_hash && !constantTimeEqual(String(finalDetails.payload_hash), createPayloadHash))) {
          return Response.json({ success: false, retry_same_request: true, error: 'The pay period exists but its create audit does not confirm the exact period. Admin investigation is required.' }, { status: 409 });
        }
        return Response.json({ success: true, period, audit_id: createIntent.id, reused: true });
      }
      if (createIntent?.outcome === 'confirmed' || createIntent?.outcome === 'recovered') {
        return Response.json({ success: false, error: 'This pay-period create audit is confirmed but the matching period request marker is missing. Admin investigation is required.' }, { status: 409 });
      }

      const existingPeriods = await payPeriodEntity.filter({});
      if (!Array.isArray(existingPeriods)) throw new Error('Pay period lookup did not return a record list.');
      // A malformed historical period cannot safely be ruled out of overlap.
      // Preserve it for administrative review instead of creating ambiguity.
      const invalidExistingPeriod = existingPeriods.find((period: any) => {
        const existingStart = validDateKey(period.start_date);
        const existingEnd = validDateKey(period.end_date);
        return !existingStart || !existingEnd || existingStart > existingEnd;
      });
      if (invalidExistingPeriod) {
        if (createIntent?.id && createIntent.outcome === 'pending') {
          await auditEntity.updateMany(
            { id: createIntent.id, outcome: 'pending', request_id: requestId },
            { $set: { outcome: 'blocked' } },
          );
        }
        return Response.json({
          success: false,
          error: 'An existing pay period has invalid date boundaries. Admin review is required before another period can be created.',
        }, { status: 409 });
      }
      const overlap = existingPeriods.find((period: any) =>
        !(endDate < period.start_date || startDate > period.end_date),
      );
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

      retainCreateGate = true; // The create response itself may be interrupted after persistence.
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
      retainCreateGate = false; // Created period and confirmed audit have both been verified.
      return Response.json({ success: true, period, audit_id: createIntent.id });
      } finally {
        if (!retainCreateGate) {
          const released = await releasePayPeriodCreateGate(
            payPeriodGateEntity, createGate.id, requestId, createPayloadHash, createGate.token,
          );
          if (!released) throw new Error('Pay-period create gate release could not be verified. Retry the same request or request admin investigation.');
        }
      }
    }

    if (action === 'pay_period_history_verify') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Administrator access is required to verify payroll history.' }, { status: 403 });
      const payPeriodId = String(body.pay_period_id || '').trim();
      if (!payPeriodId) return Response.json({ success: false, error: 'Pay period is required.' }, { status: 400 });
      const period = await payPeriodEntity.get(payPeriodId).catch(() => null);
      if (!period) return Response.json({ success: false, error: 'Pay period was not found.' }, { status: 404 });
      const history = Array.isArray(period.finalized_summary_history) ? period.finalized_summary_history : [];
      const verifySummary = async (summary: any, prefix: any[], label: string) => {
        if (!summary || typeof summary !== 'object' || Number(summary.snapshot_version || 0) < 2) return { verified: false, legacy: true, error: `${label} predates tamper-evident payroll history verification.` };
        const prefixHash = await payloadHash(prefix);
        const chainCore: any = {
          entry_count: summary.entry_count, employee_count: summary.employee_count, total_hours: summary.total_hours,
          lock_timestamp: summary.lock_timestamp, locked_by: summary.locked_by, request_id: summary.request_id,
          snapshot_version: summary.snapshot_version, entry_snapshot_hash: summary.entry_snapshot_hash,
          previous_history_hash: summary.previous_history_hash,
        };
        if (Number(summary.snapshot_version || 0) >= 3) chainCore.shift_manifest_hash = summary.shift_manifest_hash;
        if (Number(summary.snapshot_version || 0) >= 7) {
          chainCore.approving_managers = Array.isArray(summary.approving_managers) ? summary.approving_managers : [];
          chainCore.finalizer_approval_overlap = summary.finalizer_approval_overlap === true;
        }
        if (Number(summary.snapshot_version || 0) >= 8) {
          chainCore.supersedes_generation_request_id = String(summary.supersedes_generation_request_id || '');
          chainCore.authorized_by_reopen_request_id = String(summary.authorized_by_reopen_request_id || '');
        }
        if (Number(summary.snapshot_version || 0) >= 9) {
          chainCore.generation_changes_hash = String(summary.generation_changes_hash || '');
          chainCore.generation_change_count = Number(summary.generation_change_count || 0);
          chainCore.generation_reopen_reason = String(summary.generation_reopen_reason || '');
        }
        if (Number(summary.snapshot_version || 0) >= 12) {
          chainCore.generation_causal_window_start = String(summary.generation_causal_window_start || '');
          chainCore.generation_causal_window_end = String(summary.generation_causal_window_end || '');
        }
        if (Number(summary.snapshot_version || 0) >= 17) {
          chainCore.generation_audit_reconciliation_hash = String(summary.generation_audit_reconciliation_hash || '');
          chainCore.generation_audit_reconciliation_count = Number(summary.generation_audit_reconciliation_count || 0);
        }
        if (Number(summary.snapshot_version || 0) >= 21) {
          chainCore.generation_membership_discovery_hash = String(summary.generation_membership_discovery_hash || '');
          chainCore.generation_membership_discovery_count = Number(summary.generation_membership_discovery_count || 0);
        }
        const chainHash = await payloadHash(chainCore);
        if (!constantTimeEqual(String(summary.previous_history_hash || ''), prefixHash) || !constantTimeEqual(String(summary.snapshot_chain_hash || ''), chainHash)) return { verified: false, legacy: false, error: `${label} failed payroll history chain verification.` };
        if (Number(summary.snapshot_version || 0) >= 28 &&
            !await payrollCorrectionRequestIdentityIsUnique(auditEntity, summary.shift_manifest, String(summary.lock_timestamp || ''))) {
          return { verified: false, legacy: false, error: `${label} contains duplicate or conflicting confirmed manager-correction request identity.` };
        }
        return { verified: true, legacy: false };
      };
      const reconcileShiftEvidence = (shifts: any[], summary: any) => {
        const groups: any = {};
        let shiftCount = 0;
        let totalHours = 0;
        for (const shift of shifts) {
          const userEmail = asEmail(shift?.user_email) || 'unassigned';
          const hours = Number(shift?.total_hours || 0);
          if (!Number.isFinite(hours)) return { verified: false };
          shiftCount += 1;
          totalHours += hours;
          if (!groups[userEmail]) groups[userEmail] = { user_email: userEmail, shift_count: 0, total_hours: 0, approved_shift_count: 0, approval_evidence_count: 0 };
          groups[userEmail].shift_count += 1;
          groups[userEmail].total_hours += hours;
          if (shift?.approval_status === 'approved') groups[userEmail].approved_shift_count += 1;
          const requestId = String(shift?.approval_request_id || '');
          const evidence = shift?.approval_evidence;
          const provenanceComplete = Number(summary?.snapshot_version || 0) < 4 || (asEmail(evidence?.approved_by) && String(evidence?.approved_at || ''));
          const authorityComplete = Number(summary?.snapshot_version || 0) < 5 || (String(evidence?.approver_role || '') === 'admin' && ['session', 'admin_kiosk'].includes(String(evidence?.authentication_method || '')));
          const independentComplete = Number(summary?.snapshot_version || 0) < 6 || (evidence?.independent_review === true && asEmail(evidence?.approved_by) !== userEmail);
          if (requestId && evidence && String(evidence.request_id || '') === requestId && ['confirmed', 'recovered'].includes(String(evidence.outcome || '')) && provenanceComplete && authorityComplete && independentComplete) groups[userEmail].approval_evidence_count += 1;
        }
        const employees = Object.values(groups).sort((a: any, b: any) => a.user_email.localeCompare(b.user_email));
        const approvalComplete = employees.every((employee: any) => employee.approved_shift_count === employee.shift_count && employee.approval_evidence_count === employee.shift_count);
        const verified = shiftCount === Number(summary.entry_count || 0) && employees.length === Number(summary.employee_count || 0) && Math.abs(totalHours - Number(summary.total_hours || 0)) < 0.005 && approvalComplete;
        return { verified, approval_complete: approvalComplete, shift_count: shiftCount, employee_count: employees.length, total_hours: totalHours, employees };
      };
      const verifyCorrectionProvenance = async (change: any, windowStart = '', windowEnd = '', snapshotVersion = 0) => {
        const provenance = change?.correction_provenance;
        if (!provenance) return true;
        const strictV24 = Number(snapshotVersion || 0) >= 24;
        const strictV25 = Number(snapshotVersion || 0) >= 25;
        const strictV26 = Number(snapshotVersion || 0) >= 26;
        const strictV28 = Number(snapshotVersion || 0) >= 28;
        const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(provenance, key);
        const v24RequiredFields = [
          'correction_request_id', 'submission_request_id', 'requested_by', 'requested_at', 'employee_reason',
          'requested_clock_in', 'requested_clock_out', 'requested_lunch_minutes', 'requested_notes',
          'review_request_id', 'review_decision', 'reviewed_by', 'reviewed_at', 'reviewer_reason',
          'applied_audit_id', 'applied_audit_request_id', 'applied_at',
          'corrected_clock_in', 'corrected_clock_out', 'corrected_lunch_minutes', 'corrected_notes', 'corrected_total_hours',
        ];
        const v24ShapeComplete = !strictV24 || (
          v24RequiredFields.every(hasOwn) &&
          String(provenance.correction_request_id || '') && String(provenance.submission_request_id || '') &&
          asEmail(provenance.requested_by) && String(provenance.requested_at || '') &&
          String(provenance.review_request_id || '') && ['approve', 'approve_modified'].includes(String(provenance.review_decision || '')) &&
          asEmail(provenance.reviewed_by) && String(provenance.reviewed_at || '') &&
          String(provenance.applied_audit_id || '') && String(provenance.applied_audit_request_id || '') && String(provenance.applied_at || '') &&
          String(provenance.corrected_clock_in || '') && String(provenance.corrected_clock_out || '')
        );
        if (!v24ShapeComplete) return false;
        const v25RequiredFields = [
          'submission_audit_id', 'submission_audit_outcome', 'submission_audit_at',
          'submission_actor_role', 'submission_authentication_method', 'submission_payload_hash',
        ];
        const v25ShapeComplete = !strictV25 || (
          v25RequiredFields.every(hasOwn) &&
          String(provenance.submission_audit_id || '') &&
          ['confirmed', 'recovered'].includes(String(provenance.submission_audit_outcome || '')) &&
          String(provenance.submission_audit_at || '') && String(provenance.submission_actor_role || '') &&
          ['session', 'badge'].includes(String(provenance.submission_authentication_method || '')) &&
          (String(provenance.submission_actor_role || '') === 'badge') === (String(provenance.submission_authentication_method || '') === 'badge') &&
          String(provenance.submission_payload_hash || '')
        );
        if (!v25ShapeComplete) return false;
        const v26RequestKind = String(provenance.request_kind || '');
        if (strictV26 && !['standard', 'missed_clock_out'].includes(v26RequestKind)) return false;
        const v26PunchRequiredFields = [
          'punch_exception_id', 'punch_case_key', 'punch_exception_status', 'punch_employee_response',
          'punch_claimed_clock_out', 'punch_resolution_audit_id', 'punch_response_audit_id',
          'punch_response_audit_outcome', 'punch_response_audit_at', 'punch_response_actor_role',
          'punch_response_authentication_method', 'punch_response_payload_hash', 'punch_original_snapshot_hash',
        ];
        if (strictV26 && v26RequestKind === 'missed_clock_out' && !(
          v26PunchRequiredFields.every(hasOwn) && String(provenance.punch_exception_id || '') &&
          String(provenance.punch_case_key || '') && String(provenance.punch_exception_status || '') === 'resolved' &&
          String(provenance.punch_employee_response || '') === 'missed_clock_out' && String(provenance.punch_claimed_clock_out || '') &&
          String(provenance.punch_resolution_audit_id || '') && String(provenance.punch_response_audit_id || '') &&
          ['confirmed', 'recovered'].includes(String(provenance.punch_response_audit_outcome || '')) &&
          String(provenance.punch_response_audit_at || '') && String(provenance.punch_response_actor_role || '') &&
          ['session', 'badge'].includes(String(provenance.punch_response_authentication_method || '')) &&
          (String(provenance.punch_response_actor_role || '') === 'badge') === (String(provenance.punch_response_authentication_method || '') === 'badge') &&
          String(provenance.punch_response_payload_hash || '') && String(provenance.punch_original_snapshot_hash || '')
        )) return false;
        const correction = await correctionRequestEntity.get(String(provenance.correction_request_id || '')).catch(() => null);
        const appliedAudit = provenance.applied_audit_id ? await auditEntity.get(provenance.applied_audit_id).catch(() => null) : null;
        const reviewAudits = strictV24 ? await auditEntity.filter({
          action: 'correction_review',
          request_id: String(provenance.review_request_id || ''),
          time_entry_id: String(change.time_entry_id || ''),
        }).catch(() => null) : null;
        const reviewAudit = Array.isArray(reviewAudits) && reviewAudits.length === 1 ? reviewAudits[0] : null;
        const submissionAudits = strictV25 ? await auditEntity.filter({
          action: 'correction_request',
          request_id: String(provenance.submission_request_id || ''),
          time_entry_id: String(change.time_entry_id || ''),
        }).catch(() => null) : null;
        const submissionAudit = Array.isArray(submissionAudits) && submissionAudits.length === 1 ? submissionAudits[0] : null;
        const punchCase = strictV26 && v26RequestKind === 'missed_clock_out'
          ? await punchExceptionEntity.get(String(provenance.punch_exception_id || '')).catch(() => null)
          : null;
        const punchResponseAudits = strictV26 && v26RequestKind === 'missed_clock_out' ? await auditEntity.filter({
          action: 'punch_exception',
          request_id: String(provenance.submission_request_id || ''),
          time_entry_id: String(change.time_entry_id || ''),
        }).catch(() => null) : null;
        const punchResponseAudit = Array.isArray(punchResponseAudits) && punchResponseAudits.length === 1 ? punchResponseAudits[0] : null;
        const requested = correction?.requested_changes || {};
        const original = appliedAudit?.details?.original || {};
        const corrected = appliedAudit?.details?.corrected || {};
        const requestedMatches = strictV24 || hasOwn('requested_clock_in') ? (
          String(requested.clock_in || '') === String(provenance.requested_clock_in || '') &&
          String(requested.clock_out || '') === String(provenance.requested_clock_out || '') &&
          Number(requested.lunch_minutes || 0) === Number(provenance.requested_lunch_minutes || 0) &&
          String(requested.notes || '') === String(provenance.requested_notes || '')
        ) : true;
        const appliedMatches = strictV24 || provenance.corrected_clock_in ? (
          String(corrected.clock_in || '') === String(provenance.corrected_clock_in || '') &&
          String(corrected.clock_out || '') === String(provenance.corrected_clock_out || '') &&
          Number(corrected.lunch_minutes || 0) === Number(provenance.corrected_lunch_minutes || 0) &&
          String(corrected.notes || '') === String(provenance.corrected_notes || '') &&
          Number(corrected.total_hours || 0) === Number(provenance.corrected_total_hours || 0)
        ) : true;
        const submissionVersion = correction ? String(
          String(correction.request_kind || '') === 'missed_clock_out'
            ? correction.time_entry_updated_date || ''
            : correction.original_snapshot?.updated_date || correction.time_entry_updated_date || ''
        ) : '';
        const expectedSubmissionHash = correction && submissionVersion ? await payloadHash({
          entry_id: correction.time_entry_id,
          expected_updated_date: submissionVersion,
          reason: correction.employee_reason,
          requested_changes: requested,
        }) : '';
        const submissionAuditTime = Date.parse(String(submissionAudit?.server_timestamp || ''));
        const requestedAtTime = Date.parse(String(correction?.requested_at || ''));
        const reviewedAtTime = Date.parse(String(correction?.reviewed_at || ''));
        const v25SubmissionAuditMatches = !strictV25 || Boolean(correction && submissionAudit && expectedSubmissionHash &&
          String(submissionAudit.id || '') === String(provenance.submission_audit_id || '') &&
          ['confirmed', 'recovered'].includes(String(submissionAudit.outcome || '')) &&
          String(submissionAudit.outcome || '') === String(provenance.submission_audit_outcome || '') &&
          asEmail(submissionAudit.user_email) === asEmail(provenance.requested_by) &&
          asEmail(submissionAudit.actor_email) === asEmail(provenance.requested_by) &&
          String(submissionAudit.actor_role || '') === String(provenance.submission_actor_role || '') &&
          String(submissionAudit.authentication_method || '') === String(provenance.submission_authentication_method || '') &&
          ['session', 'badge'].includes(String(submissionAudit.authentication_method || '')) &&
          String(submissionAudit.server_timestamp || '') === String(provenance.submission_audit_at || '') &&
          Number.isFinite(submissionAuditTime) && Number.isFinite(requestedAtTime) && Number.isFinite(reviewedAtTime) &&
          submissionAuditTime >= requestedAtTime && submissionAuditTime <= reviewedAtTime &&
          String(submissionAudit.reason || '') === String(provenance.employee_reason || '') &&
          String(submissionAudit.details?.correction_request_id || '') === String(provenance.correction_request_id || '') &&
          String(submissionAudit.details?.payload_hash || '') === String(provenance.submission_payload_hash || '') &&
          constantTimeEqual(String(submissionAudit.details?.payload_hash || ''), expectedSubmissionHash) &&
          String(submissionAudit.details?.requested_changes?.clock_in || '') === String(provenance.requested_clock_in || '') &&
          String(submissionAudit.details?.requested_changes?.clock_out || '') === String(provenance.requested_clock_out || '') &&
          Number(submissionAudit.details?.requested_changes?.lunch_minutes || 0) === Number(provenance.requested_lunch_minutes || 0) &&
          String(submissionAudit.details?.requested_changes?.notes || '') === String(provenance.requested_notes || ''));
        const correctionRequestKind = String(correction?.request_kind || 'standard');
        const punchOriginalSnapshotHash = correction ? await payloadHash(correction.original_snapshot || {}) : '';
        const expectedPunchResponseHash = correction && correctionRequestKind === 'missed_clock_out' ? await payloadHash({
          action: 'resolve_punch_exception',
          user_email: asEmail(correction.user_email),
          time_entry_id: correction.time_entry_id,
          response: 'missed_clock_out',
          claimed_clock_out: String(requested.clock_out || '') || null,
        }) : '';
        const punchResponseAuditTime = Date.parse(String(punchResponseAudit?.server_timestamp || ''));
        const v26MissedClockOutMatches = !strictV26 || correctionRequestKind !== 'missed_clock_out' || Boolean(
          v26RequestKind === 'missed_clock_out' && punchCase && punchResponseAudit && expectedPunchResponseHash &&
          String(correction.punch_exception_id || '') === String(provenance.punch_exception_id || '') &&
          String(punchCase.id || '') === String(provenance.punch_exception_id || '') &&
          String(punchCase.case_key || '') === String(provenance.punch_case_key || '') &&
          String(punchCase.case_key || '') === `missed_clock_out:${change.time_entry_id}` &&
          asEmail(punchCase.user_email) === asEmail(provenance.requested_by) &&
          String(punchCase.time_entry_id || '') === String(change.time_entry_id || '') &&
          String(punchCase.exception_type || '') === 'missed_clock_out' &&
          String(punchCase.detected_clock_in || '') === String(correction.original_snapshot?.clock_in || '') &&
          String(punchCase.status || '') === String(provenance.punch_exception_status || '') &&
          String(punchCase.status || '') === 'resolved' &&
          String(punchCase.employee_response || '') === String(provenance.punch_employee_response || '') &&
          String(punchCase.employee_response || '') === 'missed_clock_out' &&
          String(punchCase.claimed_clock_out || '') === String(provenance.punch_claimed_clock_out || '') &&
          String(punchCase.claimed_clock_out || '') === String(requested.clock_out || '') &&
          String(punchCase.request_id || '') === String(provenance.submission_request_id || '') &&
          String(punchCase.correction_request_id || '') === String(provenance.correction_request_id || '') &&
          String(punchCase.resolution_audit_id || '') === String(provenance.punch_resolution_audit_id || '') &&
          String(punchCase.resolution_audit_id || '') === String(provenance.applied_audit_id || '') &&
          constantTimeEqual(await payloadHash(punchCase.original_snapshot || {}), punchOriginalSnapshotHash) &&
          constantTimeEqual(punchOriginalSnapshotHash, String(provenance.punch_original_snapshot_hash || '')) &&
          String(punchResponseAudit.id || '') === String(provenance.punch_response_audit_id || '') &&
          ['confirmed', 'recovered'].includes(String(punchResponseAudit.outcome || '')) &&
          String(punchResponseAudit.outcome || '') === String(provenance.punch_response_audit_outcome || '') &&
          asEmail(punchResponseAudit.user_email) === asEmail(provenance.requested_by) &&
          asEmail(punchResponseAudit.actor_email) === asEmail(provenance.requested_by) &&
          String(punchResponseAudit.actor_role || '') === String(provenance.punch_response_actor_role || '') &&
          String(punchResponseAudit.authentication_method || '') === String(provenance.punch_response_authentication_method || '') &&
          ['session', 'badge'].includes(String(punchResponseAudit.authentication_method || '')) &&
          String(punchResponseAudit.server_timestamp || '') === String(provenance.punch_response_audit_at || '') &&
          Number.isFinite(punchResponseAuditTime) && Number.isFinite(requestedAtTime) && Number.isFinite(reviewedAtTime) &&
          punchResponseAuditTime >= requestedAtTime && punchResponseAuditTime <= reviewedAtTime &&
          String(punchResponseAudit.reason || '') === String(provenance.employee_reason || '') &&
          String(punchResponseAudit.details?.punch_exception_id || '') === String(provenance.punch_exception_id || '') &&
          String(punchResponseAudit.details?.correction_request_id || '') === String(provenance.correction_request_id || '') &&
          String(punchResponseAudit.details?.response || '') === 'missed_clock_out' &&
          String(punchResponseAudit.details?.claimed_clock_out || '') === String(provenance.punch_claimed_clock_out || '') &&
          String(punchResponseAudit.details?.payload_hash || '') === String(provenance.punch_response_payload_hash || '') &&
          constantTimeEqual(String(punchResponseAudit.details?.payload_hash || ''), expectedPunchResponseHash) &&
          constantTimeEqual(await payloadHash(punchResponseAudit.details?.original_snapshot || {}), punchOriginalSnapshotHash) &&
          String(submissionAudit?.details?.punch_exception_id || '') === String(provenance.punch_exception_id || '') &&
          String(submissionAudit?.details?.request_kind || '') === 'missed_clock_out'
        );
        const expectedReviewStatus = String(provenance.review_decision || '') === 'approve_modified' ? 'approved_modified' : 'approved';
        const v24AppliedAuditMatches = !strictV24 || Boolean(correction && appliedAudit &&
          String(appliedAudit.action || '') === 'admin_correction' &&
          asEmail(appliedAudit.actor_email) === asEmail(provenance.reviewed_by) &&
          String(appliedAudit.actor_role || '') === 'admin' &&
          ['session', 'admin_kiosk'].includes(String(appliedAudit.authentication_method || '')) &&
          String(appliedAudit.reason || '') === String(provenance.reviewer_reason || '') &&
          String(appliedAudit.details?.review_payload_hash || '') === String(correction.review_payload_hash || '') &&
          String(correction.status || '') === expectedReviewStatus);
        const v24CorrectionReviewAuditMatches = !strictV24 || Boolean(correction && reviewAudit &&
          ['confirmed', 'recovered'].includes(String(reviewAudit.outcome || '')) &&
          asEmail(reviewAudit.user_email) === asEmail(provenance.requested_by) &&
          String(reviewAudit.time_entry_id || '') === String(change.time_entry_id || '') &&
          String(reviewAudit.request_id || '') === String(provenance.review_request_id || '') &&
          asEmail(reviewAudit.actor_email) === asEmail(provenance.reviewed_by) &&
          String(reviewAudit.actor_role || '') === 'admin' &&
          ['session', 'admin_kiosk'].includes(String(reviewAudit.authentication_method || '')) &&
          String(reviewAudit.server_timestamp || '') === String(provenance.reviewed_at || '') &&
          String(reviewAudit.reason || '') === String(provenance.reviewer_reason || '') &&
          String(reviewAudit.details?.correction_request_id || '') === String(provenance.correction_request_id || '') &&
          String(reviewAudit.details?.decision || '') === expectedReviewStatus &&
          String(reviewAudit.details?.applied_audit_id || '') === String(provenance.applied_audit_id || '') &&
          String(correction.review_payload_hash || '') &&
          constantTimeEqual(String(reviewAudit.details?.review_payload_hash || ''), String(correction.review_payload_hash || '')));
        const directDeltaMatches = change.change_type === 'removed'
          ? !change.after &&
            String(change.before?.clock_in || '') === String(original.clock_in || '') &&
            String(change.before?.clock_out || '') === String(original.clock_out || '') &&
            Number(change.before?.total_hours || 0) === Number(original.total_hours || 0)
          : change.change_type === 'added'
            ? !change.before &&
              String(change.after?.clock_in || '') === String(corrected.clock_in || '') &&
              String(change.after?.clock_out || '') === String(corrected.clock_out || '') &&
              Number(change.after?.total_hours || 0) === Number(corrected.total_hours || 0)
            : String(change.before?.clock_in || '') === String(original.clock_in || '') &&
              String(change.before?.clock_out || '') === String(original.clock_out || '') &&
              Number(change.before?.total_hours || 0) === Number(original.total_hours || 0) &&
              String(change.after?.clock_in || '') === String(corrected.clock_in || '') &&
              String(change.after?.clock_out || '') === String(corrected.clock_out || '') &&
              Number(change.after?.total_hours || 0) === Number(corrected.total_hours || 0);
        let deltaMatches = directDeltaMatches;
        // For v28, a direct terminal match must not bypass the unique semantic
        // suffix check when earlier corrections returned to the prior payroll state.
        if (strictV28 && change.change_type === 'changed' && Array.isArray(change.causal_chain)) {
          const correctionLinks = change.causal_chain.filter((link: any) => String(link?.action || '') === 'admin_correction');
          if (correctionLinks.length > 1 &&
              String(correctionLinks[correctionLinks.length - 1]?.audit_id || '') === String(provenance.applied_audit_id || '')) {
            const correctionAudits = [];
            for (const link of correctionLinks) {
              const chainAudit = await auditEntity.get(String(link?.audit_id || '')).catch(() => null);
              if (!chainAudit ||
                  String(chainAudit.action || '') !== 'admin_correction' ||
                  !['confirmed', 'recovered'].includes(String(chainAudit.outcome || '')) ||
                  String(chainAudit.time_entry_id || '') !== String(change.time_entry_id || '') ||
                  String(chainAudit.id || '') !== String(link?.audit_id || '')) {
                correctionAudits.length = 0;
                break;
              }
              correctionAudits.push(chainAudit);
            }
            let matchingSuffixes = 0;
            for (let startIndex = 0; startIndex < correctionAudits.length; startIndex += 1) {
              let semanticState = {
                clock_in: String(change.before?.clock_in || ''),
                clock_out: String(change.before?.clock_out || ''),
                total_hours: Number(change.before?.total_hours || 0),
              };
              let suffixMatches = true;
              for (let index = startIndex; index < correctionAudits.length; index += 1) {
                const chainOriginal = correctionAudits[index]?.details?.original || {};
                const chainCorrected = correctionAudits[index]?.details?.corrected || {};
                if (String(chainOriginal.clock_in || '') !== semanticState.clock_in ||
                    String(chainOriginal.clock_out || '') !== semanticState.clock_out ||
                    Number(chainOriginal.total_hours || 0) !== semanticState.total_hours) {
                  suffixMatches = false;
                  break;
                }
                semanticState = {
                  clock_in: String(chainCorrected.clock_in || ''),
                  clock_out: String(chainCorrected.clock_out || ''),
                  total_hours: Number(chainCorrected.total_hours || 0),
                };
              }
              if (suffixMatches &&
                  semanticState.clock_in === String(change.after?.clock_in || '') &&
                  semanticState.clock_out === String(change.after?.clock_out || '') &&
                  semanticState.total_hours === Number(change.after?.total_hours || 0)) {
                matchingSuffixes += 1;
              }
            }
            deltaMatches = matchingSuffixes === 1;
          } else if (correctionLinks.length > 1) {
            // Multiple correction audits without the frozen terminal cause are invalid,
            // even if the terminal's original times happen to match generation-before.
            deltaMatches = false;
          }
        }
        return Boolean(correction && appliedAudit &&
          String(correction.time_entry_id || '') === String(change.time_entry_id || '') &&
          ['approved', 'approved_modified'].includes(String(correction.status || '')) &&
          (!strictV26 || correctionRequestKind === v26RequestKind) &&
          String(correction.request_id || '') === String(provenance.submission_request_id || '') &&
          asEmail(correction.user_email) === asEmail(provenance.requested_by) &&
          String(correction.requested_at || '') === String(provenance.requested_at || '') &&
          String(correction.employee_reason || '') === String(provenance.employee_reason || '') &&
          String(correction.review_request_id || '') === String(provenance.review_request_id || '') &&
          String(correction.review_decision || '') === String(provenance.review_decision || '') &&
          asEmail(correction.reviewer_email) === asEmail(provenance.reviewed_by) &&
          String(correction.reviewed_at || '') === String(provenance.reviewed_at || '') &&
          String(correction.reviewer_reason || '') === String(provenance.reviewer_reason || '') &&
          String(correction.applied_audit_id || '') === String(provenance.applied_audit_id || '') &&
          ['confirmed', 'recovered'].includes(String(appliedAudit.outcome || '')) &&
          String(appliedAudit.time_entry_id || '') === String(change.time_entry_id || '') &&
          String(appliedAudit.request_id || '') === String(provenance.applied_audit_request_id || '') &&
          String(appliedAudit.details?.correction_request_id || '') === String(provenance.correction_request_id || '') &&
          (!windowStart || (String(appliedAudit.server_timestamp || '') === String(provenance.applied_at || '') && inCausalWindow(appliedAudit.server_timestamp, windowStart, windowEnd))) &&
          requestedMatches && appliedMatches && v25SubmissionAuditMatches && v26MissedClockOutMatches && v24AppliedAuditMatches && v24CorrectionReviewAuditMatches && deltaMatches);
      };
      const verifyActionProvenance = async (change: any, windowStart = '', windowEnd = '', snapshotVersion = 0) => {
        const provenance = change?.action_provenance;
        if (!provenance) return false;
        const evidence = await auditEntity.get(String(provenance.audit_id || '')).catch(() => null);
        let uniqueDirectVerified = false;
        if (provenance.unique_direct_semantic_suffix === true) {
          // Opt-in frozen v28 evidence only; never reinterpret older manifests.
          if (snapshotVersion < 28 || change.change_type !== 'changed' ||
              String(evidence?.action || '') !== 'admin_correction' ||
              String(evidence?.details?.correction_request_id || '') ||
              !Array.isArray(change.causal_chain)) return false;
          const correctionLinks = change.causal_chain.filter((link: any) => String(link.action || '') === 'admin_correction');
          if (correctionLinks.length < 2 ||
              String(correctionLinks[correctionLinks.length - 1].audit_id || '') !== String(evidence.id || '')) return false;
          const correctionAudits = [];
          for (const link of correctionLinks) {
            const audit = await auditEntity.get(String(link.audit_id || '')).catch(() => null);
            if (!audit || String(audit.id || '') !== String(link.audit_id || '') ||
                String(audit.time_entry_id || '') !== String(change.time_entry_id || '')) return false;
            correctionAudits.push(audit);
          }
          const matching = uniqueAdminCorrectionSemanticSuffix(correctionAudits, change.before, change.after);
          uniqueDirectVerified = Boolean(matching &&
            String(matching.terminal?.id || '') === String(evidence.id || '') &&
            String(matching.start_audit_id || '') === String(provenance.semantic_suffix_start_audit_id || ''));
        }
        const allowedActions = change.change_type === 'removed'
          ? ['admin_archive', 'admin_correction']
          : ['admin_correction', 'clock_in', 'clock_out', 'punch_exception'];
        return Boolean(evidence &&
          allowedActions.includes(String(evidence.action || '')) &&
          ['confirmed', 'recovered'].includes(String(evidence.outcome || '')) &&
          String(evidence.time_entry_id || '') === String(change.time_entry_id || '') &&
          String(evidence.request_id || '') === String(provenance.request_id || '') &&
          String(evidence.action || '') === String(provenance.action || '') &&
          String(evidence.outcome || '') === String(provenance.outcome || '') &&
          asEmail(evidence.actor_email) === asEmail(provenance.actor_email) &&
          String(evidence.actor_role || '') === String(provenance.actor_role || '') &&
          String(evidence.authentication_method || '') === String(provenance.authentication_method || '') &&
          String(evidence.server_timestamp || '') === String(provenance.server_timestamp || '') &&
          String(evidence.reason || '') === String(provenance.reason || '') &&
          (!windowStart || inCausalWindow(evidence.server_timestamp, windowStart, windowEnd)) &&
          (String(evidence.action || '') !== 'clock_out' || (
            String(evidence.details?.result_clock_out || '') === String(provenance.semantic_clock_out || '') &&
            Number(evidence.details?.total_hours || 0) === Number(provenance.semantic_total_hours || 0) &&
            String(change.after?.clock_out || '') === String(provenance.semantic_clock_out || '') &&
            Number(change.after?.total_hours || 0) === Number(provenance.semantic_total_hours || 0)
          )) &&
          (String(evidence.action || '') !== 'clock_in' || (
            change.change_type === 'added' &&
            String(evidence.server_timestamp || '') === String(provenance.semantic_clock_in || '') &&
            String(change.after?.clock_in || '') === String(provenance.semantic_clock_in || '')
          )) &&
          (String(evidence.action || '') !== 'admin_correction' || (() => {
            const original = evidence.details?.original || {};
            const corrected = evidence.details?.corrected || {};
            if (String(original.clock_in || '') !== String(provenance.semantic_before_clock_in || '') ||
                String(original.clock_out || '') !== String(provenance.semantic_before_clock_out || '') ||
                Number(original.total_hours || 0) !== Number(provenance.semantic_before_total_hours || 0) ||
                String(corrected.clock_in || '') !== String(provenance.semantic_after_clock_in || '') ||
                String(corrected.clock_out || '') !== String(provenance.semantic_after_clock_out || '') ||
                Number(corrected.total_hours || 0) !== Number(provenance.semantic_after_total_hours || 0)) return false;
            const originalDay = dateKeyInCompanyTime(original.clock_in);
            const correctedDay = dateKeyInCompanyTime(corrected.clock_in);
            const originalInside = Boolean(originalDay && originalDay >= period.start_date && originalDay <= period.end_date);
            const correctedInside = Boolean(correctedDay && correctedDay >= period.start_date && correctedDay <= period.end_date);
            if (change.change_type === 'removed') return originalInside && !correctedInside && !change.after;
            if (change.change_type === 'added') return !originalInside && correctedInside && !change.before &&
              String(change.after?.clock_in || '') === String(corrected.clock_in || '') &&
              String(change.after?.clock_out || '') === String(corrected.clock_out || '') &&
              Number(change.after?.total_hours || 0) === Number(corrected.total_hours || 0);
            return change.change_type === 'changed' && originalInside && correctedInside &&
              (provenance.unique_direct_semantic_suffix === true ? uniqueDirectVerified : (
                String(change.before?.clock_in || '') === String(original.clock_in || '') &&
                String(change.before?.clock_out || '') === String(original.clock_out || '') &&
                Number(change.before?.total_hours || 0) === Number(original.total_hours || 0))) &&
              String(change.after?.clock_in || '') === String(corrected.clock_in || '') &&
              String(change.after?.clock_out || '') === String(corrected.clock_out || '') &&
              Number(change.after?.total_hours || 0) === Number(corrected.total_hours || 0);
          })()) &&
          (String(evidence.action || '') !== 'admin_archive' || change.change_type === 'removed'));
      };
      const verifyCausalChain = async (change: any, windowStart = '', windowEnd = '') => {
        const chain = change?.causal_chain;
        const terminalAuditId = String(change?.causal_terminal_audit_id || '');
        if (!Array.isArray(chain) || !chain.length || !terminalAuditId || !chain.some((link: any) => String(link.audit_id || '') === terminalAuditId)) return false;
        let previousTime = -Infinity;
        let previousId = '';
        for (let index = 0; index < chain.length; index += 1) {
          const link = chain[index];
          if (Number(link.sequence || 0) !== index + 1) return false;
          const evidence = await auditEntity.get(String(link.audit_id || '')).catch(() => null);
          if (!evidence || String(evidence.time_entry_id || '') !== String(change.time_entry_id || '') ||
              !['confirmed', 'recovered'].includes(String(evidence.outcome || '')) ||
              String(evidence.action || '') !== String(link.action || '') ||
              String(evidence.request_id || '') !== String(link.request_id || '') ||
              String(evidence.outcome || '') !== String(link.outcome || '') ||
              asEmail(evidence.actor_email) !== asEmail(link.actor_email) ||
              String(evidence.actor_role || '') !== String(link.actor_role || '') ||
              String(evidence.authentication_method || '') !== String(link.authentication_method || '') ||
              String(evidence.server_timestamp || '') !== String(link.server_timestamp || '') ||
              String(evidence.reason || '') !== String(link.reason || '') ||
              !inCausalWindow(evidence.server_timestamp, windowStart, windowEnd)) return false;
          const currentTime = Date.parse(String(evidence.server_timestamp || ''));
          const currentId = String(evidence.id || '');
          if (currentTime < previousTime || (currentTime === previousTime && currentId.localeCompare(previousId) < 0)) return false;
          previousTime = currentTime;
          previousId = currentId;
        }
        const semanticTerminalId = String(change.correction_provenance?.applied_audit_id || change.action_provenance?.audit_id || '');
        return semanticTerminalId === terminalAuditId;
      };
      const verifyCausalChainCompleteness = async (change: any, windowStart = '', windowEnd = '', snapshotVersion = 0) => {
        const chain = change?.causal_chain;
        if (!Array.isArray(chain) || !windowStart || !windowEnd) return false;
        const authoritative = await auditEntity.filter({ time_entry_id: String(change.time_entry_id || '') });
        if (!Array.isArray(authoritative)) return false;
        const frozenAuditIds = new Set(chain.map((link: any) => String(link?.audit_id || '')).filter(Boolean));
        if (snapshotVersion >= 28) {
          // A later duplicate of an already-frozen correction request remains
          // conflicting evidence even if its timestamp falls exactly on the
          // finalization boundary (excluded from the immutable causal window).
          // Do not expand the window: unrelated later actions must remain valid.
          const frozenCorrectionRequests = new Set(chain.filter((link: any) =>
            String(link?.action || '') === 'admin_correction'
          ).map((link: any) => String(link?.request_id || '')).filter(Boolean));
          if (frozenCorrectionRequests.size && hasDuplicateConfirmedAdminCorrectionRequests(authoritative.filter((row: any) =>
            String(row?.action || '') === 'admin_correction' &&
            frozenCorrectionRequests.has(String(row?.request_id || ''))
          ))) return false;
          for (const requestId of frozenCorrectionRequests) {
            // Request IDs identify an action, not an employee or entry. A
            // second completed correction on another shift is still a
            // collision, even outside this frozen generation's time window.
            const matching = await auditEntity.filter({ action: 'admin_correction', request_id: requestId });
            if (!Array.isArray(matching)) return false;
            const completed = matching.filter((row: any) =>
              ['confirmed', 'recovered'].includes(String(row?.outcome || '')));
            if (completed.length !== 1 ||
                String(completed[0]?.time_entry_id || '') !== String(change.time_entry_id || '') ||
                !frozenAuditIds.has(String(completed[0]?.id || ''))) return false;
          }
        }
        const startTime = Date.parse(windowStart);
        const endTime = Date.parse(windowEnd);
        const inFrozenCausalWindow = (row: any) => {
          const auditTime = Date.parse(String(row?.server_timestamp || ''));
          if (!Number.isFinite(auditTime) || auditTime < startTime || auditTime > endTime) return false;
          return auditTime < endTime || frozenAuditIds.has(String(row?.id || ''));
        };
        const relevantActions = ['admin_archive', 'admin_correction', 'clock_in', 'clock_out', 'punch_exception', 'correction_request'];
        const expected = authoritative.filter((row: any) =>
          relevantActions.includes(String(row.action || '')) &&
          ['confirmed', 'recovered'].includes(String(row.outcome || '')) &&
          inFrozenCausalWindow(row)
        ).sort((a: any, b: any) => {
          const timeOrder = Date.parse(String(a.server_timestamp || '')) - Date.parse(String(b.server_timestamp || ''));
          return timeOrder || String(a.id || '').localeCompare(String(b.id || ''));
        });
        if (expected.length !== chain.length ||
            (snapshotVersion >= 28 && hasDuplicateConfirmedAdminCorrectionRequests(expected))) return false;
        return expected.every((row: any, index: number) =>
          String(row.id || '') === String(chain[index]?.audit_id || '') &&
          Number(chain[index]?.sequence || 0) === index + 1
        );
      };
      // Payroll-membership evidence normalization is shared with the admin Audit Trail verifier.
      const canonicalPayrollMembershipEvidence = (audits: any[], rejectConflicts = false) => {
        const candidates = (Array.isArray(audits) ? audits : []).map((membershipAudit: any) => ({
          membershipAudit,
          membership: payrollMembershipFromAudit(membershipAudit),
        })).filter((candidate: any) => candidate.membership?.company_date);
        if (rejectConflicts && new Set(candidates.map((candidate: any) => `${candidate.membership.company_date}|${candidate.membership.clock_in}`)).size > 1) {
          const conflictEvidence = candidates.map((candidate: any) => ({
            contract_version: PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION,
            audit_id: String(candidate.membershipAudit.id || ''),
            action: String(candidate.membershipAudit.action || ''),
            request_id: String(candidate.membershipAudit.request_id || ''),
            server_timestamp: String(candidate.membershipAudit.server_timestamp || ''),
            company_date: String(candidate.membership.company_date || ''),
            clock_in: String(candidate.membership.clock_in || ''),
            source: String(candidate.membership.source || ''),
          }));
          const malformedConflictEvidence = conflictEvidence.map((item: any) => validatePayrollMembershipConflictEvidence(item)).filter((validation: any) => payrollMembershipConflictEvidenceIsMalformed(validation));
          if (malformedConflictEvidence.length > 0) {
            return { conflict: true, conflict_evidence: [], conflict_evidence_invalid: true, conflict_evidence_validation: malformedConflictEvidence.slice(0, 20) };
          }
          conflictEvidence.sort((a: any, b: any) =>
            a.company_date.localeCompare(b.company_date) || a.clock_in.localeCompare(b.clock_in) ||
            a.server_timestamp.localeCompare(b.server_timestamp) || a.audit_id.localeCompare(b.audit_id)
          );
          return { conflict: true, conflict_evidence: conflictEvidence.slice(0, 20) };
        }
        candidates.sort((a: any, b: any) => {
          const aNormalized = a.membership.source === 'verified_normalized_audit_envelope' ? 0 : 1;
          const bNormalized = b.membership.source === 'verified_normalized_audit_envelope' ? 0 : 1;
          if (aNormalized !== bNormalized) return aNormalized - bNormalized;
          const timeOrder = Date.parse(String(a.membershipAudit.server_timestamp || '')) - Date.parse(String(b.membershipAudit.server_timestamp || ''));
          return timeOrder || String(a.membershipAudit.id || '').localeCompare(String(b.membershipAudit.id || ''));
        });
        return candidates[0] || null;
      };
      const verifyGenerationAuditReconciliation = async (summary: any, predecessor: any) => {
        const failed = (conflict: any = null) => ({ verified: false, conflict });
        const stored = summary?.generation_audit_reconciliation;
        if (!Array.isArray(stored) || Number(summary.generation_audit_reconciliation_count || 0) !== stored.length ||
            !constantTimeEqual(String(summary.generation_audit_reconciliation_hash || ''), await payloadHash(stored))) return failed();
        const windowStart = String(summary.generation_causal_window_start || '');
        const windowEnd = String(summary.generation_causal_window_end || '');
        if (!windowEnd || !Number.isFinite(Date.parse(windowEnd))) return failed();
        if (!predecessor) {
          if (windowStart) return failed();
          if (stored.length !== 0) return failed();
          if (Number(summary.snapshot_version || 0) >= 21) {
            const storedDiscovery = summary?.generation_membership_discovery;
            if (!Array.isArray(storedDiscovery) || storedDiscovery.length !== 0 ||
                Number(summary.generation_membership_discovery_count || 0) !== 0 ||
                !constantTimeEqual(String(summary.generation_membership_discovery_hash || ''), await payloadHash([]))) return failed();
          }
          return { verified: true, conflict: null };
        }
        if (!windowStart || !Number.isFinite(Date.parse(windowStart)) || Date.parse(windowStart) > Date.parse(windowEnd)) return failed();
        const storedAuditIds = new Set(stored.map((item: any) => String(item?.audit_id || '')).filter(Boolean));
        const inFrozenGenerationWindow = (audit: any) => {
          const auditTime = Date.parse(String(audit?.server_timestamp || ''));
          const startTime = Date.parse(windowStart);
          const endTime = Date.parse(windowEnd);
          if (!Number.isFinite(auditTime) || auditTime < startTime || auditTime > endTime) return false;
          return auditTime < endTime || storedAuditIds.has(String(audit?.id || ''));
        };
        const relevantActions = ['admin_archive', 'admin_correction', 'clock_in', 'clock_out', 'punch_exception', 'correction_request'];
        const changedIds = new Set((summary.generation_changes || []).map((change: any) => String(change.time_entry_id || '')));
        const periodEntryIdSet = new Set([
          ...(Array.isArray(predecessor?.shift_manifest) ? predecessor.shift_manifest.map((row: any) => String(row.id || '')) : []),
          ...(Array.isArray(summary.shift_manifest) ? summary.shift_manifest.map((row: any) => String(row.id || '')) : []),
        ].filter(Boolean));
        const expectedMembershipDiscovery = [];
        if (Number(summary.snapshot_version || 0) >= 18) {
          const windowAudits = await auditEntity.filter({ server_timestamp: { $gte: windowStart, $lte: windowEnd } });
          if (!Array.isArray(windowAudits)) return failed();
          const candidateIds = [...new Set(windowAudits.filter((row: any) =>
            relevantActions.includes(String(row.action || '')) &&
            ['confirmed', 'recovered'].includes(String(row.outcome || '')) &&
            String(row.time_entry_id || '') &&
            inFrozenGenerationWindow(row)
          ).map((row: any) => String(row.time_entry_id || '')))];
          for (const candidateId of candidateIds) {
            if (periodEntryIdSet.has(candidateId)) continue;
            const candidateEntry = await entryEntity.get(candidateId).catch(() => null);
            let companyDate = dateKeyInCompanyTime(candidateEntry?.clock_in);
            let discoveryEvidence = null;
            if (!companyDate && Number(summary.snapshot_version || 0) >= 19) {
              const membershipAudits = await auditEntity.filter({ time_entry_id: candidateId });
              if (!Array.isArray(membershipAudits)) return failed();
              discoveryEvidence = Number(summary.snapshot_version || 0) >= 22
                ? canonicalPayrollMembershipEvidence(membershipAudits, Number(summary.snapshot_version || 0) >= 23)
                : membershipAudits.map((membershipAudit: any) => ({ membershipAudit, membership: payrollMembershipFromAudit(membershipAudit) })).find((candidate: any) => candidate.membership?.company_date) || null;
              if (discoveryEvidence?.conflict) return failed(discoveryEvidence.conflict_evidence_invalid
                ? { type: 'payroll_membership_evidence_invalid', time_entry_id: candidateId, validation: discoveryEvidence.conflict_evidence_validation }
                : { type: 'payroll_membership_evidence', time_entry_id: candidateId, evidence: discoveryEvidence.conflict_evidence });
              if (discoveryEvidence) companyDate = discoveryEvidence.membership.company_date;
            }
            if (companyDate && companyDate >= period.start_date && companyDate <= period.end_date) {
              periodEntryIdSet.add(candidateId);
              if (Number(summary.snapshot_version || 0) >= 21 && discoveryEvidence) expectedMembershipDiscovery.push({
                time_entry_id: candidateId,
                audit_id: String(discoveryEvidence.membershipAudit.id || ''),
                action: String(discoveryEvidence.membershipAudit.action || ''),
                request_id: String(discoveryEvidence.membershipAudit.request_id || ''),
                server_timestamp: String(discoveryEvidence.membershipAudit.server_timestamp || ''),
                payroll_membership: { company_date: discoveryEvidence.membership.company_date, clock_in: discoveryEvidence.membership.clock_in, source: discoveryEvidence.membership.source },
              });
            }
          }
        }
        if (Number(summary.snapshot_version || 0) >= 21) {
          expectedMembershipDiscovery.sort((a: any, b: any) => a.time_entry_id.localeCompare(b.time_entry_id) || a.audit_id.localeCompare(b.audit_id));
          const storedDiscovery = summary?.generation_membership_discovery;
          if (!Array.isArray(storedDiscovery) || Number(summary.generation_membership_discovery_count || 0) !== storedDiscovery.length ||
              !constantTimeEqual(String(summary.generation_membership_discovery_hash || ''), await payloadHash(storedDiscovery)) ||
              !constantTimeEqual(await payloadHash(expectedMembershipDiscovery), await payloadHash(storedDiscovery))) return failed();
        }
        const periodEntryIds = [...periodEntryIdSet].sort();
        const expected = [];
        for (const entryId of periodEntryIds) {
          const audits = await auditEntity.filter({ time_entry_id: entryId });
          if (!Array.isArray(audits)) return failed();
          for (const row of audits.filter((audit: any) =>
            relevantActions.includes(String(audit.action || '')) &&
            ['confirmed', 'recovered'].includes(String(audit.outcome || '')) &&
            inFrozenGenerationWindow(audit)
          )) {
            if (row.details?.payroll_membership && ['clock_in', 'clock_out', 'admin_correction', 'admin_archive'].includes(String(row.action || '')) &&
                !normalizedPayrollMembershipFromAudit(row)) return failed();
            const membership = Number(summary.snapshot_version || 0) >= 20 ? normalizedPayrollMembershipFromAudit(row) : null;
            expected.push({
              audit_id: String(row.id || ''), time_entry_id: entryId, action: String(row.action || ''),
              request_id: String(row.request_id || ''), server_timestamp: String(row.server_timestamp || ''),
              classification: changedIds.has(entryId) ? 'mapped_payroll_delta' : 'net_non_payroll_affecting',
              ...(Number(summary.snapshot_version || 0) >= 20 && membership ? {
                payroll_membership: { company_date: membership.company_date, clock_in: membership.clock_in, source: membership.source },
              } : {}),
            });
          }
        }
        expected.sort((a: any, b: any) => {
          const timeOrder = Date.parse(a.server_timestamp) - Date.parse(b.server_timestamp);
          return timeOrder || a.audit_id.localeCompare(b.audit_id);
        });
        return constantTimeEqual(await payloadHash(expected), await payloadHash(stored)) ? { verified: true, conflict: null } : failed();
      };
      const generations = [];
      for (let index = 0; index < history.length; index += 1) {
        const summary = history[index];
        const check = await verifySummary(summary, history.slice(0, index), `Historical generation ${index + 1}`);
        if (!check.verified) return Response.json({ success: true, verified: false, legacy: check.legacy, error: check.error, pay_period_id: period.id, generations: [] });
        let retiredShifts = undefined;
        let retiredEvidenceVerified = false;
        if (Number(summary.snapshot_version || 0) >= 3) {
          if (!Array.isArray(summary.shift_manifest)) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} is missing its immutable shift manifest.`, pay_period_id: period.id, generations: [] });
          const manifestHash = await payloadHash(summary.shift_manifest);
          if (!String(summary.shift_manifest_hash || '') || !constantTimeEqual(String(summary.shift_manifest_hash), manifestHash) || !constantTimeEqual(String(summary.entry_snapshot_hash || ''), manifestHash)) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} shift manifest failed verification.`, pay_period_id: period.id, generations: [] });
          retiredShifts = summary.shift_manifest;
          retiredEvidenceVerified = true;
          if (Number(summary.snapshot_version || 0) >= 27) {
            for (const row of retiredShifts) {
              const lateClockIn = await canonicalLateClockInPayrollProvenance({
                entry: row, approvalEvidence: row.approval_evidence,
                auditEntity, punchExceptionEntity, correctionRequestEntity, requireCurrentResolution: false,
                payrollGenerationContext: {
                  period_id: period.id,
                  prior_generations: history.slice(0, index),
                },
                expectedProvenance: row.late_clock_in_provenance || null,
              });
              if (lateClockIn.applicable) {
                if (!lateClockIn.provenance || !row.late_clock_in_provenance ||
                    !constantTimeEqual(await payloadHash(lateClockIn.provenance), await payloadHash(row.late_clock_in_provenance))) {
                  return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} missed Clock In provenance failed verification.`, pay_period_id: period.id, generations: [] });
                }
              } else if (row.late_clock_in_provenance) {
                return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} contains unexpected missed Clock In provenance.`, pay_period_id: period.id, generations: [] });
              }
            }
          }
        }
        const retiredReconciliation = retiredEvidenceVerified ? reconcileShiftEvidence(retiredShifts, summary) : undefined;
        if (retiredReconciliation && !retiredReconciliation.verified) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} employee reconciliation failed.`, pay_period_id: period.id, generations: [] });
        if (summary.invalidated_by_role || summary.invalidation_authentication_method) {
          if (summary.invalidated_by_role !== 'admin' || summary.invalidation_authentication_method !== 'session' || !summary.invalidated_by_reopen_request_id) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} reopen authority provenance is invalid.`, pay_period_id: period.id, generations: [] });
          const reopenEvidence = await auditEntity.filter({ action: 'pay_period_status', request_id: summary.invalidated_by_reopen_request_id });
          if (!Array.isArray(reopenEvidence) || reopenEvidence.length !== 1 || !['confirmed', 'recovered'].includes(String(reopenEvidence[0]?.outcome || '')) ||
              asEmail(reopenEvidence[0]?.actor_email) !== asEmail(summary.invalidated_by) || String(reopenEvidence[0]?.actor_role || '') !== summary.invalidated_by_role ||
              String(reopenEvidence[0]?.authentication_method || '') !== summary.invalidation_authentication_method ||
              String(reopenEvidence[0]?.details?.decision || '') !== 'reopen' || String(reopenEvidence[0]?.details?.pay_period_id || '') !== period.id) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} reopen audit provenance failed verification.`, pay_period_id: period.id, generations: [] });
        }
        if (Number(summary.snapshot_version || 0) >= 7) {
          const manifestApprovers = [...new Set(retiredShifts.map((row: any) => asEmail(row.approval_evidence?.approved_by)).filter(Boolean))].sort();
          const expectedOverlap = manifestApprovers.includes(asEmail(summary.locked_by));
          if (JSON.stringify(manifestApprovers) !== JSON.stringify(summary.approving_managers || []) || expectedOverlap !== (summary.finalizer_approval_overlap === true)) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} finalizer/approver provenance failed verification.`, pay_period_id: period.id, generations: [] });
        }
        if (Number(summary.snapshot_version || 0) >= 8) {
          const predecessor = index > 0 ? history[index - 1] : null;
          const expectedSupersedes = String(predecessor?.request_id || '');
          const expectedReopen = String(predecessor?.invalidated_by_reopen_request_id || '');
          if (String(summary.supersedes_generation_request_id || '') !== expectedSupersedes ||
              String(summary.authorized_by_reopen_request_id || '') !== expectedReopen ||
              (predecessor && (!expectedSupersedes || !expectedReopen))) {
            return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} replacement lineage does not match generation ${index} and its authorized reopen.`, pay_period_id: period.id, generations: [] });
          }
        }
        if (Number(summary.snapshot_version || 0) >= 9) {
          const changes = Array.isArray(summary.generation_changes) ? summary.generation_changes : null;
          const predecessor = index > 0 ? history[index - 1] : null;
          if (!changes || Number(summary.generation_change_count || 0) !== changes.length ||
              !constantTimeEqual(String(summary.generation_changes_hash || ''), await payloadHash(changes)) ||
              String(summary.generation_reopen_reason || '') !== String(predecessor?.invalidation_reason || '')) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} change provenance failed verification.`, pay_period_id: period.id, generations: [] });
        }
        if (Number(summary.snapshot_version || 0) >= 12) {
          const predecessor = index > 0 ? history[index - 1] : null;
          const expectedStart = String(predecessor?.invalidated_at || '');
          const expectedEnd = String(summary.lock_timestamp || '');
          if (String(summary.generation_causal_window_start || '') !== expectedStart ||
              String(summary.generation_causal_window_end || '') !== expectedEnd ||
              (predecessor && (!expectedStart || !inCausalWindow(expectedStart, expectedStart, expectedEnd)))) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} causal window failed verification.`, pay_period_id: period.id, generations: [] });
        }
        if (Number(summary.snapshot_version || 0) >= 17) {
          const auditReconciliation = await verifyGenerationAuditReconciliation(summary, index > 0 ? history[index - 1] : null);
          if (!auditReconciliation.verified) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} whole-period audit reconciliation failed verification.`, conflict: auditReconciliation.conflict || undefined, pay_period_id: period.id, generations: [] });
        }
        if (Number(summary.snapshot_version || 0) >= 10) {
          const windowStart = Number(summary.snapshot_version || 0) >= 12 ? String(summary.generation_causal_window_start || '') : '';
          const windowEnd = Number(summary.snapshot_version || 0) >= 12 ? String(summary.generation_causal_window_end || '') : '';
          for (const change of summary.generation_changes || []) {
            if (change?.correction_provenance && !await verifyCorrectionProvenance(change, windowStart, windowEnd, Number(summary.snapshot_version || 0))) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} correction provenance failed verification.`, pay_period_id: period.id, generations: [] });
            if (Number(summary.snapshot_version || 0) >= 11 && !change?.correction_provenance && !await verifyActionProvenance(change, windowStart, windowEnd, Number(summary.snapshot_version || 0))) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} non-correction change provenance failed verification.`, pay_period_id: period.id, generations: [] });
            if (Number(summary.snapshot_version || 0) >= 15 && !await verifyCausalChain(change, windowStart, windowEnd)) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} ordered causal chain failed verification.`, pay_period_id: period.id, generations: [] });
            if (Number(summary.snapshot_version || 0) >= 16 && !await verifyCausalChainCompleteness(change, windowStart, windowEnd, Number(summary.snapshot_version || 0))) return Response.json({ success: true, verified: false, legacy: false, error: `Historical generation ${index + 1} causal chain is incomplete against authoritative audit history.`, pay_period_id: period.id, generations: [] });
          }
        }
        generations.push({
          generation: index + 1, state: 'retired', snapshot_version: Number(summary.snapshot_version || 0), finalized_at: summary.lock_timestamp || '', finalized_by: summary.locked_by || '',
          entry_count: Number(summary.entry_count || 0), employee_count: Number(summary.employee_count || 0), total_hours: Number(summary.total_hours || 0),
          request_id: summary.request_id || '', entry_snapshot_hash: summary.entry_snapshot_hash || '', invalidated_at: summary.invalidated_at || '',
          invalidated_by: summary.invalidated_by || '', invalidation_reason: summary.invalidation_reason || '',
          invalidated_by_role: summary.invalidated_by_role || '', invalidation_authentication_method: summary.invalidation_authentication_method || '',
          invalidated_by_reopen_request_id: summary.invalidated_by_reopen_request_id || '',
          shift_evidence_verified: retiredEvidenceVerified, shift_evidence_hash: summary.shift_manifest_hash || '', shifts: retiredShifts,
          employee_reconciliation: retiredReconciliation,
          ...(Number(summary.snapshot_version || 0) >= 7 ? { approving_managers: summary.approving_managers || [], finalizer_approval_overlap: summary.finalizer_approval_overlap === true } : {}),
          ...(Number(summary.snapshot_version || 0) >= 8 ? { supersedes_generation_request_id: summary.supersedes_generation_request_id || '', authorized_by_reopen_request_id: summary.authorized_by_reopen_request_id || '' } : {}),
          ...(Number(summary.snapshot_version || 0) >= 9 ? { generation_changes: summary.generation_changes || [], generation_change_count: Number(summary.generation_change_count || 0), generation_reopen_reason: summary.generation_reopen_reason || '' } : {}),
          ...(Number(summary.snapshot_version || 0) >= 17 ? { generation_audit_reconciliation: summary.generation_audit_reconciliation || [], generation_audit_reconciliation_count: Number(summary.generation_audit_reconciliation_count || 0) } : {}),
        });
      }
      const current = period.finalized_summary;
      if (current && current.snapshot_active !== false) {
        const check = await verifySummary(current, history, 'Current payroll generation');
        if (!check.verified) return Response.json({ success: true, verified: false, legacy: check.legacy, error: check.error, pay_period_id: period.id, generations: [] });
        if (Number(current.snapshot_version || 0) >= 3) {
          if (!Array.isArray(current.shift_manifest)) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll generation is missing its immutable shift manifest.', pay_period_id: period.id, generations: [] });
          const currentManifestHash = await payloadHash(current.shift_manifest);
          if (!String(current.shift_manifest_hash || '') ||
              !constantTimeEqual(String(current.shift_manifest_hash), currentManifestHash) ||
              !constantTimeEqual(String(current.entry_snapshot_hash || ''), currentManifestHash)) {
            return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll shift manifest failed verification.', pay_period_id: period.id, generations: [] });
          }
        }
        if (Number(current.snapshot_version || 0) >= 8) {
          const priorGeneration = history.length ? history[history.length - 1] : null;
          const expectedSupersedes = String(priorGeneration?.request_id || '');
          const expectedReopen = String(priorGeneration?.invalidated_by_reopen_request_id || '');
          if (String(current.supersedes_generation_request_id || '') !== expectedSupersedes ||
              String(current.authorized_by_reopen_request_id || '') !== expectedReopen ||
              (priorGeneration && (!expectedSupersedes || !expectedReopen))) {
            return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll replacement lineage does not match the retired generation and authorized reopen.', pay_period_id: period.id, generations: [] });
          }
        }
        if (Number(current.snapshot_version || 0) >= 9) {
          const changes = Array.isArray(current.generation_changes) ? current.generation_changes : null;
          const predecessor = history.length ? history[history.length - 1] : null;
          if (!changes || Number(current.generation_change_count || 0) !== changes.length ||
              !constantTimeEqual(String(current.generation_changes_hash || ''), await payloadHash(changes)) ||
              String(current.generation_reopen_reason || '') !== String(predecessor?.invalidation_reason || '')) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll change provenance failed verification.', pay_period_id: period.id, generations: [] });
        }
        if (Number(current.snapshot_version || 0) >= 12) {
          const predecessor = history.length ? history[history.length - 1] : null;
          const expectedStart = String(predecessor?.invalidated_at || '');
          const expectedEnd = String(current.lock_timestamp || '');
          if (String(current.generation_causal_window_start || '') !== expectedStart ||
              String(current.generation_causal_window_end || '') !== expectedEnd ||
              (predecessor && (!expectedStart || !inCausalWindow(expectedStart, expectedStart, expectedEnd)))) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll causal window failed verification.', pay_period_id: period.id, generations: [] });
        }
        if (Number(current.snapshot_version || 0) >= 17) {
          const priorForAudit = history.length ? history[history.length - 1] : null;
          const auditReconciliation = await verifyGenerationAuditReconciliation(current, priorForAudit);
          if (!auditReconciliation.verified) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll whole-period audit reconciliation failed verification.', conflict: auditReconciliation.conflict || undefined, pay_period_id: period.id, generations: [] });
        }
        if (Number(current.snapshot_version || 0) >= 10) {
          const windowStart = Number(current.snapshot_version || 0) >= 12 ? String(current.generation_causal_window_start || '') : '';
          const windowEnd = Number(current.snapshot_version || 0) >= 12 ? String(current.generation_causal_window_end || '') : '';
          for (const change of current.generation_changes || []) {
            if (change?.correction_provenance && !await verifyCorrectionProvenance(change, windowStart, windowEnd, Number(current.snapshot_version || 0))) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll correction provenance failed verification.', pay_period_id: period.id, generations: [] });
            if (Number(current.snapshot_version || 0) >= 11 && !change?.correction_provenance && !await verifyActionProvenance(change, windowStart, windowEnd, Number(current.snapshot_version || 0))) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll non-correction change provenance failed verification.', pay_period_id: period.id, generations: [] });
            if (Number(current.snapshot_version || 0) >= 15 && !await verifyCausalChain(change, windowStart, windowEnd)) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll ordered causal chain failed verification.', pay_period_id: period.id, generations: [] });
            if (Number(current.snapshot_version || 0) >= 16 && !await verifyCausalChainCompleteness(change, windowStart, windowEnd, Number(current.snapshot_version || 0))) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll causal chain is incomplete against authoritative audit history.', pay_period_id: period.id, generations: [] });
          }
        }
        const lockedEntries = await entryEntity.filter({ pay_period_id: period.id });
        if (!Array.isArray(lockedEntries) || lockedEntries.length !== Number(current.entry_count || 0)) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll generation no longer matches its locked shift count.', pay_period_id: period.id, generations: [] });
        const shiftEvidence = [];
        const snapshotRows = [];
        for (const entry of [...lockedEntries].sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))) {
          if (String(entry.pay_period_locked_at || '') !== String(current.lock_timestamp || '') || asEmail(entry.pay_period_locked_by) !== asEmail(current.locked_by) || entry.status !== 'clocked_out' || entry.approval_status !== 'approved') return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll shift locks no longer match the finalized generation.', pay_period_id: period.id, generations: [] });
          let approvalEvidence = null;
          if (entry.approval_request_id) {
            const evidence = await auditEntity.filter({ action: 'time_approval', request_id: entry.approval_request_id });
            if (!Array.isArray(evidence) || evidence.length !== 1 || !['confirmed', 'recovered'].includes(String(evidence[0]?.outcome || '')) || String(evidence[0]?.time_entry_id || '') !== String(entry.id || '')) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll shift approval evidence no longer matches the finalized generation.', pay_period_id: period.id, generations: [] });
            approvalEvidence = { id: evidence[0].id, request_id: entry.approval_request_id, outcome: evidence[0].outcome };
            if (Number(current.snapshot_version || 0) >= 4) {
              approvalEvidence.approved_by = asEmail(evidence[0].actor_email);
              approvalEvidence.approved_at = evidence[0].server_timestamp || '';
              if (!approvalEvidence.approved_by || !approvalEvidence.approved_at) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll shift approval provenance is incomplete.', pay_period_id: period.id, generations: [] });
            }
            if (Number(current.snapshot_version || 0) >= 5) {
              approvalEvidence.approver_role = String(evidence[0].actor_role || '');
              approvalEvidence.authentication_method = String(evidence[0].authentication_method || '');
              if (approvalEvidence.approver_role !== 'admin' || !['session', 'admin_kiosk'].includes(approvalEvidence.authentication_method)) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll shift approval authority is invalid.', pay_period_id: period.id, generations: [] });
            }
            if (Number(current.snapshot_version || 0) >= 6) {
              approvalEvidence.independent_review = asEmail(evidence[0].actor_email) !== asEmail(entry.user_email);
              if (!approvalEvidence.independent_review) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll shift does not prove independent manager approval.', pay_period_id: period.id, generations: [] });
            }
          }
          const snapshotRow: any = { id: entry.id, user_email: asEmail(entry.user_email), clock_in: entry.clock_in, clock_out: entry.clock_out, total_hours: Number(entry.total_hours || 0), approval_status: entry.approval_status, approval_request_id: entry.approval_request_id || '', approval_evidence: approvalEvidence };
          if (Number(current.snapshot_version || 0) >= 27) {
            snapshotRow.clock_source = String(entry.clock_source || 'server');
            snapshotRow.clock_in_request_id = String(entry.clock_in_request_id || '');
            snapshotRow.punch_exception_id = String(entry.punch_exception_id || '');
            snapshotRow.missed_clock_in_reported_at = String(entry.missed_clock_in_reported_at || '');
            const lateClockIn = await canonicalLateClockInPayrollProvenance({
              entry, approvalEvidence, auditEntity, punchExceptionEntity, correctionRequestEntity, requireCurrentResolution: true,
              payrollGenerationContext: {
                period_id: period.id,
                prior_generations: history,
              },
              expectedProvenance: current.shift_manifest?.find((row: any) => String(row.id || '') === String(entry.id || ''))?.late_clock_in_provenance || null,
            });
            if (lateClockIn.applicable && !lateClockIn.provenance) {
              return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll missed Clock In provenance no longer matches authoritative evidence.', pay_period_id: period.id, generations: [] });
            }
            snapshotRow.late_clock_in_provenance = lateClockIn.provenance;
          }
          snapshotRows.push(snapshotRow);
          shiftEvidence.push({ ...snapshotRow, lunch_minutes: Number(entry.lunch_minutes || 0), notes: entry.notes || '', pay_period_locked_at: entry.pay_period_locked_at || '', pay_period_locked_by: asEmail(entry.pay_period_locked_by) });
        }
        const evidenceHash = await payloadHash(snapshotRows);
        if (!String(current.entry_snapshot_hash || '') || !constantTimeEqual(String(current.entry_snapshot_hash), evidenceHash)) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll shift evidence does not reproduce the finalized snapshot hash.', pay_period_id: period.id, generations: [] });
        const currentReconciliation = reconcileShiftEvidence(snapshotRows, current);
        if (!currentReconciliation.verified) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll employee reconciliation failed.', pay_period_id: period.id, generations: [] });
        if (Number(current.snapshot_version || 0) >= 7) {
          const currentApprovers = [...new Set(snapshotRows.map((row: any) => asEmail(row.approval_evidence?.approved_by)).filter(Boolean))].sort();
          const expectedOverlap = currentApprovers.includes(asEmail(current.locked_by));
          if (JSON.stringify(currentApprovers) !== JSON.stringify(current.approving_managers || []) || expectedOverlap !== (current.finalizer_approval_overlap === true)) return Response.json({ success: true, verified: false, legacy: false, error: 'Current payroll finalizer/approver provenance failed verification.', pay_period_id: period.id, generations: [] });
        }
        generations.push({
          generation: history.length + 1, state: 'active', snapshot_version: Number(current.snapshot_version || 0), finalized_at: current.lock_timestamp || '', finalized_by: current.locked_by || '',
          entry_count: Number(current.entry_count || 0), employee_count: Number(current.employee_count || 0), total_hours: Number(current.total_hours || 0),
          request_id: current.request_id || '', entry_snapshot_hash: current.entry_snapshot_hash || '',
          shift_evidence_verified: true, shift_evidence_hash: evidenceHash, shifts: shiftEvidence,
          employee_reconciliation: currentReconciliation,
          ...(Number(current.snapshot_version || 0) >= 7 ? { approving_managers: current.approving_managers || [], finalizer_approval_overlap: current.finalizer_approval_overlap === true } : {}),
          ...(Number(current.snapshot_version || 0) >= 8 ? { supersedes_generation_request_id: current.supersedes_generation_request_id || '', authorized_by_reopen_request_id: current.authorized_by_reopen_request_id || '' } : {}),
          ...(Number(current.snapshot_version || 0) >= 9 ? { generation_changes: current.generation_changes || [], generation_change_count: Number(current.generation_change_count || 0), generation_reopen_reason: current.generation_reopen_reason || '' } : {}),
          ...(Number(current.snapshot_version || 0) >= 17 ? { generation_audit_reconciliation: current.generation_audit_reconciliation || [], generation_audit_reconciliation_count: Number(current.generation_audit_reconciliation_count || 0) } : {}),
        });
      }
      return Response.json({
        success: true, verified: true, legacy: false, pay_period_id: period.id, period_status: period.status,
        period: { id: period.id, label: period.label || '', start_date: period.start_date || '', end_date: period.end_date || '' },
        verified_at: new Date().toISOString(), generations,
      });
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
        if (stillLocked.length !== 0) return false;
        return invalidateReopenedFinalizationSnapshot();
      };

      const acquireReopenMutationGates = async () => {
        const gateEntryId = `pay_period_reopen:${period.id}`;
        const gates: Array<{ stateId: string; claimToken: string }> = [];
        const authorizedEmployees = await authorized.filter({});
        if (!Array.isArray(authorizedEmployees)) throw new Error('Authorized employee lookup did not return a record list.');
        const employeeEmails = authorizedEmployees.map((employee: any) => asEmail(employee.email));
        if (employeeEmails.some((email: string) => !email) || new Set(employeeEmails).size !== employeeEmails.length) {
          return { acquired: false, error: 'Authorized employee identities are incomplete or duplicated. Admin investigation is required before reopening payroll.' };
        }
        authorizedEmployees.sort((a: any, b: any) => asEmail(a.email).localeCompare(asEmail(b.email)));
        for (const employee of authorizedEmployees) {
          const employeeState = await ensureState(stateEntity, employee);
          const claimed = await claimCorrectionCreateLock(
            stateEntity, employeeState.id, requestId, gateEntryId, statusPayloadHash,
          );
          if (!claimed?.acquired) {
            let releaseFailed = false;
            for (const gate of gates.reverse()) {
              const released = await releaseCorrectionCreateLock(
                stateEntity, gate.stateId, requestId, gateEntryId, statusPayloadHash, gate.claimToken,
              ).catch(() => false);
              if (!released) releaseFailed = true;
            }
            return {
              acquired: false,
              retry_same_request: true,
              error: releaseFailed
                ? 'A payroll reopen gate conflicted and previously acquired employee gates could not be fully released. Retry this same reopen request or request admin investigation.'
                : 'An employee correction or manager approval is in progress. Retry this same reopen request after that action finishes.',
            };
          }
          gates.push({ stateId: employeeState.id, claimToken: String(claimed.claim_token || '') });
        }
        return { acquired: true, gateEntryId, gates };
      };

      const releaseReopenMutationGates = async (gateBundle: any) => {
        if (!gateBundle?.acquired) return true;
        let releaseFailed = false;
        for (const gate of [...gateBundle.gates].reverse()) {
          try {
            const released = await releaseCorrectionCreateLock(
              stateEntity, gate.stateId, requestId, gateBundle.gateEntryId, statusPayloadHash, gate.claimToken,
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
        return !releaseFailed;
      };

      const invalidateReopenedFinalizationSnapshot = async () => {
        const summary = period.finalized_summary;
        if (!summary || typeof summary !== 'object') return false;
        if (summary.snapshot_active === false && String(summary.invalidated_by_reopen_request_id || '') === requestId) return true;
        const invalidatedSummary = {
          ...summary,
          snapshot_active: false,
          invalidated_at: new Date().toISOString(),
          invalidated_by: actorEmail,
          invalidated_by_role: String(actor.role || ''),
          invalidation_authentication_method: 'session',
          invalidated_by_reopen_request_id: requestId,
          invalidation_reason: note,
        };
        const existingHistory = Array.isArray(period.finalized_summary_history) ? period.finalized_summary_history : [];
        const historyAlreadyRecorded = existingHistory.some((item: any) =>
          String(item?.request_id || '') === String(summary.request_id || '') &&
          String(item?.invalidated_by_reopen_request_id || '') === requestId
        );
        const finalizedSummaryHistory = historyAlreadyRecorded ? existingHistory : [...existingHistory, invalidatedSummary];
        const invalidated = await payPeriodEntity.updateMany(
          { id: period.id, status: 'review', last_request_id: requestId },
          { $set: { finalized_summary: invalidatedSummary, finalized_summary_history: finalizedSummaryHistory } },
        );
        if (!invalidated || invalidated.updated !== 1) {
          const latest = await payPeriodEntity.get(period.id).catch(() => null);
          return Boolean(latest?.status === 'review' &&
            String(latest.last_request_id || '') === requestId &&
            latest.finalized_summary?.snapshot_active === false &&
            String(latest.finalized_summary?.invalidated_by_reopen_request_id || '') === requestId);
        }
        period = await payPeriodEntity.get(period.id);
        return true;
      };

      if (decision === 'reopen' && period.status === 'review' && String(period.last_request_id || '') === requestId) {
        const reopenGates = await acquireReopenMutationGates();
        if (!reopenGates?.acquired) return Response.json({ success: false, retry_same_request: true, error: reopenGates?.error || 'Payroll reopen could not acquire employee mutation gates.' }, { status: 409 });
        try {
          if (!await unlockFinalizedPeriodEntries()) return Response.json({ success: false, retry_same_request: true, error: 'The period was reopened but its original entry locks could not be safely cleared. Retry the same reopen action or request admin investigation.' }, { status: 409 });
        } finally {
          if (!await releaseReopenMutationGates(reopenGates)) throw new Error('A payroll reopen employee gate could not be released safely. Retry this same reopen request for recovery.');
        }
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
          if (Number(period.finalized_summary?.snapshot_version || 0) >= 2) {
            const currentHistory = Array.isArray(period.finalized_summary_history) ? period.finalized_summary_history : [];
            const currentHistoryHash = await payloadHash(currentHistory);
            const expectedChainHash = await payloadHash({
              entry_count: period.finalized_summary.entry_count,
              employee_count: period.finalized_summary.employee_count,
              total_hours: period.finalized_summary.total_hours,
              lock_timestamp: period.finalized_summary.lock_timestamp,
              locked_by: period.finalized_summary.locked_by,
              request_id: period.finalized_summary.request_id,
              snapshot_version: period.finalized_summary.snapshot_version,
              entry_snapshot_hash: period.finalized_summary.entry_snapshot_hash,
              previous_history_hash: period.finalized_summary.previous_history_hash,
              ...(Number(period.finalized_summary.snapshot_version || 0) >= 3 ? { shift_manifest_hash: period.finalized_summary.shift_manifest_hash } : {}),
              ...(Number(period.finalized_summary.snapshot_version || 0) >= 7 ? {
                approving_managers: Array.isArray(period.finalized_summary.approving_managers) ? period.finalized_summary.approving_managers : [],
                finalizer_approval_overlap: period.finalized_summary.finalizer_approval_overlap === true,
              } : {}),
              ...(Number(period.finalized_summary.snapshot_version || 0) >= 8 ? {
                supersedes_generation_request_id: String(period.finalized_summary.supersedes_generation_request_id || ''),
                authorized_by_reopen_request_id: String(period.finalized_summary.authorized_by_reopen_request_id || ''),
              } : {}),
              ...(Number(period.finalized_summary.snapshot_version || 0) >= 9 ? {
                generation_changes_hash: String(period.finalized_summary.generation_changes_hash || ''),
                generation_change_count: Number(period.finalized_summary.generation_change_count || 0),
                generation_reopen_reason: String(period.finalized_summary.generation_reopen_reason || ''),
              } : {}),
              ...(Number(period.finalized_summary.snapshot_version || 0) >= 12 ? {
                generation_causal_window_start: String(period.finalized_summary.generation_causal_window_start || ''),
                generation_causal_window_end: String(period.finalized_summary.generation_causal_window_end || ''),
              } : {}),
              ...(Number(period.finalized_summary.snapshot_version || 0) >= 17 ? {
                generation_audit_reconciliation_hash: String(period.finalized_summary.generation_audit_reconciliation_hash || ''),
                generation_audit_reconciliation_count: Number(period.finalized_summary.generation_audit_reconciliation_count || 0),
              } : {}),
              ...(Number(period.finalized_summary.snapshot_version || 0) >= 21 ? {
                generation_membership_discovery_hash: String(period.finalized_summary.generation_membership_discovery_hash || ''),
                generation_membership_discovery_count: Number(period.finalized_summary.generation_membership_discovery_count || 0),
              } : {}),
            });
            if (!constantTimeEqual(String(period.finalized_summary?.previous_history_hash || ''), currentHistoryHash) ||
                !constantTimeEqual(String(period.finalized_summary?.snapshot_chain_hash || ''), expectedChainHash)) {
              return Response.json({ success: false, error: 'The finalized payroll snapshot history chain is invalid. Admin investigation is required.' }, { status: 409 });
            }
          }
          if (Number(period.finalized_summary?.snapshot_version || 0) >= 1) {
            const recoverySnapshotRows = [];
            for (const entry of [...committedLocks].sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))) {
              let approvalEvidence = null;
              if (entry.approval_request_id) {
                const evidence = await auditEntity.filter({ action: 'time_approval', request_id: entry.approval_request_id });
                if (!Array.isArray(evidence) || evidence.length !== 1 || !['confirmed', 'recovered'].includes(String(evidence[0]?.outcome || '')) ||
                    String(evidence[0]?.time_entry_id || '') !== String(entry.id || '')) {
                  return Response.json({ success: false, error: 'A finalized shift no longer has its exact approval evidence. Admin investigation is required.' }, { status: 409 });
                }
                approvalEvidence = { id: evidence[0].id, request_id: entry.approval_request_id, outcome: evidence[0].outcome };
                if (Number(period.finalized_summary?.snapshot_version || 0) >= 4) {
                  approvalEvidence.approved_by = asEmail(evidence[0].actor_email);
                  approvalEvidence.approved_at = evidence[0].server_timestamp || '';
                  if (!approvalEvidence.approved_by || !approvalEvidence.approved_at) return Response.json({ success: false, error: 'A finalized shift no longer has complete approval provenance. Admin investigation is required.' }, { status: 409 });
                }
                if (Number(period.finalized_summary?.snapshot_version || 0) >= 5) {
                  approvalEvidence.approver_role = String(evidence[0].actor_role || '');
                  approvalEvidence.authentication_method = String(evidence[0].authentication_method || '');
                  if (approvalEvidence.approver_role !== 'admin' || !['session', 'admin_kiosk'].includes(approvalEvidence.authentication_method)) return Response.json({ success: false, error: 'A finalized shift no longer proves authorized manager approval. Admin investigation is required.' }, { status: 409 });
                }
                if (Number(period.finalized_summary?.snapshot_version || 0) >= 6) {
                  approvalEvidence.independent_review = asEmail(evidence[0].actor_email) !== asEmail(entry.user_email);
                  if (!approvalEvidence.independent_review) return Response.json({ success: false, error: 'A finalized shift no longer proves independent manager approval. Admin investigation is required.' }, { status: 409 });
                }
              }
              const recoverySnapshotRow: any = {
                id: entry.id, user_email: asEmail(entry.user_email), clock_in: entry.clock_in, clock_out: entry.clock_out,
                total_hours: Number(entry.total_hours || 0), approval_status: entry.approval_status,
                approval_request_id: entry.approval_request_id || '', approval_evidence: approvalEvidence,
              };
              if (Number(period.finalized_summary?.snapshot_version || 0) >= 27) {
                recoverySnapshotRow.clock_source = String(entry.clock_source || 'server');
                recoverySnapshotRow.clock_in_request_id = String(entry.clock_in_request_id || '');
                recoverySnapshotRow.punch_exception_id = String(entry.punch_exception_id || '');
                recoverySnapshotRow.missed_clock_in_reported_at = String(entry.missed_clock_in_reported_at || '');
                const finalizedHistory = Array.isArray(period.finalized_summary_history) ? period.finalized_summary_history : [];
                const lateClockIn = await canonicalLateClockInPayrollProvenance({
                  entry, approvalEvidence, auditEntity, punchExceptionEntity, correctionRequestEntity, requireCurrentResolution: true,
                  payrollGenerationContext: {
                    period_id: period.id,
                    prior_generations: finalizedHistory,
                  },
                });
                if (lateClockIn.applicable && !lateClockIn.provenance) {
                  return Response.json({ success: false, error: 'The finalized payroll missed Clock In evidence is invalid. Admin investigation is required.' }, { status: 409 });
                }
                recoverySnapshotRow.late_clock_in_provenance = lateClockIn.provenance;
              }
              recoverySnapshotRows.push(recoverySnapshotRow);
            }
            const recoverySnapshotHash = await payloadHash(recoverySnapshotRows);
            if (!String(period.finalized_summary?.entry_snapshot_hash || '') ||
                !constantTimeEqual(String(period.finalized_summary.entry_snapshot_hash), recoverySnapshotHash)) {
              return Response.json({ success: false, error: 'The finalized payroll snapshot no longer matches its locked entries or approval evidence. Admin investigation is required.' }, { status: 409 });
            }
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
        if (Number(period.finalized_summary?.snapshot_version || 0) >= 2) {
          const currentHistory = Array.isArray(period.finalized_summary_history) ? period.finalized_summary_history : [];
          const currentHistoryHash = await payloadHash(currentHistory);
          const expectedChainHash = await payloadHash({
            entry_count: period.finalized_summary.entry_count,
            employee_count: period.finalized_summary.employee_count,
            total_hours: period.finalized_summary.total_hours,
            lock_timestamp: period.finalized_summary.lock_timestamp,
            locked_by: period.finalized_summary.locked_by,
            request_id: period.finalized_summary.request_id,
            snapshot_version: period.finalized_summary.snapshot_version,
            entry_snapshot_hash: period.finalized_summary.entry_snapshot_hash,
            previous_history_hash: period.finalized_summary.previous_history_hash,
            ...(Number(period.finalized_summary.snapshot_version || 0) >= 3 ? { shift_manifest_hash: period.finalized_summary.shift_manifest_hash } : {}),
            ...(Number(period.finalized_summary.snapshot_version || 0) >= 7 ? {
              approving_managers: Array.isArray(period.finalized_summary.approving_managers) ? period.finalized_summary.approving_managers : [],
              finalizer_approval_overlap: period.finalized_summary.finalizer_approval_overlap === true,
            } : {}),
            ...(Number(period.finalized_summary.snapshot_version || 0) >= 8 ? {
              supersedes_generation_request_id: String(period.finalized_summary.supersedes_generation_request_id || ''),
              authorized_by_reopen_request_id: String(period.finalized_summary.authorized_by_reopen_request_id || ''),
            } : {}),
            ...(Number(period.finalized_summary.snapshot_version || 0) >= 9 ? {
              generation_changes_hash: String(period.finalized_summary.generation_changes_hash || ''),
              generation_change_count: Number(period.finalized_summary.generation_change_count || 0),
              generation_reopen_reason: String(period.finalized_summary.generation_reopen_reason || ''),
            } : {}),
            ...(Number(period.finalized_summary.snapshot_version || 0) >= 12 ? {
              generation_causal_window_start: String(period.finalized_summary.generation_causal_window_start || ''),
              generation_causal_window_end: String(period.finalized_summary.generation_causal_window_end || ''),
            } : {}),
            ...(Number(period.finalized_summary.snapshot_version || 0) >= 17 ? {
              generation_audit_reconciliation_hash: String(period.finalized_summary.generation_audit_reconciliation_hash || ''),
              generation_audit_reconciliation_count: Number(period.finalized_summary.generation_audit_reconciliation_count || 0),
            } : {}),
            ...(Number(period.finalized_summary.snapshot_version || 0) >= 21 ? {
              generation_membership_discovery_hash: String(period.finalized_summary.generation_membership_discovery_hash || ''),
              generation_membership_discovery_count: Number(period.finalized_summary.generation_membership_discovery_count || 0),
            } : {}),
          });
          if (!constantTimeEqual(String(period.finalized_summary?.previous_history_hash || ''), currentHistoryHash) ||
              !constantTimeEqual(String(period.finalized_summary?.snapshot_chain_hash || ''), expectedChainHash)) {
            return Response.json({ success: false, error: 'Payroll snapshot history integrity failed. Admin investigation is required before reopening.' }, { status: 409 });
          }
        }
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
        let approvalEvidenceMissing: any[] = [];
        for (const approvedEntry of completedEntries.filter((row: any) => row.approval_status === 'approved' && row.approval_request_id)) {
          const evidence = await auditEntity.filter({ action: 'time_approval', request_id: approvedEntry.approval_request_id });
          if (!Array.isArray(evidence) || evidence.length !== 1 || !['confirmed', 'recovered'].includes(String(evidence[0]?.outcome || '')) || String(evidence[0]?.time_entry_id || '') !== String(approvedEntry.id || '')) approvalEvidenceMissing.push(approvedEntry);
        }
        let lockedElsewhere = completedEntries.filter((entry: any) => entryIsPayPeriodLocked(entry) && entry.pay_period_id !== period.id);
        let activeCorrections = await correctionRequestEntity.filter({ status: { $in: ['pending', 'reviewing'] } });
        if (!Array.isArray(activeCorrections)) throw new Error('Correction readiness lookup did not return a record list.');
        let periodEntryIds = new Set(periodEntries.map((entry: any) => entry.id));
        let pendingCorrections = activeCorrections.filter((request: any) => periodEntryIds.has(request.time_entry_id));

        if (activeOverlap.length || unapproved.length || approvalEvidenceMissing.length || pendingCorrections.length || lockedElsewhere.length) {
          if (!await releaseStagedPeriodLocks()) return Response.json({ success: false, retry_same_request: true, error: 'Finalization is blocked and its staged entry locks could not be safely cleared. Retry the same request or request admin investigation.' }, { status: 409 });
          await auditEntity.updateMany({ id: intent.id, outcome: 'pending' }, { $set: {
            outcome: 'blocked', details: {
              ...(intent.details || {}), payload_hash: statusPayloadHash, pay_period_id: period.id, decision, note,
              active_shift_count: activeOverlap.length, invalid_active_clock_in_count: invalidActiveClockInCount,
              unapproved_count: unapproved.length, approval_evidence_missing_count: approvalEvidenceMissing.length,
              pending_correction_count: pendingCorrections.length, locked_elsewhere_count: lockedElsewhere.length,
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
          approvalEvidenceMissing = [];
          for (const approvedEntry of completedEntries.filter((row: any) => row.approval_status === 'approved' && row.approval_request_id)) {
            const evidence = await auditEntity.filter({ action: 'time_approval', request_id: approvedEntry.approval_request_id });
            if (!Array.isArray(evidence) || evidence.length !== 1 || !['confirmed', 'recovered'].includes(String(evidence[0]?.outcome || '')) ||
                String(evidence[0]?.time_entry_id || '') !== String(approvedEntry.id || '')) approvalEvidenceMissing.push(approvedEntry);
          }
          lockedElsewhere = completedEntries.filter((entry: any) => entryIsPayPeriodLocked(entry) && entry.pay_period_id !== period.id);
          activeCorrections = await correctionRequestEntity.filter({ status: { $in: ['pending', 'reviewing'] } });
          if (!Array.isArray(activeCorrections)) throw new Error('Post-gate correction readiness lookup did not return a record list.');
          periodEntryIds = new Set(periodEntries.map((entry: any) => entry.id));
          pendingCorrections = activeCorrections.filter((request: any) => periodEntryIds.has(request.time_entry_id));

          if (activeOverlap.length || unapproved.length || approvalEvidenceMissing.length || pendingCorrections.length || lockedElsewhere.length) {
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
                  approval_evidence_missing_count: approvalEvidenceMissing.length,
                  pending_correction_count: pendingCorrections.length,
                  locked_elsewhere_count: lockedElsewhere.length,
                },
              } },
            );
            return Response.json({
              success: false,
              error: `Pay-period readiness changed during finalization: ${activeOverlap.length} active shift(s)${invalidActiveClockInCount ? ` (${invalidActiveClockInCount} missing or invalid clock-in timestamp)` : ''}, ${unapproved.length} unapproved shift(s), ${approvalEvidenceMissing.length} shift(s) missing approval evidence, ${pendingCorrections.length} pending correction(s), ${lockedElsewhere.length} conflicting lock(s). Reload and review before finalizing again.`,
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
        const snapshotRows = [];
        for (const entry of [...confirmedLocks].sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))) {
          let approvalEvidence = null;
          if (entry.approval_request_id) {
            const evidence = await auditEntity.filter({ action: 'time_approval', request_id: entry.approval_request_id });
            if (!Array.isArray(evidence) || evidence.length !== 1 || !['confirmed', 'recovered'].includes(String(evidence[0]?.outcome || '')) ||
                String(evidence[0]?.time_entry_id || '') !== String(entry.id || '')) {
              return Response.json({ success: false, retry_same_request: true, error: 'Shift approval evidence changed before the payroll snapshot could be committed. Retry this finalization after review.' }, { status: 409 });
            }
            approvalEvidence = {
              id: evidence[0].id, request_id: entry.approval_request_id, outcome: evidence[0].outcome,
              approved_by: asEmail(evidence[0].actor_email), approved_at: evidence[0].server_timestamp || '',
              approver_role: String(evidence[0].actor_role || ''), authentication_method: String(evidence[0].authentication_method || ''),
              independent_review: asEmail(evidence[0].actor_email) !== asEmail(entry.user_email),
            };
            if (!approvalEvidence.approved_by || !approvalEvidence.approved_at) {
              return Response.json({ success: false, retry_same_request: true, error: 'Shift approval provenance is incomplete. Approval manager and server timestamp are required before payroll finalization.' }, { status: 409 });
            }
            if (!approvalEvidence.independent_review) {
              return Response.json({ success: false, error: 'A shift in this pay period requires independent approval by another administrator before payroll can be finalized.' }, { status: 409 });
            }
          }
          snapshotRows.push({
            id: entry.id, user_email: asEmail(entry.user_email), clock_in: entry.clock_in, clock_out: entry.clock_out,
            total_hours: Number(entry.total_hours || 0), approval_status: entry.approval_status,
            approval_request_id: entry.approval_request_id || '', approval_evidence: approvalEvidence,
          });
        }
        const hasApprovalProvenance = snapshotRows.every((row: any) => row.approval_evidence?.approved_by && row.approval_evidence?.approved_at);
        const hasApprovalAuthority = hasApprovalProvenance && snapshotRows.every((row: any) =>
          row.approval_evidence?.approver_role === 'admin' &&
          ['session', 'admin_kiosk'].includes(String(row.approval_evidence?.authentication_method || ''))
        );
        const hasIndependentApproval = hasApprovalAuthority && snapshotRows.every((row: any) => asEmail(row.approval_evidence?.approved_by) !== asEmail(row.user_email));
        const snapshotVersion = hasIndependentApproval ? 28 : hasApprovalAuthority ? 5 : hasApprovalProvenance ? 4 : 3;
        if (snapshotVersion >= 27) {
          const confirmedEntryById = new Map(confirmedLocks.map((entry: any) => [String(entry.id || ''), entry]));
          for (const row of snapshotRows) {
            const sourceEntry = confirmedEntryById.get(String(row.id || ''));
            if (!sourceEntry?.id) return Response.json({ success: false, error: 'Final payroll shift provenance could not be reconstructed from its locked TimeEntry.' }, { status: 409 });
            row.clock_source = String(sourceEntry.clock_source || 'server');
            row.clock_in_request_id = String(sourceEntry.clock_in_request_id || '');
            row.punch_exception_id = String(sourceEntry.punch_exception_id || '');
            row.missed_clock_in_reported_at = String(sourceEntry.missed_clock_in_reported_at || '');
            const finalizationHistory = Array.isArray(period.finalized_summary_history) ? period.finalized_summary_history : [];
            const lateClockIn = await canonicalLateClockInPayrollProvenance({
              entry: sourceEntry, approvalEvidence: row.approval_evidence,
              auditEntity, punchExceptionEntity, correctionRequestEntity, requireCurrentResolution: true,
              payrollGenerationContext: {
                period_id: period.id,
                prior_generations: finalizationHistory,
              },
            });
            if (lateClockIn.applicable && !lateClockIn.provenance) {
              return Response.json({ success: false, error: 'Employee-attested missed Clock In evidence could not be verified before payroll finalization.' }, { status: 409 });
            }
            row.late_clock_in_provenance = lateClockIn.provenance;
          }
        }
        if (snapshotVersion < 5) {
          for (const row of snapshotRows) {
            if (row.approval_evidence) {
              delete row.approval_evidence.approver_role;
              delete row.approval_evidence.authentication_method;
            }
          }
        }
        if (snapshotVersion < 4) {
          for (const row of snapshotRows) {
            if (row.approval_evidence) row.approval_evidence = { id: row.approval_evidence.id, request_id: row.approval_evidence.request_id, outcome: row.approval_evidence.outcome };
          }
        }
        if (snapshotVersion >= 28 &&
            !await payrollCorrectionRequestIdentityIsUnique(auditEntity, snapshotRows, lockTimestamp)) {
          if (!await releaseStagedPeriodLocks()) {
            return Response.json({ success: false, retry_same_request: true, error: 'Conflicting manager-correction audit identity blocked payroll, but staged locks need recovery. Retry the same finalization.' }, { status: 409 });
          }
          return Response.json({ success: false, error: 'Duplicate or conflicting confirmed manager-correction request IDs require investigation before payroll finalization.' }, { status: 409 });
        }
        const entrySnapshotHash = await payloadHash(snapshotRows);
        const totalHours = completedEntries.reduce((sum: number, entry: any) => sum + Number(entry.total_hours || 0), 0);
        const priorHistory = Array.isArray(period.finalized_summary_history) ? period.finalized_summary_history : [];
        const previousHistoryHash = await payloadHash(priorHistory);
        const supersededGeneration = priorHistory.length ? priorHistory[priorHistory.length - 1] : null;
        const supersedesGenerationRequestId = String(supersededGeneration?.request_id || '');
        const authorizedByReopenRequestId = String(supersededGeneration?.invalidated_by_reopen_request_id || '');
        const generationCausalWindowStart = String(supersededGeneration?.invalidated_at || '');
        const generationCausalWindowEnd = lockTimestamp;
        if (supersededGeneration && (!supersedesGenerationRequestId || !authorizedByReopenRequestId || !generationCausalWindowStart ||
            !Number.isFinite(Date.parse(generationCausalWindowStart)) || !Number.isFinite(Date.parse(generationCausalWindowEnd)) ||
            Date.parse(generationCausalWindowStart) > Date.parse(generationCausalWindowEnd))) {
          return Response.json({ success: false, error: 'The prior payroll generation is missing valid authoritative reopen/finalization boundaries. Admin investigation is required before re-finalization.' }, { status: 409 });
        }
        const generationChanges = [];
        if (supersededGeneration) {
          const priorRows = Array.isArray(supersededGeneration.shift_manifest) ? supersededGeneration.shift_manifest : [];
          const priorById = new Map(priorRows.map((row: any) => [String(row.id || ''), row]));
          const currentById = new Map(snapshotRows.map((row: any) => [String(row.id || ''), row]));
          const currentEntryById = new Map(confirmedLocks.map((row: any) => [String(row.id || ''), row]));
          const correctionSubmissionEvidence = async (correction: any, timeEntryId: string) => {
            const submissionRequestId = String(correction?.request_id || '');
            if (!correction?.id || !submissionRequestId) return null;
            const submissionRows = await auditEntity.filter({
              action: 'correction_request', request_id: submissionRequestId, time_entry_id: timeEntryId,
            });
            if (!Array.isArray(submissionRows) || submissionRows.length !== 1) return null;
            const submissionAudit = submissionRows[0];
            const requested = correction.requested_changes || {};
            const submissionVersion = String(
              String(correction.request_kind || '') === 'missed_clock_out'
                ? correction.time_entry_updated_date || ''
                : correction.original_snapshot?.updated_date || correction.time_entry_updated_date || ''
            );
            if (!submissionVersion) return null;
            const expectedHash = await payloadHash({
              entry_id: correction.time_entry_id,
              expected_updated_date: submissionVersion,
              reason: correction.employee_reason,
              requested_changes: requested,
            });
            const auditRequested = submissionAudit.details?.requested_changes || {};
            const submittedAt = Date.parse(String(submissionAudit.server_timestamp || ''));
            const requestedAt = Date.parse(String(correction.requested_at || ''));
            const reviewedAt = Date.parse(String(correction.reviewed_at || ''));
            const actorRole = String(submissionAudit.actor_role || '');
            const authenticationMethod = String(submissionAudit.authentication_method || '');
            if (!submissionAudit?.id || !['confirmed', 'recovered'].includes(String(submissionAudit.outcome || '')) ||
                asEmail(submissionAudit.user_email) !== asEmail(correction.user_email) ||
                asEmail(submissionAudit.actor_email) !== asEmail(correction.user_email) ||
                !actorRole || !['session', 'badge'].includes(authenticationMethod) ||
                (actorRole === 'badge') !== (authenticationMethod === 'badge') ||
                String(submissionAudit.reason || '') !== String(correction.employee_reason || '') ||
                String(submissionAudit.details?.correction_request_id || '') !== String(correction.id || '') ||
                !constantTimeEqual(String(submissionAudit.details?.payload_hash || ''), expectedHash) ||
                String(auditRequested.clock_in || '') !== String(requested.clock_in || '') ||
                String(auditRequested.clock_out || '') !== String(requested.clock_out || '') ||
                Number(auditRequested.lunch_minutes || 0) !== Number(requested.lunch_minutes || 0) ||
                String(auditRequested.notes || '') !== String(requested.notes || '') ||
                !Number.isFinite(submittedAt) || !Number.isFinite(requestedAt) || !Number.isFinite(reviewedAt) ||
                submittedAt < requestedAt || submittedAt > reviewedAt) return null;
            return { audit: submissionAudit, payload_hash: expectedHash };
          };
          const correctionOriginEvidence = async (correction: any, timeEntryId: string, submissionEvidence: any, appliedAuditId: string) => {
            const requestKind = String(correction?.request_kind || 'standard');
            if (requestKind === 'standard') return { request_kind: requestKind, punch: null };
            if (requestKind !== 'missed_clock_out') return null;
            const punchExceptionId = String(correction?.punch_exception_id || '');
            if (!punchExceptionId || !String(correction?.request_id || '')) return null;
            const punchCase = await punchExceptionEntity.get(punchExceptionId).catch(() => null);
            const punchRows = await auditEntity.filter({
              action: 'punch_exception', request_id: String(correction.request_id || ''), time_entry_id: timeEntryId,
            });
            if (!punchCase?.id || !Array.isArray(punchRows) || punchRows.length !== 1) return null;
            const punchAudit = punchRows[0];
            const requested = correction.requested_changes || {};
            const claimedClockOut = String(requested.clock_out || '');
            const expectedPunchHash = await payloadHash({
              action: 'resolve_punch_exception', user_email: asEmail(correction.user_email),
              time_entry_id: correction.time_entry_id, response: 'missed_clock_out',
              claimed_clock_out: claimedClockOut || null,
            });
            const originalSnapshotHash = await payloadHash(correction.original_snapshot || {});
            const punchAuditTime = Date.parse(String(punchAudit.server_timestamp || ''));
            const requestedAt = Date.parse(String(correction.requested_at || ''));
            const reviewedAt = Date.parse(String(correction.reviewed_at || ''));
            const actorRole = String(punchAudit.actor_role || '');
            const authenticationMethod = String(punchAudit.authentication_method || '');
            if (
              String(punchCase.id || '') !== punchExceptionId ||
              String(punchCase.case_key || '') !== `missed_clock_out:${timeEntryId}` ||
              asEmail(punchCase.user_email) !== asEmail(correction.user_email) ||
              String(punchCase.time_entry_id || '') !== timeEntryId ||
              String(punchCase.exception_type || '') !== 'missed_clock_out' ||
              String(punchCase.status || '') !== 'resolved' ||
              String(punchCase.employee_response || '') !== 'missed_clock_out' ||
              String(punchCase.claimed_clock_out || '') !== claimedClockOut ||
              String(punchCase.request_id || '') !== String(correction.request_id || '') ||
              String(punchCase.correction_request_id || '') !== String(correction.id || '') ||
              String(punchCase.resolution_audit_id || '') !== appliedAuditId ||
              !constantTimeEqual(await payloadHash(punchCase.original_snapshot || {}), originalSnapshotHash) ||
              String(punchCase.detected_clock_in || '') !== String(correction.original_snapshot?.clock_in || '') ||
              !punchAudit?.id || !['confirmed', 'recovered'].includes(String(punchAudit.outcome || '')) ||
              asEmail(punchAudit.user_email) !== asEmail(correction.user_email) ||
              asEmail(punchAudit.actor_email) !== asEmail(correction.user_email) ||
              !actorRole || !['session', 'badge'].includes(authenticationMethod) ||
              (actorRole === 'badge') !== (authenticationMethod === 'badge') ||
              String(punchAudit.reason || '') !== String(correction.employee_reason || '') ||
              String(punchAudit.details?.punch_exception_id || '') !== punchExceptionId ||
              String(punchAudit.details?.correction_request_id || '') !== String(correction.id || '') ||
              String(punchAudit.details?.response || '') !== 'missed_clock_out' ||
              String(punchAudit.details?.claimed_clock_out || '') !== claimedClockOut ||
              !constantTimeEqual(String(punchAudit.details?.payload_hash || ''), expectedPunchHash) ||
              !constantTimeEqual(await payloadHash(punchAudit.details?.original_snapshot || {}), originalSnapshotHash) ||
              String(submissionEvidence?.audit?.details?.punch_exception_id || '') !== punchExceptionId ||
              String(submissionEvidence?.audit?.details?.request_kind || '') !== 'missed_clock_out' ||
              !Number.isFinite(punchAuditTime) || !Number.isFinite(requestedAt) || !Number.isFinite(reviewedAt) ||
              punchAuditTime < requestedAt || punchAuditTime > reviewedAt
            ) return null;
            return {
              request_kind: requestKind,
              punch: { case: punchCase, audit: punchAudit, payload_hash: expectedPunchHash, original_snapshot_hash: originalSnapshotHash },
            };
          };
          const comparable = (row: any) => ({
            user_email: asEmail(row?.user_email), clock_in: row?.clock_in || '', clock_out: row?.clock_out || '',
            total_hours: Number(row?.total_hours || 0), approval_status: row?.approval_status || '',
            ...(snapshotVersion < 28 ? { approval_request_id: row?.approval_request_id || '' } : {}),
          });
          const allIds = [...new Set([...priorById.keys(), ...currentById.keys()])].filter(Boolean).sort();
          for (const id of allIds) {
            const before = priorById.get(id);
            const after = currentById.get(id);
            let change = null;
            if (!before) change = { time_entry_id: id, change_type: 'added', before: null, after: comparable(after) };
            else if (!after) change = { time_entry_id: id, change_type: 'removed', before: comparable(before), after: null };
            else {
              const beforeComparable = comparable(before);
              const afterComparable = comparable(after);
              if (!constantTimeEqual(await payloadHash(beforeComparable), await payloadHash(afterComparable))) change = { time_entry_id: id, change_type: 'changed', before: beforeComparable, after: afterComparable };
            }
            if (change) {
              const currentEntry = currentEntryById.get(id);
              const correctionRequestId = String(currentEntry?.last_correction_request_id || '');
              if (correctionRequestId) {
                const correction = await correctionRequestEntity.get(correctionRequestId).catch(() => null);
                if (correction?.id) {
                  const appliedAudit = correction.applied_audit_id ? await auditEntity.get(correction.applied_audit_id).catch(() => null) : null;
                  if (String(correction.time_entry_id || '') !== id || !['approved', 'approved_modified'].includes(String(correction.status || '')) ||
                      !appliedAudit || !['confirmed', 'recovered'].includes(String(appliedAudit.outcome || '')) || String(appliedAudit.time_entry_id || '') !== id ||
                      String(appliedAudit.details?.correction_request_id || '') !== correctionRequestId) {
                    return Response.json({ success: false, error: 'Payroll correction evidence could not be verified before finalization.' }, { status: 409 });
                  }
                  const correctionAppliedAt = String(appliedAudit.server_timestamp || '');
                  if (supersededGeneration && (!Number.isFinite(Date.parse(correctionAppliedAt)) || Date.parse(correctionAppliedAt) < Date.parse(generationCausalWindowStart) || Date.parse(correctionAppliedAt) > Date.parse(generationCausalWindowEnd))) {
                    return Response.json({ success: false, error: `Payroll correction for shift ${id} falls outside the authorized reopen-to-finalization window.` }, { status: 409 });
                  }
                  const submissionEvidence = await correctionSubmissionEvidence(correction, id);
                  if (!submissionEvidence) {
                    return Response.json({ success: false, error: 'Employee correction submission evidence could not be verified before payroll finalization.' }, { status: 409 });
                  }
                  const originEvidence = await correctionOriginEvidence(correction, id, submissionEvidence, String(appliedAudit.id || ''));
                  if (!originEvidence) {
                    return Response.json({ success: false, error: 'Correction origin evidence could not be verified before payroll finalization.' }, { status: 409 });
                  }
                  const corrected = appliedAudit.details?.corrected || {};
                  const semanticAfter = change.after || {};
                  if (change.change_type === 'removed' || String(corrected.clock_in || '') !== String(semanticAfter.clock_in || '') || String(corrected.clock_out || '') !== String(semanticAfter.clock_out || '') || Number(corrected.total_hours || 0) !== Number(semanticAfter.total_hours || 0)) return Response.json({ success: false, error: 'Correction evidence does not match resulting payroll values.' }, { status: 409 });
                  const employeeRequested = correction.requested_changes || {};
                  change.correction_provenance = {
                    correction_request_id: correctionRequestId, submission_request_id: String(correction.request_id || ''),
                    request_kind: originEvidence.request_kind,
                    submission_audit_id: String(submissionEvidence.audit.id || ''), submission_audit_outcome: String(submissionEvidence.audit.outcome || ''),
                    submission_audit_at: String(submissionEvidence.audit.server_timestamp || ''), submission_actor_role: String(submissionEvidence.audit.actor_role || ''),
                    submission_authentication_method: String(submissionEvidence.audit.authentication_method || ''), submission_payload_hash: String(submissionEvidence.payload_hash || ''),
                    requested_by: asEmail(correction.user_email), requested_at: correction.requested_at || '', employee_reason: String(correction.employee_reason || ''),
                    requested_clock_in: String(employeeRequested.clock_in || ''), requested_clock_out: String(employeeRequested.clock_out || ''),
                    requested_lunch_minutes: Number(employeeRequested.lunch_minutes || 0), requested_notes: String(employeeRequested.notes || ''),
                    review_request_id: String(correction.review_request_id || ''), review_decision: String(correction.review_decision || ''),
                    reviewed_by: asEmail(correction.reviewer_email), reviewed_at: correction.reviewed_at || '', reviewer_reason: String(correction.reviewer_reason || ''),
                    applied_audit_id: String(appliedAudit.id || ''), applied_audit_request_id: String(appliedAudit.request_id || ''),
                    applied_at: correctionAppliedAt,
                    corrected_clock_in: String(corrected.clock_in || ''), corrected_clock_out: String(corrected.clock_out || ''),
                    corrected_lunch_minutes: Number(corrected.lunch_minutes || 0), corrected_notes: String(corrected.notes || ''),
                    corrected_total_hours: Number(corrected.total_hours || 0),
                    ...(originEvidence.punch ? {
                      punch_exception_id: String(originEvidence.punch.case.id || ''),
                      punch_case_key: String(originEvidence.punch.case.case_key || ''),
                      punch_exception_status: String(originEvidence.punch.case.status || ''),
                      punch_employee_response: String(originEvidence.punch.case.employee_response || ''),
                      punch_claimed_clock_out: String(originEvidence.punch.case.claimed_clock_out || ''),
                      punch_resolution_audit_id: String(originEvidence.punch.case.resolution_audit_id || ''),
                      punch_response_audit_id: String(originEvidence.punch.audit.id || ''),
                      punch_response_audit_outcome: String(originEvidence.punch.audit.outcome || ''),
                      punch_response_audit_at: String(originEvidence.punch.audit.server_timestamp || ''),
                      punch_response_actor_role: String(originEvidence.punch.audit.actor_role || ''),
                      punch_response_authentication_method: String(originEvidence.punch.audit.authentication_method || ''),
                      punch_response_payload_hash: String(originEvidence.punch.payload_hash || ''),
                      punch_original_snapshot_hash: String(originEvidence.punch.original_snapshot_hash || ''),
                    } : {}),
                  };
                }
              }
              if (!change.correction_provenance) {
                const causalAudits = await auditEntity.filter({ time_entry_id: id });
                if (!Array.isArray(causalAudits)) return Response.json({ success: false, error: 'Payroll change audit lookup failed before finalization.' }, { status: 409 });
                const allowedActions = change.change_type === 'removed'
                  ? ['admin_archive', 'admin_correction']
                  : ['admin_correction', 'clock_in', 'clock_out', 'punch_exception'];
                const candidates = causalAudits.filter((row: any) => {
                  const occurredAt = Date.parse(String(row.server_timestamp || ''));
                  return allowedActions.includes(String(row.action || '')) &&
                    ['confirmed', 'recovered'].includes(String(row.outcome || '')) &&
                    (!supersededGeneration || (Number.isFinite(occurredAt) && occurredAt >= Date.parse(generationCausalWindowStart) && occurredAt <= Date.parse(generationCausalWindowEnd)));
                }).sort((a: any, b: any) => String(b.server_timestamp || b.updated_date || '').localeCompare(String(a.server_timestamp || a.updated_date || '')));
                if (snapshotVersion >= 28 && hasDuplicateConfirmedAdminCorrectionRequests(candidates)) {
                  return Response.json({ success: false, error: `Payroll shift ${id} has duplicate confirmed manager-correction audit requests. Admin investigation is required before finalization.` }, { status: 409 });
                }
                const semanticBefore = change.before || {};
                const semanticAfter = change.after || {};
                const semanticallyMatches = (row: any) => {
                  const action = String(row.action || '');
                  if (action === 'admin_archive') return change.change_type === 'removed';
                  if (action === 'admin_correction') {
                    const original = row.details?.original || {};
                    const corrected = row.details?.corrected || {};
                    const originalDay = dateKeyInCompanyTime(original.clock_in);
                    const correctedDay = dateKeyInCompanyTime(corrected.clock_in);
                    const originalInside = Boolean(originalDay && originalDay >= startDate && originalDay <= endDate);
                    const correctedInside = Boolean(correctedDay && correctedDay >= startDate && correctedDay <= endDate);
                    if (change.change_type === 'removed') return originalInside && !correctedInside &&
                      String(original.clock_in || '') === String(semanticBefore.clock_in || '') &&
                      String(original.clock_out || '') === String(semanticBefore.clock_out || '') &&
                      Number(original.total_hours || 0) === Number(semanticBefore.total_hours || 0);
                    if (change.change_type === 'added') return !originalInside && correctedInside &&
                      String(corrected.clock_in || '') === String(semanticAfter.clock_in || '') &&
                      String(corrected.clock_out || '') === String(semanticAfter.clock_out || '') &&
                      Number(corrected.total_hours || 0) === Number(semanticAfter.total_hours || 0);
                    return change.change_type === 'changed' && originalInside && correctedInside &&
                      String(original.clock_in || '') === String(semanticBefore.clock_in || '') &&
                      String(original.clock_out || '') === String(semanticBefore.clock_out || '') &&
                      Number(original.total_hours || 0) === Number(semanticBefore.total_hours || 0) &&
                      String(corrected.clock_in || '') === String(semanticAfter.clock_in || '') &&
                      String(corrected.clock_out || '') === String(semanticAfter.clock_out || '') &&
                      Number(corrected.total_hours || 0) === Number(semanticAfter.total_hours || 0);
                  }
                  if (action === 'clock_out') return String(row.details?.result_clock_out || '') === String(semanticAfter.clock_out || '') &&
                    Number(row.details?.total_hours || 0) === Number(semanticAfter.total_hours || 0);
                  if (action === 'clock_in') return change.change_type === 'added' &&
                    String(row.server_timestamp || '') === String(semanticAfter.clock_in || '');
                  return false;
                };
                // v28: a uniquely reconstructable chain of direct manager
                // corrections may explain the generation delta without a single
                // generation-spanning audit. Ambiguous suffixes still fail closed.
                const orderedCorrections = candidates.filter((row: any) => String(row.action || '') === 'admin_correction')
                  .sort((a: any, b: any) => Date.parse(String(a.server_timestamp || '')) - Date.parse(String(b.server_timestamp || '')) ||
                    String(a.id || '').localeCompare(String(b.id || '')));
                const terminalCorrection = orderedCorrections[orderedCorrections.length - 1];
                const multiDirect = snapshotVersion >= 28 && change.change_type === 'changed' &&
                  orderedCorrections.length > 1 && terminalCorrection &&
                  !String(terminalCorrection.details?.correction_request_id || '');
                const uniqueDirectSuffix = multiDirect
                  ? uniqueAdminCorrectionSemanticSuffix(orderedCorrections, semanticBefore, semanticAfter)
                  : null;
                if (multiDirect && (!uniqueDirectSuffix || String(uniqueDirectSuffix.terminal?.id || '') !== String(terminalCorrection.id || ''))) {
                  return Response.json({ success: false, error: `Payroll shift ${id} has missing or ambiguous direct-manager correction history. Admin investigation is required before finalization.` }, { status: 409 });
                }
                const cause = uniqueDirectSuffix?.terminal || candidates.find(semanticallyMatches);
                if (!cause?.id) return Response.json({ success: false, error: `Payroll ${change.change_type} shift ${id} has no authoritative Time Clock audit whose result matches the payroll delta. Admin investigation is required before finalization.` }, { status: 409 });
                const linkedCorrectionRequestId = String(cause.action === 'admin_correction' ? cause.details?.correction_request_id || '' : '');
                if (linkedCorrectionRequestId) {
                  const linkedCorrection = await correctionRequestEntity.get(linkedCorrectionRequestId).catch(() => null);
                  if (linkedCorrection?.id &&
                      String(linkedCorrection.time_entry_id || '') === id &&
                      ['approved', 'approved_modified'].includes(String(linkedCorrection.status || '')) &&
                      String(linkedCorrection.applied_audit_id || '') === String(cause.id || '')) {
                    const submissionEvidence = await correctionSubmissionEvidence(linkedCorrection, id);
                    if (!submissionEvidence) {
                      return Response.json({ success: false, error: 'Linked employee correction submission evidence could not be verified before payroll finalization.' }, { status: 409 });
                    }
                    const originEvidence = await correctionOriginEvidence(linkedCorrection, id, submissionEvidence, String(cause.id || ''));
                    if (!originEvidence) {
                      return Response.json({ success: false, error: 'Linked correction origin evidence could not be verified before payroll finalization.' }, { status: 409 });
                    }
                    const employeeRequested = linkedCorrection.requested_changes || {};
                    const corrected = cause.details?.corrected || {};
                    change.correction_provenance = {
                      correction_request_id: linkedCorrectionRequestId, submission_request_id: String(linkedCorrection.request_id || ''),
                      request_kind: originEvidence.request_kind,
                      submission_audit_id: String(submissionEvidence.audit.id || ''), submission_audit_outcome: String(submissionEvidence.audit.outcome || ''),
                      submission_audit_at: String(submissionEvidence.audit.server_timestamp || ''), submission_actor_role: String(submissionEvidence.audit.actor_role || ''),
                      submission_authentication_method: String(submissionEvidence.audit.authentication_method || ''), submission_payload_hash: String(submissionEvidence.payload_hash || ''),
                      requested_by: asEmail(linkedCorrection.user_email), requested_at: linkedCorrection.requested_at || '', employee_reason: String(linkedCorrection.employee_reason || ''),
                      requested_clock_in: String(employeeRequested.clock_in || ''), requested_clock_out: String(employeeRequested.clock_out || ''),
                      requested_lunch_minutes: Number(employeeRequested.lunch_minutes || 0), requested_notes: String(employeeRequested.notes || ''),
                      review_request_id: String(linkedCorrection.review_request_id || ''), review_decision: String(linkedCorrection.review_decision || ''),
                      reviewed_by: asEmail(linkedCorrection.reviewer_email), reviewed_at: linkedCorrection.reviewed_at || '', reviewer_reason: String(linkedCorrection.reviewer_reason || ''),
                      applied_audit_id: String(cause.id || ''), applied_audit_request_id: String(cause.request_id || ''), applied_at: String(cause.server_timestamp || ''),
                      corrected_clock_in: String(corrected.clock_in || ''), corrected_clock_out: String(corrected.clock_out || ''),
                      corrected_lunch_minutes: Number(corrected.lunch_minutes || 0), corrected_notes: String(corrected.notes || ''),
                      corrected_total_hours: Number(corrected.total_hours || 0),
                      ...(originEvidence.punch ? {
                        punch_exception_id: String(originEvidence.punch.case.id || ''),
                        punch_case_key: String(originEvidence.punch.case.case_key || ''),
                        punch_exception_status: String(originEvidence.punch.case.status || ''),
                        punch_employee_response: String(originEvidence.punch.case.employee_response || ''),
                        punch_claimed_clock_out: String(originEvidence.punch.case.claimed_clock_out || ''),
                        punch_resolution_audit_id: String(originEvidence.punch.case.resolution_audit_id || ''),
                        punch_response_audit_id: String(originEvidence.punch.audit.id || ''),
                        punch_response_audit_outcome: String(originEvidence.punch.audit.outcome || ''),
                        punch_response_audit_at: String(originEvidence.punch.audit.server_timestamp || ''),
                        punch_response_actor_role: String(originEvidence.punch.audit.actor_role || ''),
                        punch_response_authentication_method: String(originEvidence.punch.audit.authentication_method || ''),
                        punch_response_payload_hash: String(originEvidence.punch.payload_hash || ''),
                        punch_original_snapshot_hash: String(originEvidence.punch.original_snapshot_hash || ''),
                      } : {}),
                    };
                  }
                }
                if (!change.correction_provenance) {
                  change.action_provenance = {
                    audit_id: String(cause.id || ''), action: String(cause.action || ''), request_id: String(cause.request_id || ''),
                    outcome: String(cause.outcome || ''), actor_email: asEmail(cause.actor_email), actor_role: String(cause.actor_role || ''),
                    authentication_method: String(cause.authentication_method || ''), server_timestamp: String(cause.server_timestamp || ''),
                    reason: String(cause.reason || ''),
                    semantic_clock_in: String(change.after?.clock_in || ''),
                    semantic_clock_out: String(change.after?.clock_out || ''),
                    semantic_total_hours: Number(change.after?.total_hours || 0),
                    semantic_before_clock_in: String(cause.action === 'admin_correction' ? cause.details?.original?.clock_in || '' : change.before?.clock_in || ''),
                    semantic_before_clock_out: String(cause.action === 'admin_correction' ? cause.details?.original?.clock_out || '' : change.before?.clock_out || ''),
                    semantic_before_total_hours: Number(cause.action === 'admin_correction' ? cause.details?.original?.total_hours || 0 : change.before?.total_hours || 0),
                    semantic_after_clock_in: String(cause.action === 'admin_correction' ? cause.details?.corrected?.clock_in || '' : change.after?.clock_in || ''),
                    semantic_after_clock_out: String(cause.action === 'admin_correction' ? cause.details?.corrected?.clock_out || '' : change.after?.clock_out || ''),
                    semantic_after_total_hours: Number(cause.action === 'admin_correction' ? cause.details?.corrected?.total_hours || 0 : change.after?.total_hours || 0),
                    ...(uniqueDirectSuffix ? {
                      unique_direct_semantic_suffix: true,
                      semantic_suffix_start_audit_id: String(uniqueDirectSuffix.start_audit_id || ''),
                    } : {}),
                  };
                }
              }
              const chainAudits = await auditEntity.filter({ time_entry_id: id });
              if (!Array.isArray(chainAudits)) return Response.json({ success: false, error: 'Payroll causal-chain audit lookup failed before finalization.' }, { status: 409 });
              const relevantActions = ['admin_archive', 'admin_correction', 'clock_in', 'clock_out', 'punch_exception', 'correction_request'];
              const orderedChain = chainAudits.filter((row: any) => {
                const occurredAt = Date.parse(String(row.server_timestamp || ''));
                return relevantActions.includes(String(row.action || '')) &&
                  ['confirmed', 'recovered'].includes(String(row.outcome || '')) &&
                  Number.isFinite(occurredAt) && occurredAt >= Date.parse(generationCausalWindowStart) && occurredAt <= Date.parse(generationCausalWindowEnd);
              }).sort((a: any, b: any) => {
                const timeOrder = Date.parse(String(a.server_timestamp || '')) - Date.parse(String(b.server_timestamp || ''));
                return timeOrder || String(a.id || '').localeCompare(String(b.id || ''));
              });
              if (snapshotVersion >= 28) {
                const corrections = orderedChain.filter((row: any) => String(row.action || '') === 'admin_correction');
                for (const requestId of new Set(corrections.map((row: any) => String(row.request_id || '')))) {
                  if (!requestId) return Response.json({ success: false, error: 'Payroll correction is missing its idempotent request ID.' }, { status: 409 });
                  const matching = await auditEntity.filter({ action: 'admin_correction', request_id: requestId });
                  if (!Array.isArray(matching)) return Response.json({ success: false, error: 'Global payroll correction audit lookup failed.' }, { status: 409 });
                  const completed = matching.filter((row: any) =>
                    ['confirmed', 'recovered'].includes(String(row.outcome || '')));
                  if (completed.length !== 1 || String(completed[0]?.time_entry_id || '') !== id ||
                      !corrections.some((row: any) => String(row.id || '') === String(completed[0]?.id || ''))) {
                    return Response.json({ success: false, error: `Payroll shift ${id} has a conflicting manager-correction request ID across shifts or generations. Admin investigation is required before finalization.` }, { status: 409 });
                  }
                }
              }
              const terminalAuditId = String(change.correction_provenance?.applied_audit_id || change.action_provenance?.audit_id || '');
              if (!terminalAuditId || !orderedChain.some((row: any) => String(row.id || '') === terminalAuditId)) {
                return Response.json({ success: false, error: `Payroll change for shift ${id} is missing its semantic terminal cause from the authoritative causal chain.` }, { status: 409 });
              }
              change.causal_chain = orderedChain.map((row: any, chainIndex: number) => ({
                sequence: chainIndex + 1, audit_id: String(row.id || ''), action: String(row.action || ''),
                request_id: String(row.request_id || ''), outcome: String(row.outcome || ''),
                actor_email: asEmail(row.actor_email), actor_role: String(row.actor_role || ''),
                authentication_method: String(row.authentication_method || ''), server_timestamp: String(row.server_timestamp || ''),
                reason: String(row.reason || ''),
              }));
              change.causal_terminal_audit_id = terminalAuditId;
              generationChanges.push(change);
            }
          }
        }
        const generationChangesHash = await payloadHash(generationChanges);
        const generationAuditReconciliation = [];
        const generationMembershipDiscovery = [];
        if (supersededGeneration) {
          const relevantActions = ['admin_archive', 'admin_correction', 'clock_in', 'clock_out', 'punch_exception', 'correction_request'];
          const changedIds = new Set(generationChanges.map((change: any) => String(change.time_entry_id || '')));
          const periodEntryIdSet = new Set([
            ...(Array.isArray(supersededGeneration.shift_manifest) ? supersededGeneration.shift_manifest.map((row: any) => String(row.id || '')) : []),
            ...snapshotRows.map((row: any) => String(row.id || '')),
          ].filter(Boolean));
          if (snapshotVersion >= 18) {
            const windowAudits = await auditEntity.filter({ server_timestamp: { $gte: generationCausalWindowStart, $lte: generationCausalWindowEnd } });
            if (!Array.isArray(windowAudits)) return Response.json({ success: false, error: 'Generation-wide payroll audit discovery failed before finalization.' }, { status: 409 });
            const candidateIds = [...new Set(windowAudits.filter((row: any) =>
              relevantActions.includes(String(row.action || '')) &&
              ['confirmed', 'recovered'].includes(String(row.outcome || '')) &&
              String(row.time_entry_id || '')
            ).map((row: any) => String(row.time_entry_id || '')))];
            for (const candidateId of candidateIds) {
              if (periodEntryIdSet.has(candidateId)) continue;
              const candidateEntry = await entryEntity.get(candidateId).catch(() => null);
              let companyDate = dateKeyInCompanyTime(candidateEntry?.clock_in);
              let discoveryEvidence = null;
              if (!companyDate && snapshotVersion >= 19) {
                const membershipAudits = await auditEntity.filter({ time_entry_id: candidateId });
                if (!Array.isArray(membershipAudits)) return Response.json({ success: false, error: 'Payroll audit membership evidence could not be loaded before finalization.' }, { status: 409 });
                discoveryEvidence = snapshotVersion >= 22
                  ? canonicalPayrollMembershipEvidence(membershipAudits, snapshotVersion >= 23)
                  : membershipAudits.map((membershipAudit: any) => ({ membershipAudit, membership: payrollMembershipFromAudit(membershipAudit) })).find((candidate: any) => candidate.membership?.company_date) || null;
                if (discoveryEvidence?.conflict) return Response.json({
                  success: false,
                  error: discoveryEvidence.conflict_evidence_invalid
                    ? 'Invalid payroll membership provenance was detected. Finalization is blocked until an administrator investigates the immutable audit evidence.'
                    : 'Conflicting payroll membership evidence requires administrator investigation before finalization.',
                  conflict: discoveryEvidence.conflict_evidence_invalid
                    ? {
                      type: 'payroll_membership_evidence_invalid',
                      time_entry_id: candidateId,
                      validation: discoveryEvidence.conflict_evidence_validation,
                    }
                    : {
                      type: 'payroll_membership_evidence',
                      time_entry_id: candidateId,
                      evidence: discoveryEvidence.conflict_evidence,
                    },
                }, { status: 409 });
                if (discoveryEvidence) companyDate = discoveryEvidence.membership.company_date;
              }
              if (companyDate && companyDate >= period.start_date && companyDate <= period.end_date) {
                periodEntryIdSet.add(candidateId);
                if (snapshotVersion >= 21 && discoveryEvidence) generationMembershipDiscovery.push({
                  time_entry_id: candidateId,
                  audit_id: String(discoveryEvidence.membershipAudit.id || ''),
                  action: String(discoveryEvidence.membershipAudit.action || ''),
                  request_id: String(discoveryEvidence.membershipAudit.request_id || ''),
                  server_timestamp: String(discoveryEvidence.membershipAudit.server_timestamp || ''),
                  payroll_membership: { company_date: discoveryEvidence.membership.company_date, clock_in: discoveryEvidence.membership.clock_in, source: discoveryEvidence.membership.source },
                });
              }
            }
          }
          generationMembershipDiscovery.sort((a: any, b: any) => a.time_entry_id.localeCompare(b.time_entry_id) || a.audit_id.localeCompare(b.audit_id));
          const periodEntryIds = [...periodEntryIdSet].sort();
          for (const entryId of periodEntryIds) {
            const audits = await auditEntity.filter({ time_entry_id: entryId });
            if (!Array.isArray(audits)) return Response.json({ success: false, error: 'Generation-wide payroll audit reconciliation failed before finalization.' }, { status: 409 });
            for (const row of audits.filter((audit: any) =>
              relevantActions.includes(String(audit.action || '')) &&
              ['confirmed', 'recovered'].includes(String(audit.outcome || '')) &&
              inCausalWindow(audit.server_timestamp, generationCausalWindowStart, generationCausalWindowEnd)
            )) {
              if (row.details?.payroll_membership && ['clock_in', 'clock_out', 'admin_correction', 'admin_archive'].includes(String(row.action || '')) &&
                  !normalizedPayrollMembershipFromAudit(row)) {
                return Response.json({ success: false, error: 'A normalized payroll-membership audit envelope does not match its authoritative Time Clock action. Admin investigation is required before finalization.' }, { status: 409 });
              }
              const membership = snapshotVersion >= 20 ? normalizedPayrollMembershipFromAudit(row) : null;
              generationAuditReconciliation.push({
                audit_id: String(row.id || ''), time_entry_id: entryId, action: String(row.action || ''),
                request_id: String(row.request_id || ''), server_timestamp: String(row.server_timestamp || ''),
                classification: changedIds.has(entryId) ? 'mapped_payroll_delta' : 'net_non_payroll_affecting',
                ...(snapshotVersion >= 20 && membership ? {
                  payroll_membership: { company_date: membership.company_date, clock_in: membership.clock_in, source: membership.source },
                } : {}),
              });
            }
          }
          generationAuditReconciliation.sort((a: any, b: any) => {
            const timeOrder = Date.parse(a.server_timestamp) - Date.parse(b.server_timestamp);
            return timeOrder || a.audit_id.localeCompare(b.audit_id);
          });
        }
        const generationAuditReconciliationHash = await payloadHash(generationAuditReconciliation);
        const generationMembershipDiscoveryHash = await payloadHash(generationMembershipDiscovery);
        const approvingManagers = [...new Set(snapshotRows.map((row: any) => asEmail(row.approval_evidence?.approved_by)).filter(Boolean))].sort();
        const finalizerApprovalOverlap = approvingManagers.includes(actorEmail);
        const summaryCore = {
          entry_count: completedEntries.length,
          employee_count: new Set(completedEntries.map((entry: any) => asEmail(entry.user_email))).size,
          total_hours: totalHours,
          lock_timestamp: lockTimestamp,
          locked_by: actorEmail,
          request_id: requestId,
          snapshot_version: snapshotVersion,
          entry_snapshot_hash: entrySnapshotHash,
          previous_history_hash: previousHistoryHash,
          shift_manifest_hash: entrySnapshotHash,
          ...(snapshotVersion >= 7 ? { approving_managers: approvingManagers, finalizer_approval_overlap: finalizerApprovalOverlap } : {}),
          ...(snapshotVersion >= 8 ? {
            supersedes_generation_request_id: supersedesGenerationRequestId,
            authorized_by_reopen_request_id: authorizedByReopenRequestId,
          } : {}),
          ...(snapshotVersion >= 9 ? {
            generation_changes_hash: generationChangesHash,
            generation_change_count: generationChanges.length,
            generation_reopen_reason: String(supersededGeneration?.invalidation_reason || ''),
          } : {}),
          ...(snapshotVersion >= 12 ? {
            generation_causal_window_start: generationCausalWindowStart,
            generation_causal_window_end: generationCausalWindowEnd,
          } : {}),
          ...(snapshotVersion >= 17 ? {
            generation_audit_reconciliation_hash: generationAuditReconciliationHash,
            generation_audit_reconciliation_count: generationAuditReconciliation.length,
          } : {}),
          ...(snapshotVersion >= 21 ? {
            generation_membership_discovery_hash: generationMembershipDiscoveryHash,
            generation_membership_discovery_count: generationMembershipDiscovery.length,
          } : {}),
        };
        const snapshotChainHash = await payloadHash(summaryCore);
        const summary = { ...summaryCore, shift_manifest: snapshotRows, ...(snapshotVersion >= 9 ? { generation_changes: generationChanges } : {}), ...(snapshotVersion >= 17 ? { generation_audit_reconciliation: generationAuditReconciliation } : {}), ...(snapshotVersion >= 21 ? { generation_membership_discovery: generationMembershipDiscovery } : {}), snapshot_active: true, snapshot_chain_hash: snapshotChainHash };
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
        const reopenGates = await acquireReopenMutationGates();
        if (!reopenGates?.acquired) return Response.json({ success: false, retry_same_request: true, error: reopenGates?.error || 'Payroll reopen could not acquire employee mutation gates.' }, { status: 409 });
        try {
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
        } finally {
          if (!await releaseReopenMutationGates(reopenGates)) throw new Error('A payroll reopen employee gate could not be released safely. Retry this same reopen request for recovery.');
        }
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
      if (!resumingLaborAction && segment?.id) {
        await emitTimeClockEvent(base44, 'job_allocation_added', segment.id, actorEmail);
      }
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

    if (action === 'work_pause_report_missed') {
      if (state.status !== 'clocked_in' || !state.active_entry_id) {
        return Response.json({ success: false, error: 'Employee must be clocked in to report a missed Work Pause.' }, { status: 409 });
      }
      if (target.can_work_pause !== true) {
        return Response.json({ success: false, error: 'Work Pause is not enabled for this employee.' }, { status: 403 });
      }
      if (actor.role !== 'badge' && actorEmail !== target.email) {
        return Response.json({ success: false, error: 'Employees can only report their own Work Pause time.' }, { status: 403 });
      }
      const entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      if (!entry?.id || entry.status !== 'clocked_in' || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'Active TimeEntry no longer matches stored clock state. Admin review is required.' }, { status: 409 });
      }
      if (workPauseStatusOf(state) !== 'working') {
        return Response.json({ success: false, error: 'Finish the active Work Pause before reporting a missed one.' }, { status: 409 });
      }
      if (state.active_break_id) {
        return Response.json({ success: false, error: 'End the active break before reporting a missed Work Pause.' }, { status: 409 });
      }

      const startedIso = String(body?.started_at || '').trim();
      const resumedIso = String(body?.resumed_at || '').trim();
      const note = String(body?.note || '').trim().slice(0, 500);
      const startedMs = new Date(startedIso).getTime();
      const resumedMs = new Date(resumedIso).getTime();
      const clockInMs = new Date(entry.clock_in).getTime();
      const nowMs = Date.now();
      if (!Number.isFinite(startedMs) || !Number.isFinite(resumedMs)) {
        return Response.json({ success: false, error: 'Enter a valid pause start and end time.' }, { status: 400 });
      }
      if (resumedMs <= startedMs) {
        return Response.json({ success: false, error: 'The missed Work Pause end must be after its start.' }, { status: 400 });
      }
      if (!Number.isFinite(clockInMs) || startedMs < clockInMs) {
        return Response.json({ success: false, error: 'The missed Work Pause cannot start before Clock In.' }, { status: 400 });
      }
      if (resumedMs > nowMs + 60000) {
        return Response.json({ success: false, error: 'The missed Work Pause cannot end in the future.' }, { status: 400 });
      }
      const entryDay = dateKeyInCompanyTime(entry.clock_in);
      if (dateKeyInCompanyTime(startedIso) !== entryDay || dateKeyInCompanyTime(resumedIso) !== entryDay) {
        return Response.json({ success: false, error: 'The missed Work Pause must stay on the same company day as this shift.' }, { status: 400 });
      }
      const durationMinutes = Math.max(1, Math.floor((resumedMs - startedMs) / 60000));
      if (durationMinutes > 12 * 60) {
        return Response.json({ success: false, error: 'A missed Work Pause cannot exceed 12 hours. Contact a manager for a correction.' }, { status: 400 });
      }

      const priorRows = await workPauseEntity.filter({ user_email: target.email, time_entry_id: entry.id, start_request_id: requestId });
      if (!Array.isArray(priorRows)) throw new Error('Missed Work Pause lookup did not return a record list.');
      if (priorRows.length > 1) {
        return Response.json({ success: false, error: 'Multiple Work Pause records match this request. Admin review is required.' }, { status: 409 });
      }
      if (priorRows.length === 1) {
        const prior = priorRows[0];
        if (prior.status === 'completed' && prior.source === 'employee_attested_missed' &&
            String(prior.started_at || '') === startedIso && String(prior.resumed_at || '') === resumedIso) {
          const summary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
          return Response.json({ success: true, status: 'clocked_in', work_pause_status: 'working', work_pause: prior, work_pause_summary: summary, entry, user: publicEmployee(target), reused: true, work_pause_allowed: true });
        }
        return Response.json({ success: false, error: 'This request was already used for a different Work Pause. Reload status and try again.' }, { status: 409 });
      }

      const existingPauses = await workPauseEntity.filter({ user_email: target.email, time_entry_id: entry.id });
      if (!Array.isArray(existingPauses)) throw new Error('Work Pause overlap lookup did not return a record list.');
      for (const row of existingPauses) {
        const s = new Date(row.started_at).getTime();
        const e = row.status === 'active' ? nowMs : new Date(row.resumed_at || row.started_at).getTime();
        if (Number.isFinite(s) && Number.isFinite(e) && startedMs < e && resumedMs > s) {
          return Response.json({ success: false, error: 'The missed Work Pause overlaps an existing Work Pause on this shift.' }, { status: 409 });
        }
      }
      const existingBreaks = await breakEntity.filter({ user_email: target.email, time_entry_id: entry.id });
      if (!Array.isArray(existingBreaks)) throw new Error('Break overlap lookup did not return a record list.');
      for (const row of existingBreaks) {
        const s = new Date(row.started_at).getTime();
        const e = row.status === 'active' ? nowMs : new Date(row.ended_at || row.started_at).getTime();
        if (Number.isFinite(s) && Number.isFinite(e) && startedMs < e && resumedMs > s) {
          return Response.json({ success: false, error: 'The missed Work Pause overlaps a break on this shift.' }, { status: 409 });
        }
      }

      const pauseRow = await workPauseEntity.create({
        user_email: target.email,
        user_name: target.full_name || target.email,
        time_entry_id: entry.id,
        started_at: startedIso,
        resumed_at: resumedIso,
        duration_minutes: durationMinutes,
        status: 'completed',
        start_request_id: requestId,
        resume_request_id: requestId,
        source: 'employee_attested_missed',
      });
      if (!pauseRow?.id) throw new Error('Missed Work Pause record could not be created.');
      await ensureActionAudit(auditEntity, {
        action: 'work_pause_report_missed', outcome: 'confirmed', user_email: target.email,
        user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
        authentication_method: authenticationMethodFor(actor, target),
        server_timestamp: new Date().toISOString(),
        request_id: requestId, time_entry_id: entry.id,
        reason: 'Employee self-reported a missed Work Pause',
        details: {
          work_pause_id: pauseRow.id,
          started_at: startedIso,
          resumed_at: resumedIso,
          duration_minutes: durationMinutes,
          ...(note ? { note } : {}),
        },
      }, 'Missed Work Pause audit');
      const summary = await workPauseSummaryForEntry(workPauseEntity, entry.id, target.email);
      return Response.json({ success: true, status: 'clocked_in', work_pause_status: 'working', work_pause: pauseRow, work_pause_summary: summary, entry, user: publicEmployee(target), audit_saved: true, work_pause_allowed: true });
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

        if (finalOutcome === 'confirmed' && saved?.id) {
          await emitTimeClockEvent(base44, 'time_off_requested', saved.id, actorEmail);
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
      if (finalOutcome === 'confirmed' && confirmedRecord?.id) {
        await emitTimeClockEvent(base44, 'time_off_updated', confirmedRecord.id, actorEmail);
      }
      return Response.json({ success: true, request: confirmedRecord, audit_id: updateIntent.id, reused: finalOutcome === 'recovered' });
    }

    if (action === 'list_time_off_requests') {
      if (actor.role === 'badge') return Response.json({ success: false, error: 'A signed-in session is required to view time-off requests.' }, { status: 403 });
      const adminScope = actor.role === 'admin' && String(body?.scope || '') === 'admin';
      const query = adminScope
        ? { status: { $in: ['pending', 'approved'] }, archived_test_data: { $ne: true } }
        : { user_email: target.email, archived_test_data: { $ne: true } };
      const requests = await timeOffRequestEntity.filter(query);
      if (!Array.isArray(requests)) throw new Error('Time-off request list did not return records.');
      requests.sort((a: any, b: any) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());
      return Response.json({ success: true, requests });
    }

    if (action === 'time_off_decision') {
      if (actor.role === 'badge') return Response.json({ success: false, error: 'A signed-in session is required to decide time-off requests.' }, { status: 403 });
      const timeOffRequestId = String(body?.time_off_request_id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      const decision = String(body?.decision || '').trim();
      const decisionNotes = String(body?.admin_notes || '').trim().slice(0, 1000);
      if (!timeOffRequestId || !expectedUpdatedDate) {
        return Response.json({ success: false, error: 'The loaded time-off request version is required before deciding it.' }, { status: 400 });
      }
      if (!['approved', 'denied', 'cancelled'].includes(decision)) {
        return Response.json({ success: false, error: 'A valid time-off decision is required.' }, { status: 400 });
      }
      const decisionEventType = decision === 'approved' ? 'time_off_approved'
        : decision === 'denied' ? 'time_off_denied' : 'time_off_cancelled';
      const fromStatuses = decision === 'cancelled' ? ['pending', 'approved'] : ['pending'];
      const decisionTimestamp = new Date().toISOString();

      let requestRecord = await timeOffRequestEntity.get(timeOffRequestId).catch(() => null);
      if (!requestRecord?.id || requestRecord.archived_test_data) {
        return Response.json({ success: false, error: 'Time-off request was not found or is archived.' }, { status: 404 });
      }
      const requestOwnerEmail = asEmail(requestRecord.user_email);
      // Admins approve, deny, or cancel; the requesting employee may only
      // cancel their own pending/approved request.
      const ownerCancel = decision === 'cancelled' && actorEmail === requestOwnerEmail;
      if (actor.role !== 'admin' && !ownerCancel) {
        return Response.json({ success: false, error: 'Only a manager can approve or deny time-off requests.' }, { status: 403 });
      }

      const decisionFields = {
        status: decision,
        approved_by: actorEmail,
        approved_date: decisionTimestamp,
        admin_notes: decisionNotes,
      };
      // The hash covers only the semantic decision. approved_date is generated
      // inside decisionFields on every invocation, so including it would make an
      // idempotent replay appear to mismatch its own audit and always fail.
      const decisionPayloadHash = await payloadHash({
        time_off_request_id: timeOffRequestId,
        expected_updated_date: expectedUpdatedDate,
        decision,
        admin_notes: decisionNotes,
        decided_by: actorEmail,
      });
      const decidedFieldsMatch = (row: any) => (
        row?.id === timeOffRequestId &&
        String(row.status || '') === decision &&
        asEmail(row.approved_by) === actorEmail &&
        String(row.admin_notes || '') === decisionNotes
      );
      const auditQuery = { action: 'time_off_decision', request_id: requestId, user_email: requestOwnerEmail };
      let decisionIntent = await uniqueRow(auditEntity, auditQuery, 'Time-off decision audit');
      if (decisionIntent?.id) {
        const priorHash = String(decisionIntent.details?.payload_hash || '');
        if (!priorHash || !constantTimeEqual(priorHash, decisionPayloadHash) ||
          String(decisionIntent.details?.time_off_request_id || '') !== timeOffRequestId) {
          return Response.json({ success: false, error: 'This time-off decision request id has mismatched or incomplete audit details. Admin investigation is required.' }, { status: 409 });
        }
        if (decisionIntent.outcome === 'blocked') {
          return Response.json({ success: false, error: 'This time-off decision was previously blocked. Reload before deciding again.' }, { status: 409 });
        }
        if (['confirmed', 'recovered'].includes(String(decisionIntent.outcome || ''))) {
          if (String(requestRecord.last_request_id || '') !== requestId ||
            !constantTimeEqual(String(requestRecord.last_request_payload_hash || ''), decisionPayloadHash) ||
            !decidedFieldsMatch(requestRecord)) {
            return Response.json({ success: false, error: 'The completed time-off decision audit no longer matches the request record. Admin investigation is required.' }, { status: 409 });
          }
          return Response.json({ success: true, request: requestRecord, audit_id: decisionIntent.id, reused: true });
        }
        if (decisionIntent.outcome !== 'pending') {
          return Response.json({ success: false, error: 'This time-off decision audit is not in a recoverable state.' }, { status: 409 });
        }
      }

      const sameRequestSaved = String(requestRecord.last_request_id || '') === requestId;
      if (sameRequestSaved && (
        !constantTimeEqual(String(requestRecord.last_request_payload_hash || ''), decisionPayloadHash) ||
        !decidedFieldsMatch(requestRecord)
      )) {
        return Response.json({ success: false, error: 'This time-off decision request id no longer matches the saved decision. Admin investigation is required.' }, { status: 409 });
      }
      if (!sameRequestSaved && (
        !fromStatuses.includes(String(requestRecord.status || '')) || String(requestRecord.updated_date || '') !== expectedUpdatedDate
      )) {
        return Response.json({ success: false, error: `This time-off request is no longer ${fromStatuses.join('/')} at its loaded version. Reload before deciding.` }, { status: 409 });
      }

      const hadPendingAudit = decisionIntent?.outcome === 'pending';
      if (!decisionIntent?.id) {
        try {
          const ensured = await ensureUserActionAudit(auditEntity, {
            action: 'time_off_decision',
            outcome: 'pending',
            user_email: requestOwnerEmail,
            user_name: requestRecord.user_name || requestOwnerEmail,
            actor_email: actorEmail,
            actor_role: actor.role,
            authentication_method: authenticationMethodFor(actor, target),
            server_timestamp: decisionTimestamp,
            request_id: requestId,
            reason: decisionNotes || `Time-off request ${decision}`,
            details: {
              payload_hash: decisionPayloadHash,
              time_off_request_id: timeOffRequestId,
              expected_updated_date: expectedUpdatedDate,
              decision,
              previous_status: requestRecord.status,
            },
          }, 'Time-off decision audit intent');
          decisionIntent = ensured.audit;
        } catch {
          return Response.json({ success: false, retry_same_request: true, error: 'The time-off decision audit intent could not be verified. Retry the same decision.' }, { status: 409 });
        }
      }
      // Audit creation can race; never mutate while the request id has ambiguous audit evidence.
      decisionIntent = await uniqueRow(auditEntity, auditQuery, 'Time-off decision audit intent');
      if (!decisionIntent?.id || decisionIntent.outcome !== 'pending' ||
        !constantTimeEqual(String(decisionIntent.details?.payload_hash || ''), decisionPayloadHash) ||
        String(decisionIntent.details?.time_off_request_id || '') !== timeOffRequestId) {
        return Response.json({ success: false, error: 'The time-off decision audit intent is ambiguous or no longer pending. Admin review is required.' }, { status: 409 });
      }

      if (!sameRequestSaved) {
        if (!fromStatuses.includes(String(requestRecord.status || ''))) {
          return Response.json({ success: false, error: `Only ${fromStatuses.join('/')} time-off requests can be ${decision === 'approved' ? 'approved' : decision === 'denied' ? 'denied' : 'cancelled'}.` }, { status: 409 });
        }
        if (String(requestRecord.updated_date || '') !== expectedUpdatedDate) {
          return Response.json({ success: false, error: 'This time-off request changed in another session. Reload before deciding it.' }, { status: 409 });
        }
        const updated = await timeOffRequestEntity.updateMany(
          { id: requestRecord.id, updated_date: expectedUpdatedDate, status: { $in: fromStatuses }, archived_test_data: { $ne: true } },
          { $set: { ...decisionFields, last_request_id: requestId, last_request_payload_hash: decisionPayloadHash } },
        );
        if (!updated || updated.updated !== 1) {
          const raced = await timeOffRequestEntity.get(requestRecord.id).catch(() => null);
          if (raced?.id && String(raced.last_request_id || '') === requestId &&
            constantTimeEqual(String(raced.last_request_payload_hash || ''), decisionPayloadHash) &&
            decidedFieldsMatch(raced)) {
            requestRecord = raced; // The exact same request succeeded in another session.
          } else {
            await auditEntity.updateMany(
              { id: decisionIntent.id, outcome: 'pending', request_id: requestId, user_email: requestOwnerEmail },
              { $set: { outcome: 'blocked' } },
            );
            return Response.json({ success: false, error: 'This time-off request changed in another session. Reload before deciding it.' }, { status: 409 });
          }
        } else {
          requestRecord = await timeOffRequestEntity.get(requestRecord.id);
        }
      }

      // A saved decision is never success without the exact record fields, request
      // marker, and a confirmed/recovered audit for this request id.
      if (!requestRecord?.id ||
        String(requestRecord.last_request_id || '') !== requestId ||
        !constantTimeEqual(String(requestRecord.last_request_payload_hash || ''), decisionPayloadHash) ||
        !decidedFieldsMatch(requestRecord)) {
        return Response.json({ success: false, error: 'The saved time-off decision no longer matches its audit intent. Admin investigation is required.' }, { status: 409 });
      }

      const finalOutcome = hadPendingAudit || sameRequestSaved ? 'recovered' : 'confirmed';
      const finalized = await auditEntity.updateMany(
        { id: decisionIntent.id, outcome: 'pending', request_id: requestId, user_email: requestOwnerEmail },
        { $set: {
          outcome: finalOutcome,
          server_timestamp: new Date().toISOString(),
          details: {
            ...(decisionIntent.details || {}),
            payload_hash: decisionPayloadHash,
            time_off_request_id: timeOffRequestId,
            saved_updated_date: requestRecord.updated_date,
            decision,
          },
        } },
      );
      if (!finalized || finalized.updated !== 1) {
        const fresh = await uniqueRow(auditEntity, auditQuery, 'Time-off decision audit finalization');
        if (!fresh?.id || fresh.id !== decisionIntent.id ||
          !['confirmed', 'recovered'].includes(String(fresh.outcome || '')) ||
          !constantTimeEqual(String(fresh.details?.payload_hash || ''), decisionPayloadHash) ||
          String(fresh.details?.time_off_request_id || '') !== timeOffRequestId) {
          return Response.json({ success: false, retry_same_request: true, error: 'The time-off decision was saved but its audit finalization is incomplete. Retry the same decision.' }, { status: 409 });
        }
        decisionIntent = fresh;
      } else {
        decisionIntent = await uniqueRow(auditEntity, auditQuery, 'Confirmed time-off decision audit');
      }

      const confirmedRecord = await timeOffRequestEntity.get(timeOffRequestId).catch(() => null);
      if (!decisionIntent?.id || !['confirmed', 'recovered'].includes(String(decisionIntent.outcome || '')) ||
        !constantTimeEqual(String(decisionIntent.details?.payload_hash || ''), decisionPayloadHash) ||
        String(decisionIntent.details?.time_off_request_id || '') !== timeOffRequestId ||
        !confirmedRecord?.id ||
        String(confirmedRecord.last_request_id || '') !== requestId ||
        !constantTimeEqual(String(confirmedRecord.last_request_payload_hash || ''), decisionPayloadHash) ||
        !decidedFieldsMatch(confirmedRecord)) {
        return Response.json({ success: false, error: 'The time-off decision and confirmed audit do not agree. Admin investigation is required.' }, { status: 409 });
      }
      if (finalOutcome === 'confirmed' && confirmedRecord?.id) {
        await emitTimeClockEvent(base44, decisionEventType, confirmedRecord.id, actorEmail);
      }
      return Response.json({ success: true, request: confirmedRecord, audit_id: decisionIntent.id, reused: finalOutcome === 'recovered' });
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

    if (action === 'who_is_in') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const rows = await entryEntity.filter({ status: 'clocked_in' });
      if (!Array.isArray(rows)) throw new Error('TimeEntry list did not return records.');
      const staff = rows
        .filter((r: any) => r?.id && !r.archived_test_data && !r.archived_admin)
        .map((r: any) => ({ id: r.id, user_email: r.user_email, user_name: r.user_name || r.user_email, clock_in: r.clock_in }))
        .sort((a: any, b: any) => new Date(a.clock_in || 0).getTime() - new Date(b.clock_in || 0).getTime());
      return Response.json({ success: true, staff });
    }

    if (action === 'toggle_payroll_hold') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required to hold entries.' }, { status: 403 });
      const entryId = String(body?.entry_id || '').trim();
      const expected = String(body?.expected_updated_date || '').trim();
      const hold = body?.hold !== false;
      const reason = String(body?.reason || '').slice(0, 300);
      if (!entryId || !expected) return Response.json({ success: false, error: 'entry_id and expected_updated_date are required.' }, { status: 400 });
      const row = await entryEntity.get(entryId).catch(() => null);
      if (!row?.id) return Response.json({ success: false, error: 'TimeEntry not found.' }, { status: 404 });
      if (String(row.updated_date || '') !== expected) return Response.json({ success: false, retry_same_request: false, error: 'The entry changed since it was loaded. Reload and retry.' }, { status: 409 });
      const updated = await entryEntity.update(entryId, { payroll_hold: hold, payroll_hold_reason: hold ? reason : '' });
      await auditEntity.create({ action: 'toggle_payroll_hold', request_id: requestId, time_entry_id: entryId, user_email: row.user_email || '', actor_email: actorEmail, details: { hold, reason } }).catch(() => null);
      return Response.json({ success: true, entry: updated });
    }

    if (action === 'admin_archive_entry') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required to archive entries.' }, { status: 403 });
      const entryId = String(body?.entry_id || '').trim();
      const expected = String(body?.expected_updated_date || '').trim();
      const reason = String(body?.reason || '').slice(0, 300);
      if (!entryId || !expected) return Response.json({ success: false, error: 'entry_id and expected_updated_date are required.' }, { status: 400 });
      const row = await entryEntity.get(entryId).catch(() => null);
      if (!row?.id) return Response.json({ success: false, error: 'TimeEntry not found.' }, { status: 404 });
      if (row.archived_admin === true) return Response.json({ success: true, entry: row, already_archived: true });
      if (String(row.updated_date || '') !== expected) {
        return Response.json({ success: false, retry_same_request: false, error: 'The entry changed since it was loaded. Reload and retry.' }, { status: 409 });
      }
      const updated = await entryEntity.update(entryId, { archived_admin: true, archived_admin_reason: reason, archived_admin_by: actorEmail, archived_admin_at: new Date().toISOString() });
      await auditEntity.create({
        action: 'admin_archive_entry', request_id: requestId, time_entry_id: entryId,
        user_email: row.user_email || '', actor_email: actorEmail,
        details: { reason, expected_updated_date: expected },
      }).catch(() => null);
      return Response.json({ success: true, entry: updated });
    }

    if (action === 'my_labor_history') {
      // Employee self-service: distinct recent labor allocations for quick-pick.
      if (actor.role === 'badge') return Response.json({ success: false, error: 'A signed-in session is required to view labor history.' }, { status: 403 });
      const rows = await laborEntity.filter({ user_email: target.email }, '-created_date', 60).catch(() => []);
      if (!Array.isArray(rows)) throw new Error('Labor history lookup did not return a record list.');
      const seen = new Set<string>();
      const recent: any[] = [];
      for (const r of rows) {
        if (!r?.id) continue;
        const key = [r.work_order_id || '', r.client_name || '', r.inhouse_task || '', r.activity_type || ''].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        recent.push({
          activity_type: r.activity_type || 'other',
          work_order_id: r.work_order_id || null,
          work_order_title: r.work_order_title || r.job_name || '',
          client_name: r.client_name || '',
          inhouse_task: r.inhouse_task || '',
          is_inhouse: r.is_inhouse === true,
        });
        if (recent.length >= 8) break;
      }
      return Response.json({ success: true, recent });
    }

    if (action === 'my_history') {
      // Employee self-service: own recent punches for export and stats.
      if (actor.role === 'badge') return Response.json({ success: false, error: 'A signed-in session is required to view punch history.' }, { status: 403 });
      const rows = await entryEntity.filter({ user_email: target.email }, '-clock_in', 120);
      if (!Array.isArray(rows)) throw new Error('TimeEntry history lookup did not return a record list.');
      const entries = rows
        .filter((r: any) => r?.id && !r.archived_test_data && !r.archived_admin)
        .map((r: any) => ({
          id: r.id, clock_in: r.clock_in, clock_out: r.clock_out || null,
          status: r.status, lunch_minutes: Number(r.lunch_minutes || 0),
          approval_status: r.approval_status || '', notes: String(r.notes || '').slice(0, 500),
        }));
      return Response.json({ success: true, entries });
    }

    if (action === 'list_shift_templates') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required to view shift templates.' }, { status: 403 });
      const rows = await shiftTemplateEntity.filter({ archived_admin: { $ne: true } }).catch(() => []);
      if (!Array.isArray(rows)) throw new Error('Shift template lookup did not return a record list.');
      return Response.json({ success: true, templates: rows });
    }

    if (action === 'upsert_shift_template') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required to edit shift templates.' }, { status: 403 });
      if (!requestId) return Response.json({ success: false, error: 'A request_id is required to save a shift template.' }, { status: 400 });
      const t = body?.template && typeof body.template === 'object' ? body.template : {};
      const userEmail = asEmail(t.user_email || '');
      if (!userEmail) return Response.json({ success: false, error: 'template.user_email is required.' }, { status: 400 });
      const clean: any = {
        user_email: userEmail,
        label: String(t.label || '').slice(0, 60).trim(),
        days: (Array.isArray(t.days) ? t.days : []).filter((d: any) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(d)),
        start_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t.start_time || '')) ? String(t.start_time) : '',
        end_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t.end_time || '')) ? String(t.end_time) : '',
        break_minutes: Math.min(480, Math.max(0, Math.round(Number(t.break_minutes) || 0))),
        active: t.active !== false,
      };
      if (!clean.start_time || !clean.end_time || !clean.days.length) {
        return Response.json({ success: false, error: 'A template needs at least one day plus valid start and end times.' }, { status: 400 });
      }
      const existing = t.id ? await shiftTemplateEntity.get(String(t.id)).catch(() => null) : null;
      const row = existing?.id
        ? await shiftTemplateEntity.update(existing.id, clean)
        : await shiftTemplateEntity.create(clean);
      await auditEntity.create({ action: 'upsert_shift_template', request_id: requestId, user_email: userEmail, actor_email: actorEmail, details: { template_id: row?.id || null } }).catch(() => null);
      return Response.json({ success: true, template: row });
    }

    if (action === 'delete_shift_template') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required to delete shift templates.' }, { status: 403 });
      const row = await shiftTemplateEntity.get(String(body?.template_id || '')).catch(() => null);
      if (!row?.id) return Response.json({ success: false, error: 'Shift template not found.' }, { status: 404 });
      await shiftTemplateEntity.update(row.id, { archived_admin: true });
      await auditEntity.create({ action: 'delete_shift_template', request_id: requestId, user_email: row.user_email || '', actor_email: actorEmail, details: { template_id: row.id } }).catch(() => null);
      return Response.json({ success: true });
    }

    if (action === 'list_pending_requests') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required to view in-flight requests.' }, { status: 403 });
      const rows = await stateEntity.filter({}).catch(() => []);
      if (!Array.isArray(rows)) throw new Error('Employee state lookup did not return a record list.');
      const pending = rows
        .filter((s: any) => s?.id && s.status && s.status !== 'clocked_out' && s.status !== 'clocked_in'
          && !['idle', 'working'].includes(String(s.break_status || 'idle'))
          || s.labor_status === 'starting' || s.labor_status === 'changing' || s.labor_status === 'stopping')
        .map((s: any) => ({
          user_email: s.user_email || '', status: s.status,
          break_status: s.break_status || '', work_pause_status: s.work_pause_status || '', labor_status: s.labor_status || '',
          pending_since: s.pending_started_at || s.break_pending_started_at || s.work_pause_pending_started_at || s.labor_pending_started_at || null,
          request_id: s.last_request_id || '',
        }));
      return Response.json({ success: true, pending });
    }

    if (action === 'list_timeclock_audit') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const rows = await auditEntity.filter({});
      if (!Array.isArray(rows)) throw new Error('Audit list did not return records.');
      const events = rows
        .filter((r: any) => r?.id)
        .sort((a: any, b: any) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
        .slice(0, 60)
        .map((r: any) => ({
          id: r.id,
          action: r.action || '',
          user_email: r.user_email || '',
          actor_email: r.actor_email || '',
          request_id: r.request_id || '',
          time_entry_id: r.time_entry_id || '',
          created: r.created_date || null,
        }));
      return Response.json({ success: true, events });
    }

    if (action === 'list_face_enrollment') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const userEntity = base44.asServiceRole.entities.User;
      const users = await userEntity.filter({});
      if (!Array.isArray(users)) throw new Error('User list did not return records.');
      const roster = users
        .map((u: any) => ({
          email: u.email,
          name: u.full_name || u.email,
          descriptor_count: Array.isArray(u.face_descriptors) ? u.face_descriptors.length : 0,
          enrolled: Array.isArray(u.face_descriptors) && u.face_descriptors.length > 0,
          updated: u.updated_date || null,
        }))
        .sort((a: any, b: any) => Number(a.enrolled) - Number(b.enrolled) || String(a.name).localeCompare(String(b.name)));
      return Response.json({ success: true, roster });
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
      await emitTimeClockEvent(base44, 'time_entry_notes_updated', savedEntry.id, actorEmail);
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
      // Review IDs identify one manager action across all employees.
      // Preflight both applied-correction and review-decision audit ownership.
      for (const auditAction of ['admin_correction', 'correction_review']) {
        const owned = await auditEntity.filter({ action: auditAction, request_id: requestId });
        if (!Array.isArray(owned) || owned.length > 1 || owned.some((row: any) =>
          !row?.id ||
          String(row.time_entry_id || '') !== String(correctionRequest.time_entry_id || '') ||
          asEmail(row.user_email) !== target.email ||
          String(row.details?.correction_request_id || '') !== correctionRequest.id ||
          !constantTimeEqual(String(row.details?.review_payload_hash || ''), reviewHash)
        )) {
          return Response.json({ success: false, error: 'Manager review request ID has conflicting or ambiguous audit ownership. Use a new review request ID or request admin investigation.' }, { status: 409 });
        }
      }
      const missedClockOutRecovery = String(correctionRequest.request_kind || 'standard') === 'missed_clock_out';

      const validateMissedClockOutLink = async (requestRecord: any, requirePending = false) => {
        if (!missedClockOutRecovery) return { punchCase: null };
        const punchExceptionId = String(requestRecord?.punch_exception_id || '').trim();
        if (!punchExceptionId) return { punchCase: null, investigation: true };
        const punchCase = await punchExceptionEntity.get(punchExceptionId).catch(() => null);
        const requestedClockOut = String(requestRecord?.requested_changes?.clock_out || '');
        const structurallyValid = Boolean(
          punchCase?.id &&
          String(punchCase.id) === punchExceptionId &&
          asEmail(punchCase.user_email) === target.email &&
          String(punchCase.time_entry_id || '') === String(requestRecord.time_entry_id || '') &&
          punchCase.exception_type === 'missed_clock_out' &&
          String(punchCase.case_key || '') === `missed_clock_out:${requestRecord.time_entry_id}` &&
          String(punchCase.correction_request_id || '') === String(requestRecord.id || '') &&
          String(punchCase.request_id || '') === String(requestRecord.request_id || '') &&
          punchCase.employee_response === 'missed_clock_out' &&
          String(punchCase.claimed_clock_out || '') === requestedClockOut
        );
        if (!structurallyValid) return { punchCase, investigation: true };
        if (requirePending && punchCase.status !== 'pending_manager_review') return { punchCase, investigation: true };
        return { punchCase };
      };
      if (missedClockOutRecovery) {
        const linkedCase = await validateMissedClockOutLink(
          correctionRequest,
          ['pending', 'reviewing'].includes(String(correctionRequest.status || '')),
        );
        if (linkedCase.investigation) {
          return Response.json({ success: false, error: 'The missed-clock-out correction is not consistently linked to its Punch Exception. Admin investigation is required before review.' }, { status: 409 });
        }
      }

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
      const verifyCorrectionReviewConvergence = async (requestRecord: any, expectedAuditId: string) => {
        const terminalStatus = String(requestRecord?.status || '');
        if (!['approved', 'approved_modified', 'rejected'].includes(terminalStatus)) return { ok: false, retry: true };
        const finalEntry = await entryEntity.get(requestRecord.time_entry_id).catch(() => null);
        if (!finalEntry?.id || asEmail(finalEntry.user_email) !== target.email || finalEntry.archived_test_data || finalEntry.archived_admin) return { ok: false, investigation: true };
        if (terminalStatus === 'rejected') {
          if (missedClockOutRecovery) {
            return finalEntry.status === 'needs_resolution' && finalEntry.approval_status === 'needs_review'
              ? { ok: true, entry: finalEntry }
              : { ok: false, investigation: true };
          }
          return { ok: true, entry: finalEntry };
        }
        const converged = Boolean(
          finalEntry.status === 'clocked_out' && finalEntry.clock_out &&
          finalEntry.approval_status === 'needs_review' &&
          String(finalEntry.last_correction_request_id || '') === String(requestRecord.id || '') &&
          String(requestRecord.applied_audit_id || '') === String(expectedAuditId || '')
        );
        return converged ? { ok: true, entry: finalEntry } : { ok: false, investigation: true };
      };
      const reconcileMissedClockOutTerminal = async (requestRecord: any, resolutionAuditId: string) => {
        if (!missedClockOutRecovery) return { ok: true };
        const expectedCaseStatus = requestRecord?.status === 'rejected'
          ? 'rejected'
          : ['approved', 'approved_modified'].includes(String(requestRecord?.status || ''))
            ? 'resolved'
            : '';
        if (!expectedCaseStatus || !resolutionAuditId) return { ok: false, investigation: true };
        const linked = await validateMissedClockOutLink(requestRecord, false);
        if (linked.investigation || !linked.punchCase?.id) return { ok: false, investigation: true };
        const punchCase = linked.punchCase;
        if (punchCase.status === expectedCaseStatus) {
          return String(punchCase.resolution_audit_id || '') === resolutionAuditId
            ? { ok: true, punchCase }
            : { ok: false, investigation: true };
        }
        if (punchCase.status !== 'pending_manager_review') return { ok: false, investigation: true };
        const resolutionNote = expectedCaseStatus === 'rejected'
          ? (String(requestRecord.reviewer_reason || '').trim() || 'Manager rejected the employee-reported missed clock-out; the shift remains unresolved.')
          : requestRecord.status === 'approved_modified'
            ? 'Manager approved the missed clock-out with modified punch details.'
            : 'Manager approved the employee-reported missed clock-out.';
        const updated = await punchExceptionEntity.updateMany(
          {
            id: punchCase.id,
            time_entry_id: requestRecord.time_entry_id,
            correction_request_id: requestRecord.id,
            request_id: requestRecord.request_id,
            exception_type: 'missed_clock_out',
            status: 'pending_manager_review',
          },
          { $set: { status: expectedCaseStatus, resolution_audit_id: resolutionAuditId, resolution_note: resolutionNote } },
        );
        if (!updated || typeof updated.updated !== 'number') return { ok: false, retry: true };
        const freshCase = await punchExceptionEntity.get(punchCase.id).catch(() => null);
        if (
          freshCase?.status === expectedCaseStatus &&
          String(freshCase.resolution_audit_id || '') === resolutionAuditId &&
          String(freshCase.correction_request_id || '') === String(requestRecord.id || '')
        ) return { ok: true, punchCase: freshCase };
        return updated.updated === 0 ? { ok: false, investigation: true } : { ok: false, retry: true };
      };

      if (['approved', 'approved_modified', 'rejected'].includes(correctionRequest.status)) {
        if (String(correctionRequest.review_request_id || '') === requestId) {
          if (!sameReviewPayload()) return Response.json({ success: false, error: 'This review request id is already bound to a different manager decision or payload.' }, { status: 409 });
          const reviewAuditResult = await ensureReviewAuditConfirmed(correctionRequest, true);
          if (reviewAuditResult.investigation) return Response.json({ success: false, error: 'This completed correction review has ambiguous or mismatched audit evidence. Admin investigation is required.' }, { status: 409 });
          if (!reviewAuditResult.audit) return Response.json({ success: false, retry_same_request: true, error: 'The correction review is saved but its audit is still being finalized. Retry the same review.' }, { status: 409 });
          const punchResolutionAuditId = correctionRequest.status === 'rejected'
            ? reviewAuditResult.audit.id
            : String(correctionRequest.applied_audit_id || '');
          const punchReconciled = await reconcileMissedClockOutTerminal(correctionRequest, punchResolutionAuditId);
          if (punchReconciled.investigation) return Response.json({ success: false, error: 'The correction review is complete but the linked Punch Exception is inconsistent. Admin investigation is required.' }, { status: 409 });
          if (!punchReconciled.ok) return Response.json({ success: false, retry_same_request: true, error: 'The correction review is complete but its Punch Exception is still being finalized. Retry the same review.' }, { status: 409 });
          const convergenceAuditId = correctionRequest.status === 'rejected' ? reviewAuditResult.audit.id : String(correctionRequest.applied_audit_id || '');
          const convergence = await verifyCorrectionReviewConvergence(correctionRequest, convergenceAuditId);
          if (!convergence.ok) return Response.json({ success: false, error: 'The completed correction review has not converged with its TimeEntry and audit evidence. Admin investigation is required.' }, { status: 409 });
          const completedReviewGateReleased = await releaseCompletedCorrectionCreateLock(
            stateEntity, state.id, requestId, String(correctionRequest.time_entry_id || ''), reviewHash,
          );
          if (!completedReviewGateReleased) return Response.json({ success: false, retry_same_request: true, error: 'The correction review is complete but its shared employee mutation gate could not be released safely. Retry this same review.' }, { status: 409 });
          return Response.json({ success: true, request: correctionRequest, entry: convergence.entry, review_audit_id: reviewAuditResult.audit.id, reused: true });
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
      const companyReviewGate = await claimAdminCorrectionGate(
        adminCorrectionGateEntity, auditEntity, entryEntity, stateEntity,
        requestId, `review:${correctionRequest.id}`, reviewHash, correctionRequestEntity,
      );
      if (!companyReviewGate.acquired) {
        return Response.json({ success: false, retry_same_request: companyReviewGate.retry_same_request === true,
          error: companyReviewGate.error }, { status: 409 });
      }
      try {
      // Repeat global ownership checks after company CAS: preflight alone
      // cannot prevent two employees from writing the same request ID.
      for (const auditAction of ['admin_correction', 'correction_review']) {
        const owned = await auditEntity.filter({ action: auditAction, request_id: requestId });
        if (!Array.isArray(owned) || owned.length > 1 || owned.some((row: any) =>
          !row?.id || String(row.time_entry_id || '') !== String(correctionRequest.time_entry_id || '') ||
          asEmail(row.user_email) !== target.email ||
          String(row.details?.correction_request_id || '') !== correctionRequest.id ||
          !constantTimeEqual(String(row.details?.review_payload_hash || ''), reviewHash)
        )) {
          return Response.json({ success: false, error: 'This manager review request ID is already owned by another employee or review. Admin investigation is required.' }, { status: 409 });
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
          ? await auditEntity.filter({ action: 'admin_correction', request_id: previousRequestId })
          : [];
        if (!Array.isArray(staleAudits)) throw new Error('Stale correction audit recovery lookup did not return a record list.');
        if (staleAudits.length > 1 || staleAudits.some((row: any) =>
          !row?.id || String(row.time_entry_id || '') !== String(correctionRequest.time_entry_id || '') ||
          asEmail(row.user_email) !== target.email ||
          String(row.details?.correction_request_id || '') !== correctionRequest.id ||
          !constantTimeEqual(String(row.details?.review_payload_hash || ''), previousReviewHash)
        )) {
          return Response.json({ success: false, error: 'An abandoned manager review has conflicting global correction audit identity. Admin investigation is required.' }, { status: 409 });
        }
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
                  payroll_membership: payrollMembershipEnvelope(staleEntry.clock_in),
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
            details: { correction_request_id: correctionRequest.id, decision: recoveredStatus, applied_audit_id: staleAudit.id, review_payload_hash: previousReviewHash, recovered_after_review_save: true },
          });
          const recoveredRequest = await correctionRequestEntity.get(correctionRequest.id);
          const punchReconciled = await reconcileMissedClockOutTerminal(recoveredRequest, staleAudit.id);
          if (punchReconciled.investigation) {
            return Response.json({ success: false, recovered: true, error: 'The interrupted manager approval was recovered, but the linked Punch Exception is inconsistent. Admin investigation is required.' }, { status: 409 });
          }
          if (!punchReconciled.ok) {
            return Response.json({ success: false, recovered: true, error: 'The interrupted manager approval was recovered, but Punch Exception finalization is incomplete. Retry the original review request.' }, { status: 409 });
          }
          const recoveredGateReleased = await releaseCompletedCorrectionCreateLock(
            stateEntity, state.id, previousRequestId, String(correctionRequest.time_entry_id || ''), previousReviewHash,
          );
          if (!recoveredGateReleased) {
            return Response.json({ success: false, recovered: true, retry_same_request: true, error: 'The interrupted manager approval was recovered, but its shared employee mutation gate is still held. Retry the original review request.' }, { status: 409 });
          }
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
        const punchReconciled = await reconcileMissedClockOutTerminal(savedRequest, reviewAuditResult.audit.id);
        if (punchReconciled.investigation) return Response.json({ success: false, error: 'The rejection was saved but the linked Punch Exception is inconsistent. Admin investigation is required.' }, { status: 409 });
        if (!punchReconciled.ok) return Response.json({ success: false, retry_same_request: true, error: 'The rejection was saved but its Punch Exception could not be finalized. Retry the same review.' }, { status: 409 });
        const convergence = await verifyCorrectionReviewConvergence(savedRequest, reviewAuditResult.audit.id);
        if (!convergence.ok) return Response.json({ success: false, error: 'The rejected correction has not converged with its TimeEntry and review evidence. Admin investigation is required.' }, { status: 409 });
        return Response.json({ success: true, request: savedRequest, entry: convergence.entry, review_audit_id: reviewAuditResult.audit.id });
      }

      const reviewGateEntryId = String(correctionRequest.time_entry_id || '');
      const reviewMutationGate = await claimCorrectionCreateLock(
        stateEntity, state.id, requestId, reviewGateEntryId, reviewHash,
      );
      if (!reviewMutationGate?.acquired) {
        if (reviewMutationGate?.different_request) await releaseReview();
        return Response.json({
          success: false,
          ...(reviewMutationGate?.retry_same_request === true ? { retry_same_request: true } : {}),
          error: reviewMutationGate?.error || 'The correction review could not acquire the employee mutation gate.',
        }, { status: 409 });
      }

      try {
      let entry = await entryEntity.get(correctionRequest.time_entry_id).catch(() => null);
      const expectedUnderlyingStatus = missedClockOutRecovery ? 'needs_resolution' : 'clocked_out';
      const underlyingEligible = Boolean(
        entry?.id && asEmail(entry.user_email) === target.email && !entry.archived_test_data && !entry.archived_admin &&
        entry.status === expectedUnderlyingStatus && (missedClockOutRecovery || Boolean(entry.clock_out))
      );
      if (!underlyingEligible) {
        await releaseReview();
        return Response.json({ success: false, error: missedClockOutRecovery
          ? 'The unresolved missed-clock-out TimeEntry is no longer eligible for this correction.'
          : 'The underlying completed TimeEntry is no longer eligible for this correction.' }, { status: 409 });
      }
      if (entryIsPayPeriodLocked(entry)) {
        await releaseReview();
        return Response.json({ success: false, error: 'This shift is locked by a finalized pay period. Reopen that pay period before applying a correction.' }, { status: 409 });
      }

      const auditRows = await auditEntity.filter({ action: 'admin_correction', request_id: requestId });
      if (!Array.isArray(auditRows)) throw new Error('Correction audit recovery lookup did not return a record list.');
      if (auditRows.length > 1 || auditRows.some((row: any) =>
        !row?.id || String(row.time_entry_id || '') !== String(entry.id) ||
        asEmail(row.user_email) !== target.email ||
        String(row.details?.correction_request_id || '') !== correctionRequest.id ||
        !constantTimeEqual(String(row.details?.review_payload_hash || ''), reviewHash)
      )) {
        return Response.json({ success: false, error: 'Manager review correction audit has conflicting global request ownership. Admin investigation is required.' }, { status: 409 });
      }
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
                payroll_membership: payrollMembershipEnvelope(entry.clock_in),
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
        const correctedClockInDay = dateKeyInCompanyTime(clockIn.toISOString());
        if (!correctedClockInDay) {
          if (correctionAudit?.id && correctionAudit.outcome === 'pending') await auditEntity.updateMany({ id: correctionAudit.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
          await releaseReview();
          return Response.json({ success: false, error: 'The approved Clock In cannot be mapped to the company payroll date.' }, { status: 400 });
        }
        const finalizedPeriods = await payPeriodEntity.filter({ status: 'finalized' });
        if (!Array.isArray(finalizedPeriods)) throw new Error('Finalized pay-period lookup did not return a record list.');
        const invalidFinalizedPeriod = finalizedPeriods.find((period: any) => {
          const start = validDateKey(period.start_date);
          const end = validDateKey(period.end_date);
          return !start || !end || start > end;
        });
        if (invalidFinalizedPeriod) {
          if (correctionAudit?.id && correctionAudit.outcome === 'pending') await auditEntity.updateMany({ id: correctionAudit.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
          await releaseReview();
          return Response.json({ success: false, error: 'A finalized pay period has invalid date boundaries. Admin review is required before applying this correction.' }, { status: 409 });
        }
        const destinationClosedPeriod = finalizedPeriods.find((period: any) =>
          correctedClockInDay >= period.start_date && correctedClockInDay <= period.end_date,
        );
        if (destinationClosedPeriod) {
          if (correctionAudit?.id && correctionAudit.outcome === 'pending') await auditEntity.updateMany({ id: correctionAudit.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
          await releaseReview();
          return Response.json({
            success: false,
            error: `The approved Clock In belongs to finalized pay period ${destinationClosedPeriod.label || 'a closed period'} (${destinationClosedPeriod.start_date} to ${destinationClosedPeriod.end_date}). Reopen that destination period before applying this correction.`,
            finalized_pay_period_id: destinationClosedPeriod.id,
          }, { status: 409 });
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
          { id: entry.id, updated_date: entry.updated_date, user_email: target.email, status: expectedUnderlyingStatus, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
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
              payroll_membership: payrollMembershipEnvelope(entry.clock_in),
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
      const punchReconciled = await reconcileMissedClockOutTerminal(savedRequest, correctionAuditId);
      if (punchReconciled.investigation) return Response.json({ success: false, error: 'The correction was applied but the linked Punch Exception is inconsistent. Admin investigation is required.' }, { status: 409 });
      if (!punchReconciled.ok) return Response.json({ success: false, retry_same_request: true, error: 'The correction was applied but its Punch Exception could not be finalized. Retry the same review.' }, { status: 409 });
      const convergence = await verifyCorrectionReviewConvergence(savedRequest, correctionAuditId);
      if (!convergence.ok) return Response.json({ success: false, error: 'The applied correction has not converged with its TimeEntry and audit evidence. Admin investigation is required.' }, { status: 409 });
      return Response.json({ success: true, request: savedRequest, entry: convergence.entry, audit_id: correctionAuditId, review_audit_id: reviewAuditResult.audit.id });
      } finally {
        const released = await releaseCorrectionCreateLock(
          stateEntity, state.id, requestId, reviewGateEntryId, reviewHash, String(reviewMutationGate.claim_token || ''),
        );
        if (!released) throw new Error('The manager correction-review gate could not be released or verified after processing. Retry the same review request to recover its lock.');
      }
      } finally {
        const globalReleased = await releaseManagerReviewDecisionGate(
          adminCorrectionGateEntity, auditEntity, correctionRequestEntity, entryEntity,
          String(companyReviewGate.id || ''), requestId, correctionRequest.id, reviewHash,
          String(companyReviewGate.token || ''), true,
        );
        if (!globalReleased) throw new Error('Manager-review company coordinator has an uncertain result. It remains claimed until authoritative review evidence is reconciled.');
      }
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
      const correctedClockInDay = dateKeyInCompanyTime(clockIn.toISOString());
      if (!correctedClockInDay) return Response.json({ success: false, error: 'The corrected Clock In cannot be mapped to the company payroll date.' }, { status: 400 });
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
      const priorCorrectionAudits = await auditEntity.filter({ action: 'admin_correction', request_id: requestId });
      if (!Array.isArray(priorCorrectionAudits)) throw new Error('Administrative correction audit lookup did not return a record list.');
      if (priorCorrectionAudits.length > 1) return Response.json({ success: false, error: 'This administrative correction request has multiple audit records. Admin investigation is required.' }, { status: 409 });
      let intent = priorCorrectionAudits[0] || null;
      if (intent?.id && (String(intent.time_entry_id || '') !== String(entry.id || '') ||
          asEmail(intent.user_email) !== target.email)) {
        return Response.json({ success: false, error: 'This administrative correction request id belongs to another employee or shift. Submit a new request id.' }, { status: 409 });
      }
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
              details: { ...(intent.details || {}), payroll_membership: payrollMembershipEnvelope(entry.clock_in), corrected: entryAuditSnapshot(entry), recovered_after_entry_save: true },
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
          const completedGateReleased = await releaseCompletedCorrectionCreateLock(
            stateEntity, state.id, requestId, entry.id, correctionPayloadHash,
          );
          if (!completedGateReleased) {
            return Response.json({ success: false, retry_same_request: true, error: 'The correction is saved, but the shared correction/approval lock still needs recovery. Retry this same correction request.' }, { status: 409 });
          }
          return Response.json({ success: true, entry, audit_id: intent?.id || null, reused: true });
        }
      }
      if (intent?.outcome === 'confirmed' || intent?.outcome === 'recovered') {
        return Response.json({ success: false, error: 'This correction request was already confirmed but the TimeEntry request marker does not match. Admin investigation is required.' }, { status: 409 });
      }
      if (String(entry.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ success: false, error: 'This time entry changed in another session. Reload before correcting it.' }, { status: 409 });
      }
      const adminCorrectionGate = await claimCorrectionCreateLock(
        stateEntity, state.id, requestId, entry.id, correctionPayloadHash,
      );
      if (!adminCorrectionGate?.acquired) {
        return Response.json({
          success: false,
          ...(adminCorrectionGate?.retry_same_request ? { retry_same_request: true } : {}),
          error: adminCorrectionGate?.investigation
            ? adminCorrectionGate.error
            : 'Another correction submission or shift approval is being processed for this employee. Retry after the current action finishes.',
        }, { status: 409 });
      }
      try {
      const companyCorrectionGate = await claimAdminCorrectionGate(
        adminCorrectionGateEntity, auditEntity, entryEntity, stateEntity,
        requestId, entry.id, correctionPayloadHash, correctionRequestEntity,
      );
      if (!companyCorrectionGate.acquired) {
        return Response.json({ success: false, retry_same_request: companyCorrectionGate.retry_same_request === true,
          error: companyCorrectionGate.error }, { status: 409 });
      }
      let coordinatorWriteStarted = Boolean(intent?.id);
      try {
      // The earlier global audit lookup is only an optimization: repeat it
      // under company CAS before any write to close the cross-employee race.
      const confirmedOwner = await auditEntity.filter({ action: 'admin_correction', request_id: requestId });
      if (!Array.isArray(confirmedOwner) || confirmedOwner.length > 1 ||
          (confirmedOwner[0] && (String(confirmedOwner[0].time_entry_id || '') !== String(entry.id) ||
            asEmail(confirmedOwner[0].user_email) !== target.email ||
            !constantTimeEqual(String(confirmedOwner[0].details?.payload_hash || ''), correctionPayloadHash)))) {
        return Response.json({ success: false, error: 'This manager-correction request ID has conflicting authoritative audit ownership. Admin investigation is required.' }, { status: 409 });
      }
      // Finalization holds this same employee mutation gate through commit. Check
      // the corrected company date only after acquiring it so a destination
      // period cannot become finalized between validation and the correction write.
      const finalizedPeriods = await payPeriodEntity.filter({ status: 'finalized' });
      if (!Array.isArray(finalizedPeriods)) throw new Error('Finalized pay-period lookup did not return a record list.');
      const invalidFinalizedPeriod = finalizedPeriods.find((period: any) => {
        const start = validDateKey(period.start_date);
        const end = validDateKey(period.end_date);
        return !start || !end || start > end;
      });
      if (invalidFinalizedPeriod) {
        return Response.json({ success: false, error: 'A finalized pay period has invalid date boundaries. Admin review is required before correcting this shift.' }, { status: 409 });
      }
      const destinationClosedPeriod = finalizedPeriods.find((period: any) =>
        correctedClockInDay >= period.start_date && correctedClockInDay <= period.end_date,
      );
      if (destinationClosedPeriod) {
        return Response.json({
          success: false,
          error: `The corrected Clock In belongs to finalized pay period ${destinationClosedPeriod.label || 'a closed period'} (${destinationClosedPeriod.start_date} to ${destinationClosedPeriod.end_date}). Reopen that destination period before moving this shift into it.`,
          finalized_pay_period_id: destinationClosedPeriod.id,
        }, { status: 409 });
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
        coordinatorWriteStarted = true;
        intent = await auditEntity.create({
          action: 'admin_correction', outcome: 'pending', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target), server_timestamp: now, request_id: requestId,
          time_entry_id: entry.id, reason,
          details: { payload_hash: correctionPayloadHash, payroll_membership: payrollMembershipEnvelope(nextFields.clock_in), original: entryAuditSnapshot(entry), requested: nextFields },
        });
      }
      if (!intent?.id) throw new Error('Correction audit intent could not be persisted. No TimeEntry was changed.');

      let claimedState: any = null;
      if (entry.status === 'clocked_in' && clockOut) {
        claimedState = await setState(stateEntity, state, 'clocked_in', null, {
          status: 'clocking_out', last_request_id: requestId, last_request_payload_hash: null, pending_started_at: now,
        });
        if (!claimedState) {
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { ...(intent.details || {}), original: entryAuditSnapshot(entry), reason: 'Authoritative state changed before correction claim.' } } });
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
        await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { ...(intent.details || {}), original: entryAuditSnapshot(entry), reason: 'TimeEntry changed before correction update.' } } });
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
          await auditEntity.updateMany({ id: intent.id }, { $set: { outcome: 'blocked', details: { ...(intent.details || {}), original: entryAuditSnapshot(entry), corrected: entryAuditSnapshot(savedEntry), reason: 'Active entry corrected but authoritative state changed during correction.' } } });
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
            payroll_membership: payrollMembershipEnvelope(savedEntry.clock_in),
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
      } finally {
        const globalReleased = await releaseAdminCorrectionGate(
          adminCorrectionGateEntity, auditEntity, entryEntity,
          String(companyCorrectionGate.id || ''), requestId, entry.id, correctionPayloadHash,
          String(companyCorrectionGate.token || ''),
          !coordinatorWriteStarted,
        );
        if (!globalReleased) throw new Error('Manager-correction coordinator has uncertain completion and remains claimed. Admin investigation is required before further manager corrections.');
      }
      } finally {
        const released = await releaseCorrectionCreateLock(
          stateEntity, state.id, requestId, entry.id, correctionPayloadHash,
          String(adminCorrectionGate.claim_token || ''),
        );
        if (!released) {
          const currentGate = await freshState(stateEntity, state.id).catch(() => null);
          const gateStatus = String(currentGate?.correction_create_status || '');
          const safelyReleased = currentGate?.id && (
            gateStatus === 'idle' ||
            (gateStatus === 'creating' && String(currentGate.correction_create_request_id || '') !== requestId)
          );
          if (!safelyReleased) {
            throw new Error('The administrative correction gate could not be released or verified after processing. Retry the same correction request to recover its lock.');
          }
        }
      }
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

      const syncLateClockInPunchCase = async (record: any, approvalAuditId: string) => {
        if (!record?.punch_exception_id) return true;
        const punchCase = await punchExceptionEntity.get(record.punch_exception_id).catch(() => null);
        if (!punchCase?.id || String(punchCase.exception_type || '') !== 'late_clock_in') return true;
        if (String(punchCase.time_entry_id || '') !== record.id || asEmail(punchCase.user_email) !== target.email) return false;
        const expectedCaseStatus = decision === 'approve' ? 'resolved' : 'pending_manager_review';
        if (String(punchCase.status || '') === expectedCaseStatus &&
            (decision !== 'approve' || String(punchCase.resolution_audit_id || '') === String(approvalAuditId || ''))) return true;
        const updated = await punchExceptionEntity.updateMany(
          { id: punchCase.id, time_entry_id: record.id, user_email: target.email },
          { $set: {
            status: expectedCaseStatus,
            ...(decision === 'approve' ? {
              resolution_audit_id: approvalAuditId,
              resolution_note: 'Manager approved the completed shift reconstructed from the employee-reported missed Clock In.',
            } : {
              resolution_note: 'Manager returned the reconstructed missed Clock In shift to Needs Review.',
            }),
          } },
        );
        if (!updated || typeof updated.updated !== 'number') return false;
        const verified = await punchExceptionEntity.get(punchCase.id).catch(() => null);
        return Boolean(verified?.id && String(verified.status || '') === expectedCaseStatus &&
          (decision !== 'approve' || String(verified.resolution_audit_id || '') === String(approvalAuditId || '')));
      };
      const correctionAuditMatchesRecord = (appliedAudit: any, record: any, correctionRequestId = '') => {
        const corrected = appliedAudit?.details?.corrected || {};
        return Boolean(
          appliedAudit?.id &&
          ['confirmed', 'recovered'].includes(String(appliedAudit.outcome || '')) &&
          String(appliedAudit.action || '') === 'admin_correction' &&
          String(appliedAudit.time_entry_id || '') === record.id &&
          asEmail(appliedAudit.user_email) === target.email &&
          (!correctionRequestId || String(appliedAudit.details?.correction_request_id || '') === correctionRequestId) &&
          String(corrected.clock_in || '') === String(record.clock_in || '') &&
          String(corrected.clock_out || '') === String(record.clock_out || '') &&
          Number(corrected.lunch_minutes || 0) === Number(record.lunch_minutes || 0) &&
          String(corrected.notes || '') === String(record.notes || '')
        );
      };
      const verifyResolvedCorrectionForApproval = async (record: any) => {
        const linkedRequestId = String(record?.correction_needs_review_request_id || '');
        const correctionMarker = String(record?.last_correction_request_id || '');
        if (linkedRequestId) {
          const rows = await correctionRequestEntity.filter({ request_id: linkedRequestId, time_entry_id: record.id });
          if (!Array.isArray(rows) || rows.length !== 1) return false;
          const linked = rows[0];
          if (asEmail(linked.user_email) !== target.email ||
              !['approved', 'approved_modified'].includes(String(linked.status || '')) ||
              correctionMarker !== String(linked.id || '') ||
              !linked.applied_audit_id) return false;
          const appliedAudit = await auditEntity.get(linked.applied_audit_id).catch(() => null);
          return correctionAuditMatchesRecord(appliedAudit, record, String(linked.id || ''));
        }
        if (!correctionMarker) return true;

        const linkedById = await correctionRequestEntity.get(correctionMarker).catch(() => null);
        if (linkedById?.id) {
          if (asEmail(linkedById.user_email) !== target.email ||
              String(linkedById.time_entry_id || '') !== String(record.id) ||
              !['approved', 'approved_modified'].includes(String(linkedById.status || '')) ||
              !linkedById.applied_audit_id) return false;
          const appliedAudit = await auditEntity.get(linkedById.applied_audit_id).catch(() => null);
          return correctionAuditMatchesRecord(appliedAudit, record, String(linkedById.id || ''));
        }

        if (String(record.clock_source || '') !== 'admin_correction') return false;
        const directAudits = await auditEntity.filter({
          action: 'admin_correction', request_id: correctionMarker, time_entry_id: record.id,
        });
        if (!Array.isArray(directAudits) || directAudits.length !== 1) return false;
        return correctionAuditMatchesRecord(directAudits[0], record);
      };
      if (decision === 'approve' && actorEmail === target.email && actor.is_full_admin !== true) {
        return Response.json({
          success: false,
          error: 'You cannot approve your own Time Clock shift. Another administrator must review and approve this shift.',
        }, { status: 403 });
      }
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
        if (!await syncLateClockInPunchCase(entry, intent.id)) {
          return Response.json({ success: false, retry_same_request: true, error: 'The approval is saved, but its Missed Clock In report still needs finalization. Retry this same approval.' }, { status: 409 });
        }
        if (decision === 'approve' && !await verifyResolvedCorrectionForApproval(entry)) {
          return Response.json({ success: false, error: 'The final shift approval no longer matches its terminal correction request and applied correction audit. Admin investigation is required.' }, { status: 409 });
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
      const currentApprovalStatus = String(entry.approval_status || 'unreviewed');
      if (decision === 'approve' && !['unreviewed', 'needs_review'].includes(currentApprovalStatus)) {
        return Response.json({ success: false, error: 'This shift is already approved or its review state changed in another session. Reload before taking another approval action.' }, { status: 409 });
      }
      if (decision === 'reopen' && currentApprovalStatus !== 'approved') {
        return Response.json({ success: false, error: 'This shift is no longer approved. Reload before sending it back for review.' }, { status: 409 });
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
        if (!await verifyResolvedCorrectionForApproval(entry)) {
          return Response.json({ success: false, error: 'This corrected shift does not match its terminal correction request and applied correction audit. Review the correction evidence before approving the shift.' }, { status: 409 });
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
      if (!await syncLateClockInPunchCase(savedEntry, finalAudit.id)) {
        return Response.json({ success: false, retry_same_request: true, error: 'The approval is saved, but its Missed Clock In report still needs finalization. Retry this same approval.' }, { status: 409 });
      }
      if (decision === 'approve' && !await verifyResolvedCorrectionForApproval(savedEntry)) {
        return Response.json({ success: false, error: 'The saved final approval no longer matches its terminal correction request and applied correction audit. Admin investigation is required.' }, { status: 409 });
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
          details: { payload_hash: archivePayloadHash, payroll_membership: payrollMembershipEnvelope(entry.clock_in), original: entryAuditSnapshot(entry) },
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
            payroll_membership: payrollMembershipEnvelope(savedEntry.clock_in),
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

    if (action === 'recover_missed_clock_in' || action === 'report_missed_clock_in') {
      const serverNow = new Date();
      const companyMinutes = minutesOfDayInCompanyTime(serverNow.toISOString());
      if (action === 'recover_missed_clock_in' && (!Number.isInteger(companyMinutes) || companyMinutes < 15 * 60)) {
        return Response.json({ success: false, error: 'Missed Clock In recovery is only available at or after 3:00 PM company time.' }, { status: 409 });
      }

      const claimedClockIn = new Date(String(body?.claimed_clock_in || ''));
      if (!Number.isFinite(claimedClockIn.getTime())) {
        return Response.json({ success: false, error: 'Enter the date and time you actually arrived.' }, { status: 400 });
      }
      if (claimedClockIn.getTime() > serverNow.getTime()) {
        return Response.json({ success: false, error: 'The reported Clock In cannot be in the future.' }, { status: 400 });
      }

      const companyDate = dateKeyInCompanyTime(serverNow.toISOString());
      const claimedCompanyDate = dateKeyInCompanyTime(claimedClockIn.toISOString());
      if (!companyDate || !claimedCompanyDate || claimedCompanyDate !== companyDate) {
        return Response.json({ success: false, error: 'Late-day self-service recovery can only reconstruct a missing Clock In from today. Older missing punches require manager review.' }, { status: 400 });
      }

      const claimedClockInIso = claimedClockIn.toISOString();
      const recoveryPayloadHash = await payloadHash({
        action: 'recover_missed_clock_in',
        user_email: target.email,
        claimed_clock_in: claimedClockInIso,
        company_date: companyDate,
      });

      let entry = await uniqueRow(
        entryEntity,
        { user_email: target.email, clock_in_request_id: requestId, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
        'Missed Clock In recovery request',
      );

      const exactRecoveredEntry = Boolean(
        entry?.id &&
        entry.status === 'clocked_in' &&
        asEmail(entry.user_email) === target.email &&
        entry.clock_source === 'employee_attested_missed_clock_in' &&
        String(entry.clock_in_request_id || '') === requestId &&
        String(entry.clock_in || '') === claimedClockInIso
      );

      if (entry?.id && !exactRecoveredEntry) {
        return Response.json({ success: false, error: 'This recovery request id is already tied to a different Clock In record.' }, { status: 409 });
      }

      const existingActives = await entryEntity.filter({
        user_email: target.email,
        status: 'clocked_in',
        archived_test_data: { $ne: true },
        archived_admin: { $ne: true },
      });
      if (!Array.isArray(existingActives)) throw new Error('Active TimeEntry lookup did not return a record list.');
      const unrelatedActive = existingActives.find((row: any) => !entry?.id || row.id !== entry.id);
      if (unrelatedActive?.id) {
        return Response.json({ success: false, error: 'An active shift already exists for this employee. Reload Time Clock before using missed Clock In recovery.' }, { status: 409 });
      }

      if (!exactRecoveredEntry && state.status !== 'clocked_out' &&
          !(state.status === 'clocking_in' && String(state.last_request_id || '') === requestId)) {
        return Response.json({ success: false, error: 'Employee Time Clock state changed before missed Clock In recovery could start.' }, { status: 409 });
      }
      if (exactRecoveredEntry && state.status === 'clocked_in' && state.active_entry_id !== entry.id) {
        return Response.json({ success: false, error: 'Recovered Clock In exists but authoritative employee state points to another shift. Admin investigation is required.' }, { status: 409 });
      }

      const finalizedPeriods = await payPeriodEntity.filter({ status: 'finalized' });
      if (!Array.isArray(finalizedPeriods)) throw new Error('Finalized pay-period lookup did not return a record list.');
      const invalidFinalizedPeriod = finalizedPeriods.find((period: any) => {
        const start = validDateKey(period.start_date);
        const end = validDateKey(period.end_date);
        return !start || !end || start > end;
      });
      if (invalidFinalizedPeriod) {
        return Response.json({ success: false, error: 'A finalized pay period has invalid date boundaries. Admin review is required before a missing Clock In can be reconstructed.' }, { status: 409 });
      }
      const closedPeriod = finalizedPeriods.find((period: any) =>
        claimedCompanyDate >= period.start_date && claimedCompanyDate <= period.end_date
      );
      if (closedPeriod) {
        return Response.json({
          success: false,
          error: 'The reported arrival belongs to a finalized pay period. An administrator must reopen that period before reconstructing the missing Clock In.',
          finalized_pay_period_id: closedPeriod.id,
        }, { status: 409 });
      }

      const gateEntryId = 'late_clock_in:' + target.email;
      const gate = await claimCorrectionCreateLock(stateEntity, state.id, requestId, gateEntryId, recoveryPayloadHash);
      if (!gate?.acquired) {
        return Response.json({
          success: false,
          ...(gate?.retry_same_request === true ? { retry_same_request: true } : {}),
          error: gate?.error || 'Missed Clock In recovery could not acquire its authoritative employee lock.',
        }, { status: 409 });
      }
      state = gate.state?.id ? gate.state : await freshState(stateEntity, state.id);

      try {
        const reportedAt = entry?.missed_clock_in_reported_at || new Date().toISOString();
        let claimedState = state;
        if (!exactRecoveredEntry) {
          claimedState = state.status === 'clocking_in' && String(state.last_request_id || '') === requestId
            ? state
            : await setState(stateEntity, state, 'clocked_out', null, {
                status: 'clocking_in',
                active_entry_id: null,
                last_request_id: requestId,
                last_request_payload_hash: recoveryPayloadHash,
                pending_started_at: reportedAt,
                break_status: 'working', active_break_id: null,
                last_break_request_id: null, break_pending_started_at: null,
                work_pause_status: 'working', active_work_pause_id: null,
                last_work_pause_request_id: null, work_pause_pending_started_at: null,
                labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
                labor_pending_activity_type: '', labor_pending_work_order_id: '',
              });
          if (!claimedState) {
            return Response.json({ success: false, error: 'Missed Clock In recovery lost a concurrency race. Reload status before retrying.' }, { status: 409 });
          }

          entry = await uniqueRow(
            entryEntity,
            { user_email: target.email, clock_in_request_id: requestId, archived_test_data: { $ne: true }, archived_admin: { $ne: true } },
            'Missed Clock In recovery request',
          );
          if (!entry) {
            entry = await entryEntity.create({
              user_email: target.email,
              user_name: target.full_name || target.email,
              clock_in: claimedClockInIso,
              clock_in_request_id: requestId,
              clock_source: 'employee_attested_missed_clock_in',
              missed_clock_in_reported_at: reportedAt,
              status: 'clocked_in',
              approval_status: 'needs_review',
            });
          }
        }

        if (!entry?.id || entry.status !== 'clocked_in' ||
            asEmail(entry.user_email) !== target.email ||
            entry.clock_source !== 'employee_attested_missed_clock_in' ||
            String(entry.clock_in_request_id || '') !== requestId ||
            String(entry.clock_in || '') !== claimedClockInIso) {
          return Response.json({ success: false, error: 'The reconstructed Clock In could not be tied to this exact employee response.' }, { status: 409 });
        }

        const caseKey = 'late_clock_in:' + entry.id;
        let punchCase = await uniqueRow(punchExceptionEntity, { case_key: caseKey }, 'Missed Clock In case');
        if (!punchCase?.id) {
          punchCase = await punchExceptionEntity.create({
            case_key: caseKey,
            user_email: target.email,
            user_name: target.full_name || target.email,
            time_entry_id: entry.id,
            exception_type: 'late_clock_in',
            status: 'pending_manager_review',
            detected_at: reportedAt,
            detected_clock_in: claimedClockInIso,
            original_snapshot: {
              missing_clock_in: true,
              detected_at: reportedAt,
              company_date: companyDate,
            },
            employee_response: 'missed_clock_in',
            claimed_clock_in: claimedClockInIso,
            submitted_at: reportedAt,
            request_id: requestId,
            resolution_note: action === 'report_missed_clock_in'
              ? 'Employee self-reported a missed Clock In from the Quick Clock arrival-time prompt; shift requires manager review.'
              : 'Employee reconstructed a missing Clock In after the 3:00 PM late-day check; completed shift requires manager review.',
          });
        }
        if (!punchCase?.id ||
            asEmail(punchCase.user_email) !== target.email ||
            String(punchCase.time_entry_id || '') !== entry.id ||
            String(punchCase.exception_type || '') !== 'late_clock_in' ||
            String(punchCase.claimed_clock_in || '') !== claimedClockInIso ||
            String(punchCase.request_id || '') !== requestId) {
          return Response.json({ success: false, error: 'The Missed Clock In exception record does not match this reconstructed shift.' }, { status: 409 });
        }

        if (String(entry.punch_exception_id || '') !== punchCase.id) {
          const linked = await entryEntity.updateMany(
            { id: entry.id, updated_date: entry.updated_date, user_email: target.email, status: 'clocked_in' },
            { $set: {
              punch_exception_id: punchCase.id,
              approval_status: 'needs_review',
              missed_clock_in_reported_at: reportedAt,
            } },
          );
          if (!linked || linked.updated !== 1) {
            const fresh = await entryEntity.get(entry.id).catch(() => null);
            if (!fresh?.id || String(fresh.punch_exception_id || '') !== punchCase.id) {
              return Response.json({ success: false, retry_same_request: true, error: 'The reconstructed shift was saved but its exception link still needs recovery. Retry the same request.' }, { status: 409 });
            }
            entry = fresh;
          } else {
            entry = await entryEntity.get(entry.id);
          }
        }

        await ensureClockInAudit({ auditEntity, entry, target, actor, requestId });
        const punchAudit = await ensureActionAudit(auditEntity, {
          action: 'punch_exception', outcome: 'confirmed', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: reportedAt, request_id: requestId, time_entry_id: entry.id,
          reason: action === 'report_missed_clock_in'
            ? 'Employee reported a missed Clock In from the Quick Clock arrival-time prompt'
            : 'Employee reported a missing Clock In during the late-day pre-clockout review',
          details: {
            payload_hash: recoveryPayloadHash,
            punch_exception_id: punchCase.id,
            response: 'missed_clock_in',
            claimed_clock_in: claimedClockInIso,
            company_date: companyDate,
          },
        }, 'Missed Clock In punch-exception audit');

        if (String(punchCase.resolution_audit_id || '') !== punchAudit.audit.id) {
          await punchExceptionEntity.updateMany(
            { id: punchCase.id, time_entry_id: entry.id, request_id: requestId },
            { $set: { resolution_audit_id: punchAudit.audit.id } },
          );
          punchCase = await punchExceptionEntity.get(punchCase.id);
        }

        const currentState = await freshState(stateEntity, state.id);
        if (currentState.status === 'clocking_in' && String(currentState.last_request_id || '') === requestId) {
          const finalizedState = await setState(stateEntity, currentState, 'clocking_in', requestId, {
            status: 'clocked_in',
            active_entry_id: entry.id,
            last_action_at: reportedAt,
            pending_started_at: null,
            last_request_payload_hash: recoveryPayloadHash,
            break_status: 'working', active_break_id: null,
            last_break_request_id: null, break_pending_started_at: null,
            work_pause_status: 'working', active_work_pause_id: null,
            last_work_pause_request_id: null, work_pause_pending_started_at: null,
            labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
            labor_pending_activity_type: '', labor_pending_work_order_id: '',
          });
          if (!finalizedState) {
            return Response.json({ success: false, retry_same_request: true, error: 'The reconstructed Clock In and audits were saved, but authoritative state still needs finalization. Retry the same request.' }, { status: 409 });
          }
          state = finalizedState;
        } else if (!(currentState.status === 'clocked_in' && currentState.active_entry_id === entry.id)) {
          return Response.json({ success: false, retry_same_request: true, error: 'The reconstructed Clock In is saved, but authoritative employee state changed unexpectedly. Retry the same request or request admin review.' }, { status: 409 });
        }

        return Response.json({
          success: true,
          status: 'clocked_in',
          recovered_missed_clock_in: true,
          entry,
          punch_exception: punchCase,
          user: publicEmployee(target),
        });
      } finally {
        let releaseFailed = false;
        try {
          const released = await releaseCorrectionCreateLock(
            stateEntity, state.id, requestId, gateEntryId,
            recoveryPayloadHash, String(gate.claim_token || ''),
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
          throw new Error('Missed Clock In employee mutation gate could not be released safely. Retry this same recovery request.');
        }
      }
    }

    if (action === 'resolve_punch_exception') {
      const responseType = String(body?.response || '').trim();
      if (!['missed_clock_out', 'worked_through'].includes(responseType)) {
        return Response.json({ success: false, error: 'Choose whether the prior shift was missed at Clock Out or is still being worked.' }, { status: 400 });
      }

      if (state.status === 'clocked_out') {
        const priorCases = await punchExceptionEntity.filter({ user_email: target.email, request_id: requestId });
        if (!Array.isArray(priorCases)) throw new Error('Punch-exception recovery lookup did not return a record list.');
        if (priorCases.length > 1) return Response.json({ success: false, error: 'This punch-resolution request is ambiguous. Admin investigation is required.' }, { status: 409 });
        const priorCase = priorCases[0] || null;
        if (priorCase?.status === 'pending_manager_review' && responseType === 'missed_clock_out') {
          const priorCorrection = priorCase.correction_request_id
            ? await correctionRequestEntity.get(priorCase.correction_request_id).catch(() => null)
            : null;
          if (!priorCorrection?.id || priorCorrection.status !== 'pending') {
            return Response.json({ success: false, error: 'The prior shift was detached but its correction request is incomplete. Admin investigation is required.' }, { status: 409 });
          }
          return Response.json({
            success: true, status: 'clocked_out', reused: true,
            punch_resolution_pending: true, punch_exception: priorCase,
            correction_request: priorCorrection, user: publicEmployee(target),
          });
        }
        return Response.json({ success: false, error: 'There is no active prior shift to resolve with this request.' }, { status: 409 });
      }

      if (state.status !== 'clocked_in' || !state.active_entry_id) {
        return Response.json({ success: false, error: 'An active shift is required for missed-punch resolution.' }, { status: 409 });
      }

      let entry = await entryEntity.get(state.active_entry_id).catch(() => null);
      const recoveringDetached = Boolean(
        entry?.id && entry.status === 'needs_resolution' &&
        String(entry.punch_resolution_request_id || '') === requestId &&
        asEmail(entry.user_email) === target.email
      );
      if (!entry?.id || (!recoveringDetached && entry.status !== 'clocked_in') ||
          asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
        return Response.json({ success: false, error: 'The active shift no longer matches this employee or is not eligible for punch recovery.' }, { status: 409 });
      }
      if (entryIsPayPeriodLocked(entry)) {
        return Response.json({ success: false, error: 'This shift is locked by a finalized pay period. An administrator must reopen the period before punch recovery.' }, { status: 409 });
      }

      const clockInMs = new Date(entry.clock_in).getTime();
      const serverNow = new Date();
      if (!Number.isFinite(clockInMs) || serverNow.getTime() < clockInMs) {
        return Response.json({ success: false, error: 'The stored clock-in timestamp is invalid. Admin review is required.' }, { status: 409 });
      }
      const crossedCompanyDate = dateKeyInCompanyTime(entry.clock_in) !== dateKeyInCompanyTime(serverNow.toISOString());
      if (!recoveringDetached && (!crossedCompanyDate || (serverNow.getTime() - clockInMs) < MISSED_PUNCH_PROMPT_MS)) {
        return Response.json({ success: false, error: 'This shift has not reached the missed-punch recovery threshold.' }, { status: 409 });
      }

      let claimedClockOutIso = '';
      if (responseType === 'missed_clock_out') {
        const claimedClockOut = new Date(String(body?.claimed_clock_out || ''));
        if (!Number.isFinite(claimedClockOut.getTime())) {
          return Response.json({ success: false, error: 'Enter the date and time you actually stopped working.' }, { status: 400 });
        }
        if (claimedClockOut.getTime() < clockInMs) {
          return Response.json({ success: false, error: 'The reported clock-out cannot be before the original clock-in.' }, { status: 400 });
        }
        if (claimedClockOut.getTime() > serverNow.getTime()) {
          return Response.json({ success: false, error: 'The reported clock-out cannot be in the future.' }, { status: 400 });
        }
        claimedClockOutIso = claimedClockOut.toISOString();

        if (breakStatusOf(state) !== 'working' || state.active_break_id) {
          return Response.json({ success: false, error: 'The prior shift still has an active break. A manager must resolve that break before self-service missed clock-out recovery.' }, { status: 409 });
        }
        if (workPauseStatusOf(state) !== 'working' || state.active_work_pause_id) {
          return Response.json({ success: false, error: 'The prior shift still has an active Work Pause. A manager must resolve it before self-service missed clock-out recovery.' }, { status: 409 });
        }
        if (laborStatusOf(state) !== 'idle') {
          return Response.json({ success: false, error: 'Current Work is still changing. Retry after authoritative state settles.' }, { status: 409 });
        }
        const activeLabor = await activeLaborForEntry(laborEntity, entry.id, target.email);
        if (activeLabor?.id) {
          return Response.json({ success: false, error: 'The prior shift still has active Current Work. A manager must resolve that labor segment before self-service missed clock-out recovery.' }, { status: 409 });
        }
      }

      const punchPayloadHash = await payloadHash({
        action: 'resolve_punch_exception',
        user_email: target.email,
        time_entry_id: entry.id,
        response: responseType,
        claimed_clock_out: claimedClockOutIso || null,
      });
      const gateEntryId = `punch_exception:${entry.id}`;
      const gate = await claimCorrectionCreateLock(stateEntity, state.id, requestId, gateEntryId, punchPayloadHash);
      if (!gate?.acquired) {
        return Response.json({
          success: false,
          ...(gate?.retry_same_request === true ? { retry_same_request: true } : {}),
          error: gate?.error || 'Punch recovery could not acquire its authoritative employee lock.',
        }, { status: 409 });
      }
      state = gate.state?.id ? gate.state : await freshState(stateEntity, state.id);

      try {
        entry = await entryEntity.get(entry.id).catch(() => null);
        if (!entry?.id || asEmail(entry.user_email) !== target.email || entry.archived_test_data || entry.archived_admin) {
          return Response.json({ success: false, error: 'The affected TimeEntry changed before punch recovery could continue.' }, { status: 409 });
        }
        const caseKey = `missed_clock_out:${entry.id}`;
        let punchCase = await uniqueRow(punchExceptionEntity, { case_key: caseKey }, 'Missed clock-out case');
        if (punchCase?.id && (asEmail(punchCase.user_email) !== target.email || String(punchCase.time_entry_id || '') !== entry.id)) {
          return Response.json({ success: false, error: 'The existing punch exception does not match this employee shift. Admin investigation is required.' }, { status: 409 });
        }
        if (!punchCase?.id) {
          punchCase = await punchExceptionEntity.create({
            case_key: caseKey,
            user_email: target.email,
            user_name: target.full_name || target.email,
            time_entry_id: entry.id,
            exception_type: 'missed_clock_out',
            status: 'open',
            detected_at: serverNow.toISOString(),
            detected_clock_in: entry.clock_in,
            original_snapshot: entryAuditSnapshot(entry),
          });
        }
        if (!punchCase?.id) throw new Error('Missed clock-out case could not be persisted.');

        const priorAudit = await uniqueRow(auditEntity, {
          action: 'punch_exception', request_id: requestId, time_entry_id: entry.id,
        }, 'Punch-exception audit');
        if (priorAudit?.id) {
          const priorHash = String(priorAudit.details?.payload_hash || '');
          if (priorHash && !constantTimeEqual(priorHash, punchPayloadHash)) {
            return Response.json({ success: false, error: 'This punch-resolution request id is already bound to a different employee response.' }, { status: 409 });
          }
        }

        if (responseType === 'worked_through') {
          if (punchCase.status === 'worked_through' && String(punchCase.request_id || '') === requestId) {
            if (!priorAudit?.id || !constantTimeEqual(String(priorAudit.details?.payload_hash || ''), punchPayloadHash)) {
              return Response.json({ success: false, retry_same_request: true, error: 'The Worked Through response is saved but its exact audit could not be verified. Retry the same request.' }, { status: 409 });
            }
            return Response.json({
              success: true, status: 'clocked_in', worked_through: true, reused: true,
              entry, punch_exception: punchCase, user: publicEmployee(target),
            });
          }
          if (entry.status !== 'clocked_in') {
            return Response.json({ success: false, error: 'This prior shift has already been detached for manager review and cannot be changed to Worked Through.' }, { status: 409 });
          }
          const acknowledgedAt = new Date().toISOString();
          const acknowledgedUntil = new Date(Date.now() + MISSED_PUNCH_REPROMPT_MS).toISOString();
          const entryUpdate = await entryEntity.updateMany(
            { id: entry.id, updated_date: entry.updated_date, user_email: target.email, status: 'clocked_in' },
            { $set: {
              stale_shift_acknowledged_at: acknowledgedAt,
              stale_shift_acknowledged_request_id: requestId,
              punch_exception_id: punchCase.id,
            } },
          );
          if (!entryUpdate || entryUpdate.updated !== 1) {
            const fresh = await entryEntity.get(entry.id).catch(() => null);
            if (!(fresh?.status === 'clocked_in' && String(fresh.stale_shift_acknowledged_request_id || '') === requestId)) {
              return Response.json({ success: false, retry_same_request: true, error: 'Worked-through acknowledgement lost a concurrency race. Retry the same request.' }, { status: 409 });
            }
            entry = fresh;
          } else {
            entry = await entryEntity.get(entry.id);
          }

          const punchAudit = priorAudit?.id ? { audit: priorAudit } : await ensureActionAudit(auditEntity, {
            action: 'punch_exception', outcome: 'confirmed', user_email: target.email,
            user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
            authentication_method: authenticationMethodFor(actor, target),
            server_timestamp: acknowledgedAt, request_id: requestId, time_entry_id: entry.id,
            reason: 'Employee affirmed the long-running shift is still continuous work',
            details: {
              payload_hash: punchPayloadHash, punch_exception_id: punchCase.id,
              response: 'worked_through', original_clock_in: entry.clock_in,
              acknowledged_until: acknowledgedUntil,
            },
          }, 'Worked-through punch-exception audit');

          await punchExceptionEntity.updateMany(
            { id: punchCase.id },
            { $set: {
              status: 'worked_through', employee_response: 'worked_through',
              submitted_at: acknowledgedAt, request_id: requestId,
              acknowledged_until: acknowledgedUntil, resolution_audit_id: punchAudit.audit.id,
              resolution_note: 'Employee confirmed continuous work; no punch time was invented or changed.',
            } },
          );
          punchCase = await punchExceptionEntity.get(punchCase.id);
          return Response.json({
            success: true, status: 'clocked_in', worked_through: true,
            entry, punch_exception: punchCase, user: publicEmployee(target),
          });
        }

        if (punchCase.status === 'pending_manager_review' && String(punchCase.request_id || '') !== requestId) {
          return Response.json({ success: false, error: 'This missed clock-out already has a correction awaiting manager review.' }, { status: 409 });
        }
        const originalSnapshot = punchCase.original_snapshot || entryAuditSnapshot(entry);

        if (entry.status === 'clocked_in') {
          const detachedAt = new Date().toISOString();
          const detached = await entryEntity.updateMany(
            { id: entry.id, updated_date: entry.updated_date, user_email: target.email, status: 'clocked_in' },
            { $set: {
              status: 'needs_resolution',
              approval_status: 'needs_review',
              punch_exception_id: punchCase.id,
              punch_resolution_pending_at: detachedAt,
              punch_resolution_request_id: requestId,
            }, $unset: {
              approved_at: '', approved_by: '', approval_note: '', approval_request_id: '',
            } },
          );
          if (!detached || detached.updated !== 1) {
            const fresh = await entryEntity.get(entry.id).catch(() => null);
            if (!(fresh?.status === 'needs_resolution' && String(fresh.punch_resolution_request_id || '') === requestId)) {
              return Response.json({ success: false, retry_same_request: true, error: 'The stale shift changed before it could be moved to manager review. Retry the same request.' }, { status: 409 });
            }
            entry = fresh;
          } else {
            entry = await entryEntity.get(entry.id);
          }
        } else if (!(entry.status === 'needs_resolution' && String(entry.punch_resolution_request_id || '') === requestId)) {
          return Response.json({ success: false, error: 'This TimeEntry is no longer in a recoverable missed-punch state.' }, { status: 409 });
        }

        const requestedChanges = {
          clock_in: originalSnapshot.clock_in || entry.clock_in,
          clock_out: claimedClockOutIso,
          lunch_minutes: Number(originalSnapshot.lunch_minutes || 0),
          notes: String(originalSnapshot.notes || ''),
        };
        const correctionReason = 'Missed clock-out reported during pre-clock-in recovery.';
        let correctionRequest = await uniqueRow(correctionRequestEntity, { request_id: requestId }, 'Missed clock-out correction request');
        if (!correctionRequest?.id) {
          correctionRequest = await correctionRequestEntity.create({
            user_email: target.email,
            user_name: target.full_name || target.email,
            time_entry_id: entry.id,
            time_entry_updated_date: entry.updated_date,
            request_id: requestId,
            requested_at: new Date().toISOString(),
            employee_reason: correctionReason,
            original_snapshot: originalSnapshot,
            requested_changes: requestedChanges,
            request_kind: 'missed_clock_out',
            punch_exception_id: punchCase.id,
            status: 'pending',
          });
        }
        if (!correctionRequest?.id || asEmail(correctionRequest.user_email) !== target.email ||
            String(correctionRequest.time_entry_id || '') !== entry.id ||
            String(correctionRequest.request_kind || '') !== 'missed_clock_out' ||
            String(correctionRequest.punch_exception_id || '') !== punchCase.id) {
          return Response.json({ success: false, error: 'The missed clock-out correction request could not be tied to this exact shift.' }, { status: 409 });
        }
        const savedRequestedChanges = correctionRequest.requested_changes || {};
        if (
          String(savedRequestedChanges.clock_in || '') !== String(requestedChanges.clock_in || '') ||
          String(savedRequestedChanges.clock_out || '') !== String(requestedChanges.clock_out || '') ||
          Number(savedRequestedChanges.lunch_minutes || 0) !== Number(requestedChanges.lunch_minutes || 0) ||
          String(savedRequestedChanges.notes || '') !== String(requestedChanges.notes || '')
        ) {
          return Response.json({ success: false, error: 'This missed-punch request id is already bound to different reported punch details.' }, { status: 409 });
        }
        if (punchCase.status === 'pending_manager_review' &&
            String(punchCase.request_id || '') === requestId &&
            String(punchCase.claimed_clock_out || '') !== claimedClockOutIso) {
          return Response.json({ success: false, error: 'This missed-punch request id is already bound to a different reported Clock Out time.' }, { status: 409 });
        }

        const correctionPayloadHash = await payloadHash({
          entry_id: entry.id,
          expected_updated_date: entry.updated_date,
          reason: correctionReason,
          requested_changes: requestedChanges,
        });
        await ensureActionAudit(auditEntity, {
          action: 'correction_request', outcome: 'confirmed', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: correctionRequest.requested_at, request_id: requestId, time_entry_id: entry.id,
          reason: correctionReason,
          details: {
            payload_hash: correctionPayloadHash, correction_request_id: correctionRequest.id,
            requested_changes: requestedChanges, punch_exception_id: punchCase.id,
            request_kind: 'missed_clock_out',
          },
        }, 'Missed clock-out correction submission audit');

        const punchAudit = priorAudit?.id ? { audit: priorAudit } : await ensureActionAudit(auditEntity, {
          action: 'punch_exception', outcome: 'confirmed', user_email: target.email,
          user_name: target.full_name || target.email, actor_email: actorEmail, actor_role: actor.role,
          authentication_method: authenticationMethodFor(actor, target),
          server_timestamp: new Date().toISOString(), request_id: requestId, time_entry_id: entry.id,
          reason: correctionReason,
          details: {
            payload_hash: punchPayloadHash, punch_exception_id: punchCase.id,
            response: 'missed_clock_out', claimed_clock_out: claimedClockOutIso,
            correction_request_id: correctionRequest.id, original_snapshot: originalSnapshot,
          },
        }, 'Missed clock-out punch-exception audit');

        await punchExceptionEntity.updateMany(
          { id: punchCase.id },
          { $set: {
            status: 'pending_manager_review', employee_response: 'missed_clock_out',
            claimed_clock_out: claimedClockOutIso, submitted_at: new Date().toISOString(),
            request_id: requestId, correction_request_id: correctionRequest.id,
            resolution_audit_id: punchAudit.audit.id,
            resolution_note: 'Employee supplied a missed clock-out time; TimeEntry is detached from active state pending manager correction review.',
          } },
        );

        const currentState = await freshState(stateEntity, state.id);
        if (currentState.status === 'clocked_in' && currentState.active_entry_id === entry.id) {
          const finalizedState = await setState(stateEntity, currentState, 'clocked_in', null, {
            status: 'clocked_out', active_entry_id: null, last_action_at: new Date().toISOString(),
            last_request_id: requestId, last_request_payload_hash: punchPayloadHash, pending_started_at: null,
            break_status: 'working', active_break_id: null, last_break_request_id: null, break_pending_started_at: null,
            work_pause_status: 'working', active_work_pause_id: null,
            last_work_pause_request_id: null, work_pause_pending_started_at: null,
            labor_status: 'idle', last_labor_request_id: null, labor_pending_started_at: null,
            labor_pending_activity_type: '', labor_pending_work_order_id: '',
          });
          if (!finalizedState) {
            return Response.json({ success: false, retry_same_request: true, error: 'The missed clock-out response was saved, but authoritative employee state still needs finalization. Retry the same request.' }, { status: 409 });
          }
          state = finalizedState;
        } else if (currentState.status !== 'clocked_out') {
          return Response.json({ success: false, retry_same_request: true, error: 'The missed clock-out response is saved, but employee state changed unexpectedly. Retry the same request or request admin review.' }, { status: 409 });
        }

        punchCase = await punchExceptionEntity.get(punchCase.id);
        return Response.json({
          success: true, status: 'clocked_out', punch_resolution_pending: true,
          punch_exception: punchCase, correction_request: correctionRequest,
          user: publicEmployee(target),
        });
      } finally {
        let releaseFailed = false;
        try {
          const released = await releaseCorrectionCreateLock(
            stateEntity, state.id, requestId, gateEntryId,
            punchPayloadHash, String(gate.claim_token || ''),
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
          throw new Error('Punch-recovery employee mutation gate could not be released safely. Retry the same request for recovery.');
        }
      }
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
        // Use the same trusted punch instant and company-local day for both
        // the closed-period check and any subsequently created TimeEntry. This
        // check must follow the shared employee gate: finalization holds that
        // gate through its commit, so a freshly finalized period cannot slip
        // between this read and the Clock In write.
        const clockInDay = dateKeyInCompanyTime(officialClockIn);
        if (!clockInDay) {
          return Response.json({ success: false, error: 'The trusted Clock In timestamp is invalid. Admin review is required before this request can continue.' }, { status: 409 });
        }
        const finalizedPeriods = await payPeriodEntity.filter({ status: 'finalized' });
        if (!Array.isArray(finalizedPeriods)) throw new Error('Finalized pay-period lookup did not return a record list.');
        const invalidFinalizedPeriod = finalizedPeriods.find((period: any) => {
          const start = validDateKey(period.start_date);
          const end = validDateKey(period.end_date);
          return !start || !end || start > end;
        });
        if (invalidFinalizedPeriod) {
          return Response.json({ success: false, error: 'A finalized pay period has invalid date boundaries. Admin review is required before Clock In can continue.' }, { status: 409 });
        }
        const closedPeriod = finalizedPeriods.find((period: any) =>
          clockInDay >= period.start_date && clockInDay <= period.end_date,
        );
        if (closedPeriod) {
          return Response.json({
            success: false,
            error: `Clock In is blocked because ${clockInDay} belongs to finalized pay period ${closedPeriod.label || 'a closed period'} (${closedPeriod.start_date} to ${closedPeriod.end_date}). An administrator must reopen the period before a new shift can begin on that date.`,
            finalized_pay_period_id: closedPeriod.id,
          }, { status: 409 });
        }
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
          const geoLat = Number(body?.geo?.lat);
          const geoLng = Number(body?.geo?.lng);
          const geo = Number.isFinite(geoLat) && Number.isFinite(geoLng) && Math.abs(geoLat) <= 90 && Math.abs(geoLng) <= 180
            ? { lat: Math.round(geoLat * 100000) / 100000, lng: Math.round(geoLng * 100000) / 100000, accuracy: Math.min(10000, Math.max(0, Math.round(Number(body.geo.accuracy) || 0))) }
            : null;
          entry = await entryEntity.create({
            user_email: target.email,
            user_name: target.full_name || target.email,
            clock_in: officialClockIn,
            clock_in_request_id: requestId,
            clock_source: 'server',
            status: 'clocked_in',
            ...(geo ? { clock_in_geo: geo } : {}),
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

        await emitTimeClockEvent(base44, 'time_clock_in', entry.id, actorEmail);
        if ((minutesOfDayInCompanyTime(entry.clock_in) ?? 0) > LATE_CLOCK_IN_MINUTES) {
          await emitTimeClockEvent(base44, 'time_clock_in_late', entry.id, actorEmail);
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
                payroll_membership: payrollMembershipEnvelope(entry.clock_in),
                result_clock_in: entry.clock_in,
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
        clock_source: entry.clock_source === 'employee_attested_missed_clock_in' ? entry.clock_source : 'server',
        break_tracking_used: breakSummary.count > 0,
        tracked_break_minutes: breakSummary.total_minutes,
        tracked_paid_break_minutes: breakSummary.paid_minutes,
        tracked_unpaid_break_minutes: breakSummary.unpaid_minutes,
        work_pause_tracking_used: workPauseSummary.count > 0,
        tracked_work_pause_minutes: workPauseSummary.total_minutes,
        approval_status: entry.clock_source === 'employee_attested_missed_clock_in' ? 'needs_review' : 'unreviewed',
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
          payroll_membership: payrollMembershipEnvelope(savedEntry.clock_in),
          result_clock_in: savedEntry.clock_in,
          submitted_lunch_minutes: submittedClockOut.lunch_minutes,
          lunch_minutes: lunchMinutes, total_hours: savedEntry.total_hours, result_clock_out: savedEntry.clock_out,
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

      await emitTimeClockEvent(base44, 'time_clock_out', savedEntry.id, actorEmail);
      const workedHours = Number(savedEntry.total_hours);
      if (Number.isFinite(workedHours) && workedHours < FULL_SHIFT_HOURS) {
        await emitTimeClockEvent(base44, 'time_clock_out_early', savedEntry.id, actorEmail);
      }
      if (Number.isFinite(workedHours) && workedHours > LONG_SHIFT_HOURS) {
        await emitTimeClockEvent(base44, 'time_entry_long_shift', savedEntry.id, actorEmail);
      }

      return Response.json({ success: true, status: 'clocked_out', entry: savedEntry, user: publicEmployee(target), audit_saved: true });
    }

    return Response.json({ success: false, error: 'Unsupported Time Clock action.' }, { status: 400 });
    } catch (error) {
    const status = Number(error?.status || error?.response?.status || 500);
    if (status === 429) {
      return Response.json({ success: false, error: 'Time Clock is busy. Try again in a moment.' }, { status: 429 });
    }
    console.error('timeClockAction error:', error?.message || error);
    return Response.json({ success: false, error: 'Time Clock action could not be completed safely.' }, { status: 500 });
  }
});