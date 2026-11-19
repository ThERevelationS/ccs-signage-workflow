import { useState } from "react";
import { createRoot } from "react-dom/client";
import BuilderPartsPanel from "@/components/estimator/aio/BuilderPartsPanel";

const fixtures = window.__FIXTURES__ || [];
window.__unexpectedOps = window.__unexpectedOps || [];

function Shell() {
  const [name, setName] = useState(fixtures[0]?.name || "");
  const selected = fixtures.find(f => f.name === name);
  window.__currentPart = selected?.part || null;
  return (
    <div style={{ maxWidth: 1100 }}>
      <select data-testid="fixture-select" value={name} onChange={e => setName(e.target.value)}>
        {fixtures.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
      </select>
      <BuilderPartsPanel key={name} builderProductId="synthetic-builder" readOnly={true} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);
