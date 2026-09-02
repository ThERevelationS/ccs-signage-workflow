import { Printer, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCustomerQuoteRows } from "./customerQuote";

const fmt = (value, round = false) => {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: round ? 0 : 2,
    maximumFractionDigits: round ? 0 : 2,
  });
};

const lines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const TOGGLES = [
  ["hide_section_prices", "Bundle Product pricing", false],
  ["show_company_block", "Show company block", true],
  ["show_logo", "Show logo", false],
  ["show_contact_block", "Show customer contact", true],
  ["show_estimate_number", "Show estimate number", true],
  ["show_po_number", "Show PO number", true],
  ["show_site_address", "Show site address", true],
  ["show_dates", "Show quote date", true],
  ["show_category_column", "Show category", true],
  ["show_section_descriptions", "Show Product descriptions", true],
  ["show_quantity_column", "Show quantity", false],
  ["show_scope_lists", "Show inclusions / exclusions", true],
  ["show_subtotal_line", "Show subtotal", true],
  ["show_discount_line", "Show discount", true],
  ["show_fees_line", "Show fees", true],
  ["show_tax_line", "Show tax", true],
  ["show_deposit_lines", "Show deposit / balance", true],
  ["show_notes_on_quote", "Show estimate notes", true],
  ["show_terms_block", "Show terms & conditions", true],
  ["show_warranty_block", "Show warranty", true],
  ["show_lead_time_block", "Show lead time", true],
  ["show_signature_block", "Show signature block", true],
  ["show_validity_footer", "Show validity footer", true],
  ["round_prices_to_dollar", "Round displayed prices", false],
];

const defaultBool = (estimate, key, fallback = true) => estimate[key] === undefined || estimate[key] === null ? fallback : estimate[key] !== false;

export default function CustomerQuotePanel({ estimate, pricing, onChange, readOnly = false }) {
  const round = estimate.round_prices_to_dollar === true;
  const quoteRows = buildCustomerQuoteRows(estimate, pricing);

  const printQuote = () => {
    window.print();
  };

  const set = (key, value) => onChange?.({ [key]: value });

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="no-print px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 bg-gray-50">
        <div>
          <div className="text-[13px] font-bold text-gray-900 flex items-center gap-2"><Settings2 className="w-4 h-4 text-red-600" /> Customer Quote</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Live preview uses the same frozen Product pricing waterfall as the estimate. Quote settings are stored on this estimate.</div>
        </div>
        <Button type="button" variant="outline" onClick={printQuote} className="h-[31px] text-[11px]"><Printer className="w-3.5 h-3.5 mr-1.5" /> Print Quote</Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[390px_minmax(0,1fr)]">
        <div className={`no-print border-r border-gray-200 p-4 space-y-4 bg-white ${readOnly ? "pointer-events-none opacity-60" : ""}`}>
          <div>
            <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">QUOTE CONTENT</div>
            <div className="space-y-2">
              <Field label="Quote title" value={estimate.quote_title ?? "Project Estimate"} onChange={(value) => set("quote_title", value)} />
              <Field label="Intro text" value={estimate.quote_intro_text || ""} onChange={(value) => set("quote_intro_text", value)} textarea />
              <Field label="Scope inclusions — one per line" value={estimate.scope_inclusions || ""} onChange={(value) => set("scope_inclusions", value)} textarea />
              <Field label="Scope exclusions — one per line" value={estimate.scope_exclusions || ""} onChange={(value) => set("scope_exclusions", value)} textarea />
              <Field label="Lead time" value={estimate.lead_time_text || ""} onChange={(value) => set("lead_time_text", value)} />
              <Field label="Warranty" value={estimate.warranty_text || ""} onChange={(value) => set("warranty_text", value)} textarea />
              <Field label="Payment terms" value={estimate.payment_terms || estimate.terms || ""} onChange={(value) => set("payment_terms", value)} textarea />
              <Field label="Terms & conditions" value={estimate.quote_terms_conditions || ""} onChange={(value) => set("quote_terms_conditions", value)} textarea />
              <Field label="Footer text" value={estimate.quote_footer_text || ""} onChange={(value) => set("quote_footer_text", value)} textarea />
              <label className="text-[10px] font-bold tracking-wide text-gray-500 block">QUOTE VALID DAYS<input type="number" min="0" value={estimate.quote_valid_days ?? 30} onChange={(event) => set("quote_valid_days", Math.max(0, Number(event.target.value || 0)))} className="mt-1 w-full h-[32px] px-2 border border-gray-300 rounded text-[11px]" /></label>
            </div>
          </div>

          <div>
            <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">COMPANY BLOCK</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Company" value={estimate.company_name || ""} onChange={(value) => set("company_name", value)} className="col-span-2" />
              <Field label="Logo URL" value={estimate.company_logo_url || ""} onChange={(value) => set("company_logo_url", value)} className="col-span-2" />
              <Field label="Phone" value={estimate.company_phone || ""} onChange={(value) => set("company_phone", value)} />
              <Field label="Email" value={estimate.company_email || ""} onChange={(value) => set("company_email", value)} />
              <Field label="Website" value={estimate.company_website || ""} onChange={(value) => set("company_website", value)} className="col-span-2" />
              <Field label="Address" value={estimate.company_address || ""} onChange={(value) => set("company_address", value)} textarea className="col-span-2" />
              <Field label="License / registration" value={estimate.company_license || ""} onChange={(value) => set("company_license", value)} className="col-span-2" />
            </div>
          </div>

          <div>
            <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">DISPLAY</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1.5">
              {TOGGLES.map(([key, label, fallback]) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-[10px] text-gray-700 cursor-pointer">
                  <span>{label}</span>
                  <input type="checkbox" checked={defaultBool(estimate, key, fallback)} onChange={(event) => set(key, event.target.checked)} className="w-3.5 h-3.5 accent-red-600" />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gray-100 p-4 sm:p-6 overflow-auto">
          <article id="customer-quote-print" className="customer-quote-print mx-auto bg-white border border-gray-200 shadow-sm max-w-[850px] min-h-[1000px] px-8 sm:px-12 py-9 text-gray-900">
            <header className="border-b-2 border-gray-900 pb-5 flex justify-between gap-6">
              <div className="min-w-0">
                {defaultBool(estimate, "show_company_block") && (
                  <>
                    {defaultBool(estimate, "show_logo", false) && estimate.company_logo_url && <img src={estimate.company_logo_url} alt="Company logo" className="max-h-12 max-w-[190px] object-contain object-left mb-2" />}
                    <div className="text-[21px] font-extrabold tracking-tight">{estimate.company_name || "Company Name"}</div>
                    {estimate.company_address && <div className="mt-1 text-[10px] whitespace-pre-line text-gray-600">{estimate.company_address}</div>}
                    <div className="mt-1 text-[10px] text-gray-600">{[estimate.company_phone, estimate.company_email, estimate.company_website].filter(Boolean).join(" · ")}</div>
                    {estimate.company_license && <div className="mt-1 text-[9px] text-gray-500">{estimate.company_license}</div>}
                  </>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[22px] font-bold">{estimate.quote_title || "Project Estimate"}</div>
                {defaultBool(estimate, "show_estimate_number") && estimate.estimate_number && <div className="mt-1 text-[10px] text-gray-600">Estimate #{estimate.estimate_number}</div>}
                {defaultBool(estimate, "show_po_number") && estimate.po_number && <div className="text-[10px] text-gray-600">PO #{estimate.po_number}</div>}
                {defaultBool(estimate, "show_dates") && <div className="text-[10px] text-gray-600">{new Date().toLocaleDateString()}</div>}
              </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 py-5 border-b border-gray-200">
              <div>
                <div className="text-[8px] font-bold tracking-widest text-gray-400">PREPARED FOR</div>
                <div className="mt-1 text-[13px] font-bold">{estimate.client_name || "Customer"}</div>
                {defaultBool(estimate, "show_contact_block") && <div className="mt-1 text-[10px] text-gray-600">{[estimate.order_contact || estimate.contact_name, estimate.contact_email, estimate.office_phone || estimate.contact_phone].filter(Boolean).join(" · ")}</div>}
              </div>
              <div>
                <div className="text-[8px] font-bold tracking-widest text-gray-400">PROJECT</div>
                <div className="mt-1 text-[13px] font-bold">{estimate.project_name || "Project"}</div>
                {defaultBool(estimate, "show_site_address") && estimate.site_address && <div className="mt-1 text-[10px] text-gray-600">{estimate.site_address}</div>}
              </div>
            </div>

            {estimate.quote_intro_text && <p className="py-4 text-[11px] leading-relaxed text-gray-700 whitespace-pre-line">{estimate.quote_intro_text}</p>}

            <div className="mt-4 border border-gray-300 rounded overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 border-b border-gray-300">
                  <tr className="text-[9px] text-gray-500 tracking-wide">
                    <th className="px-3 py-2 font-bold">PRODUCT / SCOPE</th>
                    {defaultBool(estimate, "show_category_column") && <th className="px-3 py-2 font-bold">CATEGORY</th>}
                    {defaultBool(estimate, "show_quantity_column", false) && <th className="px-3 py-2 font-bold text-right">QTY</th>}
                    <th className="px-3 py-2 font-bold text-right">PRICE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {quoteRows.map((row) => <QuoteRow key={row.key} estimate={estimate} name={row.name} category={row.category} quantity={row.quantity} description={row.description} amount={row.amount} round={round} />)}
                </tbody>
              </table>
            </div>

            <div className="ml-auto mt-4 w-full sm:w-[330px] text-[10px] space-y-1.5">
              {defaultBool(estimate, "show_subtotal_line") && <TotalRow label="Subtotal" value={pricing.subtotal} round={round} />}
              {defaultBool(estimate, "show_discount_line") && Math.abs(pricing.discount) > 0.005 && <TotalRow label={`Discount (${Number(estimate.discount_percent || 0)}%)`} value={-pricing.discount} round={round} />}
              {Math.abs(pricing.contingency) > 0.005 && <TotalRow label={`Contingency (${Number(estimate.contingency_percent || 0)}%)`} value={pricing.contingency} round={round} />}
              {defaultBool(estimate, "show_fees_line") && Math.abs(pricing.fees) > 0.005 && <TotalRow label="Shipping / permits / fees" value={pricing.fees} round={round} />}
              {defaultBool(estimate, "show_tax_line") && Math.abs(pricing.tax) > 0.005 && <TotalRow label={`Tax (${Number(estimate.tax_percent || 0)}%)`} value={pricing.tax} round={round} />}
              <div className="flex justify-between gap-4 border-t-2 border-gray-900 pt-2 text-[14px] font-extrabold"><span>Total</span><span>{fmt(pricing.quoteTotal, round)}</span></div>
              {defaultBool(estimate, "show_deposit_lines") && <><TotalRow label={`Deposit (${Number(estimate.deposit_percent || 0)}%)`} value={pricing.deposit} round={round} /><TotalRow label="Balance" value={pricing.balance} round={round} /></>}
            </div>

            {defaultBool(estimate, "show_scope_lists") && (lines(estimate.scope_inclusions).length > 0 || lines(estimate.scope_exclusions).length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-7 border-t border-gray-200 pt-5">
                {lines(estimate.scope_inclusions).length > 0 && <ScopeList title="Included" items={lines(estimate.scope_inclusions)} />}
                {lines(estimate.scope_exclusions).length > 0 && <ScopeList title="Excluded" items={lines(estimate.scope_exclusions)} />}
              </div>
            )}

            {defaultBool(estimate, "show_lead_time_block") && estimate.lead_time_text && <TextBlock title="Lead Time" text={estimate.lead_time_text} />}
            {defaultBool(estimate, "show_warranty_block") && estimate.warranty_text && <TextBlock title="Warranty" text={estimate.warranty_text} />}
            {defaultBool(estimate, "show_notes_on_quote") && estimate.notes && <TextBlock title="Notes" text={estimate.notes} />}
            {defaultBool(estimate, "show_terms_block") && (estimate.payment_terms || estimate.quote_terms_conditions) && <TextBlock title="Terms & Conditions" text={[estimate.payment_terms, estimate.quote_terms_conditions].filter(Boolean).join("\n\n")} />}

            {defaultBool(estimate, "show_signature_block") && (
              <div className="grid grid-cols-2 gap-8 mt-9 pt-6 border-t border-gray-200 text-[9px] text-gray-500">
                <div className="border-t border-gray-500 pt-1">Customer acceptance / signature</div>
                <div className="border-t border-gray-500 pt-1">Date</div>
              </div>
            )}

            <footer className="mt-8 pt-4 border-t border-gray-200 text-[9px] text-gray-500 text-center">
              {estimate.quote_footer_text && <div className="mb-2 whitespace-pre-line">{estimate.quote_footer_text}</div>}
              {defaultBool(estimate, "show_validity_footer") && <div>This estimate is valid for {Number(estimate.quote_valid_days ?? 30)} days unless otherwise stated.</div>}
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, textarea = false, className = "" }) {
  return <label className={`text-[10px] font-bold tracking-wide text-gray-500 block ${className}`}>{label.toUpperCase()}{textarea ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] resize-y font-normal text-gray-800" /> : <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full h-[32px] px-2 border border-gray-300 rounded text-[11px] font-normal text-gray-800" />}</label>;
}

function QuoteRow({ estimate, name, category, quantity, description, amount, round }) {
  return <tr className="align-top text-[10px]"><td className="px-3 py-2.5"><div className="font-bold text-gray-900">{name}</div>{defaultBool(estimate, "show_section_descriptions") && description && <div className="mt-0.5 text-[9px] text-gray-500 whitespace-pre-line">{description}</div>}</td>{defaultBool(estimate, "show_category_column") && <td className="px-3 py-2.5 text-gray-600">{category || "—"}</td>}{defaultBool(estimate, "show_quantity_column", false) && <td className="px-3 py-2.5 text-right text-gray-600">{quantity || "—"}</td>}<td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{fmt(amount, round)}</td></tr>;
}

function TotalRow({ label, value, round }) {
  return <div className="flex justify-between gap-4 text-gray-600"><span>{label}</span><span>{fmt(value, round)}</span></div>;
}

function ScopeList({ title, items }) {
  return <div><div className="text-[9px] font-bold tracking-widest text-gray-500 uppercase">{title}</div><ul className="mt-2 space-y-1 text-[10px] text-gray-700 list-disc pl-4">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>;
}

function TextBlock({ title, text }) {
  return <div className="mt-6 border-t border-gray-200 pt-4"><div className="text-[9px] font-bold tracking-widest text-gray-500 uppercase">{title}</div><div className="mt-1.5 text-[10px] leading-relaxed text-gray-700 whitespace-pre-line">{text}</div></div>;
}
