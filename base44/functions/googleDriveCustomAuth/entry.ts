import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'initiate') {
      const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
      const redirectUri = `${url.origin}/functions/googleDriveCustomCallback`;
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.readonly email')}&` +
        `access_type=offline&` +
        `state=${user.email}`;

      return Response.json({ authUrl });
    }

    if (action === 'listFiles') {
      const body = await req.json();
      const { folderId } = body;

      // Get stored access token for this user
      const userRecord = await base44.asServiceRole.entities.User.list();
      const currentUser = userRecord.find(u => u.email === user.email);
      const accessToken = currentUser?.google_drive_token;

      if (!accessToken) {
        return Response.json({ 
          error: 'Not authenticated',
          needsAuth: true 
        }, { status: 401 });
      }

      // List files in folder
      const listUrl = folderId 
        ? `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)`
        : `https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)`;

      const response = await fetch(listUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        if (response.status === 401) {
          return Response.json({ 
            error: 'Token expired',
            needsAuth: true 
          }, { status: 401 });
        }
        throw new Error(`Failed to list files: ${response.statusText}`);
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