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
      }
    } catch (error) {
      // A temporary service failure is not session revocation. Keep the token
      // for the next verification, but do not grant access without verification.
      if ([401, 409].includes(Number(error?.response?.status))) {
        localStorage.removeItem(TOKEN_KEY);
        clearAdminSettingsAuthorization();
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    clearAdminSettingsAuthorization();
    setCurrentUser(null);
    setBrowseOnly(false);
    setShowLogin(true);
  }, []);

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
      const apiError = err?.response?.data?.error;
      return { success: false, error: apiError || "Invalid username or password" };
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