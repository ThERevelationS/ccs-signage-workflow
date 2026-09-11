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

    const { action, folderId, fileName, fileContent, fileType, fileId, expectedFileName, expectedModifiedTime } = await req.json();
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googledrive");

    switch (action) {
      case 'listFiles': {
        // With drive.file scope, we can only list files we created or user granted access to.
        // Validate an optional folder id before interpolating it into Drive's query language.
        const safeFolderId = String(folderId || '').trim();
        if (safeFolderId && !/^[a-zA-Z0-9_-]+$/.test(safeFolderId)) {
          return Response.json({ error: 'Invalid Google Drive folder id' }, { status: 400 });
        }
        let query = "trashed=false";
        if (safeFolderId) {
          query += ` and '${safeFolderId}' in parents`;
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
          await response.text().catch(() => '');
          // If we get a 403, it might be scope limitation.
          if (response.status === 403) {
            return Response.json({ 
              files: [], 
              notice: "Limited access: Can only see files created by this app. Use 'Open in Drive' to view all files." 
            });
          }
          console.error('Failed to list Google Drive files:', response.status);
          return Response.json({ error: 'Failed to list Google Drive files' }, { status: response.status });
        }
        
        const data = await response.json();
        return Response.json({ files: data.files || [] });
      }

      case 'createFolder': {
        const safeFolderId = String(folderId || '').trim();
        const safeFileName = String(fileName || '').trim();
        if (safeFolderId && !/^[a-zA-Z0-9_-]+$/.test(safeFolderId)) {
          return Response.json({ error: 'Invalid Google Drive parent folder id' }, { status: 400 });
        }
        if (!safeFileName) {
          return Response.json({ error: 'Folder name is required' }, { status: 400 });
        }
        const metadata = {
          name: safeFileName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: safeFolderId ? [safeFolderId] : []
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
          await response.text().catch(() => '');
          console.error('Failed to create Google Drive folder:', response.status);
          return Response.json({ error: 'Failed to create Google Drive folder' }, { status: response.status });
        }

        const folder = await response.json();
        return Response.json({ folder });
      }

      case 'uploadFile': {
        const safeFolderId = String(folderId || '').trim();
        const safeFileName = String(fileName || '').trim();
        if (safeFolderId && !/^[a-zA-Z0-9_-]+$/.test(safeFolderId)) {
          return Response.json({ error: 'Invalid Google Drive parent folder id' }, { status: 400 });
        }
        if (!safeFileName || typeof fileContent !== 'string') {
          return Response.json({ error: 'A file name and file content are required' }, { status: 400 });
        }

        // For multipart upload
        const metadata = {
          name: safeFileName,
          parents: safeFolderId ? [safeFolderId] : []
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
          await response.text().catch(() => '');
          console.error('Failed to upload Google Drive file:', response.status);
          return Response.json({ error: 'Failed to upload Google Drive file' }, { status: response.status });
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
        const safeFileId = String(fileId || '').trim();
        if (!safeFileId || !/^[a-zA-Z0-9_-]+$/.test(safeFileId)) {
          return Response.json({ error: 'Invalid Google Drive file id' }, { status: 400 });
        }

        const metadataUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(safeFileId)}?fields=id,name,modifiedTime,trashed&supportsAllDrives=true`;
        const readCurrentFile = async () => {
          const currentResponse = await fetch(metadataUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (currentResponse.status === 404) return null;
          if (!currentResponse.ok) {
            await currentResponse.text().catch(() => '');
            throw new Error(`Google Drive file verification failed with status ${currentResponse.status}`);
          }
          return await currentResponse.json();
        };

        let currentFile;
        try {
          currentFile = await readCurrentFile();
        } catch (verificationError) {
          console.error('Could not verify Google Drive file before delete:', verificationError?.message || verificationError);
          return Response.json({ error: 'Could not verify the Google Drive file before deleting it. Nothing was deleted.' }, { status: 502 });
        }

        if (!currentFile) {
          return Response.json({ success: true, alreadyDeleted: true });
        }

        const expectedName = String(expectedFileName || '').trim();
        const expectedModified = String(expectedModifiedTime || '').trim();
        if (expectedName && String(currentFile.name || '') !== expectedName) {
          return Response.json({ error: 'The Google Drive file was renamed after this list was loaded. Reload before deleting it.' }, { status: 409 });
        }
        if (expectedModified && String(currentFile.modifiedTime || '') !== expectedModified) {
          return Response.json({ error: 'The Google Drive file changed after this list was loaded. Reload before deleting it.' }, { status: 409 });
        }

        const deleteUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(safeFileId)}?supportsAllDrives=true`;
        let deleteResponse;
        try {
          deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
        } catch (deleteError) {
          // A network failure can happen after Google has already committed the
          // deletion. Reread the exact id before deciding whether retry is safe.
          try {
            const afterError = await readCurrentFile();
            if (!afterError) return Response.json({ success: true, recovered: true });
          } catch (verificationError) {
            console.error('Google Drive delete outcome is ambiguous:', verificationError?.message || verificationError);
            return Response.json({ error: 'The Google Drive delete outcome could not be verified. Reload Drive before trying again.' }, { status: 502 });
          }
          console.error('Google Drive delete failed before absence could be confirmed:', deleteError?.message || deleteError);
          return Response.json({ error: 'The Google Drive file was not confirmed deleted. Reload before trying again.' }, { status: 502 });
        }

        if (deleteResponse.status === 404) {
          return Response.json({ success: true, alreadyDeleted: true });
        }
        if (!deleteResponse.ok && deleteResponse.status !== 204) {
          await deleteResponse.text().catch(() => '');
          console.error('Google Drive delete failed:', deleteResponse.status);
          return Response.json({ error: 'Failed to delete Google Drive file' }, { status: deleteResponse.status });
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