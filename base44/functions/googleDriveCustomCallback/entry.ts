import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { verifyOAuthState } from '../../shared/oauthState.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!code || !state) {
      return new Response('Missing code or state', { status: 400 });
    }
    const identity = await verifyOAuthState(state, 'google_drive_custom');

    const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
    const redirectUri = `${url.origin}/functions/googleDriveCustomCallback`;

    // Exchange code for token
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

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange failed:', error);
      return new Response(`Token exchange failed: ${error}`, { status: 500 });
    }

    const tokens = await tokenResponse.json();
    
    // Bind the OAuth result only to the exact user who initiated the flow.
    const users = await base44.asServiceRole.entities.User.filter({ email: identity.email });
    if (!Array.isArray(users) || users.length !== 1 || String(users[0]?.id || '') !== identity.userId) {
      return new Response('OAuth user identity could not be verified', { status: users?.length > 1 ? 409 : 401 });
    }
    await base44.asServiceRole.entities.User.update(users[0].id, {
      google_drive_token: tokens.access_token,
      google_drive_refresh_token: tokens.refresh_token
    });

    // Redirect back to app
    return new Response(
      '<html><body><script>window.opener.postMessage({type:"google_drive_auth_success"},"*");window.close();</script></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
    
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 409, 503].includes(status) ? status : 500;
    console.error('googleDriveCustomCallback error:', error?.message || error);
    return new Response(safeStatus === 500 ? 'OAuth connection failed safely' : error.message, { status: safeStatus });
  }
});