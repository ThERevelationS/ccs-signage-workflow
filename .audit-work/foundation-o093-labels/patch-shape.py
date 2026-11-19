# WallShapeEditor.jsx is CRLF — patch at byte level preserving endings.
p = '.audit-work/foundation-o093-labels/candidates/WallShapeEditor.jsx'
s = open(p, 'rb').read().decode('utf-8')
E = '\r\n'

old_imports = E.join([
'import { useId, useState } from "react";',
'import { Button } from "@/components/ui/button";',
'import { Input } from "@/components/ui/input";',
'import { Undo2, Trash2, Square } from "lucide-react";',
'import { foundationWallOutlineBasis, foundationWallRectangle, foundationWallSegments } from "./wallCalculator";',
])
new_imports = E.join([
'import { useId, useState } from "react";',
'import { Button } from "@/components/ui/button";',
'import { Input } from "@/components/ui/input";',
'import { Undo2, Trash2, Square } from "lucide-react";',
'import { foundationWallOutlineBasis, foundationWallRectangle, foundationWallSegments } from "./wallCalculator";',
'import { foundationDimensionInputIssue, parseFoundationDimension } from "./foundationFtInEntry";',
'import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";',
'',
'// O-093 (CMP-H02): rectangle outline entry takes feet/inches text — the rect',
'// draft stays raw local state (same as before); parsing happens at validation/',
'// apply time so a malformed draft disables Apply and shows the syntax hint',
'// instead of silently coercing. Labels/help/placeholders come from the field',
'// meta map (display text only — never stored defaults).',
'const rectLMeta = foundationDimensionFieldMeta("wallOutline", "rect_length");',
'const rectWMeta = foundationDimensionFieldMeta("wallOutline", "rect_width");',
])
assert old_imports in s, 'imports block not found'
s = s.replace(old_imports, new_imports, 1)

old_rect = E.join([
'  const rectShape = foundationWallRectangle(rect.l, rect.w);',
'  const rectLBad = foundationWallRectangle(rect.l, 1) === null;',
'  const rectWBad = foundationWallRectangle(1, rect.w) === null;',
])
new_rect = E.join([
'  // ft/in aware: parse the raw drafts first; validity is the parse plus the',
'  // canonical-inch rectangle check (positive finite inches — unchanged rule).',
'  const rectL = parseFoundationDimension(rect.l);',
'  const rectW = parseFoundationDimension(rect.w);',
'  const rectShape = rectL.ok && rectW.ok ? foundationWallRectangle(rectL.inches, rectW.inches) : null;',
'  const rectLBad = !rectL.ok || foundationWallRectangle(rectL.inches, 1) === null;',
'  const rectWBad = !rectW.ok || foundationWallRectangle(1, rectW.inches) === null;',
'  const rectLHint = rect.l !== "" && !rectL.ok ? foundationDimensionInputIssue(rect.l) : null;',
'  const rectWHint = rect.w !== "" && !rectW.ok ? foundationDimensionInputIssue(rect.w) : null;',
])
assert old_rect in s, 'rect block not found'
s = s.replace(old_rect, new_rect, 1)

old_l = E.join([
'        <label className="text-xs text-gray-500">',
'          Rect L (in)',
'          <Input',
'            type="number"',
'            step="any"',
'            className="w-24"',
'            value={rect.l}',
'            id={rectLId}',
'            aria-invalid={rectLBad || undefined}',
'            aria-describedby={rectLBad ? rectErrId : undefined}',
'            onChange={(e) => setRect({ ...rect, l: e.target.value })}',
'          />',
'        </label>',
])
new_l = E.join([
'        <label className="text-xs text-gray-500">',
'          {rectLMeta?.label ?? "Rect L (in)"}',
'          <Input',
'            type="text"',
'            inputMode="text"',
'            className="w-24"',
'            value={rect.l}',
'            id={rectLId}',
'            placeholder={rectLMeta?.placeholder}',
'            title={rectLMeta?.help}',
'            aria-label="Rectangle outline length (inches)"',
'            aria-invalid={rectLBad || undefined}',
'            aria-describedby={rectLBad ? rectErrId : undefined}',
'            onChange={(e) => setRect({ ...rect, l: e.target.value })}',
'          />',
'          {rectLHint && (',
'            <span role="status" className="block text-[10px] text-amber-700 mt-0.5">',
'              {rectLHint}',
'            </span>',
'          )}',
'        </label>',
])
assert old_l in s, 'rect L block not found'
s = s.replace(old_l, new_l, 1)

old_w = E.join([
'        <label className="text-xs text-gray-500">',
'          Rect W (in)',
'          <Input',
'            type="number"',
'            step="any"',
'            className="w-24"',
'            value={rect.w}',
'            id={rectWId}',
'            aria-invalid={rectWBad || undefined}',
'            aria-describedby={rectWBad ? rectErrId : undefined}',
'            onChange={(e) => setRect({ ...rect, w: e.target.value })}',
'          />',
'        </label>',
])
new_w = E.join([
'        <label className="text-xs text-gray-500">',
'          {rectWMeta?.label ?? "Rect W (in)"}',
'          <Input',
'            type="text"',
'            inputMode="text"',
'            className="w-24"',
'            value={rect.w}',
'            id={rectWId}',
'            placeholder={rectWMeta?.placeholder}',
'            title={rectWMeta?.help}',
'            aria-label="Rectangle outline width (inches)"',
'            aria-invalid={rectWBad || undefined}',
'            aria-describedby={rectWBad ? rectErrId : undefined}',
'            onChange={(e) => setRect({ ...rect, w: e.target.value })}',
'          />',
'          {rectWHint && (',
'            <span role="status" className="block text-[10px] text-amber-700 mt-0.5">',
'              {rectWHint}',
'            </span>',
'          )}',
'        </label>',
])
assert old_w in s, 'rect W block not found'
s = s.replace(old_w, new_w, 1)

open(p, 'wb').write(s.encode('utf-8'))
print('patched OK; CRLF count:', s.count('\r\n'), 'LF total:', s.count('\n'))
