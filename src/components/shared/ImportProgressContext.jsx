import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, X, CheckCircle2 } from "lucide-react";

const ImportProgressContext = createContext(null);

// Key used for localStorage to persist import state across page navigation
const STORAGE_KEY = "activeImportProgress";

export function ImportProgressProvider({ children, currentUserEmail }) {
  const [importState, setImportState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore if it's for the current user and not older than 30 minutes
        if (
          parsed.userEmail === currentUserEmail &&
          parsed.show &&
          Date.now() - (parsed.startedAt || 0) < 30 * 60 * 1000
        ) {
          return parsed;
        }
      }
    } catch {}
    return { show: false, current: 0, total: 0, currentItem: "", paused: false, userEmail: null, startedAt: null, importJobId: null };
  });

  const cancelRef = useRef({ cancelled: false, paused: false });
  const importJobIdRef = useRef(null);

  // Restore active import from database on mount
  useEffect(() => {
    const restoreActiveImport = async () => {
      if (!currentUserEmail) return;
      try {
        const activeJobs = await base44.entities.ImportJob.filter({
          user_email: currentUserEmail,
          status: { $in: ["running", "paused"] }
        });
        if (activeJobs.length > 0) {
          const job = activeJobs[0];
          importJobIdRef.current = job.id;
          setImportState({
            show: true,
            current: job.processed_items || 0,
            total: job.total_items || 0,
            currentItem: job.current_item || "Restoring import...",
            paused: job.status === "paused",
            userEmail: currentUserEmail,
            startedAt: new Date(job.started_at).getTime(),
            importJobId: job.id
          });
        }
      } catch (err) {
        console.error("Failed to restore import job:", err);
      }
    };
    restoreActiveImport();
  }, [currentUserEmail]);

  // Sync to localStorage whenever state changes
  useEffect(() => {
    if (importState.show) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(importState));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [importState]);

  const startImport = (total, userEmail) => {
    cancelRef.current = { cancelled: false, paused: false };
    const newState = { show: true, current: 0, total, currentItem: "Starting...", paused: false, userEmail, startedAt: Date.now() };
    setImportState(newState);
    return cancelRef;
  };

  const updateProgress = (current, total, currentItem) => {
    setImportState(prev => ({ ...prev, current, total, currentItem }));
  };

  const completeImport = () => {
    setImportState(prev => ({ ...prev, currentItem: "Import complete!", current: prev.total }));
    setTimeout(() => {
      setImportState({ show: false, current: 0, total: 0, currentItem: "", paused: false, userEmail: null, startedAt: null });
      localStorage.removeItem(STORAGE_KEY);
    }, 2000);
  };

  const cancelImport = () => {
    cancelRef.current.cancelled = true;
    setImportState({ show: false, current: 0, total: 0, currentItem: "", paused: false, userEmail: null, startedAt: null });
    localStorage.removeItem(STORAGE_KEY);
  };

  const pauseImport = () => {
    cancelRef.current.paused = true;
    setImportState(prev => ({ ...prev, paused: true }));
  };

  const resumeImport = () => {
    cancelRef.current.paused = false;
    setImportState(prev => ({ ...prev, paused: false }));
  };

  const isMyImport = importState.show && importState.userEmail === currentUserEmail;

  return (
    <ImportProgressContext.Provider value={{ importState, startImport, updateProgress, completeImport, cancelImport, pauseImport, resumeImport, cancelRef, isMyImport }}>
      {children}
      {isMyImport && (
        <div className="fixed bottom-20 right-4 z-[9999] w-80 clay-card p-4 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {importState.current >= importState.total && importState.total > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              )}
              <span className="text-sm font-medium">
                {importState.paused ? "Import Paused" : 
                 importState.current >= importState.total && importState.total > 0 ? "Import Complete!" : "Importing..."}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">{importState.current} / {importState.total}</span>
            </div>
          </div>
          {importState.currentItem && (
            <p className="text-xs text-gray-500 mb-2 truncate">{importState.currentItem}</p>
          )}
          <Progress value={importState.total > 0 ? (importState.current / importState.total) * 100 : 0} className="h-2 mb-2" />
          <div className="flex gap-2">
            {importState.paused ? (
              <Button size="sm" onClick={resumeImport} className="h-6 px-2 flex-1">Resume</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={pauseImport} className="h-6 px-2 flex-1">Pause</Button>
            )}
            <Button size="sm" variant="destructive" onClick={cancelImport} className="h-6 px-2 flex-1">Stop</Button>
          </div>
        </div>
      )}
    </ImportProgressContext.Provider>
  );
}

export function useImportProgress() {
  const ctx = useContext(ImportProgressContext);
  if (!ctx) throw new Error("useImportProgress must be used inside ImportProgressProvider");
  return ctx;
}