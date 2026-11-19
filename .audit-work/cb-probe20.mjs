import { get } from './cb-http.mjs';
for (const id of [2, 1033, 5000, 8000, 10500]) {
  const nh = (await get(`/SalesModule/Orders/OrderView/OrderNotes.aspx?OrderId=${id}`)).text;
  const tag = (nh.match(/<input[^>]*id="hdnOrderNotes"[^>]*>/i) || [])[0] || '';
  console.log(id, tag.slice(0, 300));
}
