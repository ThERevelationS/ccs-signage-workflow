import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, CheckCircle, XCircle } from "lucide-react";

export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get("token");
    
    if (resetToken) {
      setToken(resetToken);
      validateToken(resetToken);
    } else {
      setError("No reset token provided");
      setIsLoading(false);
    }
  }, []);

  const validateToken = async (resetToken) => {
    try {
      const users = await base44.entities.AuthorizedEmail.filter({
        password_reset_token: resetToken
      });

      if (users.length === 0) {
        setError("Invalid or expired reset link");
        setIsLoading(false);
        return;
      }

      const foundUser = users[0];
      
      // Check if token is expired
      if (foundUser.password_reset_expires) {
        const expiresDate = new Date(foundUser.password_reset_expires);
        if (expiresDate < new Date()) {
          setError("This reset link has expired. Please request a new one.");
          setIsLoading(false);
          return;
        }
      }

      setUser(foundUser);
      setIsLoading(false);
    } catch (err) {
      console.error("Error validating token:", err);
      setError("Failed to validate reset link");
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await base44.entities.AuthorizedEmail.update(user.id, {
        password_hash: newPassword,
        password_reset_token: null,
        password_reset_expires: null
      });

      setSuccess(true);
    } catch (err) {
      console.error("Error setting password:", err);
      setError("Failed to update password");
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        <div className="clay-card p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Validating reset link...</p>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        <div className="clay-card p-8 text-center max-w-md">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Reset Link Invalid</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        <div className="clay-card p-8 text-center max-w-md">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Password Updated!</h2>
          <p className="text-gray-600 mb-4">Your password has been successfully changed.</p>
          <p className="text-sm text-gray-500">You can now use your new password to log in to the Time Clock.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
      <div className="clay-card p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" 
            style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
            <Lock className="w-8 h-8 text-purple-700" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Set Your Password</h2>
          <p className="text-gray-600 mt-1">
            {user?.full_name || user?.email}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>New Password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="mt-1"
              autoFocus
            />
          </div>

          <div>
            <Label>Confirm Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="mt-1"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full clay-button border-none text-gray-800"
            style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Set Password
          </Button>
        </form>
      </div>
    </div>
  );
}