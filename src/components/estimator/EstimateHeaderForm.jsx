import React from "react";
import { Input } from "@/components/ui/input";

const FIELDS = [
  { key: "project_name", label: "Estimate description" },
  { key: "client_name", label: "Client", readOnly: true },
  { key: "estimate_number", label: "Estimate #", readOnly: true },
  { key: "po_number", label: "PO number" },
  { key: "site_address", label: "Site address" },
  { key: "contact_name", label: "Contact name" },
  { key: "contact_email", label: "Contact email" },
  { key: "contact_phone", label: "Contact phone" },
  { key: "salesperson", label: "Salesperson" },
  { key: "target_install_date", label: "Target install date", type: "date" },
];

export default function EstimateHeaderForm({ estimate, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-900 mb-3">Project Info</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-gray-500">
            {f.label}
            <Input
              type={f.type || "text"}
              value={estimate[f.key] || ""}
              readOnly={f.readOnly}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
              className={f.readOnly ? "bg-gray-50 text-gray-600" : ""}
            />
          </label>
        ))}
        <label className="text-xs text-gray-500">
          Status
          <select
            value={estimate.status || "draft"}
            onChange={(e) => onChange({ status: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            {["draft", "calculated", "sent", "approved", "archived"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Priority
          <select
            value={estimate.priority || "normal"}
            onChange={(e) => onChange({ priority: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            {["low", "normal", "high", "rush"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}