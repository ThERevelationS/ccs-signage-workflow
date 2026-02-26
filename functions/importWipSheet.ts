import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import XLSX from 'npm:xlsx@0.18.5';

// Parse date from sheet name like "WIP 2-23-26" or "WIP 2-23-2026"
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
        if (d) {
          installDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        } else {
          installDate = null;
        }
      } else if (typeof installDate === 'string') {
        const dateMatch = installDate.match(/(\d{4}-\d{2}-\d{2})/);
        installDate = dateMatch ? dateMatch[1] : null;
      }
    }

    results.push({
      orderNumber: orderNum,
      description: desc ? String(desc).trim() : null,
      installDate: installDate || null,
      sheetName
    });
  }
  return results;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { fileUrl, mode, batchOffset, workOrdersSnapshot } = body;

    // --- PHASE 1: Parse the file and return order list (no DB writes) ---
    if (!batchOffset && !workOrdersSnapshot) {
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
      const arrayBuffer = await fileRes.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });

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
        if (!latestSheet) {
          return Response.json({ error: 'Could not parse dates from WIP sheet names' }, { status: 400 });
        }
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
      for (const row of allRows) {
        orderMap.set(row.orderNumber, row);
      }

      // Fetch ALL work orders for matching
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

      // Build slim snapshot of work orders (only fields needed for matching + update)
      const snapshot = allWorkOrders.map(wo => ({
        id: wo.id,
        corbridge_invoice_number: wo.corbridge_invoice_number || '',
        est_inv_at: wo.est_inv_at || '',
        corbridge_link: wo.corbridge_link || '',
      }));

      // Pre-match orders to work order IDs
      const ordersToUpdate = [];
      const notFoundOrders = [];

      for (const [orderNumber, wipData] of orderMap.entries()) {
        const numericPart = orderNumber.replace(/^(INV|EST)-?/i, '');
        const match = snapshot.find(wo =>
          wo.corbridge_invoice_number === orderNumber ||
          wo.corbridge_invoice_number === numericPart ||
          wo.est_inv_at === orderNumber ||
          wo.est_inv_at === numericPart ||
          (wo.corbridge_link && wo.corbridge_link.includes(orderNumber)) ||
          (wo.corbridge_link && wo.corbridge_link.includes(numericPart))
        );

        if (!match) {
          notFoundOrders.push(orderNumber);
          continue;
        }

        const updateData = {};
        if (wipData.description) updateData.description = wipData.description;
        if (wipData.installDate) updateData.project_install_date = wipData.installDate;

        if (Object.keys(updateData).length > 0) {
          ordersToUpdate.push({ id: match.id, updateData });
        }
      }

      return Response.json({
        phase: 'parsed',
        sheetsProcessed: sheetsToProcess.length,
        totalRows: orderMap.size,
        ordersToUpdate,
        notFoundOrders: notFoundOrders.slice(0, 20),
        notFoundCount: notFoundOrders.length,
      });
    }

    // --- PHASE 2: Apply a batch of updates ---
    if (batchOffset !== undefined && workOrdersSnapshot) {
      const BATCH_SIZE = 10;
      const batch = workOrdersSnapshot.slice(batchOffset, batchOffset + BATCH_SIZE);

      let updatedInBatch = 0;
      for (const item of batch) {
        await base44.asServiceRole.entities.WorkOrder.update(item.id, item.updateData);
        updatedInBatch++;
      }

      return Response.json({
        phase: 'batch',
        updatedInBatch,
        nextOffset: batchOffset + BATCH_SIZE,
        done: batchOffset + BATCH_SIZE >= workOrdersSnapshot.length,
      });
    }

    return Response.json({ error: 'Invalid request' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});