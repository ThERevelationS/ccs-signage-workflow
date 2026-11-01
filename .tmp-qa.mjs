import fs from "node:fs";
const must = (s, old, nu) => {
  if (!s.includes(old)) { console.error("MISS:", JSON.stringify(old.slice(0, 90))); process.exit(1); }
  return s.replace(old, nu);
};

// ---------- customerPortalAction: estimate-scoped link kind (single quote, respond-capable)
let f = "base44/functions/customerPortalAction/entry.ts";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

// create_link: estimate kind shares the estimate_id resolution with staff_view.
s = must(s,
  `      const recordId = kind === "customer" ? clean(body?.customer_id) : kind === "staff_view" ? clean(body?.estimate_id) : kind === "work_order" ? clean(body?.work_order_id) : clean(body?.invoice_id);`,
  `      const recordId = kind === "customer" ? clean(body?.customer_id) : kind === "staff_view" || kind === "estimate" ? clean(body?.estimate_id) : kind === "work_order" ? clean(body?.work_order_id) : clean(body?.invoice_id);`
);
s = must(s,
  `      if (!["invoice", "customer", "staff_view", "work_order"].includes(kind)) throw bad("kind must be invoice, customer, staff_view, or work_order.");`,
  `      if (!["invoice", "customer", "staff_view", "estimate", "work_order"].includes(kind)) throw bad("kind must be invoice, customer, staff_view, estimate, or work_order.");`
);
s = must(s,
  `      if (kind === "staff_view") {
        const estimate = await Estimate.get(recordId).catch(() => null);
        if (!estimate?.id) throw bad("Estimate not found.", 404);
        customerId = clean(estimate.customer_id);
        label = label || \`Shared view \${clean(estimate.estimate_number) || recordId}\`;
      }`,
  `      if (kind === "staff_view" || kind === "estimate") {
        const estimate = await Estimate.get(recordId).catch(() => null);
        if (!estimate?.id) throw bad("Estimate not found.", 404);
        customerId = clean(estimate.customer_id);
        label = label || (kind === "estimate"
          ? \`Quote \${clean(estimate.estimate_number) || recordId}\`
          : \`Shared view \${clean(estimate.estimate_number) || recordId}\`);
      }`
);

// bootstrap: estimate kind — one quote, respond-capable, with branding.
s = must(s,
  `      // Single-job status tracker: a 'work_order' link opens exactly one job's`,
  `      // Single-quote link: an 'estimate' link opens exactly one quote's portal
      // view — approve / request-changes / section responses work, scoped to
      // this record in estimate_respond below. No invoices or other jobs.
      if (clean(link.kind) === "estimate") {
        const estimate = await Estimate.get(clean(link.record_id)).catch(() => null);
        if (!estimate?.id || estimate?.deleted === true) throw bad("The linked quote is no longer available.", 404);
        const announcements = await loadPortalAnnouncements(clean(link.customer_id) || clean(estimate.customer_id) || "");
        const quoteDefaults = await loadAllEntityRows({ entity: base44.asServiceRole.entities.QuoteDefaults, query: { config_name: "default" }, label: "Portal quote defaults" }).catch(() => []);
        const qd = (Array.isArray(quoteDefaults) ? quoteDefaults : [])[0] || {};
        const companyBranding = { name: clean(qd?.company_name) || "CCS Signage", logo_url: clean(qd?.company_logo_url) };
        const view = await estimatePortalView(estimate);
        return Response.json({
          success: true,
          action,
          kind: "estimate",
          label: clean(link.label),
          expires_at: clean(link.expires_at),
          announcements,
          company: companyBranding,
          estimate: view,
          estimates: [view],
          customer: {
            name: clean(link.label) || clean(estimate.client_name) || "Customer",
          },
        });
      }

      // Single-job status tracker: a 'work_order' link opens exactly one job's`
);

// estimate_respond: accept estimate-kind links scoped to their own record only.
s = must(s,
  `    if (action === "estimate_respond") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      if (clean(link.kind) !== "customer") throw bad("This portal link cannot respond to quotes.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const estimateId = clean(body?.estimate_id);`,
  `    if (action === "estimate_respond") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      const linkKind = clean(link.kind);
      if (linkKind !== "customer" && linkKind !== "estimate") throw bad("This portal link cannot respond to quotes.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const estimateId = clean(body?.estimate_id);
      // An estimate-scoped link may only respond to its own quote — never
      // any other estimate id the caller names.
      if (linkKind === "estimate" && clean(link.record_id) !== estimateId) throw bad("Quote not found.", 404);`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);

// ---------- CustomerPortal.jsx: focused single-quote view
f = "src/pages/CustomerPortal.jsx";
s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `  const isCustomer = data?.kind === "customer";\n  const isWorkOrder = data?.kind === "work_order";`,
  `  const isCustomer = data?.kind === "customer";\n  const isWorkOrder = data?.kind === "work_order";\n  const isEstimate = data?.kind === "estimate";`
);
s = must(s,
  `        {!state.loading && data && !isCustomer && (
          <>
            {isWorkOrder && data.job && (`,
  `        {!state.loading && data && !isCustomer && (
          <>
            {isEstimate && (
              <div className="space-y-4">
                {estimates.filter((q) => q.can_respond).length > 0 && (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-900">
                    This quote is waiting for your response — approve it, request changes, or respond per section below.
                  </div>
                )}
                {estimates.map((q) => <QuoteCard key={q.id} quote={q} onRespond={respond} busy={busy} />)}
                <p className="text-center text-[11px] text-slate-400">Approve or respond right from this link — no account needed.</p>
              </div>
            )}
            {isWorkOrder && data.job && (`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);

// ---------- EstimateAcceptancePanel.jsx: quote-scoped share button
f = "src/components/estimator/EstimateAcceptancePanel.jsx";
s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `  const [portalCopied, setPortalCopied] = useState(false);`,
  `  const [portalCopied, setPortalCopied] = useState(false);\n  const [quoteCopied, setQuoteCopied] = useState(false);`
);
s = must(s,
  `  const copyPortalLink = async () => {`,
  `  const copyQuoteLink = async () => {
    if (!estimate?.id || !sessionToken || portalBusy) return;
    setPortalBusy(true);
    setPortalError("");
    try {
      const data = await invokePortal(sessionToken, { action: "create_link", kind: "estimate", estimate_id: estimate.id, creation_request_key: crypto.randomUUID() });
      const token = String(data?.token || data?.link?.token || "").trim();
      if (!token) throw new Error("No quote link is available for this estimate.");
      await navigator.clipboard.writeText(\`\${window.location.origin}/customerportal?token=\${encodeURIComponent(token)}\`);
      setQuoteCopied(true);
      window.setTimeout(() => setQuoteCopied(false), 2500);
    } catch (err) {
      setPortalError(err?.message || "The quote approval link could not be prepared.");
    } finally {
      setPortalBusy(false);
    }
  };

  const copyPortalLink = async () => {`
);
s = must(s,
  `            <div className="text-[10px] text-blue-800"><strong>Share the customer portal link</strong> so the customer can review and approve Quote Version {quoteVersion} online.</div>
            <button type="button" onClick={copyPortalLink} disabled={portalBusy} className="h-[28px] px-3 rounded border border-blue-300 bg-white text-[10px] font-bold text-blue-700 hover:bg-blue-100 inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
              {portalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} {portalCopied ? "Link Copied" : "Copy Approval Link"}
            </button>`,
  `            <div className="text-[10px] text-blue-800"><strong>Share a link</strong> so the customer can approve Quote Version {quoteVersion} online — the quote link opens only this quote; the portal link opens their whole account.</div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={copyQuoteLink} disabled={portalBusy} className="h-[28px] px-3 rounded border border-blue-300 bg-white text-[10px] font-bold text-blue-700 hover:bg-blue-100 inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
                {portalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} {quoteCopied ? "Quote link copied" : "Copy Quote Link"}
              </button>
              <button type="button" onClick={copyPortalLink} disabled={portalBusy} className="h-[28px] px-3 rounded border border-blue-300 bg-white text-[10px] font-bold text-blue-700 hover:bg-blue-100 inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
                {portalCopied ? "Link Copied" : "Copy Portal Link"}
              </button>
            </div>`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);
