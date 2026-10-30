import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  UserPlus, 
  Save, 
  Loader2
} from "lucide-react";
import FaceRecognition from "./FaceRecognition";
import { updateAuthorizedEmailIfUnchanged } from "@/components/admin/authorizedEmailPersistence";
import { triggerNotification } from "@/components/workflow/NotificationService";
import { staffEntities } from "@/components/staff/staffEntities";

const AuthorizedEmail = staffEntities.AuthorizedEmail;

export default function FaceEnrollmentDialog({ isOpen, onClose, user, onSuccess }) {
  const [faceDescriptors, setFaceDescriptors] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [saveError, setSaveError] = useState("");
  const saveSeqRef = useRef(0);
  const capturedForRef = useRef("");
  const completionTimerRef = useRef(null);

  // A pending completion callback must not outlive an unmounted dialog.
  useEffect(() => () => clearTimeout(completionTimerRef.current), []);

  // Reset camera key when dialog opens to force fresh mount
  useEffect(() => {
    if (isOpen) {
      setCameraKey(prev => prev + 1);
    }
  }, [isOpen]);

  const [enrollGrade, setEnrollGrade] = useState(null);
  // Enrollment quality (#4): mean pairwise descriptor distance measures pose
  // coverage - all captures from one pose cluster near zero and should be
  // redone, spread coverage earns A/B.
  const gradeFor = (descriptors) => {
    if (descriptors.length < 2) return { grade: "-", tip: "Need 2+ captures" };
    let sum = 0, n = 0;
    for (let i = 0; i < descriptors.length; i += 1)
      for (let j = i + 1; j < descriptors.length; j += 1) {
        const a = descriptors[i], b = descriptors[j];
        let acc = 0;
        for (let k = 0; k < 128; k += 1) { const d = (a[k] || 0) - (b[k] || 0); acc += d * d; }
        sum += Math.sqrt(acc); n += 1;
      }
    const mean = n ? sum / n : 0;
    if (mean >= 0.3) return { grade: "A", tip: "Great pose coverage" };
    if (mean >= 0.22) return { grade: "B", tip: "Good coverage" };
    if (mean >= 0.15) return { grade: "C", tip: "OK - more angles would help" };
    if (mean >= 0.08) return { grade: "D", tip: "Weak - vary pose/distance" };
    return { grade: "F", tip: "Same pose repeated - recapture from different angles" };
  };

  const handleCapture = (descriptors) => {
    // Descriptors belong to the employee shown when they were captured.
    capturedForRef.current = String(user?.email || "").toLowerCase();
    setFaceDescriptors(descriptors);
    setEnrollGrade(gradeFor(descriptors));
  };

  const handleSave = async () => {
    const recordEmail = String(user?.email || "").toLowerCase();
    if (faceDescriptors.length < 3 || !recordEmail) return;
    // Never bind a face captured for one employee to another record.
    if (capturedForRef.current !== recordEmail) {
      setSaveError("The captured face data was recorded for a different employee. Close and recapture before saving.");
      return;
    }
    if (enrollGrade?.grade === "D" || enrollGrade?.grade === "F") {
      setSaveError(`Enrollment quality ${enrollGrade.grade}: ${enrollGrade.tip}. Recapture with more pose/distance variation.`);
      return;
    }
    const requestSeq = ++saveSeqRef.current;
    const current = () => requestSeq === saveSeqRef.current;
    setIsSaving(true);
    setSaveError("");
    try {
      await updateAuthorizedEmailIfUnchanged({
        entity: AuthorizedEmail,
        record: user,
        nextFields: { face_descriptors: faceDescriptors },
        exactVersion: false,
        enforceIdentity: false,
        label: `Face enrollment for ${user?.full_name || user?.email || user?.id}`
      });
      if (!current()) return;
      triggerNotification("user_face_enrolled", null, {
        recordData: user,
        eventDescription: "User face ID enrolled",
      });
      setSaved(true);
      completionTimerRef.current = setTimeout(() => {
        if (!current()) return;
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error saving face data:", err);
      if (current()) {
        setSaveError(err?.message || "Face enrollment could not be saved safely. Reload the user and try again.");
      }
    }
    if (current()) setIsSaving(false);
  };

  const handleClose = () => {
    // Invalidate in-flight saves and any pending completion callback so a
    // stale acknowledgement cannot act on the next enrollment.
    saveSeqRef.current += 1;
    clearTimeout(completionTimerRef.current);
    completionTimerRef.current = null;
    capturedForRef.current = "";
    setFaceDescriptors([]);
    setSaved(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="clay-card border-none max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-purple-600" />
            Enroll Face for {user?.full_name || user?.email}
          </DialogTitle>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col items-center py-8">
            <div className="relative mb-4 h-16 w-16">
              <span className="success-burst" />
              <svg className="h-16 w-16 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path className="check-draw" d="m8 12.5 2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-lg font-medium text-green-600">Face Enrolled Successfully!</p>
            <p className="text-sm text-gray-500 mt-1">
              {user?.full_name} can now clock in using facial recognition.
            </p>
          </div>
        ) : (
          <>
            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{saveError}</div>
            )}
            <FaceRecognition 
              key={cameraKey}
              allUsers={[]} 
              isEnrollment={true}
              onEnrollCapture={handleCapture}
            />

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={faceDescriptors.length < 3 || isSaving}
                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Face Data
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}