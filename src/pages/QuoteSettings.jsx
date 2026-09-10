import { useEffect, useRef, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { DEFAULT_QUOTE_SETTINGS, loadQuoteDefaults, quoteDefaultsForm, quoteDefaultsPayload } from "@/components/estimator/quoteDefaults";
import { expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { createQuoteDefaultsSingletonWithRecovery } from "@/components/estimator/quoteDefaultsPersistence";

const DISPLAY_OPTIONS = [
  ["hide_section_prices", "Bundle Product pricing"],
  ["show_company_block", "Show company block"],
  ["show_logo", "Show logo"],
  ["show_contact_block", "Show customer contact"],
  ["show_estimate_number", "Show estimate number"],
  ["show_po_number", "Show PO number"],
  ["show_site_address", "Show site address"],
  ["show_dates", "Show quote date"],
  ["show_category_column", "Show Product category"],
  ["show_section_descriptions", "Show Product descriptions"],
  ["show_quantity_column", "Show quantity"],
  ["show_scope_lists", "Show inclusions / exclusions"],
  ["show_subtotal_line", "Show subtotal"],
  ["show_discount_line", "Show discount"],
  ["show_fees_line", "Show fees"],
  ["show_tax_line", "Show tax"],
  ["show_deposit_lines", "Show deposit / balance"],
  ["show_notes_on_quote", "Show estimate-level notes"],
  ["show_terms_block", "Show terms & conditions"],
  ["show_warranty_block", "Show warranty"],
  ["show_lead_time_block", "Show lead time"],
  ["show_signature_block", "Show signature block"],
  ["show_validity_footer", "Show validity footer"],
  ["round_prices_to_dollar", "Round displayed prices"],
];

export default function QuoteSettings() {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(DEFAULT_QUOTE_SETTINGS);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([loadQuoteDefaults(), base44.auth.me().catch(() => null)])
      .then(([defaults, user]) => {
        if (!active) return;
        setRecord(defaults);
        setForm(quoteDefaultsForm(defaults));
        setMe(user);
      })
      .catch((err) => active && setError(err?.message || "Quote Defaults could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const canEdit = me?.role === "admin";
  const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));

  const save = async () => {
    if (!canEdit || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const current = await loadQuoteDefaults();
      if (record?.id && current?.id === record.id && record.updated_date && current.updated_date && record.updated_date !== current.updated_date) {
        throw new Error("Quote Defaults changed in another session. Reload this page before saving so newer settings are not overwritten.");
      }
      if (!record?.id && current?.id) {
        throw new Error("Quote Defaults were created in another session. Reload this page before saving.");
      }

      const payload = { config_name: "default", ...quoteDefaultsPayload(form) };
      let saved;
      let createStatus = "";
      if (record?.id) {
        saved = await replaceEntityFieldsIfUnchanged({
          entity: base44.entities.QuoteDefaults,
          id: record.id,
          expectedUpdatedAt: current?.updated_date || record.updated_date || "",
          expectedFields: expectedEntityFields(current || record, payload),
          nextFields: payload,
          guardFields: { config_name: "default" },
          label: "Quote Defaults",
        });
      } else {
        const createResult = await createQuoteDefaultsSingletonWithRecovery({
          entity: base44.entities.QuoteDefaults,
          data: payload,
          label: "Quote Defaults",
        });
        saved = createResult.record;
        createStatus = createResult.status;
      }

      const refreshed = saved?.updated_date ? saved : await loadQuoteDefaults();
      setRecord(refreshed || saved || null);
      setForm(quoteDefaultsForm(refreshed || saved || payload));
      if (createStatus === "existing" || createStatus === "concurrent_existing_won") {
        setMessage("Quote Defaults were created in another session while this page was open. The existing company defaults were loaded instead of overwriting them; review the values before saving again.");
      } else if (createStatus === "recovered") {
        setMessage("Quote Defaults saved and recovered after the create response was unavailable. New estimates will copy these settings; existing estimates are unchanged.");
      } else {
        setMessage("Quote Defaults saved. New estimates will copy these settings; existing estimates are unchanged.");
      }
    } catch (err) {
      setError(err?.message || "Quote Defaults could not be saved.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading Quote Defaults…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 space-y-3">
        <div className="bg-white border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-[13px] font-bold text-gray-900">QUOTE DEFAULTS</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Company-wide starting values copied onto newly created estimates. Existing estimate quote settings remain frozen to that estimate.</div>
          </div>
          <button type="button" onClick={save} disabled={!canEdit || saving} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40 inline-flex items-center gap-1.5">
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Defaults"}
          </button>
        </div>

        {!canEdit && <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800 flex items-start gap-2"><ShieldCheck className="w-4 h-4 mt-0.5" /><span>Quote Defaults are read-only for your account. An administrator can change company-wide defaults.</span></div>}
        {message && <div className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-800">{message}</div>}
        {error && <div className="border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}

        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${!canEdit ? "pointer-events-none opacity-70" : ""}`}>
          <SettingsSection title="Company Block">
            <TextField label="Company name" value={form.company_name} onChange={(value) => patch({ company_name: value })} wide />
            <TextField label="Phone" value={form.company_phone} onChange={(value) => patch({ company_phone: value })} />
            <TextField label="Email" value={form.company_email} onChange={(value) => patch({ company_email: value })} />
            <TextField label="Website" value={form.company_website} onChange={(value) => patch({ company_website: value })} />
            <TextField label="License / registration" value={form.company_license} onChange={(value) => patch({ company_license: value })} />
            <TextField label="Address" value={form.company_address} onChange={(value) => patch({ company_address: value })} textarea wide />
            <TextField label="Logo URL" value={form.company_logo_url} onChange={(value) => patch({ company_logo_url: value })} wide />
          </SettingsSection>

          <SettingsSection title="Quote Content">
            <TextField label="Quote title" value={form.quote_title} onChange={(value) => patch({ quote_title: value })} />
            <label className="text-[10px] font-bold tracking-wide text-gray-500">VALID DAYS<input type="number" min="0" value={form.quote_valid_days} onChange={(event) => patch({ quote_valid_days: Math.max(0, Number(event.target.value || 0)) })} className="mt-1 h-[32px] w-full rounded border border-gray-300 px-2 text-[11px] font-normal text-gray-800" /></label>
            <TextField label="Intro text" value={form.quote_intro_text} onChange={(value) => patch({ quote_intro_text: value })} textarea wide />
            <TextField label="Payment terms" value={form.payment_terms} onChange={(value) => patch({ payment_terms: value })} textarea wide />
            <TextField label="Terms & conditions" value={form.quote_terms_conditions} onChange={(value) => patch({ quote_terms_conditions: value })} textarea wide />
            <TextField label="Warranty" value={form.warranty_text} onChange={(value) => patch({ warranty_text: value })} textarea wide />
            <TextField label="Lead time" value={form.lead_time_text} onChange={(value) => patch({ lead_time_text: value })} wide />
            <TextField label="Footer text" value={form.quote_footer_text} onChange={(value) => patch({ quote_footer_text: value })} textarea wide />
          </SettingsSection>
        </div>

        <div className={`bg-white border border-gray-200 p-4 ${!canEdit ? "pointer-events-none opacity-70" : ""}`}>
          <div className="text-[10px] font-bold tracking-widest text-gray-500 mb-3">DEFAULT CUSTOMER QUOTE DISPLAY</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {DISPLAY_OPTIONS.map(([key, label]) => (
              <label key={key} className="h-[34px] px-2.5 border border-gray-200 bg-gray-50 flex items-center justify-between gap-3 text-[10px] text-gray-700">
                <span>{label}</span>
                <input type="checkbox" checked={form[key] === true} onChange={(event) => patch({ [key]: event.target.checked })} className="w-3.5 h-3.5 accent-red-600" />
              </label>
            ))}
          </div>
          {form.show_notes_on_quote && <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] text-amber-800"><strong>Estimate-level notes will be customer-visible by default.</strong> Keep this off unless your shop intentionally uses the estimate notes field for customer-facing copy.</div>}
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return <section className="bg-white border border-gray-200 p-4"><div className="text-[10px] font-bold tracking-widest text-gray-500 mb-3">{title.toUpperCase()}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{children}</div></section>;
}

function TextField({ label, value, onChange, textarea = false, wide = false }) {
  const className = `${wide ? "sm:col-span-2 " : ""}text-[10px] font-bold tracking-wide text-gray-500`;
  return <label className={className}>{label.toUpperCase()}{textarea ? <textarea value={value || ""} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-[11px] font-normal text-gray-800 resize-y" /> : <input value={value || ""} onChange={(event) => onChange(event.target.value)} className="mt-1 h-[32px] w-full rounded border border-gray-300 px-2 text-[11px] font-normal text-gray-800" />}</label>;
}
