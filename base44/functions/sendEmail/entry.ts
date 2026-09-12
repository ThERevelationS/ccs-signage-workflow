import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { EmailClient } from 'npm:@azure/communication-email';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, payload?.session_token);
    if (actor?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const connectionString = Deno.env.get("AZURE_EMAIL_CONNECTION_STRING");
    if (!connectionString) {
      return Response.json({ error: 'Azure email not configured' }, { status: 503 });
    }

    const emailClient = new EmailClient(connectionString);
    const { to, subject, body, from_email, from_name } = payload || {};

    if (!to || !subject || !body || !from_email) {
      return Response.json({ error: 'Missing required fields: to, subject, body, from_email' }, { status: 400 });
    }

    // Handle multiple recipients with bounded caller-controlled payloads.
    const recipients = (Array.isArray(to) ? to : [to]).map((email) => String(email || '').trim()).filter(Boolean);
    const safeSubject = String(subject || '').trim();
    const safeBody = String(body || '');
    const safeFromEmail = String(from_email || '').trim();
    const safeFromName = String(from_name || '').trim();
    if (recipients.length === 0 || recipients.length > 25 || recipients.some((email) => email.length > 320)) {
      return Response.json({ error: 'Email recipients are invalid or exceed the allowed limit' }, { status: 400 });
    }
    if (!safeSubject || safeSubject.length > 500 || safeBody.length > 1_000_000 || safeFromEmail.length > 320 || safeFromName.length > 200) {
      return Response.json({ error: 'Email content exceeds the allowed limits' }, { status: 400 });
    }
    const toRecipients = recipients.map(email => ({ address: email }));

    const message = {
      senderAddress: safeFromEmail,
      content: {
        subject: safeSubject,
        html: safeBody.replace(/\n/g, '<br>')
      },
      recipients: {
        to: toRecipients
      }
    };

    const poller = await emailClient.beginSend(message);
    const result = await poller.pollUntilDone();

    return Response.json({ success: true, id: result.id, status: result.status });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 409, 503].includes(status) ? status : 500;
    console.error('sendEmail error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Email could not be sent safely' : error.message,
    }, { status: safeStatus });
  }
});