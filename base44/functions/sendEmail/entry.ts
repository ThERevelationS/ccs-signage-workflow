import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { EmailClient } from 'npm:@azure/communication-email';

Deno.serve(async (req) => {
  try {
    const connectionString = Deno.env.get("AZURE_EMAIL_CONNECTION_STRING");
    if (!connectionString) {
      return Response.json({ error: 'Azure email not configured' }, { status: 503 });
    }

    const base44 = createClientFromRequest(req);
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const emailClient = new EmailClient(connectionString);
    const { to, subject, body, from_email, from_name } = await req.json();

    if (!to || !subject || !body || !from_email) {
      return Response.json({ error: 'Missing required fields: to, subject, body, from_email' }, { status: 400 });
    }

    // Handle multiple recipients
    const recipients = Array.isArray(to) ? to : [to];
    const toRecipients = recipients.map(email => ({ address: email }));

    const message = {
      senderAddress: from_email,
      content: {
        subject: subject,
        html: body.replace(/\n/g, '<br>')
      },
      recipients: {
        to: toRecipients
      }
    };

    const poller = await emailClient.beginSend(message);
    const result = await poller.pollUntilDone();

    return Response.json({ success: true, id: result.id, status: result.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});