export function extractJsonAfter(html, marker) {
  const position = html.indexOf(marker);
  if (position < 0) return null;
  const start = html.indexOf('{', position + marker.length);
  if (start < 0) throw new Error('Order object is malformed.');
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error('Order object is incomplete.');
}

const SECRET = /password|passwd|hash|cvv|cardnumber|card_number|ccnumber|securitycode|slicekey|token|apikey|api_key/i;
export function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET.test(key)) continue;
    if (Array.isArray(item) && item.length && item.every((x) => x && typeof x === 'object' && 'Text' in x && 'Value' in x)) {
      const selected = item.find((x) => x.Selected);
      out[`${key}__selected`] = selected ? { Text: selected.Text, Value: selected.Value } : null;
    } else out[key] = scrub(item);
  }
  return out;
}

const decode = (value) => String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export function textOf(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

export function historyRows(html) {
  const rows = [];
  for (const tr of String(html).match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(textOf);
    if (cells.length >= 3 && !/^\d+(\s+\d+)*$/.test(cells[0])) rows.push({ event: cells[0], at: cells[1], user: cells[2], extra: cells.slice(3) });
  }
  return rows;
}

function unwrap(body, label) {
  let value;
  try {
    value = JSON.parse(body);
    value = value.d ?? value;
    if (typeof value === 'string') value = JSON.parse(value);
  } catch { throw new Error(`Invalid ${label} response.`); }
  return value;
}

export async function loadOrderReferences(session) {
  const post = async (path, data) => {
    const response = await session.request(path, {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(data),
    });
    if (/login\.aspx/i.test(response.headers.get('location') || '')) throw new Error('CoreBridge session expired.');
    if (!response.ok) throw new Error(`CoreBridge reference read failed: HTTP ${response.status}.`);
    return unwrap(await response.text(), 'reference');
  };
  const categoryData = await post('/SalesModule/Orders/OrderEntry.asmx/GetProductCategories', {});
  if (!Array.isArray(categoryData?.productCategories)) throw new Error('Product category reference is unavailable.');
  const categories = new Map(categoryData.productCategories.map((item) => [item.id, item.name]));
  const contacts = new Map();
  for (let start = 0; ; start += 500) {
    if (start >= 100000) throw new Error('Contact reference exceeds the safety limit.');
    const data = await post('/SalesModule/Contacts/Contact.asmx/GetAllContacts', {
      txSearch: '', sSearch_1: '', sSearch_2: '', sSearch_6: '', sSearch_7: '', sSearch_8: '', sSearch_9: '',
      pageIndex: Math.floor(start / 500) + 1, iDisplayStart: start, iDisplayLength: 500,
      includeInactiveCompanies: true, includeInactiveContacts: true, sEcho: 1, sColumns: '', iColumns: 0, iSortCol_0: 0, sSortDir_0: 'asc',
    });
    if (!Array.isArray(data?.aaData) || !Number.isFinite(Number(data.iTotalRecords))) throw new Error('Contact reference is unavailable.');
    for (const row of data.aaData) {
      if (row.Id == null || contacts.has(row.Id)) throw new Error('Contact reference has missing or duplicate IDs.');
      contacts.set(row.Id, scrub(row));
    }
    if (contacts.size >= Number(data.iTotalRecords)) break;
    if (!data.aaData.length) throw new Error('Contact reference pagination ended early.');
  }
  return { categories, contacts };
}

export async function captureOrder(session, id) {
  const get = async (path, allowMissing = false) => {
    const response = await session.request(path);
    const location = response.headers.get('location') || '';
    if (/login\.aspx/i.test(location)) throw new Error('CoreBridge session expired.');
    if (allowMissing && [404, 500].includes(response.status)) return null;
    if (!response.ok) throw new Error(`CoreBridge read failed: HTTP ${response.status}.`);
    const body = await response.text();
    if (/name=["']txtPassword["']/i.test(body)) throw new Error('CoreBridge session expired.');
    return body;
  };
  const post = async (path, data) => {
    const response = await session.request(path, {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(data),
    });
    if (/login\.aspx/i.test(response.headers.get('location') || '')) throw new Error('CoreBridge session expired.');
    if (!response.ok) throw new Error(`CoreBridge read failed: HTTP ${response.status}.`);
    return unwrap(await response.text(), 'CoreBridge');
  };
  const html = await get(`/SalesModule/Orders/Order.aspx?OrderId=${id}`, true);
  if (html === null) return null;
  const header = extractJsonAfter(html, 'var orderObj = ');
  if (!header?.Id) return null;
  if (Number(header.Id) !== id) throw new Error(`Order ${id} returned a different ID.`);
  if (!header.AccountId) {
    const tag = (html.match(/<input\b[^>]*\bid=["']hfOrdAccountId["'][^>]*>/i) || [])[0] || '';
    header.AccountId = (tag.match(/\bvalue=["']([^"']*)["']/i) || [])[1] || header.AccountId;
  }
  const productData = await post('/Api/OrderViewBase/GetOrderProductsView', {
    OrderId: id, OrderStatus: header.OrderStatus, OrderAccountId: header.AccountId, OrderCompanyName: header.CompanyName,
  });
  if (productData.IsSuccess === false || !Array.isArray(productData.OrderProducts)) throw new Error(`Order ${id} product capture failed.`);
  const detail = await get(`/SalesModule/Orders/DetailedOrderView.aspx?orderId=${id}`);
  const payments = await post('/SalesModule/Reports/Reports.asmx/GetOrderPayments2', { OrderId: id, IsPaymentHistoryOverride: true });
  const refunds = await post('/SalesModule/Reports/Reports.asmx/GetOrderRefunds', { OrderId: id, IsPaymentHistoryOverride: true });
  const paymentRows = payments?.ReportResults ?? payments;
  const refundRows = refunds?.ReportResults ?? refunds;
  if (!Array.isArray(paymentRows) || !Array.isArray(refundRows)) throw new Error(`Order ${id} transaction capture failed.`);
  const notes = await get(`/SalesModule/Orders/OrderView/OrderNotes.aspx?OrderId=${id}`);
  const tag = (notes.match(/<input[^>]*id=["']hdnOrderNotes["'][^>]*>/i) || [])[0] || '';
  const notesHtml = decode((tag.match(/value=["']([^"']*)["']/i) || [])[1] || '');
  const history = [];
  let page = 1, last = 1;
  do {
    const h = await get(`/SalesModule/Orders/OrderView/OrderHistory.aspx?OrderId=${id}&PageIndex=${page === 1 ? '' : page}`);
    history.push(...historyRows(h));
    last = Math.max(last, ...[...h.matchAll(/Page\$(\d+)/g)].map((m) => Number(m[1])));
    if (last > 200) throw new Error(`Order ${id} history exceeds page limit.`);
    page++;
  } while (page <= last);
  return {
    order_id: id, title: textOf((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]),
    header: scrub(header), products: scrub(productData.OrderProducts), detail_text: textOf(detail),
    notes_text: textOf(notesHtml), notes_important: /id=["']chkMarkedAsImportant["'][^>]*checked/i.test(notes),
    history: scrub(history), payments: scrub(paymentRows), refunds: scrub(refundRows),
    account_list_href: decode(((html.match(/<a\b[^>]*\bid=["']hlAccounts["'][^>]*>/i) || [])[0]?.match(/\bhref=["']([^"']+)["']/i) || [])[1] || ''),
  };
}
