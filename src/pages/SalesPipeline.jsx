import React, { useState, useRef } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Filter, Search, Plus, Upload, Download, Loader2 } from "lucide-react";
import SalesPipelineSpreadsheet from "@/components/sales/SalesPipelineSpreadsheet";

export default function SalesPipeline() {
  const { isRegistered } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [carlsView, setCarlsView] = useState(true);
  const spreadsheetRef = useRef(null);

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-[98%] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Sales Pipeline</h1>
              <p className="text-gray-600 text-sm">Manage leads and opportunities before they enter the workflow</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Leads</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="follow_up">Follow Up</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>

            {isRegistered && (
              <Button 
                onClick={() => spreadsheetRef.current?.addNewRow()}
                className="clay-button border-none text-gray-800"
                style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Client
              </Button>
            )}
            
            {isRegistered && (
              <Button 
                onClick={() => spreadsheetRef.current?.importFromExcel()}
                size="sm" 
                className="h-8 px-2"
                variant="ghost"
              >
                <Upload className="w-3 h-3" />
              </Button>
            )}

            <Button 
              onClick={() => spreadsheetRef.current?.exportToExcel()}
              size="sm" 
              className="h-8 px-2"
              variant="ghost"
            >
              <Download className="w-3 h-3" />
            </Button>

            <Button
              onClick={() => setCarlsView(!carlsView)}
              size="sm"
              className="clay-button border-none text-gray-700 h-8"
              style={{ background: 'linear-gradient(135deg, #FFE4D6 0%, #FFD6E8 100%)' }}
            >
              {carlsView ? "Carl's View" : "Normal View"}
            </Button>
          </div>
        </div>

        <div className="clay-card p-4">
          <SalesPipelineSpreadsheet 
            ref={spreadsheetRef}
            searchTerm={searchTerm} 
            filterStatus={filterStatus}
            showButtonsInline={false}
            carlsView={carlsView}
          />
        </div>
      </div>
    </div>
  );
}