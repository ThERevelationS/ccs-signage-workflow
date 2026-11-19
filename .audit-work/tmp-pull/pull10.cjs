const { execSync } = require("child_process");
const fs = require("fs");
const files = [
"src/components/estimator/builder/partSync.js",
"src/components/estimator/aio/BuilderPartsPanel.jsx",
"src/components/estimator/brick/BrickTotals.jsx",
"src/components/estimator/builder/builderMutationRecovery.js",
"src/components/estimator/aio/ClipboardManagerModal.jsx",
"src/components/estimator/estimateCreationService.js",
"src/components/estimator/brick/BrickGeometryPanel.jsx",
"src/components/estimator/EstimatorAuditPanel.jsx",
"src/components/estimator/builder/builderEntityPersistence.js",
"src/components/estimator/foundation/FoundationReinforcementProposalPanel.jsx"
];
for (const f of files) {
  const raw = execSync(`npx base44@latest sandbox read "${f}" --app-id 68dfcc5e57bbbc35387da97c --branch main --json`, {encoding:"utf8", timeout:60000});
  const i = raw.search(/[\[{]/);
  const d = JSON.parse(raw.slice(i));
  const c = (d.files||[])[0]?.content || d.content || "";
  fs.writeFileSync(f, c);
  console.log(f, "->", c.split("\n").length, "lines");
}
