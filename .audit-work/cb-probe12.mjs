import { get, post } from './cb-http.mjs';
import { textOf } from './cb-orderlib.mjs';
const h = (await get('/SalesModule/Orders/Order.aspx?OrderId=11280')).text;
const m = h.match(/id="hlDetailedOrderView"[^>]*>/); console.log(m && m[0]);
for (const re of [/[A-Za-z\/]*Detail[A-Za-z]*\.aspx\?[^"' ]*/g, /OrderDetail[^"' ]*/g]) console.log([...new Set(h.match(re) || [])].slice(0, 10));
const sig = (await get('/SalesModule/Orders/OrderProduct.asmx/js')).text;
console.log((sig.match(/GetOrderProductPricingHoverDetails:function\([^)]*\)/) || [])[0]);
const r = await post('/SalesModule/Orders/OrderProduct.asmx/GetOrderProductPricingHoverDetails', { orderProductId: 35688 });
console.log('hover', r.status, r.text.slice(0, 1500));
