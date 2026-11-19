const fs = require('fs');
let p = 'src/components/estimator/foundation/FoundationEquipmentTab.jsx';
let s = fs.readFileSync(p, 'utf8');

// 2) sub compat: activeParents recipe
s = s.replace(
  `  const compatibleSubs = inventory.filter(s =>
    s.material_type === 'sub_attachment'
    && (eq?.compatible_sub_attachment_ids || []).includes(s.id));
  const selectedAttIds = new Set(detail.attachmentRows.map(r => r.id));
  const selectedSubIds = new Set(detail.subAttachmentRows.map(r => r.id));`,
  `  const activeParents = detail.attachmentRows.filter(r => r.quantity > 0 && r.inventory);
  const compatibleSubs = inventory.filter(s =>
    s.material_type === 'sub_attachment'
    && activeParents.some(r => (eq?.compatible_attachment_ids || []).includes(r.id)
      && (r.inventory.compatible_sub_attachment_ids || []).includes(s.id)));
  const selectedAttIds = new Set(detail.attachmentMode === 'normalized'
    ? detail.attachmentRows.map(r => r.id)
    : detail.attachmentRows.filter(r => r.quantity !== 0).map(r => r.id));
  const selectedSubIds = new Set(detail.subAttachmentRows.filter(r => r.quantity !== 0).map(r => r.id));`
);
// subRow parentLinked via activeParents
s = s.replace(
  `const parentLinked = compatibleAtts.some(a => (a.compatible_sub_attachment_ids || []).includes(s.id));`,
  `const parentLinked = activeParents.some(r => (r.inventory.compatible_sub_attachment_ids || []).includes(s.id));`
);
// 4) qty drafts cleanup: discard after valid commit / reset on empty / clear on entry change
s = s.replace(
  `function EquipmentCard({ entry, detail, index, inventory, onUpdate, onRemove, showMiscAttachments }) {
  const [err, setErr] = useState('');
  const [qtyDrafts, setQtyDrafts] = useState({});`,
  `function EquipmentCard({ entry, detail, index, inventory, onUpdate, onRemove, showMiscAttachments }) {
  const [err, setErr] = useState('');
  const [qtyDrafts, setQtyDrafts] = useState({});
  useEffect(() => { setQtyDrafts({}); setErr(''); }, [entry]);`
);
s = s.replace(
  `  const qtyCommit = (kind, id, key) => {
    const raw = qtyDrafts[key];
    if (raw === undefined || raw === '') return; // typing / empty -> no accidental removal
    const n = Number(raw);
    if (!intQty(n)) { setErr('Quantity must be a whole number 0 or greater.'); return; }
    setQty(kind, id, n);
  };`,
  `  const qtyCommit = (kind, id, key) => {
    const raw = qtyDrafts[key];
    if (raw === undefined || raw === '') { setQtyDrafts(d => { const { [key]: _d, ...rest } = d; return rest; }); return; }
    const n = Number(raw);
    if (!intQty(n)) { setErr('Quantity must be a whole number 0 or greater.'); return; }
    setQtyDrafts(d => { const { [key]: _d, ...rest } = d; return rest; });
    setQty(kind, id, n);
  };`
);
// 5) custom qty chip units + delivery inactive context + cleanup dead code
s = s.replace(
  `          <OverrideChip label="Custom rate" value={entry.custom_rate} onClear={() => update({ ...entry, custom_rate: null })} />
          <OverrideChip label="Custom qty" value={entry.custom_qty} onClear={() => update({ ...entry, custom_qty: null })} />
          <OverrideChip label="Custom delivery" value={entry.custom_delivery_charge} onClear={() => update({ ...entry, custom_delivery_charge: null })} />`,
  `          <OverrideChip label="Custom rate" value={entry.custom_rate} moneyVal onClear={() => update({ ...entry, custom_rate: null })} />
          <OverrideChip label="Custom qty" value={entry.custom_qty} onClear={() => update({ ...entry, custom_qty: null })} />
          <OverrideChip label={`Custom delivery${entry.include_delivery ? '' : ' (inactive — delivery excluded)'}`} value={entry.custom_delivery_charge} moneyVal onClear={() => update({ ...entry, custom_delivery_charge: null })} />`
);
s = s.replace(
  `function OverrideChip({ label, value, onClear }) {
  if (value === undefined || value === null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
      {label}: {typeof value === 'number' ? money(value) : String(value)}
      <button type="button" aria-label={\`Clear \${label}\`} onClick={onClear} className="text-amber-900 hover:underline">Clear</button>
    </span>
  );
}`,
  `function OverrideChip({ label, value, onClear, moneyVal = false }) {
  if (value === undefined || value === null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
      {label}: {moneyVal && typeof value === 'number' ? money(value) : String(value)}
      <button type="button" aria-label={\`Clear \${label}\`} onClick={onClear} className="text-amber-900 hover:underline">Clear</button>
    </span>
  );
}`
);
s = s.replace('            {eq && (eq.compatible_attachment_ids?.length || eq.compatible_sub_attachment_ids?.length) === 0 ? null : null}\n', '');
s = s.replace(`              value={customQtyActive ? (entry.rental_duration ?? 1) : (entry.rental_duration ?? 1)}`, `              value={entry.rental_duration ?? 1}`);
// duration label clarity
s = s.replace(
  `<Label className="text-xs">Duration {customQtyActive && <span className="text-amber-700">(custom qty override active)</span>}</Label>`,
  `<Label className="text-xs">Duration {customQtyActive && <span className="text-amber-700">(custom qty override active — editing duration does not clear it)</span>}</Label>`
);
// addEquipment guard _none (value '' already guarded; add _none too)
s = s.replace(
  `  const addEquipment = (eqId) => {
    if (!eqId) return;`,
  `  const addEquipment = (eqId) => {
    if (!eqId || eqId === '_none') return;`
);
// 1) inventory filters: real flags + sort_order
s = s.replace(
  `  const excavation = inventory.filter(i => i.material_type === 'excavation_equipment' && i.equipment_type !== 'non_excavation');
  const nonExcavation = inventory.filter(i => i.material_type === 'excavation_equipment' && i.equipment_type === 'non_excavation');
  const filteredExcavation = showAllEquipment ? excavation : excavation.filter(e => (e.compatible_foundation_types || []).some(t => foundationItems.some(f => f.foundation_type === t)) || !(e.compatible_foundation_types || []).length);
  const filteredNonExcavation = nonExcavation;`,
  `  const sortByOrder = (rows) => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const excavation = sortByOrder(inventory.filter(i => i.material_type === 'excavation_equipment' && !i.is_non_excavation_equipment));
  const nonExcavation = sortByOrder(inventory.filter(i => i.material_type === 'excavation_equipment' && i.is_non_excavation_equipment));
  const types = new Set((foundationItems || []).map(f => f.foundation_type));
  const hasPillar = types.has('pillar');
  const hasSpread = types.has('spread_foot') || types.has('standard');
  const filteredExcavation = showAllEquipment || (!hasPillar && !hasSpread) ? excavation
    : excavation.filter(e => (hasPillar && e.is_pillar_excavation) || (hasSpread && e.is_spread_foot_excavation));
  const filteredNonExcavation = nonExcavation;`
);
// import useEffect
s = s.replace("import { useState } from 'react';", "import { useEffect, useState } from 'react';");
fs.writeFileSync(p, s);
console.log('eqtab fixed');
