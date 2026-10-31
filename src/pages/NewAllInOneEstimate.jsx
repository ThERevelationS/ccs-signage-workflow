import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import AioEstimateHeader from "@/components/estimator/aio/AioEstimateHeader";
import AioStepRail from "@/components/estimator/aio/AioStepRail";
import Step1EstimateDetails from "@/components/estimator/aio/Step1EstimateDetails";
import { loadAllCustomers, upsertCustomerFromEstimate, syncEstimateToPipeline } from "@/components/estimator/customerSync";
import { loadQuoteDefaults, quoteDefaultsPayload } from "@/components/estimator/quoteDefaults";
import { addRecentCustomerId, loadRecentCustomerIds, resolveRecentCustomers, saveRecentCustomerIds } from "@/components/estimator/recentCustomerHistory";
import { ensureNewEstimate, newEstimateCreationKey } from "@/components/estimator/estimateCreationService";
import { ensureEstimateCustomerLocation } from "@/components/estimator/customerLocationService";
import { expectedEstimateFields, replaceEstimateFieldsIfUnchanged } from "@/components/estimator/estimatePersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAuthorizedUserDirectory } from "@/components/user/authorizedUserDirectoryPersistence";

const TERMS_OPTIONS = ["Due on Receipt", "Net 15", "Net 30", "Net 60", "50% Deposit"];
const SALES_CENTERS = ["Cincinnati Custom Signs"];

// Header-level fields copied when the user picks a "duplicate from" source
// estimate. Every key is a real AllInOneEstimate schema field. Some are not
// rendered by Step 1 (site_address, payment_terms, quote_valid_days,
// deposit_percent, scope_*, hide_section_prices, company_*) â€” they still ride
// through handleSave's `...form` spread into the created estimate. Schema has
// no separate tax group id: tax_group is the TaxGroup name and pairs with
// tax_percent.
// Identity fields (project_name, estimate_number, po_number) and the
// line_items sections are intentionally NOT copied: each new estimate keeps
// its own description/number/PO and starts with no sections.
const DUPLICATE_PREFILL_FIELDS = [
  "customer_id",
  "client_name",
  "order_contact",
  "contact_name",
  "contact_email",
  "contact_phone",
  "office_phone",
  "office_phone_ext",
  "site_address",
  "terms",
  "payment_terms",
  "quote_valid_days",
  "deposit_percent",
  "tax_group",
  "tax_percent",
  "scope_inclusions",
  "scope_exclusions",
  "hide_section_prices",
  "company_name",
  "company_email",
  "company_phone",
  "company_address",
  "company_website",
  "company_license",
  "company_logo_url",
  "salesperson",
  "sales_center",
  "pricing_tier",
  "volume_discount_tiers",
];

const EMPTY = {
  client_name: "",
  project_name: "",
  po_number: "",
  terms: "",
  estimate_number: "",
  order_contact: "",
  contact_email: "",
  office_phone: "",
  office_phone_ext: "",
  salesperson: "",
  sales_center: SALES_CENTERS[0],
  tax_group: "",
  tax_percent: 0,
};

export default function NewAllInOneEstimate() {
  const navigate = useNavigate();
  const { sessionToken, currentUser } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [customers, setCustomers] = useState([]);
  const [recentCustomerIds, setRecentCustomerIds] = useState(() => loadRecentCustomerIds());
  const recentCustomers = resolveRecentCustomers(customers, recentCustomerIds);
  const rememberCustomer = (customer) => {
    const next = addRecentCustomerId(recentCustomerIds, customer?.id);
    setRecentCustomerIds(next);
    saveRecentCustomerIds(next);
  };
  const [taxGroups, setTaxGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveSiteAsLocation, setSaveSiteAsLocation] = useState(false);
  const savingRef = useRef(false);
  const createAttemptRef = useRef({ signature: "", key: "" });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [dupSources, setDupSources] = useState([]);
  const [dupQuery, setDupQuery] = useState("");
  const [dupOpen, setDupOpen] = useState(false);
  const [dupSource, setDupSource] = useState(null);

  useEffect(() => {
    loadAllCustomers().then((r) => {
      const rows = r || [];
      setCustomers(rows);
      try {
        const want = new URLSearchParams(window.location.search).get("customer");
        const match = want && rows.find((c) => String(c.id) === String(want));
        if (match) setForm((f) => ({ ...f, customer_id: match.id, client_name: match.company_name || f.client_name }));
      } catch {}
    }).catch((err) => setError(err?.message || "Customers could not be loaded."));
    loadAllEntityRows({ entity: staffEntities.TaxGroup, sort: null, label: "New Estimate tax groups" }).then((r) => setTaxGroups(r || [])).catch((err) => setError(err?.message || "Tax groups could not be loaded."));
    loadAllEntityRows({ entity: staffEntities.AllInOneEstimate, sort: "-created_date", label: "New Estimate duplicate sources" }).then((r) => setDupSources(r || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionToken) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    loadAuthorizedUserDirectory({ sessionToken })
      .then((d) => { if (!cancelled) setUsers(d.users || []); })
      .catch(() => { if (!cancelled) setUsers([]); });
    return () => { cancelled = true; };
  }, [sessionToken]);

  const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));

  const dupQueryNorm = dupQuery.trim().toLowerCase();
  const dupMatches = dupSources
    .filter((e) =>
      e?.deleted !== true &&
      (!dupQueryNorm ||
      String(e.estimate_number || "").toLowerCase().includes(dupQueryNorm) ||
      String(e.client_name || "").toLowerCase().includes(dupQueryNorm) ||
      String(e.project_name || "").toLowerCase().includes(dupQueryNorm))
    )
    .slice(0, 20);

  const applyDuplicateSource = (src) => {
    const changes = {};
    DUPLICATE_PREFILL_FIELDS.forEach((f) => {
      if (src[f] !== undefined && src[f] !== null) changes[f] = src[f];
    });
    setForm((prev) => ({ ...prev, ...changes }));
    setDupSource(src);
    setDupQuery("");
    setDupOpen(false);
  };

  const resetDuplicateSource = () => {
    setForm(EMPTY);
    setDupSource(null);
    setDupQuery("");
    setDupOpen(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke("generateDocNumber", { doc_type: "estimate", session_token: sessionToken });
      if (res?.data?.number) patch({ estimate_number: res.data.number });
    } catch (e) {
      setError(e.message || "Could not generate an estimate number.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    setError("");
    const clientName = form.client_name.trim();
    const description = form.project_name.trim();
    if (!description) {
      setError("Estimate description is required.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const createSignature = JSON.stringify({
        ...form,
        client_name: clientName,
        project_name: description,
      });
      if (createAttemptRef.current.signature !== createSignature) {
        createAttemptRef.current = {
          signature: createSignature,
          key: newEstimateCreationKey(),
        };
      }

      let customer = null;
      if (clientName) {
        customer = await upsertCustomerFromEstimate(
          { ...form, client_name: clientName },
          customers,
          { sessionToken }
        );
      }

      const quoteDefaults = await loadQuoteDefaults();
      const estimate = await ensureNewEstimate({
        creationKey: createAttemptRef.current.key,
        sessionToken,
        estimate: {
          ...quoteDefaultsPayload(quoteDefaults || {}),
          ...form,
          client_name: clientName,
          project_name: description,
          customer_id: customer?.id || null,
          status: "draft",
        },
      });
      if (saveSiteAsLocation && customer?.id && String(form.site_address || "").trim()) {
        try {
          await ensureEstimateCustomerLocation({
            entity: staffEntities.CustomerLocation,
            customerId: customer.id,
            siteAddress: form.site_address,
            estimateId: estimate.id,
          });
        } catch (locationError) {
          window.alert(`Estimate was created, but its Customer location could not be saved: ${locationError?.message || "unknown error"}`);
        }
      }
      if (customer) {
        try {
          await syncEstimateToPipeline(estimate, customer, { sessionToken });
        } catch (syncError) {
          const syncMessage = syncError?.message || "Sales Pipeline synchronization failed.";
          let recoveryFlagSaved = false;
          try {
            const recoveryPatch = {
              pipeline_sync_pending: true,
              pipeline_sync_error: syncMessage,
            };
            await replaceEstimateFieldsIfUnchanged({
              entity: staffEntities.AllInOneEstimate,
              estimateId: estimate.id,
              expectedFields: expectedEstimateFields(estimate, recoveryPatch),
              nextFields: recoveryPatch,
              label: "New Estimate pipeline recovery marker",
            });
            recoveryFlagSaved = true;
          } catch (flagError) {
            console.error("New estimate pipeline recovery flag could not be saved:", flagError);
          }

          window.alert(
            recoveryFlagSaved
              ? `Estimate ${estimate.estimate_number ? `#${estimate.estimate_number} ` : ""}was created successfully, but Sales Pipeline synchronization did not complete. The estimate has been marked Sync Issue; open Finalize Estimate and use Retry Pipeline Sync.`
              : `Estimate ${estimate.estimate_number ? `#${estimate.estimate_number} ` : ""}was created successfully, but Sales Pipeline synchronization did not complete and the recovery flag could not be saved. The created estimate will be opened now so it is not duplicated. Error: ${syncMessage}`
          );
          navigate(`/EstimateDetail?id=${estimate.id}`);
          return;
        }
      }
      navigate(`/EstimateDetail?id=${estimate.id}`);
    } catch (e) {
      savingRef.current = false;
      setError(e.message || "Could not save the estimate.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <AioEstimateHeader quoteTotal={0} onSave={handleSave} saving={saving} />

      <div className="flex gap-3 px-3 pb-6">
        <AioStepRail
          activeStep={1}
          estimateNumber={form.estimate_number}
          clientName={form.client_name}
          description={form.project_name}
          taxPercent={form.tax_percent}
          onSaveProgress={handleSave}
          saving={saving}
        />

        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-200 rounded-md px-3 py-2 mb-2 max-w-4xl">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-700 whitespace-nowrap">Duplicate from existingâ€¦</span>
              <div className="relative flex-1">
                {dupSources.some((e) => e?.is_template === true && e?.deleted !== true) && (
                  <div className="flex flex-wrap items-center gap-1 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1">Templates</span>
                    {dupSources.filter((e) => e?.is_template === true && e?.deleted !== true).slice(0, 8).map((t) => (
                      <button key={t.id} type="button" onClick={() => applyDuplicateSource(t)} className="h-6 px-2 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-semibold hover:border-indigo-300">
                        {t.project_name || `#${t.estimate_number || "â€”"}`}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={dupQuery}
                  onChange={(e) => {
                    setDupQuery(e.target.value);
                    setDupOpen(true);
                  }}
                  onFocus={() => setDupOpen(true)}
                  onBlur={() => setTimeout(() => setDupOpen(false), 150)}
                  placeholder="Search estimate #, customer, or description"
                  className="w-full h-7 px-2 border border-slate-300 bg-white rounded-sm text-[12px] focus:outline-none focus:border-lime-500"
                />
                {dupOpen && (
                  <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-auto bg-white border border-slate-300 rounded-sm shadow-md">
                    {dupMatches.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-slate-400">No matching estimates</div>
                    ) : (
                      dupMatches.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            applyDuplicateSource(e);
                          }}
                          className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-lime-50 border-b border-slate-100 last:border-0"
                        >
                          <span className="font-semibold text-gray-800">#{e.estimate_number || "â€”"}</span>
                          <span className="text-slate-600"> Â· {e.client_name || "No customer"}</span>
                          <span className="text-slate-400"> Â· {e.project_name || ""}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {(dupSource || dupQuery) && (
                <button
                  type="button"
                  onClick={resetDuplicateSource}
                  className="h-[24px] px-2 border border-gray-300 rounded-sm text-[11px] text-gray-600 hover:bg-gray-50"
                >
                  Start blank
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Prefills customer &amp; quote settings â€” sections are not copied.
              {dupSource && (
                <span className="text-slate-500">
                  {" "}Source: #{dupSource.estimate_number || "â€”"}
                  {dupSource.client_name ? ` â€” ${dupSource.client_name}` : ""}
                </span>
              )}
            </p>
          </div>

          {error && (
            <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-[12px] text-red-700">
              {error}
            </div>
          )}
          <Step1EstimateDetails
            form={form}
            patch={patch}
            customers={customers}
            recentCustomers={recentCustomers}
            onCustomerSelected={rememberCustomer}
            taxGroups={taxGroups}
            users={users}
            termsOptions={TERMS_OPTIONS}
            salesCenters={SALES_CENTERS}
            onGenerateNumber={handleGenerate}
            generating={generating}
            enteredBy={currentUser?.full_name || currentUser?.email}
            onCustomerCreated={(c) => setCustomers((prev) => [c, ...prev])}
            saveSiteAsLocation={saveSiteAsLocation}
            onSaveSiteAsLocationChange={setSaveSiteAsLocation}
          />
          <div className="flex justify-end mt-3">
            <button type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-[30px] px-4 rounded bg-lime-200 border border-lime-300 text-[13px] font-semibold text-gray-800 disabled:opacity-60"
            >
              Next Step â†’
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}