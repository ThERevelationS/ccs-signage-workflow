import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const nowIso = () => new Date().toISOString();
const canonical = (rows: any[] = []) => rows.slice().sort((a,b) => String(a.id || '').localeCompare(String(b.id || '')))[0] || null;

async function claimReceipt(Receipt: any, key: string, queue: any) {
  const applied = canonical(await Receipt.filter({ operation_key: key, status: 'applied' }));
  if (applied) return { applied: true, owner: false, receipt: applied };
  const started = canonical(await Receipt.filter({ operation_key: key, status: 'started' }));
  if (started) return { applied: false, owner: false, receipt: started };
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
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const cutoverRows = await base44.asServiceRole.entities.FleetCutoverState.filter({ state_key: 'primary' });
    const cutover = cutoverRows?.[0];
    if (!cutover?.notifications_enabled) return Response.json({ success: true, disabled: true, processed: 0 });

    const Queue = base44.asServiceRole.entities.FleetNotificationQueue;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;
    const now = nowIso();
    const pending = (await Queue.filter({ status: { $in: ['pending','sending'] } }))
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

    return Response.json({ success: true, processed: results.length, sent: results.filter(r => r.status === 'sent').length, results });
  } catch (error) {
    console.error('fleetNotificationWorker error:', error);
    return Response.json({ error: error?.message || 'Fleet notification worker failed.' }, { status: 500 });
  }
});
