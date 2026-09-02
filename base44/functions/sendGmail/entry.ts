import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const cleanHeader = (value: unknown) => String(value || '').replace(/[\r\n]+/g, ' ').trim();

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
};

const utf8ToBase64 = (value: string) => bytesToBase64(new TextEncoder().encode(value));
const toBase64Url = (value: string) => utf8ToBase64(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const wrapBase64 = (value: string) => (value.replace(/\s+/g, '').match(/.{1,76}/g) || []).join('\r\n');

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { to, subject, body, attachments = [] } = await req.json();

        if (!to || !subject || !body) {
            return Response.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
        }
        if (!Array.isArray(attachments) || attachments.length > 3) {
            return Response.json({ error: 'attachments must be an array with no more than 3 files' }, { status: 400 });
        }

        let attachmentChars = 0;
        for (const attachment of attachments) {
            if (!attachment?.filename || !attachment?.base64) {
                return Response.json({ error: 'Each attachment requires filename and base64' }, { status: 400 });
            }
            attachmentChars += String(attachment.base64).replace(/\s+/g, '').length;
        }
        if (attachmentChars > 16_000_000) {
            return Response.json({ error: 'Attachments are too large to send through this workflow' }, { status: 400 });
        }

        // Get access token from platform's Gmail connector
        const { accessToken } = await base44.asServiceRole.connectors.getConnection("gmail");

        if (!accessToken) {
            return Response.json({ error: 'Gmail not connected. Please connect Gmail in Admin Settings.' }, { status: 400 });
        }

        // Create a multipart RFC 2822 message so the existing sender can also
        // carry quote PDFs without introducing a second email system.
        const boundary = `base44_${crypto.randomUUID().replace(/-/g, '')}`;
        const emailLines = [
            `To: ${cleanHeader(to)}`,
            `Subject: =?UTF-8?B?${utf8ToBase64(cleanHeader(subject))}?=`,
            'MIME-Version: 1.0',
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset=utf-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            String(body),
        ];

        for (const attachment of attachments) {
            const filename = cleanHeader(attachment.filename).replace(/["\\]/g, '_') || 'attachment';
            const mimeType = cleanHeader(attachment.mimeType) || 'application/octet-stream';
            emailLines.push(
                `--${boundary}`,
                `Content-Type: ${mimeType}; name="${filename}"`,
                'Content-Transfer-Encoding: base64',
                `Content-Disposition: attachment; filename="${filename}"`,
                '',
                wrapBase64(String(attachment.base64)),
            );
        }
        emailLines.push(`--${boundary}--`, '');

        const email = emailLines.join('\r\n');
        const encodedEmail = toBase64Url(email);

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