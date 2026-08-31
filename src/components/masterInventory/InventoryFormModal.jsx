import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, X } from "lucide-react";
import {
  LABOR_SERVICE_CATEGORY_FIELDS,
  LABOR_SERVICE_CATEGORY_FIELD_NAMES,
} from "./laborServiceCategorySchema";

/**
 * Generic inventory add/edit modal driven by a `source` config object.
 */
export default function InventoryFormModal({ source, editingItem, onCancel, onSaved }) {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Is this the Labor & Services source? If so we drive category-specific
  // fields from the per-category schema below.
  const isLaborServices = source?.key === "labor_services";
  const currentCategory = formData.service_category || "";
  const categorySchema = isLaborServices ? LABOR_SERVICE_CATEGORY_FIELDS[currentCategory] : null;

  // Initialize form whenever the modal opens / source changes
  useEffect(() => {
    const initial = {};
    source.fields.forEach((f) => {
      // Priority: existing row value → source.defaults → boolean false / blank.
      const fromDefaults = source.defaults?.[f.name];
      initial[f.name] = editingItem?.[f.name] ?? fromDefaults ?? (f.type === "boolean" ? false : "");
    });
    // Pre-fill category-specific fields too (so editing an existing row shows
    // its saved values for every category-owned field).
    if (source?.key === "labor_services") {
      LABOR_SERVICE_CATEGORY_FIELD_NAMES.forEach((name) => {
        if (initial[name] === undefined) {
          initial[name] = editingItem?.[name] ?? "";
        }
      });
    }
    setFormData(initial);
  }, [source, editingItem]);

  const update = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Required check
    for (const f of source.fields) {
      if (f.required) {
        const v = formData[f.name];
        if (v === undefined || v === null || v === "") {
          alert(`Please fill in "${f.label}"`);
          return;
        }
      }
    }

    // Coerce types — for the base fields AND (if Labor & Services) the
    // category-specific fields for the SELECTED category only. Fields owned by
    // other categories are left untouched so switching categories doesn't wipe
    // historical data, but we don't write empty values for them either.
    const payload = {};
    const coerce = (f, v) => {
      if (f.type === "number") {
        return v === "" || v === null || v === undefined ? null : parseFloat(v);
      }
      if (f.type === "boolean") return !!v;
      return v ?? "";
    };

    source.fields.forEach((f) => { payload[f.name] = coerce(f, formData[f.name]); });

    if (isLaborServices && categorySchema) {
      categorySchema.fields.forEach((f) => {
        payload[f.name] = coerce(f, formData[f.name]);
      });
    }

    // Apply source-level defaults for fields not in the form schema (e.g.
    // `material_type: "pole"` for the Poles sub-tab — needed for entity
    // categorization but not user-editable).
    if (source.defaults) {
      Object.entries(source.defaults).forEach(([k, v]) => {
        if (payload[k] === undefined || payload[k] === "" || payload[k] === null) {
          payload[k] = v;
        }
      });
    }

    setSaving(true);
    try {
      if (editingItem?.id) {
        await source.entity.update(editingItem.id, payload);
      } else {
        await source.entity.create(payload);
      }
      onSaved?.();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Error saving item. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b sticky top-0 bg-white z-10">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              {source.icon && <source.icon className={`w-5 h-5 ${source.color}`} />}
              {editingItem?.id ? "Edit" : "Add"} {source.label}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {source.fields.map((f) => {
                if (f.type === "textarea") return null; // render full-width below

                // Conditional visibility based on another field's value (e.g. service_category)
                if (f.showIfCategory) {
                  const cat = formData.service_category || formData.category || "";
                  if (cat !== f.showIfCategory) return null;
                }
                if (f.showIfNotCategory) {
                  const cat = formData.service_category || formData.category || "";
                  if (cat === f.showIfNotCategory) return null;
                }

                return (
                  <div key={f.name} className={f.type === "boolean" ? "md:col-span-2 flex items-center gap-3 pt-2" : ""}>
                    {f.type !== "boolean" && (
                      <Label className="text-slate-700">
                        {f.label} {f.required && <span className="text-red-500">*</span>}
                      </Label>
                    )}
                    {f.type === "select" && (
                      <Select
                        value={formData[f.name] || ""}
                        onValueChange={(v) => update(f.name, v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options.map((o) => (
                            <SelectItem key={o} value={o}>
                              {String(o)
                                .replace(/_/g, " ")
                                .replace(/\b\w/g, (c) => c.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {f.type === "text" && (
                      <Input
                        value={formData[f.name] || ""}
                        onChange={(e) => update(f.name, e.target.value)}
                        placeholder={f.placeholder}
                        className="mt-1"
                      />
                    )}
                    {f.type === "number" && (
                      <Input
                        type="number"
                        step="any"
                        value={formData[f.name] ?? ""}
                        onChange={(e) => update(f.name, e.target.value)}
                        placeholder={f.placeholder}
                        className="mt-1"
                      />
                    )}
                    {f.type === "boolean" && (
                      <>
                        <Switch
                          checked={!!formData[f.name]}
                          onCheckedChange={(v) => update(f.name, v)}
                        />
                        <Label className="text-slate-700">{f.label}</Label>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Category-specific section (Labor & Services only) */}
            {isLaborServices && categorySchema && (
              <div className="border-t pt-4 mt-2">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="inline-block w-1 h-4 bg-emerald-500 rounded-full" />
                  {categorySchema.label}
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {categorySchema.fields.map((f) => (
                    <div key={f.name} className={f.type === "boolean" ? "md:col-span-2 flex items-center gap-3 pt-2" : ""}>
                      {f.type !== "boolean" && (
                        <Label className="text-slate-700">{f.label}</Label>
                      )}
                      {f.type === "select" && (
                        <Select
                          value={formData[f.name] || ""}
                          onValueChange={(v) => update(f.name, v)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {f.options.map((o) => (
                              <SelectItem key={o} value={o}>
                                {String(o)
                                  .replace(/_/g, " ")
                                  .replace(/\b\w/g, (c) => c.toUpperCase())}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {f.type === "text" && (
                        <Input
                          value={formData[f.name] || ""}
                          onChange={(e) => update(f.name, e.target.value)}
                          className="mt-1"
                        />
                      )}
                      {f.type === "number" && (
                        <Input
                          type="number"
                          step="any"
                          value={formData[f.name] ?? ""}
                          onChange={(e) => update(f.name, e.target.value)}
                          className="mt-1"
                        />
                      )}
                      {f.type === "boolean" && (
                        <>
                          <Switch
                            checked={!!formData[f.name]}
                            onCheckedChange={(v) => update(f.name, v)}
                          />
                          <Label className="text-slate-700">{f.label}</Label>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full-width textareas */}
            {source.fields.filter((f) => f.type === "textarea").map((f) => (
              <div key={f.name}>
                <Label className="text-slate-700">{f.label}</Label>
                <Textarea
                  value={formData[f.name] || ""}
                  onChange={(e) => update(f.name, e.target.value)}
                  className="mt-1 h-20"
                />
              </div>
            ))}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : editingItem ? "Update" : "Add"} Item
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}