import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { mergeWorkOrderArrayValues } from '../../shared/workOrderFieldPersistence.mjs';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, workOrderId, fileIds } = body;

    if (action === 'getPickerToken') {
      return Response.json({
        error: 'Direct Google Drive OAuth token export is disabled. Use the server-side Google Drive operations instead.'
      }, { status: 410 });
    }

    if (action === 'saveFileAccess') {
      if (!workOrderId || !fileIds || !Array.isArray(fileIds)) {
        return Response.json({ error: 'Missing workOrderId or fileIds' }, { status: 400 });
      }

      const saved = await mergeWorkOrderArrayValues({
        entity: base44.asServiceRole.entities.WorkOrder,
        workOrderId,
        field: 'google_drive_file_ids',
        values: fileIds,
        label: 'Google Drive file access merge',
      });

      return Response.json({ success: true, fileIds: saved.google_drive_file_ids || [] });
    }

    if (action === 'listFiles') {
      if (!workOrderId) {
        return Response.json({ error: 'workOrderId is required' }, { status: 400 });
      }
      
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      const accessToken = conn.accessToken;

      if (!accessToken) {
        return Response.json({ error: 'Not authenticated with Google Drive' }, { status: 401 });
      }

      const workOrder = await base44.asServiceRole.entities.WorkOrder.get(workOrderId);
      const fileIds = workOrder?.google_drive_file_ids || [];

      if (fileIds.length === 0) {
        return Response.json({ files: [] });
      }

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