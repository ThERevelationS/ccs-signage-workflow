import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const body = await req.json();
    const { action, folderId } = body;

    if (action === 'listFiles') {
      // Get the access token from the Base44 connector
      const accessToken = await base44.asServiceRole.connectors.getAccessToken("googledrive");
      
      if (!accessToken) {
        return Response.json({ error: 'Not authenticated with Google Drive' }, { status: 401 });
      }

      const filesUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink)&pageSize=100`;
      
      const filesResponse = await fetch(filesUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
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