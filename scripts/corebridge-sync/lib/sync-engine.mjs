import { createHash, randomUUID } from 'node:crypto';
import { parseCursor, scanAbove, updateWatchOrders } from '../cursor.mjs';
import { estimateRecord, invoiceRecord, paymentRecord } from './order-model.mjs';
import { matchAccount, matchLead, normalizeLeadName } from './matching.mjs';
import { Journal } from './journal.mjs';

const clean = (value) => String(value ?? '').trim();
const cents = (value) => Math.round(Number(value || 0) * 100);
const valuesEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const empty = (value) => value === undefined || value === null || value === '';
const accountId = (header) => clean(header.AccountId || header.hfOrdAccountId || header.Account?.Id);
const accountName = (header) => clean(header.CompanyName || header.Account?.CompanyName);

function newest(rows) {
  return [...rows].sort((a, b) => clean(b.created_date).localeCompare(clean(a.created_date)) || clean(b.id).localeCompare(clean(a.id)))[0] || null;
}

async function resolveCustomer(app, id) {
  const seen = new Set();
  let currentId = clean(id);
  for (let hops = 0; ; hops++) {
    if (!currentId || seen.has(currentId)) throw new Error(`Customer merge chain for ${id} is invalid or cyclic.`);
    seen.add(currentId);
    const customer = await app.get('Customer', currentId);
    const next = clean(customer.merged_into_customer_id);
    if (next) {
      if (hops >= 5) throw new Error(`Customer merge chain for ${id} exceeds five hops.`);
      currentId = next;
      continue;
    }
    if (customer.deleted === true) throw new Error(`Customer ${currentId} is deleted.`);
    return customer;
  }
}

async function customerIdForLink(app, id, apply) {
  if (!id) return '';
  if (!apply && clean(id).startsWith('dry-customer:')) return clean(id);
  return (await resolveCustomer(app, id)).id;
}

function accountRow(order) {
  const h = order.header, a = h.Account || {}, id = accountId(h);
  const row = {
    __source_id__: id, company_name: accountName(h), company_phone: a.CompanyPhone || '',
    customer_status: a.IsActive === false ? 'inactive' : a.IsProspect === false ? 'active' : 'prospect',
    is_active: typeof a.IsActive === 'boolean' ? a.IsActive : undefined,
    pricing_tier: a.PricingTier == null ? undefined : Number(a.PricingTier?.value ?? a.PricingTier) || 1,
    terms: a.PaymentTermsName || a.PaymentTermsLabel || '', salesperson: a.SalespersonFullName || h.PrimarySalesPersonName || '',
    billing_address_1: h.BillingAddressStreet1 || a.BillingAddressStreet1 || '',
    billing_address_2: h.BillingAddressStreet2 || a.BillingAddressStreet2 || '',
    billing_city: h.BillingAddressCity || a.BillingAddressCity || '', billing_state: h.BillingAddressState || a.BillingAddressState || '',
    billing_postal_code: h.BillingAddressZip || a.BillingAddressZip || '',
    location_address_1: h.ShippingAddressStreet1 || a.ShippingAddressStreet1 || '',
    location_address_2: h.ShippingAddressStreet2 || a.ShippingAddressStreet2 || '',
    location_city: h.ShippingAddressCity || a.ShippingAddressCity || '', location_state: h.ShippingAddressState || a.ShippingAddressState || '',
    location_postal_code: h.ShippingAddressZip || a.ShippingAddressZip || '',
    contact_first_name: a.PrimaryContactFirstName || '', contact_last_name: a.PrimaryContactLastName || '',
    contact_email: a.PrimaryContactEmail || '', contact_office_phone: a.PrimaryContactPrimaryPhone || '',
    notes: `CoreBridge ID: ${id}\naccount_detail_pending: true`,
  };
  for (const key of Object.keys(row)) if (empty(row[key])) delete row[key];
  return row;
}

async function enrichMatchedCustomer(app, customer, order) {
  const row = accountRow(order);
  const patch = {};
  for (const [key, value] of Object.entries(row)) {
    if (!['__source_id__', 'company_name', 'customer_status', 'is_active', 'pricing_tier', 'notes'].includes(key) && empty(customer[key])) patch[key] = value;
  }
  const account = order.header.Account || {};
  if (account.IsActive === false || typeof account.IsProspect === 'boolean') {
    if (customer.customer_status !== row.customer_status) patch.customer_status = row.customer_status;
  }
  if (typeof account.IsActive === 'boolean' && customer.is_active !== row.is_active) patch.is_active = row.is_active;
  if (account.PricingTier != null && customer.pricing_tier !== row.pricing_tier) patch.pricing_tier = row.pricing_tier;
  const notes = clean(customer.notes);
  if (!notes.includes(`CoreBridge ID: ${row.__source_id__}`)) patch.notes = [customer.notes, row.notes].filter(Boolean).join('\n');
  else if (!notes.includes('account_detail_pending: true')) patch.notes = `${notes}\naccount_detail_pending: true`;
  return Object.keys(patch).length ? app.cas('Customer', customer, patch) : customer;
}

async function customerFor(order, context) {
  const { app, journal, apply, customers, report } = context;
  const id = accountId(order.header), name = accountName(order.header);
  if (!id || !name) return null;
  const maps = (await app.map('customers', id)).filter((row) => row.target_id && row.target_id !== '__error__');
  if (maps.length > 1 || maps.some((row) => row.target_entity !== 'Customer')) throw new Error(`Conflicting customer ledger ${id}.`);
  if (maps.length) {
    let customer = await resolveCustomer(app, maps[0].target_id);
    let notes = {};
    try { notes = JSON.parse(maps[0].notes || '{}'); } catch { /* Older ledgers may have unstructured notes. */ }
    if (apply && notes.account_detail_pending === true && notes.matched_existing === true) customer = await enrichMatchedCustomer(app, customer, order);
    return customer;
  }
  const row = accountRow(order), match = matchAccount(row, customers);
  if (match.kind === 'ambiguous') {
    report.skipped.push({ order_id: order.order_id, account_id: id, reason: 'multiple customer name/phone matches' });
    return null;
  }
  if (!apply) {
    const customer = match.matches[0] || { id: `dry-customer:${id}`, company_name: name };
    report.clients.push({ account_id: id, name, id: customer.id, action: match.kind === 'linked' ? 'linked' : 'created', account_detail_pending: true });
    return customer;
  }
  let customer;
  if (match.kind === 'linked') {
    customer = match.matches[0];
    await journal.linkCustomer(id, customer.id, order.order_id);
    customer = await enrichMatchedCustomer(app, customer, order);
  } else {
    const result = await journal.create({
      key: `cb:customers:${id}`, entity: 'Customer', source_entity: 'customers', source_id: id, order_id: order.order_id,
      write: () => app.importMapped('customers', row, 'cb-customers-2026-11-17', 'corebridge_account_sweep'),
    });
    customer = await resolveCustomer(app, result.target_id);
    customers.push(customer);
  }
  report.clients.push({ account_id: id, name, id: customer.id, action: match.kind === 'linked' ? 'linked' : 'created', account_detail_pending: true });
  return customer;
}

function historyLog(history) {
  return (history || []).map((entry) => {
    const match = clean(entry.at).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const at = match ? `${match[3]}-${match[1]}-${match[2]}T${String(Number(match[4]) % 12 + (/PM/i.test(match[6]) ? 12 : 0)).padStart(2, '0')}:${match[5]}:00` : clean(entry.at);
    return { text: `[CoreBridge] ${entry.event}`.slice(0, 4000), by: entry.user || '', at };
  });
}

async function estimateFor(order, customer, context, fromWatch = false) {
  const { app, journal, apply, report, references } = context;
  const id = String(order.order_id);
  const contactId = order.header.OrderContactId;
  if (contactId != null && contactId !== 0 && !references.contacts.has(contactId)) throw new Error(`Order ${id} contact ${contactId} missing from CoreBridge contact list.`);
  const mapped = estimateRecord(order, { contact: references.contacts.get(order.header.OrderContactId), categories: references.categories });
  const matches = await app.byKey('AllInOneEstimate', `cb:estimates:${id}`);
  if (matches.length > 1) throw new Error(`Duplicate estimate for order ${id}.`);
  let estimate = matches[0];
  let status = 'existing';
  if (!estimate) {
    if (!apply) {
      const planned = { ...mapped.row, id: `dry-estimate:${id}`, customer_id: customer.id, line_items: mapped.lines };
      report.estimates.push({ order_id: order.order_id, number: mapped.row.estimate_number, id: planned.id, action: 'created' });
      return planned;
    }
    const result = await journal.create({
      key: `cb:estimates:${id}`, entity: 'AllInOneEstimate', source_entity: 'estimates', source_id: id, order_id: order.order_id,
      write: () => app.importEstimate(mapped.row),
    });
    estimate = await app.get('AllInOneEstimate', result.target_id);
    status = result.status;
  } else {
    const map = await journal.goodLedger('estimates', id);
    if (!map || map.target_id !== estimate.id) throw new Error(`Estimate ${id} lacks matching ledger.`);
  }
  if (estimate.customer_id && estimate.customer_id !== customer.id &&
      await customerIdForLink(app, estimate.customer_id, apply) !== customer.id) throw new Error(`Estimate ${id} has another customer.`);
  const patch = {};
  if (estimate.customer_id !== customer.id) patch.customer_id = customer.id;
  if (mapped.row.estimate_number && estimate.estimate_number !== mapped.row.estimate_number) {
    patch.estimate_number = mapped.row.estimate_number;
  }
  if (estimate.status !== mapped.row.status) {
    patch.status = mapped.row.status;
    if (fromWatch) report.watched_changes.push({ order_id: order.order_id, entity: 'AllInOneEstimate', before: estimate.status, after: mapped.row.status });
  }
  if (!(estimate.line_items || []).length && mapped.lines.length) patch.line_items = mapped.lines;
  const log = historyLog(order.history);
  const existingLog = estimate.notes_log || [];
  const additions = log.filter((entry) => !existingLog.some((old) => old.text === entry.text && old.at === entry.at && old.by === entry.by));
  if (additions.length) patch.notes_log = [...existingLog, ...additions];
  if (order.notes_text && !clean(estimate.notes).includes('Order notes')) patch.notes = `${estimate.notes || ''}\n\nOrder notes${order.notes_important ? ' (IMPORTANT)' : ''}:\n${order.notes_text}`.trim();
  if ((estimate.line_items || []).length && order.detail_text && !clean(estimate.line_items[0].product_notes).includes('CoreBridge order detail')) {
    patch.line_items = estimate.line_items.map((line, index) => index === 0
      ? { ...line, product_notes: `${line.product_notes || ''}\n\nCoreBridge order detail (parts · price · cost · margin):\n${order.detail_text.slice(0, 20000)}` } : line);
  }
  if (apply && Object.keys(patch).length) estimate = await app.cas('AllInOneEstimate', estimate, patch);
  else estimate = { ...estimate, ...patch };
  report.estimates.push({ order_id: order.order_id, number: mapped.row.estimate_number, id: estimate.id, action: status });
  return estimate;
}

async function batchFor(context) {
  const found = await context.app.byKey('ReconciliationBatch', 'cb:reconciliation-batch:historical');
  if (found.length !== 1 || found[0].status !== 'closed') throw new Error('The closed CB-HISTORICAL batch was not uniquely found.');
  return found[0];
}

async function syncInvoice(order, customer, estimate, context, fromWatch = false) {
  const { app, journal, apply, report } = context;
  const source = String(order.order_id);
  const found = await app.byKey('Invoice', `cb:invoice:${source}`);
  if (found.length > 1) throw new Error(`Duplicate invoice for order ${source}.`);
  const links = apply ? await app.links(estimate.id) : { estimate_id: estimate.id, customer_id: customer.id, work_order_ids: [] };
  if (apply && links.customer_id !== customer.id) {
    if (await customerIdForLink(app, links.customer_id, apply) !== customer.id) throw new Error(`Invoice customer link changed for ${source}.`);
    links.customer_id = customer.id;
  }
  const invoice = invoiceRecord(order, links, { payments: order.payments || [], refunds: order.refunds || [] }, new Date().toISOString());
  const batch = await batchFor(context);
  let invoiceId = found[0]?.id;
  if (!invoiceId && apply) {
    const result = await journal.create({
      key: invoice.creation_request_key, entity: 'Invoice', source_entity: 'invoices', source_id: source, order_id: order.order_id,
      write: () => app.historyWrite('Invoice', { source_entity: 'invoices', source_id: source, data: invoice }),
    });
    invoiceId = result.target_id;
  } else if (invoiceId && apply) {
    const map = await journal.goodLedger('invoices', source);
    if (!map || map.target_id !== invoiceId) throw new Error(`Invoice ${source} lacks matching ledger.`);
    const current = await app.historyGet('Invoice', invoiceId);
    if (current.customer_id && current.customer_id !== customer.id &&
        await customerIdForLink(app, current.customer_id, apply) !== customer.id) throw new Error(`Invoice ${source} has another customer.`);
    if (current.estimate_id && current.estimate_id !== estimate.id) throw new Error(`Invoice ${source} has another estimate.`);
    const patch = {};
    for (const key of ['status', 'amount_paid', 'balance_due', 'paid_date', 'voided_date', 'void_reason']) {
      if (key in invoice && !valuesEqual(current[key], invoice[key])) patch[key] = invoice[key];
    }
    if (current.customer_id !== customer.id) patch.customer_id = customer.id;
    if (!current.estimate_id) patch.estimate_id = estimate.id;
    if (Object.keys(patch).length) await app.historyUpdate('Invoice', invoiceId, patch);
    if (fromWatch && Object.keys(patch).length) report.watched_changes.push({ order_id: order.order_id, entity: 'Invoice', fields: Object.keys(patch) });
  }
  report.invoices.push({ order_id: order.order_id, number: invoice.invoice_number, id: invoiceId || `dry-invoice:${source}`,
    estimate_id: estimate.id, action: found.length ? 'existing' : 'created' });
  if (!apply) {
    for (const item of [...(order.payments || []), ...(order.refunds || [])]) {
      report.transactions.push({ order_id: order.order_id, source_id: clean(item.Id), amount: Number(item.Amount || 0) });
    }
    return;
  }
  const bySource = new Map((order.payments || []).map((item) => [clean(item.Id), item]));
  const refunded = new Map();
  for (const refund of order.refunds || []) {
    const refs = [...new Set((refund.OrderPaymentRefundInfos || []).map((item) => clean(item.TransactionToRefundId)).filter(Boolean))];
    if (refs.length !== 1 || !bySource.has(refs[0])) throw new Error(`Refund ${refund.Id} has an unresolved parent.`);
    refunded.set(refs[0], (refunded.get(refs[0]) || 0) + Math.abs(cents(refund.Amount)));
  }
  const payments = new Map(), added = [];
  for (const refund of [false, true]) {
    for (const item of refund ? order.refunds || [] : order.payments || []) {
      const id = clean(item.Id);
      if (!id) throw new Error(`Order ${source} has a transaction with no ID.`);
      const data = {
        ...paymentRecord(item, invoice, refund, refunded.get(id)), invoice_id: invoiceId,
        reconciliation_batch_id: batch.id,
      };
      if (refund) {
        const parent = (item.OrderPaymentRefundInfos || []).map((entry) => clean(entry.TransactionToRefundId)).find(Boolean);
        data.refund_of_payment_id = payments.get(parent);
        if (!data.refund_of_payment_id) throw new Error(`Refund ${id} parent is unavailable.`);
      }
      const sourceEntity = refund ? 'refunds' : 'payments';
      const result = await journal.create({
        key: data.creation_request_key, entity: 'Payment', source_entity: sourceEntity, source_id: id, order_id: order.order_id,
        write: () => app.historyWrite('Payment', { source_entity: sourceEntity, source_id: id, data }),
      });
      if (!refund) payments.set(id, result.target_id);
      const old = await app.historyGet('Payment', result.target_id);
      if (cents(old.amount) !== cents(data.amount)) throw new Error(`Payment ${id} amount changed; batch reconciliation is required.`);
      const patch = {};
      for (const field of ['customer_id', 'estimate_id', 'work_order_id', 'invoice_id', 'reconciliation_batch_id', 'refund_of_payment_id']) {
        if (!data[field]) continue;
        if (old[field] && old[field] !== data[field]) {
          if (field !== 'customer_id' || await customerIdForLink(app, old[field], apply) !== data[field]) {
            throw new Error(`Payment ${id} has a conflicting ${field}.`);
          }
        }
        if (old[field] !== data[field]) patch[field] = data[field];
      }
      if (!refund) for (const key of ['refunded_amount', 'status']) if (!valuesEqual(old[key], data[key])) patch[key] = data[key];
      if (Object.keys(patch).length) await app.historyUpdate('Payment', result.target_id, patch);
      added.push({ id: result.target_id, amount: data.amount });
      report.transactions.push({ order_id: order.order_id, source_id: id, id: result.target_id, amount: data.amount, action: result.status });
    }
  }
  const fresh = await app.historyGet('ReconciliationBatch', batch.id);
  if (cents(fresh.expected_total) !== cents(fresh.collected_total) ||
      cents(fresh.expected_total) !== cents(fresh.expected_amount) || cents(fresh.expected_total) !== cents(fresh.collected_amount)) {
    throw new Error('CB-HISTORICAL totals disagree; refusing to overwrite.');
  }
  const existingIds = Array.isArray(fresh.payment_ids) ? fresh.payment_ids : [];
  const missing = added.filter((item) => !existingIds.includes(item.id));
  if (missing.length) {
    const difference = missing.reduce((sum, item) => sum + cents(item.amount), 0);
    const total = (cents(fresh.expected_total) + difference) / 100;
    await app.historyUpdate('ReconciliationBatch', batch.id, {
      payment_ids: [...existingIds, ...missing.map((item) => item.id)], payment_count: existingIds.length + missing.length,
      expected_total: total, collected_total: total, expected_amount: total, collected_amount: total,
      adjustments_amount: 0, cash_adjustment: 0, variance: 0, variance_amount: 0,
    });
  }
}

function shouldWatch(order, estimate) {
  if (order.header.InvoiceNumber) return !['VOIDED', 'CANCELLED'].includes(clean(order.header.OrderStatus).toUpperCase()) && Number(order.header.BalanceDue || 0) > 0;
  return !['cancelled', 'archived'].includes(estimate.status);
}

async function pipeline(context) {
  const { app, apply, journal, customers, estimates, report } = context;
  const jobs = await app.list('WorkOrder');
  const groups = new Map();
  const numberIndex = new Map();
  for (const estimate of estimates) {
    const digits = clean(estimate.estimate_number).replace(/\D/g, '');
    if (!digits || !estimate.id) continue;
    if (!numberIndex.has(digits)) numberIndex.set(digits, []);
    numberIndex.get(digits).push(estimate);
  }
  for (const row of jobs) {
    if (row.deleted === true) continue;
    if (!row.estimate_id) {
      const digits = clean(row.est_inv_at).split(/[^0-9]+/).filter(Boolean);
      const all = [...new Map(digits.flatMap((number) => numberIndex.get(number) || []).map((item) => [item.id, item])).values()];
      const nonVoid = all.filter((item) => !/-V$/i.test(item.estimate_number || ''));
      const candidates = nonVoid.length ? nonVoid : all;
      if (candidates.length === 1) {
        const target = candidates[0];
        const targetCustomerId = await customerIdForLink(app, target.customer_id, apply);
        if (row.customer_id && targetCustomerId && row.customer_id !== targetCustomerId &&
            await customerIdForLink(app, row.customer_id, apply) !== targetCustomerId) {
          report.skipped.push({ workorder_id: row.id, reason: 'estimate and WorkOrder customers differ' });
          continue;
        }
        const patch = { estimate_id: target.id };
        if (targetCustomerId && row.customer_id !== targetCustomerId) patch.customer_id = targetCustomerId;
        if (apply) {
          const fresh = await app.get('WorkOrder', row.id);
          if (fresh.estimate_id || (patch.customer_id && clean(fresh.customer_id) !== clean(row.customer_id))) throw new Error(`WorkOrder ${row.id} changed before linking.`);
          await app.cas('WorkOrder', fresh, patch);
        }
        report.pipeline_links.push({ id: row.id, ...patch });
        continue;
      }
      if (candidates.length > 1) {
        report.skipped.push({ workorder_id: row.id, reason: 'ambiguous estimate match' });
        continue;
      }
    }
    if (row.customer_id) continue;
    if (row.estimate_id) {
      const estimate = estimates.find((item) => item.id === row.estimate_id) || await app.get('AllInOneEstimate', row.estimate_id);
      if (estimate.customer_id) {
        const customerId = await customerIdForLink(app, estimate.customer_id, apply);
        if (apply) {
          const fresh = await app.get('WorkOrder', row.id);
          if (fresh.customer_id || fresh.estimate_id !== row.estimate_id) throw new Error(`WorkOrder ${row.id} changed before linking.`);
          await app.cas('WorkOrder', fresh, { customer_id: customerId });
        }
        report.pipeline_links.push({ id: row.id, customer_id: customerId });
      }
      continue;
    }
    if (/\d/.test(clean(row.est_inv_at))) continue;
    const match = matchLead(row.client_name, customers);
    if (match.kind === 'ambiguous' || match.kind === 'invalid') {
      report.skipped.push({ workorder_id: row.id, reason: `lead match ${match.kind}` });
      continue;
    }
    if (match.kind === 'linked') {
      if (apply) {
        const fresh = await app.get('WorkOrder', row.id);
        if (fresh.customer_id || fresh.estimate_id || normalizeLeadName(fresh.client_name) !== normalizeLeadName(row.client_name)) throw new Error(`Lead ${row.id} changed before linking.`);
        await app.cas('WorkOrder', fresh, { customer_id: match.matches[0].id });
      }
      report.pipeline_links.push({ id: row.id, customer_id: match.matches[0].id });
      continue;
    }
    const key = normalizeLeadName(row.client_name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const mostCommon = (values) => {
    const counts = new Map();
    for (const value of values.map(clean).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
  };
  for (const rows of groups.values()) {
    const ids = rows.map((row) => row.id).sort();
    const sourceId = `pipeline-lead:${createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 24)}`;
    const name = mostCommon(rows.map((row) => row.client_name));
    const nameParts = mostCommon(rows.map((row) => row.contact_name)).split(/\s+/).filter(Boolean);
    const row = {
      __source_id__: sourceId, company_name: name, customer_status: 'prospect',
      notes: `Created from Sales Pipeline lead row(s) ${ids.join(', ')} — no CoreBridge estimate`,
      contact_first_name: nameParts[0] || '', contact_last_name: nameParts.slice(1).join(' '),
      contact_email: mostCommon(rows.map((item) => item.contact_email)),
      contact_office_phone: mostCommon(rows.map((item) => item.contact_phone)),
      billing_address_1: mostCommon(rows.map((item) => item.billing_address)),
      billing_address_2: mostCommon(rows.map((item) => item.billing_address_line_2)),
      location_address_1: mostCommon(rows.map((item) => item.install_location)),
      location_address_2: mostCommon(rows.map((item) => item.address_line_2)),
    };
    for (const key of Object.keys(row)) if (empty(row[key])) delete row[key];
    let customerId = `dry-customer:${sourceId}`;
    if (apply) {
      const freshCustomers = await app.list('Customer');
      const match = matchLead(name, freshCustomers);
      if (match.kind !== 'new') throw new Error(`Lead ${name} now has a Customer match; regenerate the plan.`);
      const result = await journal.create({
        key: `cb:customers:${sourceId}`, entity: 'Customer', source_entity: 'customers', source_id: sourceId, order_id: null,
        write: () => app.importMapped('customers', row, 'cb-customers-2026-11-17', 'sales_pipeline_leads'),
      });
      customerId = result.target_id;
      customers.push(await app.get('Customer', customerId));
    }
    report.clients.push({ id: customerId, name, action: 'created', source: 'pipeline_lead' });
    for (const job of rows) {
      if (apply) {
        const fresh = await app.get('WorkOrder', job.id);
        if (fresh.customer_id || fresh.estimate_id || /\d/.test(clean(fresh.est_inv_at)) || normalizeLeadName(fresh.client_name) !== normalizeLeadName(job.client_name)) {
          throw new Error(`Lead ${job.id} changed before linking.`);
        }
        await app.cas('WorkOrder', fresh, { customer_id: customerId });
      }
      report.pipeline_links.push({ id: job.id, customer_id: customerId });
    }
  }
}

async function syncInvoiceWorkOrderLinks(context) {
  if (!context.apply) return;
  for (const invoice of context.report.invoices) {
    const links = await context.app.links(invoice.estimate_id);
    if (links.work_order_ids.length !== 1) continue;
    const workOrderId = links.work_order_ids[0];
    const current = await context.app.historyGet('Invoice', invoice.id);
    if (current.work_order_id && current.work_order_id !== workOrderId) {
      context.report.skipped.push({ order_id: invoice.order_id, reason: 'invoice already has a different WorkOrder' });
      continue;
    }
    if (!current.work_order_id) await context.app.historyUpdate('Invoice', invoice.id, { work_order_id: workOrderId });
    for (const payment of context.report.transactions.filter((item) => item.order_id === invoice.order_id && item.id)) {
      const currentPayment = await context.app.historyGet('Payment', payment.id);
      if (currentPayment.work_order_id && currentPayment.work_order_id !== workOrderId) {
        context.report.skipped.push({ order_id: invoice.order_id, payment_id: payment.id, reason: 'payment already has a different WorkOrder' });
        continue;
      }
      if (!currentPayment.work_order_id) await context.app.historyUpdate('Payment', payment.id, { work_order_id: workOrderId });
    }
  }
}

export async function runSync({ app, capture, captureAccount = null, references = { contacts: new Map(), categories: new Map() }, apply = false, maxOrders = 500, maxAccounts = 200, now = () => Date.now(), runId = randomUUID(), captureFixture = null }) {
  if (!Number.isSafeInteger(maxOrders) || maxOrders < 1 || !Number.isSafeInteger(maxAccounts) || maxAccounts < 1) throw new Error('Safety caps must be positive integers.');
  const report = {
    mode: apply ? 'apply' : 'dry-run', run_id: runId, clients: [], estimates: [], invoices: [], transactions: [], watched_changes: [],
    pipeline_links: [], skipped: [], errors: [], warnings: ['account scan disabled: parser pending'], cursor_before: null, cursor_after: null,
    capture_fixture: captureFixture,
  };
  let locked = false, heartbeatAt = now() + 10 * 60000;
  const heartbeat = async () => {
    if (!apply || now() < heartbeatAt) return;
    const result = await app.lock('heartbeat', runId);
    if (!result.acquired) throw new Error(`Sync lease lost: ${result.reason || 'heartbeat failed'}.`);
    heartbeatAt = now() + 10 * 60000;
  };
  try {
    const cursorRows = await app.list('LegacyMigrationMap', { source_app_id: 'corebridge', source_entity: '__sync_cursor__' });
    const initial = parseCursor(newest(cursorRows));
    const cursor = structuredClone(initial);
    report.cursor_before = initial;
    report.cursor_after = structuredClone(initial);
    if (apply) {
      const result = await app.lock('claim', runId, 360);
      if (!result.acquired) {
        if (result.reason === 'already_running') { report.warnings.push('already running'); report.already_running = true; return report; }
        throw new Error(`Sync lock unavailable: ${result.reason || 'unknown'}.`);
      }
      locked = true;
      app.beforeWrite = heartbeat;
    }
    const journal = new Journal(app, runId);
    if (apply) {
      const unresolved = await journal.recover();
      if (unresolved.length) {
        report.skipped.push(...unresolved.map((item) => ({ key: item.key, order_id: item.order_id, reason: 'unresolved pending write' })));
        throw new Error('Unresolved pending writes prevent cursor advancement.');
      }
    }
    const customers = (await app.list('Customer')).filter((row) => row.id && row.deleted !== true && !row.merged_into_customer_id);
    const context = { app, journal, apply, customers, report, references, estimates: [] };
    let fixtureAttempted = false;
    async function processOrder(order, fromWatch = false) {
      await heartbeat();
      if (captureFixture && captureAccount && !fixtureAttempted) {
        fixtureAttempted = true;
        try {
          const path = await captureAccount(order.account_list_href, cursor.last_account_id + 1, captureFixture);
          report.warnings.push(`Raw account fixture saved to ${path}; contains private data and must be sanitized before committing.`);
        } catch (error) {
          report.warnings.push(`Account fixture not captured: ${clean(error.message)}.`);
        }
      }
      const customer = await customerFor(order, context);
      if (!customer) {
        const candidate = { order_id: order.order_id, account_id: accountId(order.header), account_name: accountName(order.header) };
        if (!candidate.account_id || !candidate.account_name) throw new Error(`Order ${order.order_id} is missing its account identity.`);
        cursor.pending_account_orders = [...cursor.pending_account_orders.filter((item) => item.order_id !== order.order_id), candidate];
        report.skipped.push({ ...candidate, reason: 'account unavailable or ambiguous' });
        return;
      }
      const estimate = await estimateFor(order, customer, context, fromWatch);
      context.estimates.push(estimate);
      if (order.header.InvoiceNumber) await syncInvoice(order, customer, estimate, context, fromWatch);
      cursor.pending_account_orders = cursor.pending_account_orders.filter((item) => item.order_id !== order.order_id);
      const watched = updateWatchOrders(cursor.watch_orders, order.order_id, shouldWatch(order, estimate));
      cursor.watch_orders = watched.watch_orders;
      if (watched.dropped.length) report.warnings.push(`Dropped oldest watched orders: ${watched.dropped.join(', ')}`);
    }
    const revisits = [...new Set([...cursor.pending_account_orders.map((item) => item.order_id), ...cursor.watch_orders])];
    for (const id of revisits) {
      const order = await capture(id);
      if (!order) { report.skipped.push({ order_id: id, reason: 'pending or watched order did not load' }); continue; }
      await processOrder(order, cursor.watch_orders.includes(id));
    }
    const scan = await scanAbove({
      high: cursor.last_order_id, missLimit: 25, maxRecords: maxOrders,
      probe: capture, processRecord: (order) => processOrder(order),
    });
    cursor.last_order_id = scan.lastProcessed;
    if (scan.capReached) report.warnings.push(`Order cap ${maxOrders} reached.`);
    await pipeline(context);
    await syncInvoiceWorkOrderLinks(context);
    report.cursor_after = structuredClone(cursor);
    if (apply) {
      const note = JSON.stringify({ cursor, summary: { clients: report.clients, estimates: report.estimates, invoices: report.invoices,
        transactions: report.transactions, watched_changes: report.watched_changes, pipeline_links: report.pipeline_links, skipped: report.skipped, warnings: report.warnings } });
      await app.appendMap({ source_app_id: 'corebridge', source_entity: '__sync_cursor__', source_id: runId,
        target_entity: '__sync_cursor__', target_id: runId, notes: note });
    }
  } catch (error) {
    report.errors.push(clean(error?.message || 'Sync failed.'));
    report.cursor_after = structuredClone(report.cursor_before);
  } finally {
    app.beforeWrite = null;
    if (locked) {
      try {
        const result = await app.lock('release', runId);
        if (!result.released) report.warnings.push(`Lock release not confirmed: ${result.reason || 'unknown'}.`);
      } catch { report.warnings.push('Lock release could not be confirmed.'); }
    }
  }
  return report;
}
