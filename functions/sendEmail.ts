import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { Resend } from 'npm:resend';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, body, from_name } = await req.json();

    if (!to || !subject || !body) {
      return Response.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
    }

    // Handle multiple recipients
    const recipients = Array.isArray(to) ? to : [to];

    const { data, error } = await resend.emails.send({
      from: `${from_name || 'Sign Shop'} <onboarding@resend.dev>`,
      to: recipients,
      subject: subject,
      html: body.replace(/\n/g, '<br>')
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, id: data.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});