import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const body = await req.json();
    const { action, code, folderId, userEmail } = body;

    // Handle token exchange - doesn't need user auth
    if (action === 'exchangeCode') {
      if (!userEmail || !code) {
        return Response.json({ 
          error: 'Missing required parameters',
          hasUserEmail: !!userEmail,
          hasCode: !!code
        }, { status: 400 });
      }

      const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
      
      if (!clientId || !clientSecret) {
        return Response.json({ error: 'Google Drive credentials not configured' }, { status: 500 });
      }

      const redirectUri = 'https://clay-flow-signage-suite-387da97c.base44.app/GoogleDriveCallback';

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      });

      const tokens = await tokenResponse.json();
      
      if (!tokens.access_token) {
        return Response.json({ 
          error: 'Google token exchange failed',
          details: tokens
        }, { status: 400 });
      }

      // Store tokens for user
      const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
      if (users.length === 0) {
        return Response.json({ error: 'User not found' }, { status: 404 });
      }

      await base44.asServiceRole.entities.User.update(users[0].id, {
        google_drive_token: tokens.access_token,
        google_drive_refresh_token: tokens.refresh_token
      });

      return Response.json({ success: true });
    }

    // All other actions need authentication
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'getAuthUrl') {
      const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
      const redirectUri = 'https://clay-flow-signage-suite-387da97c.base44.app/GoogleDriveCallback';
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.readonly')}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${user.email}`;
      
      return Response.json({ authUrl });
    }

    if (action === 'listFiles') {
      const userData = await base44.asServiceRole.entities.User.filter({ email: user.email });
      const token = userData[0]?.google_drive_token;

      if (!token) {
        return Response.json({ error: 'Not authenticated with Google Drive' }, { status: 401 });
      }

      const filesUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)&pageSize=100`;
      
      const filesResponse = await fetch(filesUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!filesResponse.ok) {
        const error = await filesResponse.text();
        return Response.json({ error: `Google Drive API error: ${error}` }, { status: filesResponse.status });
      }

      const data = await filesResponse.json();
      return Response.json({ files: data.files || [] });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    return Response.json({ 
      error: 'Server error',
      message: error.message 
    }, { status: 500 });
  }
});