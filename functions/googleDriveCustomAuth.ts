import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, folderId, code } = body;

    const CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
    const CLIENT_SECRET = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
    const REDIRECT_URI = `${new URL(req.url).origin}/api/functions/googleDriveCustomAuth`;

    if (action === 'getAuthUrl') {
      const scopes = [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email'
      ];
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes.join(' '))}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${user.email}`;

      return Response.json({ authUrl });
    }

    if (action === 'handleCallback') {
      if (!code) {
        return Response.json({ error: 'No code provided' }, { status: 400 });
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

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        return Response.json({ error: tokenData.error_description || tokenData.error }, { status: 400 });
      }

      // Store tokens in user entity
      await base44.asServiceRole.entities.User.update(user.id, {
        google_drive_access_token: tokenData.access_token,
        google_drive_refresh_token: tokenData.refresh_token,
        google_drive_token_expiry: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      });

      return Response.json({ success: true });
    }

    if (action === 'listFiles') {
      if (!folderId) {
        return Response.json({ error: 'folderId is required' }, { status: 400 });
      }

      // Get user's stored token
      const userData = await base44.asServiceRole.entities.User.get(user.id);
      let accessToken = userData.google_drive_access_token;

      // Check if token expired and refresh if needed
      if (userData.google_drive_token_expiry && new Date(userData.google_drive_token_expiry) < new Date()) {
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: userData.google_drive_refresh_token,
            grant_type: 'refresh_token'
          })
        });

        const refreshData = await refreshResponse.json();
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          await base44.asServiceRole.entities.User.update(user.id, {
            google_drive_access_token: accessToken,
            google_drive_token_expiry: new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString()
          });
        }
      }

      if (!accessToken) {
        return Response.json({ error: 'Not authenticated', needsAuth: true }, { status: 401 });
      }

      // List files in folder
      const filesUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)&pageSize=100`;
      
      const filesResponse = await fetch(filesUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!filesResponse.ok) {
        const error = await filesResponse.text();
        return Response.json({ error: `Failed to list files: ${error}` }, { status: filesResponse.status });
      }

      const filesData = await filesResponse.json();
      return Response.json({ files: filesData.files || [] });
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