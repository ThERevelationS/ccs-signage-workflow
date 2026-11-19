import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { setPassword as setPasswordFn } from "@/functions/setPassword";
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
  ArrowLeft,
  Eye,
  EyeOff,
  Shield,
  ClipboardList
} from "lucide-react";
import FaceRecognition from "@/components/timeclock/FaceRecognition";
import UserHRDataForm from "@/components/user/UserHRDataForm";

const apiError = (err, fallback) =>
  err?.response?.data?.error ||
  (err?.message && !/status code/i.test(err.message) ? err.message : "") ||
  fallback;

const STEP_LABELS = ["Start", "Login", "Face ID", "Info"];

export default function NewUserSetup() {
  const resetMode = typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/resetpassword";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(1); // 1: verify, 2: credentials, 3: face, 4: hr data, 5: complete
  
  // Form state
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(""); // "" | "checking" | "available" | reason text
  const usernameSeq = useRef(0);
  
  // Face enrollment state
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [faceDescriptors, setFaceDescriptors] = useState([]);

  const getToken = () => new URLSearchParams(window.location.search).get("token") || "";

  const hasExistingCredentials = user?.has_credentials === true;
  const passwordFieldsEnabled = !hasExistingCredentials || password.length > 0 || confirmPassword.length > 0;

  const passwordScore = [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const passwordStrength = !password
    ? null
    : passwordScore <= 1
      ? { label: "Weak", segments: 1, bar: "bg-red-400", text: "text-red-600" }
      : passwordScore === 2
        ? { label: "Fair", segments: 2, bar: "bg-amber-400", text: "text-amber-600" }
        : passwordScore === 3
          ? { label: "Good", segments: 3, bar: "bg-lime-500", text: "text-lime-600" }
          : { label: "Strong", segments: 4, bar: "bg-green-500", text: "text-green-700" };

  useEffect(() => {
    validateToken();
  }, []);

  // Debounced live username availability check on the credentials step.
  useEffect(() => {
    if (resetMode || step !== 2) return;
    const value = username.trim().toLowerCase();
    if (value.length < 3) {
      usernameSeq.current += 1;
      setUsernameStatus("");
      return;
    }
    const seq = ++usernameSeq.current;
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const response = await base44.functions.invoke("onboardingAccountActionV2", {
          action: "check_username",
          token: getToken(),
          username: value,
        });
        if (seq !== usernameSeq.current) return;
        const result = response?.data || response;
        if (!result?.success) {
          setUsernameStatus("");
        } else if (result.valid === false || result.available === false) {
          setUsernameStatus(result.reason || "This username is already in use");
        } else {
          setUsernameStatus("available");
        }
      } catch {
        if (seq === usernameSeq.current) setUsernameStatus("");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [username, step, resetMode]);

  const validateToken = async () => {
    setLoading(true);
    setError("");
    
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    
    if (!token) {
      setError(resetMode
        ? "This password reset link is incomplete. Request a new reset email."
        : "Invalid registration link. Please contact your administrator for a new invitation.");
      setLoading(false);
      return;
    }

    if (resetMode) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await base44.functions.invoke("onboardingAccountActionV2", {
        action: "validate",
        token,
      });
      const result = response?.data || response;
      if (!result?.success || !result?.user?.id) {
        throw new Error(result?.error || "This registration link could not be verified.");
      }
      const foundUser = result.user;
      setUser(foundUser);
      // Pre-fill name
      setFullName(foundUser.full_name || "");
      
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

      // Users who already saved a login resume at the personal-info step;
      // they can use Back to change their credentials.
      if (foundUser.has_credentials) {
        setStep(4);
      }
    } catch (err) {
      console.error("Error validating token:", err);
      setError(`${apiError(err, "This registration link could not be verified.")} Please contact your administrator for a new invitation.`);
    }
    
    setLoading(false);
  };

  const handleResetPasswordSubmit = async () => {
    setFormError("");
    const token = getToken();
    if (!token) {
      setFormError("This password reset link is incomplete. Request a new reset email.");
      return;
    }
    if (!password || password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await setPasswordFn({ reset_token: token, new_password: password });
      if (!res?.data?.success) {
        throw new Error(res?.data?.error || "Password could not be reset.");
      }
      setPassword("");
      setConfirmPassword("");
      setResetComplete(true);
    } catch (err) {
      setFormError(apiError(err, "This reset link could not be used. Request a new password reset email."));
    } finally {
      setSaving(false);
    }
  };

  const handleCredentialsSubmit = async () => {
    setFormError("");
    const errors = {};
    if (!fullName.trim()) {
      errors.fullName = "Please enter your full name";
    }
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      errors.username = "Please enter a username";
    } else if (cleanUsername.length < 3) {
      errors.username = "Username must be at least 3 characters";
    }
    if (passwordFieldsEnabled) {
      if (!password) {
        errors.password = "Please enter a password";
      } else if (password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      }
      if (password !== confirmPassword) {
        errors.confirm = "Passwords do not match";
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Check availability now so a taken username lands on the step that can fix it.
    setSaving(true);
    try {
      const response = await base44.functions.invoke("onboardingAccountActionV2", {
        action: "check_username",
        token: getToken(),
        username: cleanUsername,
      });
      const result = response?.data || response;
      if (!result?.success) {
        throw new Error(result?.error || "Username could not be verified.");
      }
      if (result.valid === false || result.available === false) {
        setFieldErrors((prev) => ({ ...prev, username: result.reason || "This username is already in use" }));
        return;
      }
      setStep(3);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 409) {
        setError(apiError(err, "This onboarding link is no longer valid. Please contact your administrator for a new invitation."));
        return;
      }
      setFormError(apiError(err, "Username could not be verified. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleFaceCapture = (descriptors) => {
    setFaceDescriptors(descriptors);
    setShowFaceEnroll(false);
  };

  const handleSaveCredentialsAndFace = async () => {
    setSaving(true);
    setFormError("");

    try {
      const response = await base44.functions.invoke("onboardingAccountActionV2", {
        action: "save_credentials",
        token: getToken(),
        full_name: fullName.trim(),
        username: username.toLowerCase().trim(),
        password,
        face_descriptors: faceDescriptors,
      });
      const result = response?.data || response;
      if (!result?.success || !result?.user?.id) {
        throw new Error(result?.error || "Failed to save onboarding credentials.");
      }
      setUser(result.user);
      setStep(4);
    } catch (err) {
      console.error("Error saving:", err);
      const status = err?.response?.status;
      if (status === 401 || status === 409) {
        setError(apiError(err, "This onboarding link is no longer valid. Please contact your administrator for a new invitation."));
      } else {
        setFormError(apiError(err, "Failed to save your information safely. Please reload your invitation and try again."));
      }
    }

    setSaving(false);
  };

  const handleComplete = async () => {
    setSaving(true);
    setFormError("");
    
    try {
      const response = await base44.functions.invoke("onboardingAccountActionV2", {
        action: "complete",
        token: getToken(),
      });
      const result = response?.data || response;
      if (!result?.success || !result?.user?.id) {
        throw new Error(result?.error || "Failed to complete onboarding.");
      }
      setUser(result.user);
      setStep(5);
    } catch (err) {
      console.error("Error completing setup:", err);
      const status = err?.response?.status;
      if (status === 401 || status === 409) {
        setError(apiError(err, "This onboarding link is no longer valid. Please contact your administrator for a new invitation."));
      } else {
        setFormError(apiError(err, "Failed to complete setup safely. Reload your invitation before retrying."));
      }
    }
    
    setSaving(false);
  };

  const saveOnboardingHrData = async (hrData) => {
    const token = getToken();
    try {
      const response = await base44.functions.invoke("onboardingAccountActionV2", {
        action: "save_hr",
        token,
        hr_data: hrData,
      });
      const result = response?.data || response;
      if (!result?.success || !result?.user?.id) {
        throw new Error(result?.error || "HR data could not be saved.");
      }
      setUser(result.user);
      return result.user;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 409) {
        setError(apiError(err, "This onboarding link is no longer valid. Please contact your administrator for a new invitation."));
      }
      throw new Error(apiError(err, "HR data could not be saved."));
    }
  };

  const reloadUser = async () => {
    const token = getToken();
    if (!token || resetMode) return user;
    try {
      const response = await base44.functions.invoke("onboardingAccountActionV2", { action: "validate", token });
      const result = response?.data || response;
      if (!result?.success || !result?.user?.id) return null;
      setUser(result.user);
      return result.user;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 409) {
        setError(apiError(err, "This onboarding link is no longer valid. Please contact your administrator for a new invitation."));
        return null;
      }
      throw new Error(apiError(err, "This registration link could not be verified."));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center page-gradient-bg">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Validating your registration link...</p>
        </div>
      </div>
    );
  }

  if (resetMode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 page-gradient-bg">
        <div className="clay-card p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              <Lock className="w-8 h-8 text-purple-700" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Reset Password</h2>
            <p className="text-sm text-gray-500 mt-1">Sign Shop Workflow</p>
          </div>

          {error ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : resetComplete ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="w-5 h-5" /> Password updated</div>
                <p className="text-sm mt-1">This one-time reset link has been used. You can now sign in with your new password.</p>
              </div>
              <Button onClick={() => window.location.href = "/TimeClock"} className="w-full bg-purple-600 hover:bg-purple-700 text-white">Continue to Sign Shop Workflow</Button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleResetPasswordSubmit(); }} className="space-y-4">
              <div>
                <Label htmlFor="resetPassword">New Password</Label>
                <Input id="resetPassword" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setFormError(""); }} autoComplete="new-password" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="resetConfirmPassword">Confirm New Password</Label>
                <Input id="resetConfirmPassword" type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setFormError(""); }} autoComplete="new-password" className="mt-1" />
              </div>
              {formError && <p aria-live="polite" className="text-red-500 text-sm">{formError}</p>}
              <Button type="submit" disabled={saving} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Set New Password
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 page-gradient-bg">
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
      <div className="min-h-screen flex items-center justify-center p-4 page-gradient-bg">
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 page-gradient-bg">
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
        <div className="flex items-start justify-center gap-1 sm:gap-2 mb-8 flex-wrap">
          {[1, 2, 3, 4].map((s) => (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center w-12">
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    step >= s 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
                </div>
                <span className="text-[10px] mt-1 text-gray-500 whitespace-nowrap">{STEP_LABELS[s - 1]}</span>
              </div>
              {s < 4 && (
                <div className={`w-6 sm:w-8 h-1 rounded mt-3.5 ${step > s ? 'bg-purple-600' : 'bg-gray-200'}`} />
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
          <form onSubmit={(e) => { e.preventDefault(); handleCredentialsSubmit(); }} className="space-y-4">
            <div>
              <Label htmlFor="fullName" className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                Full Name
              </Label>
              <Input
                id="fullName"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, fullName: "" }));
                  setFormError("");
                }}
                aria-invalid={!!fieldErrors.fullName}
                className="mt-1"
              />
              {fieldErrors.fullName && (
                <p aria-live="polite" className="text-red-500 text-xs mt-1">{fieldErrors.fullName}</p>
              )}
            </div>

            <div>
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                Username
              </Label>
              <Input
                id="username"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                  setFieldErrors((prev) => ({ ...prev, username: "" }));
                  setFormError("");
                }}
                aria-invalid={!!fieldErrors.username}
                className="mt-1"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
              />
              {fieldErrors.username ? (
                <p aria-live="polite" className="text-red-500 text-xs mt-1">{fieldErrors.username}</p>
              ) : usernameStatus === "checking" ? (
                <p aria-live="polite" className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking availability...
                </p>
              ) : usernameStatus === "available" ? (
                <p aria-live="polite" className="text-green-600 text-xs mt-1">✓ Available</p>
              ) : usernameStatus ? (
                <p aria-live="polite" className="text-red-500 text-xs mt-1">{usernameStatus}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">Letters and numbers only, no spaces</p>
              )}
            </div>

            <div>
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-500" />
                Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Choose a password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, password: "" }));
                    setFormError("");
                  }}
                  aria-invalid={!!fieldErrors.password}
                  className="pr-10"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-form-type="other"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {hasExistingCredentials && (
                <p className="text-xs text-gray-500 mt-1">Leave blank to keep your current password</p>
              )}
              {passwordStrength && (
                <div className="mt-2" aria-live="polite">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded ${i < passwordStrength.segments ? passwordStrength.bar : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <p className={`text-xs mt-1 ${passwordStrength.text}`}>{passwordStrength.label}</p>
                </div>
              )}
              {fieldErrors.password && (
                <p aria-live="polite" className="text-red-500 text-xs mt-1">{fieldErrors.password}</p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-500" />
                Confirm Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, confirm: "" }));
                    setFormError("");
                  }}
                  aria-invalid={!!fieldErrors.confirm}
                  className="pr-10"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-form-type="other"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <p aria-live="polite" className={`text-xs mt-1 ${password === confirmPassword ? 'text-green-600' : 'text-red-500'}`}>
                  {password === confirmPassword ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
              {fieldErrors.confirm && (
                <p aria-live="polite" className="text-red-500 text-xs mt-1">{fieldErrors.confirm}</p>
              )}
            </div>

            {formError && (
              <p aria-live="polite" className="text-red-500 text-sm">{formError}</p>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={saving}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 clay-button border-none text-gray-800"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </form>
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
                ) : user?.face_count > 0 ? (
                  <div className="p-4 bg-green-50 rounded-lg flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                    <p className="font-medium text-green-800">Face ID enrolled ({user.face_count} scans saved)</p>
                  </div>
                ) : null}

                <Button
                  onClick={() => setShowFaceEnroll(true)}
                  variant="outline"
                  className="w-full"
                  disabled={saving}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {faceDescriptors.length > 0 || user?.face_count > 0 ? "Re-capture Face ID" : "Set Up Face ID"}
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
                  Save & Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                {faceDescriptors.length === 0 && (
                  <p className="text-xs text-gray-500 text-center">You can set up Face ID later in Time Clock settings</p>
                )}

                <Button
                  onClick={() => setStep(2)}
                  variant="outline"
                  className="w-full"
                  disabled={saving}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
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
              <p aria-live="polite" className="text-red-500 text-sm">{formError}</p>
            )}
          </div>
        )}

        {/* Step 4: HR Data */}
        {step === 4 && (
          <div className="space-y-4">
            {hasExistingCredentials && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-sm text-blue-800">
                  Your login is already saved. Finish your personal info below, or go back to change your login.
                </p>
              </div>
            )}
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
            onSave={saveOnboardingHrData}
            section="all"
            isAdmin={false}
          />

          <div className="mt-6 pt-4 border-t flex justify-between gap-3">
            <Button
              onClick={() => setStep(3)}
              variant="outline"
              disabled={saving}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
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
            <p aria-live="polite" className="text-red-500 text-sm mt-2">{formError}</p>
          )}
        </div>
      )}
    </div>
  );
}
