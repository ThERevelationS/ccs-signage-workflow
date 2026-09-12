import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { verifyAdminSettingsCapability } from '../../shared/adminSettingsCapability.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const MAX_RULE_JSON = 250_000;
const MAX_GROUP_EMAILS = 500;

const normalizeName = (value: unknown) => String(value || '').trim().toLowerCase();
const cleanName = (value: unknown) => String(value || '').trim().slice(0, 500);
const cleanDescription = (value: unknown) => String(value || '').trim().slice(0, 10_000);

function canonical(rows: any[] = []) {
  return rows.slice().sort((a, b) => {
    const aStamp = String(a?.created_date || '');
    const bStamp = String(b?.created_date || '');
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;
}

function normalized(value: any): any {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: any, key) => {
    out[key] = normalized(value[key]);
    return out;
  }, {});
}

function fieldsMatch(record: any, desired: Record<string, any>) {
  return Object.entries(desired || {}).every(([key, value]) =>
    JSON.stringify(normalized(record?.[key])) === JSON.stringify(normalized(value))
  );
}

function cleanAutomationData(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const name = cleanName(data.name);
  if (!name) throw Object.assign(new Error('Automation Rule name is required.'), { status: 400 });
  if (!Array.isArray(data.triggers) || !Array.isArray(data.actions)) {
    throw Object.assign(new Error('Automation Rule triggers and actions are required.'), { status: 400 });
  }
  const cleaned = {
    name,
    enabled: data.enabled !== false,
    triggers: data.triggers,
    actions: data.actions,
    priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0,
  };
  if (JSON.stringify(cleaned).length > MAX_RULE_JSON) {
    throw Object.assign(new Error('Automation Rule is too large.'), { status: 400 });
  }
  return cleaned;
}

function cleanAutomationPatch(value: any, current: any) {
  const patch = value && typeof value === 'object' ? value : {};
  const allowed = ['name', 'enabled', 'triggers', 'actions', 'priority'];
  const proposed: any = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(patch, key)) proposed[key] = patch[key];
  const merged = cleanAutomationData({ ...current, ...proposed });
  const cleanedPatch: any = {};
  for (const key of Object.keys(proposed)) cleanedPatch[key] = merged[key];
  if (!Object.keys(cleanedPatch).length) {
    throw Object.assign(new Error('No Automation Rule changes were supplied.'), { status: 400 });
  }
  return cleanedPatch;
}

function cleanEmailGroupData(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const name = cleanName(data.name);
  if (!name) throw Object.assign(new Error('Email group name is required.'), { status: 400 });
  if (!Array.isArray(data.emails) || data.emails.length < 1 || data.emails.length > MAX_GROUP_EMAILS) {
    throw Object.assign(new Error('Email group requires between 1 and 500 email addresses.'), { status: 400 });
  }
  const emails = [...new Set(data.emails.map((item: unknown) => String(item || '').trim().toLowerCase()).filter(Boolean))];
  if (!emails.length || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)) {
    throw Object.assign(new Error('Email group contains an invalid email address.'), { status: 400 });
  }
  return { name, description: cleanDescription(data.description), emails };
}

async function listRules(entity: any) {
  return loadAllEntityRows({ entity, sort: 'created_date', label: 'Automation Rules' });
}

async function listGroups(entity: any) {
  return loadAllEntityRows({ entity, sort: 'created_date', label: 'Email Groups' });
}

function nameMatches(rows: any[], name: string, excludeId = '') {
  const wanted = normalizeName(name);
  return (rows || []).filter((row) => String(row?.id || '') !== excludeId && normalizeName(row?.name) === wanted);
}

function ruleReferencesGroup(rule: any, groupId: string) {
  return (rule?.actions || []).some((action: any) =>
    (action?.action_config?.recipients || []).some((recipient: any) =>
      recipient?.type === 'email_group' && String(recipient?.value || '') === groupId
    )
  );
}

async function createRule(Rule: any, data: any) {
  const cleaned = cleanAutomationData(data);
  const before = nameMatches(await listRules(Rule), cleaned.name);
  if (before.length > 1) throw Object.assign(new Error(`Automation Rule name “${cleaned.name}” already has duplicate records.`), { status: 409 });
  if (before.length === 1) return { record: before[0], status: 'existing' };

  let created: any = null;
  let createError: any = null;
  try { created = await Rule.create(cleaned); } catch (error) { createError = error; }
  await new Promise((resolve) => setTimeout(resolve, 50));
  let after = nameMatches(await listRules(Rule), cleaned.name);
  if (after.length === 1) return { record: after[0], status: created?.id === after[0].id ? 'created' : 'recovered' };
  if (after.length > 1) {
    const keep = canonical(after);
    if (created?.id && keep?.id && created.id !== keep.id) {
      const losing = after.find((row) => row.id === created.id);
      const version = String(losing?.updated_date || '').trim();
      if (losing?.id && version) {
        const deleted = await Rule.deleteMany({ id: losing.id, updated_date: version, name: losing.name });
        if (deleted?.deleted === 1) {
          after = nameMatches(await listRules(Rule), cleaned.name);
          if (after.length === 1) return { record: after[0], status: 'concurrent_duplicate_discarded' };
        }
      }
    }
    throw Object.assign(new Error('Automation Rule was created concurrently more than once. Reload and review the matching rules.'), { status: 409 });
  }
  if (createError) throw createError;
  throw new Error('Automation Rule create outcome could not be verified.');
}

async function updateRule(Rule: any, body: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) throw Object.assign(new Error('Automation Rule version is required.'), { status: 400 });
  const current = await Rule.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Automation Rule no longer exists.'), { status: 404 });
  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('Automation Rule changed in another session. Reload before saving.'), { status: 409 });
  }
  const patch = cleanAutomationPatch(body?.next_fields, current);
  if (patch.name) {
    const duplicates = nameMatches(await listRules(Rule), patch.name, id);
    if (duplicates.length) throw Object.assign(new Error(`Another automation named “${patch.name}” already exists.`), { status: 409 });
  }
  const result = await Rule.updateMany({ id, updated_date: expectedUpdatedDate }, { $set: patch });
  if (!result || result.updated !== 1) throw Object.assign(new Error('Automation Rule changed in another session. Reload before saving.'), { status: 409 });
  const saved = await Rule.get(id).catch(() => null);
  if (!saved?.id || !fieldsMatch(saved, patch)) throw new Error('Automation Rule update could not be verified.');
  return saved;
}

async function toggleRule(Rule: any, body: any) {
  const id = String(body?.id || '').trim();
  if (!id || typeof body?.expected_enabled !== 'boolean') throw Object.assign(new Error('Automation Rule toggle state is required.'), { status: 400 });
  const current = await Rule.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Automation Rule no longer exists.'), { status: 404 });
  if (Boolean(current.enabled) !== body.expected_enabled) {
    throw Object.assign(new Error('Automation Rule enabled state changed in another session.'), { status: 409 });
  }
  const nextEnabled = !body.expected_enabled;
  const result = await Rule.updateMany(
    { id, updated_date: current.updated_date, enabled: body.expected_enabled },
    { $set: { enabled: nextEnabled } },
  );
  if (!result || result.updated !== 1) throw Object.assign(new Error('Automation Rule changed while its enabled state was being saved.'), { status: 409 });
  const saved = await Rule.get(id).catch(() => null);
  if (!saved?.id || Boolean(saved.enabled) !== nextEnabled) throw new Error('Automation Rule enabled state could not be verified.');
  return saved;
}

async function deleteRule(Rule: any, body: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) throw Object.assign(new Error('Automation Rule version is required.'), { status: 400 });
  const current = await Rule.get(id).catch(() => null);
  if (!current?.id) return { deleted: true, already_deleted: true };
  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('Automation Rule changed in another session and was not deleted.'), { status: 409 });
  }
  const result = await Rule.deleteMany({ id, updated_date: expectedUpdatedDate, name: current.name });
  if (!result || result.deleted !== 1) throw Object.assign(new Error('Automation Rule changed in another session and was not deleted.'), { status: 409 });
  return { deleted: true };
}

async function createGroup(Group: any, data: any) {
  const cleaned = cleanEmailGroupData(data);
  const before = nameMatches(await listGroups(Group), cleaned.name);
  if (before.length > 1) throw Object.assign(new Error(`Email group name “${cleaned.name}” already has duplicate records.`), { status: 409 });
  if (before.length === 1) return { record: before[0], status: 'existing' };
  let created: any = null;
  let createError: any = null;
  try { created = await Group.create(cleaned); } catch (error) { createError = error; }
  await new Promise((resolve) => setTimeout(resolve, 50));
  const after = nameMatches(await listGroups(Group), cleaned.name);
  if (after.length === 1) {
    if (!fieldsMatch(after[0], cleaned)) throw Object.assign(new Error('Email group was created concurrently with different values.'), { status: 409 });
    return { record: after[0], status: created?.id === after[0].id ? 'created' : 'recovered' };
  }
  if (after.length > 1) throw Object.assign(new Error('Email group was created concurrently more than once. Reload and review duplicates.'), { status: 409 });
  if (createError) throw createError;
  throw new Error('Email group create outcome could not be verified.');
}

async function updateGroup(Group: any, body: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) throw Object.assign(new Error('Email group version is required.'), { status: 400 });
  const current = await Group.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Email group no longer exists.'), { status: 404 });
  if (String(current.updated_date || '') !== expectedUpdatedDate) throw Object.assign(new Error('Email group changed in another session.'), { status: 409 });
  const cleaned = cleanEmailGroupData({ ...current, ...(body?.next_fields || {}) });
  const duplicates = nameMatches(await listGroups(Group), cleaned.name, id);
  if (duplicates.length) throw Object.assign(new Error(`Another email group named “${cleaned.name}” already exists.`), { status: 409 });
  const patch = { name: cleaned.name, description: cleaned.description, emails: cleaned.emails };
  const result = await Group.updateMany({ id, updated_date: expectedUpdatedDate }, { $set: patch });
  if (!result || result.updated !== 1) throw Object.assign(new Error('Email group changed in another session.'), { status: 409 });
  const saved = await Group.get(id).catch(() => null);
  if (!saved?.id || !fieldsMatch(saved, patch)) throw new Error('Email group update could not be verified.');
  return saved;
}

async function deleteGroup(Group: any, Rule: any, body: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) throw Object.assign(new Error('Email group version is required.'), { status: 400 });
  const current = await Group.get(id).catch(() => null);
  if (!current?.id) return { deleted: true, already_deleted: true };
  if (String(current.updated_date || '') !== expectedUpdatedDate) throw Object.assign(new Error('Email group changed in another session.'), { status: 409 });
  const references = (await listRules(Rule)).filter((rule) => ruleReferencesGroup(rule, id));
  if (references.length) {
    const names = references.slice(0, 3).map((rule) => rule.name || rule.id).join(', ');
    throw Object.assign(new Error(`Email group is still referenced by ${references.length} automation rule${references.length === 1 ? '' : 's'}${names ? ` (${names})` : ''}.`), { status: 409 });
  }
  const result = await Group.deleteMany({ id, updated_date: expectedUpdatedDate });
  if (!result || result.deleted !== 1) throw Object.assign(new Error('Email group changed in another session and was not deleted.'), { status: 409 });
  return { deleted: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    await verifyAdminSettingsCapability(base44, body?.admin_capability);

    const action = String(body?.action || '').trim();
    const Rule = base44.asServiceRole.entities.AutomationRule;
    const Group = base44.asServiceRole.entities.EmailGroup;

    if (action === 'automation_create') return Response.json(await createRule(Rule, body?.data));
    if (action === 'automation_update') return Response.json({ record: await updateRule(Rule, body) });
    if (action === 'automation_toggle') return Response.json({ record: await toggleRule(Rule, body) });
    if (action === 'automation_delete') return Response.json(await deleteRule(Rule, body));
    if (action === 'email_group_create') return Response.json(await createGroup(Group, body?.data));
    if (action === 'email_group_update') return Response.json({ record: await updateGroup(Group, body) });
    if (action === 'email_group_delete') return Response.json(await deleteGroup(Group, Rule, body));

    return Response.json({ error: 'Invalid automation configuration action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageAutomationConfig error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Automation configuration could not be changed safely.' : error?.message,
    }, { status: safeStatus });
  }
});
