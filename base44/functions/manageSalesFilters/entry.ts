import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

const TYPES = new Set(['filter', 'column_preset']);
const MAX_CONDITIONS = 100;
const MAX_COLUMNS = 250;
const MAX_JSON_CHARS = 200_000;
const MAX_ATTEMPTS = 4;
const SALES_INFORMATION_FILTERS = new Set(['all', 'lead', 'quoted', 'follow_up', 'won', 'lost', 'on_hold']);
const SALES_SORT_COLUMNS = new Set([
  'client_name', 'title', 'lead_source', 'current_task_deadline', 'current_task_assigned_to',
  'designer', 'project_manager', 'estimator', 'corbridge_invoice_number', 'estimate_amount',
  'date_initial_contact', 'site_survey_date', 'date_estimate_sent', 'date_order_created',
  'project_install_date', 'permit_submitted_date', 'permit_approved_date', 'created_date', 'updated_date',
]);
const SALES_ATTENTION_FILTERS = new Set([
  'all', 'overdue', 'today', 'upcoming', 'needs_attention', 'due', 'no_next_action',
  'quote_no_followup', 'quote_aged', 'near_close', 'close_overdue', 'stale', 'stage_aged',
  'age_90_plus', 'owner_unassigned', 'source_missing', 'quote_timing_missing',
  'stage_untracked', 'activity_untracked', 'mine', 'placeholder',
]);

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

// The roster is identical for every caller and costs a full paged read of
// AuthorizedEmail. Every Sales screen mounting at once used to spend that read
// from the shared entity budget and come back "busy". One read per warm
// instance per minute now serves them all, and a stale roster keeps screens
// working through a throttled window.
const ROSTER_CACHE_MS = 60_000;
let rosterCache: { at: number; users: any[] } | null = null;
let rosterInFlight: Promise<any[]> | null = null;

async function readSalesRoster(AuthorizedEmail: any) {
  const rows = await loadAllEntityRows({ entity: AuthorizedEmail, sort: 'full_name', label: 'Sales person roster' });
  return rows
    .map(salesRosterView)
    .filter((row: any) => row.is_active !== false && row.full_name);
}

async function loadSalesRoster(AuthorizedEmail: any) {
  if (rosterCache && Date.now() - rosterCache.at < ROSTER_CACHE_MS) return rosterCache.users;
  if (rosterInFlight) return rosterInFlight;

  const promise = (async () => {
    const users = await readSalesRoster(AuthorizedEmail);
    rosterCache = { at: Date.now(), users };
    return users;
  })();

  rosterInFlight = promise;
  try {
    return await promise;
  } catch (error) {
    if (rosterCache?.users?.length) return rosterCache.users;
    throw error;
  } finally {
    if (rosterInFlight === promise) rosterInFlight = null;
  }
}

function cleanSalesPipelinePreferences(value: any) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const information = cleanText(input.information_filter, 240) || 'all';
  const attention = cleanText(input.attention_filter, 80) || 'all';
  const column = cleanText(input.column_preset_id, 200) || 'default';
  const informationValid = SALES_INFORMATION_FILTERS.has(information) || /^custom_[A-Za-z0-9_-]{1,200}$/.test(information);
  const columnValid = column === 'default' || /^[A-Za-z0-9_-]{1,200}$/.test(column);
  return {
    information_filter: informationValid ? information : 'all',
    attention_filter: SALES_ATTENTION_FILTERS.has(attention) ? attention : 'all',
    column_preset_id: columnValid ? column : 'default',
  };
}

async function saveSalesPipelinePreferences(AuthorizedEmail: any, actor: any, value: any, expectedValue?: any) {
  const next = cleanSalesPipelinePreferences(value);
  const expected = expectedValue === undefined ? null : cleanSalesPipelinePreferences(expectedValue);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await AuthorizedEmail.get(actor?.id).catch(() => null);
    if (!current?.id) throw Object.assign(new Error('User preferences could not identify the signed-in user.'), { status: 404 });
    const currentPreferences = cleanSalesPipelinePreferences(current.sales_pipeline_preferences);
    if (expected && JSON.stringify(currentPreferences) !== JSON.stringify(expected)) {
      throw Object.assign(new Error('Sales Pipeline preferences changed in another session. Reload before retrying.'), { status: 409 });
    }
    const result = await AuthorizedEmail.updateMany(
      { id: current.id, updated_date: current.updated_date },
      { $set: { sales_pipeline_preferences: next } },
    );
    if (!result || typeof result.updated !== 'number') throw new Error('Sales Pipeline preferences result could not be verified.');
    if (result.updated === 1) {
      const saved = await AuthorizedEmail.get(current.id).catch(() => null);
      if (!saved?.id) throw new Error('Sales Pipeline preferences saved but could not be verified.');
      return cleanSalesPipelinePreferences(saved.sales_pipeline_preferences);
    }
  }
  throw Object.assign(new Error('Sales Pipeline preferences changed repeatedly. Reload before retrying.'), { status: 409 });
}

function cleanDefaultSort(value: any) {
  const column = cleanText(value?.column, 120);
  const direction = cleanText(value?.direction, 20).toLowerCase();
  return {
    column: SALES_SORT_COLUMNS.has(column) ? column : 'created_date',
    direction: direction === 'asc' ? 'asc' : 'desc',
  };
}

async function loadDefaultSortRecord(GlobalSettings: any) {
  const rows = await loadAllEntityRows({ entity: GlobalSettings, sort: null, label: 'Sales Pipeline default sort' });
  const matches = rows.filter((row: any) => row?.setting_key === 'salesPipelineDefaultSort');
  if (matches.length > 1) throw Object.assign(new Error('Sales Pipeline default sort has duplicate settings records. No changes were made.'), { status: 409 });
  return matches[0] || null;
}

async function saveDefaultSort(GlobalSettings: any, body: any) {
  const next = cleanDefaultSort(body?.value);
  const current = await loadDefaultSortRecord(GlobalSettings);
  if (!current?.id) {
    let created: any = null;
    let createError: any = null;
    try { created = await GlobalSettings.create({ setting_key: 'salesPipelineDefaultSort', setting_value: next }); } catch (error) { createError = error; }
    const verified = await loadDefaultSortRecord(GlobalSettings);
    if (verified?.id && JSON.stringify(cleanDefaultSort(verified.setting_value)) === JSON.stringify(next)) return verified;
    if (createError) throw createError;
    throw new Error('Sales Pipeline default sort create could not be verified.');
  }
  const expected = cleanText(body?.expected_updated_date, 200);
  if (!expected || String(current.updated_date || '') !== expected) {
    throw Object.assign(new Error('Sales Pipeline default sort changed in another session. Reload before saving.'), { status: 409 });
  }
  const result = await GlobalSettings.updateMany(
    { id: current.id, setting_key: 'salesPipelineDefaultSort', updated_date: current.updated_date },
    { $set: { setting_value: next } },
  );
  if (!result || result.updated !== 1) throw Object.assign(new Error('Sales Pipeline default sort changed while saving. Reload before retrying.'), { status: 409 });
  const saved = await GlobalSettings.get(current.id).catch(() => null);
  if (!saved?.id || JSON.stringify(cleanDefaultSort(saved.setting_value)) !== JSON.stringify(next)) {
    throw new Error('Sales Pipeline default sort saved but could not be verified.');
  }
  return saved;
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
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    const action = String(body?.action || '').trim();
    const SalesFilter = base44.asServiceRole.entities.SalesFilter;

    if (action === 'default_sort_get') {
      if (actor?.role !== 'admin') return Response.json({ error: 'Admin access is required.' }, { status: 403 });
      const GlobalSettings = base44.asServiceRole.entities.GlobalSettings;
      const record = await loadDefaultSortRecord(GlobalSettings);
      return Response.json({ record, value: cleanDefaultSort(record?.setting_value) });
    }
    if (action === 'default_sort_set') {
      if (actor?.role !== 'admin') return Response.json({ error: 'Admin access is required.' }, { status: 403 });
      const GlobalSettings = base44.asServiceRole.entities.GlobalSettings;
      const record = await saveDefaultSort(GlobalSettings, body);
      return Response.json({ record, value: cleanDefaultSort(record?.setting_value) });
    }
    if (action === 'roster') {
      const AuthorizedEmail = base44.asServiceRole.entities.AuthorizedEmail;
      return Response.json({ users: await loadSalesRoster(AuthorizedEmail) });
    }
    if (action === 'preferences_get') {
      return Response.json({ preferences: cleanSalesPipelinePreferences(actor?.sales_pipeline_preferences) });
    }
    if (action === 'preferences_set') {
      const AuthorizedEmail = base44.asServiceRole.entities.AuthorizedEmail;
      return Response.json({ preferences: await saveSalesPipelinePreferences(AuthorizedEmail, actor, body?.preferences, body?.expected_preferences) });
    }
    if (action === 'create') return Response.json(await createIfAbsent(SalesFilter, actor, body?.data));
    if (action === 'copy') return Response.json(await copyUnique(SalesFilter, actor, body?.source));
    if (action === 'update') return Response.json({ record: await updateCollaborative(SalesFilter, body, actor) });
    if (action === 'selection') return Response.json({ record: await setSelection(SalesFilter, body, actor) });
    if (action === 'delete') return Response.json(await deleteOwned(SalesFilter, body, actor));

    return Response.json({ error: 'Invalid saved-filter action.' }, { status: 400 });
  } catch (error) {
    // Database throttling is not a saved-filter problem: report it as a temporary
    // busy state instead of the misleading "could not be changed safely" message.
    const message = String(error?.message || error || '');
    const throttled = Number(error?.status) === 429 || /rate limit|traffic volume|too many requests|throttl/i.test(message);
    const status = throttled ? 503 : Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageSalesFilters error:', message || error);
    const safeMessage = throttled
      ? 'The app is busy right now. Wait a moment and try again.'
      : safeStatus === 500
        ? 'Saved filter could not be changed safely.'
        : error?.message;
    return Response.json({ error: safeMessage }, { status: safeStatus });
  }
});