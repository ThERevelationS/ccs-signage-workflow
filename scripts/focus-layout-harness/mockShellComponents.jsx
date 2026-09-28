import React from "react";

export default function ShellStub({ children }) {
  return children ? <>{children}</> : null;
}

export function MultiPageContainer({ children }) {
  return <>{children}</>;
}

export function useMultiPageView() {
  return {
    additionalPages: [],
    addPage: () => {},
    removePage: () => {},
    clearPages: () => {},
    isInMultiView: false,
  };
}

export function ImportProgressProvider({ children }) {
  return <>{children}</>;
}

export function ResearchProgressProvider({ children }) {
  return <>{children}</>;
}

export function MultiImportProvider({ children }) {
  return <>{children}</>;
}

export function AnnouncementProvider({ children }) {
  return <>{children}</>;
}
