import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X, Upload, ImagePlus, Trash2 } from "lucide-react";

const EMPTY = {
  name: "",
  type: "truck",
  make: "",
  model: "",
  year: "",
  serial_number: "",
  vin: "",
  engine_details: "",
  status: "operational",
  location: "",
  purchase_date: "",
  mileage_hours: "",
  last_service_date: "",
  next_service_due: "",
  notes: "",
  photo_url: "",
  tracking_applicable: true,
};

export default function FleetEquipmentDialog({ open, equipment, onClose, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(false);
  onCloseRef.current = onClose;
  busyRef.current = saving || uploadingPhoto;

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const handleKey = event => {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          onCloseRef.current?.();
        }
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
        .filter(element => element.getClientRects().length > 0);
      if (!controls.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
      if (!dialogRef.current.contains(active) || active === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setForm(equipment ? {
      ...EMPTY,
      ...equipment,
      year: equipment.year ?? "",
      mileage_hours: equipment.mileage_hours ?? "",
      tracking_applicable: equipment.bouncie_link_status !== "not_applicable",
    } : EMPTY);
    setPendingPhoto(null);
    setUploadingPhoto(false);
    setPhotoError("");
  }, [open, equipment]);

  if (!open) return null;
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    setPhotoError("");
    let photoUrl = form.photo_url || "";
    if (pendingPhoto) {
      setUploadingPhoto(true);
      try {
        const uploaded = await base44.integrations.Core.UploadFile({ file: pendingPhoto });
        if (!uploaded?.file_url) throw new Error("Equipment photo upload failed.");
        photoUrl = uploaded.file_url;
      } catch (error) {
        setPhotoError(error?.message || "Equipment photo upload failed.");
        setUploadingPhoto(false);
        return;
      }
      setUploadingPhoto(false);
    }
    onSave({
      equipment: {
        name: form.name.trim(),
        type: form.type,
        make: form.make.trim(),
        model: form.model.trim(),
        year: form.year === "" ? undefined : Number(form.year),
        serial_number: form.serial_number.trim(),
        vin: form.vin.trim(),
        engine_details: form.engine_details.trim(),
        status: form.status,
        location: form.location.trim(),
        purchase_date: form.purchase_date || undefined,
        mileage_hours: form.mileage_hours === "" ? undefined : Number(form.mileage_hours),
        last_service_date: form.last_service_date || undefined,
        next_service_due: form.next_service_due || undefined,
        photo_url: photoUrl,
        notes: form.notes.trim(),
      },
      tracking_applicable: !!form.tracking_applicable,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3 sm:p-4" onMouseDown={e => e.target === e.currentTarget && !saving && !uploadingPhoto && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fleet-equipment-dialog-title" aria-describedby="fleet-equipment-dialog-description" tabIndex={-1} className="fleet-equipment-dialog w-full max-w-3xl max-h-[94dvh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="min-w-0"><h2 id="fleet-equipment-dialog-title" className="text-lg font-bold text-gray-900 dark:text-slate-100">{equipment ? "Edit Fleet Equipment" : "New Fleet Equipment"}</h2><p id="fleet-equipment-dialog-description" className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">Maintenance identity only. Bouncie is read-only and linked by exact VIN/IMEI evidence.</p></div>
          <button type="button" ref={closeRef} type="button" onClick={onClose} disabled={saving || uploadingPhoto} aria-label="Close Fleet equipment dialog" className="min-h-11 min-w-11 shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><X className="w-5 h-5 mx-auto" /></button>
        </div>
        <form onSubmit={submit} className="p-4 sm:p-5 space-y-5">
          {photoError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 px-3 py-2 text-sm">{photoError}</div>}
          <div role="status" aria-live="polite" className="sr-only">{uploadingPhoto ? "Uploading equipment photo." : saving ? "Saving equipment." : ""}</div>
          <section className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40"><div className="font-medium text-gray-900 dark:text-slate-100 inline-flex items-center gap-2"><ImagePlus className="w-4 h-4 text-indigo-500"/>Equipment Photo</div><label className="min-h-11 px-3 cursor-pointer inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-500"><Upload className="w-4 h-4"/>{form.photo_url || pendingPhoto ? "Replace" : "Add photo"}<input aria-label="Choose equipment photo" type="file" accept="image/*" className="sr-only" onChange={e=>{const file=e.target.files?.[0]||null;setPendingPhoto(file);e.target.value="";}}/></label></div>
            <div className="p-4"><div className="flex flex-col sm:flex-row sm:items-center gap-3">{form.photo_url ? <img src={form.photo_url} alt={form.name || "Equipment"} className="w-24 h-24 sm:w-20 sm:h-20 rounded-lg object-cover bg-gray-100 dark:bg-slate-800"/> : <div className="w-24 h-24 sm:w-20 sm:h-20 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center"><ImagePlus className="w-7 h-7 text-gray-300"/></div>}<div className="flex-1 min-w-0">{pendingPhoto ? <div role="status" aria-live="polite" className="text-sm text-indigo-700 dark:text-indigo-300 break-all">Selected: {pendingPhoto.name}</div> : <div className="text-xs text-gray-400">{form.photo_url ? "Current Fleet equipment photo." : "No equipment photo."}</div>}{(form.photo_url || pendingPhoto) && <button type="button" onClick={()=>{set("photo_url","");setPendingPhoto(null);}} className="mt-2 min-h-11 px-2 inline-flex items-center gap-1 text-xs font-medium text-red-600"><Trash2 className="w-3.5 h-3.5"/>Remove photo</button>}</div></div>
            <div className="text-xs text-gray-400 mt-2">A selected photo uploads only when you save the equipment record.</div></div>
          </section>

          <FormSection title="Asset identity" description="Core Fleet identity and status. VIN/serial values remain part of the existing equipment record.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name *"><input required value={form.name} onChange={e => set("name", e.target.value)} className="field" /></Field>
              <Field label="Type"><select value={form.type} onChange={e => set("type", e.target.value)} className="field"><option value="car">Car</option><option value="truck">Truck</option><option value="boom_lift">Boom lift</option><option value="forklift">Forklift</option><option value="generator">Generator</option><option value="excavator">Excavator</option><option value="bulldozer">Bulldozer</option><option value="crane">Crane</option><option value="compressor">Compressor</option><option value="other">Other</option></select></Field>
              <Field label="Make"><input value={form.make} onChange={e => set("make", e.target.value)} className="field" /></Field>
              <Field label="Model"><input value={form.model} onChange={e => set("model", e.target.value)} className="field" /></Field>
              <Field label="Year"><input type="number" min="1900" max="2200" value={form.year} onChange={e => set("year", e.target.value)} className="field" /></Field>
              <Field label="Status"><select value={form.status} onChange={e => set("status", e.target.value)} className="field"><option value="operational">Operational</option><option value="maintenance">Maintenance</option><option value="down">Down</option><option value="retired">Retired</option></select></Field>
              <Field label="VIN"><input value={form.vin || ""} onChange={e => set("vin", e.target.value.toUpperCase())} className="field uppercase" placeholder="17-character VIN when applicable" /></Field>
              <Field label="Serial number"><input value={form.serial_number || ""} onChange={e => set("serial_number", e.target.value)} className="field" /></Field>
            </div>
          </FormSection>

          <FormSection title="Use & service" description="Operating location, meter reading, and Fleet service dates.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Location"><input value={form.location} onChange={e => set("location", e.target.value)} className="field" /></Field>
              <Field label="Mileage / hours"><input type="number" min="0" step="0.1" value={form.mileage_hours} onChange={e => set("mileage_hours", e.target.value)} className="field" /></Field>
              <Field label="Purchase date"><input type="date" value={form.purchase_date || ""} onChange={e => set("purchase_date", e.target.value)} className="field" /></Field>
              <Field label="Last service"><input type="date" value={form.last_service_date || ""} onChange={e => set("last_service_date", e.target.value)} className="field" /></Field>
              <Field label="Next service due"><input type="date" value={form.next_service_due || ""} onChange={e => set("next_service_due", e.target.value)} className="field" /></Field>
              <Field label="Engine details"><input value={form.engine_details} onChange={e => set("engine_details", e.target.value)} className="field" /></Field>
            </div>
          </FormSection>

          <label className="min-h-11 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <input type="checkbox" checked={!!form.tracking_applicable} onChange={e => set("tracking_applicable", e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span><span className="block font-medium text-gray-900 dark:text-slate-100">Bouncie tracking applicable</span><span className="block text-xs leading-relaxed text-gray-500 dark:text-slate-400 mt-1">When enabled, CCS checks existing Bouncie live state for an exact VIN. Zero matches stays unlinked; conflicting IMEIs becomes ambiguous. CCS never creates or edits Bouncie vehicles.</span></span>
          </label>

          <FormSection title="Notes" description="Keep equipment-specific context with the Fleet asset record."><Field label="Equipment notes"><textarea rows={4} value={form.notes} onChange={e => set("notes", e.target.value)} className="field resize-y" /></Field></FormSection>
          <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-gray-200 bg-white/95 px-4 sm:px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 flex flex-col-reverse sm:flex-row sm:justify-end gap-2"><button type="button" onClick={onClose} disabled={saving || uploadingPhoto} className="min-h-11 w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 disabled:opacity-50">Cancel</button><button type="submit" disabled={saving || uploadingPhoto} className="min-h-11 w-full sm:w-auto px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50">{(saving || uploadingPhoto) && <Loader2 className="w-4 h-4 animate-spin" />}{uploadingPhoto ? "Uploading Photo…" : equipment ? "Save Equipment" : "Create Equipment"}</button></div>
        </form>
      </div>
      <style>{`.field{width:100%;min-height:44px;border:1px solid rgb(209 213 219);border-radius:.5rem;padding:.5rem .65rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}.fleet-equipment-dialog .field:focus-visible,.fleet-equipment-dialog button:focus-visible,.fleet-equipment-dialog input[type="checkbox"]:focus-visible{outline:2px solid rgb(79 70 229);outline-offset:2px}`}</style>
    </div>
  );
}

function FormSection({ title, description, children }) { return <section className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden"><div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40"><h3 className="font-semibold text-gray-900 dark:text-slate-100">{title}</h3>{description && <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">{description}</p>}</div><div className="p-4">{children}</div></section>; }
function Field({ label, children }) { return <label className="block text-sm"><span className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>; }
