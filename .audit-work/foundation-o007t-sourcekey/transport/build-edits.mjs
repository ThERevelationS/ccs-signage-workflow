import { readFileSync, writeFileSync } from "node:fs";

const DIR = ".audit-work/foundation-o007t-sourcekey";
const baseModel = readFileSync(`${DIR}/baseline/foundationTemplateModel.js`, "utf8");
const candModel = readFileSync(`${DIR}/candidates/src/components/estimator/foundation/foundationTemplateModel.js`, "utf8");
const baseDlg = readFileSync(`${DIR}/baseline/FoundationTemplateDialog.jsx`, "utf8");
const candDlg = readFileSync(`${DIR}/candidates/src/components/estimator/foundation/FoundationTemplateDialog.jsx`, "utf8");

// ---------- foundationTemplateModel.js edits ----------
const modelEdits = [
  {
    // Hunk 1: O-007 field-semantics comment — ai_engineering_data bullet
    old_text:
      "//     an applied template reproduces the same cost math.\n" +
      "//   * pricing_engine is excluded:",
    new_text:
      "//     an applied template reproduces the same cost math.\n" +
      "//   * ai_engineering_data carries the review verbatim EXCEPT apply-time\n" +
      "//     provenance stamping (see stampTemplateAppliedAiData): its source_key\n" +
      "//     identifies the design the AI analyzed — the template SOURCE project's\n" +
      "//     design — so on any other project the review surface detects the key\n" +
      "//     mismatch and shows its stale banner. The key is kept (it is the true\n" +
      "//     reference to the analyzed design) and the record gains explicit\n" +
      "//     provenance fields marking the note as template-carried.\n" +
      "//   * pricing_engine is excluded:",
  },
  {
    // Hunk 2: new stampTemplateAppliedAiData helper after sanitizeTemplateCustomerPricing
    old_text:
      "  return { applied: true, tier_number: v.tier_number };\n" +
      "};\n" +
      "\n" +
      "// Snapshot the allowed design fields of a project for template storage.",
    new_text:
      "  return { applied: true, tier_number: v.tier_number };\n" +
      "};\n" +
      "\n" +
      "// ai_engineering_data: the review's source_key identifies the design the AI\n" +
      "// analyzed — the template SOURCE project's design, not the apply target's.\n" +
      "// The carried key can never match the target's live design key (it embeds the\n" +
      "// source project's id/updated_date), so the review surface marks the note\n" +
      "// stale (\"Design changed since this note\") exactly like a review whose own\n" +
      "// design moved on. source_key stays verbatim — it is the true reference to\n" +
      "// the analyzed design — and the record gains explicit provenance so a\n" +
      "// template-carried note is distinguishable from a review that went stale on\n" +
      "// its own project: origin_source_key preserves the analyzed-design key,\n" +
      "// template_applied flags the carry, template_applied_at records when the note\n" +
      "// was carried onto this project. Non-record values fail closed, same as\n" +
      "// customer_pricing. On chained templates (a project that received a template\n" +
      "// apply is itself saved as a template) the earliest origin_source_key is\n" +
      "// preserved — it still names the design actually reviewed.\n" +
      "const stampTemplateAppliedAiData = (v, { appliedAt } = {}) => {\n" +
      "  if (v === undefined) return v;\n" +
      "  if (v === null) return null;\n" +
      "  if (!isRecord(v)) throw new Error(\"Foundation template ai_engineering_data must be a record.\");\n" +
      "  const out = deepClone(v);\n" +
      "  if (out.origin_source_key === undefined) {\n" +
      "    out.origin_source_key = typeof out.source_key === \"string\" && out.source_key ? out.source_key : null;\n" +
      "  }\n" +
      "  out.template_applied = true;\n" +
      "  out.template_applied_at =\n" +
      "    typeof appliedAt === \"string\" && Number.isFinite(Date.parse(appliedAt))\n" +
      "      ? appliedAt\n" +
      "      : new Date().toISOString();\n" +
      "  return out;\n" +
      "};\n" +
      "\n" +
      "// Snapshot the allowed design fields of a project for template storage.",
  },
  {
    // Hunk 3a: signature gains appliedAt
    old_text:
      "export function prepareFoundationTemplatePatch(data, { createId } = {}) {",
    new_text:
      "export function prepareFoundationTemplatePatch(data, { createId, appliedAt } = {}) {",
  },
  {
    // Hunk 3b: stamp application after customer_pricing gate
    old_text:
      "  if (provided.customer_pricing !== undefined) {\n" +
      "    provided.customer_pricing = sanitizeTemplateCustomerPricing(provided.customer_pricing);\n" +
      "  }\n" +
      "  const arrays = {};",
    new_text:
      "  if (provided.customer_pricing !== undefined) {\n" +
      "    provided.customer_pricing = sanitizeTemplateCustomerPricing(provided.customer_pricing);\n" +
      "  }\n" +
      "  if (provided.ai_engineering_data !== undefined) {\n" +
      "    provided.ai_engineering_data = stampTemplateAppliedAiData(provided.ai_engineering_data, { appliedAt });\n" +
      "  }\n" +
      "  const arrays = {};",
  },
];

// ---------- FoundationTemplateDialog.jsx edit ----------
const dlgEdits = [
  {
    old_text:
      "                  <div className=\"text-[11px] text-gray-500\">\n" +
      "                    {(t.project_data?.items || []).length} foundations\n" +
      "                  </div>\n" +
      "                </div>",
    new_text:
      "                  <div className=\"text-[11px] text-gray-500\">\n" +
      "                    {(t.project_data?.items || []).length} foundations\n" +
      "                  </div>\n" +
      "                  {typeof t.project_data?.ai_engineering_recommendation === \"string\" &&\n" +
      "                  t.project_data.ai_engineering_recommendation.trim() ? (\n" +
      "                    <div className=\"text-[10px] text-violet-600\">\n" +
      "                      Includes an AI review note — stale on this project\n" +
      "                    </div>\n" +
      "                  ) : null}\n" +
      "                </div>",
  },
];

function applyEdits(src, edits, label) {
  let out = src;
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i];
    const count = out.split(e.old_text).length - 1;
    if (count !== 1) {
      console.error(`${label} edit ${i}: old_text found ${count}x (need exactly 1)`);
      process.exit(1);
    }
    out = out.replace(e.old_text, () => e.new_text);
  }
  return out;
}

const simModel = applyEdits(baseModel, modelEdits, "model");
const simDlg = applyEdits(baseDlg, dlgEdits, "dialog");

console.log("model  sim===candidate:", simModel === candModel, `(sim ${simModel.length}B vs cand ${candModel.length}B)`);
console.log("dialog sim===candidate:", simDlg === candDlg, `(sim ${simDlg.length}B vs cand ${candDlg.length}B)`);

if (simModel !== candModel || simDlg !== candDlg) {
  // Show first divergence for debugging
  for (const [label, a, b] of [["model", simModel, candModel], ["dialog", simDlg, candDlg]]) {
    if (a !== b) {
      const i = [...a].findIndex((ch, idx) => ch !== b[idx]);
      console.error(`${label} first divergence at char ${i}:`, JSON.stringify(a.slice(i - 40, i + 80)), "VS", JSON.stringify(b.slice(i - 40, i + 80)));
    }
  }
  process.exit(1);
}

writeFileSync(`${DIR}/transport/edits-model.json`, JSON.stringify(modelEdits));
writeFileSync(`${DIR}/transport/edits-dialog.json`, JSON.stringify(dlgEdits));
console.log("WROTE edits-model.json + edits-dialog.json — all anchors unique, simulation byte-exact");
