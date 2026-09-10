import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const nowIso = () => new Date().toISOString();
const STALE_CLAIM_MS = 30 * 60 * 1000;
const canonical = (rows: any[] = []) => rows.slice().sort((a,b) => String(a.id || '').localeCompare(String(b.id || '')))[0] || null;

async function logWorker(base44: any, level: 'info' | 'warning' | 'error', message: string, details: any = {}) {
  await base44.asServiceRole.entities.FleetSystemLog.create({ source: 'fleetNotificationWorker', level, message, details }).catch(() => null);
}

async function maybeLogIdleHeartbeat(base44: any) {
  const logs = await base44.asServiceRole.entities.FleetSystemLog.filter({ source: 'fleetNotificationWorker' }, '-created_date', 1).catch(() => []);
  const latest = logs?.[0] || null;
  const lastAt = Date.parse(latest?.created_date || '') || 0;
  if (!lastAt || (Date.now() - lastAt) >= 6 * 60 * 60 * 1000) {
    await logWorker(base44, 'info', 'Fleet notification worker heartbeat.', { processed: 0, queue_was_idle: true });
  }
}

function easternNow() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const day = new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'America/New_York'}).format(now).toLowerCase();
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const hour = Number(parts.find(p=>p.type==='hour')?.value || 0);
  const minute = Number(parts.find(p=>p.type==='minute')?.value || 0);
  return { date, day, minutes: hour * 60 + minute };
}

async function maybeRunReminderFallback(base44: any, cutover: any) {
  if (!cutover?.scheduled_reminders_enabled || !cutover?.notifications_enabled) return;
  const local = easternNow();
  if (local.minutes < 7 * 60 + 10) return;

  const settingsRows = await base44.asServiceRole.entities.FleetSettings.filter({ setting_type: 'general' });
  const settings = settingsRows?.[0];
  if (!settings) return;
  const configuredToday = (settings.item_order_reminder_days || []).includes(local.day) || (settings.open_work_order_reminder_days || []).includes(local.day);
  if (!configuredToday) return;

  const reminderLogs = await base44.asServiceRole.entities.FleetSystemLog.filter({ source: 'fleetScheduledReminders' }, '-created_date', 10).catch(() => []);
  if ((reminderLogs || []).some((row: any) => row?.level === 'info' && row?.details?.date === local.date)) return;

  const fallbackLogs = await base44.asServiceRole.entities.FleetSystemLog.filter({ source: 'fleetReminderFallback' }, '-created_date', 3).catch(() => []);
  if ((fallbackLogs || []).some((row: any) => row?.details?.date === local.date)) return;

  let result: any = null;
  let error = '';
  try {
    result = await base44.asServiceRole.functions.invoke('fleetScheduledReminders', {});
    error = result?.data?.error || '';
  } catch (e: any) {
    error = e?.message || String(e);
  }
  await base44.asServiceRole.entities.FleetSystemLog.create({
    source: 'fleetReminderFallback',
    level: error ? 'warning' : 'info',
    message: error ? 'Fleet reminder fallback invocation failed.' : 'Fleet reminder fallback invoked because no primary reminder heartbeat was present.',
    details: { date: local.date, day: local.day, error, response: error ? {} : (result?.data || {}) },
  }).catch(() => null);
}

async function claimReceipt(Receipt: any, key: string, queue: any) {
  const applied = canonical(await Receipt.filter({ operation_key: key, status: 'applied' }));
  if (applied) return { applied: true, owner: false, receipt: applied };
  const started = canonical(await Receipt.filter({ operation_key: key, status: 'started' }));
  if (started) {
    const startedAt = Date.parse(started.started_at || started.created_date || '') || 0;
    if (!startedAt || (Date.now() - startedAt) < STALE_CLAIM_MS) return { applied: false, owner: false, receipt: started };
    return { applied: false, owner: false, receipt: started, stale: true };
  }

  const failed = canonical(await Receipt.filter({ operation_key: key, status: 'failed' }));
  if (failed) {
    const retryToken = crypto.randomUUID();
    const stamp = nowIso();
    await Receipt.update(failed.id, {
      status: 'started', started_at: stamp, error_message: '',
      result_summary: { ...(failed.result_summary || {}), retry_claim_token: retryToken, retry_claimed_at: stamp },
    });
    await new Promise(r => setTimeout(r, 50));
    const refreshed = await Receipt.get(failed.id);
    if (refreshed?.result_summary?.retry_claim_token !== retryToken) return { applied: false, owner: false, receipt: refreshed || failed };
    return { applied: false, owner: true, receipt: refreshed, retry: true };
  }

  const created = await Receipt.create({ operation_key: key, operation_type: 'notification', target_entity: 'FleetNotificationQueue', target_id: queue.id, status: 'started', started_at: nowIso(), result_summary: { notification_key: queue.notification_key, recipient_email: queue.recipient_email } });
  await new Promise(r => setTimeout(r, 50));
  const contenders = await Receipt.filter({ operation_key: key, status: 'started' });
  const winner = canonical(contenders) || created;
  if (winner.id !== created.id) {
    await Receipt.delete(created.id).catch(() => null);
    return { applied: false, owner: false, receipt: winner };
  }
  return { applied: false, owner: true, receipt: created };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const cutoverRows = await base44.asServiceRole.entities.FleetCutoverState.filter({ state_key: 'primary' });
    const cutover = cutoverRows?.[0];
    if (!cutover?.notifications_enabled) return Response.json({ success: true, disabled: true, processed: 0 });

    await maybeRunReminderFallback(base44, cutover);

    const Queue = base44.asServiceRole.entities.FleetNotificationQueue;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;
    const now = nowIso();
    const pending = (await loadAllEntityRows({
      entity: Queue,
      query: { status: { $in: ['pending','sending'] } },
      sort: 'send_after',
      label: 'Fleet notification queue pending/sending rows',
    }))
      .filter((row: any) => !row.send_after || row.send_after <= now)
      .sort((a: any,b: any) => String(a.send_after || '').localeCompare(String(b.send_after || '')))
      .slice(0, 50);

    const results: any[] = [];
    for (const item of pending) {
      const receiptKey = `fleetnotify-send:${item.notification_key}`;
      const claim = await claimReceipt(Receipt, receiptKey, item);
      if (claim.applied) {
        if (item.status !== 'sent') await Queue.update(item.id, { status: 'sent', sent_at: claim.receipt.applied_at || now, last_error: '' });
        results.push({ id: item.id, status: 'reused' });
        continue;
      }
      if (claim.stale) {
        const message = 'Notification delivery state is ambiguous because a prior send remained in progress for more than 30 minutes. It was not resent automatically to avoid a duplicate email.';
        const stamp = nowIso();
        await Queue.update(item.id, { status: 'failed', last_error: message, last_attempt_at: item.last_attempt_at || stamp });
        await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: stamp, error_message: message });
        results.push({ id: item.id, status: 'failed_ambiguous', error: message });
        continue;
      }
      if (!claim.owner) {
        results.push({ id: item.id, status: 'in_progress' });
        continue;
      }

      const attempts = Number(item.attempts || 0) + 1;
      await Queue.update(item.id, { status: 'sending', attempts, last_attempt_at: now });
      try {
        const { data } = await base44.asServiceRole.functions.invoke('sendGmail', { to: item.recipient_email, subject: item.subject, body: item.body_html });
        if (data?.error) throw new Error(data.error);
        const stamp = nowIso();
        await Queue.update(item.id, { status: 'sent', sent_at: stamp, last_error: '' });
        await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: stamp, result_summary: { ...(claim.receipt.result_summary || {}), message_id: data?.messageId || '' } });
        results.push({ id: item.id, status: 'sent' });
      } catch (error) {
        const message = error?.message || String(error);
        const terminal = attempts >= 5;
        await Queue.update(item.id, { status: terminal ? 'failed' : 'pending', last_error: message, send_after: new Date(Date.now() + Math.min(60, attempts * 10) * 60000).toISOString() });
        await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: message });
        results.push({ id: item.id, status: terminal ? 'failed' : 'retry', error: message });
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const retried = results.filter(r => r.status === 'retry').length;
    const failed = results.filter(r => ['failed','failed_ambiguous'].includes(r.status)).length;
    if (results.length) {
      await logWorker(base44, failed || retried ? 'warning' : 'info', 'Fleet notification worker processed queue items.', { processed: results.length, sent, retried, failed });
    } else {
      await maybeLogIdleHeartbeat(base44);
    }
    return Response.json({ success: true, processed: results.length, sent, results });
  } catch (error) {
    console.error('fleetNotificationWorker error:', error);
    try { await logWorker(createClientFromRequest(req), 'error', 'Fleet notification worker failed.', { error: error?.message || String(error) }); } catch {}
    return Response.json({ error: error?.message || 'Fleet notification worker failed.' }, { status: 500 });
  }
});
