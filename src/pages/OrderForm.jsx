import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import MobileSelect from "@/components/mobile/MobileSelect";
import {
  ClipboardList,
  Search,
  Plus,
  Download,
  Save,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock3,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "@/components/auth/EmailGate";
import OrderSpreadsheet from "@/components/orders/OrderSpreadsheet";
import OrderIndependentPullEvidence from "@/components/orders/OrderIndependentPullEvidence";
import { canUseOrderExport } from "@/shared/orderExportAccess.mjs";
import { orderSaveSyncStatus } from "@/components/orders/orderSaveSyncStatus.mjs";

export default function OrderForm() {
  const { currentUser, isRegistered, sessionToken } = useAuth();
  
  // Show outstanding Orders and a visibly separate received history by default.
  const [filterStatus, setFilterStatus] = useState("all_with_received");
  const [searchTerm, setSearchTerm] = useState("");
  const canOrderExport = canUseOrderExport(currentUser);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ hasUnsavedChanges: false, customerDraftActive: false, isSaving: false, isSyncing: false, isLoading: true, pendingSyncCount: 0, saveError: "", readError: "" });
  const spreadsheetRef = useRef(null);
  const hasLocalOrderChanges = saveStatus.hasUnsavedChanges || saveStatus.pendingSyncCount > 0;
  const saveSyncIndicator = orderSaveSyncStatus(saveStatus);
  const SaveSyncIcon = saveSyncIndicator.kind === "working" ? Loader2
    : saveSyncIndicator.kind === "success" || saveSyncIndicator.kind === "ready" ? CheckCircle2
      : saveSyncIndicator.kind === "error" ? AlertTriangle : Clock3;
  const saveSyncIndicatorClass = saveSyncIndicator.kind === "error"
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
    : saveSyncIndicator.kind === "pending" || saveSyncIndicator.kind === "unsaved" || saveSyncIndicator.kind === "local"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
      : saveSyncIndicator.kind === "working"
        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    // The Order Form filter persists on the signed-in user's AuthorizedEmail
    // record and arrives with the verified session payload.
    const saved = currentUser?.order_form_filter;
    if (saved) {
      // Migrate the former default (not_received) and legacy all view to the
      // new split default. A new open_only value preserves future explicit
      // Not Received Only selections.
      setFilterStatus(["all", "not_received"].includes(saved) ? "all_with_received" : saved);
    }
  }, [currentUser?.order_form_filter]);

  const handleFilterChange = async (value) => {
    setFilterStatus(value);
    if (currentUser?.email && sessionToken) {
      try {
        const response = await base44.functions.invoke('manageOwnProfile', {
          action: 'update_order_form_filter',
          session_token: sessionToken,
          order_form_filter: value,
        });
        const data = response?.data || response;
        if (!data?.success || data?.order_form_filter !== value) {
          throw new Error(data?.error || 'The Order filter preference could not be verified.');
        }
      } catch (e) {
        console.error("Error saving filter preference:", e);
      }
    }
  };

  return (
    <PullToRefresh onRefresh={() => spreadsheetRef.current?.refreshOrders?.()}>
    <div className="min-h-full p-4 pb-20 sm:p-6 flex flex-col">
      <div className="w-full min-w-0 flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="clay-card p-3">
            <ClipboardList className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Order Form</h1>
            <p className="text-gray-600 text-sm">Manage material orders</p>
          </div>
        </div>

        <OrderIndependentPullEvidence currentUser={currentUser} sessionToken={sessionToken} />

        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <MobileSelect
              value={filterStatus}
              onValueChange={handleFilterChange}
              title="Show orders"
              triggerClassName="w-44"
            >
              <SelectItem value="all_with_received">All Orders + History</SelectItem>
              <SelectItem value="open_only">Not Received Only</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="received">Received</SelectItem>
            </MobileSelect>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isRegistered && (
              <Button
                onClick={() => hasLocalOrderChanges
                  ? spreadsheetRef.current?.saveAndSync?.()
                  : spreadsheetRef.current?.pullFromSmartsheet?.()}
                size="sm"
                className="h-8 px-3"
                disabled={saveStatus.customerDraftActive || saveStatus.isSaving || saveStatus.isSyncing || saveStatus.isLoading || Boolean(saveStatus.readError)}
                title={saveStatus.customerDraftActive ? "Finish editing the customer name or selecting an active job before saving or syncing." : saveStatus.readError ? "Reload Orders successfully before saving or syncing." : hasLocalOrderChanges ? "Save local Order changes and push them to Smartsheet" : "Check Smartsheet and pull changed Orders into this app"}
              >
                {saveStatus.isSaving || saveStatus.isSyncing
                  ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  : hasLocalOrderChanges ? <Save className="w-4 h-4 mr-1" />
                    : <RefreshCw className="w-4 h-4 mr-1" />}
                {saveStatus.isPulling ? "Checking Smartsheet..."
                  : saveStatus.isSyncing ? "Syncing..."
                    : saveStatus.isSaving ? "Saving..."
                      : saveStatus.customerDraftActive ? "Finish Customer Edit"
                        : hasLocalOrderChanges ? "Save & Sync" : "Sync"}
              </Button>
            )}
            {isRegistered && (
              <span
                className={`inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${saveSyncIndicatorClass}`}
                title={saveSyncIndicator.title}
                aria-live="polite"
                aria-label={`Order save and sync status: ${saveSyncIndicator.text}`}
              >
                <SaveSyncIcon className={`h-3.5 w-3.5 shrink-0 ${saveSyncIndicator.kind === "working" ? "animate-spin" : ""}`} />
                <span className="truncate">{saveSyncIndicator.text}</span>
              </span>
            )}
            {isRegistered && (
              <Button 
                onClick={() => spreadsheetRef.current?.addNewRow()}
                size="sm" 
                className="h-8 px-3"
                variant="ghost"
                disabled={saveStatus.isSyncing || saveStatus.isSaving || saveStatus.isLoading || Boolean(saveStatus.readError)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            )}
            
            {canOrderExport && (
              <Button 
                onClick={() => spreadsheetRef.current?.exportToExcel()}
                disabled={saveStatus.isLoading || Boolean(saveStatus.readError)}
                size="sm" 
                className="h-8 px-3"
                variant="ghost"
              >
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
            )}
          </div>
        </div>

        {(saveStatus.saveError ||
          (saveStatus.lastSyncDirection === 'pull' && saveStatus.syncMessage)) && (
          <div
            role={saveStatus.saveError ? 'alert' : 'status'}
            aria-live="polite"
            className={`mb-3 min-w-0 max-w-full break-words rounded-md border px-3 py-2 text-sm md:hidden ${saveStatus.saveError
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-blue-200 bg-blue-50 text-blue-800'}`}
          >
            {saveStatus.saveError || saveStatus.syncMessage}
            {saveStatus.saveError && saveStatus.hasUnsavedChanges && (
              <div className="mt-1 font-medium">Unsaved edits are protected. Review them, then use Save & Sync. Do not reload the page to resolve this error.</div>
            )}
          </div>
        )}

        <OrderSpreadsheet 
          ref={spreadsheetRef}
          searchTerm={searchTerm} 
          filterStatus={filterStatus}
          showButtonsInline={false}
          canOrderExport={canOrderExport}
          onSaveStatusChange={setSaveStatus}
        />
      </div>
    </div>
    </PullToRefresh>
  );
}