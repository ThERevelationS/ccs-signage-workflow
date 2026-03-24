import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, code, folderId } = body;

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

      const tokens = await tokenResponse.json();
      
      if (tokens.error) {
        return Response.json({ error: tokens.error }, { status: 400 });
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

        const tokens = await refreshResponse.json();
        accessToken = tokens.access_token;

        await base44.asServiceRole.entities.User.update(user.id, {
          google_drive_access_token: tokens.access_token,
          google_drive_token_expiry: Date.now() + (tokens.expires_in * 1000)
        });
      }

      if (!accessToken) {
        return Response.json({ error: 'Not authenticated', needsAuth: true }, { status: 401 });
      }

      // List files in folder
      let query = `'${folderId}' in parents and trashed=false`;
      const fileUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)&pageSize=1000`;
      
      const response = await fetch(fileUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        const error = await response.text();
        return Response.json({ error: `Google API error: ${error}` }, { status: response.status });
      }

      const data = await response.json();
      return Response.json({ files: data.files || [] });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('Function error:', error);
    return Response.json({ 
      error: 'Server error',
      message: error.message 
    }, { status: 500 });
  }
});