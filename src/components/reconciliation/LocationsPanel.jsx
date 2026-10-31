import { useEffect, useState } from "react";
import { Loader2, MapPin, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
import { EmptyState, StatusChip, filterInputCls } from "@/components/kit";

const clean = (v) => String(v ?? "").trim();
const inputCls = filterInputCls;
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const EMPTY_FORM = { name: "", code: "", tax_group: "", address: "", hours: "", active: true };

// SalesLocation registry — the point-of-sale locations ReconcileWizard offers
// when a batch closes (replaces the old free-text location). Reads/writes go
// through the staff gateways (staffEntities.SalesLocation); while the gateway
// allowlist lacks the entity the list stays empty and a save surfaces the
// gateway's refusal verbatim instead of pretending it worked.
export default function LocationsPanel({ locations = [], isAdmin = false, onChanged }) {
  const [taxGroups, setTaxGroups] = useState([]);
  const [editingId, setEditingId] = useState(""); // "" = closed, "new" = create, else row id
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    staffEntities.TaxGroup.list("group_name", 200)
      .then((rows) => { if (!cancelled) setTaxGroups(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setTaxGroups([]); });
    return () => { cancelled = true; };
  }, []);

  const startEdit = (row) => {
    setError("");
    setNotice("");
    if (!row) {
      setEditingId("new");
      setForm(EMPTY_FORM);
    } else {
      setEditingId(row.id);
      setForm({
        name: clean(row.name),
        code: clean(row.code),
        tax_group: clean(row.tax_group),
        address: clean(row.address),
        hours: clean(row.hours),
        active: row.active !== false,
      });
    }
  };

  const save = async () => {
    if (saving) return;
    if (!clean(form.name)) { setError("Location needs a name."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = {
        name: clean(form.name),
        code: clean(form.code).toUpperCase(),
        tax_group: clean(form.tax_group),
        address: clean(form.address),
        hours: clean(form.hours),
        active: form.active !== false,
      };
      if (editingId === "new") {
        await staffEntities.SalesLocation.create(data);
        setNotice(`Location "${data.name}" added.`);
      } else {
        await staffEntities.SalesLocation.update(editingId, data);
        setNotice(`Location "${data.name}" saved.`);
      }
      setEditingId("");
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "The location could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    if (!row?.id || busyId) return;
    setBusyId(row.id);
    setError("");
    setNotice("");
    try {
      await staffEntities.SalesLocation.update(row.id, { active: row.active === false });
      setNotice(`"${clean(row.name)}" ${row.active === false ? "reactivated" : "deactivated"}.`);
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "The location could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <details className="mb-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <MapPin className="h-4 w-4 text-violet-500" />
        Locations ({locations.length})
        <span className="text-xs font-normal text-slate-400">— registry for the New Reconciliation location select</span>
      </summary>
      <div className="border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800">
        {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {notice && <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}

        {locations.length === 0 ? (
          <EmptyState compact icon={MapPin} title="No locations registered yet." className="py-6" />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-1.5 pr-3">Name</th>
                <th className="py-1.5 pr-3">Code</th>
                <th className="py-1.5 pr-3">Tax group</th>
                <th className="py-1.5 pr-3">Address</th>
                <th className="py-1.5 pr-3">Hours</th>
                <th className="py-1.5 pr-3">Status</th>
                {isAdmin && <th className="py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 font-semibold text-slate-800 dark:text-slate-200">{clean(loc.name) || "—"}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{clean(loc.code) || "—"}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{clean(loc.tax_group) || "—"}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{clean(loc.address) || "—"}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{clean(loc.hours) || "—"}</td>
                  <td className="py-2 pr-3">
                    <StatusChip
                      tone={loc.active !== false ? "emerald" : "slate"}
                      label={loc.active !== false ? "Active" : "Inactive"}
                      size="sm"
                    />
                  </td>
                  {isAdmin && (
                    <td className="py-2 text-right">
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => startEdit(loc)} title="Edit location"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => toggleActive(loc)} disabled={busyId === loc.id}
                          title={loc.active === false ? "Reactivate" : "Deactivate"}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800">
                          {busyId === loc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : loc.active === false ? <Power className="h-4 w-4 text-emerald-500" /> : <PowerOff className="h-4 w-4" />}
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isAdmin && editingId === "" && (
          <button onClick={() => startEdit(null)}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <Plus className="h-4 w-4" />Add location
          </button>
        )}

        {isAdmin && editingId !== "" && (
          <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {editingId === "new" ? "New location" : "Edit location"}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className={labelCls}>Name *</label>
                <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Main" />
              </div>
              <div>
                <label className={labelCls}>Code</label>
                <input className={inputCls} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="MAIN" />
              </div>
              <div>
                <label className={labelCls}>Tax group</label>
                <select className={inputCls} value={form.tax_group} onChange={(e) => setForm((f) => ({ ...f, tax_group: e.target.value }))}>
                  <option value="">— none —</option>
                  {taxGroups.map((g) => (
                    <option key={g.id || g.group_name} value={clean(g.group_name)}>
                      {clean(g.group_name)}{Number.isFinite(Number(g.tax_percent)) ? ` (${g.tax_percent}%)` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input className={inputCls} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St" />
              </div>
              <div>
                <label className={labelCls}>Hours</label>
                <input className={inputCls} value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} placeholder="M-F 8-5" />
              </div>
              <div className="flex items-end">
                <label className="flex min-h-10 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                  Active — selectable on new batches
                </label>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setEditingId("")} className="min-h-9 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
              <button onClick={save} disabled={saving}
                className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId === "new" ? "Add location" : "Save location"}
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
