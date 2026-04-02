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
  if (headerRowIdx === -1) return [];

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
  const installDateCol = findCol('Proj./Actual Install Date', 'Proj. Install Date');

  if (orderNumCol === -1) return [];

  const results = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[orderNumCol]) continue;
    const orderNum = String(row[orderNumCol]).trim();
    if (!orderNum || orderNum === 'Order Number') continue;

    const desc = descCol !== -1 ? row[descCol] : null;
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
      installDate: installDate || null,
    });
  }
  return results;
};

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

    const allRows = [];
    for (const sheetName of sheetsToProcess) {
      allRows.push(...parseSheetRows(workbook, sheetName));
    }

    if (allRows.length === 0) {
      return Response.json({ error: 'No data rows found in selected sheets' }, { status: 400 });
    }

    // Deduplicate - later sheet wins
    const orderMap = new Map();
    for (const row of allRows) orderMap.set(row.orderNumber, row);

    // Fetch all work orders
    let allWorkOrders = [];
    let skip = 0;
    const pageSize = 200;
    while (true) {
      const page = await base44.asServiceRole.entities.WorkOrder.list('created_date', pageSize, skip);
      if (!Array.isArray(page) || page.length === 0) break;
      allWorkOrders = allWorkOrders.concat(page);
      if (page.length < pageSize) break;
      skip += pageSize;
    }

    // Match and update - with delay to avoid rate limits
    let updated = 0;
    let notFound = 0;
    const notFoundOrders = [];

    for (const [orderNumber, wipData] of orderMap.entries()) {
      const numericPart = orderNumber.replace(/^(INV|EST)-?/i, '');
      const match = allWorkOrders.find(wo => {
        const inv = wo.corbridge_invoice_number || '';
        const est = wo.est_inv_at || '';
        const link = wo.corbridge_link || '';
        return inv === orderNumber || inv === numericPart ||
               est === orderNumber || est === numericPart ||
               link.includes(orderNumber) || link.includes(numericPart);
      });

      if (!match) {
        notFound++;
        notFoundOrders.push(orderNumber);
        continue;
      }

      const updateData = {};
      if (wipData.description) updateData.description = wipData.description;
      if (wipData.installDate) updateData.project_install_date = wipData.installDate;

      if (Object.keys(updateData).length > 0) {
        // Retry with backoff on rate limit
        let attempts = 0;
        while (attempts < 4) {
          try {
            await base44.asServiceRole.entities.WorkOrder.update(match.id, updateData);
            updated++;
            break;
          } catch (e) {
            if (e.message && e.message.includes('429')) {
              attempts++;
              await sleep(500 * attempts);
            } else {
              throw e;
            }
          }
        }
        // Small delay between updates to stay under rate limits
        await sleep(100);
      }
    }

    return Response.json({
      success: true,
      sheetsProcessed: sheetsToProcess.length,
      totalRows: orderMap.size,
      updated,
      notFound,
      notFoundOrders: notFoundOrders.slice(0, 20),
      message: `Updated ${updated} work orders. ${notFound} order numbers not found in database.`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});