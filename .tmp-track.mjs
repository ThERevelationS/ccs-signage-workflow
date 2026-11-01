import fs from "node:fs";
const must = (s, old, nu) => {
  if (!s.includes(old)) { console.error("MISS:", JSON.stringify(old.slice(0, 90))); process.exit(1); }
  return s.replace(old, nu);
};

// ---------- 1) customerPortalAction: create_link + bootstrap work_order kind
let f = "base44/functions/customerPortalAction/entry.ts";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

s = must(s,
  `      const recordId = kind === "customer" ? clean(body?.customer_id) : kind === "staff_view" ? clean(body?.estimate_id) : clean(body?.invoice_id);`,
  `      const recordId = kind === "customer" ? clean(body?.customer_id) : kind === "staff_view" ? clean(body?.estimate_id) : kind === "work_order" ? clean(body?.work_order_id) : clean(body?.invoice_id);`
);
s = must(s,
  `      if (!["invoice", "customer", "staff_view"].includes(kind)) throw bad("kind must be invoice, customer, or staff_view.");`,
  `      if (!["invoice", "customer", "staff_view", "work_order"].includes(kind)) throw bad("kind must be invoice, customer, staff_view, or work_order.");`
);
s = must(s,
  `      } else if (kind === "invoice") {
        const invoice = await Invoice.get(recordId).catch(() => null);
        if (!invoice?.id) throw bad("Invoice not found.", 404);
        customerId = clean(invoice.customer_id);
        label = label || \`Invoice \${clean(invoice.invoice_number) || recordId}\`;
      } else {`,
  `      } else if (kind === "invoice") {
        const invoice = await Invoice.get(recordId).catch(() => null);
        if (!invoice?.id) throw bad("Invoice not found.", 404);
        customerId = clean(invoice.customer_id);
        label = label || \`Invoice \${clean(invoice.invoice_number) || recordId}\`;
      } else if (kind === "work_order") {
        const order = await WorkOrder.get(recordId).catch(() => null);
        if (!order?.id) throw bad("Work order not found.", 404);
        customerId = clean(order.customer_id);
        label = label || \`Job \${clean(order.est_inv_at || order.work_order_number) || recordId} status\`;
      } else {`
);

// bootstrap: work_order branch — single-job tracker, no account exposure.
s = must(s,
  `      // Staff read-only share link (#88): a 'staff_view' link opens exactly one`,
  `      // Single-job status tracker: a 'work_order' link opens exactly one job's
      // customer-safe status view — no invoices, payments, or other jobs.
      if (clean(link.kind) === "work_order") {
        const order = await WorkOrder.get(clean(link.record_id)).catch(() => null);
        if (!order?.id || order?.deleted === true) throw bad("The linked job is no longer available.", 404);
        const announcements = await loadPortalAnnouncements(clean(link.customer_id) || clean(order.customer_id) || "");
        return Response.json({
          success: true,
          action,
          kind: "work_order",
          label: clean(link.label),
          expires_at: clean(link.expires_at),
          announcements,
          job: jobPortalView(order),
          products: (Array.isArray(order?.products) ? order.products : [])
            .filter((p: any) => p && p.deleted !== true)
            .map((p: any) => ({
              description: clean(p?.description || p?.customer_description) || "Item",
              quantity: num(p?.quantity) || null,
              customer_facing_status: clean(p?.customer_facing_status),
              fulfillment_state: clean(p?.fulfillment_state) === "none" ? "" : clean(p?.fulfillment_state),
            })),
        });
      }

      // Staff read-only share link (#88): a 'staff_view' link opens exactly one`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);

// ---------- 2) CustomerPortal.jsx: render the single-job tracker view
f = "src/pages/CustomerPortal.jsx";
s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `  const isCustomer = data?.kind === "customer";`,
  `  const isCustomer = data?.kind === "customer";\n  const isWorkOrder = data?.kind === "work_order";`
);
s = must(s,
  `            {data.kind === "staff_view" && data.estimate && (`,
  `            {isWorkOrder && data.job && (
              <div className="space-y-4">
                <JobCard job={data.job} busy={false} />
                {Array.isArray(data.products) && data.products.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Items on this job</p>
                    <ul className="mt-2 divide-y divide-slate-100">
                      {data.products.map((p, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-slate-800">{p.description}{Number(p.quantity) > 1 ? \` x \${p.quantity}\` : ""}</span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                            {p.fulfillment_state ? \`\${p.fulfillment_state.replace(/_/g, " ")}\` : (p.customer_facing_status || "In progress")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-center text-[11px] text-slate-400">Status updates appear here as the job moves — bookmark this link.</p>
              </div>
            )}
            {data.kind === "staff_view" && data.estimate && (`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);

// ---------- 3) JobWorkspace.jsx: "Status link" action in the PageHeader actions
f = "src/components/jobs/JobWorkspace.jsx";
s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `import { useAuth } from "@/components/auth/EmailGate";`,
  `import { useAuth } from "@/components/auth/EmailGate";\nimport { invokePortal } from "@/components/portal/PortalPanel";`
);
s = must(s,
  `  const { currentUser, sessionToken } = useAuth();`,
  `  const { currentUser, sessionToken } = useAuth();
  const [statusLinkState, setStatusLinkState] = useState("");
  const copyStatusLink = async () => {
    if (!sessionToken || !wo?.id || statusLinkState === "busy") return;
    setStatusLinkState("busy");
    try {
      const d = await invokePortal(sessionToken, { action: "create_link", kind: "work_order", work_order_id: wo.id, creation_request_key: crypto.randomUUID() });
      const token = d?.token || d?.link?.token;
      if (!token) throw new Error("no token");
      await navigator.clipboard.writeText(\`\${window.location.origin}/customerportal?token=\${encodeURIComponent(token)}\`);
      setStatusLinkState("copied");
    } catch { setStatusLinkState("error"); }
    setTimeout(() => setStatusLinkState(""), 2500);
  };`
);
s = must(s,
  `            {wo.customer_id && (
              <Link className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50" to={\`/CustomerStatements?customer=\${wo.customer_id}\`}>
                Statement
              </Link>
            )}`,
  `            {wo.customer_id && (
              <Link className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50" to={\`/CustomerStatements?customer=\${wo.customer_id}\`}>
                Statement
              </Link>
            )}
            <button
              type="button"
              onClick={copyStatusLink}
              title="Copy a no-login customer link that shows only this job's status"
              className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              disabled={!sessionToken || statusLinkState === "busy"}
            >
              {statusLinkState === "copied" ? "Status link copied" : statusLinkState === "error" ? "Link failed" : "Status link"}
            </button>`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);
