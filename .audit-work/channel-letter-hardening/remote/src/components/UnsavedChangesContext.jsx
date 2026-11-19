import { createContext, useContext } from "react";

export const UnsavedChangesContext = createContext({
  isDirty: false,
  setIsDirty: () => {},
});

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}