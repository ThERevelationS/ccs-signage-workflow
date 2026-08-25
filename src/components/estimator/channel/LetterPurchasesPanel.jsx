import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const FEES = [
  { key: "letters_delivery_fee", label: "Delivery" },
  { key: "letters_design_fee", label: "Design" },
  { key: "letters_install_supplies_fee", label: "Install supplies" },
  { key: "letters_permitting_fee", label: "Permitting" },
  { key: "letters_other_fee", label: "Other" },
  { key: "letters_markup_percent", label: "Letters markup %" },
];

export default function LetterPurchasesPanel({ project, purchases, totals, onChange }) {
  const setRow = (idx, patch) =>
    onChange({
      letter_purchases: (project.letter_purchases || []).map((p, i) =>
        i === idx ? { ...p, ...patch } : p
      ),
    });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-900">Letters Purchased / Fabricated</h2>

      {purchases.map((p, idx) => (
        <div key={idx} className="flex flex-wrap items-end gap-2">
          <Input
            className="flex-1 min-w-[140px]"
            placeholder="Description"
            value={p.description || ""}
            onChange={(e) => setRow(idx, { description: e.target.value })}
          />
          <Input
            className="w-28"
            placeholder="Vendor"
            value={p.vendor || ""}
            onChange={(e) => setRow(idx, { vendor: e.target.value })}
          />
          <Input
            className="w-16"
            type="number"
            value={p.qty ?? 1}
            onChange={(e) => setRow(idx, { qty: parseFloat(e.target.value) || 0 })}
          />
          <Input
            className="w-24"
            type="number"
            placeholder="$ each"
            value={p.unit_cost ?? 0}
            onChange={(e) => setRow(idx, { unit_cost: parseFloat(e.target.value) || 0 })}
          />
          <span className="text-sm text-gray-700 w-20 text-right">{money(p.line_total)}</span>
          <button
            onClick={() =>
              onChange({ letter_purchases: project.letter_purchases.filter((_, i) => i !== idx) })
            }
            className="text-gray-400 hover:text-red-600 p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({ letter_purchases: [...(project.letter_purchases || []), { qty: 1, unit_cost: 0 }] })
        }
      >
        <Plus className="w-4 h-4" /> Add Letter Line
      </Button>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-gray-100 pt-3">
        {FEES.map((f) => (
          <label key={f.key} className="text-xs text-gray-500">
            {f.label}
            <Input
              type="number"
              value={project[f.key] ?? 0}
              onChange={(e) => onChange({ [f.key]: parseFloat(e.target.value) || 0 })}
            />
          </label>
        ))}
      </div>

      <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
        <span className="text-gray-500">Letters total (with markup)</span>
        <span className="font-semibold text-gray-900">{money(totals.total_letters_cost)}</span>
      </div>
    </div>
  );
}