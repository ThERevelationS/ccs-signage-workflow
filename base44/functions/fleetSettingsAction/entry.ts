import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const DAYS = new Set(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
const MAX_DELAY_MINUTES = 1440;
const MAX_BODY = 12000;
const MAX_SUBJECT = 300;

const stringValue = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

function normalizeRecipients(value: unknown, allowDelay = true) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of value) {
    const email = String(item?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    if (allowDelay) {
      const rawDelay = Number(item?.delay_minutes ?? 0);
      const delay = Number.isFinite(rawDelay) ? Math.max(0, Math.min(MAX_DELAY_MINUTES, Math.round(rawDelay))) : 0;
      out.push({ email, delay_minutes: delay });
    } else {
      out.push({ email });
    }
  }
  return out;
}

function normalizeDays(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => String(v || '').trim().toLowerCase()).filter(v => DAYS.has(v)))];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const rows = await base44.asServiceRole.entities.FleetSettings.filter({ setting_type: 'general' });
    const settings = rows?.[0] || null;
    if (!settings) return Response.json({ error: 'FleetSettings record missing.' }, { status: 404 });

    if (action === 'get') return Response.json({ success: true, settings });
    if (action !== 'update') return Response.json({ error: 'Unsupported Fleet settings action.' }, { status: 400 });

    const source = body?.settings || body || {};
    const patch: any = {
      company_name: stringValue(source.company_name ?? settings.company_name, 200),
      work_order_creation_emails: normalizeRecipients(source.work_order_creation_emails ?? settings.work_order_creation_emails, true),
      work_order_completed_emails: normalizeRecipients(source.work_order_completed_emails ?? settings.work_order_completed_emails, true),
      low_stock_emails: normalizeRecipients(source.low_stock_emails ?? settings.low_stock_emails, true),
      request_emails: normalizeRecipients(source.request_emails ?? settings.request_emails, true),
      parts_received_emails: normalizeRecipients(source.parts_received_emails ?? settings.parts_received_emails, true),
      report_emails: normalizeRecipients(source.report_emails ?? settings.report_emails, true),
      item_order_reminder_emails: normalizeRecipients(source.item_order_reminder_emails ?? settings.item_order_reminder_emails, false),
      open_work_order_reminder_emails: normalizeRecipients(source.open_work_order_reminder_emails ?? settings.open_work_order_reminder_emails, false),
      item_order_reminder_days: normalizeDays(source.item_order_reminder_days ?? settings.item_order_reminder_days),
      open_work_order_reminder_days: normalizeDays(source.open_work_order_reminder_days ?? settings.open_work_order_reminder_days),
      email_subject_template: stringValue(source.email_subject_template ?? settings.email_subject_template, MAX_SUBJECT),
      email_body_template: String(source.email_body_template ?? settings.email_body_template ?? '').slice(0, MAX_BODY),
      email_completed_subject_template: stringValue(source.email_completed_subject_template ?? settings.email_completed_subject_template, MAX_SUBJECT),
      email_completed_body_template: String(source.email_completed_body_template ?? settings.email_completed_body_template ?? '').slice(0, MAX_BODY),
      item_order_reminder_subject_template: stringValue(source.item_order_reminder_subject_template ?? settings.item_order_reminder_subject_template, MAX_SUBJECT),
      item_order_reminder_body_template: String(source.item_order_reminder_body_template ?? settings.item_order_reminder_body_template ?? '').slice(0, MAX_BODY),
      open_work_order_reminder_subject_template: stringValue(source.open_work_order_reminder_subject_template ?? settings.open_work_order_reminder_subject_template, MAX_SUBJECT),
      open_work_order_reminder_body_template: String(source.open_work_order_reminder_body_template ?? settings.open_work_order_reminder_body_template ?? '').slice(0, MAX_BODY),
    };

    if (!patch.company_name) return Response.json({ error: 'Company name is required.' }, { status: 400 });

    // Deliberately excluded from this editor: cutover gates, source-freeze state,
    // migration metadata, setting_type, and fleet_app_base_url. Those remain
    // controlled by the dedicated Fleet cutover/admin paths.
    const updated = await updateFleetRecordIfCurrent({
      entity: base44.asServiceRole.entities.FleetSettings,
      id: settings.id,
      expectedUpdatedAt: String(body?.expected_updated_date || '').trim(),
      patch,
      label: 'Fleet notification/reminder settings',
    });
    await base44.asServiceRole.entities.FleetSystemLog.create({
      source: 'fleetSettingsAction',
      level: 'info',
      message: 'Fleet notification/reminder settings updated.',
      details: { actor_email: user.email || '', editable_fields_only: true },
    }).catch(() => null);

    return Response.json({ success: true, settings: updated });
  } catch (error: any) {
    console.error('fleetSettingsAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet settings update failed.' }, { status: 500 });
  }
});