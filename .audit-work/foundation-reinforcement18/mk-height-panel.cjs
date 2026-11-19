const fs = require("fs"), crypto = require("crypto");
const j = JSON.parse(fs.readFileSync(".audit-work/foundation-reinforcement18/masonry-rates-sandbox-final-scope.json", "utf8"));
const src = j.files.find((x) => x.path.endsWith("FoundationWallsPanel.jsx")).text ?? j.files.find((x) => x.path.endsWith("FoundationWallsPanel.jsx")).normalized;
let s = src;
s = s.replace('const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);',
  'const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);\nconst heightInput = (value) => value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;');
const outerOld = `          <Input
            type="number"
            value={wall.heightInches ?? 24}
            onChange={(e) => set({ heightInches: num(e.target.value) })}
          />`;
const outerNew = `          <Input
            type="number"
            step="any"
            value={wall.heightInches ?? ""}
            onChange={(e) => set({ heightInches: heightInput(e.target.value) })}
            aria-label="Wall height (in)"
            aria-invalid={pricingIssues.some(i => i.field === "heightInches") || undefined}
            aria-describedby={pricingIssues.some(i => i.field === "heightInches") ? \`wall-\${index}-pricing\` : undefined}
          />`;
const innerOld = `              <Input
                type="number"
                value={wall.internalWallHeightInches ?? wall.heightInches ?? 24}
                onChange={(e) => set({ internalWallHeightInches: num(e.target.value) })}
              />`;
const innerNew = `              <Input
                type="number"
                step="any"
                value={wall.internalWallHeightInches ?? wall.heightInches ?? ""}
                onChange={(e) => set({ internalWallHeightInches: heightInput(e.target.value) })}
                aria-label="Internal wall height (in)"
                aria-invalid={pricingIssues.some(i => i.field === "internalWallHeightInches") || undefined}
                aria-describedby={pricingIssues.some(i => i.field === "internalWallHeightInches") ? \`wall-\${index}-pricing\` : undefined}
              />`;
if (!s.includes(outerOld)) throw new Error("outer input block not found");
s = s.replace(outerOld, outerNew);
if (!s.includes(innerOld)) throw new Error("inner input block not found");
s = s.replace(innerOld, innerNew);
if (!s.includes("heightInput =")) throw new Error("helper missing");
if ((s.match(/heightInput\(e\.target\.value\)/g) || []).length !== 2) throw new Error("onChange count");
fs.writeFileSync(".audit-work/foundation-reinforcement18/masonry-height-candidate-FoundationWallsPanel.jsx", s);
console.log("sha", crypto.createHash("sha256").update(s).digest("hex"), "bytes", Buffer.byteLength(s));
