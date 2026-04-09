import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Calendar, Database, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { importWipSheet } from "@/functions/importWipSheet";

export default function WipImporter() {
  const fileInputLatestRef = useRef(null);
  const fileInputAllRef = useRef(null);
  const [status, setStatus] = useState(null); // null | 'uploading' | 'processing' | 'done' | 'error'
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileSelect = async (file, mode) => {
    if (!file) return;
    setStatus('uploading');
    setMessage("Uploading file...");
    setResult(null);
    setError(null);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setStatus('processing');
      setMessage("Processing WIP sheets and updating work orders... This may take a minute.");

      const res = await importWipSheet({ fileUrl: file_url, mode });
      const data = res.data;

      if (data.error) {
        setError(data.error);
        setStatus('error');
      } else {
        setResult(data);
        setStatus('done');
      }
    } catch (err) {
      setError(err.message || "An error occurred during import");
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus(null);
    setMessage("");
    setResult(null);
    setError(null);
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
          <strong>How it works:</strong> Matches rows by <strong>Order Number</strong> (e.g. INV-12345) to work orders in the system. Updates <strong>Job Description</strong> and <strong>Project Install Date</strong> only. Please keep this tab open while importing.
        </div>

        {/* Processing state */}
        {(status === 'uploading' || status === 'processing') && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <span className="font-medium text-blue-800">{message}</span>
            </div>
            <Progress value={status === 'uploading' ? 20 : 60} className="h-2" />
            <p className="text-xs text-blue-500 mt-2">Please wait — do not close this tab.</p>
          </div>
        )}

        {/* Buttons - only show when idle */}
        {!status && (
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
              <input ref={fileInputLatestRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { handleFileSelect(e.target.files[0], "latest"); e.target.value = ""; }} />
              <Button onClick={() => fileInputLatestRef.current?.click()} className="w-full"
                style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)', color: '#0f766e', border: 'none' }}>
                <Upload className="w-4 h-4 mr-2" /> Upload & Import Latest
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
              <input ref={fileInputAllRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { handleFileSelect(e.target.files[0], "all"); e.target.value = ""; }} />
              <Button onClick={() => fileInputAllRef.current?.click()} className="w-full"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)', color: '#7c3aed', border: 'none' }}>
                <Upload className="w-4 h-4 mr-2" /> Upload & Import All
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {status === 'error' && (
        <div className="clay-card p-4 border border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
            <AlertTriangle className="w-4 h-4" /> Import Failed
          </div>
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <Button size="sm" variant="outline" onClick={reset}>Try Again</Button>
        </div>
      )}

      {/* Success */}
      {status === 'done' && result && (
        <div className="clay-card p-5 border border-green-200 bg-green-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-green-700 font-semibold">
              <CheckCircle2 className="w-5 h-5" /> Import Complete
            </div>
            <Button size="sm" variant="outline" onClick={reset}>Import Another</Button>
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
          {result.matchedByClient > 0 && (
            <p className="text-xs text-blue-600 mt-1">ℹ️ {result.matchedByClient} matched by client name (order # was saved to the work order for future imports)</p>
          )}
          {result.notFoundOrders?.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-orange-600 hover:text-orange-800">
                View {result.notFound} Unmatched Orders
              </summary>
              <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg p-3 max-h-80 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {result.notFoundOrders.map((item, i) => (
                    <div key={i} className="text-xs text-orange-800 py-0.5 px-2 bg-white rounded">
                      {item}
                    </div>
                  ))}
                </div>
                {result.notFound > result.notFoundOrders.length && (
                  <p className="text-xs text-orange-500 mt-2">...and {result.notFound - result.notFoundOrders.length} more</p>
                )}
              </div>
            </details>
          )}
          {result.debug && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Debug Info</summary>
              <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-2 overflow-auto max-h-64">
                <p><strong>Work orders in DB:</strong> {result.debug.totalWorkOrdersInDB}</p>
                <p><strong>WIP sheet headers:</strong> {result.debug.headers?.join(', ')}</p>
                {result.debug.sampleWipRows?.length > 0 && (
                  <div>
                    <strong>Sample WIP rows:</strong>
                    <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(result.debug.sampleWipRows, null, 2)}</pre>
                  </div>
                )}
                {result.debug.sampleWorkOrders?.length > 0 && (
                  <div>
                    <strong>Sample DB work orders:</strong>
                    <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(result.debug.sampleWorkOrders, null, 2)}</pre>
                  </div>
                )}
                {result.debug.sampleMatches?.length > 0 && (
                  <div>
                    <strong>Sample matches:</strong>
                    <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(result.debug.sampleMatches, null, 2)}</pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}