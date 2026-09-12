import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import * as XLSX from 'npm:xlsx@0.18.5';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { loadGlobalSettingSingleton, saveGlobalSettingFromSnapshot } from '../../shared/globalSettingSingleton.ts';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const body = await req.json().catch(() => ({}));
    const { dataTypes, folderId, action } = body;
    const isScheduledBackup = await hasWorkflowInvocationCapability(body, 'backupToGoogleDrive');

    if (!isScheduledBackup) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
    }
    
    // Get Google Drive access token
    let accessToken;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
      accessToken = conn.accessToken;
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
        console.error('Drive list folders error:', response.status, errText);
        return Response.json({ error: 'Failed to list Google Drive folders' }, { status: 502 });
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
        console.error('Drive create folder error:', response.status, errText);
        return Response.json({ error: 'Failed to create Google Drive folder' }, { status: 502 });
      }
      
      const folder = await response.json();
      return Response.json({ folder });
    }

    // Action: Save backup settings
    if (action === 'saveSettings') {
      const { settings } = body;
      const GlobalSettingsEntity = base44.asServiceRole.entities.GlobalSettings;
      const saved = await saveGlobalSettingFromSnapshot({
        entity: GlobalSettingsEntity,
        settingKey: 'backupSettings',
        settingValue: settings,
        expectedId: String(body.expected_record_id || ''),
        expectedUpdatedDate: String(body.expected_updated_date || ''),
        label: 'Backup settings',
      });
      
      return Response.json({
        success: true,
        message: 'Backup settings saved',
        record_id: saved.record?.id || '',
        updated_date: saved.record?.updated_date || '',
      });
    }

    // Action: Get backup settings
    if (action === 'getSettings') {
      const existing = await loadGlobalSettingSingleton({
        entity: base44.asServiceRole.entities.GlobalSettings,
        settingKey: 'backupSettings',
        label: 'Backup settings',
      });
      return Response.json({
        settings: existing?.setting_value || null,
        record_id: existing?.id || '',
        updated_date: existing?.updated_date || '',
      });
    }

    // Action: Get backup history
    if (action === 'getHistory') {
      const logs = await base44.asServiceRole.entities.BackupLog.list('-created_date', 50);
      return Response.json({ logs });
    }

    // Default action: Perform backup
    // Get data types to backup - for scheduled backups, ALWAYS backup everything
    // For manual backups, use the dataTypes passed in
    let typesToBackup = dataTypes;
    const isManualBackup = typesToBackup && typesToBackup.length > 0;
    
    if (!isManualBackup) {
      // Scheduled backup - always backup everything
      typesToBackup = ['users', 'timeclock', 'orders', 'workorders', 'timeoff', 'pto', 'salespipeline', 'orderform'];
    }
    
    const results = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
    
    // Cache for folder IDs (key: folderName, value: folderId)
    const folderCache = {};
    
    // Get saved folder cache from settings to reuse existing folders. The cache
    // is only an optimization: if its singleton is ambiguous, continue the backup
    // without using or rewriting that ambiguous cache record.
    let folderCacheSetting = null;
    let folderCachePersistenceEnabled = true;
    try {
      folderCacheSetting = await loadGlobalSettingSingleton({
        entity: base44.asServiceRole.entities.GlobalSettings,
        settingKey: 'backupFolderCache',
        label: 'Backup folder cache',
      });
    } catch (cacheLoadError) {
      folderCachePersistenceEnabled = false;
      console.warn('Backup folder cache could not be loaded safely; continuing without cached folder ids:', cacheLoadError?.message || cacheLoadError);
    }
    const savedFolderCache = folderCacheSetting?.setting_value || {};
    Object.assign(folderCache, savedFolderCache);
    
    // Helper to find existing folder by name (only searches app-created files)
    const findExistingFolder = async (folderName) => {
      try {
        const searchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(folderName)}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );
        
        if (searchResponse.ok) {
          const data = await searchResponse.json();
          if (data.files && data.files.length > 0) {
            return data.files[0].id;
          }
        }
      } catch (e) {
        console.log(`Could not search for folder ${folderName}:`, e.message);
      }
      return null;
    };
    
    // Helper to get or create a folder for each backup type
    const getOrCreateFolder = async (folderName) => {
      // Check cache first
      if (folderCache[folderName]) {
        // Verify the cached folder still exists
        try {
          const verifyResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${folderCache[folderName]}?fields=id,trashed`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          if (verifyResponse.ok) {
            const data = await verifyResponse.json();
            if (!data.trashed) {
              return folderCache[folderName];
            }
          }
        } catch (e) {
          console.log(`Cached folder ${folderName} no longer valid`);
        }
        delete folderCache[folderName];
      }
      
      // Try to find existing folder
      const existingId = await findExistingFolder(folderName);
      if (existingId) {
        folderCache[folderName] = existingId;
        return existingId;
      }
      
      // Create new folder
      const metadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
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
        console.error(`Failed to create folder ${folderName}:`, errText);
        return null;
      }
      
      const folder = await response.json();
      folderCache[folderName] = folder.id;
      return folder.id;
    };
    
    // Helper to create Excel file and upload to Drive
    const uploadToGoogleDrive = async (data, filename, folderName) => {
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
      
      // Get or create the specific folder for this backup type
      const uploadFolderId = await getOrCreateFolder(folderName);
      
      // Create file metadata with folder if specified
      const metadata = {
        name: `${filename}_${timestamp}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      
      if (uploadFolderId) {
        metadata.parents = [uploadFolderId];
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
    
    // Backup each selected data type - each gets its own folder
    if (typesToBackup.includes('users')) {
      try {
        const users = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.AuthorizedEmail,
          sort: 'created_date',
          label: 'Authorized users backup archive',
        });
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
        const result = await uploadToGoogleDrive(sanitizedUsers, 'Users_Backup', 'SignShop Users Backup');
        results.push({ type: 'users', filename: result.name, id: result.id, skipped: result.skipped, uploadedToRoot: result.uploadedToRoot });
      } catch (e) {
        results.push({ type: 'users', error: e.message });
      }
    }
    
    if (typesToBackup.includes('timeclock')) {
      try {
        const timeEntries = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.TimeEntry,
          sort: 'created_date',
          label: 'Time Clock backup archive',
        });
        const formattedEntries = timeEntries.map(e => ({
          ...e,
          job_allocations: JSON.stringify(e.job_allocations || [])
        }));
        const result = await uploadToGoogleDrive(formattedEntries, 'TimeEntries_Backup', 'SignShop Time Clock Backup');
        results.push({ type: 'timeclock', filename: result.name, id: result.id, skipped: result.skipped, uploadedToRoot: result.uploadedToRoot });
      } catch (e) {
        results.push({ type: 'timeclock', error: e.message });
      }
    }
    
    if (typesToBackup.includes('orders')) {
      try {
        const orders = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.Order,
          sort: 'row_number',
          label: 'Orders backup archive',
        });
        const result = await uploadToGoogleDrive(orders, 'Orders_Backup', 'SignShop Orders Backup');
        results.push({ type: 'orders', filename: result.name, id: result.id, skipped: result.skipped, uploadedToRoot: result.uploadedToRoot });
      } catch (e) {
        results.push({ type: 'orders', error: e.message });
      }
    }
    
    if (typesToBackup.includes('workorders')) {
      try {
        console.log('Starting Work Orders backup...');
        // Verify the complete archive before uploading. A later-page failure
        // must fail this backup branch instead of producing a partial file.
        const workOrders = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.WorkOrder,
          sort: 'created_date',
          label: 'Work Orders backup archive',
        });
        console.log(`Work Orders: fetched ${workOrders.length} records total`);
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
        const result = await uploadToGoogleDrive(formattedWO, 'WorkOrders_Backup', 'SignShop Work Orders Backup');
        results.push({ type: 'workorders', filename: result.name, id: result.id, skipped: result.skipped, uploadedToRoot: result.uploadedToRoot });
      } catch (e) {
        results.push({ type: 'workorders', error: e.message });
      }
    }
    
    if (typesToBackup.includes('timeoff')) {
      try {
        const timeOffRequests = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.TimeOffRequest,
          sort: 'created_date',
          label: 'Time Off backup archive',
        });
        const result = await uploadToGoogleDrive(timeOffRequests, 'TimeOffRequests_Backup', 'SignShop Time Off Backup');
        results.push({ type: 'timeoff', filename: result.name, id: result.id, skipped: result.skipped, uploadedToRoot: result.uploadedToRoot });
      } catch (e) {
        results.push({ type: 'timeoff', error: e.message });
      }
    }
    
    if (typesToBackup.includes('pto')) {
      try {
        const ptoBalances = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.UserPTOBalance,
          sort: 'created_date',
          label: 'PTO balances backup archive',
        });
        const formattedPTO = ptoBalances.map(p => ({
          ...p,
          balances: JSON.stringify(p.balances || [])
        }));
        const result = await uploadToGoogleDrive(formattedPTO, 'PTOBalances_Backup', 'SignShop PTO Backup');
        results.push({ type: 'pto', filename: result.name, id: result.id, skipped: result.skipped, uploadedToRoot: result.uploadedToRoot });
      } catch (e) {
        results.push({ type: 'pto', error: e.message });
      }
    }

    // Sales Pipeline Export (same format as UI export)
    if (typesToBackup.includes('salespipeline')) {
      try {
        console.log('Starting Sales Pipeline backup...');
        // Verify the complete Work Order archive before deriving the Sales
        // Pipeline export so a later-page failure cannot create a partial file.
        const allWorkOrders = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.WorkOrder,
          sort: 'created_date',
          label: 'Sales Pipeline backup Work Orders',
        });
        
        const workOrdersRaw = allWorkOrders.filter(wo => !wo.is_rider && wo.deleted !== true);
        console.log(`Sales Pipeline: fetched ${workOrdersRaw.length} work orders (from ${allWorkOrders.length} total)`);
        const workOrdersForExport = Array.isArray(workOrdersRaw) ? workOrdersRaw : [];
        
        const calculateDays = (fromDate, toDate) => {
          if (!fromDate) return null;
          const from = new Date(fromDate);
          if (isNaN(from.getTime())) return null;
          let to;
          if (!toDate) {
            to = new Date();
          } else {
            to = new Date(toDate);
            if (isNaN(to.getTime())) return null;
          }
          return Math.floor((to - from) / (1000 * 60 * 60 * 24));
        };
        
        const exportData = workOrdersForExport.map(wo => {
          const daysFromInitial = calculateDays(wo.date_initial_contact, null);
          const daysEstSent = calculateDays(wo.date_initial_contact, wo.date_estimate_sent);
          const daysEstToOrder = calculateDays(wo.date_estimate_sent, wo.date_order_created);
          const daysOrderToPermit = calculateDays(wo.date_order_created, wo.permit_submitted_date);
          const daysPermitToApproved = calculateDays(wo.permit_submitted_date, wo.permit_approved_date);
          const daysOrderToInstall = calculateDays(wo.date_order_created, wo.project_install_date);
          
          return {
            "Customer": wo.client_name || "",
            "Source": wo.lead_source || "",
            "Current Task Deadline": wo.current_task_deadline || "",
            "Current Task Assigned to": wo.current_task_assigned_to || "",
            "Designer": wo.designer || "",
            "Project Manager": wo.project_manager || "",
            "Estimator": wo.estimator || "",
            "Est/Inv @": wo.est_inv_at || wo.corbridge_invoice_number || "",
            "Estimate Amount": wo.estimate_amount || null,
            "Current Task Description": wo.current_task_description || "",
            "Date Est. Requested/Initial Contact": wo.date_initial_contact || "",
            "Site Survey": wo.site_survey_date || "",
            "Date Estimate Sent to Customer": wo.date_estimate_sent || "",
            "Date Order Created": wo.date_order_created || "",
            "Project Install Date": wo.project_install_date || "",
            "Permit Submitted": wo.permit_submitted_date || "",
            "Notes": wo.title || "",
            "Date Permit Receipt Confirmed": wo.permit_receipt_confirmed_date || "",
            "Permit Number": wo.permit_number || "",
            "Date Permit Approved/Received": wo.permit_approved_date || "",
            "Days from Initial Request to today": daysFromInitial,
            "Days Est. Sent from Date Requested": daysEstSent,
            "Days from Est. Sent to Date Order Created": daysEstToOrder,
            "Days from Order Created to Permit Submitted": daysOrderToPermit,
            "Days from Permit Submitted to Permit Approved": daysPermitToApproved,
            "Days from Project Install Date from Order Created": daysOrderToInstall
          };
        });
        
        const result = await uploadToGoogleDrive(exportData, 'SalesPipeline_Export', 'SignShop Sales Pipeline Backup');
        results.push({ type: 'salespipeline', filename: result.name, id: result.id, skipped: result.skipped, uploadedToRoot: result.uploadedToRoot });
      } catch (e) {
        results.push({ type: 'salespipeline', error: e.message });
      }
    }

    // Order Form Export (same format as UI export)
    if (typesToBackup.includes('orderform')) {
      try {
        const ordersForExport = await loadAllEntityRows({
          entity: base44.asServiceRole.entities.Order,
          query: { deleted: { $ne: true } },
          sort: 'row_number',
          label: 'Order Form backup archive',
        });
        
        const exportData = ordersForExport.map(order => ({
          "Customer": order.customer_name || "",
          "Type": order.request_type || "",
          "Description": order.description || "",
          "How much?": order.quantity || "",
          "Requestor": order.requestor_name || "",
          "Date Needed (Requester fills out this column)": order.date_needed || "",
          "Ordered Date (Carl Fills out this column)": order.date_ordered || "",
          "Vendor (Anyone can fill out this column)": order.vendor || "",
          "Date Recieved (Anyone can fill out this column)": order.date_received || ""
        }));
        
        const result = await uploadToGoogleDrive(exportData, 'OrderForm_Export', 'SignShop Order Form Backup');
        results.push({ type: 'orderform', filename: result.name, id: result.id, skipped: result.skipped, uploadedToRoot: result.uploadedToRoot });
      } catch (e) {
        results.push({ type: 'orderform', error: e.message });
      }
    }

    // Save the folder cache for future backups. It is non-authoritative, so a
    // concurrent cache change must never make the actual backup fail or overwrite
    // the newer cache. In that case, keep the backup results and skip cache save.
    if (folderCachePersistenceEnabled) {
      try {
        await saveGlobalSettingFromSnapshot({
          entity: base44.asServiceRole.entities.GlobalSettings,
          settingKey: 'backupFolderCache',
          settingValue: folderCache,
          expectedId: folderCacheSetting?.id || '',
          expectedUpdatedDate: folderCacheSetting?.updated_date || '',
          label: 'Backup folder cache',
        });
      } catch (cacheSaveError) {
        console.warn('Backup folder cache changed concurrently and was not overwritten:', cacheSaveError?.message || cacheSaveError);
      }
    }

    const successCount = results.filter(r => !r.error && !r.skipped).length;
    const errorCount = results.filter(r => r.error).length;
    const skippedCount = results.filter(r => r.skipped).length;

    let message = `Backed up ${successCount} data sets to Google Drive`;
    if (skippedCount > 0) message += ` (${skippedCount} skipped - no data)`;
    if (errorCount > 0) message += ` (${errorCount} failed)`;

    // Log the backup - differentiate manual vs scheduled in the log
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: isManualBackup ? 'manual' : 'scheduled',
        data_types: typesToBackup,
        results: results.map(r => ({
          type: r.type,
          filename: r.filename || r.name,
          success: !r.error && !r.skipped,
          error: r.error || null,
          skipped: r.skipped || false
        })),
        success_count: successCount,
        error_count: errorCount,
        triggered_by: isScheduledBackup ? 'system' : (user?.email || 'unknown')
      });
    } catch (logError) {
      console.error("Error logging backup:", logError);
    }

    return Response.json({ 
      success: errorCount === 0 && successCount > 0, 
      message,
      results
    });
    
  } catch (error) {
    console.error('backupToGoogleDrive error:', error?.message || error);
    return Response.json({ error: 'Google Drive backup could not be completed safely' }, { status: 500 });
  }
});