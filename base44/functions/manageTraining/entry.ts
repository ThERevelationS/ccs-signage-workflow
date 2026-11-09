import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { memo, bust } from '../../shared/invokeMemo.ts';

// Session-authenticated gateway for the training tracker. TrainingItem and
// TrainingAssignment are backend-only RLS — all staff access flows through
// here. Admins + SOP named editors manage items/assignments; assignees read
// and complete their own rows only.
const SETTINGS_KEY = 'sopModuleSettings';
const TYPES = new Set(['sop', 'video', 'document', 'certification', 'custom']);
const MAX_ASSIGN_EMAILS = 200;

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function cleanUrl(value: unknown) {
  const raw = cleanText(value, 4096);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cleanDate(value: unknown) {
  const raw = cleanText(value, 40);
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : raw;
}

function cleanItemForm(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const title = cleanText(data.title, 200);
  if (!title) throw bad('Training needs a title.');
  const type = TYPES.has(String(data.type)) ? String(data.type) : 'custom';
  const sopId = type === 'sop' ? cleanText(data.sop_id, 60) : '';
  // A sop-type item with no linked SOP can only be "marked done" blind —
  // there is nothing for the assignee to read.
  if (type === 'sop' && !sopId) throw bad('Pick the SOP this training links to.');
  const dur = Number(data.duration_minutes);
  const valid = Number(data.valid_months);
  return {
    title,
    type,
    description: cleanText(data.description, 4000),
    sop_id: sopId,
    url: cleanUrl(data.url),
    file_url: cleanUrl(data.file_url),
    duration_minutes: Number.isFinite(dur) ? Math.max(0, Math.min(40000, Math.round(dur))) : 0,
    valid_months: type === 'certification' && Number.isFinite(valid) ? Math.max(0, Math.min(600, Math.round(valid))) : 0,
    active: data.active !== false,
    sort_order: Number.isFinite(Number(data.sort_order)) ? Math.round(Number(data.sort_order)) : 0,
  };
}

function isEditor(user: any, settings: any) {
  if (!user?.email) return false;
  if (user.role === 'admin') return true;
  const email = String(user.email).toLowerCase();
  return (settings?.editor_emails || []).includes(email);
}

async function loadEditorEmails(GlobalSettings: any) {
  return memo('training', 'editor_emails', 60000, async () => {
    const rows = await GlobalSettings.filter({ setting_key: SETTINGS_KEY }).catch(() => []);
    const value = Array.isArray(rows) && rows[0]?.setting_value ? rows[0].setting_value : {};
    return Array.isArray(value?.editor_emails) ? value.editor_emails : [];
  });
}

async function listAll(entity: any, sort = '-updated_date', label = 'list') {
  return loadAllEntityRows({ entity, sort, label });
}

async function createWithRecovery(entity: any, data: any, matchFields: Record<string, any>) {
  const requestKey = cleanText(data.creation_request_key, 200);
  if (requestKey) {
    const existing = await entity.filter({ creation_request_key: requestKey }, null, 5).catch(() => []);
    if (Array.isArray(existing) && existing[0]?.id) {
      return { record: existing[0], status: 'deduplicated' };
    }
  }
  let created: any = null;
  let createError: any = null;
  try { created = await entity.create(data); } catch (error) { createError = error; }
  if (created?.id) return { record: created, status: 'created' };

  const candidates = await entity.filter(matchFields, null, 10).catch(() => []);
  const wanted = (Array.isArray(candidates) ? candidates : []).find((row: any) =>
    Object.entries(matchFields).every(([k, v]) => String(row?.[k] ?? '') === String(v ?? '')));
  if (wanted?.id) return { record: wanted, status: 'recovered_after_response_loss' };
  if (createError) throw createError;
  throw new Error('Create outcome could not be verified.');
}

async function updateExact(entity: any, body: any, nextFields: any, label: string) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) throw bad(`${label} version is required.`);
  const current = await entity.get(id).catch(() => null);
  if (!current?.id) throw bad(`${label} no longer exists.`, 404);
  const result = await entity.updateMany(
    { id: current.id, updated_date: expectedUpdatedDate },
    { $set: nextFields },
  );
  if (!result || result.updated !== 1) {
    throw bad(`${label} changed in another session. Reload before saving.`, 409);
  }
  return entity.get(current.id);
}

function certExpiry(completedAtIso: string, validMonths: number) {
  if (!validMonths) return '';
  const d = new Date(completedAtIso);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + validMonths);
  return d.toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const email = String(user.email).toLowerCase();

    const TrainingItem = base44.asServiceRole.entities.TrainingItem;
    const TrainingAssignment = base44.asServiceRole.entities.TrainingAssignment;
    const GlobalSettings = base44.asServiceRole.entities.GlobalSettings;
    const AuthorizedEmail = base44.asServiceRole.entities.AuthorizedEmail;
    const editorEmails = await loadEditorEmails(GlobalSettings);
    const canEdit = isEditor(user, { editor_emails: editorEmails });
    const isAdmin = user.role === 'admin';
    const action = String(body?.action || 'bootstrap').trim();
    // Write actions change assignments/items — drop memoized reads so the
    // next bootstrap refetches.
    const TRAINING_READS = new Set(['bootstrap', 'my_assignments', 'report']);
    if (!TRAINING_READS.has(action)) bust('training');
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    const decorate = (rows: any[]) => (Array.isArray(rows) ? rows : []).map((r: any) => ({
      ...r,
      overdue: r.status === 'pending' && !!r.due_date && String(r.due_date) < today,
      renewal_due: r.status === 'completed' && !!r.expires_at && String(r.expires_at) <= nowIso,
    }));

    if (action === 'bootstrap' || action === 'my_assignments') {
      const mine = await memo('training', `mine:${email}`, 10000,
        () => TrainingAssignment.filter({ assignee_email: email }, '-updated_date', 200),
        { bypass: body?.bypass === true });
      const payload: any = {
        me: { email, name: String(user.full_name || ''), role: user.role, canEdit },
        // Cancelled rows are invisible to the assignee in every client —
        // keep them off the wire instead of shipping them forever.
        my_assignments: decorate((mine || []).filter((r: any) => r?.status !== 'cancelled')),
      };
      if (canEdit) {
        const [items, assignments, staffRows] = await Promise.all([
          memo('training', 'items', 15000, () => listAll(TrainingItem, 'sort_order', 'training items'), { bypass: body?.bypass === true }),
          memo('training', 'assignments', 15000, () => listAll(TrainingAssignment, '-updated_date', 'training assignments'), { bypass: body?.bypass === true }),
          memo('training', 'staff_roster', 60000, () => AuthorizedEmail.filter({}, null, 500).catch(() => []), { bypass: body?.bypass === true }),
        ]);
        payload.items = items || [];
        payload.assignments = decorate(assignments || []);
        payload.staff = (Array.isArray(staffRows) ? staffRows : [])
          // Deactivated accounts can't sign in — assigning to them is dead work.
          .filter((s: any) => s?.is_deactivated !== true)
          .map((s: any) => ({ email: String(s?.email || '').toLowerCase(), name: String(s?.name || s?.full_name || s?.email || '') }))
          .filter((s: any) => s.email);
      }
      return Response.json(payload);
    }

    if (action === 'report') {
      if (!canEdit) return Response.json({ error: 'Editor access required.' }, { status: 403 });
      const [items, assignments] = await Promise.all([
        listAll(TrainingItem, 'sort_order', 'training items'),
        listAll(TrainingAssignment, '-updated_date', 'training assignments'),
      ]);
      const decorated = decorate(assignments || []);
      const byItem: Record<string, any> = {};
      for (const a of decorated) {
        const key = a.training_id || 'unknown';
        if (!byItem[key]) byItem[key] = { item: (items || []).find((i: any) => i.id === key) || null, rows: [], pending: 0, completed: 0, overdue: 0 };
        byItem[key].rows.push(a);
        if (a.status === 'completed') byItem[key].completed += 1;
        if (a.status === 'pending') { byItem[key].pending += 1; if (a.overdue) byItem[key].overdue += 1; }
      }
      return Response.json({ items: items || [], by_item: byItem, total: decorated.length });
    }

    if (action === 'complete') {
      const id = String(body?.id || '').trim();
      const current = await TrainingAssignment.get(id).catch(() => null);
      if (!current?.id) return Response.json({ error: 'Assignment not found.' }, { status: 404 });
      const mine = String(current.assignee_email || '').toLowerCase() === email;
      if (!mine && !canEdit) return Response.json({ error: 'Only the assignee or an editor can complete this.' }, { status: 403 });
      if (current.status !== 'pending') return Response.json({ record: current });
      const expiresAt = certExpiry(nowIso, Number(current.valid_months) || 0);
      const saved = await updateExact(TrainingAssignment, body, {
        status: 'completed',
        completed_at: nowIso,
        completed_method: mine ? 'self' : 'manager',
        expires_at: expiresAt,
      }, 'Assignment');
      return Response.json({ record: saved });
    }

    // ---- Editor-gated mutations below ----
    if (!canEdit) return Response.json({ error: 'Editor access required.' }, { status: 403 });

    if (action === 'item_create') {
      const form = cleanItemForm(body?.item);
      const { record, status } = await createWithRecovery(
        TrainingItem,
        { ...form, creation_request_key: cleanText(body?.creation_request_key, 200) },
        { title: form.title, type: form.type },
      );
      return Response.json({ record, status });
    }

    if (action === 'item_update') {
      const form = cleanItemForm(body?.item);
      const saved = await updateExact(TrainingItem, body, form, 'Training item');
      return Response.json({ record: saved });
    }

    if (action === 'item_delete') {
      if (!isAdmin) return Response.json({ error: 'Admin access required.' }, { status: 403 });
      const id = String(body?.id || '').trim();
      if (!id) throw bad('Item id is required.');
      // Never delete with history — deactivate instead when assignments exist.
      const used = await TrainingAssignment.filter({ training_id: id }, null, 1).catch(() => []);
      if (Array.isArray(used) && used.length > 0) {
        const current = await TrainingItem.get(id).catch(() => null);
        if (current?.id) {
          const saved = await updateExact(TrainingItem, { ...body, id, expected_updated_date: body?.expected_updated_date || current.updated_date }, { active: false }, 'Training item');
          return Response.json({ record: saved, deactivated: true });
        }
      }
      await TrainingItem.delete(id);
      return Response.json({ deleted: true });
    }

    if (action === 'assign') {
      const trainingId = String(body?.training_id || '').trim();
      const item = await TrainingItem.get(trainingId).catch(() => null);
      if (!item?.id) return Response.json({ error: 'Training item not found.' }, { status: 404 });
      if (item.active === false) return Response.json({ error: 'This training item is inactive.' }, { status: 400 });
      // SOP-typed items must point at a real published SOP; assignees who
      // already acknowledged the current version close out immediately —
      // the acknowledge op early-returns on re-ack, so the hook never fires.
      let sopRow: any = null;
      if (String(item.type) === 'sop') {
        const Sop = (base44.asServiceRole.entities as any).Sop;
        sopRow = Sop && item.sop_id ? await Sop.get(String(item.sop_id)).catch(() => null) : null;
        if (!sopRow?.id || sopRow.status !== 'published') {
          return Response.json({ error: 'The linked SOP is missing or not published.' }, { status: 400 });
        }
      }
      const sopVersion = Number(sopRow?.version) || 0;
      const alreadyAcked = (em: string) => (Array.isArray(sopRow?.acknowledged_viewers) ? sopRow.acknowledged_viewers : [])
        .some((v: any) => String(v?.email || '').toLowerCase() === em && Number(v?.version) === sopVersion);
      const emails = [...new Set((Array.isArray(body?.emails) ? body.emails : []).map(cleanEmail).filter(Boolean))].slice(0, MAX_ASSIGN_EMAILS);
      if (!emails.length) throw bad('Pick at least one employee.');
      const dueDate = cleanDate(body?.due_date);
      const notes = cleanText(body?.notes, 1000);
      // Per-submission nonce from the client: the same retried call dedupes,
      // but a later deliberate re-assign (after completion/cancel) keys
      // differently so it isn't swallowed by the old row's dedupe record.
      const assignKey = cleanText(body?.assign_key, 80);
      const staff = await AuthorizedEmail.filter({}, null, 500).catch(() => []);
      const nameOf = (em: string) => {
        const row = (Array.isArray(staff) ? staff : []).find((s: any) => String(s?.email || '').toLowerCase() === em);
        return String(row?.name || row?.full_name || em);
      };
      const deactivated = new Set((Array.isArray(staff) ? staff : [])
        .filter((s: any) => s?.is_deactivated === true)
        .map((s: any) => String(s?.email || '').toLowerCase()));
      const created: any[] = [];
      const skipped: string[] = [];
      for (const em of emails) {
        if (deactivated.has(em)) { skipped.push(em); continue; }
        const pending = await TrainingAssignment.filter({ training_id: item.id, assignee_email: em, status: 'pending' }, null, 1).catch(() => []);
        if (Array.isArray(pending) && pending.length > 0) { skipped.push(em); continue; }
        const preAcked = sopRow ? alreadyAcked(em) : false;
        // Recovery matches on the request key, not {status:'pending'}: a
        // pre-acked row is created 'completed', so the old matcher could never
        // find it after a lost response — the retry then wrote a duplicate.
        const requestKey = `${item.id}:${em}${assignKey ? `:${assignKey}` : ''}`;
        const { record } = await createWithRecovery(TrainingAssignment, {
          training_id: item.id,
          training_title: String(item.title || ''),
          training_type: String(item.type || 'custom'),
          sop_id: String(item.sop_id || ''),
          url: String(item.url || ''),
          file_url: String(item.file_url || ''),
          duration_minutes: Number(item.duration_minutes) || 0,
          valid_months: Number(item.valid_months) || 0,
          assignee_email: em,
          assignee_name: nameOf(em),
          assigned_by: email,
          assigned_at: nowIso,
          due_date: dueDate,
          status: preAcked ? 'completed' : 'pending',
          completed_at: preAcked ? nowIso : null,
          completed_method: preAcked ? 'sop_ack' : null,
          notes,
          creation_request_key: requestKey,
        }, { creation_request_key: requestKey });
        if (record?.id) created.push(record);
      }
      return Response.json({ created, skipped });
    }

    if (action === 'cancel' || action === 'reopen') {
      const id = String(body?.id || '').trim();
      const current = await TrainingAssignment.get(id).catch(() => null);
      if (!current?.id) return Response.json({ error: 'Assignment not found.' }, { status: 404 });
      const nextStatus = action === 'cancel' ? 'cancelled' : 'pending';
      const patch: any = { status: nextStatus };
      // Clearing completion fields on both paths: cancel on a completed row
      // must not leave stale completed_at/expires_at behind, and reopen
      // resets them so the assignee gets a clean pending row.
      patch.completed_at = null; patch.completed_method = null; patch.expires_at = null;
      const saved = await updateExact(TrainingAssignment, body, patch, 'Assignment');
      return Response.json({ record: saved });
    }

    return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return Response.json({ error: error?.message || 'Training request failed.' }, { status });
  }
});
