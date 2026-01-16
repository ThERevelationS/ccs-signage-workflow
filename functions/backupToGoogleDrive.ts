import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dataTypes } = await req.json();
    
    // Get Google Drive access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken("googledrive");
    
    const results = [];
    const timestamp = new Date().toISOString().split('T')[0];
    
    // Helper to create Excel file and upload to Drive
    const uploadToGoogleDrive = async (data, filename) => {
      // Create workbook
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      
      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      // Create file metadata
      const metadata = {
        name: `${filename}_${timestamp}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      
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
        btoa(String.fromCharCode(...new Uint8Array(buffer))) +
        closeDelim;
      
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartBody
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Drive upload failed: ${error}`);
      }
      
      return await response.json();
    };
    
    // Backup each selected data type
    if (dataTypes.includes('users')) {
      const users = await base44.asServiceRole.entities.AuthorizedEmail.list();
      // Remove sensitive data
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
      results.push({ type: 'users', filename: result.name, id: result.id });
    }
    
    if (dataTypes.includes('timeclock')) {
      const timeEntries = await base44.asServiceRole.entities.TimeEntry.list();
      const formattedEntries = timeEntries.map(e => ({
        ...e,
        job_allocations: JSON.stringify(e.job_allocations || [])
      }));
      const result = await uploadToGoogleDrive(formattedEntries, 'TimeEntries_Backup');
      results.push({ type: 'timeclock', filename: result.name, id: result.id });
    }
    
    if (dataTypes.includes('orders')) {
      const orders = await base44.asServiceRole.entities.Order.list();
      const result = await uploadToGoogleDrive(orders, 'Orders_Backup');
      results.push({ type: 'orders', filename: result.name, id: result.id });
    }
    
    if (dataTypes.includes('workorders')) {
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
      results.push({ type: 'workorders', filename: result.name, id: result.id });
    }
    
    if (dataTypes.includes('timeoff')) {
      const timeOffRequests = await base44.asServiceRole.entities.TimeOffRequest.list();
      const result = await uploadToGoogleDrive(timeOffRequests, 'TimeOffRequests_Backup');
      results.push({ type: 'timeoff', filename: result.name, id: result.id });
    }
    
    if (dataTypes.includes('pto')) {
      const ptoBalances = await base44.asServiceRole.entities.UserPTOBalance.list();
      const formattedPTO = ptoBalances.map(p => ({
        ...p,
        balances: JSON.stringify(p.balances || [])
      }));
      const result = await uploadToGoogleDrive(formattedPTO, 'PTOBalances_Backup');
      results.push({ type: 'pto', filename: result.name, id: result.id });
    }

    return Response.json({ 
      success: true, 
      message: `Successfully backed up ${results.length} data sets to Google Drive`,
      results 
    });
    
  } catch (error) {
    console.error("Backup error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});