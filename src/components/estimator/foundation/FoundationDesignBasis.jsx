import React from "react";

// O-106/O-107/O-108/O-110 (CMP-I05–I09) — design-basis authoring surface.
// `design_basis` fields render on `FoundationFieldPackage`'s design-basis
// section but carried no authoring input — this component authors the
// engineering basis fields on the project. Every field is authored text —
// blank = "not recorded" (never an invented basis); the field package renders
// the authored value verbatim.
//
// The fields are the operator's BASIS notes (what the design relies on), not
// computed engineering values — the register's held seeds (`METHOD-*-HELD`)
// name the unencoded checks; the authored basis carries the operator's record.

const BASIS_FIELDS = [
  ["sign_wind", "Sign wind basis", "the sign-wind method/source the design relies on (e.g. 'ASCE 7-22 §29.4' or 'shop assumption' — the held METHOD-SIGN-WIND-HELD seed names the unencoded check)"],
  ["bearing", "Footing bearing basis", "the soil-bearing method/source (e.g. 'presumptive 1500 psf' or 'geotech report X' — the held METHOD-FOOTING-BEARING-HELD seed names the unencoded check)"],
  ["shaft", "Shaft/embedment basis", "the drilled-shaft/embedment method/source (e.g. 'IBC 1807.3.2.1' or 'pole manufacturer embedment table' — the held METHOD-SHAFT-HELD seed names the unencoded check)"],
  ["lateral", "Lateral basis", "the lateral-load method/source (e.g. 'wind + seismic' or 'not applicable' — the held METHOD-LATERAL-HELD seed names the unencoded check)"],
  ["frost_depth", "Frost depth basis", "the frost-depth source (e.g. 'local code 30in' or 'NOAA frost map' — the held METHOD-FROST-HELD seed names the unencoded check)"],
  ["basis_source", "Basis source", "the primary source/citation the design basis relies on (e.g. 'ACI 318' or 'shop standard' — names the register entry or external source)"],
  ["pillar_bar", "Pillar bar basis", "the pillar-bar method/source (e.g. 'cage manufacturer' or 'shop assumption')"],
  ["base_plate", "Base plate basis", "the base-plate method/source (e.g. 'sign manufacturer' or 'shop assumption')"],
  ["cap_detail", "Cap detail basis", "the masonry cap detail method/source (e.g. 'coping manufacturer' or 'shop standard')"],
];

export default function FoundationDesignBasis({ project, onChange }) {
  const db = project?.design_basis || {};
  const set = (field, value) => {
    if (typeof onChange !== "function") return;
    onChange({ design_basis: { ...db, [field]: value === "" ? undefined : value } });
  };
  return (
    <details className="border border-gray-200 rounded-sm p-2 bg-gray-50">
      <summary className="text-[11px] font-semibold text-gray-700 cursor-pointer select-none">
        Design basis — engineering method/source notes (blank = not recorded)
      </summary>
      <p className="text-[10px] text-gray-500 mt-1">
        The operator's basis notes — what the design relies on, not computed engineering values. The register's held seeds name the unencoded checks; the authored basis carries the operator's record. Blank = not recorded (never an invented basis).
      </p>
      <div className="grid grid-cols-1 gap-1.5 mt-2">
        {BASIS_FIELDS.map(([field, label, hint]) => (
          <label key={field} className="block">
            <span className="text-[10px] font-semibold text-gray-600">{label}</span>
            <input
              type="text"
              className="mt-0.5 w-full text-[11px] border border-gray-300 rounded-sm px-1.5 py-0.5"
              value={db[field] ?? ""}
              placeholder="not recorded"
              title={hint}
              onChange={(e) => set(field, e.target.value)}
            />
            <span className="text-[9px] text-gray-400 block mt-0.5">{hint}</span>
          </label>
        ))}
      </div>
      {/* O-120 (CMP-I19) -- license_class/licensed_source: the source's
          license class + whether the design basis relies on a licensed
          source. The field package renders both; blank/unset = not recorded. */}
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-600">License class</span>
          <input
            type="text"
            className="mt-0.5 w-full text-[11px] border border-gray-300 rounded-sm px-1.5 py-0.5"
            value={db.license_class ?? ""}
            placeholder="not recorded"
            title="the license class of the source the design basis relies on"
            onChange={(e) => set("license_class", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-600">Licensed source</span>
          <select
            className="mt-0.5 w-full text-[11px] border border-gray-300 rounded-sm px-1.5 py-0.5 bg-white"
            value={db.licensed_source === true ? "yes" : db.licensed_source === false ? "no" : ""}
            title="whether the design basis relies on a licensed engineering source"
            onChange={(e) => set("licensed_source", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}
          >
            <option value="">not recorded</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>
    </details>
  );
}
