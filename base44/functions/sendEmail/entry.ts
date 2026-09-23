import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, payload?.session_token);
    if (actor?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { to, subject, body, from_name } = payload || {};

    if (!to || !subject || !body) {
      return Response.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
    }

    const recipients = (Array.isArray(to) ? to : [to]).map((email: unknown) => String(email || '').trim()).filter(Boolean);
    const safeSubject = String(subject || '').trim();
    const safeBody = String(body || '');
    const safeFromName = String(from_name || '').trim();
    if (recipients.length === 0 || recipients.length > 25 || recipients.some((email: string) => email.length > 320)) {
      return Response.json({ error: 'Email recipients are invalid or exceed the allowed limit' }, { status: 400 });
    }
    if (!safeSubject || safeSubject.length > 500 || safeBody.length > 1_000_000 || safeFromName.length > 200) {
      return Response.json({ error: 'Email content exceeds the allowed limits' }, { status: 400 });
    }

    const sent: string[] = [];
    for (const recipient of [...new Set(recipients)]) {
      try {
        await base44.integrations.Core.SendEmail({
          to: recipient,
          subject: safeSubject,
          body: safeBody,
          from_name: safeFromName || undefined,
        });
        sent.push(recipient);
      } catch (error) {
        console.error(`sendEmail failed for ${recipient}:`, error?.message || error);
      }
    }

    if (sent.length === 0) {
      return Response.json({ error: 'Email could not be sent to any recipient' }, { status: 502 });
    }

    return Response.json({ success: true, sent_count: sent.length, recipients: sent });
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    const safeStatus = [400, 401, 403, 502, 503].includes(status) ? status : 500;
    console.error('sendEmail error:', (error as any)?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Email could not be sent safely' : (error as any)?.message,
    }, { status: safeStatus });
  }
});