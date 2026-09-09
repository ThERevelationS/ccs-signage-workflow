import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { 
  Clock, 
  Play, 
  Square, 
  User,
  Loader2,
  Camera,
  X
} from "lucide-react";
import { format } from "date-fns";
import ClockOutDialog from "@/components/timeclock/ClockOutDialog";
import { clockOutTimeEntryIfUnchanged, createActiveTimeEntryIfAbsent } from "@/components/timeclock/timeEntryPersistence";
import * as faceapi from "face-api.js";
import { Html5Qrcode } from "html5-qrcode";

const TimeEntry = base44.entities.TimeEntry;
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";

export default function QuickClockSection({ allUsers, currentTime }) {
  const [activeEntry, setActiveEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showClockOut, setShowClockOut] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [notification, setNotification] = useState(null);
  const [persistenceError, setPersistenceError] = useState("");
  
  // Recognition state
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionMode, setRecognitionMode] = useState(null); // "in" or "out"
  const [recognitionStatus, setRecognitionStatus] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  
  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const qrScannerRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const modelsLoadedRef = useRef(false);

  useEffect(() => {
    return () => {
      stopRecognition();
    };
  }, []);

  const showNotification = (type, userName, time) => {
    setNotification({ type, userName, time });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadFaceModels = async () => {
    if (modelsLoadedRef.current) return true;
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      modelsLoadedRef.current = true;
      return true;
    } catch (err) {
      console.error("Error loading face models:", err);
      return false;
    }
  };

  const startRecognition = async (mode) => {
    // Prevent double-starts
    if (streamRef.current) return;
    
    setRecognitionMode(mode);
    setIsRecognizing(true);
    setRecognitionStatus("Starting camera...");
    setShowManualEntry(false);
    setUsernameInput("");
    setUsernameError("");

    try {
      // Start video stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise(resolve => {
          videoRef.current.onloadedmetadata = resolve;
        });
        await videoRef.current.play();
      }

      // Load face models in background
      loadFaceModels();

      // Start QR scanner - delay slightly to avoid conflicts
      setTimeout(async () => {
        try {
          if (!qrScannerRef.current) {
            qrScannerRef.current = new Html5Qrcode("hybrid-qr-reader");
          }
          await qrScannerRef.current.start(
            { facingMode: "user" },
            { fps: 5, qrbox: { width: 200, height: 200 } },
            (decodedText) => {
              if (decodedText.startsWith("TIMECLOCK:")) {
                const email = decodedText.replace("TIMECLOCK:", "");
                const user = allUsers.find(u => u.email === email);
                if (user) {
                  handleUserRecognized(user);
                }
              }
            },
            () => {}
          );
        } catch (qrErr) {
          console.log("QR scanner error (may already be running):", qrErr);
        }
      }, 500);

      setRecognitionStatus("Look at camera or show QR badge...");

      // Start face detection loop
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !modelsLoadedRef.current) return;

        try {
          const detection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            // Try to match face
            const user = findMatchingUser(detection.descriptor);
            if (user) {
              handleUserRecognized(user);
            }
          }
        } catch (err) {
          // Ignore detection errors
        }
      }, 1000);

    } catch (err) {
      console.error("Camera error:", err);
      setRecognitionStatus("Camera access denied");
      setShowManualEntry(true);
    }
  };

  const findMatchingUser = (descriptor) => {
    let bestMatch = null;
    let bestDistance = 0.55; // Threshold

    for (const user of allUsers) {
      if (!user.face_descriptors || user.face_descriptors.length === 0) continue;
      
      for (const storedDescriptor of user.face_descriptors) {
        const distance = faceapi.euclideanDistance(descriptor, new Float32Array(storedDescriptor));
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = user;
        }
      }
    }
    
    return bestMatch;
  };

  const handleUserRecognized = async (user) => {
    // Stop scanning but keep UI visible
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (qrScannerRef.current?.isScanning) {
      qrScannerRef.current.stop().catch(() => {});
      qrScannerRef.current = null;
    }
    
    setSelectedUser(user);
    setRecognitionStatus(`Welcome, ${user.full_name || user.email}!`);

    // Stop video stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsRecognizing(false);

    // Check if user is currently clocked in. Never choose an arbitrary row if
    // payroll history already contains multiple active entries for this user.
    setIsLoading(true);
    const entries = await TimeEntry.filter({ user_email: user.email, status: "clocked_in" });
    setIsLoading(false);
    
    if (entries.length > 1) {
      setPersistenceError(`Multiple active time entries were found for ${user.email}. No clock-out row was selected automatically; an admin must review the duplicates.`);
      setRecognitionStatus("Multiple active entries require admin review.");
    } else if (entries.length === 1) {
      setPersistenceError("");
      setActiveEntry(entries[0]);
      setShowClockOut(true);
    } else {
      // User is not clocked in, clock them in
      await performClockIn(user);
    }
  };

  const stopRecognition = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    if (qrScannerRef.current?.isScanning) {
      qrScannerRef.current.stop().catch(() => {});
      qrScannerRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsRecognizing(false);
  };

  const resetState = () => {
    stopRecognition();
    setSelectedUser(null);
    setActiveEntry(null);
    setShowClockOut(false);
    setRecognitionMode(null);
    setRecognitionStatus("");
    setShowManualEntry(false);
    setUsernameInput("");
    setUsernameError("");
  };

  const performClockIn = async (user) => {
    setIsLoading(true);
    setPersistenceError("");
    try {
      const clockInTime = new Date();
      const result = await createActiveTimeEntryIfAbsent({
        entity: TimeEntry,
        data: {
          user_email: user.email,
          user_name: user.full_name || user.email,
          clock_in: clockInTime.toISOString(),
          status: "clocked_in"
        },
        label: `Quick Clock entry for ${user.full_name || user.email}`,
      });
      setIsLoading(false);
      if (result.status === "existing" || result.status === "reused") {
        setActiveEntry(result.record);
        setRecognitionStatus("Already clocked in. No duplicate entry was created.");
        setTimeout(() => resetState(), 3000);
        return;
      }
      showNotification("in", user.full_name || user.email, format(new Date(result.record.clock_in || clockInTime), "h:mm a"));
      // Keep showing success for longer before resetting
      setTimeout(() => resetState(), 5000);
    } catch (err) {
      console.error("Clock in error:", err);
      setIsLoading(false);
      setPersistenceError(err?.message || "Clock-in could not be saved safely. Reload before trying again.");
      setRecognitionStatus("Clock-in blocked. Review the message below.");
    }
  };

  const handleClockOut = async (data) => {
    if (!activeEntry?.id) return;
    setPersistenceError("");
    try {
      const clockOutTime = new Date(data.clockOutTime);
      await clockOutTimeEntryIfUnchanged({
        entity: TimeEntry,
        entry: activeEntry,
        clockOutData: data,
        label: `Quick Clock clock-out for ${activeEntry.user_name || activeEntry.user_email || activeEntry.id}`,
      });
      showNotification("out", selectedUser?.full_name || "User", format(clockOutTime, "h:mm a"));
      setShowClockOut(false);
      setTimeout(() => resetState(), 2000);
    } catch (err) {
      console.error("Clock out error:", err);
      setPersistenceError(err?.message || "This time entry changed in another session. It was not clocked out from this stale screen.");
      setRecognitionStatus("Clock-out blocked. Review the message below.");
    }
  };

  const handleManualSubmit = async () => {
    const trimmed = usernameInput.trim().toLowerCase();
    if (!trimmed) {
      setUsernameError("Please enter a username");
      return;
    }
    
    const user = allUsers.find(u => u.username?.toLowerCase() === trimmed);
    if (user) {
      handleUserRecognized(user);
    } else {
      setUsernameError("Username not found");
    }
  };

  return (
    <>
      {/* Notification Bubble - Large and Prominent */}
      {notification && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50`}
          onClick={() => setNotification(null)}
        >
          <div 
            className={`px-12 py-10 rounded-3xl shadow-2xl text-center transform animate-in zoom-in-95 ${
              notification.type === "in" 
                ? "bg-green-500 text-white" 
                : "bg-orange-500 text-white"
            }`}
          >
            <div className="flex flex-col items-center gap-4">
              {notification.type === "in" ? (
                <Play className="w-16 h-16" />
              ) : (
                <Square className="w-16 h-16" />
              )}
              <div>
                <p className="text-3xl font-bold mb-2">{notification.userName}</p>
                <p className="text-xl">
                  Successfully Clocked {notification.type === "in" ? "In" : "Out"}
                </p>
                <p className="text-2xl font-semibold mt-2">{notification.time}</p>
              </div>
              <p className="text-sm opacity-75 mt-4">Tap anywhere to dismiss</p>
            </div>
          </div>
        </div>
      )}

      <div className="clay-card p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" />
          Quick Clock In/Out
        </h2>

        {persistenceError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Time clock action blocked</div>
              <div className="mt-1 text-xs">{persistenceError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={() => setPersistenceError("")}>Dismiss</Button>
          </div>
        )}

        {/* Main View - Single Clock In/Out Button */}
        {!isRecognizing && !showClockOut && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-gray-600 text-center">
              Tap the button, then look at the camera or show your QR badge
            </p>
            
            <button 
              onClick={() => startRecognition("auto")}
              disabled={isLoading}
              className="relative w-64 h-32 rounded-2xl shadow-lg disabled:opacity-50 overflow-hidden hover:scale-105 transition-transform"
            >
              {/* Green half (top-left) */}
              <div 
                className="absolute inset-0 bg-green-600"
                style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
              />
              {/* Red half (bottom-right) */}
              <div 
                className="absolute inset-0 bg-red-600"
                style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
              />
              {/* Labels */}
              <div className="absolute top-4 left-6 text-white flex items-center gap-2">
                <Play className="w-6 h-6" />
                <span className="text-xl font-bold">In</span>
              </div>
              <div className="absolute bottom-4 right-6 text-white flex items-center gap-2">
                <span className="text-xl font-bold">Out</span>
                <Square className="w-6 h-6" />
              </div>
            </button>
            {isLoading && <Loader2 className="w-6 h-6 animate-spin text-purple-600" />}
          </div>
        )}

        {/* Recognition View */}
        {isRecognizing && (
          <div className="flex flex-col items-center">
            <div className="relative mb-4">
              {/* Video feed */}
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-80 h-60 object-cover rounded-2xl bg-gray-900"
              />
              
              {/* Hidden QR reader element */}
              <div id="hybrid-qr-reader" className="hidden" />
              
              {/* Scanning overlay */}
              <div className={`absolute inset-0 border-4 rounded-2xl animate-pulse ${
                recognitionMode === "in" ? "border-green-500" : "border-red-500"
              }`} />
              
              {/* Cancel button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={resetState}
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Status */}
            <div className="px-4 py-2 rounded-full mb-4 bg-purple-100 text-purple-700">
              <p className="font-medium flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </p>
            </div>

            <p className="text-gray-600 mb-4 flex items-center gap-2">
              {recognitionStatus}
            </p>

            {/* Manual entry fallback */}
            {!showManualEntry ? (
              <Button 
                variant="link" 
                onClick={() => setShowManualEntry(true)}
                className="text-purple-600"
              >
                Enter username manually instead
              </Button>
            ) : (
              <div className="w-full max-w-xs space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      value={usernameInput}
                      onChange={(e) => {
                        setUsernameInput(e.target.value);
                        setUsernameError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                      placeholder="Enter username..."
                      className="pl-10"
                      autoFocus
                    />
                  </div>
                  <Button onClick={handleManualSubmit} className="bg-purple-600 hover:bg-purple-700">
                    Go
                  </Button>
                </div>
                {usernameError && (
                  <p className="text-red-500 text-sm text-center">{usernameError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        )}
      </div>

      {showClockOut && activeEntry && selectedUser && (
        <ClockOutDialog
          isOpen={showClockOut}
          onClose={() => {
            setShowClockOut(false);
            resetState();
          }}
          timeEntry={activeEntry}
          userName={selectedUser.full_name || selectedUser.email}
          onClockOut={handleClockOut}
        />
      )}
    </>
  );
}