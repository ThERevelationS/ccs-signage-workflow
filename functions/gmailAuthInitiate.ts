import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        
        // Build the redirect URI for the callback
        const redirectUri = `https://clay-flow-signage-suite-387da97c.base44.app/api/functions/gmailAuthCallback`;
        
        // Build the Google OAuth URL
        const scopes = [
            'https://www.googleapis.com/auth/gmail.send'
        ];
        
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', scopes.join(' '));
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('state', user.email); // Pass user email to identify them in callback

        return Response.json({ authUrl: authUrl.toString() });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});