import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse body once at the start
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    
    const { action, code, folderId, userEmail } = body;

    console.log('Action:', action, 'Code:', !!code, 'UserEmail:', userEmail);

    // exchangeCode doesn't need auth since it uses service role with userEmail from OAuth state
    if (action === 'exchangeCode') {
      if (!userEmail || !code) {
        return Response.json({ 
          error: 'User email and code required', 
          received: { hasUserEmail: !!userEmail, hasCode: !!code } 
        }, { status: 400 });
      }

      const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
      const redirectUri = 'https://clay-flow-signage-suite-387da97c.base44.app/GoogleDriveCallback';

      console.log('Exchanging code for tokens...');

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      });

      const tokens = await tokenResponse.json();
      console.log('Token response:', { hasAccessToken: !!tokens.access_token, error: tokens.error });
      
      if (!tokens.access_token) {
        return Response.json({ 
          error: 'Failed to get access token', 
          details: tokens 
        }, { status: 400 });
      }

      // Find user by email and update their tokens using service role
      const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
      if (users.length === 0) {
        return Response.json({ error: 'User not found' }, { status: 404 });
      }

      await base44.asServiceRole.entities.User.update(users[0].id, {
        google_drive_token: tokens.access_token,
        google_drive_refresh_token: tokens.refresh_token
      });

      console.log('Successfully stored tokens for user:', userEmail);
      return Response.json({ success: true });
    }

    // Other actions require authentication
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
      // Get stored token
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
    console.error('Error in googleDriveAuth:', error);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});