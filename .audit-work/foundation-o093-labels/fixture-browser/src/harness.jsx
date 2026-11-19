// O-093 real-component render harness — mounts the candidate panels with real
// calc modules and records every committed value on window.__commits.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import FoundationPolesPanel from "./components/estimator/foundation/FoundationPolesPanel";
import FoundationWallsPanel from "./components/estimator/foundation/FoundationWallsPanel";
import FoundationWallCapsPanel from "./components/estimator/foundation/FoundationWallCapsPanel";
import SignageCabinetsPanel from "./components/estimator/foundation/SignageCabinetsPanel";
import WallShapeEditor from "./components/estimator/foundation/WallShapeEditor";
import LandscapeDesigner from "./components/estimator/foundation/LandscapeDesigner";
import { FoundationDimensionInput } from "./components/estimator/foundation/foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./components/estimator/foundation/foundationGeometryInputs";
import { calcPoles } from "./components/estimator/foundation/poleCalculator";

window.__commits = [];
const record = (tag) => (v) => {
  window.__commits.push({ tag, value: JSON.parse(JSON.stringify(v ?? null)) });
  return v;
};

const POLE_INVENTORY = [
  {
    id: "inv-pole-1",
    material_name: "20 ft steel pole",
    pole_pricing_mode: "per_foot",
    pole_cost_per_foot: 10,
    pole_stock_length_inches: 240,
    pole_width_inches: 8,
  },
];

function PolesCase({ legacy }) {
  const [poles, setPoles] = useState(
    legacy
      ? [{ component_id: "p1", pole_id: "inv-pole-1", height_inches: 120, y_offset_inches: 36 }]
      : [{ component_id: "p1", pole_id: "inv-pole-1", height_inches: 120, embedment_inches: 42 }]
  );
  const onChange = (next) => {
    record("poles")(next);
    setPoles(next);
  };
  const poleCalc = calcPoles(poles, POLE_INVENTORY);
  return (
    <FoundationPolesPanel
      poles={poles}
      options={POLE_INVENTORY}
      items={[]}
      onChange={onChange}
      polePricing={poleCalc.polePricing}
    />
  );
}

function WallsCase() {
  const [walls, setWalls] = useState([
    { id: "w1", name: "Wall 1", heightInches: 24, mortarGapInches: 0.375, offsetFraction: 0.5 },
  ]);
  return (
    <FoundationWallsPanel
      walls={walls}
      options={[]}
      onChange={(next) => { record("walls")(next); setWalls(next); }}
      wallPricing={[]}
    />
  );
}

function CapsCase() {
  const [caps, setCaps] = useState([
    { component_id: "c1", cap_inventory_id: "", length_inches: 48 },
  ]);
  return (
    <FoundationWallCapsPanel
      caps={caps}
      walls={[]}
      options={[]}
      onChange={(next) => { record("caps")(next); setCaps(next); }}
    />
  );
}

function CabinetsCase() {
  const [cabinets, setCabinets] = useState([
    {
      component_id: "cab1",
      mount: "pole",
      pole_component_id: "p1",
      width_inches: 48,
      height_inches: 24,
      depth_inches: 8,
      mount_height_inches: 0,
      quantity: 1,
      unit_cost: 50,
    },
  ]);
  return (
    <SignageCabinetsPanel
      cabinets={cabinets}
      items={[]}
      poles={[{ component_id: "p1" }]}
      onChange={(next) => { record("cabinets")(next); setCabinets(next); }}
    />
  );
}

function ShapeCase() {
  const [shape, setShape] = useState({});
  return (
    <WallShapeEditor
      shape={shape}
      onChange={(next) => { record("shape")(next); setShape(next); }}
    />
  );
}

function LandscapeCase() {
  const [landscape, setLandscape] = useState({ cell_size_inches: 12, cells: {} });
  return (
    <LandscapeDesigner
      landscape={landscape}
      onChange={(patch) => {
        record("landscape")(patch);
        setLandscape((cur) => ({ ...cur, ...patch }));
      }}
    />
  );
}

function FieldCase() {
  const meta = foundationDimensionFieldMeta("pole", "height_inches");
  const [value, setValue] = useState(120);
  return (
    <FoundationDimensionInput
      {...meta}
      value={value}
      onCommit={(v) => { record("field")(v); setValue(v); }}
      ariaLabel="Bare dimension field"
    />
  );
}

const CASES = {
  poles: () => <PolesCase />,
  "embed-legacy": () => <PolesCase legacy />,
  walls: () => <WallsCase />,
  caps: () => <CapsCase />,
  cabinets: () => <CabinetsCase />,
  shape: () => <ShapeCase />,
  landscape: () => <LandscapeCase />,
  field: () => <FieldCase />,
};

const name = new URLSearchParams(window.location.search).get("case") || "poles";
const render = CASES[name] || CASES.poles;
createRoot(document.getElementById("root")).render(
  <div style={{ fontFamily: "sans-serif", padding: 16, width: 900 }}>{render()}</div>
);
window.__harnessReady = true;
