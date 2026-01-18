import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, Lock, Loader2, AlertCircle } from "lucide-react";

export default function TimeClockLoginDialog({ isOpen, onClose, onLogin, allUsers }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      return;
    }

    setIsLoading(true);
    setError("");

    // Find user by username
    const user = allUsers.find(u => u.username?.toLowerCase() === username.toLowerCase().trim());
    
    if (!user) {
      setError("Invalid username or password");
      setIsLoading(false);
      return;
    }

    // Simple password check (in production, use proper hashing)
    if (user.password_hash !== password) {
      setError("Invalid username or password");
      setIsLoading(false);
      return;
    }

    onLogin(user);
    setUsername("");
    setPassword("");
    setIsLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-purple-600" />
            Time Clock Login
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label className="text-sm font-medium">Username</Label>
            <div className="relative mt-1">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Enter your username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="pl-10"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Password</Label>
            <div className="relative mt-1">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="pl-10"
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <Button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Login"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}