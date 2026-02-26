import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { fileUrl, mode } = await req.json(); // mode: "latest" or "all"

    // Download the Excel file
    const fileRes = await fetch(fileUrl);
    const arrayBuffer = await fileRes.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const workbook = XLSX.read(data, { type: 'array' });

    // Find WIP sheets - they look like "WIP M-D-YY" or "WIP M-D"
    const wipSheets = workbook.SheetNames.filter(name => 
      /^WIP\s+\d/.test(name) && name !== 'Formulas'
    );

    if (wipSheets.length === 0) {
      return Response.json({ error: 'No WIP sheets found in this file' }, { status: 400 });
    }

    // Parse date from sheet name like "WIP 2-23-26" or "WIP 2-23-2026"
    const parseSheetDate = (name) => {
      const match = name.match(/WIP\s+(\d+)-(\d+)-(\d+)/);
      if (!match) return null;
      let [, month, day, year] = match;
      year = parseInt(year);
      if (year < 100) year += 2000;
      return new Date(year, parseInt(month) - 1, parseInt(day));
    };

    let sheetsToProcess = [];

    if (mode === 'latest') {
      // Find the most recent WIP sheet
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
      // All WIP sheets
      sheetsToProcess = wipSheets;
    }

    // Parse rows from a sheet - handles both column layouts (early sheets vs later sheets)
    const parseSheetRows = (sheetName) => {
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      
      // Find header row - look for row with "Order Number" or "Order Status"
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
      // Find column indices
      const findCol = (...names) => {
        for (const name of names) {
          const idx = headers.findIndex(h => h && typeof h === 'string' && h.trim().toLowerCase().includes(name.toLowerCase()));
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const orderNumCol = findCol('Order Number');
      const descCol = findCol('Order Description');
      // Install date: look for "Proj./Actual Install Date" or "Proj. Install Date"
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
        
        // Parse Excel date serial or string
        if (installDate !== null && installDate !== undefined) {
          if (typeof installDate === 'number') {
            // Excel serial date
            const d = XLSX.SSF.parse_date_code(installDate);
            if (d) {
              installDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
            } else {
              installDate = null;
            }
          } else if (typeof installDate === 'string') {
            // Might be "2024-03-15 00:00:00" or similar
            const dateMatch = installDate.match(/(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
              installDate = dateMatch[1];
            } else {
              installDate = null;
            }
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

    // Collect all rows from sheets to process
    const allRows = [];
    for (const sheetName of sheetsToProcess) {
      const rows = parseSheetRows(sheetName);
      allRows.push(...rows);
    }

    if (allRows.length === 0) {
      return Response.json({ error: 'No data rows found in selected sheets' }, { status: 400 });
    }

    // Build a map of orderNumber -> latest data (prefer later sheets)
    const orderMap = new Map();
    for (const row of allRows) {
      orderMap.set(row.orderNumber, row);
    }

    // Fetch all WorkOrders from database
    const workOrders = await base44.asServiceRole.entities.WorkOrder.list();

    let updated = 0;
    let notFound = 0;
    const notFoundOrders = [];

    for (const [orderNumber, wipData] of orderMap.entries()) {
      // Find matching work order by corbridge_invoice_number or corbridge_link or title containing the order number
      let match = workOrders.find(wo => 
        wo.corbridge_invoice_number === orderNumber ||
        (wo.corbridge_link && wo.corbridge_link.includes(orderNumber))
      );

      if (!match) {
        notFound++;
        notFoundOrders.push(orderNumber);
        continue;
      }

      // Build update payload
      const updateData = {};
      if (wipData.description) {
        updateData.description = wipData.description;
      }
      if (wipData.installDate) {
        updateData.project_install_date = wipData.installDate;
      }

      if (Object.keys(updateData).length > 0) {
        await base44.asServiceRole.entities.WorkOrder.update(match.id, updateData);
        updated++;
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