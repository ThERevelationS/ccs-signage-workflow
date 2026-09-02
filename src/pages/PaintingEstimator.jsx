import React, { useEffect, useMemo, useState } from "react";
import { Project, Settings } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Palette, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizePaintProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";
import { newBuilderItemId, seedBuilderItemIds } from "@/components/estimator/builder/itemIdentity";
import {
  PAINT_THICKNESSES,
  autoPaintMaskSqft,
  calculatePaintingProject,
  normalizePaintingItem,
} from "@/components/estimator/paint/paintCalc";

const money = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const number = (value, digits = 2) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: digits });

const emptyItem = () => normalizePaintingItem({
  builder_item_id: newBuilderItemId("paint-item"),
  paint_colors: [""],
});

export default function PaintingEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [project, setProject] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [settingsRows, existing, estimate] = await Promise.all([
          Settings.list(),
          editId ? Project.get(editId).catch(() => null) : Promise.resolve(null),
          estimateId ? base44.entities.AllInOneEstimate.get(estimateId).catch(() => null) : Promise.resolve(null),
        ]);
        if (!active) return;
        const settingsMap = {};
        (settingsRows || []).forEach((row) => { settingsMap[row.setting_name] = row.setting_value; });
        setSettings(settingsMap);
        const suppliesDefault = Number(settingsMap.default_paint_supplies_per_sqft) || 1.25;
        if (existing) {
          setProject({
            ...existing,
            client_name: estimate?.client_name || existing.client_name || "",
            customer_id: estimate?.customer_id || existing.customer_id || null,
            estimate_number: estimate?.estimate_number || existing.estimate_number || "",
            items: seedBuilderItemIds((existing.items || []).map(normalizePaintingItem), "paint-item"),
            paint_supplies_per_sqft: existing.paint_supplies_per_sqft ?? suppliesDefault,
          });
        } else {
          setProject({
            project_name: estimate?.project_name ? `${estimate.project_name} — Painting` : "",
            client_name: estimate?.client_name || "",
            customer_id: estimate?.customer_id || null,
            estimate_number: estimate?.estimate_number || "",
            hyperlink: "",
            status: "draft",
            items: [],
            paint_supplies_per_sqft: suppliesDefault,
            notes: settingsMap.default_notes_template || "",
          });
        }
      } catch (e) {
        console.error("Could not load Painting estimator:", e);
        if (active) setError(e.message || "Could not load Painting estimator.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [editId, estimateId]);

  const calculated = useMemo(
    () => project ? calculatePaintingProject(project, settings) : null,
    [project, settings]
  );
  const totals = calculated?.totals || {};

  const patchProject = (changes) => setProject((prev) => ({ ...prev, ...changes }));

  const patchItem = (index, changes, { autoMask = false } = {}) => {
    setProject((prev) => {
      const items = [...(prev.items || [])];
      let item = normalizePaintingItem({ ...items[index], ...changes });
      if (item.item_type === "lettering") item.quantity = 1;
      if (Object.prototype.hasOwnProperty.call(changes, "width") && item.item_type === "lettering") {
        const height = Number(item.width || 0);
        item.letter_size = height <= 4 ? "extra_small"
          : height <= 8 ? "small"
            : height <= 12 ? "normal"
              : height <= 20 ? "medium"
                : height <= 30 ? "large"
                  : "extra_large";
      }
      if (autoMask) item.paint_mask_sqft = autoPaintMaskSqft(item);
      items[index] = item;
      return { ...prev, items };
    });
  };

  const addItem = () => patchProject({ items: [...(project.items || []), emptyItem()] });
  const removeItem = (index) => patchProject({ items: project.items.filter((_, i) => i !== index) });

  const updateColor = (itemIndex, colorIndex, value) => {
    const colors = [...(project.items[itemIndex].paint_colors || [])];
    colors[colorIndex] = value;
    patchItem(itemIndex, { paint_colors: colors });
  };
  const addColor = (itemIndex) => patchItem(itemIndex, { paint_colors: [...(project.items[itemIndex].paint_colors || []), ""] });
  const removeColor = (itemIndex, colorIndex) => patchItem(itemIndex, {
    paint_colors: (project.items[itemIndex].paint_colors || []).filter((_, i) => i !== colorIndex),
  });

  const saveProject = async () => {
    if (!project?.project_name?.trim() || !project?.client_name?.trim()) {
      setError("Project name and client name are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const cleanItems = (calculated?.items || []).map((item) => ({
        ...item,
        paint_colors: (item.paint_colors || []).filter((color) => String(color || "").trim()),
      }));
      const pricingProject = {
        ...project,
        total_paint_mask_cost: Number(totals.total_paint_mask_cost || 0),
        total_liquid_paint_and_supplies_cost: Number(totals.total_liquid_paint_and_supplies_cost || 0),
        total_labor_cost: Number(totals.total_labor_cost || 0),
      };
      const customerPricing = project.customer_pricing?.applied === true
        ? await calculateSavedCustomerPricing({
            project: pricingProject,
            categorize: categorizePaintProject,
            tierNumber: project.customer_pricing?.tier_number,
          })
        : project.customer_pricing;
      const payload = {
        project_name: project.project_name,
        client_name: project.client_name,
        customer_id: project.customer_id || null,
        estimate_number: project.estimate_number || "",
        hyperlink: project.hyperlink || "",
        status: "calculated",
        items: cleanItems,
        paint_supplies_per_sqft: Number(project.paint_supplies_per_sqft || 0),
        total_paint_mask_cost: Number(totals.total_paint_mask_cost || 0),
        total_liquid_paint_and_supplies_cost: Number(totals.total_liquid_paint_and_supplies_cost || 0),
        total_labor_cost: Number(totals.total_labor_cost || 0),
        customer_pricing: customerPricing,
        notes: project.notes || "",
      };

      let projectId = editId;
      if (projectId) await Project.update(projectId, payload);
      else projectId = (await Project.create(payload)).id;

      const savedProject = await Project.get(projectId);
      if (estimateId) {
        await recordBuilderSave({
          estimateId,
          line: { project_id: projectId, module_key: "painting" },
          sourceProject: savedProject,
          liveTotal: Number(totals.total_cost || 0),
        });
      }
      setProject((prev) => ({ ...prev, ...savedProject, items: seedBuilderItemIds(savedProject.items || [], "paint-item") }));
      onSaved?.();
      if (!embedded && !editId) navigate(`/PaintingEstimator?id=${projectId}`);
    } catch (e) {
      console.error("Could not save Painting estimator:", e);
      setError(e.message || "Could not save Painting estimator.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Painting Builder…</div>;
  if (!project) return <div className="p-10 text-center text-red-600">{error || "Painting project not found."}</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1220px] mx-auto p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          {embedded ? (
            <button type="button" onClick={onClose} className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4" /> Back to products
            </button>
          ) : (
            <Link to={estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator"} className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4" /> Back to estimator
            </Link>
          )}
          <Button onClick={saveProject} disabled={saving} className="h-[32px] bg-[#454545] hover:bg-[#353535] text-white text-[12px] font-semibold">
            <Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Save Painting"}
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center"><Palette className="w-5 h-5" /></div>
          <div>
            <h1 className="text-[20px] font-bold text-gray-900">Painting Builder</h1>
            <p className="text-[11px] text-gray-500">Panels, dimensional lettering and complex shapes using the migrated SignEstimate Pro paint formulas.</p>
          </div>
        </div>

        {error && <div className="mb-3 px-3 py-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded">{error}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_310px] gap-4">
          <div className="space-y-4 min-w-0">
            <section className="bg-white border border-gray-200 rounded-md p-4">
              <div className="text-[12px] font-bold text-gray-800 mb-3">Project</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-[11px] text-gray-600">Project name
                  <Input value={project.project_name || ""} onChange={(e) => patchProject({ project_name: e.target.value })} className="mt-1 h-[32px] text-[12px]" />
                </label>
                <label className="text-[11px] text-gray-600">Client
                  <Input value={project.client_name || ""} onChange={(e) => patchProject({ client_name: e.target.value })} disabled={!!estimateId} className="mt-1 h-[32px] text-[12px]" />
                </label>
                <label className="text-[11px] text-gray-600">Estimate number
                  <Input value={project.estimate_number || ""} onChange={(e) => patchProject({ estimate_number: e.target.value })} disabled={!!estimateId} className="mt-1 h-[32px] text-[12px]" />
                </label>
                <label className="text-[11px] text-gray-600">Paint application supplies / sq ft / color
                  <Input type="number" step="0.01" min="0" value={project.paint_supplies_per_sqft ?? ""} onChange={(e) => patchProject({ paint_supplies_per_sqft: Number(e.target.value) })} className="mt-1 h-[32px] text-[12px]" />
                </label>
              </div>
              <label className="block text-[11px] text-gray-600 mt-3">Notes
                <Textarea value={project.notes || ""} onChange={(e) => patchProject({ notes: e.target.value })} className="mt-1 min-h-[70px] text-[12px]" />
              </label>
            </section>

            <section className="bg-white border border-gray-200 rounded-md">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-bold text-gray-800">Paint Items</div>
                  <div className="text-[10px] text-gray-500">Geometry drives paintable area; colors drive paint, mask and labor.</div>
                </div>
                <Button onClick={addItem} variant="outline" className="h-[30px] px-3 text-[11px]"><Plus className="w-3.5 h-3.5 mr-1" /> Add Item</Button>
              </div>

              {(project.items || []).length === 0 ? (
                <div className="py-12 text-center text-[12px] text-gray-400">No paint items yet.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {project.items.map((rawItem, index) => {
                    const item = calculated.items[index] || rawItem;
                    const lettering = rawItem.item_type === "lettering";
                    return (
                      <div key={rawItem.builder_item_id || index} className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold">{index + 1}</span>
                          <Input value={rawItem.description || ""} onChange={(e) => patchItem(index, { description: e.target.value })} placeholder="Item description" className="h-[30px] text-[12px] flex-1" />
                          <button type="button" onClick={() => removeItem(index)} className="w-8 h-8 inline-flex items-center justify-center rounded text-red-500 hover:bg-red-50" aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          <Field label="Type">
                            <Select value={rawItem.item_type || "panel"} onValueChange={(value) => patchItem(index, { item_type: value }, { autoMask: true })}>
                              <SelectTrigger className="h-[30px] text-[11px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="panel">Panel</SelectItem>
                                <SelectItem value="lettering">Lettering</SelectItem>
                                <SelectItem value="complex_shapes">Complex Shape</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Thickness">
                            <Select value={rawItem.thickness || "1/2"} onValueChange={(value) => patchItem(index, { thickness: value }, { autoMask: true })}>
                              <SelectTrigger className="h-[30px] text-[11px]"><SelectValue /></SelectTrigger>
                              <SelectContent>{PAINT_THICKNESSES.map((size) => <SelectItem value={size} key={size}>{size}&quot;</SelectItem>)}</SelectContent>
                            </Select>
                          </Field>
                          <Field label={lettering ? "Letter height (in)" : "Length (in)"}>
                            <Input type="number" min="0" step="0.01" value={rawItem[lettering ? "width" : "length"] ?? 0} onChange={(e) => patchItem(index, { [lettering ? "width" : "length"]: Number(e.target.value) }, { autoMask: true })} className="h-[30px] text-[11px]" />
                          </Field>
                          <Field label={lettering ? "Number of letters" : "Width (in)"}>
                            <Input type="number" min="0" step={lettering ? "1" : "0.01"} value={rawItem[lettering ? "length" : "width"] ?? 0} onChange={(e) => patchItem(index, { [lettering ? "length" : "width"]: Number(e.target.value) }, { autoMask: true })} className="h-[30px] text-[11px]" />
                          </Field>
                          {!lettering && <Field label="Quantity"><Input type="number" min="1" step="1" value={rawItem.quantity ?? 1} onChange={(e) => patchItem(index, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="h-[30px] text-[11px]" /></Field>}
                          <Field label="Paint sides">
                            <Select value={rawItem.paint_sides || "one_side"} onValueChange={(value) => patchItem(index, { paint_sides: value })}>
                              <SelectTrigger className="h-[30px] text-[11px]"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="one_side">One side + edges</SelectItem><SelectItem value="both_sides">Both sides + edges</SelectItem></SelectContent>
                            </Select>
                          </Field>
                          {rawItem.item_type === "complex_shapes" && <Field label="Edge complexity"><Input type="number" min="0" step="0.1" value={rawItem.edge_complexity_multiplier ?? 1} onChange={(e) => patchItem(index, { edge_complexity_multiplier: Number(e.target.value) })} className="h-[30px] text-[11px]" /></Field>}
                          <Field label="Paint mask sq ft"><Input type="number" min="0" step="0.01" value={rawItem.paint_mask_sqft ?? 0} onChange={(e) => patchItem(index, { paint_mask_sqft: Number(e.target.value) })} className="h-[30px] text-[11px]" /></Field>
                          <Field label="Item fixed waste (gal)"><Input type="number" min="0" step="0.01" value={rawItem.fixed_waste_gallons ?? 0} onChange={(e) => patchItem(index, { fixed_waste_gallons: Number(e.target.value) })} className="h-[30px] text-[11px]" /></Field>
                          <Field label="Base supplies"><Input type="number" min="0" step="0.01" value={rawItem.base_supplies_cost ?? 0} onChange={(e) => patchItem(index, { base_supplies_cost: Number(e.target.value) })} className="h-[30px] text-[11px]" /></Field>
                        </div>

                        <div className="bg-gray-50 border border-gray-100 rounded p-2.5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Paint colors</div>
                            <button type="button" onClick={() => addColor(index)} className="text-[10px] font-semibold text-sky-700 hover:text-sky-900">+ Add color</button>
                          </div>
                          {(rawItem.paint_colors || []).length === 0 ? <div className="text-[10px] text-gray-400">No colors selected — no liquid paint is charged.</div> : (
                            <div className="flex flex-wrap gap-2">
                              {(rawItem.paint_colors || []).map((color, colorIndex) => (
                                <div className="flex items-center gap-1" key={colorIndex}>
                                  <Input value={color || ""} onChange={(e) => updateColor(index, colorIndex, e.target.value)} placeholder="PMS / color" className="h-[28px] w-[145px] text-[11px]" />
                                  <button type="button" onClick={() => removeColor(index, colorIndex)} className="w-6 h-6 rounded text-gray-400 hover:text-red-600 hover:bg-white">×</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px]">
                          <Metric label="Paintable area" value={`${number(item.paintable_sqft)} sf`} />
                          <Metric label="Paint mask" value={money(item.supplies_cost)} />
                          <Metric label="Paint + supplies" value={money(item.paint_cost)} />
                          <Metric label="Labor" value={money(item.labor_cost)} />
                          <Metric label="Paint volume" value={`${number(item.paint_gallons, 3)} gal`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-3">
            <section className="bg-white border border-gray-200 rounded-md sticky top-4">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="text-[12px] font-bold text-gray-800">Cost Summary</div>
                <div className="text-[10px] text-gray-500">Internal Builder cost before estimate-level markup.</div>
              </div>
              <div className="p-4 space-y-2 text-[11px]">
                <SummaryRow label="Paint mask" value={money(totals.total_paint_mask_cost)} />
                <SummaryRow label="Liquid paint & supplies" value={money(totals.total_liquid_paint_and_supplies_cost)} />
                <SummaryRow label="Painting labor" value={money(totals.total_labor_cost)} />
                <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-center">
                  <span className="font-bold text-gray-800">Total cost</span>
                  <span className="text-[16px] font-bold text-gray-900">{money(totals.total_cost)}</span>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 space-y-1.5 text-[10px] text-gray-500">
                <SummaryRow label="Paint needed" value={`${number(totals.total_paint_gallons, 3)} gal`} subtle />
                <SummaryRow label="Labor time" value={`${number(totals.total_labor_hours)} hr`} subtle />
                <SummaryRow label="Unique colors" value={number(totals.unique_color_count, 0)} subtle />
                <SummaryRow label="Mixes" value={number(totals.number_of_mixes, 0)} subtle />
                <SummaryRow label="Setup / cleanup" value={`${number(totals.setup_hours)} hr`} subtle />
                <SummaryRow label="Mixing" value={`${number(totals.mixing_hours)} hr`} subtle />
              </div>
              <div className="px-4 py-3 border-t border-gray-100 text-[10px] text-gray-500">
                Mixed paint rate: <span className="font-semibold text-gray-700">{money(calculated.liquidPaintRate)}/sf</span>
              </div>
            </section>
          </aside>
        </div>

        <div className="mt-4">
          <CustomerPricingTab
            project={{
              ...project,
              total_paint_mask_cost: Number(totals.total_paint_mask_cost || 0),
              total_liquid_paint_and_supplies_cost: Number(totals.total_liquid_paint_and_supplies_cost || 0),
              total_labor_cost: Number(totals.total_labor_cost || 0),
            }}
            categorize={categorizePaintProject}
            accentColor="blue"
            onApplyTier={(tier) => patchProject({
              customer_pricing: { ...(project.customer_pricing || {}), applied: true, tier_number: tier },
            })}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="text-[10px] text-gray-500 min-w-0"><span className="block mb-1">{label}</span>{children}</label>;
}

function Metric({ label, value }) {
  return <div className="bg-white border border-gray-100 rounded px-2 py-1.5"><div className="text-gray-400">{label}</div><div className="font-semibold text-gray-700 mt-0.5">{value}</div></div>;
}

function SummaryRow({ label, value, subtle = false }) {
  return <div className={`flex items-center justify-between gap-3 ${subtle ? "text-gray-500" : "text-gray-600"}`}><span>{label}</span><span className={subtle ? "font-medium" : "font-semibold text-gray-800"}>{value}</span></div>;
}
