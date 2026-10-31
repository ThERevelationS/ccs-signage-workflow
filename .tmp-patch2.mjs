import fs from 'node:fs';
const fix = (f, anchor) => {
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('isRetryableFunction')) return console.log(f, 'already has it');
  const rep = anchor.replace("}') });", "}') });" ) ;
  s = s.replace(anchor, anchor + " + String.fromCharCode(10) + 'export const isRetryableFunction = () => false;'");
  fs.writeFileSync(f, s);
  console.log(f, 'patched');
};
const anchor1 = "writeFileSync(stub, 'export const base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }) };'";
fix('scripts/test-builder-service.mjs', anchor1);
fix('scripts/test-customer-sync.mjs', anchor1);
// canonical-compares uses a template literal stub; append export inside backticks
let c = fs.readFileSync('scripts/test-canonical-compares.mjs', 'utf8');
if (!c.includes('isRetryableFunction')) {
  c = c.replace("export const getOpenEstimateRevision = async () => null;", "export const getOpenEstimateRevision = async () => null;\nexport const isRetryableFunction = () => false;");
  fs.writeFileSync('scripts/test-canonical-compares.mjs', c);
  console.log('canonical patched');
}
