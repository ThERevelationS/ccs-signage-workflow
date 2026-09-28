import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const TYPES = new Set(['filter', 'column_preset']);
const MAX_CONDITIONS = 100;
const MAX_COLUMNS = 250;
const MAX_JSON_CHARS = 200_000;
const MAX_ATTEMPTS = 4;

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function cleanEmail(value: unknown) {
  return cleanText(value, 320).toLowerCase();
}

function cleanStructuredArray(value: unknown, maxItems: number, label: string) {
  if (!Array.isArray(value)) return [];
  const sliced = value.slice(0, maxItems);
  let serialized = '';
  try { serialized = JSON.stringify(sliced); } catch {
    throw Object.assign(new Error(`${label} could not be serialized safely.`), { status: 400 });
  }
  if (serialized.length > MAX_JSON_CHARS) {
    throw Object.assign(new Error(`${label} is too large.`), { status: 400 });
  }
  return sliced;
}

function cleanEditable(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const name = cleanText(data.name, 200);
  if (!name) throw Object.assign(new Error('Filter name is required.'), { status: 400 });
  const type = String(data.type || 'filter');
  if (!TYPES.has(type)) throw Object.assign(new Error('Invalid filter type.'), { status: 400 });
  return {
    name,
    type,
    conditions: type === 'filter' ? cleanStructuredArray(data.conditions, MAX_CONDITIONS, 'Filter conditions') : [],
    column_settings: type === 'column_preset' ? cleanStructuredArray(data.column_settings, MAX_COLUMNS, 'Column settings') : [],
  };
}

function norm(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function canonical(rows: any[] = []) {
  return [...rows].sort((a, b) => {
    const aStamp = String(a?.created_date || '');
    const bStamp = String(b?.created_date || '');
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;
}

async function allRows(SalesFilter: any) {
  return loadAllEntityRows({ entity: SalesFilter, sort: 'created_date', label: 'Sales Filters' });
}

function salesRosterView(row: any) {
  return {
    id: cleanText(row?.id, 200),
    email: cleanEmail(row?.email),
    full_name: cleanText(row?.full_name, 500),
    sales_roles: Array.isArray(row?.sales_roles)
      ? row.sales_roles.map((role: unknown) => cleanText(role, 120)).filter(Boolean)
      : [],
    is_active: row?.is_active !== false,
  };
}

async function loadSalesRoster(AuthorizedEmail: any) {
  const rows = await loadAllEntityRows({ entity: AuthorizedEmail, sort: 'full_name', label: 'Sales person roster' });
  return rows
    .map(salesRosterView)
    .filter((row: any) => row.is_active !== false && row.full_name);
}

async function nameTypeMatches(SalesFilter: any, name: string, type: string) {
  const rows = await allRows(SalesFilter);
  const wanted = norm(name);
  return rows.filter((row: any) => norm(row?.name) === wanted && row?.type === type);
}

async function createIfAbsent(SalesFilter: any, actor: any, input: any) {
  const editable = cleanEditable(input);
  const before = await nameTypeMatches(SalesFilter, editable.name, editable.type);
  if (before.length) return { record: canonical(before), status: 'existing' };

  const payload = {
    ...editable,
    is_standard: false,
    created_by_name: cleanText(actor?.full_name || actor?.username || actor?.email, 500) || 'Unknown',
    owner_email: cleanEmail(actor?.email),
    selected_by: [],
  };

  let created: any = null;
  let createError: any = null;
  try { created = await SalesFilter.create(payload); } catch (error) { createError = error; }

  const after = await nameTypeMatches(SalesFilter, editable.name, editable.type);
  if (after.length === 1) {
    return { record: after[0], status: created?.id === after[0]?.id ? 'created' : 'recovered' };
  }
  if (after.length > 1) {
    const keep = canonical(after);
    if (created?.id && created.id !== keep?.id) {
      const ours = after.find((row: any) => row.id === created.id);
      if (ours?.id && cleanEmail(ours.owner_email) === cleanEmail(actor?.email) && ours.is_standard !== true) {
        const result = await SalesFilter.deleteMany({ id: ours.id, updated_date: ours.updated_date, is_standard: { $ne: true } });
        if (result?.deleted === 1) {
          const finalRows = await nameTypeMatches(SalesFilter, editable.name, editable.type);
          if (finalRows.length === 1) return { record: finalRows[0], status: 'concurrent_duplicate_discarded' };
        }
      }
    }
    throw Object.assign(new Error('This saved filter was created concurrently more than once. Reload and review before retrying.'), { status: 409 });
  }

  if (createError) throw createError;
  throw new Error('Saved filter create outcome could not be verified.');
}

async function updateCollaborative(SalesFilter: any, body: any, actor: any) {
  const id = cleanText(body?.id, 200);
  const expected = cleanText(body?.expected_updated_date, 200);
  if (!id || !expected) throw Object.assign(new Error('Saved filter version is required.'), { status: 400 });
  const current = await SalesFilter.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Saved filter no longer exists.'), { status: 404 });
  if (current.is_standard === true) throw Object.assign(new Error('Standard filters cannot be edited here.'), { status: 403 });
  if (String(current.updated_date || '') !== expected) {
    throw Object.assign(new Error('Saved filter changed in another session. Reload before saving.'), { status: 409 });
  }

  const editable = cleanEditable({ ...current, ...(body?.next_fields || {}) });
  const collisions = await nameTypeMatches(SalesFilter, editable.name, editable.type);
  if (collisions.some((row: any) => row.id !== id)) {
    throw Object.assign(new Error(`Another ${editable.type === 'column_preset' ? 'column preset' : 'filter'} named "${editable.name}" already exists.`), { status: 409 });
  }

  // Preserve immutable ownership/standard state and selection membership. The
  // display name follows the current editor, matching the prior collaborative UI.
  const patch = {
    ...editable,
    is_standard: false,
    created_by_name: cleanText(actor?.full_name || actor?.username || actor?.email, 500) || String(current.created_by_name || 'Unknown'),
  };
  const result = await SalesFilter.updateMany(
    { id, updated_date: expected, is_standard: { $ne: true } },
    { $set: patch },
  );
  if (!result || result.updated !== 1) {
    throw Object.assign(new Error('Saved filter changed in another session. Reload before saving.'), { status: 409 });
  }
  const saved = await SalesFilter.get(id).catch(() => null);
  if (!saved?.id) throw new Error('Saved filter update could not be verified.');
  return saved;
}

async function setSelection(SalesFilter: any, body: any, actor: any) {
  const id = cleanText(body?.id, 200);
  const email = cleanEmail(actor?.email);
  if (!id || !email) throw Object.assign(new Error('Saved filter selection could not identify the user.'), { status: 400 });
  const selected = Boolean(body?.selected);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await SalesFilter.get(id).catch(() => null);
    if (!current?.id) throw Object.assign(new Error('Saved filter no longer exists.'), { status: 404 });
    if (current.is_standard === true) throw Object.assign(new Error('Standard filter selection is stored locally.'), { status: 400 });
    const list = Array.isArray(current.selected_by) ? current.selected_by.map(cleanEmail).filter(Boolean) : [];
    const has = list.includes(email);
    if (has === selected) return current;
    const next = selected ? [...new Set([...list, email])] : list.filter((value) => value !== email);
    const result = await SalesFilter.updateMany(
      { id, updated_date: current.updated_date, is_standard: { $ne: true } },
      { $set: { selected_by: next } },
    );
    if (!result || typeof result.updated !== 'number') throw new Error('Saved filter selection result could not be verified.');
    if (result.updated === 1) {
      const saved = await SalesFilter.get(id).catch(() => null);
      const savedList = Array.isArray(saved?.selected_by) ? saved.selected_by.map(cleanEmail).filter(Boolean) : [];
      if (saved?.id && savedList.includes(email) === selected) return saved;
      throw new Error('Saved filter selection saved but could not be verified.');
    }
  }
  throw Object.assign(new Error('Saved filter selection changed repeatedly. Reload before retrying.'), { status: 409 });
}

async function deleteOwned(SalesFilter: any, body: any, actor: any) {
  const id = cleanText(body?.id, 200);
  const expected = cleanText(body?.expected_updated_date, 200);
  if (!id || !expected) throw Object.assign(new Error('Saved filter version is required.'), { status: 400 });
  const current = await SalesFilter.get(id).catch(() => null);
  if (!current?.id) return { deleted: true, already_deleted: true };
  if (current.is_standard === true) throw Object.assign(new Error('Standard filters cannot be deleted.'), { status: 403 });
  if (String(current.updated_date || '') !== expected) {
    throw Object.assign(new Error('Saved filter changed in another session and was not deleted.'), { status: 409 });
  }

  const actorEmail = cleanEmail(actor?.email);
  const ownerEmail = cleanEmail(current?.owner_email);
  const legacyCreatedBy = cleanEmail(current?.created_by);
  const allowed = actor?.role === 'admin' || (ownerEmail && ownerEmail === actorEmail) || (legacyCreatedBy && legacyCreatedBy !== 'anonymous' && legacyCreatedBy === actorEmail);
  if (!allowed) throw Object.assign(new Error('Only an administrator or the filter owner can delete this saved filter.'), { status: 403 });

  const result = await SalesFilter.deleteMany({ id, updated_date: expected, is_standard: { $ne: true } });
  if (!result || result.deleted !== 1) {
    throw Object.assign(new Error('Saved filter changed in another session and was not deleted.'), { status: 409 });
  }
  return { deleted: true };
}

async function copyUnique(SalesFilter: any, actor: any, source: any) {
  const cleanSource = cleanEditable(source);
  const baseName = cleanSource.name || 'Filter';
  for (let index = 1; index <= 100; index += 1) {
    const name = index === 1 ? `${baseName} (Copy)` : `${baseName} (Copy ${index})`;
    const result = await createIfAbsent(SalesFilter, actor, { ...cleanSource, name });
    if (result.status !== 'existing') return result;
  }
  throw Object.assign(new Error('Could not find an unused copy name.'), { status: 409 });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    const action = String(body?.action || '').trim();
    const SalesFilter = base44.asServiceRole.entities.SalesFilter;

    if (action === 'roster') {
      const AuthorizedEmail = base44.asServiceRole.entities.AuthorizedEmail;
      return Response.json({ users: await loadSalesRoster(AuthorizedEmail) });
    }
    if (action === 'create') return Response.json(await createIfAbsent(SalesFilter, actor, body?.data));
    if (action === 'copy') return Response.json(await copyUnique(SalesFilter, actor, body?.source));
    if (action === 'update') return Response.json({ record: await updateCollaborative(SalesFilter, body, actor) });
    if (action === 'selection') return Response.json({ record: await setSelection(SalesFilter, body, actor) });
    if (action === 'delete') return Response.json(await deleteOwned(SalesFilter, body, actor));

    return Response.json({ error: 'Invalid saved-filter action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageSalesFilters error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Saved filter could not be changed safely.' : error?.message,
    }, { status: safeStatus });
  }
});
