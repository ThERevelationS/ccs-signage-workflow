const fs = require("fs"), crypto = require("crypto");
const j = JSON.parse(fs.readFileSync(".audit-work/foundation-reinforcement18/masonry-outline-continuation-source.json", "utf8"));
const src = j.files.find((x) => x.path.endsWith("FoundationWallsPanel.jsx")).normalized ?? j.files.find((x) => x.path.endsWith("FoundationWallsPanel.jsx")).text;
let s = src;
const btnOld = `        <Button variant="outline" size="sm" onClick={() => setShowEditor((v) => !v)}>
          <PenLine className="w-4 h-4" aria-hidden="true" /> {showEditor ? "Hide outline" : "Wall outline"}
        </Button>`;
const btnNew = `        <Button variant="outline" size="sm" onClick={() => setShowEditor((v) => !v)}
          aria-expanded={showEditor}
          aria-invalid={pricingIssues.some(i => i.field === "shape") || undefined}
          aria-describedby={pricingIssues.some(i => i.field === "shape") ? \`wall-\${index}-pricing\` : undefined}>
          <PenLine className="w-4 h-4" aria-hidden="true" /> {showEditor ? "Hide outline" : "Wall outline"}
        </Button>`;
const noticeOld = `        {!wall.shape?.segments?.length && (
          <span className="text-xs text-amber-600">
            No outline yet - draw the wall footprint before estimating quantities.
          </span>
        )}`;
const noticeNew = `        {pricingIssues.some(i => i.field === "shape") ? (
          <span className="text-xs text-amber-600">
            Outline geometry needs repair before repricing - see diagnostics below.
          </span>
        ) : !wall.shape?.segments?.length ? (
          <span className="text-xs text-amber-600">
            No outline yet - draw the wall footprint before estimating quantities.
          </span>
        ) : null}`;
if (!s.includes(btnOld)) throw new Error("outline button block not found");
s = s.replace(btnOld, btnNew);
if (!s.includes(noticeOld)) throw new Error("outline notice block not found");
s = s.replace(noticeOld, noticeNew);
fs.writeFileSync(".audit-work/foundation-reinforcement18/masonry-outline-candidate-FoundationWallsPanel.jsx", s);
console.log("sha", crypto.createHash("sha256").update(s).digest("hex"), "bytes", Buffer.byteLength(s));
