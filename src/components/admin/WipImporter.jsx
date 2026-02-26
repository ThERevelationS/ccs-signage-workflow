import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Calendar, Database } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { importWipSheet } from "@/functions/importWipSheet";

export default function WipImporter() {
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeMode, setActiveMode] = useState(null);
  const fileInputLatestRef = useRef(null);
  const fileInputAllRef = useRef(null);

  const handleFileSelect = async (file, mode) => {
    if (!file) return;

    setIsUploading(true);
    setResult(null);
    setError(null);
    setActiveMode(mode);

    try {
      // Upload file to get URL
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Call backend function
      const response = await importWipSheet({ fileUrl: file_url, mode });
      const data = response.data;

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message || "An error occurred during import");
    } finally {
      setIsUploading(false);
      setActiveMode(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="clay-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #D4EDE8 0%, #D4E9F7 100%)' }}>
            <FileSpreadsheet className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">WIP Sheet Import</h3>
            <p className="text-sm text-gray-500">Upload a WIP Excel file to update project descriptions and install dates</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-700">
          <strong>How it works:</strong> The importer matches rows by <strong>Order Number</strong> (e.g. INV-12345) to work orders in the system. It updates the <strong>Job Description</strong> and <strong>Project Install Date</strong> fields only.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Latest Sheet Only */}
          <div className="border-2 border-dashed border-teal-200 rounded-xl p-5 bg-teal-50/50 hover:bg-teal-50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-teal-600" />
              <h4 className="font-semibold text-gray-700">Latest Sheet Only</h4>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Automatically picks the most recent WIP tab (e.g. "WIP 2-23-26") and updates matching projects.
            </p>
            <input
              ref={fileInputLatestRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files[0], "latest")}
            />
            <Button
              onClick={() => fileInputLatestRef.current?.click()}
              disabled={isUploading}
              className="w-full"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)', color: '#0f766e', border: 'none' }}
            >
              {isUploading && activeMode === 'latest' ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Upload & Import Latest</>
              )}
            </Button>
          </div>

          {/* All Sheets */}
          <div className="border-2 border-dashed border-purple-200 rounded-xl p-5 bg-purple-50/50 hover:bg-purple-50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-purple-600" />
              <h4 className="font-semibold text-gray-700">All Sheets (Full History)</h4>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Processes every WIP tab in the file. Later sheets override earlier ones for the same order number.
            </p>
            <input
              ref={fileInputAllRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files[0], "all")}
            />
            <Button
              onClick={() => fileInputAllRef.current?.click()}
              disabled={isUploading}
              className="w-full"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)', color: '#7c3aed', border: 'none' }}
            >
              {isUploading && activeMode === 'all' ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Upload & Import All</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {error && (
        <div className="clay-card p-4 border border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
            <AlertTriangle className="w-4 h-4" />
            Import Failed
          </div>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {result && (
        <div className="clay-card p-5 border border-green-200 bg-green-50">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-3">
            <CheckCircle2 className="w-5 h-5" />
            Import Complete
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="bg-white rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{result.sheetsProcessed}</p>
              <p className="text-xs text-gray-500">Sheets Processed</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{result.totalRows}</p>
              <p className="text-xs text-gray-500">Unique Orders Found</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{result.updated}</p>
              <p className="text-xs text-gray-500">Projects Updated</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-500">{result.notFound}</p>
              <p className="text-xs text-gray-500">Not Matched</p>
            </div>
          </div>
          <p className="text-sm text-green-700">{result.message}</p>
          {result.notFoundOrders && result.notFoundOrders.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-1">Orders not found in system (first 20):</p>
              <div className="flex flex-wrap gap-1">
                {result.notFoundOrders.map(o => (
                  <Badge key={o} variant="outline" className="text-xs">{o}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}