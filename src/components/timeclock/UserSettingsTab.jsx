import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Mail, 
  QrCode, 
  Camera, 
  Loader2,
  CheckCircle,
  Monitor,
  ShieldCheck,
  Timer,
} from "lucide-react";
import UserQRCode from "@/components/timeclock/UserQRCode";
import FaceEnrollmentDialog from "@/components/timeclock/FaceEnrollmentDialog";
import TimeTrackerSettings from "@/components/timeclock/TimeTrackerSettings";
import WorkspaceSettingsCenter from "@/components/timeclock/WorkspaceSettingsCenter";
import { useAuth } from "@/components/auth/EmailGate";

export default function UserSettingsTab({ currentUser, sessionToken: sessionTokenOverride = "", onUserUpdated }) {
  const { sessionToken: shellSessionToken } = useAuth();
  const sessionToken = sessionTokenOverride || shellSessionToken;
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [resetError, setResetError] = useState("");
  const resetSeqRef = useRef(0);
  const resetScopeRef = useRef("");
  resetScopeRef.current = `${sessionToken || ""}|${String(currentUser?.email || "").trim().toLowerCase()}`;

  const handleSendPasswordReset = async () => {
    const requestEmail = String(currentUser?.email || "").trim().toLowerCase();
    if (!requestEmail || !sessionToken) return;
    const requestSeq = ++resetSeqRef.current;
    const requestScope = `${sessionToken}|${requestEmail}`;
    const stillCurrent = () =>
      requestSeq === resetSeqRef.current && resetScopeRef.current === requestScope;

    setSendingReset(true);
    setResetError("");
    try {
      const response = await base44.functions.invoke("issuePasswordReset", {
        session_token: sessionToken,
        target_email: currentUser.email,
      });
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || "Password reset could not be issued.");
      if (!stillCurrent()) return;
      setResetSent(true);
      setTimeout(() => { if (stillCurrent()) setResetSent(false); }, 5000);
    } catch (err) {
      if (!stillCurrent()) return;
      console.error("Error sending reset email:", err);
      setResetError(err?.message || "Failed to issue the password reset safely. Reload and try again.");
    }
    if (stillCurrent()) setSendingReset(false);
  };

  // face_descriptors never reach the browser (staffDataRead denylist), so ask
  // the backend whether this user has enrolled templates. Unknown = false.
  const [hasFaceData, setHasFaceData] = useState(false);
  useEffect(() => {
    let alive = true;
    setHasFaceData(false);
    if (!sessionToken || !currentUser?.email) return undefined;
    base44.functions.invoke("timeClockActionV2", {
      action: "identify_face",
      probe: true,
      session_token: sessionToken,
      request_id: `faceprobe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    }).then((res) => {
      const data = res?.data || res;
      if (alive) setHasFaceData(data?.success === true && Number(data.self_template_count || 0) > 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, [sessionToken, currentUser?.email, showFaceEnroll]);

  const [settingsTab, setSettingsTab] = useState("workspace");
  const trackerSectionRef = useRef(null);

  useEffect(() => {
    // WorkspaceSettingsCenter's "Jump to Time Tracker" button dispatches this —
    // the tracker lives behind a sub-tab now, so switching + scrolling needs a
    // cross-component signal (the button also exists where no tracker mounts).
    const open = () => {
      setSettingsTab("tracker");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        trackerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    };
    window.addEventListener("ccs:openTimeTracker", open);
    return () => window.removeEventListener("ccs:openTimeTracker", open);
  }, []);

  return (
    <Tabs value={settingsTab} onValueChange={setSettingsTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="workspace" className="gap-1.5">
          <Monitor className="w-4 h-4" />
          Workspace
        </TabsTrigger>
        <TabsTrigger value="security" className="gap-1.5">
          <ShieldCheck className="w-4 h-4" />
          Security & Badge
        </TabsTrigger>
        <TabsTrigger value="tracker" className="gap-1.5">
          <Timer className="w-4 h-4" />
          Time Tracker
        </TabsTrigger>
      </TabsList>

      <TabsContent value="workspace">
        {/* Personal Workspace — per-employee appearance/taskbar/startup prefs */}
        <WorkspaceSettingsCenter />
      </TabsContent>

      <TabsContent value="security" className="space-y-6">
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
        <UserQRCode user={currentUser} sessionToken={sessionToken} />
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
      </TabsContent>

      <TabsContent value="tracker">
        {/* Time Tracker Section (salary employees) — anchor target for the Settings Center "Time Clock" pointer */}
        <div id="time-tracker-settings" ref={trackerSectionRef} className="scroll-mt-4">
          <TimeTrackerSettings currentUser={currentUser} sessionToken={sessionToken} />
        </div>
      </TabsContent>

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
    </Tabs>
  );
}