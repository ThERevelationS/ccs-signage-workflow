import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
let checks = 0;
const check = (condition, explanation) => {
  assert.ok(condition, explanation);
  checks += 1;
};
const between = (from, to) => {
  const start = ui.indexOf(from);
  const end = ui.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Missing pool boundary: ${from}`);
  return ui.slice(start, end);
};
const selected = between("{/* My Presets - Shows selected items */}", "{/* Standard Items - Compact */}");
const standard = between("{/* Standard Items - Compact */}", "{/* Custom Items Pool - Compact */}");
const custom = between("{/* Custom Items Pool - Compact */}", '{activeSubTab === "create" && activeTab === "filters"');
const preview = between('const visiblePreviewColumns = columnSettings.filter', 'const allColumnsShown = columnSettings.every');

// Pool checkboxes must own the change event. A clickable parent with a
// read-only-looking checkbox cannot be operated correctly from the keyboard.
for (const [name, source, selectedCall] of [
  ["standard", standard, "toggleSelection(item, true)"],
  ["custom", custom, "toggleSelection(item)"],
]) {
  check(source.includes(`onChange={() => ${selectedCall}}`),
    `${name} checkbox must update its existing selection path`);
  check(!source.includes("onChange={() => {}}") &&
        !source.includes(`onClick={() => ${selectedCall}}`),
    `${name} checkbox must not rely on a clickable parent or inert change handler`);
  check(/<label className="[^"]*cursor-pointer[^"]*focus-within:[^"]*">\s*<input[\s\S]*?type="checkbox"[\s\S]*?<span className="break-words">\{item\.name\}<\/span>\s*<\/label>/.test(source),
    `${name} checkbox and readable name must share a real label and visible focus`);
  check(/<\/label>\s*<Button/.test(source) && !/<label[^>]*>[\s\S]*?<Button[\s\S]*?<\/label>/.test(source),
    `${name} action buttons must sit outside the checkbox label`);
  check(source.includes("min-h-11") && source.includes("max-w-full"),
    `${name} checkbox needs a mobile-sized hit area without breaking compact wrapping`);
}
check((standard.match(/h-11 w-11 shrink-0 p-0 sm:h-6 sm:w-6/g) || []).length === 1,
  "Standard duplicate button needs a mobile hit area while desktop stays compact");
check((custom.match(/h-11 w-11 shrink-0 p-0 sm:h-6 sm:w-6/g) || []).length === 3,
  "Custom duplicate, edit and delete need independent mobile hit areas");
for (const label of ["Duplicate", "Edit", "Delete"]) {
  check(custom.includes(`aria-label={\`${label} \${item.name}\`}`),
    `Custom ${label.toLowerCase()} button needs an accessible name`);
}
check(standard.includes("aria-label={`Duplicate ${item.name}`}"),
  "Standard duplicate button needs an accessible name");
check((selected.match(/aria-label={`Remove ${item.name} from My Presets`}/g) || []).length === 2,
  "Both selected-chip remove buttons need explicit accessible names");
check((selected.match(/onClick=\{\(\) => toggleSelection\(item(?:, true)?\)\}/g) || []).length === 2,
  "My Presets remove actions must retain standard and custom selection paths");
check(preview.includes("column.visible") && ui.includes('aria-label="Horizontal Sales Pipeline column preview"') &&
      ui.includes('className="flex flex-wrap gap-1"'),
  "Always-visible compact column checkboxes and horizontal preview remain intact");
check(ui.includes("setSalesFilterSelectionSafely") && ui.includes("createUniqueSalesFilterCopy") &&
      ui.includes("deleteSalesFilterIfUnchanged"),
  "Existing conflict-safe persistence and action handlers remain connected");
console.log(`Sales filter/preset pool accessibility: ${checks}/${checks} source-level checks PASS; authenticated browser interaction remains untested.`);
