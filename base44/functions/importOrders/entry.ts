import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@2.30.0';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { createImportedOrderWithRecovery, OrderImportConflictError, replaceImportedOrderFieldsIfUnchanged } from '../../shared/orderImportPersistence.mjs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const retryOnRateLimit = async (fn, maxRetries = 3) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429 && attempt < maxRetries) {
        console.log(`Rate limited, waiting ${(attempt + 1) * 2}s before retry...`);
        await sleep((attempt + 1) * 2000);
      } else {
        throw err;
      }
    }
  }
};

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
  if (!canImport) {
    return Response.json({ error: 'Order import permission is required.' }, { status: 403 });
  }

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

  // Load the complete existing Order set before deduplication. If a later page
  // cannot be verified, fail before processing any import rows rather than
  // creating duplicates from a partial archive.
  const existingOrders = await loadAllEntityRows({
    entity: base44.asServiceRole.entities.Order,
    query: {
      deleted: { $ne: true },
      ...(workOrderFilter ? { work_order_id: workOrderFilter } : {})
    },
    sort: 'row_number',
    label: workOrderFilter ? 'Work Order import existing Orders' : 'Order import existing Orders',
  });

  const existingMap = new Map();
  existingOrders.forEach(o => {
    const key = `${o.customer_name}|${o.description}|${o.request_type}`.toLowerCase();
    existingMap.set(key, o);
  });

  const maxRowNumber = existingOrders.length > 0
    ? Math.max(...existingOrders.map(o => o.row_number || 0))
    : 0;

  let created = 0, updated = 0, skipped = 0, conflicts = 0, errors = 0;
  let importedCount = 0;
  const issues = [];

  const validRows = jsonData.filter(row => {
    const customer = String(row['Customer'] ?? row['Customer Name'] ?? row['customer'] ?? row['customer_name'] ?? '').trim();
    const description = String(row['Description'] ?? row['description'] ?? '').trim();
    const requestType = String(row['Type'] ?? row['Request Type'] ?? row['type'] ?? '').trim();
    const quantity = String(row['How much?'] ?? row['Quantity'] ?? row['quantity'] ?? '').trim();
    return customer || description || requestType || quantity;
  });

  // Process one row at a time with delay to avoid rate limits
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];

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

    try {
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
          const result = await retryOnRateLimit(() => replaceImportedOrderFieldsIfUnchanged({
            entity: base44.asServiceRole.entities.Order,
            order: existing,
            nextFields: updates,
            label: `Order import row ${i + 1}`,
          }));
          existingMap.set(uniqueKey, result.record);
          if (result.status === 'already_desired') skipped++;
          else updated++;
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

        const orderEntity = base44.asServiceRole.entities.Order;
        const createResult = await createImportedOrderWithRecovery({
          entity: orderEntity,
          data: newOrder,
          readMatches: () => loadAllEntityRows({
            entity: orderEntity,
            query: {
              customer_name: customer,
              description,
              request_type: requestType || 'Other',
              deleted: { $ne: true },
              ...(workOrderFilter ? { work_order_id: workOrderFilter } : {}),
            },
            sort: 'row_number',
            label: `Order import row ${i + 1} create identity`,
          }),
          label: `Order import row ${i + 1}`,
        });
        existingMap.set(uniqueKey, createResult.record);
        if (createResult.status === 'reused') {
          skipped++;
        } else {
          importedCount++;
          created++;
        }
      }
    } catch (err) {
      console.error(`Error processing row ${i + 1}: ${customer} - ${description}`, err.message);
      const isConflict = err instanceof OrderImportConflictError || err?.code === 'ORDER_IMPORT_CONFLICT';
      if (isConflict) conflicts++;
      else errors++;
      if (issues.length < 20) {
        issues.push({
          row: i + 1,
          customer,
          description,
          type: isConflict ? 'conflict' : 'error',
          message: err?.message || 'Unknown import error',
        });
      }
    }

    // Delay between each row to stay under rate limits
    if (i < validRows.length - 1) {
      await sleep(500);
    }
  }

  return Response.json({ created, updated, skipped, conflicts, errors, total: validRows.length, issues });
});