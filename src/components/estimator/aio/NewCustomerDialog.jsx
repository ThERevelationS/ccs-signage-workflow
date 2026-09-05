import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ensureNewCustomer, newCustomerCreationKey } from "@/components/estimator/customerCreationService";

const FIELDS = [
  { key: "company_name", label: "Company name *" },
  { key: "company_phone", label: "Company phone" },
  { key: "contact_first_name", label: "Contact first name" },
  { key: "contact_last_name", label: "Contact last name" },
  { key: "contact_email", label: "Contact email" },
  { key: "contact_office_phone", label: "Office phone" },
  { key: "contact_office_ext", label: "Ext." },
  { key: "billing_address_1", label: "Billing address" },
  { key: "billing_city", label: "City" },
  { key: "billing_state", label: "State" },
  { key: "billing_postal_code", label: "Postal code" },
  { key: "terms", label: "Terms" },
];

const EMPTY = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: "" }), {});
const newCustomerState = () => ({ ...EMPTY, pricing_tier: 1 });

export default function NewCustomerDialog({ open, onClose, onCreated }) {
  const [data, setData] = useState(newCustomerState);
  const [tiers, setTiers] = useState([]);
  const [tierLoading, setTierLoading] = useState(false);
  const [tierLoadError, setTierLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const createAttemptRef = useRef({ signature: "", key: "" });

  useEffect(() => {
    if (!open) return;
    let active = true;
    createAttemptRef.current = { signature: "", key: "" };
    setTierLoading(true);
    setTierLoadError("");
    base44.entities.MarkupTier.list("sort_order")
      .then((rows) => {
        if (!active) return;
        const loaded = rows || [];
        setTiers(loaded);
        if (loaded.length) {
          setData((current) => {
            const selected = Number(current.pricing_tier) || 1;
            if (loaded.some((tier) => Number(tier.tier_number) === selected)) return current;
            return { ...current, pricing_tier: Number(loaded[0].tier_number) || 1 };
          });
        }
      })
      .catch((err) => {
        if (!active) return;
        setTiers([]);
        setTierLoadError(err?.message || "Pricing tiers could not be verified.");
      })
      .finally(() => active && setTierLoading(false));
    return () => { active = false; };
  }, [open]);

  const handleSave = async () => {
    if (savingRef.current) return;
    setError("");
    if (!data.company_name.trim()) {
      setError("Company name is required.");
      return;
    }
    if (tierLoading || tierLoadError) {
      setError(tierLoadError || "Pricing tiers are still loading. Try again after they are verified.");
      return;
    }
    if (tiers.length && !tiers.some((tier) => Number(tier.tier_number) === Number(data.pricing_tier))) {
      setError("The selected pricing tier is no longer available. Review the pricing tier before saving this Customer.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const customerData = {
        ...data,
        company_name: data.company_name.trim(),
      };
      const signature = JSON.stringify(customerData);
      if (createAttemptRef.current.signature !== signature) {
        createAttemptRef.current = {
          signature,
          key: newCustomerCreationKey(),
        };
      }
      const created = await ensureNewCustomer({
        creationKey: createAttemptRef.current.key,
        customer: customerData,
      });
      onCreated(created);
      setData(newCustomerState());
      createAttemptRef.current = { signature: "", key: "" };
      onClose();
    } catch (e) {
      setError(e.message || "Could not create the customer.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">New Customer</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-[12px] text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-[11px] text-gray-500">
              {f.label}
              <input
                value={data[f.key]}
                onChange={(e) => setData((p) => ({ ...p, [f.key]: e.target.value }))}
                className="w-full h-[28px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400"
              />
            </label>
          ))}
          <label className="text-[11px] text-gray-500 col-span-2">
            Default pricing tier
            <select
              value={String(Number(data.pricing_tier) || 1)}
              disabled={tierLoading || !!tierLoadError || saving}
              onChange={(event) => setData((current) => ({ ...current, pricing_tier: Number(event.target.value) || 1 }))}
              className="w-full h-[30px] px-2 border border-gray-300 rounded-sm text-[12px] bg-white focus:outline-none focus:border-red-400 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {tierLoading && <option value="1">Loading pricing tiers…</option>}
              {!tierLoading && tierLoadError && <option value="1">Pricing tiers unavailable</option>}
              {!tierLoading && !tierLoadError && tiers.length === 0 && <option value="1">Tier 1 — General Public</option>}
              {!tierLoading && !tierLoadError && tiers.map((tier) => (
                <option key={tier.id} value={String(tier.tier_number)}>
                  Tier {tier.tier_number} — {tier.tier_name}
                </option>
              ))}
            </select>
            {tierLoadError && <span className="block mt-1 text-[9px] text-red-600">Pricing tiers could not be verified: {tierLoadError}</span>}
            <span className="block mt-1 text-[9px] text-gray-400">Used as the default Markup Tier when new estimator Products are priced for this customer.</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="h-[30px] px-3 rounded border border-gray-300 text-[12px] font-semibold text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || tierLoading || !!tierLoadError}
            className="h-[30px] px-4 rounded bg-lime-200 border border-lime-300 text-[12px] font-semibold text-gray-800 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create Customer"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}