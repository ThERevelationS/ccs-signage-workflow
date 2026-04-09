import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, folderId, fileName, fileContent, fileType, fileId } = await req.json();
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googledrive");

    switch (action) {
      case 'listFiles': {
        // With drive.file scope, we can only list files we created or user granted access to
        // Try to list files in the folder - this works for shared folders user has access to
        let query = "trashed=false";
        if (folderId) {
          query += ` and '${folderId}' in parents`;
        }
        
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,iconLink)&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          // If we get a 403, it might be scope limitation
          if (response.status === 403) {
            return Response.json({ 
              files: [], 
              notice: "Limited access: Can only see files created by this app. Use 'Open in Drive' to view all files." 
            });
          }
          return Response.json({ error: `Failed to list files: ${errorText}` }, { status: response.status });
        }
        
        const data = await response.json();
        return Response.json({ files: data.files || [] });
      }

      case 'createFolder': {
        const metadata = {
          name: fileName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: folderId ? [folderId] : []
        };

        const response = await fetch(
          'https://www.googleapis.com/drive/v3/files',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(metadata)
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return Response.json({ error: `Failed to create folder: ${error}` }, { status: response.status });
        }

        const folder = await response.json();
        return Response.json({ folder });
      }

      case 'uploadFile': {
        // For multipart upload
        const metadata = {
          name: fileName,
          parents: folderId ? [folderId] : []
        };

        // Decode base64 content
        const binaryContent = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
        
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelimiter = "\r\n--" + boundary + "--";

        const metadataStr = JSON.stringify(metadata);
        
        // Build multipart body
        const encoder = new TextEncoder();
        const part1 = encoder.encode(
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          metadataStr +
          delimiter +
          'Content-Type: ' + (fileType || 'application/octet-stream') + '\r\n' +
          'Content-Transfer-Encoding: base64\r\n\r\n'
        );
        const part2 = binaryContent;
        const part3 = encoder.encode(closeDelimiter);

        const body = new Uint8Array(part1.length + part2.length + part3.length);
        body.set(part1, 0);
        body.set(part2, part1.length);
        body.set(part3, part1.length + part2.length);

        const response = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'multipart/related; boundary=' + boundary
            },
            body: body
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return Response.json({ error: `Failed to upload file: ${error}` }, { status: response.status });
        }

        const file = await response.json();
        return Response.json({ file });
      }

      case 'getDownloadUrl': {
        // Get file metadata with download link
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webContentLink,webViewLink`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return Response.json({ error: `Failed to get file: ${error}` }, { status: response.status });
        }

        const file = await response.json();
        
        // For Google Docs/Sheets/etc, return view link
        // For regular files, return download link
        if (file.mimeType?.startsWith('application/vnd.google-apps')) {
          return Response.json({ url: file.webViewLink, type: 'view' });
        }
        
        // Generate download URL
        return Response.json({ 
          url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          accessToken,
          type: 'download',
          fileName: file.name,
          mimeType: file.mimeType
        });
      }

      case 'deleteFile': {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!response.ok && response.status !== 204) {
          const error = await response.text();
          return Response.json({ error: `Failed to delete file: ${error}` }, { status: response.status });
        }

        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});