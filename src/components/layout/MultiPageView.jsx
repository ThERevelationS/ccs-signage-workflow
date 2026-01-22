import React, { useState, useEffect, lazy, Suspense } from "react";
import { X, Loader2, Columns } from "lucide-react";

// Dynamic page imports - keys must match the URL paths (lowercase)
const pageComponents = {
  myworkflow: lazy(() => import("@/pages/MyWorkflow")),
  mainworkflow: lazy(() => import("@/pages/MainWorkflow")),
  salespipeline: lazy(() => import("@/pages/SalesPipeline")),
  estimating: lazy(() => import("@/pages/Estimating")),
  permitting: lazy(() => import("@/pages/Permitting")),
  design: lazy(() => import("@/pages/Design")),
  production: lazy(() => import("@/pages/Production")),
  fabrication: lazy(() => import("@/pages/Fabrication")),
  installationdeliver: lazy(() => import("@/pages/InstallationDeliver")),
  orderform: lazy(() => import("@/pages/OrderForm")),
  resourceplanning: lazy(() => import("@/pages/ResourcePlanning")),
  sips: lazy(() => import("@/pages/SIPs")),
  mondaymorningmeeting: lazy(() => import("@/pages/MondayMorningMeeting")),
  financials: lazy(() => import("@/pages/Financials")),
  timeclock: lazy(() => import("@/pages/TimeClock")),
};

export function useMultiPageView() {
  const [additionalPages, setAdditionalPages] = useState([]);

  const addPage = (pageName, pageTitle) => {
    // If page is already in split view, remove it (toggle behavior)
    const existingIndex = additionalPages.findIndex(p => p.name === pageName);
    if (existingIndex !== -1) {
      setAdditionalPages(prev => prev.filter(p => p.name !== pageName));
      return;
    }
    
    if (additionalPages.length >= 2) {
      // Already have 2 additional pages (3 total with main), replace the last one
      setAdditionalPages(prev => [...prev.slice(0, 1), { name: pageName, title: pageTitle }]);
    } else {
      setAdditionalPages(prev => [...prev, { name: pageName, title: pageTitle }]);
    }
  };

  const removePage = (pageName) => {
    setAdditionalPages(prev => prev.filter(p => p.name !== pageName));
  };

  const clearPages = () => {
    setAdditionalPages([]);
  };

  const isInMultiView = additionalPages.length > 0;

  return { additionalPages, addPage, removePage, clearPages, isInMultiView };
}

export function MultiPageContainer({ children, additionalPages, onRemovePage, onClearAll }) {
  const totalPanes = 1 + additionalPages.length;
  
  if (additionalPages.length === 0) {
    return children;
  }

  return (
    <div className="flex h-full w-full">
      {/* Clear all button */}
      <button
        onClick={onClearAll}
        className="fixed top-20 right-4 z-50 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-medium flex items-center gap-1.5 hover:bg-red-200 transition-colors shadow-md"
      >
        <X className="w-3.5 h-3.5" />
        Clear Split View
      </button>

      {/* Main page */}
      <div 
        className="h-full overflow-auto border-r border-gray-300"
        style={{ width: `${100 / totalPanes}%` }}
      >
        <div style={{ transform: `scale(${1})`, transformOrigin: 'top left', width: '100%', height: '100%' }}>
          {children}
        </div>
      </div>

      {/* Additional pages */}
      {additionalPages.map((page, index) => {
        const PageComponent = pageComponents[page.name.toLowerCase()];
        return (
          <div 
            key={page.name}
            className={`h-full overflow-auto relative ${index < additionalPages.length - 1 ? 'border-r border-gray-300' : ''}`}
            style={{ width: `${100 / totalPanes}%` }}
          >
            {/* Page header with close button */}
            <div className="sticky top-0 z-10 bg-purple-100 px-3 py-1.5 flex items-center justify-between border-b border-purple-200">
              <div className="flex items-center gap-2">
                <Columns className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-xs font-medium text-purple-800">{page.title}</span>
              </div>
              <button
                onClick={() => onRemovePage(page.name)}
                className="p-1 hover:bg-purple-200 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5 text-purple-600" />
              </button>
            </div>
            
            {/* Page content */}
            <div style={{ transform: `scale(${1})`, transformOrigin: 'top left', width: '100%' }}>
              <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                </div>
              }>
                {PageComponent ? <PageComponent /> : <div className="p-4 text-gray-500">Page not found</div>}
              </Suspense>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default MultiPageContainer;