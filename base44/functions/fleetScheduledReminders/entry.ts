import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const esc = (v: unknown) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const weekday = () => new Intl.DateTimeFormat('en-US',{ weekday:'long', timeZone:'America/New_York' }).format(new Date()).toLowerCase();
const localDate = () => new Intl.DateTimeFormat('en-CA',{ timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const settingsRows = await base44.asServiceRole.entities.FleetSettings.filter({ setting_type:'general' });
    const settings = settingsRows?.[0];
    if (!settings?.scheduled_reminders_enabled || !settings?.notifications_enabled) return Response.json({ success:true, disabled:true, queued:0 });

    const Queue = base44.asServiceRole.entities.FleetNotificationQueue;
    const today = localDate();
    const day = weekday();
    let queued = 0;
    let reused = 0;

    const enqueueDigest = async (type: string, recipients: any[], subject: string, bodyHtml: string) => {
      for (const recipient of recipients || []) {
        const email = String(recipient?.email || '').trim().toLowerCase();
        if (!email) continue;
        const key = `fleetdigest:${type}:${today}:${email}`;
        const existing = await Queue.filter({ notification_key:key });
        if (existing?.length) { reused++; continue; }
        await Queue.create({ notification_key:key, event_type:type, target_entity:'FleetSettings', target_id:settings.id, source_operation_key:`${type}:${today}`, recipient_email:email, subject, body_html:bodyHtml, send_after:new Date().toISOString(), status:'pending', attempts:0 });
        queued++;
      }
    };

    if ((settings.item_order_reminder_days || []).includes(day) && (settings.item_order_reminder_emails || []).length) {
      const items = await base44.asServiceRole.entities.FleetPartFluidRequest.filter({ status:{ $in:['pending','ordered'] } });
      if (items.length) {
        const rows = items.map((item:any) => `<tr><td style="padding:7px;border-bottom:1px solid #ddd">${esc(item.item_name)}</td><td style="padding:7px;border-bottom:1px solid #ddd">${esc(item.status)}</td><td style="padding:7px;border-bottom:1px solid #ddd">${esc(item.quantity_needed)}</td><td style="padding:7px;border-bottom:1px solid #ddd">${esc(item.requested_by_person || item.requester_email)}</td></tr>`).join('');
        const intro = esc(settings.item_order_reminder_body_template || 'Items pending or on order:');
        const body = `<div style="font-family:Arial,sans-serif"><p>${intro}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Item</th><th align="left">Status</th><th align="left">Qty</th><th align="left">Requested By</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        await enqueueDigest('items_on_order_digest', settings.item_order_reminder_emails, settings.item_order_reminder_subject_template || 'Fleet Reminder: Items Pending or On Order', body);
      }
    }

    if ((settings.open_work_order_reminder_days || []).includes(day) && (settings.open_work_order_reminder_emails || []).length) {
      const orders = await base44.asServiceRole.entities.FleetMaintenanceWorkOrder.filter({ status:{ $in:['open','assigned','in_progress'] } });
      if (orders.length) {
        const equipment = await base44.asServiceRole.entities.FleetEquipment.list();
        const names = Object.fromEntries((equipment || []).map((row:any) => [row.id,row.name]));
        const rows = orders.map((wo:any) => `<tr><td style="padding:7px;border-bottom:1px solid #ddd">${esc(wo.work_order_number)}</td><td style="padding:7px;border-bottom:1px solid #ddd">${esc(wo.title)}</td><td style="padding:7px;border-bottom:1px solid #ddd">${esc(names[wo.equipment_id] || 'N/A')}</td><td style="padding:7px;border-bottom:1px solid #ddd">${esc(wo.status)}</td><td style="padding:7px;border-bottom:1px solid #ddd">${esc(wo.priority)}</td></tr>`).join('');
        const intro = esc(settings.open_work_order_reminder_body_template || 'Open Fleet work orders:');
        const body = `<div style="font-family:Arial,sans-serif"><p>${intro}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">WO #</th><th align="left">Title</th><th align="left">Equipment</th><th align="left">Status</th><th align="left">Priority</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        await enqueueDigest('open_work_orders_digest', settings.open_work_order_reminder_emails, settings.open_work_order_reminder_subject_template || 'Fleet Reminder: Open Work Orders', body);
      }
    }

    if (queued > 0) await base44.asServiceRole.functions.invoke('fleetNotificationWorker', {}).catch(() => null);
    return Response.json({ success:true, day, date:today, queued, reused });
  } catch (error) {
    console.error('fleetScheduledReminders error:', error);
    return Response.json({ error:error?.message || 'Fleet scheduled reminders failed.' }, { status:500 });
  }
});
