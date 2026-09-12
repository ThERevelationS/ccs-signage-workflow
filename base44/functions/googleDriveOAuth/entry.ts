import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, code, folderId } = body || {};

    const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
    const redirectUri = `${new URL(req.url).origin}/api/functions/googleDriveOAuth`;

    if (action === 'getAuthUrl') {
      const scopes = [
        'https://www.googleapis.com/auth/drive.readonly',
        'email'
      ].join(' ');

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${user.email}`;

      return Response.json({ authUrl });
    }

    if (action === 'exchangeCode') {
      if (!code || typeof code !== 'string' || code.length > 4096) {
        return Response.json({ error: 'A valid authorization code is required' }, { status: 400 });
      }
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      const tokens = await tokenResponse.json().catch(() => ({}));
      
      if (!tokenResponse.ok || tokens.error || !tokens.access_token) {
        console.error('googleDriveOAuth token exchange failed:', tokenResponse.status);
        return Response.json({ error: 'Google Drive authorization code could not be exchanged' }, { status: 502 });
      }

      // Store tokens in user entity
      await base44.asServiceRole.entities.User.update(user.id, {
        google_drive_access_token: tokens.access_token,
        google_drive_refresh_token: tokens.refresh_token,
        google_drive_token_expiry: Date.now() + (tokens.expires_in * 1000)
      });

      return Response.json({ success: true });
    }

    if (action === 'listFiles') {
      const safeFolderId = String(folderId || '').trim();
      if (!safeFolderId || !/^[a-zA-Z0-9_-]+$/.test(safeFolderId)) {
        return Response.json({ error: 'A valid folderId is required' }, { status: 400 });
      }
      const userData = await base44.asServiceRole.entities.User.get(user.id);
      let accessToken = userData.google_drive_access_token;
      
      // Refresh token if expired
      if (Date.now() >= (userData.google_drive_token_expiry || 0)) {
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: userData.google_drive_refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token'
          })
        });

        const tokens = await refreshResponse.json().catch(() => ({}));
        if (!refreshResponse.ok || !tokens.access_token) {
          console.error('googleDriveOAuth token refresh failed:', refreshResponse.status);
          return Response.json({ error: 'Google Drive authentication must be renewed', needsAuth: true }, { status: 401 });
        }
        accessToken = tokens.access_token;

        await base44.asServiceRole.entities.User.update(user.id, {
          google_drive_access_token: tokens.access_token,
          google_drive_token_expiry: Date.now() + (Number(tokens.expires_in || 0) * 1000)
        });
      }

      if (!accessToken) {
        return Response.json({ error: 'Not authenticated', needsAuth: true }, { status: 401 });
      }

      // List files in folder
      let query = `'${safeFolderId}' in parents and trashed=false`;
      const fileUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)&pageSize=1000`;
      
      const response = await fetch(fileUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        await response.text().catch(() => '');
        console.error('googleDriveOAuth file listing failed:', response.status);
        return Response.json({ error: 'Google Drive files could not be listed safely' }, { status: response.status >= 500 ? 502 : response.status });
      }

      const data = await response.json();
      return Response.json({ files: data.files || [] });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('googleDriveOAuth error:', error?.message || error);
    return Response.json({ error: 'Google Drive request could not be completed safely' }, { status: 500 });
  }
});