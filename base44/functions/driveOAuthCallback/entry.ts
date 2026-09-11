import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { verifyOAuthState } from '../../shared/oauthState.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!code || !state) {
      return new Response('Authorization failed', { status: 400 });
    }
    const identity = await verifyOAuthState(state, 'drive_oauth');

    const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
    const redirectUri = `${url.origin}/api/functions/driveOAuthCallback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();
    
    if (!tokens.access_token) {
      return new Response('Failed to get access token', { status: 500 });
    }

    // Store tokens only for the exact user identity that initiated this OAuth flow.
    const users = await base44.asServiceRole.entities.User.filter({ email: identity.email });
    if (!Array.isArray(users) || users.length !== 1 || String(users[0]?.id || '') !== identity.userId) {
      return new Response('OAuth user identity could not be verified', { status: users?.length > 1 ? 409 : 401 });
    }
    await base44.asServiceRole.entities.User.update(users[0].id, {
      google_drive_access_token: tokens.access_token,
      google_drive_refresh_token: tokens.refresh_token
    });

    return new Response(`
      <html>
        <body>
          <h2>Google Drive Connected!</h2>
          <p>You can close this window and return to the app.</p>
          <script>window.close();</script>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 409, 503].includes(status) ? status : 500;
    console.error('driveOAuthCallback error:', error?.message || error);
    return new Response(safeStatus === 500 ? 'OAuth connection failed safely' : error.message, { status: safeStatus });
  }
});