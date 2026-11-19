import { post } from './cb-http.mjs';
const r = await post('/SalesModule/Orders/OrderProduct.asmx/GetOrderProductPricingHoverDetails', { orderId: 11280 });
console.log('hover', r.status, r.text.length); console.log(r.text.slice(0, 3000));
