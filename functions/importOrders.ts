import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let workbook;
  let workOrderFilter = '';
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file');
    workOrderFilter = formData.get('work_order_filter') || '';
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    workbook = XLSX.read(data, { type: 'array', cellDates: true });
  } else {
    const body = await req.json();
    workOrderFilter = body.workOrderFilter || '';
    if (!body.fileData) return Response.json({ error: 'No file provided' }, { status: 400 });
    const binaryStr = atob(body.fileData);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const parseExcelDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : format(value, 'yyyy-MM-dd');
    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) return format(date, 'yyyy-MM-dd');
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return format(parsed, 'yyyy-MM-dd');
    }
    return null;
  };

  // Load existing orders for deduplication
  const existingOrders = await base44.asServiceRole.entities.Order.filter({
    deleted: { $ne: true },
    ...(workOrderFilter ? { work_order_id: workOrderFilter } : {})
  });

  const existingMap = new Map();
  existingOrders.forEach(o => {
    const key = `${o.customer_name}|${o.description}|${o.request_type}`.toLowerCase();
    existingMap.set(key, o);
  });

  const maxRowNumber = existingOrders.length > 0
    ? Math.max(...existingOrders.map(o => o.row_number || 0))
    : 0;

  let created = 0, updated = 0, skipped = 0;
  const BATCH_SIZE = 15;
  let importedCount = 0;

  const validRows = jsonData.filter(row => {
    const customer = String(row['Customer'] ?? row['Customer Name'] ?? row['customer'] ?? row['customer_name'] ?? '').trim();
    const description = String(row['Description'] ?? row['description'] ?? '').trim();
    const requestType = String(row['Type'] ?? row['Request Type'] ?? row['type'] ?? '').trim();
    const quantity = String(row['How much?'] ?? row['Quantity'] ?? row['quantity'] ?? '').trim();
    return customer || description || requestType || quantity;
  });

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      const customer = String(row['Customer'] ?? row['Customer Name'] ?? row['customer'] ?? row['customer_name'] ?? '').trim();
      const description = String(row['Description'] ?? row['description'] ?? '').trim();
      const requestType = String(row['Type'] ?? row['Request Type'] ?? row['type'] ?? '').trim();
      const quantity = String(row['How much?'] ?? row['Quantity'] ?? row['quantity'] ?? '').trim();
      const requestor = String(row['Requestor'] ?? row['requestor'] ?? row['Requestor Name'] ?? '').trim();
      const vendor = String(row['Vendor (Anyone can fill out this column)'] ?? row['Vendor'] ?? row['vendor'] ?? '').trim();

      const dateNeeded = parseExcelDate(row['Date Needed (Requester fills out this column)'] ?? row['Date Needed'] ?? row['date_needed']);
      const dateOrdered = parseExcelDate(row['Ordered Date (Carl Fills out this column)'] ?? row['Date Ordered'] ?? row['date_ordered']);
      const dateReceived = parseExcelDate(row['Date Recieved (Anyone can fill out this column)'] ?? row['Date Received'] ?? row['date_received']);

      const uniqueKey = `${customer}|${description}|${requestType}`.toLowerCase();
      const existing = existingMap.get(uniqueKey);

      if (existing) {
        const updates = {};
        if (quantity && quantity !== (existing.quantity || '')) updates.quantity = quantity;
        if (requestor && requestor !== (existing.requestor_name || '')) updates.requestor_name = requestor;
        if (vendor && vendor !== (existing.vendor || '')) updates.vendor = vendor;
        if (requestType && requestType !== (existing.request_type || '')) updates.request_type = requestType;
        if (dateNeeded && dateNeeded !== existing.date_needed) updates.date_needed = dateNeeded;
        if (dateOrdered && dateOrdered !== existing.date_ordered) updates.date_ordered = dateOrdered;
        if (dateReceived && dateReceived !== existing.date_received) updates.date_received = dateReceived;
        const finalReceived = updates.date_received || existing.date_received;
        const finalOrdered = updates.date_ordered || existing.date_ordered;
        if (finalReceived && existing.status !== 'received') updates.status = 'received';
        else if (finalOrdered && existing.status === 'pending') updates.status = 'ordered';

        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.Order.update(existing.id, updates);
          updated++;
        } else {
          skipped++;
        }
      } else {
        let status = 'pending';
        if (dateReceived) status = 'received';
        else if (dateOrdered) status = 'ordered';

        const newOrder = {
          customer_name: customer,
          request_type: requestType || 'Other',
          description,
          quantity,
          requestor_name: requestor,
          vendor,
          status,
          row_number: maxRowNumber + importedCount + 1,
          work_order_id: workOrderFilter || '',
        };
        if (dateNeeded) newOrder.date_needed = dateNeeded;
        if (dateOrdered) newOrder.date_ordered = dateOrdered;
        if (dateReceived) newOrder.date_received = dateReceived;

        const created_ = await base44.asServiceRole.entities.Order.create(newOrder);
        existingMap.set(uniqueKey, created_);
        importedCount++;
        created++;
      }
    }));
  }

  return Response.json({ created, updated, skipped, total: validRows.length });
});