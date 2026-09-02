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

export default function EstimateHeaderForm({ estimate, onChange, readOnly = false }) {
  return (
    <div className="bg-white rounded-md border border-gray-200 p-4">
      <div className="text-[11px] font-bold tracking-wider text-red-600 mb-3">ESTIMATE DETAILS</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-gray-500">
            {f.label}
            <Input
              type={f.type || "text"}
              value={estimate[f.key] || ""}
              readOnly={f.readOnly || readOnly}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
              className={f.readOnly || readOnly ? "bg-gray-50 text-gray-600" : ""}
            />
          </label>
        ))}
        <label className="text-xs text-gray-500">
          Status
          <select
            value={estimate.status || "draft"}
            onChange={(e) => onChange({ status: e.target.value })}
            disabled={readOnly}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:bg-gray-50 disabled:text-gray-500"
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
            disabled={readOnly}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:bg-gray-50 disabled:text-gray-500"
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