import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const actor = await authenticateSignShopSession(base44, body?.session_token);
        if (actor?.role !== 'admin') {
            return Response.json({ connected: false, error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        let user = null;
        try {
            user = await base44.auth.me();
        } catch (e) {
            return Response.json({ connected: false, error: 'Not authenticated' }, { status: 401 });
        }
        if (!user || user.role !== 'admin') {
            return Response.json({ connected: false, error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Try to get access token from platform's Gmail connector
        const { accessToken } = await base44.asServiceRole.connectors.getConnection("gmail");

        if (!accessToken) {
            return Response.json({ connected: false });
        }

        // Verify the token works by getting user profile
        const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!profileResponse.ok) {
            return Response.json({ connected: false });
        }

        const profile = await profileResponse.json();
        return Response.json({ connected: true, email: profile.emailAddress });

    } catch (error) {
        const status = Number(error?.status || error?.statusCode || 500);
        const safeStatus = [400, 401, 403, 409, 503].includes(status) ? status : 500;
        console.error('checkGmailConnection error:', error?.message || error);
        return Response.json({
            connected: false,
            error: safeStatus === 500 ? 'Gmail connection could not be checked safely' : error.message,
        }, { status: safeStatus });
    }
});