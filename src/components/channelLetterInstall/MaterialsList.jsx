import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Package, Loader2, ImageIcon } from "lucide-react";
import { materialFromInventory } from "./installCalculator";
import { GenerateImage } from "@/api/integrations";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

export default function MaterialsList({ item, inventory, onChange }) {
  const materials = item.materials || [];
  const [generatingIdx, setGeneratingIdx] = useState(null);

  // Build options of inventory items applicable to this line
  const eligibleInventory = (inventory || []).filter(inv => {
    if (inv.applies_to === "all") return true;
    return inv.applies_to === item.installation_type;
  });

  const addMaterial = (invId) => {
    const inv = inventory.find(i => i.id === invId);
    if (!inv) return;
    if (materials.some(m => m.inventory_item_id === invId)) return;
    const newMat = materialFromInventory(inv, item);
    // pull image from inventory if it exists
    if (inv.image_url) newMat.image_url = inv.image_url;
    onChange([...materials, newMat]);
  };

  const addCustomMaterial = () => {
    onChange([
      ...materials,
      {
        inventory_item_id: null,
        item_name: "Custom item",
        pricing_mode: "custom",
        unit_cost: 0,
        quantity: 1,
        total_cost: 0,
        is_custom: true,
        image_url: "",
      },
    ]);
  };

  const removeMaterial = (idx) => {
    const next = [...materials];
    next.splice(idx, 1);
    onChange(next);
  };

  const updateMaterial = (idx, patch) => {
    const next = [...materials];
    next[idx] = { ...next[idx], ...patch };
    next[idx].total_cost = (parseFloat(next[idx].unit_cost) || 0) * (parseFloat(next[idx].quantity) || 0);
    onChange(next);
  };

  const generateImageForMaterial = async (idx) => {
    const mat = materials[idx];
    const name = (mat.item_name || "").trim();
    if (!name || name === "Custom item") {
      alert("Please name the material first.");
      return;
    }
    setGeneratingIdx(idx);
    try {
      const res = await GenerateImage({
        prompt: `Photograph of "${name}" — a signage installation material or hardware item used by professional sign installers. Product is centered in the frame, full item clearly visible, neutral light background, professional product photography, sharp focus, no people, no text overlay.`,
      });
      if (res?.url) {
        updateMaterial(idx, { image_url: res.url });
      }
    } catch (e) {
      console.error("Image generation failed:", e);
      alert("Image generation failed: " + (e.message || "unknown error"));
    }
    setGeneratingIdx(null);
  };

  const totalMaterials = materials.reduce((s, m) => s + (parseFloat(m.total_cost) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Materials</span>
          <span className="text-xs text-slate-400">({materials.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value="" onValueChange={addMaterial}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[160px]">
              <SelectValue placeholder="+ Add material..." />
            </SelectTrigger>
            <SelectContent>
              {eligibleInventory.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-slate-500">No inventory items match this install type</div>
              ) : eligibleInventory.map(inv => (
                <SelectItem
                  key={inv.id}
                  value={inv.id}
                  disabled={materials.some(m => m.inventory_item_id === inv.id)}
                >
                  {inv.item_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCustomMaterial}
            className="h-8 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" /> Custom
          </Button>
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="text-xs text-slate-400 italic px-2 py-3 text-center border border-dashed border-slate-200 rounded">
          No materials added. Use the dropdown to add from inventory.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium w-12">Img</th>
                <th className="text-left px-2 py-1.5 font-medium">Item</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">Unit $</th>
                <th className="text-right px-2 py-1.5 font-medium w-16">Qty</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="px-2 py-1">
                    {m.image_url ? (
                      <img
                        src={m.image_url}
                        alt={m.item_name}
                        className="w-10 h-10 object-contain rounded border border-slate-200 bg-white"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => generateImageForMaterial(idx)}
                        disabled={generatingIdx === idx}
                        title="Generate image with AI"
                        className="w-10 h-10 rounded border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-purple-600 disabled:opacity-50"
                      >
                        {generatingIdx === idx ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {m.is_custom ? (
                      <Input
                        value={m.item_name || ""}
                        onChange={(e) => updateMaterial(idx, { item_name: e.target.value })}
                        onBlur={() => {
                          // auto-generate image when user finishes naming, if no image yet
                          const name = (m.item_name || "").trim();
                          if (!m.image_url && name && name !== "Custom item" && generatingIdx === null) {
                            generateImageForMaterial(idx);
                          }
                        }}
                        className="h-7 text-xs"
                        placeholder="Custom item name"
                      />
                    ) : (
                      m.item_name
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={m.unit_cost ?? 0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateMaterial(idx, { unit_cost: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs text-right"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={m.quantity ?? 0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateMaterial(idx, { quantity: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs text-right"
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{fmt(m.total_cost)}</td>
                  <td className="px-1 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMaterial(idx)}
                      className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <td colSpan="4" className="px-2 py-1.5 text-right font-medium">Materials Total</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(totalMaterials)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}