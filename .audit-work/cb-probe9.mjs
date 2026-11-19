import { get } from './cb-http.mjs';
const t = (await get('/SalesModule/Orders/OrderView/OrderNotes.aspx?OrderId=9000')).text;
console.log((t.match(/url\s*:\s*['"][^'"]+['"]|[A-Za-z]+\.asmx\/[A-Za-z]+|\/Api\/[A-Za-z\/]+|PageMethods\.[A-Za-z]+|[A-Za-z]+WebService\.[A-Za-z]+/g) || []).join('\n'));
const s = t.indexOf('Load'); console.log(t.slice(0, 3000).replace(/\s+/g, ' '));
