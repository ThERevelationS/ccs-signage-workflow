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
  Save
} from "lucide-react";
import { useAuth } from "@/components/auth/EmailGate";
import OrderSpreadsheet from "@/components/orders/OrderSpreadsheet";
import { canUseOrderExport } from "../../base44/shared/orderExportAccess.mjs";

export default function OrderForm() {
  const { currentUser, isRegistered } = useAuth();
  
  // Show outstanding Orders and a visibly separate received history by default.
  const [filterStatus, setFilterStatus] = useState("all_with_received");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLoaded, setFilterLoaded] = useState(false);
  const canOrderExport = canUseOrderExport(currentUser);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ hasUnsavedChanges: false, isSaving: false, isSyncing: false, pendingSyncCount: 0 });
  const spreadsheetRef = useRef(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const loadSavedFilter = async () => {
      if (currentUser?.email) {
        try {
          const me = await base44.auth.me();
          if (me?.order_form_filter) {
            // Migrate the former default (not_received) and legacy all view
            // to the new split default. A new open_only value preserves future
            // explicit Not Received Only selections.
            setFilterStatus(["all", "not_received"].includes(me.order_form_filter)
              ? "all_with_received" : me.order_form_filter);
          }
        } catch (e) {
          // User might not have this field yet
        }
      }
      setFilterLoaded(true);
    };
    loadSavedFilter();
  }, [currentUser?.email]);

  const handleFilterChange = async (value) => {
    setFilterStatus(value);
    if (currentUser?.email) {
      try {
        await base44.auth.updateMe({ order_form_filter: value });
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
                onClick={() => spreadsheetRef.current?.saveAndSync?.()}
                size="sm"
                className="h-8 px-3"
                disabled={saveStatus.isSaving || saveStatus.isSyncing}
              >
                <Save className="w-4 h-4 mr-1" />
                {saveStatus.isSyncing ? "Syncing..." : saveStatus.isSaving ? "Saving..." : "Save & Sync"}
                {saveStatus.pendingSyncCount > 0 && !saveStatus.isSaving && !saveStatus.isSyncing
                  ? ` (${saveStatus.pendingSyncCount})`
                  : ""}
              </Button>
            )}
            {isRegistered && (
              <Button 
                onClick={() => spreadsheetRef.current?.addNewRow()}
                size="sm" 
                className="h-8 px-3"
                variant="ghost"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            )}
            
            {canOrderExport && (
              <Button 
                onClick={() => spreadsheetRef.current?.exportToExcel()}
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