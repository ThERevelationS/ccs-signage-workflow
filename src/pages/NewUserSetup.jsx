import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Lock, 
  Camera,
  ArrowRight,
  Shield,
  ClipboardList
} from "lucide-react";
import FaceRecognition from "@/components/timeclock/FaceRecognition";
import UserHRDataForm from "@/components/user/UserHRDataForm";

export default function NewUserSetup() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(1); // 1: verify, 2: credentials, 3: face, 4: hr data, 5: complete
  
  // Form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Face enrollment state
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [faceDescriptors, setFaceDescriptors] = useState([]);

  useEffect(() => {
    validateToken();
  }, []);

  const validateToken = async () => {
    setLoading(true);
    setError("");
    
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    
    if (!token) {
      setError("Invalid registration link. Please contact your administrator for a new invitation.");
      setLoading(false);
      return;
    }
    
    try {
      // Find user with this onboarding token
      const users = await base44.entities.AuthorizedEmail.filter({ onboarding_token: token });
      
      if (users.length === 0) {
        setError("This registration link is invalid or has already been used. Please contact your administrator.");
        setLoading(false);
        return;
      }
      
      const foundUser = users[0];
      
      // Check if token is expired
      if (foundUser.onboarding_expires) {
        const expires = new Date(foundUser.onboarding_expires);
        if (expires < new Date()) {
          setError("This registration link has expired. Please contact your administrator for a new invitation.");
          setLoading(false);
          return;
        }
      }
      
      // Check if already completed
      if (foundUser.onboarding_complete) {
        setError("You have already completed your registration. You can now use the Time Clock to clock in.");
        setLoading(false);
        return;
      }
      
      setUser(foundUser);
      // Pre-fill username if user already has one, otherwise suggest from name
      if (foundUser.username) {
        setUsername(foundUser.username);
      } else if (foundUser.full_name) {
        const nameParts = foundUser.full_name.toLowerCase().split(" ");
        const suggestedUsername = nameParts.length > 1 
          ? nameParts[0][0] + nameParts[nameParts.length - 1]
          : nameParts[0];
        setUsername(suggestedUsername.replace(/[^a-z0-9]/g, ''));
      }
      
      // Pre-fill face descriptors if user already has them
      if (foundUser.face_descriptors?.length > 0) {
        setFaceDescriptors(foundUser.face_descriptors);
      }
    } catch (err) {
      console.error("Error validating token:", err);
      setError("An error occurred. Please try again or contact your administrator.");
    }
    
    setLoading(false);
  };

  const handleCredentialsSubmit = async () => {
    setFormError("");
    
    if (!username.trim()) {
      setFormError("Please enter a username");
      return;
    }
    
    if (username.length < 3) {
      setFormError("Username must be at least 3 characters");
      return;
    }
    
    if (!password) {
      setFormError("Please enter a password");
      return;
    }
    
    if (password.length < 4) {
      setFormError("Password must be at least 4 characters");
      return;
    }
    
    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }
    
    // Check if username is already taken
    const existingUsers = await base44.entities.AuthorizedEmail.list();
    const usernameTaken = existingUsers.some(u => 
      u.id !== user.id && u.username?.toLowerCase() === username.toLowerCase().trim()
    );
    
    if (usernameTaken) {
      setFormError("This username is already taken. Please choose a different one.");
      return;
    }
    
    // Move to face enrollment step
    setStep(3);
  };

  const handleFaceCapture = (descriptors) => {
    setFaceDescriptors(descriptors);
    setShowFaceEnroll(false);
  };

  const handleSaveCredentialsAndFace = async () => {
    setSaving(true);
    setFormError("");
    
    try {
      // Update user with credentials and face data
      await base44.entities.AuthorizedEmail.update(user.id, {
        username: username.toLowerCase().trim(),
        password_hash: password,
        face_descriptors: faceDescriptors.length > 0 ? faceDescriptors : undefined
      });
      
      // Move to HR data step
      setStep(4);
    } catch (err) {
      console.error("Error saving:", err);
      setFormError("Failed to save your information. Please try again.");
    }
    
    setSaving(false);
  };

  const handleComplete = async () => {
    setSaving(true);
    setFormError("");
    
    try {
      // Mark onboarding as complete
      await base44.entities.AuthorizedEmail.update(user.id, {
        onboarding_complete: true,
        onboarding_token: null,
        onboarding_expires: null
      });
      
      setStep(5);
    } catch (err) {
      console.error("Error completing setup:", err);
      setFormError("Failed to complete setup. Please try again.");
    }
    
    setSaving(false);
  };

  const reloadUser = async () => {
    const updated = await base44.entities.AuthorizedEmail.filter({ id: user.id });
    if (updated.length > 0) {
      setUser(updated[0]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Validating your registration link...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        <div className="clay-card p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Registration Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // Step 5: Complete
  if (step === 5) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
        <div className="clay-card p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}>
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to the Team!</h2>
          <p className="text-gray-600 mb-6">
            Your account is all set up, {user?.full_name?.split(' ')[0] || 'there'}! You can now use the Time Clock to clock in and out.
          </p>
          <div className="p-4 bg-purple-50 rounded-lg mb-6">
            <p className="text-sm text-purple-800">
              <strong>Your username:</strong> {username}
            </p>
          </div>
          <Button
            onClick={() => window.location.href = "/TimeClock"}
            className="w-full clay-button border-none text-gray-800"
            style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
          >
            Go to Time Clock
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
      <div className={`clay-card p-8 w-full ${step === 4 ? 'max-w-3xl' : 'max-w-md'}`}>
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
            <Shield className="w-8 h-8 text-purple-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">Welcome, {user?.full_name || 'New Team Member'}!</h2>
          <p className="text-sm text-gray-500 mt-1">Complete your account setup</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <React.Fragment key={s}>
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  step >= s 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
              </div>
              {s < 4 && (
                <div className={`w-8 h-1 rounded ${step > s ? 'bg-purple-600' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 2: Set Credentials */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg mb-4">
              <p className="text-sm text-blue-800">
                Let's set up your Time Clock login credentials. You'll use these to clock in and out each day.
              </p>
            </div>
            <Button
              onClick={() => setStep(2)}
              className="w-full clay-button border-none text-gray-800"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                Username
              </Label>
              <Input
                placeholder="Choose a username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                  setFormError("");
                }}
                className="mt-1"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
              />
              <p className="text-xs text-gray-500 mt-1">Letters and numbers only, no spaces</p>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-500" />
                Password
              </Label>
              <Input
                type="password"
                placeholder="Choose a password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFormError("");
                }}
                className="mt-1"
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
              />
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-500" />
                Confirm Password
              </Label>
              <Input
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFormError("");
                }}
                className="mt-1"
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
              />
            </div>

            {formError && (
              <p className="text-red-500 text-sm">{formError}</p>
            )}

            <Button
              onClick={handleCredentialsSubmit}
              className="w-full clay-button border-none text-gray-800"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 3: Face Enrollment */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Optional:</strong> Set up Face ID for quick clock-in without entering your password.
              </p>
            </div>

            {!showFaceEnroll ? (
              <div className="space-y-3">
                {faceDescriptors.length > 0 ? (
                  <div className="p-4 bg-green-50 rounded-lg flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">Face ID Enrolled</p>
                      <p className="text-sm text-green-600">{faceDescriptors.length} face scan(s) captured</p>
                    </div>
                  </div>
                ) : null}

                <Button
                  onClick={() => setShowFaceEnroll(true)}
                  variant="outline"
                  className="w-full"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {faceDescriptors.length > 0 ? "Re-capture Face ID" : "Set Up Face ID"}
                </Button>

                <Button
                  onClick={handleSaveCredentialsAndFace}
                  disabled={saving}
                  className="w-full clay-button border-none text-gray-800"
                  style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            ) : (
              <div>
                <FaceRecognition
                  mode="enroll"
                  onFaceDetected={handleFaceCapture}
                  onCancel={() => setShowFaceEnroll(false)}
                />
              </div>
            )}

            {formError && (
              <p className="text-red-500 text-sm">{formError}</p>
            )}
          </div>
        )}

        {/* Step 4: HR Data */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Please fill out your personal information for HR records. This information is kept confidential.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* HR Data Form - Full width below the card */}
      {step === 4 && (
        <div className="clay-card p-6 max-w-3xl w-full mt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              <ClipboardList className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <h3 className="font-medium text-gray-800">Personal Information</h3>
              <p className="text-sm text-gray-500">For HR records only</p>
            </div>
          </div>

          <UserHRDataForm 
            userData={user} 
            onUpdate={reloadUser}
            section="all"
            isAdmin={false}
          />

          <div className="mt-6 pt-4 border-t flex justify-end gap-3">
            <Button
              onClick={handleComplete}
              disabled={saving}
              className="clay-button border-none text-gray-800"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Complete Setup
            </Button>
          </div>

          {formError && (
            <p className="text-red-500 text-sm mt-2">{formError}</p>
          )}
        </div>
      )}
    </div>
  );
}