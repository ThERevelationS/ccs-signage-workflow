import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalSettings } from "@/api/gatedEntities";
import { renderTemplate } from "@/components/comms/emailTemplates";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_MAP,
  effectiveNotificationTemplates,
  saveNotificationTemplates,
} from "@/components/comms/notificationTemplates";
import { SAMPLE_NOTIFY_CONTEXT } from "@/components/comms/notifyModel";

// Settings UI for the customer notification templates — one card per
// notification kind with the status-gate description, merge-field chips that
// insert {{field}} at the cursor, a live preview rendered against a sample
// context, reset-to-default per card, and a single save-all button that
// persists only the deltas from the defaults through the same
// saveGlobalSettingValueIfUnchanged path the follow-up rules panel uses.
//
// Props mirror RulesPanel: the page owns the GlobalSettings query and passes
// `record` (the loaded row — required for the concurrency-safe save) and
// `templates` (the normalized saved override map).

const clean = (v) => String(v ?? "").trim();
// Stable identity for the "no saved overrides" case — a fresh {} each render
// would refire the reseed effect and clobber in-progress edits.
const EMPTY_OVERRIDES = {};

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const chipCls =
  "rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50";

// Only fields that differ from the defaults persist — a card reset to its
// default is therefore identical to never having been customized.
const toOverrides = (form) => {
  const out = {};
  for (const kind of NOTIFICATION_KINDS) {
    const o = {};
    const subject = clean(form[kind.key]?.subject);
    const body = clean(form[kind.key]?.body);
    if (subject && subject !== kind.defaultSubject) o.subject = subject;
    if (body && body !== kind.defaultBody) o.body = body;
    if (Object.keys(o).length) out[kind.key] = o;
  }
  return out;
};

function KindCard({ kind, value, onChange }) {
  // Chips insert into whichever field was focused last (subject or body) at
  // its cursor position; onMouseDown+preventDefault keeps focus on the field
  // so the insertion point is still live at click time. Default: body end.
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const lastFocus = useRef("body");
  const [preview, setPreview] = useState(false);

  const entry = NOTIFICATION_KIND_MAP[kind.key];
  const overridden =
    clean(value.subject) !== kind.defaultSubject || clean(value.body) !== kind.defaultBody;

  const insertField = (field) => {
    const token = `{{${field}}}`;
    const target = lastFocus.current === "subject" ? "subject" : "body";
    const el = target === "subject" ? subjectRef.current : bodyRef.current;
    const current = target === "subject" ? value.subject : value.body;
    const start = el && document.activeElement === el ? el.selectionStart ?? current.length : current.length;
    const end = el && document.activeElement === el ? el.selectionEnd ?? start : start;
    const next = current.slice(0, start) + token + current.slice(end);
    onChange({ [target]: next });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      try { el.setSelectionRange(pos, pos); } catch { /* type=email etc. */ }
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.label}</h4>
            {overridden && (
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                customized
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">{entry.statusGate?.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            disabled={!overridden}
            onClick={() => onChange({ subject: kind.defaultSubject, body: kind.defaultBody })}
          >
            Reset to default
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? "Hide preview" : "Preview"}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Merge fields</span>
        {entry.mergeFields.map((field) => (
          <button
            key={field}
            type="button"
            className={chipCls}
            title={`Insert {{${field}}}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertField(field)}
          >
            {field}
          </button>
        ))}
      </div>

      <div className="mt-2 grid gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Subject</span>
          <input
            ref={subjectRef}
            className={inputCls}
            value={value.subject}
            onFocus={() => { lastFocus.current = "subject"; }}
            onChange={(e) => onChange({ subject: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Body</span>
          <textarea
            ref={bodyRef}
            className={`${inputCls} min-h-[110px] font-normal leading-relaxed`}
            value={value.body}
            onFocus={() => { lastFocus.current = "body"; }}
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </label>
      </div>

      {preview && (
        <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-2.5 dark:border-slate-600 dark:bg-slate-800/40">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Preview — sample data
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
            {renderTemplate(value.subject, SAMPLE_NOTIFY_CONTEXT) || "(empty subject)"}
          </div>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-slate-700 dark:text-slate-200">
            {renderTemplate(value.body, SAMPLE_NOTIFY_CONTEXT) || "(empty body)"}
          </pre>
        </div>
      )}
    </section>
  );
}

export default function NotificationTemplateEditor({ record, templates = EMPTY_OVERRIDES, onSaved }) {
  const [form, setForm] = useState(() => effectiveNotificationTemplates(templates));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Reseed once the saved record arrives or changes elsewhere.
  useEffect(() => {
    setForm(effectiveNotificationTemplates(templates));
  }, [templates]);

  const editKind = (kind, patch) =>
    setForm((f) => ({ ...f, [kind]: { ...f[kind], ...patch } }));

  const nextOverrides = useMemo(() => toOverrides(form), [form]);
  const dirty = JSON.stringify(nextOverrides) !== JSON.stringify(templates || {});
  const customized = NOTIFICATION_KINDS.filter((k) => nextOverrides[k.key]).length;

  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await saveNotificationTemplates({
        entity: GlobalSettings,
        loadedRecord: record || null,
        nextTemplates: nextOverrides,
      });
      onSaved?.();
      setMessage("Notification templates saved.");
    } catch (e) {
      setError(e?.message || "Notification templates could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">
        Notification templates
        <span className="ml-2 text-xs font-normal text-slate-500">
          {customized ? `${customized} of ${NOTIFICATION_KINDS.length} customized` : "all defaults"} ·
          estimate ready, proof ready, order built, completed, payment due, monthly statement
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        {NOTIFICATION_KINDS.map((kind) => (
          <KindCard
            key={kind.key}
            kind={kind}
            value={form[kind.key] || { subject: kind.defaultSubject, body: kind.defaultBody }}
            onChange={(patch) => editKind(kind.key, patch)}
          />
        ))}

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            disabled={saving || !dirty}
            onClick={save}
          >
            {saving ? "Saving…" : "Save templates"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
            disabled={saving || !dirty}
            onClick={() => setForm(effectiveNotificationTemplates(templates))}
          >
            Discard changes
          </button>
          {message && <span className="text-xs text-emerald-600">{message}</span>}
          {error && <span className="text-xs text-rose-700">{error}</span>}
        </div>
      </div>
    </details>
  );
}
