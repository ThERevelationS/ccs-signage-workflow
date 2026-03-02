import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { jurisdictionIds } = await req.json();

    // Get access token for Google Drive
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    if (!accessToken) {
      return Response.json({ error: 'Google Drive not authorized' }, { status: 401 });
    }

    // Get or create Permitting Repository folder
    const rootFolder = await createOrGetFolder('Permitting Repository', null, accessToken);

    if (!rootFolder) {
      return Response.json({ error: 'Could not access Permitting Repository folder' }, { status: 500 });
    }

    let foldersCreated = 0;
    let filesUploaded = 0;

    // Get jurisdictions to backup
    let jurisdictions = [];
    if (jurisdictionIds && jurisdictionIds.length > 0) {
      for (const id of jurisdictionIds) {
        const j = await base44.entities.JurisdictionProfile.get(id);
        if (j) jurisdictions.push(j);
      }
    } else {
      jurisdictions = await base44.entities.JurisdictionProfile.list();
    }

    // Backup each jurisdiction
    for (const jurisdiction of jurisdictions) {
      try {
        // Create jurisdiction folder
        const jurisdictionFolderName = `${jurisdiction.name} - ${jurisdiction.state}`;
        const jurisdictionFolder = await createOrGetFolder(jurisdictionFolderName, rootFolder.id, accessToken);

        if (jurisdictionFolder) {
          foldersCreated++;

          // Backup documents
          if (jurisdiction.documents && Array.isArray(jurisdiction.documents)) {
            for (const doc of jurisdiction.documents) {
              try {
                if (doc.file_url) {
                  // Download and reupload the file
                  const fileName = doc.title + '.pdf';
                  const response = await fetch(doc.file_url);
                  const blob = await response.blob();

                  const formData = new FormData();
                  formData.append('file', blob, fileName);
                  formData.append('parents', JSON.stringify([jurisdictionFolder.id]));

                  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`
                    },
                    body: formData
                  });

                  if (uploadRes.ok) {
                    filesUploaded++;
                  }
                }
              } catch (e) {
                console.error(`Error uploading document ${doc.title}:`, e);
              }
            }
          }

          // Backup jurisdiction metadata as JSON
          try {
            const metadata = {
              id: jurisdiction.id,
              name: jurisdiction.name,
              state: jurisdiction.state,
              type: jurisdiction.type,
              website_url: jurisdiction.website_url,
              permitting_url: jurisdiction.permitting_url,
              ai_summary: jurisdiction.ai_summary,
              contact_info: jurisdiction.contact_info,
              permit_requirements: jurisdiction.permit_requirements,
              sqft_width_height_rules: jurisdiction.sqft_width_height_rules,
              height_allowances: jurisdiction.height_allowances,
              setback_rules: jurisdiction.setback_rules,
              lighting_allowances: jurisdiction.lighting_allowances,
              parent_county: jurisdiction.parent_county,
              last_updated: new Date().toISOString()
            };

            const metadataContent = JSON.stringify(metadata, null, 2);
            const metadataBlob = new Blob([metadataContent], { type: 'application/json' });

            const formData = new FormData();
            formData.append('file', metadataBlob, 'jurisdiction_metadata.json');
            formData.append('parents', JSON.stringify([jurisdictionFolder.id]));

            const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`
              },
              body: formData
            });

            if (uploadRes.ok) {
              filesUploaded++;
            }
          } catch (e) {
            console.error(`Error uploading metadata for ${jurisdiction.name}:`, e);
          }
        }
      } catch (e) {
        console.error(`Error backing up jurisdiction ${jurisdiction.id}:`, e);
      }
    }

    return Response.json({
      success: true,
      foldersCreated,
      filesUploaded,
      jurisdictionsProcessed: jurisdictions.length
    });
  } catch (error) {
    console.error("Backup error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function createOrGetFolder(folderName, parentId, accessToken) {
  try {
    // Search for existing folder
    const query = parentId
      ? `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)&pageSize=1`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0];
    }

    // Create new folder
    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    if (parentId) {
      metadata.parents = [parentId];
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    const folder = await createRes.json();
    return folder;
  } catch (e) {
    console.error(`Error creating/getting folder ${folderName}:`, e);
    return null;
  }
}