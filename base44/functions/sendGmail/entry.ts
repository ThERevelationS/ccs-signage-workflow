import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { to, subject, body } = await req.json();

        if (!to || !subject || !body) {
            return Response.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
        }

        // Get access token from platform's Gmail connector
        const accessToken = await base44.asServiceRole.connectors.getAccessToken("gmail");

        if (!accessToken) {
            return Response.json({ error: 'Gmail not connected. Please connect Gmail in Admin Settings.' }, { status: 400 });
        }

        // Create the email in RFC 2822 format
        const emailLines = [
            `To: ${to}`,
            `Subject: ${subject}`,
            `Content-Type: text/html; charset=utf-8`,
            '',
            body
        ];
        const email = emailLines.join('\r\n');
        
        // Base64 URL encode the email
        const encodedEmail = btoa(unescape(encodeURIComponent(email)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        // Send the email via Gmail API
        const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encodedEmail })
        });

        const sendResult = await sendResponse.json();

        if (sendResult.error) {
            return Response.json({ error: sendResult.error.message }, { status: 500 });
        }

        return Response.json({ success: true, messageId: sendResult.id });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});