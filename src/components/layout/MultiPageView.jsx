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
    const normalizedName = pageName.toLowerCase();
    const existingIndex = additionalPages.findIndex(p => p.name.toLowerCase() === normalizedName);
    if (existingIndex !== -1) {
      setAdditionalPages(prev => prev.filter(p => p.name.toLowerCase() !== normalizedName));
      return;
    }
    
    // Check if it's the current main page (from URL)
    const currentPath = window.location.pathname.split('/').pop()?.toLowerCase() || '';
    if (currentPath === normalizedName) {
      return; // Don't add the current page to split view
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
      {/* Clear all button removed - now in Layout footer */}

      {/* Main page */}
      <div 
        className="h-full border-r border-gray-300"
        style={{ width: `${100 / totalPanes}%`, overflow: 'hidden' }}
      >
        {children}
      </div>

      {/* Additional pages */}
      {additionalPages.map((page, index) => {
        const PageComponent = pageComponents[page.name.toLowerCase()];
        return (
          <div 
            key={page.name}
            className={`h-full relative flex flex-col ${index < additionalPages.length - 1 ? 'border-r border-gray-300' : ''}`}
            style={{ width: `${100 / totalPanes}%`, overflow: 'hidden' }}
          >
            {/* Page header with close button */}
            <div className="flex-shrink-0 bg-purple-100 px-3 py-1.5 flex items-center justify-between border-b border-purple-200">
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
            <div className="flex-1 overflow-hidden">
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