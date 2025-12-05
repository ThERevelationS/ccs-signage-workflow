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
    return {
      currentUser: null,
      isRegistered: false,
      promptForEmail: () => {},
      getUserFirstName: () => null,
      logout: () => {},
      darkMode: false,
      toggleDarkMode: () => {}
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
  const [allUsers, setAllUsers] = useState([]);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    checkStoredEmail();
  }, []);

  // Load dark mode preference
  useEffect(() => {
    const loadDarkMode = async () => {
      const storedEmail = localStorage.getItem("userEmail");
      if (storedEmail) {
        try {
          const me = await base44.auth.me();
          if (me?.dark_mode) {
            setDarkMode(true);
          }
        } catch (e) {
          // Fallback to localStorage
          const localDarkMode = localStorage.getItem("darkMode");
          if (localDarkMode === "true") setDarkMode(true);
        }
      }
    };
    loadDarkMode();
  }, [currentUser?.email]);

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark-mode");
    } else {
      document.documentElement.classList.remove("dark-mode");
    }
  }, [darkMode]);

  const toggleDarkMode = async () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    localStorage.setItem("darkMode", newValue.toString());
    
    if (currentUser?.email) {
      try {
        await base44.auth.updateMe({ dark_mode: newValue });
      } catch (e) {
        console.error("Error saving dark mode preference:", e);
      }
    }
  };

  const loadUsers = async () => {
    try {
      const users = await base44.entities.AuthorizedEmail.list();
      setAllUsers(users);
      return users;
    } catch (error) {
      console.error("Error loading users:", error);
      return [];
    }
  };

  const checkStoredEmail = async () => {
    setIsLoading(true);
    const users = await loadUsers();
    const storedEmail = localStorage.getItem("userEmail");
    
    if (storedEmail) {
      const user = users.find(u => u.email?.toLowerCase() === storedEmail.toLowerCase());
      if (user) {
        setCurrentUser(user);
        setIsRegistered(true);
      } else {
        setCurrentUser({ email: storedEmail, full_name: null });
        setIsRegistered(false);
      }
      setShowEmailPrompt(false);
    } else {
      setShowEmailPrompt(true);
    }
    setIsLoading(false);
  };

  const handleEmailSubmit = async () => {
    if (!emailInput.trim()) {
      setError("Please enter your email address");
      return;
    }

    setIsChecking(true);
    setError("");

    const email = emailInput.trim().toLowerCase();
    const users = allUsers.length > 0 ? allUsers : await loadUsers();
    const user = users.find(u => u.email?.toLowerCase() === email);
    
    localStorage.setItem("userEmail", email);
    
    if (user) {
      setCurrentUser(user);
      setIsRegistered(true);
    } else {
      setError("This email is not registered. You can view but not interact with the workflow.");
      setCurrentUser({ email, full_name: null });
      setIsRegistered(false);
    }
    setShowEmailPrompt(false);
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
      logout,
      darkMode,
      toggleDarkMode
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