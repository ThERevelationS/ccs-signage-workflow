import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@2.30.0';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { expectedWorkOrderFields, replaceWorkOrderFieldsIfUnchanged } from '../../shared/workOrderFieldPersistence.mjs';
import { createWorkOrderWithRecovery } from '../../shared/workOrderCreatePersistence.mjs';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let canImport = user.role === 'admin';
  if (!canImport) {
    const authorized = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
    const appUser = authorized?.[0];
    canImport = appUser?.role === 'admin' || appUser?.can_import_export === true;
  }
  if (!canImport) return Response.json({ error: 'Sales Pipeline import permission is required.' }, { status: 403 });

  let workbook;
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    workbook = XLSX.read(data, { type: 'array', cellDates: true });
  } else {
    const body = await req.json();
    if (!body.fileData) return Response.json({ error: 'No file provided' }, { status: 400 });
    const binaryStr = atob(body.fileData);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const normalizeDate = (val) => {
    if (!val) return '';
    if (val instanceof Date) return isNaN(val.getTime()) ? '' : format(val, 'yyyy-MM-dd');
    return String(val);
  };

  const validRows = rows.map(row => {
    const clientName = row['Customer'] || row['client_name'] || '';
    if (!clientName) return null;
    const estInvAt = row['Est/Inv @'] || row['est_inv_at'] || '';
    return {
      clientName,
      estInvAt,
      client_name: clientName,
      lead_source: row['Source'] || row['lead_source'] || '',
      current_task_deadline: normalizeDate(row['Current Task Deadline'] || row['current_task_deadline']),
      current_task_assigned_to: row['Current Task Assigned to'] || row['current_task_assigned_to'] || '',
      designer: row['Designer'] || row['designer'] || '',
      project_manager: row['Project Manager'] || row['project_manager'] || '',
      estimator: row['Estimator'] || row['estimator'] || '',
      est_inv_at: estInvAt,
      estimate_amount: parseFloat(row['Estimate Amount'] || row['estimate_amount']) || null,
      current_task_description: row['Current Task Description'] || row['current_task_description'] || '',
      date_initial_contact: normalizeDate(row['Date Est. Requested/Initial Contact'] || row['date_initial_contact']),
      site_survey_date: normalizeDate(row['Site Survey'] || row['site_survey_date']),
      date_estimate_sent: normalizeDate(row['Date Estimate Sent to Customer'] || row['date_estimate_sent']),
      date_order_created: normalizeDate(row['Date Order Created'] || row['date_order_created']),
      project_install_date: normalizeDate(row['Project Install Date'] || row['project_install_date']),
      permit_submitted_date: normalizeDate(row['Permit Submitted'] || row['permit_submitted_date']),
      title: row['Notes'] || row['title'] || clientName,
      permit_receipt_confirmed_date: normalizeDate(row['Date Permit Receipt Confirmed'] || row['permit_receipt_confirmed_date']),
      permit_number: row['Permit Number'] || row['permit_number'] || '',
      permit_approved_date: normalizeDate(row['Date Permit Approved/Received'] || row['permit_approved_date']),
      sales_status: row['sales_status'] || 'lead',
      in_pipeline: false,
    };
  }).filter(Boolean);

  if (validRows.length === 0) {
    return Response.json({ created: 0, updated: 0, failed: 0, total: 0 });
  }

  // Load the complete existing Work Order set for deduplication. If this
  // verification fails, abort before any import writes rather than treating
  // an unreadable catalog as empty and creating duplicates.
  let existingOrders = [];
  try {
    existingOrders = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.WorkOrder,
      query: { is_rider: false, deleted: { $ne: true } },
      sort: 'created_date',
      label: 'Sales Pipeline import Work Orders',
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Existing Work Orders could not be verified before import.' }, { status: 500 });
  }

  const byEstInv = new Map();
  // Map from normalized client_name to array of work orders (same client can have multiple jobs)
  const byClientName = new Map();
  for (const wo of existingOrders) {
    if (wo.est_inv_at) byEstInv.set(wo.est_inv_at, wo);
    if (wo.corbridge_invoice_number) byEstInv.set(wo.corbridge_invoice_number, wo);
    if (wo.client_name) {
      const key = wo.client_name.toLowerCase().trim();
      if (!byClientName.has(key)) byClientName.set(key, []);
      byClientName.get(key).push(wo);
    }
  }

  // Find existing WO that matches this import row (same client + similar title/description, or same est_inv)
  function findMatchingWorkOrder(clientName, estInvAt, title) {
    // 1. Exact est/inv match is always definitive
    if (estInvAt && byEstInv.has(estInvAt)) return byEstInv.get(estInvAt);
    
    // 2. Same client name — check if there's already a record with the same or very similar title
    const key = (clientName || '').toLowerCase().trim();
    const existing = byClientName.get(key);
    if (!existing || existing.length === 0) return null;
    
    const normTitle = (title || '').toLowerCase().trim();
    
    // If the import row's title is just the client name (no real title), match the first record with no distinguishing title
    if (!normTitle || normTitle === key) {
      const bareRecord = existing.find(wo => {
        const woTitle = (wo.title || '').toLowerCase().trim();
        return !woTitle || woTitle === key;
      });
      return bareRecord || null;
    }
    
    // If the import row has a real title, only match if an existing record has the same title
    const titleMatch = existing.find(wo => {
      const woTitle = (wo.title || '').toLowerCase().trim();
      return woTitle === normTitle;
    });
    return titleMatch || null;
  }

  const readImportIdentityMatches = async (clientName, estInvAt, title) => {
    const entity = base44.asServiceRole.entities.WorkOrder;
    if (estInvAt) {
      const [estimateRows, invoiceRows] = await Promise.all([
        loadAllEntityRows({
          entity,
          query: { est_inv_at: estInvAt, is_rider: false, deleted: { $ne: true } },
          sort: 'created_date',
          label: `Sales Pipeline ${estInvAt} estimate identity`,
        }),
        loadAllEntityRows({
          entity,
          query: { corbridge_invoice_number: estInvAt, is_rider: false, deleted: { $ne: true } },
          sort: 'created_date',
          label: `Sales Pipeline ${estInvAt} invoice identity`,
        }),
      ]);
      return [...estimateRows, ...invoiceRows];
    }

    const clientRows = await loadAllEntityRows({
      entity,
      query: { client_name: clientName, is_rider: false, deleted: { $ne: true } },
      sort: 'created_date',
      label: `Sales Pipeline ${clientName} identity`,
    });
    const key = (clientName || '').toLowerCase().trim();
    const normTitle = (title || '').toLowerCase().trim();
    return clientRows.filter((wo) => {
      if ((wo.client_name || '').toLowerCase().trim() !== key) return false;
      const woTitle = (wo.title || '').toLowerCase().trim();
      if (!normTitle || normTitle === key) return !woTitle || woTitle === key;
      return woTitle === normTitle;
    });
  };

  const indexWorkOrder = (wo) => {
    if (wo?.est_inv_at) byEstInv.set(wo.est_inv_at, wo);
    if (wo?.corbridge_invoice_number) byEstInv.set(wo.corbridge_invoice_number, wo);
    if (wo?.client_name) {
      const key = wo.client_name.toLowerCase().trim();
      if (!byClientName.has(key)) byClientName.set(key, []);
      const rows = byClientName.get(key);
      const existingIndex = rows.findIndex((row) => row.id === wo.id);
      if (existingIndex >= 0) rows[existingIndex] = wo;
      else rows.push(wo);
    }
  };

  let created = 0, updated = 0, failed = 0, conflicts = 0;
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 300;

  // Process each five-row batch in source order instead of creating rows in parallel.
  // This preserves the import's existing last-row-wins behavior while preventing two
  // identical rows in the same spreadsheet batch from racing each other into duplicates.
  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);
    for (const woData of batch) {
      const { clientName, estInvAt, ...rest } = woData;
      try {
        const existing = findMatchingWorkOrder(clientName, estInvAt, rest.title);

        if (existing) {
          const saved = await replaceWorkOrderFieldsIfUnchanged({
            entity: base44.asServiceRole.entities.WorkOrder,
            workOrderId: existing.id,
            expectedFields: expectedWorkOrderFields(existing, rest),
            nextFields: rest,
            label: `Sales Pipeline import ${estInvAt || clientName}`,
          });
          Object.assign(existing, saved);
          indexWorkOrder(existing);
          updated++;
        } else {
          const createResult = await createWorkOrderWithRecovery({
            entity: base44.asServiceRole.entities.WorkOrder,
            data: rest,
            readMatches: () => readImportIdentityMatches(clientName, estInvAt, rest.title),
            label: `Sales Pipeline import ${estInvAt || `${clientName} - ${rest.title}`}`,
          });
          const saved = await replaceWorkOrderFieldsIfUnchanged({
            entity: base44.asServiceRole.entities.WorkOrder,
            workOrderId: createResult.record.id,
            expectedFields: expectedWorkOrderFields(createResult.record, rest),
            nextFields: rest,
            label: `Sales Pipeline import ${estInvAt || clientName}`,
          });
          indexWorkOrder(saved);
          if (createResult.status === 'reused') updated++;
          else created++;
        }
      } catch (err) {
        console.error('Row import error:', err.message);
        if (err?.code === 'WORK_ORDER_FIELD_CONFLICT' || err?.code === 'WORK_ORDER_CREATE_AMBIGUOUS') conflicts++;
        failed++;
      }
    }
    if (i + BATCH_SIZE < validRows.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return Response.json({ created, updated, failed, conflicts, total: validRows.length });
});