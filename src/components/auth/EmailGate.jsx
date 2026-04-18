import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, Eye, AlertCircle, ShieldCheck } from "lucide-react";

const TOKEN_KEY = "sss_session_token";

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [browseOnly, setBrowseOnly] = useState(false);

  // Restore session from stored token
  const restoreSession = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await base44.functions.invoke("verifySession", { token });
      const data = res?.data || res;
      if (data?.valid && data.user) {
        setCurrentUser(data.user);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
    setBrowseOnly(false);
    setShowLogin(true);
  }, []);

  const loginWithCredentials = useCallback(async (username, password) => {
    try {
      const res = await base44.functions.invoke("verifyLogin", { username, password });
      const data = res?.data || res;
      if (data?.success && data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        setCurrentUser(data.user);
        setBrowseOnly(false);
        setShowLogin(false);
        return { success: true };
      }
      return { success: false, error: data?.error || "Invalid username or password" };
    } catch (err) {
      const apiError = err?.response?.data?.error;
      return { success: false, error: apiError || "Invalid username or password" };
    }
  }, []);

  const adminBootstrap = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("adminBootstrapLogin", {});
      const data = res?.data || res;
      if (data?.success && data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        setCurrentUser(data.user);
        setBrowseOnly(false);
        setShowLogin(false);
        return { success: true };
      }
      return { success: false, error: data?.error || "Bootstrap failed" };
    } catch (err) {
      const apiError = err?.response?.data?.error;
      return { success: false, error: apiError || "Bootstrap failed" };
    }
  }, []);

  const getUserFirstName = useCallback(() => {
    if (!currentUser?.full_name) return "";
    return currentUser.full_name.split(" ")[0];
  }, [currentUser]);

  // Show login dialog automatically when not authenticated and not in browse mode
  useEffect(() => {
    if (!isLoading && !currentUser && !browseOnly) {
      setShowLogin(true);
    }
  }, [isLoading, currentUser, browseOnly]);

  // Gate used by pages/components: if not logged in, pop the login dialog and
  // return false so the caller can abort the action.
  const requireLogin = useCallback(() => {
    if (currentUser) return true;
    setBrowseOnly(false);
    setShowLogin(true);
    return false;
  }, [currentUser]);

  const value = {
    currentUser,
    isRegistered: !!currentUser,
    isLoading,
    logout,
    loginWithCredentials,
    adminBootstrap,
    getUserFirstName,
    showLoginDialog: () => { setBrowseOnly(false); setShowLogin(true); },
    requireLogin,
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
      <LoginDialog
        open={showLogin && !currentUser}
        onBrowseOnly={() => {
          setBrowseOnly(true);
          setShowLogin(false);
        }}
        onLogin={loginWithCredentials}
        onAdminBootstrap={adminBootstrap}
      />
    </AuthContext.Provider>
  );
}

function LoginDialog({ open, onLogin, onBrowseOnly, onAdminBootstrap }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await onLogin(username.trim(), password);
    setSubmitting(false);
    if (!res.success) setError(res.error);
    else {
      setUsername("");
      setPassword("");
    }
  };

  const handleBootstrap = async () => {
    setError("");
    setBootstrapping(true);
    const res = await onAdminBootstrap();
    setBootstrapping(false);
    if (!res.success) setError(res.error);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onBrowseOnly(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="w-5 h-5 text-purple-600" /> Sign In
          </DialogTitle>
          <DialogDescription>
            Enter your username and password to access the Sign Shop Workflow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <Label htmlFor="login-username">Username</Label>
            <Input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div>
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full bg-purple-600 hover:bg-purple-700">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
          </Button>
        </form>

        <div className="border-t pt-3 space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onBrowseOnly}
          >
            <Eye className="w-4 h-4 mr-2" /> Continue browsing without signing in
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-xs text-gray-500"
            onClick={handleBootstrap}
            disabled={bootstrapping}
          >
            {bootstrapping ? (
              <Loader2 className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="w-3 h-3 mr-2" />
            )}
            Admin emergency sign-in (via Base44 account)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}