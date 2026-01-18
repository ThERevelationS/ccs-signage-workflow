import React, { useState, useEffect, useRef } from "react";
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
  Plus,
  Upload,
  Download,
  Maximize2,
  Minimize2
} from "lucide-react";
import { useAuth } from "@/components/auth/EmailGate";
import OrderSpreadsheet from "@/components/orders/OrderSpreadsheet";

const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function OrderForm() {
  const { currentUser, isRegistered, promptForEmail } = useAuth();
  
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLoaded, setFilterLoaded] = useState(false);
  const [canImportExport, setCanImportExport] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
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

  useEffect(() => {
    const checkImportExportPermission = async () => {
      if (currentUser?.role === "admin") {
        setCanImportExport(true);
        return;
      }
      if (currentUser?.email) {
        try {
          const users = await AuthorizedEmail.filter({ email: currentUser.email.toLowerCase() });
          if (users.length > 0 && users[0].can_import_export) {
            setCanImportExport(true);
          }
        } catch (e) {
          // ignore
        }
      }
    };
    checkImportExportPermission();
  }, [currentUser]);

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
    <div className="h-full overflow-hidden p-4 sm:p-6 flex flex-col">
      <div className="w-full max-w-[95%] lg:max-w-[90%] xl:max-w-[85%] mx-auto flex-1 flex flex-col overflow-hidden">
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
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
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
          </div>

          <div className="flex items-center gap-2">
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
            
            {canImportExport && (
              <>
                <Button 
                  onClick={() => spreadsheetRef.current?.importFromExcel()}
                  size="sm" 
                  className="h-8 px-3"
                  variant="ghost"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Import
                </Button>
                <Button 
                  onClick={() => spreadsheetRef.current?.exportToExcel()}
                  size="sm" 
                  className="h-8 px-3"
                  variant="ghost"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </>
            )}
            
            <Button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else {
                  document.exitFullscreen();
                }
              }}
              size="sm"
              className="clay-button border-none text-gray-800 h-8 px-3"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, rgba(255,255,255,0.9) 100%)' }}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <OrderSpreadsheet 
          ref={spreadsheetRef}
          searchTerm={searchTerm} 
          filterStatus={filterStatus}
          showButtonsInline={false}
        />
      </div>
    </div>
  );
}