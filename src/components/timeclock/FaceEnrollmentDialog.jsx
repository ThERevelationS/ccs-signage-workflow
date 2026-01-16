import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  UserPlus, 
  Save, 
  Loader2,
  CheckCircle2
} from "lucide-react";
import FaceRecognition from "./FaceRecognition";

const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function FaceEnrollmentDialog({ isOpen, onClose, user, onSuccess }) {
  const [faceDescriptors, setFaceDescriptors] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);

  // Reset camera key when dialog opens to force fresh mount
  useEffect(() => {
    if (isOpen) {
      setCameraKey(prev => prev + 1);
    }
  }, [isOpen]);

  const handleCapture = (descriptors) => {
    setFaceDescriptors(descriptors);
  };

  const handleSave = async () => {
    if (faceDescriptors.length < 3) return;
    
    setIsSaving(true);
    try {
      await AuthorizedEmail.update(user.id, {
        face_descriptors: faceDescriptors
      });
      setSaved(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error saving face data:", err);
    }
    setIsSaving(false);
  };

  const handleClose = () => {
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
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <p className="text-lg font-medium text-green-600">Face Enrolled Successfully!</p>
            <p className="text-sm text-gray-500 mt-1">
              {user?.full_name} can now clock in using facial recognition.
            </p>
          </div>
        ) : (
          <>
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