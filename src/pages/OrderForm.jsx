import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  ClipboardList,
  Filter,
  Search,
  Download,
  RefreshCw
} from "lucide-react";
import OrderSpreadsheet from "@/components/orders/OrderSpreadsheet";

export default function OrderForm() {
  const { currentUser, isRegistered } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [filterLoaded, setFilterLoaded] = useState(false);

  // Load saved filter preference from user data
  useEffect(() => {
    const loadSavedFilter = async () => {
      if (currentUser?.email) {
        try {
          const me = await base44.auth.me();
          if (me?.order_form_filter) {
            setFilterStatus(me.order_form_filter);
          }
        } catch (e) {
          // User might not have this field yet
        }
      }
      setFilterLoaded(true);
    };
    loadSavedFilter();
  }, [currentUser?.email]);

  // Save filter preference when it changes
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
    <div className="min-h-screen p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3">
              <ClipboardList className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Order Form</h1>
              <p className="text-gray-600 text-sm">Manage material orders and supplies</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>

            {/* Filter */}
            <Select value={filterStatus} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-36">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="received">Received</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setRefreshKey(k => k + 1)}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Spreadsheet */}
        <div className="clay-card p-4">
          <OrderSpreadsheet key={refreshKey} searchTerm={searchTerm} filterStatus={filterStatus} />
        </div>
      </div>
    </div>
  );
}