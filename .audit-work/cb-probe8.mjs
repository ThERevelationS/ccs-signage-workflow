import { get, post } from './cb-http.mjs';
import { extractJsonAfter, scrub, textOf, historyRows } from './cb-orderlib.mjs';
const id = Number(process.argv[2] || 9000);
const h = (await get(`/SalesModule/Orders/Order.aspx?OrderId=${id}`)).text;
const o = extractJsonAfter(h, 'var orderObj = ');
console.log('title', (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim(), 'keys', o && Object.keys(o).length);
console.log(o && Object.keys(o).join(','));
for (const body of [{ OrderId: id }, { OrderId: id, OrderStatus: o?.OrderStatus, OrderAccountId: o?.AccountId, OrderCompanyName: o?.CompanyName }]) {
  const r = await post('/Api/OrderViewBase/GetOrderProductsView', body);
  let n = '?'; try { n = JSON.parse(r.text).OrderProducts?.length; } catch {}
  console.log('products payload', Object.keys(body).length, r.status, r.text.length, 'products', n, r.text.slice(0, 100));
}
const notes = (await get(`/SalesModule/Orders/OrderView/OrderNotes.aspx?OrderId=${id}`)).text;
console.log('NOTES', textOf(notes).slice(0, 400));
const hist = (await get(`/SalesModule/Orders/OrderView/OrderHistory.aspx?OrderId=${id}&PageIndex=`)).text;
console.log('HIST', historyRows(hist).length, (hist.match(/PageIndex=\d+/g) || []).slice(0, 5));
console.log(JSON.stringify(scrub(o)).length);
