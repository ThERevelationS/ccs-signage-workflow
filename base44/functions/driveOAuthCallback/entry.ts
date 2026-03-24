import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // user email
    
    if (!code) {
      return new Response('Authorization failed', { status: 400 });
    }

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

    // Store tokens in user entity
    const users = await base44.asServiceRole.entities.User.filter({ email: state });
    if (users.length > 0) {
      await base44.asServiceRole.entities.User.update(users[0].id, {
        google_drive_access_token: tokens.access_token,
        google_drive_refresh_token: tokens.refresh_token
      });
    }

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
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});