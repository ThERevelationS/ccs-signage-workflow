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

    const CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
    const CLIENT_SECRET = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
    const REDIRECT_URI = 'https://app.base44.com/oauth/callback';

    if (action === 'getAuthUrl') {
      const scopes = [
        'https://www.googleapis.com/auth/drive.readonly',
        'email'
      ];
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes.join(' '))}&` +
        `access_type=offline&` +
        `prompt=consent`;
      
      return Response.json({ authUrl });
    }

    if (action === 'exchangeCode') {
      if (!code) {
        return Response.json({ error: 'Code is required' }, { status: 400 });
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        return Response.json({ error: 'Token exchange failed', details: error }, { status: 400 });
      }

      const tokens = await tokenResponse.json();
      
      // Store tokens for this user
      await base44.asServiceRole.entities.User.update(user.id, {
        google_drive_access_token: tokens.access_token,
        google_drive_refresh_token: tokens.refresh_token
      });

      return Response.json({ success: true });
    }

    if (action === 'listFiles') {
      if (!folderId) {
        return Response.json({ error: 'folderId is required' }, { status: 400 });
      }

      // Get stored token
      const userData = await base44.asServiceRole.entities.User.get(user.id);
      let accessToken = userData.google_drive_access_token;

      if (!accessToken) {
        return Response.json({ error: 'Not authenticated', needsAuth: true }, { status: 401 });
      }

      // List files in folder
      const listUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q='${folderId}'+in+parents&` +
        `fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)&` +
        `pageSize=100`;

      let response = await fetch(listUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // If token expired, try to refresh
      if (response.status === 401 && userData.google_drive_refresh_token) {
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: userData.google_drive_refresh_token,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token'
          })
        });

        if (refreshResponse.ok) {
          const newTokens = await refreshResponse.json();
          accessToken = newTokens.access_token;
          
          await base44.asServiceRole.entities.User.update(user.id, {
            google_drive_access_token: accessToken
          });

          response = await fetch(listUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
        }
      }

      if (!response.ok) {
        const error = await response.text();
        return Response.json({ error: 'Failed to fetch files', details: error }, { status: 400 });
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