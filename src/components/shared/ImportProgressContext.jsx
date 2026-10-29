import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";

const ImportProgressContext = createContext(null);
const STORAGE_KEY = "activeImportProgress";
const EMPTY_STATE = {
  show: false,
  current: 0,
  total: 0,
  currentItem: "",
  paused: false,
  status: "",
  phase: "",
  userEmail: null,
  startedAt: null,
  importJobId: null,
  created: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
};

const stateFromJob = (job, currentUserEmail) => ({
  show: true,
  current: Number(job?.processed_items || 0),
  total: Number(job?.total_items || 0),
  currentItem: job?.current_item || job?.result_message || "Importing...",
  paused: job?.status === "paused",
  status: job?.status || "running",
  phase: job?.phase || "",
  userEmail: currentUserEmail,
  startedAt: Date.parse(job?.started_at || "") || Date.now(),
  importJobId: job?.id || null,
  created: Number(job?.created_items || 0),
  updated: Number(job?.updated_items || 0),
  unchanged: Number(job?.unchanged_items || 0),
  skipped: Number(job?.skipped_items || 0),
});

export function ImportProgressProvider({ children, currentUserEmail }) {
  const [importState, setImportState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed.userEmail === currentUserEmail
          && parsed.show
          && Date.now() - (parsed.startedAt || 0) < 30 * 60 * 1000
        ) return { ...EMPTY_STATE, ...parsed };
      }
    } catch {}
    return EMPTY_STATE;
  });

  const cancelRef = useRef({ cancelled: false, paused: false });
  const importJobIdRef = useRef(importState.importJobId || null);
  const terminalHideTimerRef = useRef(null);

  const syncJob = (job) => {
    if (!job?.id) return;
    importJobIdRef.current = job.id;
    setImportState(stateFromJob(job, currentUserEmail));
  };

  useEffect(() => {
    let mounted = true;
    const restoreActiveImport = async () => {
      if (!currentUserEmail || importJobIdRef.current) return;
      try {
        const recentJobs = await staffEntities.ImportJob.filter({
          user_email: currentUserEmail,
        }, "-started_at", 10);
        if (!mounted) return;
        const activeJobs = recentJobs.filter((j) => j.status === "running" || j.status === "paused");
        if (activeJobs.length === 0) return;
        syncJob(activeJobs[0]);
      } catch (err) {
        console.error("Failed to restore import job:", err);
      }
    };
    restoreActiveImport();
    return () => { mounted = false; };
  }, [currentUserEmail]);

  useEffect(() => {
    if (!importState.show || !importState.importJobId) return undefined;
    let mounted = true;
    let polling = false;

    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const job = await staffEntities.ImportJob.get(importState.importJobId);
        if (!mounted || !job?.id) return;
        syncJob(job);

        if (["completed", "failed", "cancelled"].includes(job.status)) {
          if (terminalHideTimerRef.current) clearTimeout(terminalHideTimerRef.current);
          terminalHideTimerRef.current = setTimeout(() => {
            importJobIdRef.current = null;
            setImportState(EMPTY_STATE);
            localStorage.removeItem(STORAGE_KEY);
          }, 8000);
        }
      } catch (err) {
        if (mounted) console.error("Failed to refresh import progress:", err);
      } finally {
        polling = false;
      }
    };

    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [importState.show, importState.importJobId, currentUserEmail]);

  useEffect(() => {
    if (importState.show) localStorage.setItem(STORAGE_KEY, JSON.stringify(importState));
    else localStorage.removeItem(STORAGE_KEY);
  }, [importState]);

  useEffect(() => () => {
    if (terminalHideTimerRef.current) clearTimeout(terminalHideTimerRef.current);
  }, []);

  const startImport = async (total, userEmail, importType = "sales_pipeline", metadata = {}) => {
    cancelRef.current = { cancelled: false, paused: false };
    const job = await staffEntities.ImportJob.create({
      user_email: userEmail,
      import_type: importType,
      total_items: total,
      processed_items: 0,
      current_item: "Starting...",
      phase: "starting",
      started_at: new Date().toISOString(),
      file_name: metadata.fileName || "",
      file_hash: metadata.fileHash || "",
      file_size_bytes: Number(metadata.fileSizeBytes || 0),
    });
    syncJob(job);
    return { importJobId: job.id, cancelRef };
  };

  const updateProgress = async (current, total, currentItem) => {
    setImportState((prev) => ({ ...prev, current, total, currentItem }));
    if (!importJobIdRef.current) return;
    try {
      await staffEntities.ImportJob.update(importJobIdRef.current, {
        processed_items: current,
        current_item: currentItem,
      });
    } catch (err) {
      console.error("Failed to update import job:", err);
    }
  };

  const completeImport = async () => {
    if (!importJobIdRef.current) return;
    try {
      const job = await staffEntities.ImportJob.get(importJobIdRef.current);
      if (job?.id) syncJob(job);
    } catch (err) {
      console.error("Failed to refresh completed import:", err);
    }
  };

  const cancelImport = async () => {
    cancelRef.current.cancelled = true;
    if (!importJobIdRef.current) return;
    setImportState((prev) => ({ ...prev, currentItem: "Cancellation requested...", status: "cancelled" }));
    try {
      await staffEntities.ImportJob.update(importJobIdRef.current, {
        status: "cancelled",
        phase: "cancelling",
        current_item: "Cancellation requested...",
      });
    } catch (err) {
      console.error("Failed to cancel import job:", err);
    }
  };

  const pauseImport = async () => {
    cancelRef.current.paused = true;
    if (!importJobIdRef.current) return;
    setImportState((prev) => ({ ...prev, paused: true, status: "paused", currentItem: "Pausing safely between rows..." }));
    try {
      await staffEntities.ImportJob.update(importJobIdRef.current, {
        status: "paused",
        phase: "paused",
        current_item: "Paused safely between rows.",
      });
    } catch (err) {
      console.error("Failed to pause import job:", err);
    }
  };

  const resumeImport = async () => {
    cancelRef.current.paused = false;
    if (!importJobIdRef.current) return;
    setImportState((prev) => ({ ...prev, paused: false, status: "running", currentItem: "Resuming import..." }));
    try {
      await staffEntities.ImportJob.update(importJobIdRef.current, {
        status: "running",
        phase: "applying",
        current_item: "Resuming import...",
      });
    } catch (err) {
      console.error("Failed to resume import job:", err);
    }
  };

  const isMyImport = importState.show && importState.userEmail === currentUserEmail;
  const terminal = ["completed", "failed", "cancelled"].includes(importState.status);

  return (
    <ImportProgressContext.Provider value={{
      importState,
      startImport,
      updateProgress,
      completeImport,
      cancelImport,
      pauseImport,
      resumeImport,
      cancelRef,
      isMyImport,
    }}>
      {children}
      {isMyImport && (
        <div className="fixed bottom-20 right-4 z-[9999] w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-blue-200 bg-white p-4 shadow-xl">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {importState.status === "failed" || importState.status === "cancelled" ? (
                <XCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
              ) : importState.status === "completed" ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-500" />
              ) : importState.paused ? (
                <PauseCircle className="h-5 w-5 flex-shrink-0 text-amber-500" />
              ) : (
                <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-blue-600" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">
                  {importState.status === "completed"
                    ? "Import complete"
                    : importState.status === "failed"
                      ? "Import failed"
                      : importState.status === "cancelled"
                        ? "Import cancelled"
                        : importState.paused
                          ? "Import paused"
                          : "Importing Sales Pipeline"}
                </div>
                {importState.phase && <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{importState.phase}</div>}
              </div>
            </div>
            <span className="flex-shrink-0 text-xs text-gray-500">{importState.current} / {importState.total}</span>
          </div>

          <Progress value={importState.total > 0 ? (importState.current / importState.total) * 100 : 0} className="mb-2 h-2" />
          <p className="mb-2 line-clamp-2 text-xs text-gray-600">{importState.currentItem || "Working..."}</p>

          {(importState.created || importState.updated || importState.unchanged || importState.skipped) ? (
            <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
              <span><strong className="text-green-700">{importState.created}</strong> new</span>
              <span><strong className="text-blue-700">{importState.updated}</strong> changed</span>
              <span><strong>{importState.unchanged}</strong> unchanged</span>
              {importState.skipped > 0 && <span><strong className="text-amber-700">{importState.skipped}</strong> review</span>}
            </div>
          ) : null}

          {!terminal && (
            <div className="flex gap-2">
              {importState.paused ? (
                <Button size="sm" onClick={resumeImport} className="h-10 flex-1">
                  <PlayCircle className="mr-1.5 h-4 w-4" />Resume
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={pauseImport} className="h-10 flex-1">
                  <PauseCircle className="mr-1.5 h-4 w-4" />Pause
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={cancelImport} className="h-10 flex-1">Stop safely</Button>
            </div>
          )}
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
