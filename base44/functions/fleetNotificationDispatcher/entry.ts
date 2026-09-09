import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const esc = (v: unknown) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const replaceVars = (text: string, vars: Record<string,string>) => Object.entries(vars).reduce((out,[k,v]) => out.split(k).join(v), text || '');
const nowIso = () => new Date().toISOString();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const eventType = String(body?.event_type || '').trim();
    const targetId = String(body?.target_id || '').trim();
    if (!eventType || !targetId) return Response.json({ error: 'event_type and target_id are required.' }, { status: 400 });

    const cutoverRows = await base44.asServiceRole.entities.FleetCutoverState.filter({ state_key: 'primary' });
    const cutover = cutoverRows?.[0];
    if (!cutover?.notifications_enabled) return Response.json({ success: true, disabled: true, queued: 0 });

    const settingsRows = await base44.asServiceRole.entities.FleetSettings.filter({ setting_type: 'general' });
    const settings = settingsRows?.[0];
    if (!settings) return Response.json({ error: 'FleetSettings record missing.' }, { status: 409 });

    let recipients: any[] = [];
    let subject = '';
    let bodyHtml = '';
    let targetEntity = '';
    let eventToken = String(body?.event_token || '').trim();
    const fleetUrl = String(settings.fleet_app_base_url || '').trim();

    if (eventType === 'work_order_created' || eventType === 'work_order_completed') {
      const wo = await base44.asServiceRole.entities.FleetMaintenanceWorkOrder.get(targetId);
      if (!wo) return Response.json({ error: 'Fleet work order not found.' }, { status: 404 });
      const eq = wo.equipment_id ? await base44.asServiceRole.entities.FleetEquipment.get(wo.equipment_id).catch(() => null) : null;
      targetEntity = 'FleetMaintenanceWorkOrder';
      const vars: Record<string,string> = {
        '{work_order_number}': esc(wo.work_order_number), '{title}': esc(wo.title), '{equipment_name}': esc(eq?.name || 'N/A'),
        '{equipment_type}': esc(eq?.type || 'N/A'), '{priority}': esc(wo.priority), '{description}': esc(wo.description),
        '{corrective_action}': esc(wo.corrective_action), '{company_name}': esc(settings.company_name || 'CCS'), '{fleet_url}': esc(fleetUrl),
      };
      if (eventType === 'work_order_created') {
        recipients = settings.work_order_creation_emails || [];
        subject = replaceVars(settings.email_subject_template || 'New Fleet Work Order: {work_order_number}', vars);
        const raw = replaceVars(settings.email_body_template || 'A new Fleet work order was created: {work_order_number} - {title}', vars);
        bodyHtml = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${raw.replace(/\n/g,'<br>')}</div>`;
        eventToken ||= `created:${wo.id}`;
      } else {
        recipients = settings.work_order_completed_emails || [];
        subject = replaceVars(settings.email_completed_subject_template || 'Fleet Work Order Completed: {work_order_number}', vars);
        const raw = replaceVars(settings.email_completed_body_template || 'Fleet work order {work_order_number} is complete.\n\nCorrective Action:\n{corrective_action}', vars);
        bodyHtml = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${raw.replace(/\n/g,'<br>')}</div>`;
        eventToken ||= wo.completion_receipt_key || `completed:${wo.id}:${wo.completed_date || ''}`;
      }
    } else if (eventType === 'request_created' || eventType === 'request_received') {
      const request = await base44.asServiceRole.entities.FleetPartFluidRequest.get(targetId);
      if (!request) return Response.json({ error: 'Fleet request not found.' }, { status: 404 });
      const eq = request.equipment_id ? await base44.asServiceRole.entities.FleetEquipment.get(request.equipment_id).catch(() => null) : null;
      targetEntity = 'FleetPartFluidRequest';
      if (eventType === 'request_created') {
        recipients = settings.request_emails || [];
        subject = `New Fleet ${request.item_type === 'fluid' ? 'Fluid' : 'Part'} Request: ${request.item_name}`;
        bodyHtml = `<div style="font-family:Arial,sans-serif"><p>A new Fleet request was submitted.</p><p><b>Item:</b> ${esc(request.item_name)}<br><b>Quantity:</b> ${esc(request.quantity_needed)}<br><b>Equipment:</b> ${esc(eq?.name || 'N/A')}<br><b>Requested by:</b> ${esc(request.requested_by_person || request.requester_email)}<br><b>Justification:</b> ${esc(request.justification)}</p></div>`;
        eventToken ||= `created:${request.id}`;
      } else {
        recipients = settings.parts_received_emails || [];
        subject = `Fleet Item Received: ${request.item_name}`;
        bodyHtml = `<div style="font-family:Arial,sans-serif"><p>The requested Fleet item has been received and applied to Fleet inventory.</p><p><b>Item:</b> ${esc(request.item_name)}<br><b>Quantity received:</b> ${esc(request.quantity_received)} ${esc(request.received_unit)}<br><b>Received by:</b> ${esc(request.received_by)}</p></div>`;
        eventToken ||= request.receipt_key || `received:${request.id}`;
      }
    } else if (eventType === 'low_stock_part' || eventType === 'low_stock_fluid') {
      const isPart = eventType === 'low_stock_part';
      const item = isPart ? await base44.asServiceRole.entities.FleetPart.get(targetId) : await base44.asServiceRole.entities.FleetFluid.get(targetId);
      if (!item) return Response.json({ error: 'Fleet inventory item not found.' }, { status: 404 });
      if (item.enable_low_stock_alerts === false) return Response.json({ success: true, skipped: true, reason: 'item_alerts_disabled', queued: 0 });
      recipients = settings.low_stock_emails || [];
      targetEntity = isPart ? 'FleetPart' : 'FleetFluid';
      const qty = isPart ? item.quantity_on_hand : item.quantity;
      const min = item.minimum_stock;
      subject = `Low Fleet Stock: ${item.part_name || item.fluid_name}`;
      bodyHtml = `<div style="font-family:Arial,sans-serif"><p>A Fleet inventory item is at or below its minimum stock level.</p><p><b>Item:</b> ${esc(item.part_name || item.fluid_name)}<br><b>Current:</b> ${esc(qty)} ${esc(isPart ? 'units' : item.unit)}<br><b>Minimum:</b> ${esc(min)} ${esc(isPart ? 'units' : item.minimum_stock_unit || item.unit)}<br><b>Location:</b> ${esc(item.location || 'N/A')}</p></div>`;
      eventToken ||= String(body?.event_token || `low:${targetId}:${qty}`);
    } else {
      return Response.json({ error: `Unsupported Fleet notification event: ${eventType}` }, { status: 400 });
    }

    const Queue = base44.asServiceRole.entities.FleetNotificationQueue;
    let queued = 0;
    let reused = 0;
    const now = Date.now();
    for (const recipient of recipients) {
      const email = String(recipient?.email || '').trim().toLowerCase();
      if (!email) continue;
      const key = `fleetnotify:${eventType}:${eventToken}:${email}`;
      const existing = await Queue.filter({ notification_key: key });
      if (existing?.length) { reused++; continue; }
      const delayMinutes = Math.max(0, Number(recipient?.delay_minutes || 0));
      await Queue.create({ notification_key: key, event_type: eventType, target_entity: targetEntity, target_id: targetId, source_operation_key: eventToken, recipient_email: email, subject, body_html: bodyHtml, send_after: new Date(now + delayMinutes * 60000).toISOString(), status: 'pending', attempts: 0 });
      queued++;
    }

    if (queued > 0) await base44.asServiceRole.functions.invoke('fleetNotificationWorker', {}).catch(() => null);
    return Response.json({ success: true, queued, reused });
  } catch (error) {
    console.error('fleetNotificationDispatcher error:', error);
    return Response.json({ error: error?.message || 'Fleet notification dispatch failed.' }, { status: 500 });
  }
});
