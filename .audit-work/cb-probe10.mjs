import { get } from './cb-http.mjs';
for (const id of [10, 100, 500, 900, 1500, 3000, 6000]) {
  const r = await get(`/SalesModule/Orders/Order.aspx?OrderId=${id}`);
  console.log(id, r.status, ((r.text.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim().slice(0, 60));
}
