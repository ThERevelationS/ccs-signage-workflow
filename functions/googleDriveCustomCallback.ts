import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // user email
    
    if (!code || !state) {
      return new Response('Missing code or state', { status: 400 });
    }

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
    
    // Store access token in user record
    const users = await base44.asServiceRole.entities.User.list();
    const user = users.find(u => u.email === state);
    
    if (user) {
      await base44.asServiceRole.entities.User.update(user.id, {
        google_drive_token: tokens.access_token,
        google_drive_refresh_token: tokens.refresh_token
      });
    }

    // Redirect back to app
    return new Response(
      '<html><body><script>window.opener.postMessage({type:"google_drive_auth_success"},"*");window.close();</script></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
    
  } catch (error) {
    console.error('Callback error:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});