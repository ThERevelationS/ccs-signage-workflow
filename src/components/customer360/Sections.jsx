import React from "react";
import { Link } from "react-router-dom";
import {
  Briefcase,
  FileText,
  GitPullRequest,
  MapPin,
  Receipt,
  ShoppingCart,
  User,
} from "lucide-react";
import { Section, DataList, BackendRequired } from "./DataList";
import { EmptyState, RecordLink, StatusChip as KitStatusChip } from "@/components/kit";
import {
  activityKind,
  activityLabel,
  activityWhen,
  changeOrderLabel,
  clean,
  contactDisplayName,
  daysOverdue,
  estimateLabel,
  estimateNumber,
  estimateValidUntil,
  invoiceNumber,
  isActivityOpen,
  isActivityOverdue,
  locationLabel,
  locationLine,
  num,
  opportunityLabel,
  primaryContactName,
  purchaseOrderLabel,
  usd,
  workOrderLabel,
  workOrderStage,
  CLOSED_OPPORTUNITY_STAGES,
} from "./customer360Model";

// Shared kit chip: one status -> tone vocabulary app-wide. Blank values still
// render the bare em-dash the old chip() helper emitted.
const StatusChip = ({ value }) =>
  clean(value) ? (
    <KitStatusChip status={value} size="sm" />
  ) : (
    <span className="text-slate-300 dark:text-slate-600">—</span>
  );

const linkCls = "font-medium text-sky-600 hover:underline dark:text-sky-400";
const sub = "mt-0.5 text-xs text-slate-400 dark:text-slate-500";
const fmtDate = (v) => clean(v).slice(0, 10) || "—";

function RowLink({ to, children }) {
  return (
    <Link to={to} className={linkCls}>
      {children}
    </Link>
  );
}

// --- Overview ----------------------------------------------------------------

function InfoRow({ label, children }) {
  const empty = children === undefined || children === null || children === "" || children === "—";
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span className={`min-w-0 text-right ${empty ? "text-slate-300 dark:text-slate-600" : "text-slate-700 dark:text-slate-300"}`}>
        {empty ? "—" : children}
      </span>
    </div>
  );
}

export function OverviewTab({ data, customer, backendReady, truncatedNotice }) {
  const c = customer || data.customer || {};
  const openOpps = (data.opportunities || []).filter(
    (o) => !CLOSED_OPPORTUNITY_STAGES.has(clean(o.stage)),
  );
  const recentActivity = (data.activities || []).slice(0, 5);
  const contact = primaryContactName(c);
  const phones = [clean(c.company_phone), clean(c.additional_phone) && `${clean(c.additional_phone)} (${clean(c.additional_phone_type) || "other"})`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="Account" className="lg:col-span-1">
        <div className="px-4 py-2">
          <InfoRow label="Primary contact">{contact}</InfoRow>
          {clean(c.contact_position) && <InfoRow label="Position">{clean(c.contact_position)}</InfoRow>}
          <InfoRow label="Email">
            {clean(c.contact_email) ? (
              <a className={linkCls} href={`mailto:${clean(c.contact_email)}`}>{clean(c.contact_email)}</a>
            ) : "—"}
          </InfoRow>
          <InfoRow label="Office phone">
            {[clean(c.contact_office_phone), clean(c.contact_office_ext) && `x${clean(c.contact_office_ext)}`].filter(Boolean).join(" ")}
          </InfoRow>
          <InfoRow label="Cell phone">{clean(c.contact_cell_phone)}</InfoRow>
          <InfoRow label="Company phone">{phones}</InfoRow>
          <InfoRow label="Website">
            {clean(c.website) ? (
              <a className={linkCls} href={/^https?:\/\//i.test(clean(c.website)) ? clean(c.website) : `https://${clean(c.website)}`} target="_blank" rel="noreferrer">
                {clean(c.website)}
              </a>
            ) : "—"}
          </InfoRow>
          <InfoRow label="Salesperson">{clean(c.salesperson)}</InfoRow>
          <InfoRow label="Sales center">{clean(c.location)}</InfoRow>
          <InfoRow label="Lead source">{clean(c.customer_origination) || clean(c.lead_source)}</InfoRow>
          <InfoRow label="Industry">{clean(c.industry_type)}</InfoRow>
        </div>
      </Section>

      <Section title="Billing, credit & tax" className="lg:col-span-1">
        <div className="px-4 py-2">
          <InfoRow label="Bill to">
            {[clean(c.billing_address_1), clean(c.billing_address_2), [clean(c.billing_city), clean(c.billing_state), clean(c.billing_postal_code)].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", ")}
          </InfoRow>
          <InfoRow label="Terms">{clean(c.terms)}</InfoRow>
          <InfoRow label="Tax group">{clean(c.default_tax_group)}</InfoRow>
          <InfoRow label="Tax exempt">
            {c.tax_exempt
              ? `Yes${clean(c.tax_exempt_reason) ? ` — ${clean(c.tax_exempt_reason)}` : ""}${clean(c.tax_exempt_expiration) ? ` (exp ${clean(c.tax_exempt_expiration)})` : ""}`
              : "No"}
          </InfoRow>
          <InfoRow label="Credit limit">{num(c.credit_limit) > 0 ? usd(c.credit_limit) : "—"}</InfoRow>
          <InfoRow label="Credit hold">{c.credit_hold ? <StatusChip value="credit hold" /> : "No"}</InfoRow>
          <InfoRow label="In-store credit">{num(c.in_store_credit) > 0 ? usd(c.in_store_credit) : "—"}</InfoRow>
          <InfoRow label="PO required">{c.require_purchase_order ? "Yes" : "No"}</InfoRow>
          <InfoRow label="Statements">{c.send_monthly_statements === false ? "Off" : "Monthly"}</InfoRow>
          <InfoRow label="Quote valid">{num(c.quote_valid_days) > 0 ? `${num(c.quote_valid_days)} days` : "—"}</InfoRow>
          <InfoRow label="Auto-inactive">{num(c.auto_inactive_after_months) > 0 ? `After ${num(c.auto_inactive_after_months)} mo` : "Off"}</InfoRow>
          {clean(c.master_account) && <InfoRow label="Master account">{clean(c.master_account)}</InfoRow>}
        </div>
      </Section>

      <Section
        title="Open pipeline"
        count={backendReady ? openOpps.length : undefined}
        className="lg:col-span-1"
        notice={!backendReady ? "Opportunity data needs the Customer 360 backend." : truncatedNotice}
      >
        {!backendReady ? (
          <BackendRequired label="Opportunities" />
        ) : openOpps.length === 0 ? (
          <EmptyState compact title="No open opportunities." actionLabel="View pipeline" actionTo="/Opportunities" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {openOpps.slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <RecordLink kind="opportunity" id={o.id} className={linkCls}>
                    <Briefcase className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                    {opportunityLabel(o)}
                  </RecordLink>
                  <div className={sub}>
                    {[clean(o.stage).replace(/_/g, " "), clean(o.salesperson), clean(o.desired_install_date) && `install ${clean(o.desired_install_date).slice(0, 10)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                {num(o.budget_amount) > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">{usd(o.budget_amount)}</span>
                )}
              </li>
            ))}
            {openOpps.length > 6 && (
              <li className="px-4 py-2 text-center text-xs text-slate-400">
                +{openOpps.length - 6} more — see the CRM / Activity tab
              </li>
            )}
          </ul>
        )}
      </Section>

      {clean(c.notes) && (
        <Section title="Account notes" className="lg:col-span-2">
          <p className="whitespace-pre-wrap px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{clean(c.notes)}</p>
        </Section>
      )}

      <Section
        title="Recent activity"
        className={clean(c.notes) ? "lg:col-span-1" : "lg:col-span-2"}
        notice={!backendReady ? "Showing only staff-readable activity rows." : undefined}
      >
        {recentActivity.length === 0 ? (
          <EmptyState compact title="No activity recorded." actionLabel="Log an event" actionTo="/CrmEvents" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentActivity.map((a) => (
              <li key={a.id || `${activityWhen(a)}-${activityLabel(a)}`} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">{activityLabel(a)}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{fmtDate(activityWhen(a))}</span>
                </div>
                <div className={sub}>{[activityKind(a), clean(a.actor) && `by ${clean(a.actor)}`].filter(Boolean).join(" · ")}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// --- Estimates ---------------------------------------------------------------

export function EstimatesTab({ data, truncatedNotice }) {
  const rows = data.estimates || [];
  return (
    <Section title="Estimates" count={rows.length} notice={truncatedNotice}>
      <DataList
        rows={rows}
        rowKey={(e) => e.id}
        empty="No estimates for this customer yet."
        emptyActionLabel="New estimate"
        emptyActionTo={data.customer?.id ? `/NewAllInOneEstimate?customer=${data.customer.id}` : "/NewAllInOneEstimate"}
        columns={[
          {
            label: "Estimate",
            render: (e) => (
              <div className="min-w-0">
                <RecordLink kind="estimate" id={e.id} className={linkCls}>
                  <FileText className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                  {estimateLabel(e)}
                </RecordLink>
                {estimateNumber(e) && clean(e.project_name) && <div className={sub}>{estimateNumber(e)}</div>}
              </div>
            ),
          },
          { label: "Status", render: (e) => <StatusChip value={e.status || "draft"} /> },
          { label: "Total", align: "right", render: (e) => <span className="font-semibold">{usd(e.quote_total)}</span> },
          { label: "Ver", align: "center", render: (e) => (num(e.quote_version) > 0 ? `v${num(e.quote_version)}` : "—") },
          { label: "Created", render: (e) => fmtDate(e.created_date) },
          { label: "Valid until", render: (e) => fmtDate(estimateValidUntil(e)) },
        ]}
      />
    </Section>
  );
}

// --- Jobs --------------------------------------------------------------------

export function JobsTab({ data, truncatedNotice }) {
  const rows = data.work_orders || [];
  return (
    <Section title="Jobs / work orders" count={rows.length} notice={truncatedNotice}>
      <DataList
        rows={rows}
        rowKey={(w) => w.id}
        empty="No work orders for this customer yet."
        emptyActionLabel="Browse work orders"
        emptyActionTo="/JobWorkspace"
        columns={[
          {
            label: "Job",
            render: (w) => (
              <div className="min-w-0">
                <RecordLink kind="workorder" id={w.id} className={linkCls}>{workOrderLabel(w)}</RecordLink>
                {clean(w.client_name) && clean(w.client_name) !== clean(w.title) && (
                  <div className={sub}>{clean(w.client_name)}</div>
                )}
              </div>
            ),
          },
          { label: "Stage", render: (w) => <StatusChip value={workOrderStage(w)} /> },
          { label: "Sales status", render: (w) => <StatusChip value={w.sales_status} /> },
          {
            label: "Amount",
            align: "right",
            render: (w) => (num(w.estimate_amount) > 0 ? <span className="font-semibold">{usd(w.estimate_amount)}</span> : "—"),
          },
          { label: "Created", render: (w) => fmtDate(w.created_date) },
        ]}
      />
    </Section>
  );
}

// --- Financials ---------------------------------------------------------------

export function FinancialsTab({ data, backendReady, truncatedNotice, asOf }) {
  if (!backendReady) {
    return (
      <Section title="Financials">
        <BackendRequired label="Invoices, payments, purchase orders and change orders" />
      </Section>
    );
  }
  const invoices = data.invoices || [];
  const payments = data.payments || [];
  const pos = data.purchase_orders || [];
  const cos = data.change_orders || [];
  const invById = new Map(invoices.map((i) => [i.id, invoiceNumber(i)]));

  return (
    <div className="space-y-4">
      <Section title="Invoices" count={invoices.length} notice={truncatedNotice}>
        <DataList
          rows={invoices}
          rowKey={(i) => i.id}
          empty="No invoices on file."
          emptyActionLabel="View invoices"
          emptyActionTo="/Invoices"
          columns={[
            {
              label: "Invoice",
              render: (i) => (
                <RecordLink kind="invoice" id={i.id} className={linkCls}>
                  <Receipt className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                  {invoiceNumber(i)}
                </RecordLink>
              ),
            },
            { label: "Status", render: (i) => <StatusChip value={i.status} /> },
            { label: "Issued", render: (i) => fmtDate(i.issue_date || i.created_date) },
            { label: "Due", render: (i) => fmtDate(i.due_date) },
            { label: "Total", align: "right", render: (i) => usd(i.total) },
            { label: "Paid", align: "right", render: (i) => usd(i.amount_paid) },
            {
              label: "Balance",
              align: "right",
              render: (i) => {
                const od = daysOverdue(i, asOf);
                return (
                  <span className={num(i.balance_due) > 0 ? "font-semibold" : ""}>
                    {usd(i.balance_due)}
                    {od > 0 && <span className="ml-1 text-xs font-semibold text-red-600">{od}d overdue</span>}
                  </span>
                );
              },
            },
          ]}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Payments" count={payments.length}>
          <DataList
            rows={payments}
            rowKey={(p) => p.id}
            empty="No payments recorded."
            emptyActionLabel="View invoices"
            emptyActionTo="/Invoices"
            columns={[
              { label: "Date", render: (p) => fmtDate(p.paid_date || p.created_date) },
              {
                label: "Invoice",
                render: (p) =>
                  clean(p.invoice_id) ? (
                    <RecordLink kind="invoice" id={p.invoice_id} className={linkCls}>{invById.get(p.invoice_id) || "Invoice"}</RecordLink>
                  ) : "—",
              },
              { label: "Method", render: (p) => <StatusChip value={p.method} /> },
              { label: "Reference", render: (p) => clean(p.reference_number) || "—" },
              { label: "Amount", align: "right", render: (p) => <span className="font-semibold">{usd(p.amount)}</span> },
            ]}
          />
        </Section>

        <Section title="Purchase orders" count={pos.length}>
          <DataList
            rows={pos}
            rowKey={(p) => p.id}
            empty="No purchase orders."
            emptyActionLabel="View purchase orders"
            emptyActionTo="/PurchaseOrders"
            columns={[
              {
                label: "PO",
                render: (p) => (
                  <RecordLink kind="po" id={p.id} className={linkCls}>
                    <ShoppingCart className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                    {purchaseOrderLabel(p)}
                  </RecordLink>
                ),
              },
              { label: "Vendor", render: (p) => clean(p.vendor_name) || "—" },
              { label: "Status", render: (p) => <StatusChip value={p.status} /> },
              { label: "Total", align: "right", render: (p) => (num(p.total) > 0 ? usd(p.total) : "—") },
              { label: "Ordered", render: (p) => fmtDate(p.order_date || p.created_date) },
            ]}
          />
        </Section>
      </div>

      <Section title="Change orders" count={cos.length}>
        <DataList
          rows={cos}
          rowKey={(c) => c.id}
          empty="No change orders."
          emptyActionLabel="View change orders"
          emptyActionTo="/ChangeOrders"
          columns={[
            {
              label: "Change order",
              render: (c) => (
                <div className="min-w-0">
                  <RowLink to={`/ChangeOrders?co=${c.id}`}>
                    <GitPullRequest className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                    {changeOrderLabel(c)}
                  </RowLink>
                  {clean(c.title) && clean(c.change_order_number) && <div className={sub}>{clean(c.title)}</div>}
                </div>
              ),
            },
            { label: "Status", render: (c) => <StatusChip value={c.status} /> },
            {
              label: "Amount Δ",
              align: "right",
              render: (c) => {
                const d = num(c.amount_delta);
                if (!d) return "—";
                return <span className={`font-semibold ${d < 0 ? "text-red-600" : ""}`}>{d > 0 ? "+" : ""}{usd(d)}</span>;
              },
            },
            { label: "Created", render: (c) => fmtDate(c.created_date) },
          ]}
        />
      </Section>
    </div>
  );
}

// --- CRM / Activity -----------------------------------------------------------

export function ActivityTab({ data, backendReady, truncatedNotice }) {
  const activities = data.activities || [];
  const opportunities = data.opportunities || [];
  return (
    <div className="space-y-4">
      <Section
        title="Opportunities"
        count={backendReady ? opportunities.length : undefined}
        notice={!backendReady ? "Opportunity data needs the Customer 360 backend." : truncatedNotice}
      >
        {!backendReady ? (
          <BackendRequired label="Opportunities" />
        ) : (
          <DataList
            rows={opportunities}
            rowKey={(o) => o.id}
            empty="No opportunities for this customer."
            emptyActionLabel="View pipeline"
            emptyActionTo="/Opportunities"
            columns={[
              {
                label: "Opportunity",
                render: (o) => (
                  <RecordLink kind="opportunity" id={o.id} className={linkCls}>
                    <Briefcase className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                    {opportunityLabel(o)}
                  </RecordLink>
                ),
              },
              { label: "Stage", render: (o) => <StatusChip value={o.stage} /> },
              { label: "Budget", align: "right", render: (o) => (num(o.budget_amount) > 0 ? usd(o.budget_amount) : "—") },
              { label: "Salesperson", render: (o) => clean(o.salesperson) || "—" },
              { label: "Install by", render: (o) => fmtDate(o.desired_install_date) },
              { label: "Opened", render: (o) => fmtDate(o.created_date || o.opened_at) },
            ]}
          />
        )}
      </Section>

      <Section title="Activity & CRM events" count={activities.length} notice={truncatedNotice}>
        <DataList
          rows={activities}
          rowKey={(a, i) => a.id || i}
          empty="No activity recorded for this customer."
          emptyActionLabel="Log an event"
          emptyActionTo="/CrmEvents"
          columns={[
            {
              label: "When",
              render: (a) => (
                <div>
                  <div>{fmtDate(activityWhen(a))}</div>
                  {isActivityOverdue(a) && <div className="text-[10px] font-bold uppercase text-red-600">Overdue</div>}
                </div>
              ),
            },
            {
              label: "Event",
              render: (a) => (
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 dark:text-slate-200">{activityLabel(a)}</div>
                  <div className={sub}>{activityKind(a)}</div>
                </div>
              ),
            },
            {
              label: "Notes",
              render: (a) => <span className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{clean(a.notes) || clean(a.summary) || "—"}</span>,
            },
            { label: "Contact", render: (a) => clean(a.contact_name) || "—" },
            { label: "Assigned", render: (a) => clean(a.assigned_to) || clean(a.actor) || "—" },
            {
              label: "Status",
              render: (a) =>
                clean(a.completed_at)
                  ? <StatusChip value={clean(a.outcome) || "completed"} />
                  : isActivityOpen(a)
                    ? <StatusChip value="open" />
                    : <StatusChip value={activityKind(a)} />,
            },
          ]}
        />
      </Section>
    </div>
  );
}

// --- Contacts & locations ------------------------------------------------------

function ContactCard({ icon, name, meta, lines }) {
  return (
    <div className="rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-800">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {icon}
        <span className="min-w-0 truncate">{name}</span>
      </div>
      {meta && <div className={sub}>{meta}</div>}
      {(lines || []).filter(Boolean).map((l, i) => (
        <div key={i} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{l}</div>
      ))}
    </div>
  );
}

export function ContactsTab({ data, customer, backendReady, truncatedNotice }) {
  const c = customer || data.customer || {};
  const contacts = data.contacts || [];
  const locations = data.locations || [];

  // Degraded-mode fallbacks: the Customer record itself carries a primary
  // contact, a billing contact and an additional_contacts array — plus the
  // billing/site address fields — so this tab still renders without the action.
  const builtin = [];
  if (!backendReady || contacts.length === 0) {
    const primary = primaryContactName(c);
    if (primary || clean(c.contact_email) || clean(c.contact_office_phone)) {
      builtin.push({
        id: "builtin-primary",
        name: primary || "Primary contact",
        meta: [clean(c.contact_position), "primary"].filter(Boolean).join(" · "),
        lines: [
          clean(c.contact_email),
          [clean(c.contact_office_phone), clean(c.contact_office_ext) && `x${clean(c.contact_office_ext)}`].filter(Boolean).join(" "),
          clean(c.contact_cell_phone),
        ],
      });
    }
    if (c.billing_contact_same === false && (clean(c.billing_contact_name) || clean(c.billing_contact_email))) {
      builtin.push({
        id: "builtin-billing",
        name: clean(c.billing_contact_name) || "Billing contact",
        meta: "billing",
        lines: [clean(c.billing_contact_email), clean(c.billing_contact_phone)],
      });
    }
    for (const [idx, p] of (Array.isArray(c.additional_contacts) ? c.additional_contacts : []).entries()) {
      if (p?.is_active === false) continue;
      const name = [clean(p?.first_name), clean(p?.last_name)].filter(Boolean).join(" ") || clean(p?.email);
      if (!name) continue;
      builtin.push({
        id: `builtin-extra-${idx}`,
        name,
        meta: clean(p?.position),
        lines: [
          clean(p?.email),
          [clean(p?.office_phone), clean(p?.office_ext) && `x${clean(p.office_ext)}`].filter(Boolean).join(" "),
          clean(p?.cell_phone),
        ],
      });
    }
  }

  const fallbackLocations = [];
  if (!backendReady || locations.length === 0) {
    const billing = [
      clean(c.billing_address_1), clean(c.billing_address_2),
      [clean(c.billing_city), clean(c.billing_state), clean(c.billing_postal_code)].filter(Boolean).join(" "),
    ].filter(Boolean).join(", ");
    if (billing) fallbackLocations.push({ id: "builtin-billing", label: "Billing address", line: billing });
    if (c.location_same_as_billing === false) {
      const site = [
        clean(c.location_address_1), clean(c.location_address_2),
        [clean(c.location_city), clean(c.location_state), clean(c.location_postal_code)].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      if (site) fallbackLocations.push({ id: "builtin-site", label: "Site address", line: site });
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title="Contacts"
        count={backendReady ? contacts.length : builtin.length || undefined}
        notice={!backendReady ? "Showing the contact fields stored on the Customer record — the full contact list needs the Customer 360 backend." : truncatedNotice}
      >
        {backendReady && contacts.length === 0 && builtin.length === 0 ? (
          <EmptyState compact title="No contacts recorded." actionLabel="Edit customer" actionTo={c.id ? `/EstimatorCustomers?customer=${c.id}` : "/EstimatorCustomers"} />
        ) : (
          <div className="space-y-2 px-4 py-3">
            {contacts.map((p) => (
              <ContactCard
                key={p.id}
                icon={<User className="h-3.5 w-3.5 text-slate-400" />}
                name={contactDisplayName(p) + (p.is_primary ? " (primary)" : "")}
                meta={[clean(p.position), clean(p.authority_role)].filter(Boolean).join(" · ")}
                lines={[
                  clean(p.email),
                  [clean(p.phone), clean(p.phone_ext) && `x${clean(p.phone_ext)}`].filter(Boolean).join(" "),
                  clean(p.mobile_phone),
                  clean(p.notes),
                ]}
              />
            ))}
            {builtin.map((p) => (
              <ContactCard
                key={p.id}
                icon={<User className="h-3.5 w-3.5 text-slate-400" />}
                name={p.name}
                meta={p.meta}
                lines={p.lines}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Locations"
        count={backendReady ? locations.length : fallbackLocations.length || undefined}
        notice={!backendReady ? "Showing address fields stored on the Customer record — saved locations need the Customer 360 backend." : undefined}
      >
        {backendReady && locations.length === 0 && fallbackLocations.length === 0 ? (
          <EmptyState compact title="No locations on file." actionLabel="Edit customer" actionTo={c.id ? `/EstimatorCustomers?customer=${c.id}` : "/EstimatorCustomers"} />
        ) : (
          <div className="space-y-2 px-4 py-3">
            {locations.map((l) => (
              <ContactCard
                key={l.id}
                icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />}
                name={locationLabel(l) + (l.is_primary_site ? " (primary)" : "")}
                meta={[clean(l.site_type).replace(/_/g, " "), l.is_billing_address ? "billing" : ""].filter(Boolean).join(" · ")}
                lines={[locationLine(l), clean(l.notes)]}
              />
            ))}
            {fallbackLocations.map((l) => (
              <ContactCard
                key={l.id}
                icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />}
                name={l.label}
                lines={[l.line]}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

