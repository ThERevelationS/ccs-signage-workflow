import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { verifyAdminSettingsCapability } from '../../shared/adminSettingsCapability.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const MAX_POLICY_JSON = 300_000;
const MAX_TIME_OFF_TYPES = 100;
const MAX_HOLIDAYS = 500;

function normalizeName(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanPolicy(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const name = String(data.name || '').trim();
  if (!name || name.length > 500) {
    throw Object.assign(new Error('PTO policy requires a valid name.'), { status: 400 });
  }
  if (!Array.isArray(data.time_off_types) || data.time_off_types.length > MAX_TIME_OFF_TYPES) {
    throw Object.assign(new Error('PTO policy time-off types are invalid or too large.'), { status: 400 });
  }
  if (!Array.isArray(data.holidays) || data.holidays.length > MAX_HOLIDAYS) {
    throw Object.assign(new Error('PTO policy holidays are invalid or too large.'), { status: 400 });
  }
  const floatingRaw = Number(data.floating_holidays_per_year ?? 0);
  if (!Number.isFinite(floatingRaw) || floatingRaw < 0 || floatingRaw > 365) {
    throw Object.assign(new Error('Floating holidays per year is invalid.'), { status: 400 });
  }
  const cleaned = {
    name,
    is_template: data.is_template !== false,
    time_off_types: data.time_off_types,
    holidays: data.holidays,
    floating_holidays_per_year: floatingRaw,
  };
  if (JSON.stringify(cleaned).length > MAX_POLICY_JSON) {
    throw Object.assign(new Error('PTO policy is too large.'), { status: 400 });
  }
  return cleaned;
}

function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: any, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function fieldsMatch(record: any, desired: Record<string, any>) {
  return Object.entries(desired || {}).every(([key, value]) =>
    JSON.stringify(normalize(record?.[key])) === JSON.stringify(normalize(value))
  );
}

async function sha256Hex(value: any) {
  const encoded = new TextEncoder().encode(JSON.stringify(normalize(value)));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function uniqueRow(entity: any, query: any, label: string) {
  const rows = await entity.filter(query);
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return records.`);
  if (rows.length > 1) throw Object.assign(new Error(`${label} is ambiguous (${rows.length} records).`), { status: 409 });
  return rows[0] || null;
}

async function listPolicies(Policy: any) {
  return loadAllEntityRows({ entity: Policy, sort: 'created_date', label: 'PTO policies' });
}

function nameMatches(rows: any[], name: string, excludeId = '') {
  const wanted = normalizeName(name);
  return (rows || []).filter((row) => String(row?.id || '') !== excludeId && normalizeName(row?.name) === wanted);
}

async function createPolicy(Policy: any, Audit: any, body: any, admin: any) {
  const requestId = String(body?.request_id || '').trim();
  if (requestId.length < 8 || requestId.length > 128) {
    throw Object.assign(new Error('A valid PTO policy create request id is required.'), { status: 400 });
  }

  const cleaned = cleanPolicy(body?.data);
  const payloadHash = await sha256Hex({ data: cleaned });
  let audit = await uniqueRow(Audit, { action: 'pto_policy_create', request_id: requestId }, 'PTO policy create audit');
  if (audit?.id) {
    const priorHash = String(audit.details?.payload_hash || '');
    if (priorHash && priorHash !== payloadHash) {
      throw Object.assign(new Error('This PTO policy create request id is already bound to different settings.'), { status: 409 });
    }
    if (audit.outcome === 'blocked') {
      throw Object.assign(new Error('This PTO policy create request was previously blocked. Reload before trying again.'), { status: 409 });
    }
  }

  const before = nameMatches(await listPolicies(Policy), cleaned.name);
  if (before.length > 1) {
    if (audit?.id && audit.outcome === 'pending') {
      await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
    }
    throw Object.assign(new Error(`PTO policy name “${cleaned.name}” already has duplicate records.`), { status: 409 });
  }
  if (before.length === 1) {
    const existing = before[0];
    if (!fieldsMatch(existing, cleaned)) {
      if (audit?.id && audit.outcome === 'pending') {
        await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
      }
      throw Object.assign(new Error(`PTO policy named “${cleaned.name}” already exists with different settings.`), { status: 409 });
    }

    if (!audit?.id) {
      audit = await Audit.create({
        action: 'pto_policy_create',
        outcome: 'reused',
        user_email: String(admin?.email || '').trim().toLowerCase(),
        user_name: admin?.full_name || admin?.email || 'Admin',
        actor_email: String(admin?.email || '').trim().toLowerCase(),
        actor_role: 'admin',
        authentication_method: 'admin_kiosk',
        server_timestamp: new Date().toISOString(),
        request_id: requestId,
        details: { payload_hash: payloadHash, desired_policy: cleaned, policy_id: existing.id, reused_existing: true },
      });
      const auditRows = await Audit.filter({ action: 'pto_policy_create', request_id: requestId });
      if (!Array.isArray(auditRows) || auditRows.length !== 1 || auditRows[0]?.id !== audit.id) {
        throw Object.assign(new Error('PTO policy create audit could not be verified uniquely. Admin investigation is required.'), { status: 409 });
      }
    } else if (audit.outcome === 'pending') {
      const finalized = await Audit.updateMany(
        { id: audit.id, outcome: 'pending', request_id: requestId },
        { $set: {
          outcome: 'recovered',
          server_timestamp: new Date().toISOString(),
          details: { ...(audit.details || {}), payload_hash: payloadHash, desired_policy: cleaned, policy_id: existing.id, recovered_after_policy_create: true },
        } },
      );
      if (!finalized || finalized.updated !== 1) {
        const fresh = await Audit.get(audit.id).catch(() => null);
        if (!fresh || !['confirmed', 'recovered', 'reused'].includes(String(fresh.outcome || ''))) {
          throw Object.assign(new Error('The PTO policy exists but its create audit is still being finalized. Retry the same create request.'), { status: 409, retry_same_request: true });
        }
        audit = fresh;
      }
    } else if (!['confirmed', 'recovered', 'reused'].includes(String(audit.outcome || ''))) {
      throw Object.assign(new Error('The PTO policy create audit is not in a recoverable state.'), { status: 409 });
    }

    return { record: existing, status: audit?.outcome === 'reused' ? 'existing' : 'recovered', audit_id: audit?.id || null };
  }

  if (audit?.id && ['confirmed', 'recovered', 'reused'].includes(String(audit.outcome || ''))) {
    throw Object.assign(new Error('This PTO policy create audit is complete but the policy no longer exists. Admin investigation is required.'), { status: 409 });
  }

  if (!audit?.id) {
    audit = await Audit.create({
      action: 'pto_policy_create',
      outcome: 'pending',
      user_email: String(admin?.email || '').trim().toLowerCase(),
      user_name: admin?.full_name || admin?.email || 'Admin',
      actor_email: String(admin?.email || '').trim().toLowerCase(),
      actor_role: 'admin',
      authentication_method: 'admin_kiosk',
      server_timestamp: new Date().toISOString(),
      request_id: requestId,
      details: { payload_hash: payloadHash, desired_policy: cleaned },
    });
    if (!audit?.id) throw new Error('PTO policy create audit intent could not be persisted.');

    const auditRows = await Audit.filter({ action: 'pto_policy_create', request_id: requestId });
    if (!Array.isArray(auditRows) || auditRows.length !== 1 || auditRows[0]?.id !== audit.id) {
      throw Object.assign(new Error('PTO policy create request is ambiguous. No policy was created; admin investigation is required.'), { status: 409 });
    }
  }

  let created: any = null;
  let createError: any = null;
  try { created = await Policy.create(cleaned); } catch (error) { createError = error; }
  await new Promise((resolve) => setTimeout(resolve, 40));

  const after = nameMatches(await listPolicies(Policy), cleaned.name);
  if (after.length > 1) {
    await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
    throw Object.assign(new Error('PTO policy was created concurrently more than once. No duplicate was deleted automatically; reload and review duplicates.'), { status: 409 });
  }
  if (after.length === 0) {
    if (createError) {
      await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
      throw createError;
    }
    throw Object.assign(new Error('PTO policy create outcome could not be verified. Retry the same request.'), { status: 409, retry_same_request: true });
  }

  const saved = after[0];
  if (!fieldsMatch(saved, cleaned)) {
    await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
    throw Object.assign(new Error('PTO policy was created concurrently with different settings.'), { status: 409 });
  }

  const finalized = await Audit.updateMany(
    { id: audit.id, outcome: 'pending', request_id: requestId },
    { $set: {
      outcome: 'confirmed',
      server_timestamp: new Date().toISOString(),
      details: { ...(audit.details || {}), payload_hash: payloadHash, desired_policy: cleaned, policy_id: saved.id, created: true },
    } },
  );
  if (!finalized || finalized.updated !== 1) {
    const fresh = await Audit.get(audit.id).catch(() => null);
    if (!fresh || !['confirmed', 'recovered', 'reused'].includes(String(fresh.outcome || ''))) {
      throw Object.assign(new Error('The PTO policy was created but audit finalization was interrupted. Retry the same create request.'), { status: 409, retry_same_request: true });
    }
  }

  return { record: saved, status: created?.id === saved.id ? 'created' : 'recovered', audit_id: audit.id };
}

async function updatePolicy(Policy: any, Audit: any, body: any, admin: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  const requestId = String(body?.request_id || '').trim();
  if (!id || !expectedUpdatedDate || requestId.length < 8 || requestId.length > 128) {
    throw Object.assign(new Error('PTO policy version and a valid update request id are required.'), { status: 400 });
  }

  const nextFields = body?.next_fields && typeof body.next_fields === 'object' ? body.next_fields : {};
  const payloadHash = await sha256Hex({ id, expected_updated_date: expectedUpdatedDate, next_fields: nextFields });
  let audit = await uniqueRow(Audit, { action: 'pto_policy_update', request_id: requestId }, 'PTO policy update audit');
  if (audit?.id) {
    const priorHash = String(audit.details?.payload_hash || '');
    if (priorHash && priorHash !== payloadHash) {
      throw Object.assign(new Error('This PTO policy update request id is already bound to different settings.'), { status: 409 });
    }
    if (audit.outcome === 'blocked') {
      throw Object.assign(new Error('This PTO policy update request was previously blocked. Reload before trying again.'), { status: 409 });
    }
  }

  let current = await Policy.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('PTO policy no longer exists.'), { status: 404 });

  let cleaned: any = null;
  if (audit?.details?.desired_policy) {
    cleaned = cleanPolicy(audit.details.desired_policy);
  } else if (String(current.updated_date || '') === expectedUpdatedDate) {
    cleaned = cleanPolicy({ ...current, ...nextFields });
  }

  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    if (audit?.id && cleaned && fieldsMatch(current, cleaned)) {
      if (audit.outcome === 'pending') {
        const finalized = await Audit.updateMany(
          { id: audit.id, outcome: 'pending', request_id: requestId },
          { $set: {
            outcome: 'recovered',
            server_timestamp: new Date().toISOString(),
            details: { ...(audit.details || {}), payload_hash: payloadHash, policy_id: id, recovered_after_policy_save: true },
          } },
        );
        if (!finalized || finalized.updated !== 1) {
          const fresh = await Audit.get(audit.id).catch(() => null);
          if (!fresh || !['confirmed', 'recovered'].includes(String(fresh.outcome || ''))) {
            throw Object.assign(new Error('The PTO policy update was saved but its audit is still being finalized. Retry the same update.'), { status: 409, retry_same_request: true });
          }
          audit = fresh;
        }
      } else if (!['confirmed', 'recovered'].includes(String(audit.outcome || ''))) {
        throw Object.assign(new Error('The PTO policy update audit is not in a recoverable state.'), { status: 409 });
      }
      return { record: current, audit_id: audit.id, reused: true };
    }
    if (audit?.id && ['confirmed', 'recovered'].includes(String(audit.outcome || ''))) {
      throw Object.assign(new Error('The PTO policy update audit is complete but the policy no longer matches that update. Reload before continuing.'), { status: 409 });
    }
    throw Object.assign(new Error('PTO policy changed in another session. Reload before saving.'), { status: 409 });
  }

  if (audit?.id && ['confirmed', 'recovered'].includes(String(audit.outcome || ''))) {
    throw Object.assign(new Error('This PTO policy update audit is complete but the policy is still at its previous version. Admin investigation is required.'), { status: 409 });
  }
  if (!cleaned) cleaned = cleanPolicy({ ...current, ...nextFields });

  const duplicates = nameMatches(await listPolicies(Policy), cleaned.name, id);
  if (duplicates.length) {
    if (audit?.id && audit.outcome === 'pending') {
      await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
    }
    throw Object.assign(new Error(`Another PTO policy named “${cleaned.name}” already exists.`), { status: 409 });
  }

  if (!audit?.id) {
    audit = await Audit.create({
      action: 'pto_policy_update',
      outcome: 'pending',
      user_email: String(admin?.email || '').trim().toLowerCase(),
      user_name: admin?.full_name || admin?.email || 'Admin',
      actor_email: String(admin?.email || '').trim().toLowerCase(),
      actor_role: 'admin',
      authentication_method: 'admin_kiosk',
      server_timestamp: new Date().toISOString(),
      request_id: requestId,
      details: {
        payload_hash: payloadHash,
        policy_id: id,
        expected_updated_date: expectedUpdatedDate,
        prior_policy: cleanPolicy(current),
        desired_policy: cleaned,
      },
    });
  }
  if (!audit?.id) throw new Error('PTO policy update audit intent could not be persisted.');

  const result = await Policy.updateMany({ id, updated_date: expectedUpdatedDate }, { $set: cleaned });
  if (!result || result.updated !== 1) {
    const freshPolicy = await Policy.get(id).catch(() => null);
    if (freshPolicy?.id && fieldsMatch(freshPolicy, cleaned)) {
      current = freshPolicy;
    } else {
      await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
      throw Object.assign(new Error('PTO policy changed in another session. Reload before saving.'), { status: 409 });
    }
  } else {
    current = await Policy.get(id).catch(() => null);
  }
  if (!current?.id || !fieldsMatch(current, cleaned)) {
    throw Object.assign(new Error('The PTO policy update could not be verified after save. Retry the same update.'), { status: 409, retry_same_request: true });
  }

  const finalized = await Audit.updateMany(
    { id: audit.id, outcome: 'pending', request_id: requestId },
    { $set: {
      outcome: 'confirmed',
      server_timestamp: new Date().toISOString(),
      details: { ...(audit.details || {}), payload_hash: payloadHash, policy_id: id, updated: true },
    } },
  );
  if (!finalized || finalized.updated !== 1) {
    const fresh = await Audit.get(audit.id).catch(() => null);
    if (!fresh || !['confirmed', 'recovered'].includes(String(fresh.outcome || ''))) {
      throw Object.assign(new Error('The PTO policy was updated but audit finalization was interrupted. Retry the same update.'), { status: 409, retry_same_request: true });
    }
  }

  return { record: current, audit_id: audit.id };
}

async function assignBalance(Balance: any, Policy: any, Authorized: any, Audit: any, body: any, admin: any) {
  const userEmail = String(body?.user_email || '').trim().toLowerCase();
  const policyId = String(body?.policy_id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  const requestId = String(body?.request_id || '').trim();
  if (!userEmail || !policyId || requestId.length < 8 || requestId.length > 128) {
    throw Object.assign(new Error('Employee, PTO policy, and a valid request id are required.'), { status: 400 });
  }

  const userRows = await Authorized.filter({ email: userEmail });
  if (!Array.isArray(userRows) || userRows.length !== 1) {
    throw Object.assign(new Error(userRows?.length ? 'Employee identity is ambiguous.' : 'Employee was not found.'), { status: userRows?.length ? 409 : 404 });
  }
  const user = userRows[0];
  const policy = await Policy.get(policyId).catch(() => null);
  if (!policy?.id) throw Object.assign(new Error('PTO policy was not found.'), { status: 404 });

  let balance = await uniqueRow(Balance, { user_email: userEmail }, 'Employee PTO balance');
  const payload = { user_email: userEmail, policy_id: policyId, expected_updated_date: expectedUpdatedDate };
  const payloadHash = await sha256Hex(payload);

  const priorAudit = await uniqueRow(Audit, { action: 'pto_balance_assign', request_id: requestId, user_email: userEmail }, 'PTO balance assignment audit');
  if (priorAudit?.id) {
    const priorHash = String(priorAudit.details?.payload_hash || '');
    if (priorHash && priorHash !== payloadHash) {
      throw Object.assign(new Error('This PTO assignment request id is already bound to different details.'), { status: 409 });
    }
    if (priorAudit.outcome === 'blocked') {
      throw Object.assign(new Error('This PTO assignment request was previously blocked. Reload and submit a new assignment.'), { status: 409 });
    }
    if (['confirmed', 'recovered'].includes(String(priorAudit.outcome || '')) && String(balance?.last_request_id || '') !== requestId) {
      throw Object.assign(new Error('This PTO assignment audit is complete but the employee balance no longer matches that request. Reload before continuing.'), { status: 409 });
    }
  }

  if (balance?.id && String(balance.last_request_id || '') === requestId) {
    if (String(balance.last_request_payload_hash || '') !== payloadHash) {
      throw Object.assign(new Error('This PTO assignment request id is already bound to different details.'), { status: 409 });
    }
    if (!priorAudit?.id) {
      throw Object.assign(new Error('The PTO assignment was saved without its required audit. Retry the same request.'), { status: 409, retry_same_request: true });
    }
    if (priorAudit.outcome === 'pending') {
      const finalized = await Audit.updateMany(
        { id: priorAudit.id, outcome: 'pending', request_id: requestId, user_email: userEmail },
        { $set: {
          outcome: 'confirmed',
          server_timestamp: new Date().toISOString(),
          details: { ...(priorAudit.details || {}), payload_hash: payloadHash, pto_balance_id: balance.id, policy_id: policyId, recovered_after_balance_save: true },
        } },
      );
      if (!finalized || finalized.updated !== 1) {
        const fresh = await Audit.get(priorAudit.id).catch(() => null);
        if (!fresh || !['confirmed', 'recovered'].includes(String(fresh.outcome || ''))) {
          throw Object.assign(new Error('The PTO assignment was saved but its audit is still being finalized. Retry the same request.'), { status: 409, retry_same_request: true });
        }
      }
    } else if (!['confirmed', 'recovered'].includes(String(priorAudit.outcome || ''))) {
      throw Object.assign(new Error('The PTO assignment audit is not in a recoverable state.'), { status: 409 });
    }
    return { record: balance, status: 'reused', audit_id: priorAudit.id };
  }

  if (balance?.id) {
    if (!expectedUpdatedDate) {
      throw Object.assign(new Error('The loaded PTO balance version is required before reassigning its policy.'), { status: 400 });
    }
    if (String(balance.updated_date || '') !== expectedUpdatedDate) {
      throw Object.assign(new Error('The employee PTO balance changed in another session. Reload before assigning a policy.'), { status: 409 });
    }
  } else if (expectedUpdatedDate) {
    throw Object.assign(new Error('The employee PTO balance no longer matches the loaded state. Reload before assigning a policy.'), { status: 409 });
  }

  let auditIntent = priorAudit;
  if (!auditIntent?.id) {
    auditIntent = await Audit.create({
      action: 'pto_balance_assign',
      outcome: 'pending',
      user_email: userEmail,
      user_name: user.full_name || userEmail,
      actor_email: String(admin?.email || '').trim().toLowerCase(),
      actor_role: 'admin',
      authentication_method: 'admin_kiosk',
      server_timestamp: new Date().toISOString(),
      request_id: requestId,
      details: {
        payload_hash: payloadHash,
        previous_policy_id: balance?.policy_id || null,
        previous_balances: Array.isArray(balance?.balances) ? balance.balances : [],
        policy_id: policyId,
        expected_updated_date: expectedUpdatedDate || null,
      },
    });
  }
  if (!auditIntent?.id) throw new Error('PTO assignment audit intent could not be persisted.');

  const now = new Date().toISOString();
  const initialBalances = (Array.isArray(policy.time_off_types) ? policy.time_off_types : []).map((type: any) => ({
    type_id: String(type?.id || ''),
    type_name: String(type?.name || ''),
    available_hours: Number(type?.starting_balance || 0),
    used_hours: 0,
    pending_hours: 0,
    accrued_ytd: 0,
    carryover_hours: 0,
    last_accrual_date: now,
  }));
  const nextFields = {
    user_email: userEmail,
    user_name: user.full_name || userEmail,
    policy_id: policyId,
    hire_date: balance?.hire_date || new Date().toISOString().slice(0, 10),
    balances: initialBalances,
    floating_holidays_remaining: Number(policy.floating_holidays_per_year || 0),
    last_request_id: requestId,
    last_request_payload_hash: payloadHash,
  };

  if (balance?.id) {
    const result = await Balance.updateMany({ id: balance.id, updated_date: expectedUpdatedDate, user_email: userEmail }, { $set: nextFields });
    if (!result || result.updated !== 1) {
      await Audit.updateMany({ id: auditIntent.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
      throw Object.assign(new Error('The employee PTO balance changed in another session. Reload before assigning a policy.'), { status: 409 });
    }
    balance = await Balance.get(balance.id);
  } else {
    balance = await Balance.create(nextFields);
    if (!balance?.id) throw new Error('Employee PTO balance could not be created.');
    const rows = await Balance.filter({ user_email: userEmail });
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== balance.id) {
      await Audit.updateMany({ id: auditIntent.id, outcome: 'pending' }, { $set: { outcome: 'blocked' } });
      throw Object.assign(new Error('Employee PTO balance assignment could not be verified uniquely.'), { status: 409 });
    }
  }

  const auditFinalized = await Audit.updateMany(
    { id: auditIntent.id, outcome: 'pending', request_id: requestId, user_email: userEmail },
    { $set: {
      outcome: 'confirmed',
      server_timestamp: new Date().toISOString(),
      details: { ...(auditIntent.details || {}), payload_hash: payloadHash, pto_balance_id: balance.id, policy_id: policyId },
    } },
  );
  if (!auditFinalized || auditFinalized.updated !== 1) {
    const fresh = await Audit.get(auditIntent.id).catch(() => null);
    if (!fresh || !['confirmed', 'recovered'].includes(String(fresh.outcome || ''))) {
      throw Object.assign(new Error('The PTO assignment was saved but audit finalization was interrupted. Retry the same request.'), { status: 409, retry_same_request: true });
    }
  }

  return { record: balance, status: 'assigned', audit_id: auditIntent.id };
}

async function deletePolicy(Policy: any, Balance: any, Audit: any, body: any, admin: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  const requestId = String(body?.request_id || '').trim();
  if (!id || !expectedUpdatedDate || requestId.length < 8 || requestId.length > 128) {
    throw Object.assign(new Error('PTO policy version and a valid deletion request id are required.'), { status: 400 });
  }

  const payloadHash = await sha256Hex({ id, expected_updated_date: expectedUpdatedDate });
  let audit = await uniqueRow(Audit, { action: 'pto_policy_delete', request_id: requestId }, 'PTO policy delete audit');
  if (audit?.id) {
    const priorHash = String(audit.details?.payload_hash || '');
    if (priorHash && priorHash !== payloadHash) {
      throw Object.assign(new Error('This PTO policy deletion request id is already bound to a different policy or version.'), { status: 409 });
    }
    if (audit.outcome === 'blocked') {
      throw Object.assign(new Error('This PTO policy deletion request was previously blocked. Reload before trying again.'), { status: 409 });
    }
  }

  let current = await Policy.get(id).catch(() => null);
  if (current?.id && audit?.id && ['confirmed', 'recovered'].includes(String(audit.outcome || ''))) {
    throw Object.assign(new Error('This PTO policy deletion audit is complete but the policy still exists. Admin investigation is required.'), { status: 409 });
  }
  if (!current?.id) {
    if (!audit?.id) {
      throw Object.assign(new Error('PTO policy no longer exists, and this deletion request has no matching audit evidence.'), { status: 404 });
    }
    if (audit.outcome === 'pending') {
      const finalized = await Audit.updateMany(
        { id: audit.id, outcome: 'pending', request_id: requestId },
        { $set: {
          outcome: 'recovered',
          server_timestamp: new Date().toISOString(),
          details: { ...(audit.details || {}), payload_hash: payloadHash, policy_id: id, recovered_after_delete: true },
        } },
      );
      if (!finalized || finalized.updated !== 1) {
        const fresh = await Audit.get(audit.id).catch(() => null);
        if (!fresh || !['confirmed', 'recovered'].includes(String(fresh.outcome || ''))) {
          throw Object.assign(new Error('The PTO policy is deleted but its audit is still being finalized. Retry the same deletion request.'), { status: 409, retry_same_request: true });
        }
        audit = fresh;
      }
    } else if (!['confirmed', 'recovered'].includes(String(audit.outcome || ''))) {
      throw Object.assign(new Error('The PTO policy is missing and its deletion audit is not in a recoverable state.'), { status: 409 });
    }
    return { deleted: true, reused: true, audit_id: audit.id };
  }

  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('PTO policy changed in another session and was not deleted.'), { status: 409 });
  }

  const assigned = await Balance.filter({ policy_id: id });
  if (!Array.isArray(assigned)) throw new Error('PTO policy assignment lookup could not be verified.');
  if (assigned.length > 0) {
    if (audit?.id && audit.outcome === 'pending') {
      await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
    }
    throw Object.assign(new Error(`PTO policy is assigned to ${assigned.length} employee balance record${assigned.length === 1 ? '' : 's'}. Reassign those employees before deleting it.`), { status: 409 });
  }

  if (!audit?.id) {
    audit = await Audit.create({
      action: 'pto_policy_delete',
      outcome: 'pending',
      user_email: String(admin?.email || '').trim().toLowerCase(),
      user_name: admin?.full_name || admin?.email || 'Admin',
      actor_email: String(admin?.email || '').trim().toLowerCase(),
      actor_role: 'admin',
      authentication_method: 'admin_kiosk',
      server_timestamp: new Date().toISOString(),
      request_id: requestId,
      details: {
        payload_hash: payloadHash,
        policy_id: id,
        expected_updated_date: expectedUpdatedDate,
        policy_name: current.name || '',
        policy_snapshot: cleanPolicy(current),
      },
    });
  }
  if (!audit?.id) throw new Error('PTO policy deletion audit intent could not be persisted.');

  const result = await Policy.deleteMany({ id, updated_date: expectedUpdatedDate, name: current.name });
  if (!result || result.deleted !== 1) {
    await Audit.updateMany({ id: audit.id, outcome: 'pending', request_id: requestId }, { $set: { outcome: 'blocked' } });
    throw Object.assign(new Error('PTO policy changed in another session and was not deleted.'), { status: 409 });
  }

  const finalized = await Audit.updateMany(
    { id: audit.id, outcome: 'pending', request_id: requestId },
    { $set: {
      outcome: 'confirmed',
      server_timestamp: new Date().toISOString(),
      details: { ...(audit.details || {}), payload_hash: payloadHash, policy_id: id, deleted: true },
    } },
  );
  if (!finalized || finalized.updated !== 1) {
    const fresh = await Audit.get(audit.id).catch(() => null);
    if (!fresh || !['confirmed', 'recovered'].includes(String(fresh.outcome || ''))) {
      throw Object.assign(new Error('The PTO policy was deleted but audit finalization was interrupted. Retry the same deletion request.'), { status: 409, retry_same_request: true });
    }
  }
  return { deleted: true, audit_id: audit.id };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const admin = await verifyAdminSettingsCapability(base44, body?.admin_capability);

    const action = String(body?.action || '').trim();
    const Policy = base44.asServiceRole.entities.PTOPolicy;
    const Balance = base44.asServiceRole.entities.UserPTOBalance;
    const Authorized = base44.asServiceRole.entities.AuthorizedEmail;
    const Audit = base44.asServiceRole.entities.TimeClockAudit;

    if (action === 'create') return Response.json(await createPolicy(Policy, Audit, body, admin));
    if (action === 'update') return Response.json(await updatePolicy(Policy, Audit, body, admin));
    if (action === 'delete') return Response.json(await deletePolicy(Policy, Balance, Audit, body, admin));
    if (action === 'assign_balance') return Response.json(await assignBalance(Balance, Policy, Authorized, Audit, body, admin));
    return Response.json({ error: 'Invalid PTO configuration action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('managePTOConfig error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'PTO configuration could not be changed safely.' : error?.message,
      ...(error?.retry_same_request === true ? { retry_same_request: true } : {}),
    }, { status: safeStatus });
  }
});
