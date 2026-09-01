import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { VinylMachine, User } from "@/entities/all";
import { ArrowLeft, Layers, Lock, Plus, Printer, Save, Scissors, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPE_META = {
  printer: { label: "Printer", icon: Printer },
  cutter: { label: "Cutter", icon: Scissors },
  print_and_cut: { label: "Print + Cut", icon: Printer },
  laminator: { label: "Laminator", icon: Layers },
};

const GEOMETRY_FIELDS = [
  ["max_media_width_inches", "Max media width", "in"],
  ["min_media_width_inches", "Min media width", "in"],
  ["left_margin_inches", "Left margin", "in"],
  ["right_margin_inches", "Right margin", "in"],
  ["leading_edge_inches", "Leading edge", "in"],
  ["trailing_edge_inches", "Trailing edge", "in"],
  ["default_gutter_horizontal_inches", "Horizontal gutter", "in"],
  ["default_gutter_vertical_inches", "Vertical gutter", "in"],
  ["default_bleed_inches", "Default bleed", "in"],
];

const PRINTER_FIELDS = [
  ["print_speed_sqft_per_hour", "Print speed", "sq ft/hr"],
  ["warmup_minutes", "Warmup", "min/job"],
  ["media_load_minutes", "Media load", "min/job"],
  ["calibration_minutes_per_job", "Calibration", "min/job"],
  ["machine_hourly_rate", "Machine rate", "$/hr"],
];

const CUTTER_FIELDS = [
  ["cut_speed_inches_per_second", "Cut speed", "in/sec"],
  ["cut_blade_cost", "Blade cost", "$"],
  ["cut_blade_life_minutes", "Blade life", "min"],
  ["cut_setup_minutes_per_job", "Cut setup", "min/job"],
  ["cut_pull_off_inches_per_job", "Pull-off", "in/job"],
  ["machine_hourly_rate", "Machine rate", "$/hr"],
];

const LAMINATOR_FIELDS = [
  ["laminator_speed_inches_per_minute", "Laminator speed", "in/min"],
  ["laminator_setup_minutes_per_job", "Setup", "min/job"],
  ["laminator_hourly_rate", "Machine rate", "$/hr"],
];

const INK_FIELDS = [
  ["print_cost_per_sqin_draft", "Draft ink + consumables", "$/sq in"],
  ["print_cost_per_sqin_production", "Production ink + consumables", "$/sq in"],
  ["print_cost_per_sqin_high_quality", "High-quality ink + consumables", "$/sq in"],
  ["print_cost_per_sqin", "Legacy fallback rate", "$/sq in"],
];

const stripMeta = (row) => {
  const { id, created_date, updated_date, created_by_id, created_by, is_sample, ...payload } = row;
  return payload;
};

const snapshot = (rows) => Object.fromEntries((rows || []).map((row) => [row.id, JSON.stringify(stripMeta(row))]));

export default function VinylSettings() {
  const [machines, setMachines] = useState([]);
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, me] = await Promise.all([
        VinylMachine.list("sort_order"),
        User.me().catch(() => null),
      ]);
      setMachines(rows || []);
      setOriginal(snapshot(rows || []));
      setUser(me);
    } catch (e) {
      setError(e.message || "Could not load Vinyl machines.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dirtyIds = useMemo(() => new Set(
    machines.filter((row) => JSON.stringify(stripMeta(row)) !== original[row.id]).map((row) => row.id)
  ), [machines, original]);

  const patch = (id, changes) => setMachines((prev) => prev.map((row) => row.id === id ? { ...row, ...changes } : row));

  const save = async (machine) => {
    if (!isAdmin || !machine?.id) return;
    setSavingId(machine.id);
    setError("");
    setMessage("");
    try {
      const payload = stripMeta(machine);
      const updated = await VinylMachine.update(machine.id, payload);
      const merged = { ...machine, ...(updated || {}) };
      setMachines((prev) => prev.map((row) => row.id === machine.id ? merged : row));
      setOriginal((prev) => ({ ...prev, [machine.id]: JSON.stringify(stripMeta(merged)) }));
      setMessage(`Saved ${machine.machine_name || "Vinyl machine"}.`);
    } catch (e) {
      setError(e.message || "Could not save Vinyl machine.");
    } finally {
      setSavingId(null);
    }
  };

  const addMachine = async (type) => {
    if (!isAdmin) return;
    setError("");
    setMessage("");
    try {
      const meta = TYPE_META[type] || TYPE_META.printer;
      const created = await VinylMachine.create({
        machine_name: `New ${meta.label}`,
        machine_type: type,
        is_active: false,
        is_default_for_type: false,
        sort_order: machines.length + 1,
      });
      setMachines((prev) => [...prev, created]);
      setOriginal((prev) => ({ ...prev, [created.id]: JSON.stringify(stripMeta(created)) }));
      setMessage(`Added ${meta.label}. It starts inactive so it cannot affect estimating until configured and enabled.`);
    } catch (e) {
      setError(e.message || "Could not add Vinyl machine.");
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-400">Loading Vinyl settings…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1250px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Estimator Settings
          </Link>
          <div className="flex gap-1.5 flex-wrap">
            {isAdmin ? Object.entries(TYPE_META).map(([type, meta]) => (
              <Button key={type} variant="outline" onClick={() => addMachine(type)} className="h-[30px] text-[10px]">
                <Plus className="w-3 h-3 mr-1" /> {meta.label}
              </Button>
            )) : (
              <div className="inline-flex items-center gap-1 text-[10px] text-gray-500"><Lock className="w-3 h-3" /> View only</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-blue-100 text-blue-700 flex items-center justify-center"><Settings2 className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-bold text-gray-900">Vinyl Settings</h1>
            <p className="text-[10px] text-gray-500">Production-machine geometry, run cost, ink, blade and setup data used directly by the current Vinyl nesting/cost engine.</p>
          </div>
          <Link to="/VinylInventory" className="text-[11px] font-semibold text-blue-700 hover:text-blue-900">Vinyl Inventory →</Link>
        </div>

        <div className="px-3 py-2 rounded border border-blue-200 bg-blue-50 text-[10px] text-blue-800">
          Vinyl material prices, roll sizes, waste, laminate and transfer-tape settings remain in the shared Vinyl Inventory. This page does not duplicate them. Existing machines are never deleted here; deactivate a machine to preserve historical references.
        </div>
        {message && <div className="px-3 py-2 rounded border border-green-200 bg-green-50 text-[11px] text-green-700">{message}</div>}
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        {machines.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-md p-10 text-center text-sm text-gray-500">No Vinyl machines configured.</div>
        ) : machines.map((machine) => (
          <MachineEditor
            key={machine.id}
            machine={machine}
            isAdmin={isAdmin}
            dirty={dirtyIds.has(machine.id)}
            saving={savingId === machine.id}
            onPatch={(changes) => patch(machine.id, changes)}
            onSave={() => save(machine)}
          />
        ))}

        <div className="text-[10px] text-gray-400 pb-3">Loaded {machines.length} VinylMachine record{machines.length === 1 ? "" : "s"}. No records are created on page load.</div>
      </div>
    </div>
  );
}

function MachineEditor({ machine, isAdmin, dirty, saving, onPatch, onSave }) {
  const meta = TYPE_META[machine.machine_type] || TYPE_META.printer;
  const Icon = meta.icon;
  const isPrinter = machine.machine_type === "printer" || machine.machine_type === "print_and_cut";
  const isCutter = machine.machine_type === "cutter" || machine.machine_type === "print_and_cut";
  const isLaminator = machine.machine_type === "laminator";

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <div className="w-8 h-8 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-600"><Icon className="w-4 h-4" /></div>
        <Input value={machine.machine_name || ""} onChange={(e) => onPatch({ machine_name: e.target.value })} disabled={!isAdmin} className="h-[30px] text-[12px] font-semibold flex-1 min-w-[210px]" />
        <Select value={machine.machine_type || "printer"} onValueChange={(value) => onPatch({ machine_type: value })} disabled={!isAdmin}>
          <SelectTrigger className="h-[30px] w-36 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(TYPE_META).map(([value, item]) => <SelectItem key={value} value={value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <Toggle label="Default" checked={!!machine.is_default_for_type} disabled={!isAdmin} onChange={(value) => onPatch({ is_default_for_type: value })} />
        <Toggle label="Active" checked={machine.is_active !== false} disabled={!isAdmin} onChange={(value) => onPatch({ is_active: value })} />
        <Button onClick={onSave} disabled={!isAdmin || !dirty || saving} className="h-[30px] text-[10px] bg-[#454545] hover:bg-[#353535] text-white disabled:opacity-40">
          <Save className="w-3 h-3 mr-1" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <TextField label="Manufacturer" value={machine.manufacturer} disabled={!isAdmin} onChange={(v) => onPatch({ manufacturer: v })} />
          <TextField label="Model" value={machine.model} disabled={!isAdmin} onChange={(v) => onPatch({ model: v })} />
          <NumberField label="Operator labor rate" suffix="$/hr" value={machine.operator_hourly_rate} disabled={!isAdmin} onChange={(v) => onPatch({ operator_hourly_rate: v })} />
          <NumberField label="Sort order" value={machine.sort_order} disabled={!isAdmin} onChange={(v) => onPatch({ sort_order: v })} />
        </div>

        <FieldSection title="Media & Nesting Geometry" description="These values define usable roll width, leading/trailing waste, gutters and bleed in the nesting calculator.">
          {GEOMETRY_FIELDS.map(([key, label, suffix]) => <NumberField key={key} label={label} suffix={suffix} value={machine[key]} disabled={!isAdmin} onChange={(v) => onPatch({ [key]: v })} />)}
        </FieldSection>

        {isPrinter && (
          <>
            <FieldSection title="Printing" description="Print time and machine cost. Print+Cut machines use this section and the Cutting section below.">
              {PRINTER_FIELDS.map(([key, label, suffix]) => <NumberField key={key} label={label} suffix={suffix} value={machine[key]} disabled={!isAdmin} onChange={(v) => onPatch({ [key]: v })} />)}
              <div>
                <Label className="text-[10px] text-gray-500">Default print quality</Label>
                <Select value={machine.default_print_quality || "high_quality"} onValueChange={(value) => onPatch({ default_print_quality: value })} disabled={!isAdmin}>
                  <SelectTrigger className="h-[30px] mt-1 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="production">Production</SelectItem><SelectItem value="high_quality">High Quality</SelectItem></SelectContent>
                </Select>
              </div>
            </FieldSection>
            <FieldSection title="Ink & Print Consumables" description="The current estimator uses the selected quality tier. The legacy fallback is preserved for compatibility.">
              {INK_FIELDS.map(([key, label, suffix]) => <NumberField key={key} label={label} suffix={suffix} step="0.001" value={machine[key]} disabled={!isAdmin} onChange={(v) => onPatch({ [key]: v })} />)}
            </FieldSection>
          </>
        )}

        {isCutter && (
          <FieldSection title="Cutting" description="Cut time, setup, blade wear and machine cost used by cut and print-and-cut workflows.">
            {CUTTER_FIELDS.map(([key, label, suffix]) => <NumberField key={key} label={label} suffix={suffix} value={machine[key]} disabled={!isAdmin} onChange={(v) => onPatch({ [key]: v })} />)}
          </FieldSection>
        )}

        {isLaminator && (
          <FieldSection title="Lamination" description="Lamination run time, setup and machine rate used when a workflow applies laminate.">
            {LAMINATOR_FIELDS.map(([key, label, suffix]) => <NumberField key={key} label={label} suffix={suffix} value={machine[key]} disabled={!isAdmin} onChange={(v) => onPatch({ [key]: v })} />)}
          </FieldSection>
        )}

        <div>
          <Label className="text-[10px] text-gray-500">Notes</Label>
          <textarea value={machine.notes || ""} onChange={(e) => onPatch({ notes: e.target.value })} disabled={!isAdmin} className="mt-1 min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-[11px] shadow-sm disabled:opacity-50" />
        </div>
      </div>
    </section>
  );
}

function FieldSection({ title, description, children }) {
  return (
    <div className="border border-gray-100 rounded-md overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100"><div className="text-[10px] font-bold uppercase tracking-wide text-gray-600">{title}</div><div className="text-[9px] text-gray-400 mt-0.5">{description}</div></div>
      <div className="p-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function NumberField({ label, suffix, value, onChange, disabled, step = "0.01" }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2"><Label className="text-[10px] text-gray-500">{label}</Label>{suffix && <span className="text-[9px] text-gray-400">{suffix}</span>}</div>
      <Input type="number" step={step} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} disabled={disabled} className="h-[30px] mt-1 text-[11px] text-right" />
    </div>
  );
}

function TextField({ label, value, onChange, disabled }) {
  return <div><Label className="text-[10px] text-gray-500">{label}</Label><Input value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-[30px] mt-1 text-[11px]" /></div>;
}

function Toggle({ label, checked, onChange, disabled }) {
  return <div className="flex items-center gap-1.5"><span className="text-[10px] text-gray-500">{label}</span><Switch checked={checked} onCheckedChange={onChange} disabled={disabled} /></div>;
}
