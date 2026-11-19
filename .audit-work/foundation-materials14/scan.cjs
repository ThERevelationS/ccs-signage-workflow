const s = require('fs').readFileSync('scripts/foundation-material-browser-fixture.mjs', 'utf8');
let depth = 0, line = 1, inStr = null, tmpl = false, esc = false;
const stack = [];
for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  if (ch === '\n') line++;
  if (esc) { esc = false; continue; }
  if (ch === '\\') { esc = true; continue; }
  if (inStr) { if (ch === inStr) inStr = null; continue; }
  if (tmpl) { if (ch === '`') { tmpl = false; stack.push(['tmpl-close', line]); } continue; }
  if (ch === "'" || ch === '"') { inStr = ch; continue; }
  if (ch === '`') { tmpl = true; stack.push(['tmpl-open', line]); continue; }
  if (ch === '{' || ch === '(' || ch === '[') { depth++; stack.push([ch, line]); continue; }
  if (ch === '}' || ch === ')' || ch === ']') { depth--; stack.push([ch, line]); }
}
console.log('final depth', depth, 'tmpl open', tmpl);const st=[];for(const [t,l] of stack){if(t==='{'||t==='('||t==='['||t==='tmpl-open')st.push([t,l]);else if(st.length&&['}',')',']','tmpl-close'].includes(t))st.pop();}console.log('unclosed:',JSON.stringify(st.slice(-4)));
console.log('last 6 tokens:', JSON.stringify(stack.slice(-6)));
