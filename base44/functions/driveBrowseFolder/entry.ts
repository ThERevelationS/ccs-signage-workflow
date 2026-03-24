import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { folderId } = body;

    if (!folderId) {
      return Response.json({ error: 'folderId required' }, { status: 400 });
    }

    // Get user's tokens
    const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
    const userData = users[0];
    
    if (!userData?.google_drive_access_token) {
      return Response.json({ error: 'Not authenticated', needsAuth: true }, { status: 401 });
    }

    // List files in folder
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)`;
    
    const response = await fetch(listUrl, {
      headers: { 'Authorization': `Bearer ${userData.google_drive_access_token}` }
    });

    if (!response.ok) {
      // Try to refresh token if expired
      if (response.status === 401 && userData.google_drive_refresh_token) {
        const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
        const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
        
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: userData.google_drive_refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token'
          })
        });

        const newTokens = await refreshResponse.json();
        if (newTokens.access_token) {
          await base44.asServiceRole.entities.User.update(userData.id, {
            google_drive_access_token: newTokens.access_token
          });

          // Retry with new token
          const retryResponse = await fetch(listUrl, {
            headers: { 'Authorization': `Bearer ${newTokens.access_token}` }
          });
          const data = await retryResponse.json();
          return Response.json({ files: data.files || [] });
        }
      }
      
      return Response.json({ error: 'Failed to fetch files', needsAuth: true }, { status: 401 });
    }

    const data = await response.json();
    return Response.json({ files: data.files || [] });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});