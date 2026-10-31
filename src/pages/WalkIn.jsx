import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { Loader2, Store } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { EmptyState, PageHeader } from "@/components/kit";
import WalkInSale from "@/components/walkin/WalkInSale";

// CoreBridge "on-the-spot checkout" (COREBRIDGE_MAP.md §6): a paid counter sale
// bound to the Walk-in customer that skips estimate → approval → production.
export default function WalkIn() {
  const { currentUser, isRegistered, sessionToken, showLoginDialog } = useAuth();
  const [customers, setCustomers] = useState(null);
  const [taxGroups, setTaxGroups] = useState([]);
  const [quickProducts, setQuickProducts] = useState([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isRegistered) return;
    let live = true;
    loadAllEntityRows({ entity: staffEntities.Customer, sort: "company_name", label: "Walk-in customers" })
      .then((rows) => { if (live) setCustomers(rows || []); })
      .catch((err) => { if (live) setLoadError(err?.message || "Customers could not be loaded."); });
    loadAllEntityRows({ entity: staffEntities.TaxGroup, sort: null, label: "Walk-in tax groups" })
      .then((rows) => { if (live) setTaxGroups(rows || []); })
      .catch(() => { if (live) setTaxGroups([]); });
    loadAllEntityRows({ entity: staffEntities.QuickProduct, sort: "product_name", label: "Walk-in quick products" })
      .then((rows) => { if (live) setQuickProducts((rows || []).filter((p) => p?.is_active !== false)); })
      .catch(() => { if (live) setQuickProducts([]); });
    return () => { live = false; };
  }, [isRegistered]);

  const onCustomersChanged = async (created) => {
    if (created?.id) {
      setCustomers((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.some((c) => c.id === created.id) ? list : [...list, created];
      });
      return;
    }
    try {
      const rows = await loadAllEntityRows({ entity: staffEntities.Customer, sort: "company_name", label: "Walk-in customers" });
      setCustomers(rows || []);
    } catch { /* keep the loaded list */ }
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-3">
        <PageHeader
          className="mb-0 bg-white px-4 py-3"
          breadcrumbs={[{ label: "Tools", to: "/EstimatorTools" }, { label: "Walk-in Sale" }]}
          icon={Store}
          title="Walk-in Sale"
          subtitle="On-the-spot counter checkout — no estimate or approval steps."
        />

        {!isRegistered ? (
          <EmptyState
            icon={Store}
            className="bg-white p-6"
            title="Sign in to ring up a counter sale."
            action={(
              <button
                type="button"
                onClick={showLoginDialog}
                className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold px-4 py-2 rounded"
              >
                Sign in
              </button>
            )}
          />
        ) : customers === null && !loadError ? (
          <div className="bg-white p-6 flex items-center justify-center text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading register…
          </div>
        ) : (
          <WalkInSale
            customers={customers || []}
            taxGroups={taxGroups}
            quickProducts={quickProducts}
            sessionToken={sessionToken}
            actor={currentUser?.email || ""}
            onCustomersChanged={onCustomersChanged}
          />
        )}

        {loadError && (
          <div className="bg-white p-4 rounded-lg border border-red-200 text-xs text-red-700">{loadError}</div>
        )}
      </div>
    </div>
  );
}