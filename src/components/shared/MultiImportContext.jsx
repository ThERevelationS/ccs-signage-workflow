import React, { createContext, useContext, useState, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const MultiImportContext = createContext(null);

let nextId = 1;

export function MultiImportProvider({ children }) {
  const [imports, setImports] = useState([]);

  const startImport = useCallback((label) => {
    const id = nextId++;
    setImports(prev => [...prev, { id, label, done: false, error: false, message: `Uploading "${label}"...`, indeterminate: true }]);
    return id;
  }, []);

  const updateImport = useCallback((id, patch) => {
    setImports(prev => prev.map(imp => imp.id === id ? { ...imp, ...patch } : imp));
  }, []);

  const finishImport = useCallback((id, message, error = false) => {
    setImports(prev => prev.map(imp => imp.id === id ? { ...imp, done: true, error, message, indeterminate: false } : imp));
    setTimeout(() => {
      setImports(prev => prev.filter(imp => imp.id !== id));
    }, 5000);
  }, []);

  return (
    <MultiImportContext.Provider value={{ startImport, updateImport, finishImport }}>
      {children}
      <ImportProgressOverlay imports={imports} />
    </MultiImportContext.Provider>
  );
}

function ImportProgressOverlay({ imports }) {
  if (imports.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-96 max-w-[90vw]">
      {imports.map(imp => (
        <ImportBar key={imp.id} imp={imp} />
      ))}
    </div>
  );
}

function ImportBar({ imp }) {
  const { done, error, message, indeterminate } = imp;

  return (
    <div className="shadow-xl rounded-xl border border-blue-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {done ? (
            error
              ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              : <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 flex-shrink-0" />
          )}
          <span className={`text-sm font-semibold ${done ? (error ? 'text-red-600' : 'text-green-700') : 'text-blue-700'}`}>
            {done ? (error ? 'Import Failed' : 'Import Complete!') : 'Importing...'}
          </span>
        </div>
        <span className="text-xs text-gray-500 truncate max-w-[120px]">{imp.label}</span>
      </div>

      {indeterminate ? (
        <>
          <style>{`
            @keyframes importSlide {
              0%   { left: -45%; width: 45%; }
              60%  { left: 100%; width: 100%; }
              100% { left: 120%; width: 10%; }
            }
          `}</style>
          <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
            <div
              className="absolute h-full bg-blue-500 rounded-full"
              style={{ animation: 'importSlide 1.5s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite' }}
            />
          </div>
        </>
      ) : (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
          <div className={`h-full rounded-full ${error ? 'bg-red-400' : 'bg-green-500'}`} style={{ width: '100%' }} />
        </div>
      )}

      <p className="text-xs text-gray-600 truncate">{message}</p>
    </div>
  );
}

export function useMultiImport() {
  const ctx = useContext(MultiImportContext);
  if (!ctx) throw new Error("useMultiImport must be used inside MultiImportProvider");
  return ctx;
}