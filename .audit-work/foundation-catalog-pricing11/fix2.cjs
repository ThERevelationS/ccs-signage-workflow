const fs = require('fs');
let p = 'src/components/estimator/foundation/FoundationWallsPanel.jsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('import { money } from "./foundationCalc";',
  'import { money } from "./foundationCalc";\nimport { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";');
s = s.replace(
  `  const c = wall.calculatedCosts || {};
  const set = (changes) => onChange(index, changes);`,
  `  const c = wall.calculatedCosts || {};
  const set = (changes) => onChange(index, changes);
  const outerMissing = !options.some((o) => o.id === wall.materialId);
  const innerMissing = !!wall.includeInternalWall && !options.some((o) => o.id === wall.internalMaterialId);
  const catalogMissing = outerMissing || innerMissing;
  const amt = (v) => (hasFoundationCostSnapshot(v) ? money(v) : "Not saved");`
);
s = s.replace('{money(c.totalCost)}', '{amt(c.totalCost)}');
s = s.replace('{money(c.materialCost)}', '{amt(c.materialCost)}');
s = s.replace('{money(c.mortarCost)}', '{amt(c.mortarCost)}');
s = s.replace('{money(c.laborCost)}', '{amt(c.laborCost)}');
s = s.replace(
  '        <div>Linear in: <span className="font-semibold text-gray-900">{Math.round(num(c.totalLinearInches))}</span></div>',
  '        <div>Linear in: <span className="font-semibold text-gray-900">{Math.round(num(c.totalLinearInches))}</span></div>\n        {catalogMissing && <div className="col-span-full text-[10px] font-semibold text-amber-700">Saved amounts (not current pricing)</div>}'
);
fs.writeFileSync(p, s);

p = 'src/components/estimator/foundation/FoundationWallCapsPanel.jsx';
s = fs.readFileSync(p, 'utf8');
s = s.replace('{cap.stock_length_inches || 0}"',
  '{hasFoundationCostSnapshot(cap.stock_length_inches) && cap.stock_length_inches > 0 ? cap.stock_length_inches + String.fromCharCode(34) : "Not saved"}');
s = s.replace('{(cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id)) && <span',
  '{(!options.some((o) => o.id === cap.cap_inventory_id)) && <span');
fs.writeFileSync(p, s);

p = 'src/components/estimator/foundation/FoundationPolesPanel.jsx';
s = fs.readFileSync(p, 'utf8');
s = s.replace('{(pole.pole_id && !options.some((o) => o.id === pole.pole_id)) && <span',
  '{(!options.some((o) => o.id === pole.pole_id)) && <span');
fs.writeFileSync(p, s);
console.log('panels done');
