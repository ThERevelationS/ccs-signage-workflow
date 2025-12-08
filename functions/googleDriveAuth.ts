import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, folderId } = body;

    if (action === 'listFiles') {
      // Get token from Base44's googledrive connector
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

      if (!accessToken) {
        return Response.json({ error: 'Not authenticated with Google Drive. Please connect via Dashboard > Settings > App Connectors' }, { status: 401 });
      }

      // Instead of listing folder, try to get specific file IDs from the folder URL
      // For now, just try to access the folder metadata to verify permissions
      const folderUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,capabilities`;
      
      const folderResponse = await fetch(folderUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!folderResponse.ok) {
        const error = await folderResponse.text();
        return Response.json({ 
          error: `Cannot access this folder with current permissions. The drive.file scope only allows access to files created by this app or explicitly opened by you.`,
          details: error,
          suggestion: 'Share individual files with the app or use a service account'
        }, { status: folderResponse.status });
      }

      const folderData = await folderResponse.json();
      
      // With drive.file scope, we can't list arbitrary folders
      // Return a message explaining the limitation
      return Response.json({ 
        files: [],
        warning: 'Limited access: Base44\'s Google Drive connector uses drive.file scope, which only allows access to files created by or opened by this app. To see all folder files, they must be individually shared with the app.',
        folder: folderData
      });
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