import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, Eye, AlertCircle } from "lucide-react";

const TOKEN_KEY = "sss_session_token";
const ADMIN_UNLOCKED_KEY = "adminUnlocked";
const ADMIN_CAPABILITY_KEY = "adminSettingsCapability";
const ADMIN_CAPABILITY_EXPIRES_KEY = "adminSettingsCapabilityExpires";

export function getSessionToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}

// Mirrors the verified session user outside React so non-hook call sites
// (entity loaders, role checks inside load callbacks) can resolve the same
// AuthorizedEmail identity without a network round-trip.
let lastSessionUser = null;
export function getSessionUser() {
  return lastSessionUser;
}

export function clearAdminSettingsAuthorization() {
  try {
    sessionStorage.removeItem(ADMIN_UNLOCKED_KEY);
    sessionStorage.removeItem(ADMIN_CAPABILITY_KEY);
    sessionStorage.removeItem(ADMIN_CAPABILITY_EXPIRES_KEY);
  } catch {}
}

export function getStoredAdminSettingsCapability() {
  try {
    const capability = String(sessionStorage.getItem(ADMIN_CAPABILITY_KEY) || "").trim();
    const expiresAt = Date.parse(String(sessionStorage.getItem(ADMIN_CAPABILITY_EXPIRES_KEY) || ""));
    if (capability && Number.isFinite(expiresAt) && expiresAt > Date.now()) return capability;
  } catch {}
  clearAdminSettingsAuthorization();
  return "";
}

// Read-only: the stored capability's expiry timestamp (ms) so callers can
// schedule a re-lock exactly at expiry. Returns null when nothing usable is
// stored; unlike getStoredAdminSettingsCapability it never mutates storage.
export function getStoredAdminSettingsCapabilityExpiry() {
  try {
    const capability = String(sessionStorage.getItem(ADMIN_CAPABILITY_KEY) || "").trim();
    const expiresAt = Date.parse(String(sessionStorage.getItem(ADMIN_CAPABILITY_EXPIRES_KEY) || ""));
    if (capability && Number.isFinite(expiresAt)) return expiresAt;
  } catch {}
  return null;
}

export function hasStoredAdminSettingsAuthorization() {
  try {
    return sessionStorage.getItem(ADMIN_UNLOCKED_KEY) === "true" && !!getStoredAdminSettingsCapability();
  } catch {
    return false;
  }
}

export function storeAdminSettingsAuthorization(capability, expiresAt) {
  sessionStorage.setItem(ADMIN_UNLOCKED_KEY, "true");
  sessionStorage.setItem(ADMIN_CAPABILITY_KEY, capability);
  sessionStorage.setItem(ADMIN_CAPABILITY_EXPIRES_KEY, expiresAt);
}

// The Time Clock kiosk page is guest-facing: app-level Sign In dialogs must
// never appear there on their own (auto-pop on mount or after a sign-out).
const isTimeClockKioskPath = () => {
  try {
    const path = String(window.location.pathname || "").replace(/\/+$/, "").toLowerCase();
    return path === "/timeclock";
  } catch {
    return false;
  }
};

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUserState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [browseOnly, setBrowseOnly] = useState(false);

  const setCurrentUser = useCallback((user) => {
    lastSessionUser = user || null;
    setCurrentUserState(user || null);
  }, []);

  // Restore session from stored token
  const restoreSession = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      clearAdminSettingsAuthorization();
      setIsLoading(false);
      return;
    }
    try {
      const res = await base44.functions.invoke("verifySession", { token });
      const data = res?.data || res;
      if (data?.valid && data.user) {
        setCurrentUser(data.user);
      } else if (data?.valid === false) {
        localStorage.removeItem(TOKEN_KEY);
        clearAdminSettingsAuthorization();
        setCurrentUser(null);
      }
    } catch (error) {
      // A temporary service failure is not session revocation. Keep the token
      // for the next verification, but do not grant access without verification.
      if ([401, 409].includes(Number(error?.response?.status))) {
        localStorage.removeItem(TOKEN_KEY);
        clearAdminSettingsAuthorization();
        setCurrentUser(null);
      }
    }
    setIsLoading(false);
  }, [setCurrentUser]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    clearAdminSettingsAuthorization();
    setCurrentUser(null);
    setBrowseOnly(false);
    setShowLogin(!isTimeClockKioskPath());
  }, [setCurrentUser]);

  const loginWithCredentials = useCallback(async (username, password) => {
    try {
      const res = await base44.functions.invoke("verifyLogin", { username, password });
      const data = res?.data || res;
      if (data?.success && data.token) {
        clearAdminSettingsAuthorization();
        localStorage.setItem(TOKEN_KEY, data.token);
        setCurrentUser(data.user);
        setBrowseOnly(false);
        setShowLogin(false);
        return { success: true };
      }
      return { success: false, error: data?.error || "Invalid username or password" };
    } catch (err) {
      const status = err?.response?.status ?? err?.status;
      const apiError = err?.response?.data?.error;
      // A 5xx (or a request that never completed) means sign-in was never
      // evaluated — say so plainly instead of showing a raw server error name.
      if (typeof status !== "number" || status >= 500) {
        return { success: false, error: "Sign in hit a temporary server problem. Please try again." };
      }
      return { success: false, error: apiError || "Invalid username or password" };
    }
  }, [setCurrentUser]);

  const getUserFirstName = useCallback(() => {
    if (!currentUser?.full_name) return "";
    return currentUser.full_name.split(" ")[0];
  }, [currentUser]);

  // Show login dialog automatically when not authenticated and not in browse
  // mode — except on the Time Clock kiosk, where guests must be left alone.
  // Explicit Sign In clicks still open it through showLoginDialog().
  useEffect(() => {
    if (!isLoading && !currentUser && !browseOnly && !isTimeClockKioskPath()) {
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
    sessionToken: currentUser ? (localStorage.getItem(TOKEN_KEY) || "") : "",
    isRegistered: !!currentUser,
    isLoading,
    logout,
    loginWithCredentials,
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
      />
    </AuthContext.Provider>
  );
}

function LoginDialog({ open, onLogin, onBrowseOnly }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      // A backdrop tap or browser Back must not silently switch staff into guest mode.
      // The separate browse button below is the only intentional dismissal path.
      if (isOpen) return;
    }}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
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
        </div>
      </DialogContent>
    </Dialog>
  );
}