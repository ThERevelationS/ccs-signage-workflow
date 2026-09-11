import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const MAX_INLINE_DOWNLOAD_BYTES = 5 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

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
        const safeFileId = String(fileId || '').trim();
        if (!safeFileId || !/^[a-zA-Z0-9_-]+$/.test(safeFileId)) {
          return Response.json({ error: 'Invalid Google Drive file id' }, { status: 400 });
        }

        // Resolve metadata on the server. The browser must never receive the
        // Google OAuth access token just to download a file.
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(safeFileId)}?fields=id,name,mimeType,webViewLink,size`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!response.ok) {
          await response.text().catch(() => '');
          console.error('Failed to get Google Drive file metadata:', response.status);
          return Response.json({ error: 'Failed to get Google Drive file metadata' }, { status: response.status });
        }

        const file = await response.json();
        const viewUrl = file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(safeFileId)}/view`;

        // Google-native files must be opened in Drive. Large regular files also
        // use the Drive view so this JSON function never serializes huge blobs.
        const declaredSize = Number(file.size || 0);
        if (file.mimeType?.startsWith('application/vnd.google-apps') || declaredSize > MAX_INLINE_DOWNLOAD_BYTES) {
          return Response.json({
            url: viewUrl,
            type: 'view',
            fileName: file.name,
            reason: declaredSize > MAX_INLINE_DOWNLOAD_BYTES ? 'large_file' : 'google_native'
          });
        }

        const downloadResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(safeFileId)}?alt=media`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!downloadResponse.ok) {
          await downloadResponse.text().catch(() => '');
          console.error('Failed to download Google Drive file:', downloadResponse.status);
          return Response.json({ error: 'Failed to download Google Drive file' }, { status: downloadResponse.status });
        }

        const bytes = new Uint8Array(await downloadResponse.arrayBuffer());
        if (bytes.byteLength > MAX_INLINE_DOWNLOAD_BYTES) {
          return Response.json({
            url: viewUrl,
            type: 'view',
            fileName: file.name,
            reason: 'large_file'
          });
        }

        return Response.json({
          type: 'download_data',
          fileName: file.name,
          mimeType: file.mimeType || 'application/octet-stream',
          base64: bytesToBase64(bytes)
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