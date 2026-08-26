import React, { useState } from "react";
import { Search, Plus, Sparkles } from "lucide-react";
import CustomerSearchDialog from "./CustomerSearchDialog";
import NewCustomerDialog from "./NewCustomerDialog";

const Row = ({ label, hint, children }) => (
  <div className="flex items-center gap-2 mb-2">
    <label className="w-[130px] text-right text-[12px] text-gray-600 flex-shrink-0">
      {label}: {hint && <span className="text-gray-300">ⓘ</span>}
    </label>
    <div className="flex-1 flex items-center gap-1">{children}</div>
  </div>
);

const inputCls =
  "w-full h-[26px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400";

export default function Step1EstimateDetails({
  form,
  patch,
  customers,
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

  const applyCustomer = (c) => {
    patch({
      client_name: c.company_name || "",
      customer_id: c.id,
      contact_email: c.contact_email || form.contact_email,
      office_phone: c.contact_office_phone || c.company_phone || form.office_phone,
      office_phone_ext: c.contact_office_ext || form.office_phone_ext,
      terms: c.terms || form.terms,
      order_contact:
        `${c.contact_first_name || ""} ${c.contact_last_name || ""}`.trim() || form.order_contact,
    });
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="bg-white border border-gray-200 rounded-md px-4 py-2 flex items-center justify-between mb-1">
        <h2 className="text-[13px] font-bold text-gray-800">Step 1: Estimate Details</h2>
        <button className="h-[26px] px-3 rounded bg-lime-200 border border-lime-300 text-[12px] font-semibold text-gray-800">
          Next Step →
        </button>
      </div>
      <div className="text-right text-[10px] italic text-gray-400 mb-2">
        Entered by: {enteredBy || "—"}
      </div>

      <div className="bg-white border border-gray-200 rounded-md p-4 mb-3 max-w-[640px] mx-auto">
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
            className="flex-shrink-0 text-gray-400 hover:text-red-600"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            title="New customer"
            className="flex-shrink-0 text-gray-400 hover:text-red-600"
          >
            <Plus className="w-4 h-4" />
          </button>
        </Row>

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

      <div className="bg-white border border-gray-200 rounded-md p-4 max-w-[640px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 md:divide-x divide-gray-200">
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
                const g = taxGroups.find((t) => t.name === e.target.value);
                patch({ tax_group: e.target.value, tax_percent: g?.tax_percent || 0 });
              }}
              className={inputCls}
            >
              <option value="">select</option>
              {taxGroups.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.tax_percent}%)
                </option>
              ))}
            </select>
          </Row>
          <p className="text-[10px] text-gray-400 text-center mt-1">
            Tax applied to this estimate: {Number(form.tax_percent || 0)}%
          </p>
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