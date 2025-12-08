import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { folderId } = await req.json();
    
    if (!folderId) {
      return Response.json({ error: 'folderId is required' }, { status: 400 });
    }

    // Get access token
    let accessToken = user.google_drive_access_token;
    const tokenExpiry = user.google_drive_token_expiry;

    // Refresh token if expired
    if (!accessToken || !tokenExpiry || Date.now() >= tokenExpiry) {
      const refreshResult = await base44.functions.invoke('googleDriveAuth', { 
        action: 'refreshToken' 
      });
      accessToken = refreshResult.data.access_token;
    }

    if (!accessToken) {
      return Response.json({ 
        error: 'Not authenticated with Google Drive',
        needsAuth: true 
      }, { status: 401 });
    }

    // List files in folder
    const url = `https://www.googleapis.com/drive/v3/files?` +
      `q='${folderId}' in parents and trashed=false&` +
      `fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)&` +
      `orderBy=name`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      return Response.json({ 
        error: error.error?.message || 'Failed to list files',
        needsAuth: response.status === 401
      }, { status: response.status });
    }

    const data = await response.json();
    return Response.json({ files: data.files || [] });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});