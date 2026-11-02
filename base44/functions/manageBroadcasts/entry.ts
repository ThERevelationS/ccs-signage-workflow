import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import {
  broadcastMessageShape,
  visibleBroadcasts,
  resolveAudience,
  cohortMatches,
} from '../../shared/broadcastModel.ts';

const clean = (v: any) => String(v ?? '').trim();
const bad = (msg: string, status = 400) =>
  Object.assign(new Error(msg), { statusCode: status });
const MAX_CAS_APPEND = 500;

// Who may SEND a broadcast: admin role, or a manager-level sales_role.
const canSend = (actor: any) =>
  clean(actor?.role) === 'admin' ||
  cohortMatches(actor, 'managers');

// CAS-append an actor key into a receipt array (manageAnnouncements pattern):
// {id,updated_date} match + $set — a lost race just retries; a duplicate key
// dedupes naturally because applyAck/applyDismiss already contain it.
async function casAppendReceipt(BroadcastMessage: any, id: string, field: 'acked_user_ids' | 'dismissed_user_ids', key: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await BroadcastMessage.get(id).catch(() => null);
    if (!row?.id) return { status: 'absent' };
    const existing = Array.isArray(row[field]) ? row[field].map((v: any) => clean(v).toLowerCase()) : [];
    if (existing.includes(key)) return { status: 'already', row };
    const result = await BroadcastMessage.updateMany(
      { id: row.id, updated_date: row.updated_date },
      { $set: { [field]: [...existing, key].slice(-MAX_CAS_APPEND) } },
    );
    if (result && result.updated === 1) return { status: 'ok' };
  }
  return { status: 'deferred' };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action);
    const actor = await authenticateSignShopSession(base44, body?.session_token).catch((e: any) => {
      if (e?.status !== 401 && e?.statusCode !== 401) throw e;
      return null;
    });
    const BroadcastMessage = base44.asServiceRole.entities.BroadcastMessage;

    // H-11: every action requires a verified staff actor — the entity is
    // backend-only RLS, and cohort-targeted rows must never reach
    // non-recipients, so there is no anonymous feed here.
    if (!actor?.email) {
      return Response.json({ error: 'A staff session is required.' }, { status: 401 });
    }

    if (action === 'feed') {
      const messages = await loadAllEntityRows({
        entity: BroadcastMessage,
        query: { status: 'sent' },
        sort: '-created_date',
        label: 'Broadcast feed',
      });
      const visible = visibleBroadcasts(messages, actor, new Date().toISOString());
      return Response.json({ success: true, action, messages: visible });
    }

    if (action === 'ack' || action === 'dismiss') {
      const id = clean(body?.id);
      if (!id) throw bad('A broadcast id is required.');
      const field = action === 'ack' ? 'acked_user_ids' : 'dismissed_user_ids';
      const key = clean(actor.email).toLowerCase();
      const result = await casAppendReceipt(BroadcastMessage, id, field, key);
      return Response.json({ success: true, action, ...result });
    }

    if (action === 'audience_preview') {
      const users = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.AuthorizedEmail,
        label: 'Staff directory',
      });
      const audience = resolveAudience(users, {
        cohort: body?.cohort,
        target_user_ids: body?.target_user_ids,
      });
      return Response.json({
        success: true, action,
        count: audience.length,
        recipients: audience.map((u: any) => clean(u?.email || u?.full_name)),
      });
    }

    // Everything below composes/sends — admin or manager-level staff only.
    if (!canSend(actor)) {
      return Response.json({ error: 'Broadcast compose requires admin or manager access.' }, { status: 403 });
    }

    if (action === 'send') {
      const users = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.AuthorizedEmail,
        label: 'Staff directory',
      });
      const shape = broadcastMessageShape({
        subject: body?.subject,
        body: body?.body,
        cohort: body?.cohort,
        target_user_ids: body?.target_user_ids,
        sender: { email: actor.email, full_name: actor.full_name },
        now: new Date().toISOString(),
        expires_at: body?.expires_at,
        priority: body?.priority,
        requires_ack: body?.requires_ack === true,
        status: 'sent',
        audience_size: resolveAudience(users, {
          cohort: body?.cohort,
          target_user_ids: body?.target_user_ids,
        }).length,
      });
      const created = await BroadcastMessage.create(shape);
      return Response.json({ success: true, action, broadcast: created });
    }

    if (action === 'list') {
      const messages = await loadAllEntityRows({
        entity: BroadcastMessage,
        sort: '-created_date',
        label: 'Broadcast history',
      });
      return Response.json({ success: true, action, messages });
    }

    if (action === 'cancel') {
      const id = clean(body?.id);
      if (!id) throw bad('A broadcast id is required.');
      const row = await BroadcastMessage.get(id).catch(() => null);
      if (!row?.id) return Response.json({ error: 'Broadcast not found.' }, { status: 404 });
      const isSender = clean(row?.sender_email).toLowerCase() === clean(actor.email).toLowerCase();
      if (!isSender && clean(actor.role) !== 'admin') {
        return Response.json({ error: 'Only the sender or an admin can cancel a broadcast.' }, { status: 403 });
      }
      await BroadcastMessage.update(id, { status: 'cancelled' });
      return Response.json({ success: true, action, id });
    }

    return Response.json({ error: `Unknown action: ${action || '(missing)'}` }, { status: 400 });
  } catch (error: any) {
    const status = error?.statusCode || error?.status || 500;
    console.error('manageBroadcasts error:', error?.message || error);
    return Response.json({ error: clean(error?.message) || 'Broadcast action failed.' }, { status });
  }
});
