import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);
const React = require("react");
const { create, act } = require("react-test-renderer");

test("workflow citations open only their exact saved source IDs", async () => {
  globalThis.window = { self: {}, top: {} };
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: [{ find: "@", replacement: path.resolve("src") }] },
    server: { middlewareMode: true },
    logLevel: "error",
  });
  let rendered;
  try {
    const { default: WorkflowCitationList } = await server.ssrLoadModule("/src/components/permitting/WorkflowCitationList.jsx");
    const opened = [];
    rendered = create(React.createElement(WorkflowCitationList, {
      citations: [
        { source_document_id: "  fixture-source-one  ", section_or_page: "Section 1" },
        { source_document_id: "fixture-source-two", section_or_page: "Page 4" },
        { source_document_id: 42 },
        { section_or_page: "Unlinked citation" },
      ],
      onOpenSourceDocument: id => opened.push(id),
    }));

    const openButtons = rendered.root.findAll(node =>
      node.type === "button" && node.children.join("") === "Open saved source details"
    );
    assert.equal(openButtons.length, 2);
    await act(async () => openButtons[0].props.onClick());
    await act(async () => openButtons[1].props.onClick());
    assert.deepEqual(opened, ["fixture-source-one", "fixture-source-two"]);

    rendered.update(React.createElement(WorkflowCitationList, {
      citations: [{ source_document_id: "fixture-source-without-handler" }],
    }));
    assert.equal(rendered.root.findAll(node =>
      node.type === "button" && node.children.join("") === "Open saved source details"
    ).length, 0);
  } finally {
    rendered?.unmount();
    await server.close();
  }
});
