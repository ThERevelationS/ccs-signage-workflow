import { get } from './cb-http.mjs';
const r = await get('/SalesModule/Orders/Order.aspx?OrderId=9000');
console.log(r.status, r.text.length, (r.text.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim());
