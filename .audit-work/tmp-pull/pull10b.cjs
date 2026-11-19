const { execSync } = require("child_process");
const fs = require("fs");
const files = `src/components/estimator/foundation/convertToBrickStone.js
src/components/estimator/foundation/foundationBulkMaterialChange.js
src/components/estimator/foundation/FoundationBulkMaterialPanel.jsx
src/components/estimator/foundation/foundationCalc.js
src/components/estimator/foundation/foundationReinforcementBasis.js
src/components/estimator/foundation/foundationReinforcementCost.js
src/components/estimator/foundation/foundationReinforcementPreview3D.js
src/components/estimator/foundation/ReinforcementDraftField.jsx
src/components/estimator/foundation/ReinforcementDraftList.jsx
src/components/estimator/parts/partCatalog.js`.split("\n");
for (const f of files) {
  const raw = execSync(`npx base44@latest sandbox read "${f}" --app-id 68dfcc5e57bbbc35387da97c --branch main --json`, {encoding:"utf8", timeout:60000});
  const i = raw.search(/[\[{]/);
  const d = JSON.parse(raw.slice(i));
  const c = (d.files||[])[0]?.content || d.content || "";
  fs.writeFileSync(f, c);
  console.log(f, "->", c.split("\n").length, "lines");
}
