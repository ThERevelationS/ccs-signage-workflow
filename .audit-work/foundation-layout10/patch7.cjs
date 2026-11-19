const fs = require('fs');
const p = 'src/components/estimator/foundation/FoundationLayoutCanvas.jsx';
let s = fs.readFileSync(p, 'utf8');
// 1) StrictMode-safe mountedRef
s = s.replace(
  "  useEffect(() => () => { mountedRef.current = false; dragRef.current = null; }, []);",
  "  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; dragRef.current = null; }; }, []);"
);
// 6) mounted guard on keydown + pointerdown + rounded-unchanged skip
s = s.replace(
  "  const onPointerDown = (e, item, index) => {\n    if (!editable || e.button !== 0) return;",
  "  const onPointerDown = (e, item, index) => {\n    if (!mountedRef.current) return;\n    if (!editable || e.button !== 0) return;"
);
s = s.replace(
  "  const onKeyDown = (e, item, index) => {\n    if (!editable) return;",
  "  const onKeyDown = (e, item, index) => {\n    if (!mountedRef.current || !editable) return;"
);
s = s.replace(
  "    if (raw.x === d.corner.x && raw.z === d.corner.z) return; // unchanged incl. fractional legacy corners",
  "    if (raw.x === d.corner.x && raw.z === d.corner.z) return; // unchanged incl. fractional legacy corners\n    const roundX = Math.round(raw.x), roundZ = Math.round(raw.z);\n    if (roundX === d.corner.x && roundZ === d.corner.z) return; // sub-inch wiggle rounded to same corner"
);
s = s.replace(
  "    onMoveItem(index, { x_inches: Math.round(raw.x), z_inches: Math.round(raw.z) });",
  "    onMoveItem(index, { x_inches: roundX, z_inches: roundZ });"
);
// 2) controls wrap
s = s.replace(
  '        <div className="flex items-center gap-2 text-[11px] text-gray-600">',
  '        <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-600">'
);
fs.writeFileSync(p, s);
console.log('canvas patched');
