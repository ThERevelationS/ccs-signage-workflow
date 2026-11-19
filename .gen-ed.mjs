import { writeFileSync } from "fs";
const addKit = [
`  const addKit = async (kit) => {`,
`    if (readOnly) return;`,
`    const current = await loadCurrentProductMutationEstimate();`,
`    try {`,
`      await addKitToEstimate({`,
`        estimateId: estimate.id,`,
`        kit,`,
`        expectedEstimateUpdatedAt: current.updated_date || serverUpdatedAtRef.current,`,
`      });`,
`      await refreshProducts();`,
`    } catch (error) {`,
`      await refreshProducts().catch(() => null);`,
`      window.alert(\`\${error?.message || "Inventory Kit could not be added."}\\n\\nThe estimate was refreshed. If insertion had already started, use Resume Product Add to safely continue it.\`);`,
`    }`,
`  };`,
``,
`  const updateProductPrice = async (line) => {`,
].join("\n");
const edits = [
  {
    old_text: 'import AddProductGrid from "@/components/estimator/aio/AddProductGrid";',
    new_text: 'import AddProductGrid from "@/components/estimator/aio/AddProductGrid";\nimport { addKitToEstimate } from "@/components/estimator/products/kitService";',
  },
  {
    old_text: "  const updateProductPrice = async (line) => {",
    new_text: addKit,
  },
  {
    old_text: "onAddQuickProduct={addQuickProduct} />",
    new_text: "onAddQuickProduct={addQuickProduct} onAddKit={addKit} />",
    replace_all: true,
  },
];
writeFileSync(".edits-edkit.json", JSON.stringify(edits));
console.log("ok");
