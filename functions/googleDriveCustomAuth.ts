import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Step 1: Initiate OAuth flow
    if (action === 'initiate') {
      const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
      const redirectUri = `${url.origin}/functions/googleDriveCustomAuth?action=callback`;
      
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly email');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('state', user.email);

      return Response.redirect(authUrl.toString(), 302);
    }

    // Step 2: Handle OAuth callback
    if (action === 'callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      
      if (!code) {
        return new Response('Authorization failed', { status: 400 });
      }

      const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
      const redirectUri = `${url.origin}/functions/googleDriveCustomAuth?action=callback`;

      // Exchange code for tokens
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
      
      if (tokens.error) {
        return new Response(`Token error: ${tokens.error_description}`, { status: 400 });
      }

      // Store tokens for this user
      const existingUser = await base44.asServiceRole.entities.User.filter({ email: state });
      if (existingUser.length > 0) {
        await base44.asServiceRole.entities.User.update(existingUser[0].id, {
          google_drive_access_token: tokens.access_token,
          google_drive_refresh_token: tokens.refresh_token
        });
      }

      return new Response(`
        <html>
          <body>
            <h2>Google Drive Connected!</h2>
            <p>You can now close this window and return to the app.</p>
            <script>window.close();</script>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Step 3: List files in folder
    if (action === 'listFiles') {
      const body = await req.json();
      const { folderId } = body;

      if (!folderId) {
        return Response.json({ error: 'folderId required' }, { status: 400 });
      }

      // Get user's stored token
      const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
      if (users.length === 0 || !users[0].google_drive_access_token) {
        return Response.json({ error: 'Not authenticated', needsAuth: true }, { status: 401 });
      }

      let accessToken = users[0].google_drive_access_token;

      // List files in folder
      const filesUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)&pageSize=100`;
      let filesResponse = await fetch(filesUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // If token expired, refresh it
      if (filesResponse.status === 401 && users[0].google_drive_refresh_token) {
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: users[0].google_drive_refresh_token,
            client_id: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID'),
            client_secret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET'),
            grant_type: 'refresh_token'
          })
        });

        const newTokens = await refreshResponse.json();
        if (newTokens.access_token) {
          accessToken = newTokens.access_token;
          await base44.asServiceRole.entities.User.update(users[0].id, {
            google_drive_access_token: accessToken
          });

          filesResponse = await fetch(filesUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
        }
      }

      const filesData = await filesResponse.json();
      
      if (filesData.error) {
        return Response.json({ error: filesData.error.message }, { status: 400 });
      }

      return Response.json({ files: filesData.files || [] });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Function error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});