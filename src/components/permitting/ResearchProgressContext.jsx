import React, { createContext, useState, useCallback } from "react";

export const ResearchProgressContext = createContext(null);

export function ResearchProgressProvider({ children }) {
  const [progress, setProgress] = useState(null);

  const startResearch = useCallback((total) => {
    setProgress({
      total,
      processed: 0,
      updated: 0,
      skipped: 0,
      currentJurisdiction: null,
      isComplete: false,
      error: null
    });
  }, []);

  const updateProgress = useCallback((updates) => {
    setProgress(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const completeResearch = useCallback((updated, skipped, error = null) => {
    setProgress(prev => prev ? {
      ...prev,
      isComplete: true,
      updated,
      skipped,
      error
    } : null);
  }, []);

  const clearProgress = useCallback(() => {
    setProgress(null);
  }, []);

  return (
    <ResearchProgressContext.Provider value={{ progress, startResearch, updateProgress, completeResearch, clearProgress }}>
      {children}
    </ResearchProgressContext.Provider>
  );
}

export function useResearchProgress() {
  const context = React.useContext(ResearchProgressContext);
  if (!context) {
    throw new Error("useResearchProgress must be used within ResearchProgressProvider");
  }
  return context;
}