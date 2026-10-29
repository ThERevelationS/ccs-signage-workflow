import { Input } from "@/components/ui/input";
import { allowedEstimateStatusTransitions } from "@/components/estimator/estimateStatusTransitions";
import { useAuth } from "@/components/auth/EmailGate";

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
            onChange={(e) => {
              const next = e.target.value;
              if (next === "archived" && estimate.status !== "archived") {
                const reason = window.prompt("Optional: why is this estimate being archived? (e.g. lost, superseded, test)", estimate.archived_reason || "") || "";
                onChange({ status: next, archived_at: new Date().toISOString(), archived_reason: reason });
              } else {
                onChange({ status: next });
              }
            }}
            disabled={readOnly}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:bg-gray-50 disabled:text-gray-500"
          >
            {[estimate.status || "draft", ...allowedEstimateStatusTransitions(estimate.status)]
              .filter((s, i, arr) => arr.indexOf(s) === i && ["draft", "calculated", "sent", "approved", "archived"].includes(s))
              .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500 flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={!!estimate.is_template}
            onChange={(e) => onChange({ is_template: e.target.checked })}
            disabled={readOnly}
            className="w-3.5 h-3.5 accent-red-600"
          />
          Reusable template
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
        <MyTagPicker estimate={estimate} onChange={onChange} readOnly={readOnly} />
      </div>
    </div>
  );
}
const MY_TAG_COLORS = ["", "red", "amber", "green", "blue", "violet"];

function MyTagPicker({ estimate, onChange, readOnly }) {
  const { user } = useAuth();
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return null;
  const mine = estimate?.personal_tags?.[email] || {};
  const color = String(mine.color || "");
  return (
    <label className="text-xs text-gray-500">
      My label
      <select
        value={color}
        onChange={(e) => {
          const next = { ...(estimate?.personal_tags || {}) };
          if (e.target.value) next[email] = { color: e.target.value };
          else delete next[email];
          onChange({ personal_tags: next });
        }}
        disabled={readOnly}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:bg-gray-50 disabled:text-gray-500"
      >
        {MY_TAG_COLORS.map((c) => (
          <option key={c || "none"} value={c}>{c || "none"}</option>
        ))}
      </select>
    </label>
  );
}
