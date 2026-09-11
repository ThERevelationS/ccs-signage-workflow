import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (e) {
            return Response.json({ connected: false, error: 'Not authenticated' }, { status: 401 });
        }
        
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
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
        if (error?.message && (error.message.includes('401') || error.message.includes('Authentication required'))) {
            return Response.json({ connected: false, error: 'Not authenticated' }, { status: 401 });
        }
        console.error('checkGmailConnection error:', error?.message || error);
        return Response.json({ connected: false, error: 'Gmail connection could not be checked safely' }, { status: 500 });
    }
});