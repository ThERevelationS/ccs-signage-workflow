import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AioEstimateHeader from "@/components/estimator/aio/AioEstimateHeader";
import AioStepRail from "@/components/estimator/aio/AioStepRail";
import Step1EstimateDetails from "@/components/estimator/aio/Step1EstimateDetails";
import { upsertCustomerFromEstimate, syncEstimateToPipeline } from "@/components/estimator/customerSync";
import { loadQuoteDefaults, quoteDefaultsPayload } from "@/components/estimator/quoteDefaults";

const TERMS_OPTIONS = ["Due on Receipt", "Net 15", "Net 30", "Net 60", "50% Deposit"];
const SALES_CENTERS = ["Cincinnati Custom Signs"];

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
  const [form, setForm] = useState(EMPTY);
  const [customers, setCustomers] = useState([]);
  const [taxGroups, setTaxGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.entities.Customer.list("company_name", 500).then((r) => setCustomers(r || []));
    base44.entities.TaxGroup.list().then((r) => setTaxGroups(r || []));
    base44.entities.User.list().then((r) => setUsers(r || []));
    base44.auth.me().then(setMe).catch(() => {});
  }, []);

  const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke("generateDocNumber", { doc_type: "estimate" });
      if (res?.data?.number) patch({ estimate_number: res.data.number });
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
      let customer = null;
      if (clientName) {
        customer = await upsertCustomerFromEstimate(
          { ...form, client_name: clientName },
          customers
        );
      }

      const quoteDefaults = await loadQuoteDefaults();
      const estimate = await base44.entities.AllInOneEstimate.create({
        ...quoteDefaultsPayload(quoteDefaults || {}),
        ...form,
        client_name: clientName,
        project_name: description,
        customer_id: customer?.id || null,
        status: "draft",
      });
      if (customer) {
        try {
          await syncEstimateToPipeline(estimate, customer);
        } catch (syncError) {
          const syncMessage = syncError?.message || "Sales Pipeline synchronization failed.";
          let recoveryFlagSaved = false;
          try {
            await base44.entities.AllInOneEstimate.update(estimate.id, {
              pipeline_sync_pending: true,
              pipeline_sync_error: syncMessage,
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
          {error && (
            <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-[12px] text-red-700">
              {error}
            </div>
          )}
          <Step1EstimateDetails
            form={form}
            patch={patch}
            customers={customers}
            taxGroups={taxGroups}
            users={users}
            termsOptions={TERMS_OPTIONS}
            salesCenters={SALES_CENTERS}
            onGenerateNumber={handleGenerate}
            generating={generating}
            enteredBy={me?.full_name || me?.email}
            onCustomerCreated={(c) => setCustomers((prev) => [c, ...prev])}
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-[30px] px-4 rounded bg-lime-200 border border-lime-300 text-[13px] font-semibold text-gray-800 disabled:opacity-60"
            >
              Next Step →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}