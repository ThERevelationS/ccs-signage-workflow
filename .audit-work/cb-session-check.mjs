import { get as cbGet } from './cb-http.mjs';
const r = await cbGet('/SalesModule/Orders/Order.aspx?OrderId=11286');
const html = typeof r === 'string' ? r : (r.text || r.body || '');
console.log('len', html.length, /Login\.aspx|txtPassword/i.test(html) ? 'LOGGED OUT' : 'SIGNED IN', (html.match(/"(Estimate|Invoice)Number":"[^"]+"/) || [])[0]);
