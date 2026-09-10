import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const DAY_LABELS = { monday:"Mon", tuesday:"Tue", wednesday:"Wed", thursday:"Thu", friday:"Fri", saturday:"Sat", sunday:"Sun" };

const cloneRecipients = (rows = [], allowDelay = true) => (rows || []).map(row => ({
  email: row?.email || "",
  ...(allowDelay ? { delay_minutes: Number(row?.delay_minutes || 0) } : {}),
}));

function makeDraft(settings) {
  return {
    company_name: settings?.company_name || "",
    work_order_creation_emails: cloneRecipients(settings?.work_order_creation_emails),
    work_order_completed_emails: cloneRecipients(settings?.work_order_completed_emails),
    low_stock_emails: cloneRecipients(settings?.low_stock_emails),
    request_emails: cloneRecipients(settings?.request_emails),
    parts_received_emails: cloneRecipients(settings?.parts_received_emails),
    report_emails: cloneRecipients(settings?.report_emails),
    item_order_reminder_emails: cloneRecipients(settings?.item_order_reminder_emails, false),
    open_work_order_reminder_emails: cloneRecipients(settings?.open_work_order_reminder_emails, false),
    item_order_reminder_days: [...(settings?.item_order_reminder_days || [])],
    open_work_order_reminder_days: [...(settings?.open_work_order_reminder_days || [])],
    email_subject_template: settings?.email_subject_template || "",
    email_body_template: settings?.email_body_template || "",
    email_completed_subject_template: settings?.email_completed_subject_template || "",
    email_completed_body_template: settings?.email_completed_body_template || "",
    item_order_reminder_subject_template: settings?.item_order_reminder_subject_template || "",
    item_order_reminder_body_template: settings?.item_order_reminder_body_template || "",
    open_work_order_reminder_subject_template: settings?.open_work_order_reminder_subject_template || "",
    open_work_order_reminder_body_template: settings?.open_work_order_reminder_body_template || "",
  };
}

export default function FleetSettingsEditor({ open, settings, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => makeDraft(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(makeDraft(settings));
      setError("");
    }
  }, [open, settings]);

  const recipientCount = useMemo(() => [
    "work_order_creation_emails","work_order_completed_emails","low_stock_emails","request_emails","parts_received_emails","report_emails","item_order_reminder_emails","open_work_order_reminder_emails",
  ].reduce((sum, key) => sum + (draft[key]?.filter(row => row.email?.trim()).length || 0), 0), [draft]);

  if (!open) return null;

  const update = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
  const toggleDay = (key, day) => update(key, draft[key].includes(day) ? draft[key].filter(d => d !== day) : [...draft[key], day]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await base44.functions.invoke("fleetSettingsAction", { action: "update", expected_updated_date: settings?.updated_date || "", settings: draft });
      if (data?.error) throw new Error(data.error);
      onSaved?.(data?.settings || null);
      onClose?.();
    } catch (e) {
      setError(e?.message || "Unable to save Fleet settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Edit Fleet notification settings">
      <div className="w-full max-w-6xl max-h-[94vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-4 sm:px-6 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Edit Fleet Notifications & Reminders</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Only Fleet communication settings are editable here. Cutover gates, source freeze, migration metadata, and estimator settings remain protected.</p>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"><X className="h-5 w-5"/></button>
        </div>

        <div className="max-h-[calc(94vh-140px)] overflow-y-auto px-4 py-5 sm:px-6 space-y-7">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

          <section className="space-y-3">
            <SectionTitle title="Company" note="Used in Fleet notification subjects/templates." />
            <Field label="Company name"><input value={draft.company_name} onChange={e=>update("company_name",e.target.value)} className={inputClass} /></Field>
          </section>

          <section className="space-y-4">
            <SectionTitle title="Operational notification recipients" note={`${recipientCount} configured recipient entries across Fleet notifications/reminders.`} />
            <div className="grid lg:grid-cols-2 gap-4">
              <RecipientList title="New work orders" rows={draft.work_order_creation_emails} onChange={rows=>update("work_order_creation_emails",rows)} allowDelay />
              <RecipientList title="Completed work orders" rows={draft.work_order_completed_emails} onChange={rows=>update("work_order_completed_emails",rows)} allowDelay />
              <RecipientList title="Low stock" rows={draft.low_stock_emails} onChange={rows=>update("low_stock_emails",rows)} allowDelay />
              <RecipientList title="New requests" rows={draft.request_emails} onChange={rows=>update("request_emails",rows)} allowDelay />
              <RecipientList title="Items received" rows={draft.parts_received_emails} onChange={rows=>update("parts_received_emails",rows)} allowDelay />
              <RecipientList title="Fleet feedback reports" rows={draft.report_emails} onChange={rows=>update("report_emails",rows)} allowDelay />
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle title="Scheduled reminder digests" note="The server runs reminder checks in America/New_York. Existing idempotency keys prevent duplicate recipient/day digests." />
            <div className="grid lg:grid-cols-2 gap-4">
              <ReminderBlock
                title="Items pending / on order"
                days={draft.item_order_reminder_days}
                onToggle={day=>toggleDay("item_order_reminder_days",day)}
                rows={draft.item_order_reminder_emails}
                onRows={rows=>update("item_order_reminder_emails",rows)}
              />
              <ReminderBlock
                title="Open work orders"
                days={draft.open_work_order_reminder_days}
                onToggle={day=>toggleDay("open_work_order_reminder_days",day)}
                rows={draft.open_work_order_reminder_emails}
                onRows={rows=>update("open_work_order_reminder_emails",rows)}
              />
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle title="Email templates" note="Supported placeholders are preserved as literal {placeholders}." />
            <TemplateEditor title="New work order" subject={draft.email_subject_template} body={draft.email_body_template} onSubject={v=>update("email_subject_template",v)} onBody={v=>update("email_body_template",v)} hint="{company_name} {work_order_number} {title} {equipment_name} {equipment_type} {priority} {description} {fleet_url}" />
            <TemplateEditor title="Completed work order" subject={draft.email_completed_subject_template} body={draft.email_completed_body_template} onSubject={v=>update("email_completed_subject_template",v)} onBody={v=>update("email_completed_body_template",v)} hint="{company_name} {work_order_number} {title} {equipment_name} {corrective_action} {fleet_url}" />
            <TemplateEditor title="Items reminder" subject={draft.item_order_reminder_subject_template} body={draft.item_order_reminder_body_template} onSubject={v=>update("item_order_reminder_subject_template",v)} onBody={v=>update("item_order_reminder_body_template",v)} hint="The body is used as the intro above the generated Fleet request table." />
            <TemplateEditor title="Open work orders reminder" subject={draft.open_work_order_reminder_subject_template} body={draft.open_work_order_reminder_body_template} onSubject={v=>update("open_work_order_reminder_subject_template",v)} onBody={v=>update("open_work_order_reminder_body_template",v)} hint="The body is used as the intro above the generated open-work-order table." />
          </section>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:px-6 dark:border-slate-800">
          <div className="text-xs text-gray-500 dark:text-slate-400">Changes apply to future Fleet notifications only; historical queued/sent messages are not rewritten.</div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}{saving?"Saving…":"Save Fleet settings"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-950";

function SectionTitle({ title, note }) { return <div><h3 className="font-semibold text-gray-900 dark:text-slate-100">{title}</h3>{note && <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{note}</p>}</div>; }
function Field({ label, children }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">{label}</span>{children}</label>; }

function RecipientList({ title, rows, onChange, allowDelay = false }) {
  const add = () => onChange([...(rows || []), { email:"", ...(allowDelay ? { delay_minutes:0 } : {}) }]);
  const patch = (index, key, value) => onChange(rows.map((row,i)=>i===index?{...row,[key]:value}:row));
  const remove = index => onChange(rows.filter((_,i)=>i!==index));
  return <div className="rounded-xl border border-gray-200 p-3 dark:border-slate-800"><div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{title}</div><button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Plus className="h-3.5 w-3.5"/>Add</button></div><div className="mt-2 space-y-2">{(rows||[]).map((row,index)=><div key={index} className={`grid ${allowDelay?"grid-cols-[1fr_88px_34px]":"grid-cols-[1fr_34px]"} gap-2`}><input type="email" value={row.email||""} onChange={e=>patch(index,"email",e.target.value)} placeholder="email@example.com" className={inputClass}/>{allowDelay&&<input type="number" min="0" max="1440" value={row.delay_minutes??0} onChange={e=>patch(index,"delay_minutes",e.target.value)} title="Delay minutes" className={inputClass}/>}<button type="button" onClick={()=>remove(index)} className="rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-red-950/20"><Trash2 className="mx-auto h-4 w-4"/></button></div>)}{!(rows||[]).length&&<div className="py-2 text-xs text-gray-400">No recipients configured.</div>}{allowDelay&&<div className="text-[11px] text-gray-400">Second field is delay in minutes (0–1440).</div>}</div></div>;
}

function ReminderBlock({ title, days, onToggle, rows, onRows }) {
  return <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-800"><div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{title}</div><div className="mt-3 flex flex-wrap gap-1.5">{DAYS.map(day=><button key={day} type="button" onClick={()=>onToggle(day)} className={`rounded-md border px-2 py-1 text-xs font-medium ${days.includes(day)?"border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300":"border-gray-200 text-gray-500 dark:border-slate-700 dark:text-slate-400"}`}>{DAY_LABELS[day]}</button>)}</div><div className="mt-3"><RecipientList title="Recipients" rows={rows} onChange={onRows}/></div></div>;
}

function TemplateEditor({ title, subject, body, onSubject, onBody, hint }) {
  return <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-800"><div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{title}</div><div className="mt-3 grid gap-3"><Field label="Subject"><input value={subject} onChange={e=>onSubject(e.target.value)} className={inputClass}/></Field><Field label="Body"><textarea value={body} onChange={e=>onBody(e.target.value)} rows={5} className={`${inputClass} resize-y`}/></Field>{hint&&<div className="text-[11px] text-gray-400 break-words">{hint}</div>}</div></div>;
}
