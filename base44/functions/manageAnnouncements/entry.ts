import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const SOUND_TYPES = new Set(['none', 'chime', 'bell', 'alert', 'fanfare', 'ding', 'custom']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const MAX_TARGETS = 500;
const MAX_PAGES = 100;

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function cleanList(value: unknown, maxItems: number, maxLen: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function cleanForm(value: any, { requireContent = true } = {}) {
  const data = value && typeof value === 'object' ? value : {};
  const title = cleanText(data.title, 500);
  const message = cleanText(data.message, 20_000);
  if (requireContent && (!title || !message)) {
    throw Object.assign(new Error('Announcement title and message are required.'), { status: 400 });
  }
  const soundType = SOUND_TYPES.has(String(data.sound_type || 'chime')) ? String(data.sound_type || 'chime') : 'chime';
  const priority = PRIORITIES.has(String(data.priority || 'normal')) ? String(data.priority || 'normal') : 'normal';
  const durationRaw = Number(data.duration_seconds);
  const duration = Number.isFinite(durationRaw) ? Math.max(0, Math.min(3600, Math.round(durationRaw))) : 10;
  const background = cleanText(data.background_color, 32) || '#FFF9C4';
  return {
    name: cleanText(data.name, 500),
    title,
    message,
    image_url: cleanText(data.image_url, 4096),
    sound_type: soundType,
    custom_sound_url: cleanText(data.custom_sound_url, 4096),
    display_pages: cleanList(data.display_pages, MAX_PAGES, 200),
    target_users: cleanList(data.target_users, MAX_TARGETS, 320).map((email) => email.toLowerCase()),
    duration_seconds: duration,
    background_color: background,
    priority,
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

function publicationRank(record: any) {
  const persistedAt = Date.parse(String(record?.updated_date || '')) || Date.parse(String(record?.sent_at || '')) || 0;
  return [persistedAt, String(record?.id || '')] as const;
}

function comparePublication(a: any, b: any) {
  const [aTime, aId] = publicationRank(a);
  const [bTime, bId] = publicationRank(b);
  if (aTime !== bTime) return bTime - aTime;
  return bId.localeCompare(aId);
}

async function listAll(Announcement: any) {
  return loadAllEntityRows({ entity: Announcement, sort: '-updated_date', label: 'Announcement history' });
}

async function createWithRecovery(Announcement: any, data: any) {
  const before = await listAll(Announcement);
  const beforeIds = new Set(before.map((row: any) => row?.id).filter(Boolean));
  let created: any = null;
  let createError: any = null;
  try { created = await Announcement.create(data); } catch (error) { createError = error; }

  if (created?.id) {
    const verified = await Announcement.get(created.id).catch(() => null);
    if (verified?.id && fieldsMatch(verified, data)) return { record: verified, status: 'created' };
  }

  const after = await listAll(Announcement).catch((error: any) => {
    if (createError) throw createError;
    throw error;
  });
  const candidates = after.filter((row: any) => !beforeIds.has(row.id) && fieldsMatch(row, data));
  if (candidates.length === 1) {
    return { record: candidates[0], status: createError ? 'recovered_after_response_loss' : 'created_verified' };
  }
  if (candidates.length > 1) {
    throw Object.assign(new Error('Announcement create is ambiguous. Reload and review before retrying.'), { status: 409 });
  }
  if (createError) throw createError;
  throw new Error('Announcement create outcome could not be verified.');
}

async function updateExact(Announcement: any, body: any, nextFields: any) {
  const id = String(body?.id || '').trim();
  const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
  if (!id || !expectedUpdatedDate) throw Object.assign(new Error('Announcement version is required.'), { status: 400 });
  const current = await Announcement.get(id).catch(() => null);
  if (!current?.id) throw Object.assign(new Error('Announcement no longer exists.'), { status: 404 });
  if (String(current.updated_date || '') !== expectedUpdatedDate) {
    throw Object.assign(new Error('Announcement changed in another session. Reload before saving.'), { status: 409 });
  }
  const result = await Announcement.updateMany({ id, updated_date: expectedUpdatedDate }, { $set: nextFields });
  if (!result || result.updated !== 1) {
    throw Object.assign(new Error('Announcement changed in another session. Reload before saving.'), { status: 409 });
  }
  const saved = await Announcement.get(id).catch(() => null);
  if (!saved?.id || !fieldsMatch(saved, nextFields)) throw new Error('Announcement update could not be verified.');
  return saved;
}

async function deactivateIfStillLive(Announcement: any, row: any) {
  if (!row?.id || row.is_active !== true) return row;
  const result = await Announcement.updateMany(
    { id: row.id, updated_date: row.updated_date, is_active: true },
    { $set: { is_active: false } },
  );
  if (!result || typeof result.updated !== 'number') throw new Error('Announcement live-state update could not be verified.');
  if (result.updated === 1) return Announcement.get(row.id);
  const latest = await Announcement.get(row.id).catch(() => null);
  if (!latest?.id || latest.is_active !== true) return latest;
  throw Object.assign(new Error('Announcement live state changed concurrently.'), { status: 409 });
}

async function convergeSingleLive(Announcement: any, maxPasses = 4) {
  const passes = Math.max(1, Math.min(6, Number(maxPasses) || 4));
  for (let pass = 0; pass < passes; pass += 1) {
    const rows = await listAll(Announcement);
    const active = rows.filter((row: any) => row?.is_active === true).sort(comparePublication);
    if (active.length <= 1) return { winner: active[0] || null, activeCount: active.length };
    for (const loser of active.slice(1)) await deactivateIfStillLive(Announcement, loser);
  }
  const finalRows = await listAll(Announcement);
  const finalActive = finalRows.filter((row: any) => row?.is_active === true).sort(comparePublication);
  if (finalActive.length > 1) {
    throw Object.assign(new Error('Multiple live announcements remain. Reload before broadcasting again.'), { status: 409 });
  }
  return { winner: finalActive[0] || null, activeCount: finalActive.length };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor?.role !== 'admin') return Response.json({ error: 'Admin access is required.' }, { status: 403 });

    const action = String(body?.action || '').trim();
    const Announcement = base44.asServiceRole.entities.Announcement;

    if (action === 'create') {
      const form = cleanForm(body?.data);
      return Response.json(await createWithRecovery(Announcement, { ...form, is_active: false }));
    }

    if (action === 'update') {
      const current = await Announcement.get(String(body?.id || '')).catch(() => null);
      if (!current?.id) return Response.json({ error: 'Announcement no longer exists.' }, { status: 404 });
      const form = cleanForm({ ...current, ...(body?.next_fields || {}) });
      return Response.json({ record: await updateExact(Announcement, body, form) });
    }

    if (action === 'publish') {
      const form = cleanForm(body?.form);
      const sentAt = new Date().toISOString();
      const payload = { ...form, is_active: true, sent_at: sentAt, sent_by: String(actor.email || '').trim().toLowerCase() };
      let published: any;
      let createStatus: string | null = null;
      const id = String(body?.id || '').trim();
      if (id) published = await updateExact(Announcement, body, payload);
      else {
        const created = await createWithRecovery(Announcement, payload);
        published = created.record;
        createStatus = created.status;
      }
      const converged = await convergeSingleLive(Announcement);
      if (!converged.winner?.id) throw new Error('Live announcement could not be verified after publishing.');
      return Response.json({
        published,
        winner: converged.winner,
        won: converged.winner.id === published.id,
        createStatus,
      });
    }

    if (action === 'stop') {
      const id = String(body?.id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      if (!id || !expectedUpdatedDate) return Response.json({ error: 'Announcement version is required.' }, { status: 400 });
      const current = await Announcement.get(id).catch(() => null);
      if (!current?.id) return Response.json({ stopped: true, already_absent: true });
      if (current.is_active !== true) return Response.json({ record: current, stopped: true, already_stopped: true });
      const saved = await updateExact(Announcement, body, { is_active: false });
      return Response.json({ record: saved, stopped: true });
    }

    if (action === 'delete') {
      const id = String(body?.id || '').trim();
      const expectedUpdatedDate = String(body?.expected_updated_date || '').trim();
      if (!id || !expectedUpdatedDate) return Response.json({ error: 'Announcement version is required.' }, { status: 400 });
      const current = await Announcement.get(id).catch(() => null);
      if (!current?.id) return Response.json({ deleted: true, already_deleted: true });
      if (String(current.updated_date || '') !== expectedUpdatedDate) {
        return Response.json({ error: 'Announcement changed in another session and was not deleted.' }, { status: 409 });
      }
      const result = await Announcement.deleteMany({ id, updated_date: expectedUpdatedDate });
      if (!result || result.deleted !== 1) {
        return Response.json({ error: 'Announcement changed in another session and was not deleted.' }, { status: 409 });
      }
      return Response.json({ deleted: true });
    }

    return Response.json({ error: 'Invalid announcement action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;
    console.error('manageAnnouncements error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Announcement could not be changed safely.' : error?.message,
    }, { status: safeStatus });
  }
});
