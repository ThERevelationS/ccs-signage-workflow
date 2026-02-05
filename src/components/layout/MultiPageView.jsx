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
    // Generate unique ID for each page instance to allow duplicates
    const uniqueId = `${pageName}_${Date.now()}`;
    
    if (additionalPages.length >= 2) {
      // Already have 2 additional pages (3 total with main), replace the last one
      setAdditionalPages(prev => [...prev.slice(0, 1), { name: pageName, title: pageTitle, id: uniqueId }]);
    } else {
      setAdditionalPages(prev => [...prev, { name: pageName, title: pageTitle, id: uniqueId }]);
    }
  };

  const removePage = (pageId) => {
    setAdditionalPages(prev => prev.filter(p => p.id !== pageId));
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
        style={{ width: `${100 / totalPanes}%`, overflow: 'auto' }}
      >
        {children}
      </div>

      {/* Additional pages */}
      {additionalPages.map((page, index) => {
        const PageComponent = pageComponents[page.name.toLowerCase()];
        return (
          <div 
            key={page.id || page.name}
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
                onClick={() => onRemovePage(page.id || page.name)}
                className="p-1 hover:bg-purple-200 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5 text-purple-600" />
              </button>
            </div>
            
            {/* Page content */}
            <div className="flex-1 overflow-auto">
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