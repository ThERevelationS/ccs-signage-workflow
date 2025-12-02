import React, { useState, useEffect, createContext, useContext } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Mail, Loader2, AlertCircle } from "lucide-react";

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Return a default context for when AuthProvider isn't mounted yet
    return {
      currentUser: null,
      isRegistered: false,
      promptForEmail: () => {},
      getUserFirstName: () => null,
      logout: () => {}
    };
  }
  return context;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    checkStoredEmail();
  }, []);

  const checkStoredEmail = async () => {
    setIsLoading(true);
    const storedEmail = localStorage.getItem("userEmail");
    
    if (storedEmail) {
      const user = await verifyEmail(storedEmail);
      if (user) {
        setCurrentUser(user);
        setIsRegistered(true);
      } else {
        // Email no longer valid, show prompt
        localStorage.removeItem("userEmail");
        setShowEmailPrompt(true);
      }
    } else {
      setShowEmailPrompt(true);
    }
    setIsLoading(false);
  };

  const verifyEmail = async (email) => {
    try {
      const users = await base44.entities.User.list();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      return user || null;
    } catch (error) {
      console.error("Error verifying email:", error);
      return null;
    }
  };

  const handleEmailSubmit = async () => {
    if (!emailInput.trim()) {
      setError("Please enter your email address");
      return;
    }

    setIsChecking(true);
    setError("");

    const user = await verifyEmail(emailInput.trim());
    
    if (user) {
      localStorage.setItem("userEmail", emailInput.trim().toLowerCase());
      setCurrentUser(user);
      setIsRegistered(true);
      setShowEmailPrompt(false);
    } else {
      setError("This email is not registered. You can view but not interact with the workflow.");
      localStorage.setItem("userEmail", emailInput.trim().toLowerCase());
      setCurrentUser({ email: emailInput.trim().toLowerCase(), full_name: null });
      setIsRegistered(false);
      setShowEmailPrompt(false);
    }
    
    setIsChecking(false);
  };

  const handleSkip = () => {
    setCurrentUser({ email: null, full_name: null });
    setIsRegistered(false);
    setShowEmailPrompt(false);
  };

  const promptForEmail = () => {
    setEmailInput("");
    setError("");
    setShowEmailPrompt(true);
  };

  const getUserFirstName = () => {
    if (currentUser?.full_name) {
      return currentUser.full_name.split(" ")[0];
    }
    return null;
  };

  const logout = () => {
    localStorage.removeItem("userEmail");
    setCurrentUser(null);
    setIsRegistered(false);
    setShowEmailPrompt(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      isRegistered, 
      promptForEmail, 
      getUserFirstName,
      logout 
    }}>
      {children}

      <Dialog open={showEmailPrompt} onOpenChange={() => {}}>
        <DialogContent className="clay-card border-none" hideClose>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Mail className="w-5 h-5 text-purple-600" />
              Welcome to Sign Shop Workflow
            </DialogTitle>
            <DialogDescription>
              Enter your email to access full functionality
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Input
                type="email"
                placeholder="your.email@company.com"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                className="text-lg py-6"
              />
              {error && (
                <div className="flex items-center gap-2 mt-2 text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleEmailSubmit}
                disabled={isChecking}
                className="flex-1 clay-button border-none text-gray-800 py-6"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
              >
                {isChecking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Continue"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleSkip}
                className="py-6"
              >
                View Only
              </Button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              If your email isn't registered, you can still browse the workflow in view-only mode.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </AuthContext.Provider>
  );
}

// HOC to wrap interactive elements
export function RequireAuth({ children, onClick, ...props }) {
  const { isRegistered, promptForEmail } = useAuth();

  const handleClick = (e) => {
    if (!isRegistered) {
      e.preventDefault();
      e.stopPropagation();
      promptForEmail();
      return;
    }
    if (onClick) {
      onClick(e);
    }
  };

  return React.cloneElement(children, { 
    ...props,
    onClick: handleClick 
  });
}