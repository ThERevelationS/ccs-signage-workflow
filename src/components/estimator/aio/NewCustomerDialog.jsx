import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const FIELDS = [
  { key: "company_name", label: "Company name *" },
  { key: "company_phone", label: "Company phone" },
  { key: "contact_first_name", label: "Contact first name" },
  { key: "contact_last_name", label: "Contact last name" },
  { key: "contact_email", label: "Contact email" },
  { key: "contact_office_phone", label: "Office phone" },
  { key: "contact_office_ext", label: "Ext." },
  { key: "billing_address_1", label: "Billing address" },
  { key: "billing_city", label: "City" },
  { key: "billing_state", label: "State" },
  { key: "billing_postal_code", label: "Postal code" },
  { key: "terms", label: "Terms" },
];

const EMPTY = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: "" }), {});

export default function NewCustomerDialog({ open, onClose, onCreated }) {
  const [data, setData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    if (!data.company_name.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    try {
      const created = await base44.entities.Customer.create({
        ...data,
        company_name: data.company_name.trim(),
        customer_status: "prospect",
        is_active: true,
      });
      onCreated(created);
      setData(EMPTY);
      onClose();
    } catch (e) {
      setError(e.message || "Could not create the customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">New Customer</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-[12px] text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-[11px] text-gray-500">
              {f.label}
              <input
                value={data[f.key]}
                onChange={(e) => setData((p) => ({ ...p, [f.key]: e.target.value }))}
                className="w-full h-[28px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400"
              />
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="h-[30px] px-3 rounded border border-gray-300 text-[12px] font-semibold text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-[30px] px-4 rounded bg-lime-200 border border-lime-300 text-[12px] font-semibold text-gray-800 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create Customer"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}