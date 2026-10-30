import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Fire-and-forget automation emit — a failure must never break the report
// write that already verified.
async function emitRecordAutomation(base44: any, eventType: string, recordId: string, actor: string) {
  try {
    await processWorkflowTriggerEvent({
      base44,
      payload: { event_type: eventType, record: { id: recordId } },
      changedByOverride: actor,
    });
  } catch (error: any) {
    console.error(`Automation emit failed for ${eventType}:`, error?.message || error);
  }
}
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const TYPES = new Set(['bug', 'feature', 'improvement']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set(['open', 'in_progress', 'completed']);

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out: any, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a: any, b: any) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function matchesFields(row: any, fields: Record<string, any>) {
  return Object.entries(fields).every(([key, value]) => sameValue(row?.[key], value));
}

function reportForViewer(row: any, isAdmin: boolean) {
  const report = { ...(row || {}) };
  if (!isAdmin) {
    delete report.submitted_by_email;
    delete report.admin_notes;
  }
  return report;
}

function cleanCreateInput(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const title = cleanText(data.title, 500);
  if (!title) throw Object.assign(new Error('Report title is required.'), { status: 400 });
  const type = TYPES.has(String(data.type || 'feature')) ? String(data.type || 'feature') : 'feature';
  const priority = PRIORITIES.has(String(data.priority || 'medium')) ? String(data.priority || 'medium') : 'medium';
  return {
    title,
    description: cleanText(data.description, 20_000),
    type,
    priority,
    status: 'open',
  };
}

function cleanAdminPatch(value: any, current: any) {
  const input = value && typeof value === 'object' ? value : {};
  const patch: Record<string, any> = {};

  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    const title = cleanText(input.title, 500);
    if (!title) throw Object.assign(new Error('Report title is required.'), { status: 400 });
    patch.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'description')) patch.description = cleanText(input.description, 20_000);
  if (Object.prototype.hasOwnProperty.call(input, 'admin_notes')) patch.admin_notes = cleanText(input.admin_notes, 20_000);
  if (Object.prototype.hasOwnProperty.call(input, 'type')) {
    const type = String(input.type || '');
    if (!TYPES.has(type)) throw Object.assign(new Error('Invalid report type.'), { status: 400 });
    patch.type = type;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'priority')) {
    const priority = String(input.priority || '');
    if (!PRIORITIES.has(priority)) throw Object.assign(new Error('Invalid report priority.'), { status: 400 });
    patch.priority = priority;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    const status = String(input.status || '');
    if (!STATUSES.has(status)) throw Object.assign(new Error('Invalid report status.'), { status: 400 });
    patch.status = status;
    patch.completed_date = status === 'completed' ? new Date().toISOString() : null;
  } else if (Object.prototype.hasOwnProperty.call(input, 'completed_date')) {
    // completed_date is status-derived. Ignore caller-supplied timestamps unless
    // the report is already completed, in which case keep the persisted value.
    patch.completed_date = current?.status === 'completed' ? current?.completed_date || null : null;
  }

  if (!Object.keys(patch).length) throw Object.assign(new Error('No supported report fields were supplied.'), { status: 400 });
  return patch;
}

async function createWithRecovery(Report: any, payload: any) {
  const before = await Report.filter({ title: payload.title });
  if (!Array.isArray(before)) throw new Error('Report create preflight could not be verified.');
  const beforeIds = new Set(before.map((row: any) => row?.id).filter(Boolean));

  let created: any = null;
  let createError: any = null;
  try {
    created = await Report.create(payload);
  } catch (error) {
    createError = error;
  }

  if (created?.id) {
    const saved = await Report.get(created.id).catch(() => null);
    if (saved?.id && matchesFields(saved, payload)) return { record: saved, status: 'created' };
  }

  const after = await Report.filter({ title: payload.title }).catch((error: any) => {
    if (createError) throw createError;
    throw error;
  });
  if (!Array.isArray(after)) throw new Error('Report create verification did not return a record list.');
  const candidates = after.filter((row: any) => !beforeIds.has(row?.id) && matchesFields(row, payload));
  if (candidates.length === 1) {
    return { record: candidates[0], status: createError ? 'recovered_after_response_loss' : 'created_verified' };
  }
  if (candidates.length > 1) {
    throw Object.assign(new Error('Report creation is ambiguous. Reload and review before retrying.'), { status: 409 });
  }
  if (createError) throw createError;
  throw new Error('Report create outcome could not be verified.');
}

async function updateExact(Report: any, id: string, expectedUpdatedDate: string, patch: Record<string, any>) {
  if (!id || !expectedUpdatedDate) throw Object.assign(new Error('Report version is required.'), { status: 400 });
  const current = await Report.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Report no longer exists.'), { status: 404 });
  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('Report changed in another session. Reload before saving.'), { status: 409 });
  }

  const result = await Report.updateMany(
    { id, updated_date: expectedUpdatedDate },
    { $set: patch },
  );
  if (!result || result.updated !== 1) {
    throw Object.assign(new Error('Report changed in another session. Reload before saving.'), { status: 409 });
  }

  const saved = await Report.get(id).catch(() => null);
  if (!saved?.id || !matchesFields(saved, patch)) throw new Error('Report update could not be verified.');
  return saved;
}

async function deleteExact(Report: any, id: string, expectedUpdatedDate: string) {
  if (!id || !expectedUpdatedDate) throw Object.assign(new Error('Report version is required.'), { status: 400 });
  const current = await Report.get(id).catch(() => null);
  if (!current?.id) return { deleted: true, already_deleted: true };
  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('Report changed in another session and was not deleted.'), { status: 409 });
  }
  const result = await Report.deleteMany({ id, updated_date: expectedUpdatedDate });
  if (!result || result.deleted !== 1) {
    throw Object.assign(new Error('Report changed in another session and was not deleted.'), { status: 409 });
  }
  return { deleted: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const Report = base44.asServiceRole.entities.FeatureReport;
    const sessionToken = String(body?.session_token || '').trim();
    let actor: any = null;

    if (action === 'list') {
      actor = await authenticateSignShopSession(base44, sessionToken);
      const scope = String(body?.scope || 'open') === 'completed' ? 'completed' : 'open';
      const query = scope === 'completed' ? { status: 'completed' } : { status: { $ne: 'completed' } };
      const sort = scope === 'completed' ? '-completed_date' : '-created_date';
      const rows = await loadAllEntityRows({ entity: Report, query, sort, label: `${scope} feature reports` });
      return Response.json({ records: rows.map((row: any) => reportForViewer(row, actor?.role === 'admin')) });
    }

    actor = await authenticateSignShopSession(base44, sessionToken);

    if (action === 'create') {
      const form = cleanCreateInput(body?.data);
      const payload = {
        ...form,
        submitted_by_name: cleanText(actor?.full_name || actor?.username || actor?.email, 500) || 'Unknown',
        submitted_by_email: cleanText(actor?.email, 320).toLowerCase(),
      };
      const created = await createWithRecovery(Report, payload);
      // Every returned record was genuinely created by this request (there is
      // no 'reused' path — ambiguous candidates throw instead).
      if (created?.record?.id) {
        await emitRecordAutomation(base44, 'feature_report_submitted', created.record.id, actor?.email || 'system');
      }
      return Response.json(created);
    }

    if (actor?.role !== 'admin') {
      return Response.json({ error: 'Admin access is required to change existing reports.' }, { status: 403 });
    }

    const id = String(body?.id || '').trim();
    const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();

    if (action === 'update') {
      const current = await Report.get(id).catch(() => null);
      if (!current?.id) return Response.json({ error: 'Report no longer exists.' }, { status: 404 });
      const patch = cleanAdminPatch(body?.next_fields, current);
      const saved = await updateExact(Report, id, expectedUpdatedDate, patch);
      if (patch.status && patch.status !== current.status) {
        await emitRecordAutomation(base44, 'feature_report_status_changed', saved.id, actor?.email || 'system');
        if (patch.status === 'completed') {
          await emitRecordAutomation(base44, 'feature_report_completed', saved.id, actor?.email || 'system');
        }
      }
      return Response.json({ record: saved });
    }

    if (action === 'delete') {
      return Response.json(await deleteExact(Report, id, expectedUpdatedDate));
    }

    return Response.json({ error: 'Invalid report action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageFeatureReports error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Report could not be changed safely.' : error?.message,
    }, { status: safeStatus });
  }
});