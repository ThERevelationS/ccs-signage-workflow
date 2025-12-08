import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await req.json();

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const redirectUri = `${new URL(req.url).origin}/api/googleDriveCallback`;

    if (!clientId || !clientSecret) {
      return Response.json({ error: 'Google OAuth credentials not configured' }, { status: 500 });
    }

    if (action === 'getAuthUrl') {
      const scopes = [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email'
      ];
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes.join(' '))}&` +
        `access_type=offline&` +
        `state=${user.email}`;

      return Response.json({ authUrl });
    }

    if (action === 'exchangeCode') {
      const { code } = await req.json();
      
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
      
      if (!tokenResponse.ok) {
        return Response.json({ error: tokens.error_description || 'Failed to exchange code' }, { status: 400 });
      }

      // Store tokens in user's data
      await base44.auth.updateMe({
        google_drive_access_token: tokens.access_token,
        google_drive_refresh_token: tokens.refresh_token,
        google_drive_token_expiry: Date.now() + (tokens.expires_in * 1000)
      });

      return Response.json({ success: true });
    }

    if (action === 'refreshToken') {
      const currentUser = await base44.auth.me();
      const refreshToken = currentUser.google_drive_refresh_token;

      if (!refreshToken) {
        return Response.json({ error: 'No refresh token available' }, { status: 400 });
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token'
        })
      });

      const tokens = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        return Response.json({ error: 'Failed to refresh token' }, { status: 400 });
      }

      await base44.auth.updateMe({
        google_drive_access_token: tokens.access_token,
        google_drive_token_expiry: Date.now() + (tokens.expires_in * 1000)
      });

      return Response.json({ access_token: tokens.access_token });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});