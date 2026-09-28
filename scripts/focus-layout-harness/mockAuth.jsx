import React, { createContext, useContext, useState } from "react";
const Context = createContext(null);
export function AuthProvider({ children }) {
  const params = new URLSearchParams(window.location.search);
  const [currentUser, setCurrentUser] = useState(() => params.get("guest") === "1" ? null : ({
    id: params.get("user") || "synthetic-layout-user-a",
    email: (params.get("user") || "synthetic-layout-user-a") + "@synthetic.invalid",
    full_name: "Synthetic Layout User",
    role: params.get("admin") === "1" ? "admin" : "employee",
  }));
  const value = {
    currentUser,
    sessionToken: currentUser ? "synthetic-layout-session" : "",
    isRegistered: Boolean(currentUser),
    isLoading: false,
    logout: () => setCurrentUser(null),
    getUserFirstName: () => currentUser?.full_name?.split(" ")[0] || "",
    showLoginDialog: () => {},
    requireLogin: () => Boolean(currentUser),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("Synthetic auth missing");
  return value;
}
