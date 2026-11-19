import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  UserPlus, 
  Save, 
  Loader2
} from "lucide-react";
import FaceRecognition from "./FaceRecognition";
import { descriptorDistance } from "./faceScanRuntime";
import { enrollFaceDescriptorsAdmin } from "@/components/admin/authorizedUserAdminPersistence";
import { getSessionToken } from "@/components/auth/EmailGate";
import { triggerNotification } from "@/components/workflow/NotificationService";

// Stacking: every enrollment session merges its captures into the stored
// template set instead of replacing it - repeated enrollments over time build
// real pose/lighting coverage. 0.10 (looser than the capture-time 0.08) is the
// cross-session near-duplicate cutoff; the set is capped and the oldest
// templates roll off first.
const FACE_TEMPLATE_MERGE_DISTANCE = 0.10;
const FACE_TEMPLATE_MAX = 40;

// Merges a capture batch into stored descriptors: near-duplicates of an
// already-stored template are skipped, then the set is capped by dropping the
// oldest entries. Returns counts so the dialog can show the growing profile.
function mergeFaceDescriptors(existing = [], batch = []) {
  const merged = existing
    .filter(v => (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 128)
    .map(v => Array.from(v));
  const stored = merged.length;
  let added = 0;
  for (const d of batch || []) {
    if (!(Array.isArray(d) || ArrayBuffer.isView(d)) || d.length !== 128) continue;
    if (!merged.some(e => descriptorDistance(e, d) < FACE_TEMPLATE_MERGE_DISTANCE)) {
      merged.push(Array.from(d));
      added += 1;
    }
  }
  const dropped = Math.max(0, merged.length - FACE_TEMPLATE_MAX);
  return { merged: dropped ? merged.slice(dropped) : merged, added, stored, dropped };
}

export default function FaceEnrollmentDialog({ isOpen, onClose, user, onSuccess }) {
  const [faceDescriptors, setFaceDescriptors] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [mergeInfo, setMergeInfo] = useState(null);
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
    // Stored descriptors never leave the backend, so dedupe within this
    // capture batch only; the enroll_face action merges it against the real
    // stored set and reports the counts.
    const { merged: batch, added: batchAdded } = mergeFaceDescriptors([], faceDescriptors);
    if (!batchAdded) {
      setSaveError("Every capture was a near-duplicate. Vary your pose between captures.");
      return;
    }
    const batchGrade = gradeFor(batch);
    // Only F blocks - a D grade (natural small head turns) still saves; the
    // amber hint under the camera nudges better coverage instead.
    if (batchGrade.grade === "F") {
      setSaveError(`Enrollment quality ${batchGrade.grade}: ${batchGrade.tip}. Recapture with more pose/distance variation.`);
      return;
    }
    const requestSeq = ++saveSeqRef.current;
    const current = () => requestSeq === saveSeqRef.current;
    setIsSaving(true);
    setSaveError("");
    try {
      const result = await enrollFaceDescriptorsAdmin({
        record: user,
        descriptors: batch,
        sessionToken: getSessionToken(),
      });
      if (!current()) return;
      if (!result?.added) {
        setSaveError("These captures match templates already stored - vary your angle, distance, or lighting for new coverage.");
        return;
      }
      setMergeInfo({ added: result.added, total: result.total, dropped: result.dropped });
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
    setEnrollGrade(null);
    setMergeInfo(null);
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
          <DialogDescription className="sr-only">Capture camera images and save face descriptors for clock-in verification.</DialogDescription>
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
            {mergeInfo && (
              <p className="text-xs text-gray-400 mt-1">
                Added {mergeInfo.added} new template{mergeInfo.added === 1 ? "" : "s"} - {mergeInfo.total} stored{mergeInfo.dropped ? ` (${mergeInfo.dropped} oldest rolled off)` : ""}.
              </p>
            )}
          </div>
        ) : (
          <>
            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{saveError}</div>
            )}
            <FaceRecognition 
              key={cameraKey}
              isEnrollment={true}
              onEnrollCapture={handleCapture}
            />

            {enrollGrade?.grade === "D" && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                Enrollment quality D: {enrollGrade.tip}. You can still save - more angles improve recognition.
              </div>
            )}

            {(() => {
              const { added: previewAdded, stored: previewStored } = mergeFaceDescriptors(user?.face_descriptors, faceDescriptors);
              return (
                <div className="text-xs text-gray-500 text-center">
                  {previewStored > 0
                    ? `${previewStored} template${previewStored === 1 ? "" : "s"} already stored - new captures stack on top${previewAdded ? ` (+${previewAdded} new)` : ""}.`
                    : "First enrollment - captures from multiple angles build the profile."}
                </div>
              );
            })()}

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