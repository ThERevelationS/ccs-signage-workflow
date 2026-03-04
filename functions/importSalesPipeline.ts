import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file');

  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
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

  // Load existing work orders for deduplication
  let existingOrders = [];
  try {
    existingOrders = await base44.asServiceRole.entities.WorkOrder.filter({ is_rider: false, deleted: { $ne: true } });
  } catch {}

  const byEstInv = new Map();
  const byClientName = new Map();
  for (const wo of existingOrders) {
    if (wo.est_inv_at) byEstInv.set(wo.est_inv_at, wo);
    if (wo.corbridge_invoice_number) byEstInv.set(wo.corbridge_invoice_number, wo);
    if (wo.client_name) byClientName.set(wo.client_name.toLowerCase().trim(), wo);
  }

  let created = 0, updated = 0, failed = 0;
  const BATCH_SIZE = 15;

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (woData) => {
      const { clientName, estInvAt, ...rest } = woData;
      try {
        let existing = null;
        if (estInvAt) existing = byEstInv.get(estInvAt);
        if (!existing && clientName) existing = byClientName.get(clientName.toLowerCase().trim());

        if (existing) {
          await base44.asServiceRole.entities.WorkOrder.update(existing.id, rest);
          updated++;
        } else {
          const newWo = await base44.asServiceRole.entities.WorkOrder.create(rest);
          if (newWo.est_inv_at) byEstInv.set(newWo.est_inv_at, newWo);
          if (newWo.client_name) byClientName.set(newWo.client_name.toLowerCase().trim(), newWo);
          created++;
        }
      } catch (err) {
        console.error('Row import error:', err.message);
        failed++;
      }
    }));
  }

  return Response.json({ created, updated, failed, total: validRows.length });
});