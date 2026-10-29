import React, { useEffect, useState } from "react";
import { Search, Plus, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import CustomerSearchDialog from "./CustomerSearchDialog";
import NewCustomerDialog from "./NewCustomerDialog";

const Row = ({ label, hint, children }) => (
  <div className="flex items-center gap-2 mb-2">
    <label className="w-36 text-right text-xs text-slate-700 flex-shrink-0">
      {label}: {hint && <span className="text-blue-500">â“˜</span>}
    </label>
    <div className="flex-1 flex items-center gap-1">{children}</div>
  </div>
);

const inputCls =
  "w-full h-8 px-2 border border-slate-300 bg-white rounded-sm text-sm focus:outline-none focus:border-lime-500";

const pickerCls =
  "w-[104px] h-8 px-1 border border-slate-300 bg-white rounded-sm text-[12px] flex-shrink-0 focus:outline-none focus:border-lime-500";

const joinAddress = (line1, line2, city, state, postal) =>
  [line1, line2, city, [state, postal].map((p) => String(p || "").trim()).filter(Boolean).join(" ")]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(", ");

export default function Step1EstimateDetails({
  form,
  patch,
  customers,
  recentCustomers = [],
  onCustomerSelected,
  saveSiteAsLocation = false,
  onSaveSiteAsLocationChange,
  taxGroups,
  users,
  termsOptions,
  salesCenters,
  onGenerateNumber,
  generating,
  enteredBy,
  onCustomerCreated,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [entityLocations, setEntityLocations] = useState([]);
  const [entityContacts, setEntityContacts] = useState([]);
  const [entityFlags, setEntityFlags] = useState([]);

  const linkedCustomer = customers.find((c) => c.id === form.customer_id) || null;

  useEffect(() => {
    if (!form.customer_id) {
      setEntityLocations([]);
      setEntityContacts([]);
      return;
    }
    let active = true;
    const load = (entity) =>
      entity && typeof entity.filter === "function"
        ? entity.filter({ customer_id: form.customer_id }).catch(() => [])
        : Promise.resolve([]);
    Promise.all([load(base44.entities?.CustomerLocation), load(base44.entities?.CustomerContact), load(staffEntities?.CustomerNote)]).then(
      ([locations, contacts, notes]) => {
        if (!active) return;
        setEntityLocations(locations || []);
        setEntityContacts(contacts || []);
        setEntityFlags((notes || []).filter((n) => n?.kind === "flag" && n?.deleted !== true));
      }
    );
    return () => {
      active = false;
    };
  }, [form.customer_id]);

  const applyCustomer = (c) => {
    const taxGroupName = (g) => g?.group_name || g?.name || "";
    const defaultTaxGroup = taxGroups.find((group) => taxGroupName(group) === c.default_tax_group);
    const defaultTaxPercent = Number(defaultTaxGroup?.tax_percent);
    const taxDefaults = defaultTaxGroup && Number.isFinite(defaultTaxPercent) && defaultTaxPercent >= 0 && defaultTaxPercent <= 100
      ? { tax_group: taxGroupName(defaultTaxGroup), tax_percent: defaultTaxPercent }
      : {};
    const customerValidDays = Number(c.quote_valid_days);
    const validDaysDefault = Number.isFinite(customerValidDays) && customerValidDays > 0
      ? { quote_valid_days: Math.floor(customerValidDays) }
      : {};
    patch({
      client_name: c.company_name || "",
      customer_id: c.id,
      contact_email: c.contact_email || form.contact_email,
      office_phone: c.contact_office_phone || c.company_phone || form.office_phone,
      office_phone_ext: c.contact_office_ext || form.office_phone_ext,
      terms: c.terms || form.terms,
      pricing_tier: Number(c.pricing_tier) || form.pricing_tier || 1,
      salesperson: c.salesperson || form.salesperson,
      ...taxDefaults,
      ...validDaysDefault,
      order_contact:
        `${c.contact_first_name || ""} ${c.contact_last_name || ""}`.trim() || form.order_contact,
    });
    onCustomerSelected?.(c);
  };

  const locationOptions = (() => {
    const options = [];
    const seen = new Set();
    const push = (label, value) => {
      const v = String(value || "").trim();
      if (!v || seen.has(v.toLowerCase())) return;
      seen.add(v.toLowerCase());
      options.push({ key: options.length, label: label ? `${label}: ${v}` : v, value: v });
    };
    if (linkedCustomer) {
      push(
        "Site",
        joinAddress(
          linkedCustomer.location_address_1,
          linkedCustomer.location_address_2,
          linkedCustomer.location_city,
          linkedCustomer.location_state,
          linkedCustomer.location_postal_code
        )
      );
      push(
        "Billing",
        joinAddress(
          linkedCustomer.billing_address_1,
          linkedCustomer.billing_address_2,
          linkedCustomer.billing_city,
          linkedCustomer.billing_state,
          [linkedCustomer.billing_postal_code, linkedCustomer.billing_postal_ext]
            .filter(Boolean)
            .join("-")
        )
      );
    }
    (entityLocations || []).forEach((l) => {
      if (l?.is_active === false) return;
      push(l?.label, joinAddress(l?.address_line_1, l?.address_line_2, l?.city, l?.state, l?.postal_code));
    });
    return options;
  })();

  const contactOptions = (() => {
    const options = [];
    const seen = new Set();
    const push = (c) => {
      const name = String(c?.name || "").trim();
      if (!name) return;
      const dedupeKey = `${name.toLowerCase()}|${String(c?.email || "").trim().toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      options.push({
        ...c,
        key: options.length,
        name,
        label: c?.position ? `${name} (${c.position})` : name,
      });
    };
    if (linkedCustomer) {
      push({
        name: `${linkedCustomer.contact_first_name || ""} ${linkedCustomer.contact_last_name || ""}`.trim(),
        email: linkedCustomer.contact_email,
        phone: linkedCustomer.contact_office_phone || linkedCustomer.contact_cell_phone,
        ext: linkedCustomer.contact_office_ext,
        position: linkedCustomer.contact_position,
      });
      (linkedCustomer.additional_contacts || []).forEach((ac) => {
        if (ac?.is_active === false) return;
        push({
          name: `${ac?.first_name || ""} ${ac?.last_name || ""}`.trim(),
          email: ac?.email,
          phone: ac?.office_phone || ac?.cell_phone,
          ext: ac?.office_ext,
          position: ac?.position,
        });
      });
    }
    (entityContacts || []).forEach((sc) => {
      if (sc?.is_active === false) return;
      push({
        name: sc.display_name || `${sc.first_name || ""} ${sc.last_name || ""}`.trim(),
        email: sc.email,
        phone: sc.phone || sc.mobile_phone,
        ext: sc.phone_ext,
        position: sc.position,
      });
    });
    return options;
  })();

  const applySavedLocation = (key) => {
    const option = locationOptions.find((o) => String(o.key) === key);
    if (option) patch({ site_address: option.value });
  };

  const applySavedContact = (key) => {
    const c = contactOptions.find((o) => String(o.key) === key);
    if (!c) return;
    patch({
      contact_name: c.name,
      order_contact: c.name,
      contact_email: c.email || form.contact_email,
      contact_phone: c.phone || form.contact_phone,
      office_phone: c.phone || form.office_phone,
      office_phone_ext: c.ext || form.office_phone_ext,
    });
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="bg-white border border-gray-200 rounded-md px-4 py-2 flex items-center justify-between mb-1">
        <h2 className="text-[13px] font-bold text-gray-800">Step 1: Estimate Details</h2>
        <button className="h-[26px] px-3 rounded bg-lime-200 border border-lime-300 text-[12px] font-semibold text-gray-800">
          Next Step â†’
        </button>
      </div>
      <div className="text-right text-[11px] italic text-slate-500 mb-2">
        Entered by: {enteredBy || "â€”"}
      </div>

      <div className="bg-slate-100 border border-slate-300 rounded-sm p-4 mb-3 max-w-4xl">
        <Row label="Customer">
          <input
            list="aio-customers"
            value={form.client_name}
            onChange={(e) => patch({ client_name: e.target.value })}
            placeholder="Customer / company name"
            className={inputCls}
          />
          <datalist id="aio-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.company_name} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search customers"
            className="flex-shrink-0 text-lime-600 hover:text-lime-700"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            title="New customer"
            className="flex-shrink-0 text-lime-600 hover:text-lime-700"
          >
            <Plus className="w-4 h-4" />
          </button>
          {linkedCustomer?.credit_hold === true && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
              CREDIT HOLD â€” new work needs a deposit or manager override
            </span>
          )}
          {entityFlags.map((flag) => {
            const styles = {
              red: "bg-red-100 text-red-700 border-red-200",
              amber: "bg-amber-100 text-amber-800 border-amber-200",
              blue: "bg-blue-100 text-blue-700 border-blue-200",
              green: "bg-emerald-100 text-emerald-700 border-emerald-200",
            };
            return (
              <span key={flag.id || flag.text} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${styles[flag.flag_color] || styles.amber}`}>
                {flag.text}
              </span>
            );
          })}
        </Row>
        {recentCustomers.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px]" aria-label="Recent customers">
            <span className="mr-1 text-slate-500">Recent:</span>
            {recentCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => applyCustomer(customer)}
                aria-label={`Use recent customer ${customer.company_name}`}
                className="min-h-7 max-w-full truncate rounded-full border border-slate-300 bg-white px-2.5 font-medium text-slate-700 hover:border-lime-500 hover:bg-lime-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500"
              >
                {customer.company_name || customer.contact_email || "Customer"}
              </button>
            ))}
          </div>
        )}

        <Row label="Estimate Description" hint>
          <input
            value={form.project_name}
            onChange={(e) => patch({ project_name: e.target.value })}
            placeholder="What this estimate is for"
            className={inputCls}
          />
        </Row>

        <Row label="PO Number">
          <input
            value={form.po_number}
            onChange={(e) => patch({ po_number: e.target.value })}
            className={inputCls}
          />
        </Row>

        <Row label="Terms">
          <select
            value={form.terms}
            onChange={(e) => patch({ terms: e.target.value })}
            className={inputCls}
          >
            <option value="">select</option>
            {termsOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Estimate #">
          <input
            value={form.estimate_number}
            onChange={(e) => patch({ estimate_number: e.target.value })}
            className={inputCls}
          />
          <button
            onClick={onGenerateNumber}
            disabled={generating}
            className="h-[26px] px-2 border border-gray-300 rounded-sm text-[12px] flex items-center gap-1 whitespace-nowrap hover:bg-gray-50 disabled:opacity-60"
          >
            <Sparkles className="w-3 h-3" /> Generate
          </button>
        </Row>
      </div>

      <div className="bg-slate-100 border border-slate-300 rounded-sm p-4 max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-300">
        <div className="md:pr-4">
          <Row label="Order Contact">
            <select
              value={form.order_contact}
              onChange={(e) => patch({ order_contact: e.target.value })}
              className={inputCls}
            >
              <option value="">select</option>
              {users.map((u) => (
                <option key={u.id} value={u.full_name || u.email}>
                  {u.full_name || u.email}
                </option>
              ))}
            </select>
            {contactOptions.length > 0 && (
              <select
                value=""
                onChange={(e) => applySavedContact(e.target.value)}
                title="Fill contact fields from a saved customer contact"
                className={pickerCls}
              >
                <option value="">Savedâ€¦</option>
                {contactOptions.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </Row>
          <Row label="Contact Email">
            <input
              value={form.contact_email}
              onChange={(e) => patch({ contact_email: e.target.value })}
              className={inputCls}
            />
          </Row>
          <Row label="Office Phone">
            <input
              value={form.office_phone}
              onChange={(e) => patch({ office_phone: e.target.value })}
              className={inputCls}
            />
            <span className="text-[11px] text-gray-500">Ext.</span>
            <input
              value={form.office_phone_ext}
              onChange={(e) => patch({ office_phone_ext: e.target.value })}
              className="w-[52px] h-[26px] px-2 border border-gray-300 rounded-sm text-[12px]"
            />
          </Row>
          <Row label="Site Address">
            <input
              value={form.site_address || ""}
              onChange={(e) => patch({ site_address: e.target.value })}
              placeholder="Install / job site address"
              className={inputCls}
            />
            {locationOptions.length > 0 && (
              <select
                value=""
                onChange={(e) => applySavedLocation(e.target.value)}
                title="Fill site address from a saved customer location"
                className={pickerCls}
              >
                <option value="">Savedâ€¦</option>
                {locationOptions.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
          </Row>
          {form.customer_id && String(form.site_address || "").trim() && (
            <label className="mb-2 flex items-start gap-2 pl-0 text-[11px] text-slate-600 sm:pl-36">
              <input
                type="checkbox"
                checked={saveSiteAsLocation === true}
                onChange={(event) => onSaveSiteAsLocationChange?.(event.target.checked)}
                className="mt-0.5 accent-lime-600"
              />
              <span>Save this address to the customer's locations</span>
            </label>
          )}
        </div>

        <div className="md:pl-4 pt-4 md:pt-0">
          <Row label="Salesperson">
            <select
              value={form.salesperson}
              onChange={(e) => patch({ salesperson: e.target.value })}
              className={inputCls}
            >
              <option value="">select</option>
              {users.map((u) => (
                <option key={u.id} value={u.full_name || u.email}>
                  {u.full_name || u.email}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Sales Center">
            <select
              value={form.sales_center}
              onChange={(e) => patch({ sales_center: e.target.value })}
              className={inputCls}
            >
              {salesCenters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Tax Group">
            <select
              value={form.tax_group}
              onChange={(e) => {
                const g = taxGroups.find((t) => (t.group_name || t.name) === e.target.value);
                patch({ tax_group: e.target.value, tax_percent: g?.tax_percent || 0 });
              }}
              className={inputCls}
            >
              <option value="">select</option>
              {taxGroups.map((t, i) => { const gn = t.group_name || t.name; return (
                <option key={t.id || `tax-group-${gn}-${i}`} value={gn}>
                  {gn} ({t.tax_percent}%)
                </option>
              ); })}
            </select>
          </Row>
          <p className="text-[10px] text-gray-400 text-center mt-1">
            Tax applied to this estimate: {Number(form.tax_percent || 0)}%
          </p>
          <label className="mt-1 flex items-start gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={form.round_quote_total === true}
              onChange={(event) => patch({ round_quote_total: event.target.checked })}
              className="mt-0.5 accent-lime-600"
            />
            <span>Round the quote total to the nearest whole dollar</span>
          </label>
        </div>
      </div>

      <CustomerSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        customers={customers}
        onSelect={applyCustomer}
      />
      <NewCustomerDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(c) => {
          onCustomerCreated?.(c);
          applyCustomer(c);
        }}
      />
    </div>
  );
}