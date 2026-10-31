import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

// Session-authenticated gateway for the SOP module. The Sop entity RLS is
// backend-only, so every staff-facing read and write flows through here:
// a valid sign-shop session is required, editors/admins get draft visibility
// and mutation rights, regular staff get published SOPs and acknowledgements.
const SETTINGS_KEY = 'sopModuleSettings';
const STATUSES = new Set(['draft', 'published', 'archived']);
const ATTACHMENT_KINDS = new Set(['image', 'video', 'doc', 'other']);
const MAX_STEPS = 50;
const MAX_STEP_IMAGES = 8;
const MAX_ATTACHMENTS = 20;
const MAX_SAFETY_NOTES = 20;
const MAX_TAGS = 20;

const DEFAULT_SETTINGS = {
  categories: [
    { key: 'design', label: 'Design', color: '#60A5FA', icon: 'Pencil' },
    { key: 'cnc_router', label: 'CNC Router', color: '#4ADE80', icon: 'Router' },
    { key: 'cnc_laser', label: 'CNC Laser', color: '#F87171', icon: 'Zap' },
    { key: 'painting', label: 'Painting', color: '#C084FC', icon: 'Paintbrush' },
    { key: 'installation', label: 'Installation', color: '#FB923C', icon: 'Truck' },
    { key: 'fabrication', label: 'Fabrication', color: '#A3E635', icon: 'Wrench' },
    { key: 'estimating', label: 'Estimating', color: '#FBBF24', icon: 'Calculator' },
    { key: 'other', label: 'Other', color: '#94A3B8', icon: 'Folder' },
  ],
  editor_emails: [],
  require_ack_default: false,
  allow_in_app_recording: true,
  max_image_upload_mb: 15,
  max_video_upload_mb: 100,
};

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

function cleanSlug(value: unknown, fallback = 'other') {
  const slug = cleanText(value, 40).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(slug) ? slug : fallback;
}

function cleanSteps(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_STEPS).map((step: any, index: number) => ({
    id: cleanText(step?.id, 60) || `step_${index + 1}`,
    title: cleanText(step?.title, 200),
    body: String(step?.body || '').slice(0, 30000),
    images: (Array.isArray(step?.images) ? step.images : [])
      .map(cleanUrl).filter(Boolean).slice(0, MAX_STEP_IMAGES),
    video_url: cleanUrl(step?.video_url),
    external_video_url: cleanUrl(step?.external_video_url),
  })).filter((step: any) => step.title || step.body || step.images.length || step.video_url || step.external_video_url);
}

function cleanAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_ATTACHMENTS).map((item: any) => {
    const url = cleanUrl(item?.url);
    if (!url) return null;
    const kind = ATTACHMENT_KINDS.has(String(item?.kind)) ? String(item.kind) : 'other';
    return { name: cleanText(item?.name, 200) || 'Attachment', url, kind };
  }).filter(Boolean);
}

function cleanForm(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const title = cleanText(data.title, 200);
  if (!title) throw bad('The SOP needs a title.');
  const estimatedRaw = Number(data.estimated_minutes);
  const sortRaw = Number(data.sort_order);
  return {
    title,
    category: cleanSlug(data.category),
    summary: cleanText(data.summary, 2000),
    cover_image_url: cleanUrl(data.cover_image_url),
    steps: cleanSteps(data.steps),
    safety_notes: (Array.isArray(data.safety_notes) ? data.safety_notes : [])
      .map((n: any) => cleanText(n, 500)).filter(Boolean).slice(0, MAX_SAFETY_NOTES),
    attachments: cleanAttachments(data.attachments),
    tags: [...new Set((Array.isArray(data.tags) ? data.tags : [])
      .map((t: any) => cleanText(t, 60)).filter(Boolean))].slice(0, MAX_TAGS),
    estimated_minutes: Number.isFinite(estimatedRaw) ? Math.max(0, Math.min(10080, Math.round(estimatedRaw))) : 0,
    requires_ack: data.requires_ack === true,
    pinned: data.pinned === true,
    sort_order: Number.isFinite(sortRaw) ? Math.max(-9999, Math.min(9999, Math.round(sortRaw))) : 0,
  };
}

function cleanSettings(value: any) {
  const data = value && typeof value === 'object' ? value : {};
  const categories = (Array.isArray(data.categories) ? data.categories : [])
    .slice(0, 30).map((cat: any) => {
      const key = cleanSlug(cat?.key, '');
      const label = cleanText(cat?.label, 60);
      if (!key || !label) return null;
      const color = /^#[0-9a-fA-F]{6}$/.test(String(cat?.color || '')) ? String(cat.color) : '#94A3B8';
      return { key, label, color, icon: cleanText(cat?.icon, 40) || 'Folder' };
    }).filter(Boolean);
  const seen = new Set<string>();
  const deduped = categories.filter((cat: any) => {
    if (seen.has(cat.key)) return false;
    seen.add(cat.key);
    return true;
  });
  if (!deduped.some((cat: any) => cat.key === 'other')) {
    deduped.push({ key: 'other', label: 'Other', color: '#94A3B8', icon: 'Folder' });
  }
  const editorEmails = [...new Set((Array.isArray(data.editor_emails) ? data.editor_emails : [])
    .map(cleanEmail).filter(Boolean))].slice(0, 100);
  const imgCap = Number(data.max_image_upload_mb);
  const vidCap = Number(data.max_video_upload_mb);
  return {
    categories: deduped,
    editor_emails: editorEmails,
    require_ack_default: data.require_ack_default === true,
    allow_in_app_recording: data.allow_in_app_recording !== false,
    max_image_upload_mb: Number.isFinite(imgCap) ? Math.max(1, Math.min(100, Math.round(imgCap))) : 15,
    max_video_upload_mb: Number.isFinite(vidCap) ? Math.max(1, Math.min(500, Math.round(vidCap))) : 100,
  };
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

function isEditor(user: any, settings: any) {
  if (!user?.email) return false;
  if (user.role === 'admin') return true;
  const email = String(user.email).toLowerCase();
  return (settings?.editor_emails || []).includes(email);
}

function visibleTo(row: any, canEdit: boolean) {
  return canEdit || row?.status === 'published';
}

async function loadSettings(GlobalSettings: any) {
  const rows = await GlobalSettings.filter({ setting_key: SETTINGS_KEY });
  const row = Array.isArray(rows) && rows[0]?.setting_value ? rows[0] : null;
  const value = row?.setting_value && typeof row.setting_value === 'object' ? row.setting_value : {};
  return {
    record: row,
    settings: { ...DEFAULT_SETTINGS, ...value, categories: Array.isArray(value.categories) && value.categories.length ? value.categories : DEFAULT_SETTINGS.categories },
  };
}

async function listAll(Sop: any) {
  return loadAllEntityRows({ entity: Sop, sort: '-updated_date', label: 'SOP list' });
}

async function createWithRecovery(Sop: any, data: any) {
  const requestKey = cleanText(data.creation_request_key, 120);
  if (requestKey) {
    const existing = await Sop.filter({ creation_request_key: requestKey }, null, 5).catch(() => []);
    if (Array.isArray(existing) && existing[0]?.id) {
      return { record: existing[0], status: 'deduplicated' };
    }
  }
  const before = await listAll(Sop);
  const beforeIds = new Set(before.map((row: any) => row?.id).filter(Boolean));
  let created: any = null;
  let createError: any = null;
  try { created = await Sop.create(data); } catch (error) { createError = error; }

  if (created?.id) {
    const verified = await Sop.get(created.id).catch(() => null);
    if (verified?.id && fieldsMatch(verified, data)) return { record: verified, status: 'created' };
  }

  const after = await listAll(Sop).catch((error: any) => {
    if (createError) throw createError;
    throw error;
  });
  const candidates = after.filter((row: any) => !beforeIds.has(row.id) && fieldsMatch(row, data));
  if (candidates.length === 1) {
    return { record: candidates[0], status: createError ? 'recovered_after_response_loss' : 'created_verified' };
  }
  if (candidates.length > 1) {
    throw bad('SOP create is ambiguous. Reload and review before retrying.', 409);
  }
  if (createError) throw createError;
  throw new Error('SOP create outcome could not be verified.');
}

async function updateExact(Sop: any, body: any, nextFields: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) throw bad('SOP version is required.');
  const current = await Sop.get(id).catch(() => null);
  if (!current?.id) throw bad('SOP no longer exists.', 404);
  const result = await Sop.updateMany(
    { id: current.id, updated_date: expectedUpdatedDate },
    { $set: nextFields },
  );
  if (!result || result.updated !== 1) {
    throw bad('This SOP changed in another session. Reload before saving so nobody\'s edits are lost.', 409);
  }
  const saved = await Sop.get(id).catch(() => null);
  return saved || { ...current, ...nextFields };
}

async function deleteExact(Sop: any, body: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) throw bad('SOP version is required.');
  const current = await Sop.get(id).catch(() => null);
  if (!current?.id) return { deleted: true, already_absent: true };
  const result = await Sop.updateMany(
    { id: current.id, updated_date: expectedUpdatedDate },
    { $set: { status: 'archived' } },
  );
  // Deletion is a real delete, but the CAS must hold first so a stale editor
  // can't remove a record someone else just revised.
  if (!result || result.updated !== 1) {
    throw bad('This SOP changed in another session. Reload before deleting.', 409);
  }
  await Sop.delete(current.id);
  return { deleted: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    if (JSON.stringify(body || {}).length > 300000) {
      return Response.json({ error: 'Request is too large.' }, { status: 400 });
    }
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const action = String(body?.action || '').trim();
    const Sop = base44.asServiceRole.entities.Sop;
    const GlobalSettings = base44.asServiceRole.entities.GlobalSettings;
    const { record: settingsRecord, settings } = await loadSettings(GlobalSettings);
    const canEdit = isEditor(user, settings);
    const isAdmin = user.role === 'admin';

    if (action === 'bootstrap') {
      const rows = await listAll(Sop);
      const sops = rows.filter((row: any) => visibleTo(row, canEdit));
      return Response.json({
        settings,
        settings_updated_date: settingsRecord?.updated_date || '',
        sops,
        me: {
          email: String(user.email || '').toLowerCase(),
          name: String(user.full_name || '').trim(),
          role: String(user.role || 'user'),
          canEdit,
        },
      });
    }

    if (action === 'list') {
      const rows = await listAll(Sop);
      return Response.json({ sops: rows.filter((row: any) => visibleTo(row, canEdit)) });
    }

    if (action === 'get') {
      const id = String(body?.id || '').trim();
      const row = await Sop.get(id).catch(() => null);
      if (!row?.id || !visibleTo(row, canEdit)) {
        return Response.json({ error: 'SOP not found.' }, { status: 404 });
      }
      return Response.json({ sop: row });
    }

    if (action === 'acknowledge') {
      const id = String(body?.id || '').trim();
      if (!id) return Response.json({ error: 'SOP id is required.' }, { status: 400 });
      const viewer = String(user.email).toLowerCase();
      const viewerName = String(user.full_name || user.email).trim();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const row = await Sop.get(id).catch(() => null);
        if (!row?.id || row.status !== 'published') {
          return Response.json({ error: 'SOP not found.' }, { status: 404 });
        }
        const version = Number(row.version) || 1;
        const seen = Array.isArray(row.acknowledged_viewers) ? row.acknowledged_viewers : [];
        const already = seen.some((v: any) => String(v?.email || '').toLowerCase() === viewer && Number(v?.version) === version);
        if (already) return Response.json({ acknowledged: true, already_acknowledged: true, sop: row });
        const next = [...seen, { email: viewer, name: viewerName, version, acknowledged_at: new Date().toISOString() }].slice(-500);
        const result = await Sop.updateMany(
          { id: row.id, updated_date: row.updated_date },
          { $set: { acknowledged_viewers: next } },
        );
        if (result && result.updated === 1) {
          const saved = await Sop.get(id).catch(() => null);
          return Response.json({ acknowledged: true, sop: saved || row });
        }
      }
      return Response.json({ acknowledged: true, deferred: true });
    }

    if (action === 'suggest_edit') {
      // Any signed-in staff may flag a step or the SOP itself — editors review.
      const id = String(body?.id || '').trim();
      const text = cleanText(body?.text, 1000);
      if (!id || !text) return Response.json({ error: 'SOP id and a suggestion are required.' }, { status: 400 });
      const stepId = cleanText(body?.step_id, 60);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const row = await Sop.get(id).catch(() => null);
        if (!row?.id || row.status !== 'published') {
          return Response.json({ error: 'SOP not found.' }, { status: 404 });
        }
        const list = Array.isArray(row.suggestions) ? row.suggestions : [];
        const suggestion = {
          id: `sg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          email: String(user.email).toLowerCase(),
          name: String(user.full_name || user.email).trim(),
          step_id: stepId,
          text,
          created_at: new Date().toISOString(),
          status: 'open',
        };
        const result = await Sop.updateMany(
          { id: row.id, updated_date: row.updated_date },
          { $set: { suggestions: [...list, suggestion].slice(-200) } },
        );
        if (result && result.updated === 1) {
          return Response.json({ suggested: true, suggestion });
        }
      }
      return Response.json({ suggested: true, deferred: true });
    }

    // Everything below mutates records — requires admin or named-editor rights.
    if (!canEdit) return Response.json({ error: 'SOP editing requires an admin or SOP editor account.' }, { status: 403 });

    if (action === 'create') {
      const form = cleanForm(body?.data);
      const created = await createWithRecovery(Sop, {
        ...form,
        status: 'draft',
        version: 1,
        acknowledged_viewers: [],
        created_by_email: String(user.email).toLowerCase(),
        created_by_name: String(user.full_name || '').trim(),
        updated_by_email: String(user.email).toLowerCase(),
        creation_request_key: cleanText(body?.creation_request_key, 120) || `sop_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      });
      return Response.json(created);
    }

    if (action === 'update') {
      const id = String(body?.id || '').trim();
      const current = await Sop.get(id).catch(() => null);
      if (!current?.id) return Response.json({ error: 'SOP no longer exists.' }, { status: 404 });
      const form = cleanForm({ ...current, ...(body?.next_fields || {}) });
      const contentChanged = !fieldsMatch(current, form);
      // Publishing fresh content while already published moves the version so
      // staff who acknowledged the old text are asked to re-read it.
      const versionBump = current.status === 'published' && contentChanged ? 1 : 0;
      const saved = await updateExact(Sop, body, {
        ...form,
        ...(versionBump ? { version: (Number(current.version) || 1) + 1 } : {}),
        updated_by_email: String(user.email).toLowerCase(),
      });
      return Response.json({ record: saved, version_bumped: versionBump === 1 });
    }

    if (action === 'resolve_suggestion') {
      const id = String(body?.id || '').trim();
      const sugId = cleanText(body?.suggestion_id, 60);
      const outcome = ['resolved', 'dismissed'].includes(String(body?.outcome)) ? String(body.outcome) : 'resolved';
      const current = await Sop.get(id).catch(() => null);
      if (!current?.id) return Response.json({ error: 'SOP no longer exists.' }, { status: 404 });
      const list = Array.isArray(current.suggestions) ? current.suggestions : [];
      const next = list.map((s: any) => s?.id === sugId && s?.status === 'open'
        ? { ...s, status: outcome, resolved_by: String(user.email).toLowerCase(), resolved_at: new Date().toISOString() }
        : s);
      const saved = await updateExact(Sop, body, { suggestions: next });
      return Response.json({ record: saved });
    }

    if (action === 'set_status') {
      const id = String(body?.id || '').trim();
      const status = String(body?.status || '').trim();
      if (!STATUSES.has(status)) return Response.json({ error: 'Unknown SOP status.' }, { status: 400 });
      const current = await Sop.get(id).catch(() => null);
      if (!current?.id) return Response.json({ error: 'SOP no longer exists.' }, { status: 404 });
      const saved = await updateExact(Sop, body, {
        status,
        updated_by_email: String(user.email).toLowerCase(),
      });
      return Response.json({ record: saved });
    }

    if (action === 'save_settings') {
      if (!isAdmin) return Response.json({ error: 'Admin access is required.' }, { status: 403 });
      const next = cleanSettings(body?.settings);
      if (settingsRecord?.id) {
        const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
        if (!expectedUpdatedDate) throw bad('Settings version is required.');
        const result = await GlobalSettings.updateMany(
          { id: settingsRecord.id, updated_date: expectedUpdatedDate },
          { $set: { setting_value: next } },
        );
        if (!result || result.updated !== 1) {
          throw bad('SOP settings changed in another session. Reload before saving.', 409);
        }
        const saved = await GlobalSettings.get(settingsRecord.id).catch(() => null);
        return Response.json({ settings: saved?.setting_value || next, settings_updated_date: saved?.updated_date || '' });
      }
      const before = await GlobalSettings.filter({ setting_key: SETTINGS_KEY });
      if (Array.isArray(before) && before[0]?.id) {
        throw bad('SOP settings were created in another session. Reload before saving.', 409);
      }
      const created = await GlobalSettings.create({ setting_key: SETTINGS_KEY, setting_value: next });
      return Response.json({ settings: next, settings_updated_date: created?.updated_date || '' });
    }

    if (action === 'ack_report') {
      if (!isAdmin) return Response.json({ error: 'Admin access is required.' }, { status: 403 });
      const rows = (await listAll(Sop)).filter((row: any) => row.status === 'published' && row.requires_ack === true);
      const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({}, 'full_name', 1000).catch(() => []);
      const roster = (Array.isArray(users) ? users : [])
        .map((u: any) => ({ email: String(u?.email || '').toLowerCase(), name: String(u?.full_name || u?.email || '').trim() }))
        .filter((u: any) => u.email);
      const report = rows.map((row: any) => {
        const version = Number(row.version) || 1;
        const acked = (Array.isArray(row.acknowledged_viewers) ? row.acknowledged_viewers : [])
          .filter((v: any) => Number(v?.version) === version)
          .map((v: any) => ({ email: String(v?.email || '').toLowerCase(), name: String(v?.name || ''), at: String(v?.acknowledged_at || '') }));
        const ackedEmails = new Set(acked.map((v: any) => v.email));
        const pending = roster.filter((u: any) => !ackedEmails.has(u.email));
        return { sop_id: row.id, title: row.title, category: row.category, version, acknowledged: acked, pending };
      });
      return Response.json({ report, roster_size: roster.length });
    }

    if (action === 'delete') {
      if (!isAdmin) return Response.json({ error: 'Only administrators can delete SOPs.' }, { status: 403 });
      return Response.json(await deleteExact(Sop, body));
    }

    return Response.json({ error: 'Unknown SOP action.' }, { status: 400 });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return Response.json({ error: error?.message || 'SOP request failed.' }, { status });
  }
});
