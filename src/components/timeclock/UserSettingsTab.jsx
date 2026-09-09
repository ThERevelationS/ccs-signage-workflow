import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { 
  Mail, 
  QrCode, 
  Camera, 
  Loader2,
  CheckCircle
} from "lucide-react";
import { sendGmail } from "@/functions/sendGmail";
import UserQRCode from "@/components/timeclock/UserQRCode";
import FaceEnrollmentDialog from "@/components/timeclock/FaceEnrollmentDialog";
import { updateAuthorizedEmailIfUnchanged } from "@/components/admin/authorizedEmailPersistence";

const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function UserSettingsTab({ currentUser, onUserUpdated }) {
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [resetError, setResetError] = useState("");

  const handleSendPasswordReset = async () => {
    if (!currentUser?.email) return;
    
    setSendingReset(true);
    setResetError("");
    try {
      // Generate reset token
      const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
      
      await updateAuthorizedEmailIfUnchanged({
        entity: AuthorizedEmail,
        record: currentUser,
        nextFields: { password_reset_token: resetToken, password_reset_expires: resetExpires },
        exactVersion: false,
        enforceIdentity: false,
        label: `Password reset token for ${currentUser.full_name || currentUser.email}`
      });
      
      // Send email
      const resetUrl = `${window.location.origin}/ResetPassword?token=${resetToken}`;
      await sendGmail({
        to: currentUser.email,
        subject: "Time Clock Password Reset",
        body: `
          <h2>Password Reset Request</h2>
          <p>Hello ${currentUser.full_name || currentUser.email},</p>
          <p>You requested to reset your Time Clock password. Click the link below to set a new password:</p>
          <p><a href="${resetUrl}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this, you can ignore this email.</p>
        `
      });
      
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