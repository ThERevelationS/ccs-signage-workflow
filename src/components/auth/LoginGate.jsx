import React from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * LoginGate
 * Wraps page content. When the user is NOT logged in, it intercepts clicks
 * and key presses on the wrapped area and opens the login dialog instead of
 * letting the interaction through. A subtle floating pill + small banner
 * tells the user why.
 *
 * Reading / scrolling is still allowed so users can "browse" the app.
 */
export default function LoginGate({ children }) {
  const { currentUser, showLoginDialog } = useAuth();

  if (currentUser) return <>{children}</>;

  const intercept = (e) => {
    // Allow clicks on elements that explicitly opt out of the gate
    // (the nav bar's Login button, the login dialog itself, etc.)
    if (e.target.closest("[data-login-gate-allow]")) return;

    e.preventDefault();
    e.stopPropagation();
    showLoginDialog();
  };

  return (
    <div className="relative">
      {/* Gentle banner at top */}
      <div
        data-login-gate-allow
        className="sticky top-0 z-30 mx-auto mb-2 mt-2 max-w-3xl px-3"
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-2 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <Lock className="h-4 w-4 flex-shrink-0" />
            <span>You're browsing as a guest. Sign in to interact with data.</span>
          </div>
          <Button
            size="sm"
            onClick={showLoginDialog}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            <LogIn className="mr-1.5 h-3.5 w-3.5" /> Sign In
          </Button>
        </div>
      </div>

      {/* Content — clicks are intercepted, but scroll + read still works */}
      <div onClickCapture={intercept} onKeyDownCapture={(e) => {
        // allow navigation keys so reading still works
        const passKeys = ["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"];
        if (passKeys.includes(e.key)) return;
        intercept(e);
      }}>
        {children}
      </div>
    </div>
  );
}