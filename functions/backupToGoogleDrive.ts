import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

const GlobalSettings = 'GlobalSettings';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // For scheduled backups, we won't have user auth, so use service role
    let isScheduledBackup = false;
    let user = null;
    
    try {
      user = await base44.auth.me();
    } catch (e) {
      // This might be a scheduled call without user auth
      isScheduledBackup = true;
    }

    // If not scheduled and not admin, deny
    if (!isScheduledBackup && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { dataTypes, folderId, action } = body;
    
    // Get Google Drive access token
    let accessToken;
    try {
      accessToken = await base44.asServiceRole.connectors.getAccessToken("googledrive");
    } catch (e) {
      return Response.json({ error: 'Google Drive not connected. Please reconnect Google Drive in settings.' }, { status: 400 });
    }
    
    if (!accessToken) {
      return Response.json({ error: 'Google Drive access token not available. Please reconnect Google Drive.' }, { status: 400 });
    }

    // Action: List folders for folder picker
    if (action === 'listFolders') {
      const parentId = body.parentId || 'root';
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${parentId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&orderBy=name`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      if (!response.ok) {
        const errText = await response.text();
        console.error("Drive list folders error:", errText);
        return Response.json({ error: 'Failed to list folders', details: errText }, { status: 500 });
      }
      
      const data = await response.json();
      return Response.json({ folders: data.files || [] });
    }

    // Action: Create a new folder
    if (action === 'createFolder') {
      const { folderName, parentId } = body;
      const metadata = {
        name: folderName || 'SignShop Backups',
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined
      };
      
      const response = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });
      
      if (!response.ok) {
        const errText = await response.text();
        console.error("Drive create folder error:", errText);
        return Response.json({ error: 'Failed to create folder', details: errText }, { status: 500 });
      }
      
      const folder = await response.json();
      return Response.json({ folder });
    }

    // Action: Save backup settings
    if (action === 'saveSettings') {
      const { settings } = body;
      const existing = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'backupSettings' });
      
      if (existing.length > 0) {
        await base44.asServiceRole.entities.GlobalSettings.update(existing[0].id, { setting_value: settings });
      } else {
        await base44.asServiceRole.entities.GlobalSettings.create({ setting_key: 'backupSettings', setting_value: settings });
      }
      
      return Response.json({ success: true, message: 'Backup settings saved' });
    }

    // Action: Get backup settings
    if (action === 'getSettings') {
      const existing = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'backupSettings' });
      return Response.json({ settings: existing[0]?.setting_value || null });
    }

    // Default action: Perform backup
    // Get saved folder ID if not provided
    let targetFolderId = folderId;
    if (!targetFolderId) {
      const settings = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'backupSettings' });
      targetFolderId = settings[0]?.setting_value?.folderId;
    }

    // Get data types to backup - for scheduled, use saved settings
    let typesToBackup = dataTypes;
    if (!typesToBackup || typesToBackup.length === 0) {
      const settings = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'backupSettings' });
      typesToBackup = settings[0]?.setting_value?.dataTypes || ['users', 'timeclock', 'orders', 'workorders', 'timeoff', 'pto'];
    }
    
    const results = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
    
    // Helper to create Excel file and upload to Drive
    const uploadToGoogleDrive = async (data, filename) => {
      if (!data || data.length === 0) {
        return { name: `${filename}_${timestamp}.xlsx`, skipped: true, reason: 'No data' };
      }
      
      // Create workbook
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      
      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      // Convert buffer to base64 properly
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Data = btoa(binary);
      
      // Create file metadata with folder if specified
      const metadata = {
        name: `${filename}_${timestamp}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      
      if (targetFolderId) {
        metadata.parents = [targetFolderId];
      }
      
      // Upload to Google Drive using multipart upload
      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const closeDelim = "\r\n--" + boundary + "--";
      
      const multipartBody = 
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        closeDelim;
      
      // If a folder ID is specified but it's not app-created, upload to root instead
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartBody
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Drive upload failed for ${filename}:`, errorText);
        
        // If folder access denied, try uploading to root
        if (errorText.includes('notFound') || errorText.includes('403') || errorText.includes('forbidden')) {
          console.log(`Retrying upload to root for ${filename}`);
          delete metadata.parents;
          
          const retryBody = 
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n' +
            'Content-Transfer-Encoding: base64\r\n\r\n' +
            base64Data +
            closeDelim;
          
          const retryResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary="${boundary}"`
            },
            body: retryBody
          });
          
          if (!retryResponse.ok) {
            const retryError = await retryResponse.text();
            throw new Error(`Drive upload failed: ${retryError}`);
          }
          
          const result = await retryResponse.json();
          result.uploadedToRoot = true;
          return result;
        }
        
        throw new Error(`Drive upload failed for ${filename}: ${errorText}`);
      }
      
      return await response.json();
    };
    
    // Backup each selected data type
    if (typesToBackup.includes('users')) {
      try {
        const users = await base44.asServiceRole.entities.AuthorizedEmail.list();
        const sanitizedUsers = users.map(u => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          username: u.username,
          role: u.role,
          sales_roles: (u.sales_roles || []).join(', '),
          can_import_export: u.can_import_export,
          created_date: u.created_date
        }));
        const result = await uploadToGoogleDrive(sanitizedUsers, 'Users_Backup');
        results.push({ type: 'users', filename: result.name, id: result.id, skipped: result.skipped });
      } catch (e) {
        results.push({ type: 'users', error: e.message });
      }
    }
    
    if (typesToBackup.includes('timeclock')) {
      try {
        const timeEntries = await base44.asServiceRole.entities.TimeEntry.list();
        const formattedEntries = timeEntries.map(e => ({
          ...e,
          job_allocations: JSON.stringify(e.job_allocations || [])
        }));
        const result = await uploadToGoogleDrive(formattedEntries, 'TimeEntries_Backup');
        results.push({ type: 'timeclock', filename: result.name, id: result.id, skipped: result.skipped });
      } catch (e) {
        results.push({ type: 'timeclock', error: e.message });
      }
    }
    
    if (typesToBackup.includes('orders')) {
      try {
        const orders = await base44.asServiceRole.entities.Order.list();
        const result = await uploadToGoogleDrive(orders, 'Orders_Backup');
        results.push({ type: 'orders', filename: result.name, id: result.id, skipped: result.skipped });
      } catch (e) {
        results.push({ type: 'orders', error: e.message });
      }
    }
    
    if (typesToBackup.includes('workorders')) {
      try {
        const workOrders = await base44.asServiceRole.entities.WorkOrder.list();
        const formattedWO = workOrders.map(wo => ({
          id: wo.id,
          title: wo.title,
          client_name: wo.client_name,
          description: wo.description,
          current_stage: wo.current_stage,
          priority: wo.priority,
          assigned_to: wo.assigned_to,
          due_date: wo.due_date,
          start_date: wo.start_date,
          is_rider: wo.is_rider,
          completed: wo.completed,
          asap: wo.asap,
          sales_status: wo.sales_status,
          lead_source: wo.lead_source,
          designer: wo.designer,
          surveyor: wo.surveyor,
          project_manager: wo.project_manager,
          estimator: wo.estimator,
          estimate_amount: wo.estimate_amount,
          quoted_amount: wo.quoted_amount,
          contact_name: wo.contact_name,
          contact_email: wo.contact_email,
          contact_phone: wo.contact_phone,
          install_location: wo.install_location,
          permit_number: wo.permit_number,
          created_date: wo.created_date,
          updated_date: wo.updated_date,
          created_by: wo.created_by
        }));
        const result = await uploadToGoogleDrive(formattedWO, 'WorkOrders_Backup');
        results.push({ type: 'workorders', filename: result.name, id: result.id, skipped: result.skipped });
      } catch (e) {
        results.push({ type: 'workorders', error: e.message });
      }
    }
    
    if (typesToBackup.includes('timeoff')) {
      try {
        const timeOffRequests = await base44.asServiceRole.entities.TimeOffRequest.list();
        const result = await uploadToGoogleDrive(timeOffRequests, 'TimeOffRequests_Backup');
        results.push({ type: 'timeoff', filename: result.name, id: result.id, skipped: result.skipped });
      } catch (e) {
        results.push({ type: 'timeoff', error: e.message });
      }
    }
    
    if (typesToBackup.includes('pto')) {
      try {
        const ptoBalances = await base44.asServiceRole.entities.UserPTOBalance.list();
        const formattedPTO = ptoBalances.map(p => ({
          ...p,
          balances: JSON.stringify(p.balances || [])
        }));
        const result = await uploadToGoogleDrive(formattedPTO, 'PTOBalances_Backup');
        results.push({ type: 'pto', filename: result.name, id: result.id, skipped: result.skipped });
      } catch (e) {
        results.push({ type: 'pto', error: e.message });
      }
    }

    const successCount = results.filter(r => !r.error && !r.skipped).length;
    const errorCount = results.filter(r => r.error).length;
    const skippedCount = results.filter(r => r.skipped).length;
    const uploadedToRoot = results.some(r => r.uploadedToRoot);

    let message = `Backed up ${successCount} data sets to Google Drive`;
    if (skippedCount > 0) message += ` (${skippedCount} skipped - no data)`;
    if (errorCount > 0) message += ` (${errorCount} failed)`;
    if (uploadedToRoot) message += ` - Note: Files uploaded to root (folder access denied)`;

    return Response.json({ 
      success: errorCount === 0 && successCount > 0, 
      message,
      results,
      debug: { typesToBackup, targetFolderId, resultsCount: results.length }
    });
    
  } catch (error) {
    console.error("Backup error:", error);
    return Response.json({ error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
});