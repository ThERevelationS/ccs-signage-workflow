import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { to, subject, body } = await req.json();

        if (!to || !subject || !body) {
            return Response.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
        }

        // Get any user with Gmail connected (use as the sender account)
        const allUsers = await base44.asServiceRole.entities.User.list();
        const gmailUser = allUsers.find(u => u.gmail_connected && u.gmail_refresh_token);
        
        if (!gmailUser) {
            return Response.json({ error: 'No Gmail account connected. Please connect a Gmail account in Admin Settings.' }, { status: 400 });
        }

        const refreshToken = gmailUser.gmail_refresh_token;
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

        // Get a new access token using the refresh token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
            // If refresh token is invalid, mark Gmail as disconnected
            await base44.asServiceRole.entities.User.update(gmailUser.id, {
                gmail_connected: false,
                gmail_refresh_token: null
            });
            return Response.json({ error: 'Gmail authorization expired. Please reconnect your Gmail account.' }, { status: 401 });
        }

        const accessToken = tokens.access_token;

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