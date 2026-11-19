// Build AllInOneEstimate import rows (header via manageMigration 'estimates' mapper) + frozen line items
// from the CoreBridge order archive. Every line carries CoreBridge's sell price as total_snapshot.
const fs = require('fs');
const D = 'imports/corebridge-2026-11-16/';
const jl = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const orders = jl(D + 'orders/orders.jsonl');
const pass2 = new Map(jl(D + 'orders/orders-pass2.jsonl').map((r) => [r.order_id, r]));
const contacts = new Map(JSON.parse(fs.readFileSync(D + 'reference/crm_contacts.json', 'utf8')).data.map((c) => [c.Id, c]));
const cats = new Map((JSON.parse(fs.readFileSync(D + 'reference/product_categories.json', 'utf8')).data.productCategories || []).map((c) => [c.id, c.name]));
const STATUS = { ESTIMATE: 'sent', 'DRAFT ESTIMATE': 'archived', DRAFT: 'archived', CANCELLED: 'cancelled', VOIDED: 'cancelled', WIP: 'approved', BUILT: 'approved', COMPLETED: 'approved', CLOSED: 'approved', INVOICED: 'approved' };
const day = (d) => (d && d.DateTimeOffset ? String(d.DateTimeOffset).slice(0, 10) : '');
const ts = (d) => (d && d.DateTimeOffset ? new Date(d.DateTimeOffset).toISOString() : '');
const linePrice = (p) => { const t = Number(p.TotalPriceOverridden ?? p.TotalPrice ?? 0); if (t) return t; const tx = Number(p.TaxableAmount || 0) + Number(p.NonTaxableAmount || 0); return tx || Number(p.CalculatedPartsTotalRetail || 0); };
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const header = [], lines = {}, problems = [];
for (const o of orders) {
  const h = o.header;
  const number = h.InvoiceNumber || h.EstimateNumber || (o.title.match(/#\s*([A-Z]+-\d+)/) || [])[1] || '';
  const status = STATUS[h.OrderStatus] || 'archived';
  const prods = (o.products || []).slice().sort((a, b) => (a.LineItemOrder || 0) - (b.LineItemOrder || 0));
  const p2 = pass2.get(o.order_id);
  const c = contacts.get(h.OrderContactId);
  const subtotal = prods.reduce((s, p) => s + linePrice(p), 0);
  const fees = Number(h.TotalPrice || 0) ? Number(h.ShippingAmount || 0) + Number(h.PostageAmount || 0) : 0;
  const tax = Number(h.TaxesPrice || 0);
  const total = Number(h.TotalPrice || 0);
  const cbTaxBase = Number(h.TaxableAmount || 0) + Number(h.NonTaxableAmount || 0);
  const cbSub = cbTaxBase > 0 && cbTaxBase < Number(h.SubTotalPrice || 0) - 0.005 ? cbTaxBase : Number(h.SubTotalPrice || 0);
  const discPct = subtotal > 0 && cbSub > 0 && cbSub < subtotal - 0.005 ? ((subtotal - cbSub) / subtotal) * 100 : 0;
  const afterDisc = subtotal * (1 - discPct / 100);
  const taxPct = afterDisc + fees > 0 ? (tax / (afterDisc + fees)) * 100 : 0;
  const recomputed = afterDisc + fees + (afterDisc + fees) * (taxPct / 100);
  if (Math.abs(recomputed - total) > 0.02) problems.push({ order_id: o.order_id, number, total, recomputed: r2(recomputed), subtotal: r2(subtotal), fees, tax });
  const addr = [h.ShippingAddressStreet1, h.ShippingAddressStreet2, h.ShippingAddressCity, h.ShippingAddressState, h.ShippingAddressZip].filter(Boolean).join(', ');
  const noteParts = [
    `CoreBridge ${number || 'order'} (OrderId ${o.order_id}) — imported read-only history ${new Date().toISOString().slice(0, 10)}.`,
    `CoreBridge status: ${h.OrderStatus}${h.EstimateCancelledDate ? `; cancelled ${day(h.EstimateCancelledDate)}` : ''}. Entered by ${h.EnteredByUserName || '?'}.`,
    `Totals: subtotal $${r2(h.SubTotalPrice)} · tax $${r2(tax)} (rate ${r2(Number(h.SalesTaxRate || 0) * 100)}%) · total $${r2(total)} · balance due $${r2(h.BalanceDue)}.`,
    o.notes_text ? `Order notes${o.notes_important ? ' (IMPORTANT)' : ''}:\n${o.notes_text}` : '',
  ].filter(Boolean);
  header.push({
    __source_id__: String(o.order_id),
    project_name: (h.Description || number || 'CoreBridge order').slice(0, 300),
    estimate_number: number,
    client_name: h.CompanyName || '',
    customer_id: String(h.AccountId || ''),
    contact_name: c ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() : '',
    contact_email: c?.Email || '',
    contact_phone: c?.PrimaryPhoneNumber || '',
    salesperson: h.PrimarySalesPersonName || '',
    sales_center: h.SalesCenterName || '',
    po_number: h.PoNumber || '',
    status,
    tax_percent: Math.round(taxPct * 10000) / 10000,
    quote_total: r2(total),
    total_cost: r2(total),
    shipping_fee: total ? r2(fees) : 0,
    discount_percent: Math.round(discPct * 10000) / 10000,
    quote_issue_date: day(h.EstimateCreatedDate) || day(h.CreatedDate),
    target_install_date: day(h.DueDate),
    accepted_at: status === 'approved' ? (ts(h.OrderCreatedDate) || ts(h.CreatedDate)) : '',
    site_address: addr,
    tags: 'corebridge_import',
    notes: noteParts.join('\n\n'),
  });
  const detailText = p2?.detail_text || '';
  lines[o.order_id] = prods.map((p, i) => {
    const price = linePrice(p);
    return {
      line_id: `cb-${p.Id}`,
      builder_name: (p.Description || `Product ${i + 1}`).slice(0, 300),
      client_product_name: (p.Description || '').slice(0, 300),
      product_category: cats.get(p.ProductCategoryId) || '',
      customer_description: [p.ProductSummary, p.Qty ? `Qty ${p.Qty}` : ''].filter(Boolean).join(' · '),
      customer_quantity: 1,
      total_snapshot: r2(price),
      live_total_snapshot: r2(price),
      include_in_customer: true,
      section_status: p.OrderProductStatusCbText || '',
      product_notes: [`CoreBridge product ${p.Id} · status ${p.OrderProductStatusCbText || p.Status} · qty ${p.Qty}`, p.DesignNotes ? `Design notes: ${p.DesignNotes}` : '', p.ProductionNotes ? `Production notes: ${p.ProductionNotes}` : '', p.ProofFileName ? `Proof: ${p.ProofFileName}` : ''].filter(Boolean).join('\n'),
    };
  });
  if (detailText && lines[o.order_id].length) lines[o.order_id][0].product_notes += `\n\nCoreBridge order detail (parts · price · cost · margin):\n${detailText.slice(0, 20000)}`;
}
fs.writeFileSync(D + 'rows-estimates.json', JSON.stringify(header));
fs.writeFileSync(D + 'rows-estimate-lines.json', JSON.stringify(lines));
fs.writeFileSync(D + 'estimate-total-check.json', JSON.stringify(problems, null, 1));
const st = {}; for (const h of header) st[h.status] = (st[h.status] || 0) + 1;
console.log({ estimates: header.length, lines: Object.values(lines).reduce((s, l) => s + l.length, 0), with_pass2: [...pass2.keys()].length, total_mismatch: problems.length, statuses: st });
console.log(problems.slice(0, 5));
