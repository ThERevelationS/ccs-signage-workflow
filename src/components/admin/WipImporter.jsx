import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Calendar, Database } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { importWipSheet } from "@/functions/importWipSheet";
import { useImportProgress } from "@/components/shared/ImportProgressContext";
import { useAuth } from "@/components/auth/EmailGate";

export default function WipImporter() {
  const fileInputLatestRef = useRef(null);
  const fileInputAllRef = useRef(null);
  const { startImport, updateProgress, completeImport, cancelRef } = useImportProgress();
  const { currentUser } = useAuth();

  const handleFileSelect = async (file, mode) => {
    if (!file) return;

    // Phase 1: Upload file and parse
    const ctrl = startImport(1, currentUser?.email);
    updateProgress(0, 1, "Uploading file...");

    let parsed;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      updateProgress(0, 1, "Parsing WIP sheets...");
      const res = await importWipSheet({ fileUrl: file_url, mode });
      parsed = res.data;
    } catch (err) {
      updateProgress(0, 1, `Error: ${err.message || "Upload failed"}`);
      setTimeout(() => completeImport(), 3000);
      return;
    }

    if (parsed.error) {
      updateProgress(0, 1, `Error: ${parsed.error}`);
      setTimeout(() => completeImport(), 3000);
      return;
    }

    const { ordersToUpdate, sheetsProcessed, totalRows, notFoundOrders, notFoundCount } = parsed;
    const total = ordersToUpdate.length;

    if (total === 0) {
      updateProgress(1, 1, `Done — ${sheetsProcessed} sheet(s), no matching orders to update.`);
      setTimeout(() => completeImport(), 3000);
      return;
    }

    // Phase 2: Batch updates
    const BATCH_SIZE = 10;
    let offset = 0;
    let totalUpdated = 0;

    startImport(total, currentUser?.email);
    updateProgress(0, total, `Updating work orders (0 / ${total})...`);

    while (offset < ordersToUpdate.length) {
      if (ctrl.current?.cancelled) break;

      // Wait while paused
      while (ctrl.current?.paused && !ctrl.current?.cancelled) {
        await new Promise(r => setTimeout(r, 300));
      }
      if (ctrl.current?.cancelled) break;

      try {
        const batch = ordersToUpdate.slice(offset, offset + BATCH_SIZE);
        let batchUpdated = 0;
        for (const item of batch) {
          if (ctrl.current?.cancelled) break;
          await base44.asServiceRole.entities.WorkOrder.update(item.id, item.updateData);
          batchUpdated++;
          totalUpdated++;
          updateProgress(totalUpdated, total, `Updating work orders (${totalUpdated} / ${total})...`);
        }
        offset += BATCH_SIZE;
      } catch (err) {
        // On transient error, wait and retry
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    completeImport();
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
          <strong>How it works:</strong> Matches rows by <strong>Order Number</strong> (e.g. INV-12345) to work orders in the system. Updates <strong>Job Description</strong> and <strong>Project Install Date</strong> only. Runs in the background — you can leave this page.
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
              onChange={(e) => { handleFileSelect(e.target.files[0], "latest"); e.target.value = ""; }}
            />
            <Button
              onClick={() => fileInputLatestRef.current?.click()}
              className="w-full"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)', color: '#0f766e', border: 'none' }}
            >
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
            <input
              ref={fileInputAllRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { handleFileSelect(e.target.files[0], "all"); e.target.value = ""; }}
            />
            <Button
              onClick={() => fileInputAllRef.current?.click()}
              className="w-full"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)', color: '#7c3aed', border: 'none' }}
            >
              <Upload className="w-4 h-4 mr-2" /> Upload & Import All
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}