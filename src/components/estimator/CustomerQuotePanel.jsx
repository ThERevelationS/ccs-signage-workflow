import { useEffect, useState } from "react";
import { Loader2, Mail, Printer, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildCustomerQuoteRows } from "./customerQuote";
import { formatQuoteIssueDate, localDateStamp, quoteExpirationDate, resolveQuoteIssueMetadata } from "./quoteLifecycle";
import { generateCustomerQuotePdf } from "./quotePdf";
import { defaultQuoteEmailMessage, defaultQuoteEmailSubject, deliverEstimateQuote } from "./quoteDeliveryService";

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

export default function CustomerQuotePanel({
  estimate,
  pricing,
  onChange,
  readOnly = false,
  revisionInProgress = false,
  persistedStatus = "draft",
  onQuoteDelivered,
  onDeliveryLogged,
}) {
  const round = estimate.round_prices_to_dollar === true;
  const quoteRows = buildCustomerQuoteRows(estimate, pricing);
  const quoteDate = formatQuoteIssueDate(estimate.quote_issue_date);
  const quoteVersion = Math.max(0, Math.floor(Number(estimate.quote_version || 0)));
  const quoteExpiration = quoteExpirationDate(estimate.quote_issue_date || localDateStamp(), estimate.quote_valid_days ?? 30);
  const quoteExpirationLabel = quoteExpiration ? formatQuoteIssueDate(quoteExpiration) : "";
  const issuingNewQuote = ["draft", "calculated"].includes(String(persistedStatus || "draft"));
  const canEmailQuote = !revisionInProgress && persistedStatus !== "cancelled" && (issuingNewQuote || quoteVersion > 0);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [currentVersionDelivered, setCurrentVersionDelivered] = useState(false);

  useEffect(() => {
    let active = true;
    if (!estimate?.id || quoteVersion <= 0 || issuingNewQuote) {
      setCurrentVersionDelivered(false);
      return () => { active = false; };
    }
    base44.entities.EstimateQuoteDelivery.filter({ estimate_id: estimate.id })
      .then((rows) => {
        if (!active) return;
        setCurrentVersionDelivered((rows || []).some((row) => Number(row.quote_version || 0) === quoteVersion));
      })
      .catch(() => { if (active) setCurrentVersionDelivered(false); });
    return () => { active = false; };
  }, [estimate?.id, quoteVersion, issuingNewQuote]);

  const emailActionLabel = issuingNewQuote || !currentVersionDelivered ? "Send Quote" : "Resend Quote";

  const printQuote = () => {
    window.print();
  };

  const set = (key, value) => onChange?.({ [key]: value });

  const openSendDialog = () => {
    if (!canEmailQuote) return;
    setRecipientEmail(estimate.contact_email || "");
    setEmailSubject(defaultQuoteEmailSubject(estimate));
    setEmailMessage(defaultQuoteEmailMessage(estimate));
    setSendError("");
    setSendOpen(true);
  };

  const sendQuote = async () => {
    const recipient = String(recipientEmail || "").trim();
    const subject = String(emailSubject || "").trim();
    const message = String(emailMessage || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setSendError("Enter a valid customer email address.");
      return;
    }
    if (!subject || !message) {
      setSendError("Subject and message are required.");
      return;
    }

    setSending(true);
    setSendError("");
    let emailWasSent = false;
    try {
      const issueMetadata = issuingNewQuote
        ? resolveQuoteIssueMetadata({
            previousStatus: persistedStatus,
            nextStatus: "sent",
            currentVersion: estimate.quote_version || 0,
            today: localDateStamp(),
          })
        : {};
      const deliveryVersion = Math.max(0, Math.floor(Number(issueMetadata.quote_version ?? estimate.quote_version ?? 0)));
      const deliveryIssueDate = issueMetadata.quote_issue_date || estimate.quote_issue_date || localDateStamp();
      let isResend = false;
      if (!issuingNewQuote && deliveryVersion > 0) {
        // Audit semantics must be version-specific. Fail before Gmail sends if
        // we cannot determine whether this exact quote version was delivered.
        const previousDeliveries = await base44.entities.EstimateQuoteDelivery.filter({ estimate_id: estimate.id });
        isResend = (previousDeliveries || []).some((row) => Number(row.quote_version || 0) === deliveryVersion);
      }
      const attachment = await generateCustomerQuotePdf({
        estimateNumber: estimate.estimate_number,
        projectName: estimate.project_name,
        quoteIssueDate: deliveryIssueDate,
        quoteVersion: deliveryVersion,
      });
      const deliveryResult = await deliverEstimateQuote({
        estimate,
        recipientEmail: recipient,
        subject,
        message,
        attachment,
        quoteVersion: deliveryVersion,
        quoteIssueDate: deliveryIssueDate,
        quoteTotal: pricing.quoteTotal,
        sourceStatus: persistedStatus,
        isResend,
      });
      emailWasSent = true;
      if (!deliveryResult.deliveryLogWarning) setCurrentVersionDelivered(true);
      onDeliveryLogged?.(deliveryResult);
      const trackingResult = issuingNewQuote
        ? await onQuoteDelivered?.({
            recipientEmail: recipient,
            issueMetadata,
            quoteVersion: deliveryVersion,
            quoteIssueDate: deliveryIssueDate,
            gmailMessageId: deliveryResult.messageId,
          })
        : {};
      setSendOpen(false);
      const warnings = [deliveryResult.deliveryLogWarning, trackingResult?.warning].filter(Boolean);
      window.alert(warnings.length ? `Quote emailed successfully.\n\n${warnings.join("\n")}` : "Quote emailed successfully.");
    } catch (error) {
      const detail = error?.message || "Quote could not be emailed.";
      setSendError(emailWasSent ? `The email was sent, but estimate tracking could not be finalized: ${detail}` : detail);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="no-print px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 bg-gray-50">
        <div>
          <div className="text-[13px] font-bold text-gray-900 flex items-center gap-2"><Settings2 className="w-4 h-4 text-red-600" /> Customer Quote</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Live preview uses the same frozen Product pricing waterfall as the estimate. Quote settings are stored on this estimate.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={openSendDialog}
            disabled={!canEmailQuote || sending}
            title={revisionInProgress ? "Save the open revision before emailing the customer quote." : persistedStatus === "cancelled" ? "Cancelled estimates cannot be emailed." : !issuingNewQuote && quoteVersion === 0 ? "This protected estimate has no issued customer quote version to send." : issuingNewQuote ? "Email this quote as the next issued customer version." : currentVersionDelivered ? "Email the currently issued quote version again." : "Email the currently issued quote version for the first time."}
            className="h-[31px] text-[11px] bg-gray-800 hover:bg-gray-900 text-white"
          >
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            {revisionInProgress ? "Save Revision Before Sending" : emailActionLabel}
          </Button>
          <Button type="button" variant="outline" onClick={printQuote} disabled={revisionInProgress} title={revisionInProgress ? "Save the open revision before printing the customer quote." : "Print Quote"} className="h-[31px] text-[11px]"><Printer className="w-3.5 h-3.5 mr-1.5" /> {revisionInProgress ? "Save Revision Before Printing" : "Print Quote"}</Button>
        </div>
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
                {defaultBool(estimate, "show_dates") && <><div data-quote-issue-date className="text-[10px] text-gray-600">Issued {quoteDate}</div>{quoteExpirationLabel && <div data-quote-expiration-date className="text-[9px] text-gray-500">Valid through {quoteExpirationLabel}</div>}</>}
                <div data-quote-version className={`text-[9px] text-gray-500 ${quoteVersion > 0 ? "" : "hidden"}`}>Quote Version {quoteVersion}</div>
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
              {defaultBool(estimate, "show_validity_footer") && <div>{quoteExpirationLabel ? `This estimate is valid through ${quoteExpirationLabel} (${Number(estimate.quote_valid_days ?? 30)} days) unless otherwise stated.` : `This estimate is valid for ${Number(estimate.quote_valid_days ?? 30)} days unless otherwise stated.`}</div>}
            </footer>
          </article>
        </div>
      </div>

      <Dialog open={sendOpen} onOpenChange={(next) => !sending && setSendOpen(next)}>
        <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden border-gray-300 shadow-xl">
          <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-lime-300">
            <DialogTitle className="text-white text-[16px] flex items-center gap-2"><Mail className="w-5 h-5 text-lime-300" /> {currentVersionDelivered && !issuingNewQuote ? "Resend Customer Quote" : "Send Customer Quote"}</DialogTitle>
            <p className="mt-1 text-[10px] text-gray-300">{issuingNewQuote ? "The PDF is generated from the current customer quote preview. The estimate is marked Sent only after Gmail accepts the message." : currentVersionDelivered ? `This resends Quote Version ${quoteVersion} without creating a new quote version.` : `This sends the already-issued Quote Version ${quoteVersion} for the first recorded time.`}</p>
          </DialogHeader>
          <div className="p-5 space-y-3 bg-white">
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">TO<input autoFocus type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800" placeholder="customer@example.com" /></label>
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">SUBJECT<input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} className="mt-1 w-full h-[34px] rounded border border-gray-300 px-2.5 text-[12px] font-normal text-gray-800" /></label>
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">MESSAGE<textarea value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} rows={7} className="mt-1 w-full rounded border border-gray-300 px-2.5 py-2 text-[12px] font-normal text-gray-800 resize-y" /></label>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] text-gray-600">
              <strong>Attachment:</strong> Customer quote PDF · {issuingNewQuote ? `next version ${Math.max(1, quoteVersion + 1)}` : `Version ${quoteVersion}`}
            </div>
            {sendError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{sendError}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={sending} onClick={() => setSendOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={sending || !recipientEmail.trim() || !emailSubject.trim() || !emailMessage.trim()} onClick={sendQuote} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50 inline-flex items-center gap-1.5">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} {sending ? "Generating & Sending…" : emailActionLabel}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
