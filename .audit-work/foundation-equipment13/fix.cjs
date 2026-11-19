const fs = require('fs');
const p = 'scripts/test-foundation-equipment.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  `const click = async (c, label) => {
  const b = c.root.findAll(el => (el.type === 'button') && JSON.stringify(el.props.children ?? '').includes(label))[0];`,
  `const elText = (el) => (Array.isArray(el.children) ? el.children : [el.children]).flat(Infinity).map(x => (typeof x === 'string' || typeof x === 'number') ? x : (x && typeof x === 'object' && x.children ? elText(x) : '')).join(' ');
const click = async (c, label) => {
  const b = c.root.findAll(el => (el.type === 'button') && elText(el).includes(label))[0];`
);
fs.writeFileSync(p, s);
console.log('patched', s.includes('elText'));
