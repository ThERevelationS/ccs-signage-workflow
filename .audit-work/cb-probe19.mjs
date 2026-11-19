import { get } from './cb-http.mjs';
const t = (await get('/SalesModule/Orders/OrderView/OrderNotes.aspx?OrderId=9000')).text;
console.log(t.length);
const body = t.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ');
console.log(body.slice(0, 3000));
