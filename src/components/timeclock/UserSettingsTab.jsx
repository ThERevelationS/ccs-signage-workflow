import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Mail, 
  QrCode, 
  Camera, 
  Loader2,
  CheckCircle
} from "lucide-react";
import UserQRCode from "@/components/timeclock/UserQRCode";
import FaceEnrollmentDialog from "@/components/timeclock/FaceEnrollmentDialog";
import { useAuth } from "@/components/auth/EmailGate";

export default function UserSettingsTab({ currentUser, onUserUpdated }) {
  const { sessionToken } = useAuth();
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [resetError, setResetError] = useState("");

  const handleSendPasswordReset = async () => {
    if (!currentUser?.email || !sessionToken) return;

    setSendingReset(true);
    setResetError("");
    try {
      const response = await fetch('/api/functions/issuePasswordReset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          target_email: currentUser.email,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Password reset could not be issued.");
      }
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err) {
      console.error("Error sending reset email:", err);
      setResetError(err?.message || "Failed to issue the password reset safely. Reload and try again.");
    }
    setSendingReset(false);
  };

  const hasFaceData = currentUser?.face_descriptors && currentUser.face_descriptors.length > 0;

  return (
    <div className="space-y-6">
      {/* Password Reset Section */}
      <div className="clay-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Mail className="w-5 h-5 text-purple-600" />
          Change Password
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          We'll send you an email with a link to reset your password.
        </p>
        {resetError && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{resetError}</div>}
        <Button 
          onClick={handleSendPasswordReset}
          disabled={sendingReset || resetSent}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {sendingReset ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : resetSent ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Email Sent!
            </>
          ) : (
            <>
              <Mail className="w-4 h-4 mr-2" />
              Send Password Reset Email
            </>
          )}
        </Button>
      </div>

      {/* QR Code Section */}
      <div className="clay-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <QrCode className="w-5 h-5 text-purple-600" />
          My QR Code Badge
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Use your QR code for quick clock in/out. Download it to print or save on your phone.
        </p>
        <UserQRCode user={currentUser} />
      </div>

      {/* Face Recognition Section */}
      <div className="clay-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Camera className="w-5 h-5 text-purple-600" />
          Face Recognition
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {hasFaceData 
            ? "Your face is registered for quick login. You can re-register to update it."
            : "Register your face for hands-free clock in/out using the camera."
          }
        </p>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => setShowFaceEnroll(true)}
            variant={hasFaceData ? "outline" : "default"}
            className={hasFaceData ? "" : "bg-purple-600 hover:bg-purple-700"}
          >
            <Camera className="w-4 h-4 mr-2" />
            {hasFaceData ? "Re-register Face" : "Register Face"}
          </Button>
          {hasFaceData && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Face registered
            </span>
          )}
        </div>
      </div>

      {/* Face Enrollment Dialog */}
      <FaceEnrollmentDialog
        isOpen={showFaceEnroll}
        onClose={() => setShowFaceEnroll(false)}
        user={currentUser}
        onSuccess={() => {
          setShowFaceEnroll(false);
          if (onUserUpdated) onUserUpdated();
        }}
      />
    </div>
  );
}