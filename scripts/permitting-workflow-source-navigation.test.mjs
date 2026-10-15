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
  const mockId = "\0permitting-workflow-source-test";
  const mockBase44 = {
    name: "permitting-workflow-source-test",
    enforce: "pre",
    resolveId(source) {
      return source === "@/api/base44Client" ? mockId : null;
    },
    load(id) {
      return id === mockId
        ? "export const base44 = { entities: { PermittingWorkflowDraft: { filter: async () => ({ items: [] }) } } };"
        : null;
    },
  };
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react(), mockBase44],
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: [{ find: "@", replacement: path.resolve("src") }] },
    server: { middlewareMode: true },
    logLevel: "error",
  });
  let rendered;
  try {
    const { WorkflowCitationList } = await server.ssrLoadModule("/src/components/permitting/PermitWorkflowDesigner.jsx");
    const opened = [];
    await act(async () => {
      rendered = create(React.createElement(WorkflowCitationList, {
        citations: [
          { source_document_id: "  fixture-source-one  ", section_or_page: "Section 1" },
          { source_document_id: "fixture-source-two", section_or_page: "Page 4" },
          { source_document_id: 42 },
          { section_or_page: "Unlinked citation" },
        ],
        onOpenSourceDocument: id => opened.push(id),
      }));
    });

    const openButtons = rendered.root.findAll(node =>
      node.type === "button" && node.children.join("") === "Open saved source details"
    );
    assert.equal(openButtons.length, 2);
    await act(async () => openButtons[0].props.onClick());
    await act(async () => openButtons[1].props.onClick());
    assert.deepEqual(opened, ["fixture-source-one", "fixture-source-two"]);

    await act(async () => {
      rendered.update(React.createElement(WorkflowCitationList, {
        citations: [{ source_document_id: "fixture-source-without-handler" }],
      }));
    });
    assert.equal(rendered.root.findAll(node =>
      node.type === "button" && node.children.join("") === "Open saved source details"
    ).length, 0);
  } finally {
    rendered?.unmount();
    await server.close();
  }
});
