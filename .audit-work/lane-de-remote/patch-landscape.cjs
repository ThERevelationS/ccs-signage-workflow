const fs = require("fs");
const p = ".audit-work/lane-de-remote/LandscapeDesigner.jsx";
let s = fs.readFileSync(p, "utf8");

// 1. lock gate on paint
s = s.replace(
  "  const paint = (x, y) => {\n    const key = `${x},${y}`;",
  "  const paint = (x, y) => {\n    // O-069 landscape_lock: a locked design refuses cell edits.\n    if (landscape?.locked === true) return;\n    const key = `${x},${y}`;");

// 2. lock gate on edge
s = s.replace(
  '  const edge = () => {\n    if (brush === "dirt" || brush == null) return;',
  '  const edge = () => {\n    if (landscape?.locked === true || brush === "dirt" || brush == null) return;');

// 3. lock gate on flood
s = s.replace(
  "  const flood = (x, y) => {\n    const target = cells[`${x},${y}`] || \"\";",
  "  const flood = (x, y) => {\n    if (landscape?.locked === true) return;\n    const target = cells[`${x},${y}`] || \"\";");

// 4. layer + locked fields after the bed/waste/labor map
s = s.replace(
  "            </label>\n          ))}\n          {/* O-069 (CMP-F02) -- count-priced objects:",
  `            </label>
          ))}
          {/* O-069 (CMP-F02) -- landscape_layer/landscape_lock: the design's
              recorded layer name + the lock flag. Locked designs refuse
              paint/edge/fill edits; layer is a recorded surface, never
              consumed by pricing. */}
          <label className="text-[10px] text-gray-500">
            Layer
            <input
              type="text" placeholder="base"
              value={landscape?.layer ?? ""}
              onChange={(e) => onChange({ ...landscape, layer: e.target.value === "" ? undefined : e.target.value })}
              className="ml-1 h-7 w-16 rounded-sm border border-gray-300 px-1 text-[11px]"
              aria-label="Landscape layer"
            />
          </label>
          <label className="text-[10px] text-gray-500 flex items-center gap-1">
            <input
              type="checkbox"
              checked={landscape?.locked === true}
              onChange={(e) => onChange({ ...landscape, locked: e.target.checked ? true : undefined })}
              aria-label="Landscape locked"
            />
            Locked
          </label>
          {/* O-069 (CMP-F02) -- count-priced objects:`);

fs.writeFileSync(p, s);
console.log("locked refs:", (s.match(/landscape\?\.locked === true/g) || []).length);
console.log("layer ref:", s.includes("landscape?.layer"));
