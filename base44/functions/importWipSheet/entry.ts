import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import XLSX from 'npm:xlsx@0.18.5';

const parseSheetDate = (name) => {
  const match = name.match(/WIP\s+(\d+)-(\d+)-(\d+)/);
  if (!match) return null;
  let [, month, day, year] = match;
  year = parseInt(year);
  if (year < 100) year += 2000;
  return new Date(year, parseInt(month) - 1, parseInt(day));
};

const parseSheetRows = (workbook, sheetName) => {
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => typeof cell === 'string' && cell.includes('Order Number'))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return { rows: [], headers: [] };

  const headers = rows[headerRowIdx];
  const findCol = (...names) => {
    for (const name of names) {
      const idx = headers.findIndex(h => h && typeof h === 'string' && h.trim().toLowerCase().includes(name.toLowerCase()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const orderNumCol = findCol('Order Number');
  const descCol = findCol('Order Description');
  const installDateCol = findCol('Proj./Actual Install Date', 'Proj. Install Date', 'Install Date');
  const customerCol = findCol('Customer Name', 'Customer', 'Client');

  if (orderNumCol === -1) return { rows: [], headers: headers.filter(Boolean).map(String) };

  const results = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[orderNumCol]) continue;
    const orderNum = String(row[orderNumCol]).trim();
    if (!orderNum || orderNum === 'Order Number') continue;

    const desc = descCol !== -1 ? row[descCol] : null;
    const customer = customerCol !== -1 ? row[customerCol] : null;
    let installDate = installDateCol !== -1 ? row[installDateCol] : null;

    if (installDate !== null && installDate !== undefined) {
      if (typeof installDate === 'number') {
        const d = XLSX.SSF.parse_date_code(installDate);
        installDate = d ? `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}` : null;
      } else if (typeof installDate === 'string') {
        const dateMatch = installDate.match(/(\d{4}-\d{2}-\d{2})/);
        installDate = dateMatch ? dateMatch[1] : null;
      }
    }

    results.push({
      orderNumber: orderNum,
      description: desc ? String(desc).trim() : null,
      customerName: customer ? String(customer).trim() : null,
      installDate: installDate || null,
    });
  }
  return { rows: results, headers: headers.filter(Boolean).map(String) };
};

const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { fileUrl, mode } = body;

    if (!fileUrl) {
      return Response.json({ error: 'Missing required field: fileUrl' }, { status: 400 });
    }

    // Download and parse
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
    const arrayBuffer = await fileRes.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

    const wipSheets = workbook.SheetNames.filter(name =>
      /^WIP\s+\d/.test(name) && name !== 'Formulas'
    );

    if (wipSheets.length === 0) {
      return Response.json({ error: 'No WIP sheets found in this file' }, { status: 400 });
    }

    let sheetsToProcess = [];
    if (mode === 'latest') {
      let latestSheet = null;
      let latestDate = null;
      for (const sheetName of wipSheets) {
        const d = parseSheetDate(sheetName);
        if (d && (!latestDate || d > latestDate)) {
          latestDate = d;
          latestSheet = sheetName;
        }
      }
      if (!latestSheet) return Response.json({ error: 'Could not parse dates from WIP sheet names' }, { status: 400 });
      sheetsToProcess = [latestSheet];
    } else {
      sheetsToProcess = wipSheets;
    }

    let allHeaders = [];
    const allRows = [];
    for (const sheetName of sheetsToProcess) {
      const { rows, headers } = parseSheetRows(workbook, sheetName);
      allRows.push(...rows);
      if (headers.length > 0 && allHeaders.length === 0) allHeaders = headers;
    }

    if (allRows.length === 0) {
      return Response.json({ 
        error: 'No data rows found in selected sheets',
        debug: { sheetsToProcess, allHeaders, sheetNames: workbook.SheetNames }
      }, { status: 400 });
    }

    // Deduplicate - later sheet wins
    const orderMap = new Map();
    for (const row of allRows) orderMap.set(row.orderNumber, row);

    // Fetch all work orders using pagination with retry
    let allWorkOrders = [];
    let skip = 0;
    const pageSize = 200;
    while (true) {
      let page = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          page = await base44.asServiceRole.entities.WorkOrder.list('created_date', pageSize, skip);
          break;
        } catch (e) {
          if (e.message && e.message.includes('429') && attempt < 3) {
            await sleep(1000 * (attempt + 1));
          } else {
            throw e;
          }
        }
      }
      if (!Array.isArray(page) || page.length === 0) break;
      allWorkOrders = allWorkOrders.concat(page);
      if (page.length < pageSize) break;
      skip += pageSize;
    }

    // Build lookup indexes for faster matching
    const byInvoiceNum = new Map();
    const byEstInvAt = new Map();
    const byNormalizedClient = new Map();

    for (const wo of allWorkOrders) {
      // Index by corbridge_invoice_number
      if (wo.corbridge_invoice_number) {
        byInvoiceNum.set(wo.corbridge_invoice_number, wo);
        // Also index the numeric part (strip EST-/INV- prefix)
        const numPart = wo.corbridge_invoice_number.replace(/^(INV|EST)-?/i, '');
        if (numPart !== wo.corbridge_invoice_number) byInvoiceNum.set(numPart, wo);
      }
      // Index by est_inv_at
      if (wo.est_inv_at) {
        byEstInvAt.set(wo.est_inv_at, wo);
        const numPart = wo.est_inv_at.replace(/^(INV|EST)-?/i, '');
        if (numPart !== wo.est_inv_at) byEstInvAt.set(numPart, wo);
      }
      // Index by normalized client name (for fallback matching)
      const normClient = normalize(wo.client_name);
      if (normClient) {
        if (!byNormalizedClient.has(normClient)) {
          byNormalizedClient.set(normClient, []);
        }
        byNormalizedClient.get(normClient).push(wo);
      }
    }

    // Match and collect updates
    let updated = 0;
    let notFound = 0;
    let matchedByOrderNum = 0;
    let matchedByClient = 0;
    const notFoundOrders = [];
    const debugMatches = [];
    const pendingUpdates = [];

    for (const [orderNumber, wipData] of orderMap.entries()) {
      const numericPart = orderNumber.replace(/^(INV|EST)-?/i, '');

      // Strategy 1: Match by corbridge_invoice_number or est_inv_at (exact)
      let match = byInvoiceNum.get(orderNumber) || byInvoiceNum.get(numericPart)
                || byEstInvAt.get(orderNumber) || byEstInvAt.get(numericPart);

      // Strategy 2: Check corbridge_link contains order number
      if (!match) {
        match = allWorkOrders.find(wo => {
          const link = wo.corbridge_link || '';
          return link.includes(orderNumber) || link.includes(numericPart);
        });
      }

      // Strategy 3: Fallback - match by customer name from WIP row
      if (!match && wipData.customerName) {
        const normWipCustomer = normalize(wipData.customerName);
        const candidates = byNormalizedClient.get(normWipCustomer);
        if (candidates && candidates.length === 1) {
          match = candidates[0];
          matchedByClient++;
        } else if (candidates && candidates.length > 1 && wipData.description) {
          const normDesc = normalize(wipData.description);
          const descMatch = candidates.find(wo => {
            const woDesc = normalize(wo.description || wo.title || '');
            return woDesc.includes(normDesc) || normDesc.includes(woDesc);
          });
          if (descMatch) {
            match = descMatch;
            matchedByClient++;
          }
        }
      }

      // Strategy 4: Partial client name match (one contains the other)
      if (!match && wipData.customerName) {
        const normWipCustomer = normalize(wipData.customerName);
        if (normWipCustomer.length >= 4) {
          const partialMatches = allWorkOrders.filter(wo => {
            const normWo = normalize(wo.client_name);
            return normWo && (normWo.includes(normWipCustomer) || normWipCustomer.includes(normWo));
          });
          if (partialMatches.length === 1) {
            match = partialMatches[0];
            matchedByClient++;
          }
        }
      }

      if (!match) {
        notFound++;
        notFoundOrders.push(orderNumber + (wipData.customerName ? ` (${wipData.customerName})` : ''));
        continue;
      }

      if (match && !match._matchedByClient) matchedByOrderNum++;

      // Only include fields that actually changed
      const updateData = {};
      if (wipData.description && wipData.description !== match.description) {
        updateData.description = wipData.description;
      }
      if (wipData.installDate && wipData.installDate !== match.project_install_date) {
        updateData.project_install_date = wipData.installDate;
      }
      if (!match.corbridge_invoice_number && orderNumber) {
        updateData.corbridge_invoice_number = orderNumber;
      }
      if (!match.est_inv_at && orderNumber) {
        updateData.est_inv_at = orderNumber;
      }

      if (Object.keys(updateData).length > 0) {
        pendingUpdates.push({ id: match.id, data: updateData, orderNumber, wipData, match });
      }
    }

    // Process updates in parallel batches (fast, retry on 429)
    const PARALLEL_BATCH = 10;
    for (let i = 0; i < pendingUpdates.length; i += PARALLEL_BATCH) {
      const batch = pendingUpdates.slice(i, i + PARALLEL_BATCH);
      const results = await Promise.allSettled(batch.map(async (item) => {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await base44.asServiceRole.entities.WorkOrder.update(item.id, item.data);
            return item;
          } catch (e) {
            if (e.message && e.message.includes('429') && attempt < 3) {
              await sleep(1500 * (attempt + 1));
            } else {
              throw e;
            }
          }
        }
      }));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          updated++;
          const item = r.value;
          if (debugMatches.length < 5) {
            debugMatches.push({
              orderNumber: item.orderNumber,
              wipCustomer: item.wipData.customerName,
              matchedClient: item.match.client_name,
              matchedId: item.id,
              fieldsUpdated: Object.keys(item.data)
            });
          }
        }
      }
    }

    // Collect debug info
    const sampleWipRows = Array.from(orderMap.entries()).slice(0, 5).map(([num, data]) => ({
      orderNumber: num,
      customer: data.customerName,
      description: data.description?.substring(0, 80)
    }));

    const sampleWorkOrders = allWorkOrders.slice(0, 5).map(wo => ({
      id: wo.id,
      client_name: wo.client_name,
      corbridge_invoice_number: wo.corbridge_invoice_number,
      est_inv_at: wo.est_inv_at,
    }));

    return Response.json({
      success: true,
      sheetsProcessed: sheetsToProcess.length,
      totalRows: orderMap.size,
      updated,
      notFound,
      matchedByOrderNum,
      matchedByClient,
      notFoundOrders: notFoundOrders.slice(0, 30),
      message: `Updated ${updated} work orders (${matchedByOrderNum} by order#, ${matchedByClient} by client name). ${notFound} not matched.`,
      debug: {
        totalWorkOrdersInDB: allWorkOrders.length,
        headers: allHeaders,
        sampleWipRows,
        sampleWorkOrders,
        sampleMatches: debugMatches,
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});