import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, folderId, workOrderId, fileIds } = body;

    if (action === 'getPickerToken') {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
      return Response.json({ token: accessToken });
    }

    if (action === 'saveFileAccess') {
      // Store file IDs that user granted access to
      if (!workOrderId || !fileIds) {
        return Response.json({ error: 'Missing workOrderId or fileIds' }, { status: 400 });
      }

      const workOrder = await base44.entities.WorkOrder.get(workOrderId);
      const existingFiles = workOrder.google_drive_file_ids || [];
      const updatedFiles = [...new Set([...existingFiles, ...fileIds])];

      await base44.entities.WorkOrder.update(workOrderId, {
        google_drive_file_ids: updatedFiles
      });

      return Response.json({ success: true });
    }

    if (action === 'listFiles') {
      if (!workOrderId) {
        return Response.json({ error: 'workOrderId is required' }, { status: 400 });
      }
      
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

      if (!accessToken) {
        return Response.json({ error: 'Not authenticated with Google Drive. Please connect via Dashboard > Settings > App Connectors' }, { status: 401 });
      }

      // Get file IDs that user has granted access to
      const workOrder = await base44.entities.WorkOrder.get(folderId); // Using folderId as workOrderId here
      const fileIds = workOrder?.google_drive_file_ids || [];

      if (fileIds.length === 0) {
        return Response.json({ files: [] });
      }

      // Fetch details for each file
      const filePromises = fileIds.map(async (fileId) => {
        try {
          const fileUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,size,thumbnailLink,webViewLink`;
          const response = await fetch(fileUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (response.ok) {
            return await response.json();
          }
          return null;
        } catch (e) {
          return null;
        }
      });

      const files = (await Promise.all(filePromises)).filter(f => f !== null);
      return Response.json({ files });
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