import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { verifyOAuthState } from '../../shared/oauthState.ts';

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
            return new Response(`
                <html>
                    <body>
                        <h1>Authorization Failed</h1>
                        <p>Google did not authorize the requested Gmail connection.</p>
                        <script>setTimeout(() => window.close(), 3000);</script>
                    </body>
                </html>
            `, { headers: { 'Content-Type': 'text/html' } });
        }

        if (!code || !state) {
            return new Response(`
                <html>
                    <body>
                        <h1>Authorization Failed</h1>
                        <p>No authorization code received.</p>
                    </body>
                </html>
            `, { headers: { 'Content-Type': 'text/html' } });
        }

        const identity = await verifyOAuthState(state, 'gmail_oauth');
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
        const redirectUri = `https://clay-flow-signage-suite-387da97c.base44.app/api/functions/gmailAuthCallback`;

        // Exchange the authorization code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
            console.error('gmailAuthCallback token exchange failed:', String(tokens.error));
            return new Response(`
                <html>
                    <body>
                        <h1>Token Exchange Failed</h1>
                        <p>The Gmail connection could not be completed safely. Please retry.</p>
                    </body>
                </html>
            `, { status: 502, headers: { 'Content-Type': 'text/html' } });
        }

        // Store the refresh token for the user
        const base44 = createClientFromRequest(req);
        
        // Bind the OAuth result only to the exact user who initiated the flow.
        const users = await base44.asServiceRole.entities.User.filter({ email: identity.email });
        if (!Array.isArray(users) || users.length !== 1 || String(users[0]?.id || '') !== identity.userId) {
            return new Response('OAuth user identity could not be verified', { status: users?.length > 1 ? 409 : 401 });
        }
        await base44.asServiceRole.entities.User.update(users[0].id, {
            gmail_refresh_token: tokens.refresh_token,
            gmail_connected: true
        });

        // Return success page that closes itself
        return new Response(`
            <html>
                <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%);">
                    <div style="text-align: center; padding: 40px; background: white; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <h1 style="color: #22c55e;">✓ Gmail Connected!</h1>
                        <p style="color: #666;">You can close this window now.</p>
                        <script>
                            setTimeout(() => {
                                window.opener && window.opener.postMessage('gmail_connected', '*');
                                window.close();
                            }, 2000);
                        </script>
                    </div>
                </body>
            </html>
        `, { headers: { 'Content-Type': 'text/html' } });

    } catch (error) {
        const status = Number(error?.status || 500);
        const safeStatus = [400, 401, 409, 503].includes(status) ? status : 500;
        console.error('gmailAuthCallback error:', error?.message || error);
        return new Response(safeStatus === 500 ? 'OAuth connection failed safely' : error.message, { status: safeStatus });
    }
});