import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Loader2,
  UserX,
  RefreshCw,
  Scan,
  Square
} from "lucide-react";
import {
  createFaceMatcher,
  createFaceScanSession,
  detectDetailedFace,
  descriptorDistance,
  estimateFaceBrightness,
  FACE_QUALITY,
  loadFaceModelsOnce,
  passesFaceQualityGate,
} from '@/components/timeclock/faceScanRuntime';

const ENROLL_TARGET = 10;
const ENROLL_TICK_MS = 250;
// Captures closer than this distance are near-duplicates of the same pose -
// rejecting them forces the template set to cover different angles and
// distances, which is what makes recognition robust on other cameras.
const ENROLL_MIN_POSE_DISTANCE = 0.08;
const ENROLL_MAX_STALL = 8;

const SCAN_STATUS_TEXT = {
  "no-face": "No face detected. Look at camera.",
  "low-quality": "Move closer and face the camera for a clearer scan.",
  dim: "Lighting is dim. Move to better light or closer to the camera.",
  "no-match": "Face not recognized. Hold still and look at the camera.",
  verifying: "Face detected, verifying...",
};

export default function FaceRecognition({ allUsers, onRecognized, isEnrollment = false, onEnrollCapture, mode, onFaceDetected, onCancel }) {
  // Support both old and new prop names
  const isEnrollMode = isEnrollment || mode === "enroll";
  const handleEnrollCapture = onEnrollCapture || onFaceDetected;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanSessionRef = useRef(null);
  const enrollIntervalRef = useRef(null);
  const enrollBusyRef = useRef(false);
  const enrollStallRef = useRef(0);
  const capturedRef = useRef([]);
  const matchFace = useMemo(() => createFaceMatcher(allUsers || []), [allUsers]);
  const matchFaceRef = useRef(matchFace);
  matchFaceRef.current = matchFace;
  const enrollCaptureRef = useRef(handleEnrollCapture);
  enrollCaptureRef.current = handleEnrollCapture;

  const [errorMsg, setErrorMsg] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [recognizedUser, setRecognizedUser] = useState(null);
  const [scanStatus, setScanStatus] = useState("Initializing...");
  const [capturedDescriptors, setCapturedDescriptors] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [autoCapturing, setAutoCapturing] = useState(false);

  // Start the camera and load the models in parallel - the old flow waited for
  // the camera before even starting the model download, which added seconds to
  // every open of this component.
  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera error:", err);
        if (mounted) setErrorMsg("Camera access denied. Please allow camera permissions.");
      }
    };

    const loadModels = async () => {
      try {
        await loadFaceModelsOnce();
        if (mounted) setModelsLoaded(true);
      } catch (err) {
        console.error("Model load error:", err);
        if (mounted) setErrorMsg("Failed to load face recognition models.");
      }
    };

    startCamera();
    loadModels();

    return () => {
      mounted = false;
      scanSessionRef.current?.stop();
      scanSessionRef.current = null;
      if (enrollIntervalRef.current) {
        clearInterval(enrollIntervalRef.current);
        enrollIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleVideoPlaying = () => {
    setCameraReady(true);
    if (!modelsLoaded) setScanStatus("Loading face models...");
  };

  // Recognition mode auto-starts once both the camera and models are ready.
  useEffect(() => {
    if (modelsLoaded && cameraReady && !isEnrollMode && !isScanning) {
      startScanning();
    }
  }, [modelsLoaded, cameraReady, isEnrollMode]);

  useEffect(() => {
    if (isEnrollMode && modelsLoaded && cameraReady) {
      setScanStatus("Ready! Position your face and click Start Auto-Capture.");
    }
  }, [isEnrollMode, modelsLoaded, cameraReady]);

  const handleScanFrame = ({ status, detection, winner }) => {
    if (status === "recognized" && winner) {
      scanSessionRef.current?.stop();
      setIsScanning(false);
      setRecognizedUser(winner);
      setScanStatus(`Recognized: ${winner.full_name || winner.email}`);
      onRecognized?.(winner, Array.from(detection.descriptor));
      return;
    }
    setScanStatus(SCAN_STATUS_TEXT[status] || "Scanning...");
  };

  const startScanning = () => {
    scanSessionRef.current?.stop();
    const session = createFaceScanSession({
      getVideo: () => videoRef.current,
      matchFace: (descriptor) => matchFaceRef.current(descriptor),
      onFrame: handleScanFrame,
    });
    scanSessionRef.current = session;
    setIsScanning(true);
    setRecognizedUser(null);
    setScanStatus("Looking for face...");
    session.start();
  };

  const stopScanning = () => {
    setIsScanning(false);
    scanSessionRef.current?.stop();
    scanSessionRef.current = null;
  };

  // Enrollment captures continuously while a good frame is available. Poses
  // that are near-duplicates of an accepted capture are rejected (with a stall
  // bypass so a stationary camera can never deadlock), which spreads the ten
  // stored templates across angles and distances instead of one repeated pose.
  const captureEnrollmentTick = async () => {
    if (enrollBusyRef.current || !videoRef.current || !modelsLoaded) return;
    enrollBusyRef.current = true;
    try {
      const detection = await detectDetailedFace(videoRef.current);
      if (!detection || !passesFaceQualityGate(detection)) {
        setScanStatus("No clear face - look at the camera.");
        return;
      }
      const brightness = estimateFaceBrightness(videoRef.current, detection.detection.box);
      if (Number.isFinite(brightness) && brightness < FACE_QUALITY.minBrightness) {
        setScanStatus("Lighting is too dim to enroll well. Move to better light.");
        return;
      }
      const descriptor = detection.descriptor;
      const prev = capturedRef.current;
      if (prev.length >= ENROLL_TARGET) return;
      const duplicate = prev.some(d => descriptorDistance(d, descriptor) < ENROLL_MIN_POSE_DISTANCE);
      if (duplicate && enrollStallRef.current < ENROLL_MAX_STALL) {
        enrollStallRef.current += 1;
        setScanStatus(`Captured ${prev.length}/${ENROLL_TARGET} - turn your head slightly for a new angle.`);
        return;
      }
      enrollStallRef.current = 0;
      const next = [...prev, Array.from(descriptor)];
      capturedRef.current = next;
      setCapturedDescriptors(next);
      if (next.length >= ENROLL_TARGET) {
        stopAutoEnrollment();
        setScanStatus("Ready to save!");
        enrollCaptureRef.current?.(next);
      } else {
        setScanStatus(`Captured ${next.length}/${ENROLL_TARGET} - turn slightly for the next angle.`);
      }
    } catch (err) {
      console.warn("Enrollment capture warning:", err);
    } finally {
      enrollBusyRef.current = false;
    }
  };

  const startAutoEnrollment = () => {
    capturedRef.current = [];
    setCapturedDescriptors([]);
    enrollStallRef.current = 0;
    setAutoCapturing(true);
    setScanStatus("Capturing automatically - hold still, then turn your head slightly between captures.");
    enrollIntervalRef.current = setInterval(captureEnrollmentTick, ENROLL_TICK_MS);
  };

  const stopAutoEnrollment = () => {
    setAutoCapturing(false);
    if (enrollIntervalRef.current) {
      clearInterval(enrollIntervalRef.current);
      enrollIntervalRef.current = null;
    }
  };

  const resetEnrollment = () => {
    stopAutoEnrollment();
    capturedRef.current = [];
    setCapturedDescriptors([]);
    enrollStallRef.current = 0;
    setScanStatus("Camera ready.");
  };

  // Reticle color tracks the live scan state - indigo scanning, amber
  // verifying or dim-light, green on a confirmed identity.
  const scanTone = recognizedUser ? "success"
    : scanStatus.toLowerCase().includes("verifying") ? "verifying"
    : scanStatus.toLowerCase().includes("dim") ? "dim" : "scanning";

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <UserX className="w-10 h-10 text-red-500 mb-4" />
        <p className="text-red-600 text-center mb-4">{errorMsg}</p>
        <Button onClick={() => window.location.reload()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh Page
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-4">
        <Camera className="w-5 h-5 text-purple-600" />
        <h3 className="font-semibold">{isEnrollment ? "Face Enrollment" : "Face Recognition"}</h3>
      </div>

      {/* Video */}
      <div className="relative rounded-2xl overflow-hidden bg-gray-900 mb-4" style={{ width: 320, height: 240 }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onPlaying={handleVideoPlaying}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
            display: "block"
          }}
        />
        {!cameraReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-2" />
            <p className="text-white text-sm">Starting camera...</p>
          </div>
        )}
        <canvas ref={canvasRef} width={320} height={240} className="absolute inset-0 pointer-events-none" />

        {isScanning && !recognizedUser && (
          <div className={`scan-reticle scan-tone-${scanTone}`} aria-hidden="true">
            <div className="scan-bracket tl" />
            <div className="scan-bracket tr" />
            <div className="scan-bracket bl" />
            <div className="scan-bracket br" />
            <div className="scan-oval" />
            <div className="scan-line" />
          </div>
        )}

        {autoCapturing && capturedDescriptors.length < ENROLL_TARGET && (
          <div className="absolute inset-x-0 bottom-0 bg-black/50 py-1.5 text-center">
            <span className="text-xs font-medium text-white">
              Capturing {capturedDescriptors.length}/{ENROLL_TARGET}
            </span>
          </div>
        )}

        {recognizedUser && (
          <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
            <div className="success-burst" />
            <div className="bg-white/90 px-4 py-2 rounded-full flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path className="check-draw" d="M4 12.5l5 5L20 6.5" />
              </svg>
              <span className="font-medium text-green-700">{recognizedUser.full_name}</span>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <p className={`text-sm mb-4 text-center font-medium transition-colors duration-300 ${
        recognizedUser ? "text-green-600"
        : scanTone === "verifying" || scanTone === "dim" ? "text-amber-600"
        : "text-gray-600"}`}>
        {scanStatus}
      </p>

      {/* Controls */}
      {isEnrollMode ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            {[...Array(ENROLL_TARGET)].map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full ${capturedDescriptors.length > i ? "bg-green-500" : "bg-gray-300"}`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {!autoCapturing ? (
              <Button
                onClick={startAutoEnrollment}
                disabled={capturedDescriptors.length >= ENROLL_TARGET || !modelsLoaded}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                <Camera className="w-4 h-4" />
                Start Auto-Capture
              </Button>
            ) : (
              <Button
                onClick={() => { stopAutoEnrollment(); setScanStatus("Auto-capture stopped."); }}
                variant="outline"
                className="gap-2"
              >
                Stop
              </Button>
            )}
            {capturedDescriptors.length > 0 && !autoCapturing && (
              <Button variant="outline" onClick={resetEnrollment}>Reset</Button>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center max-w-xs">
            Captures {ENROLL_TARGET} poses automatically. Turn your head slightly left, right, up, and down between captures so recognition works from every angle and distance.
          </p>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} className="mt-2">
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <div className="flex gap-3">
          {isScanning ? (
            <Button onClick={stopScanning} variant="outline" className="gap-2">
              <Square className="w-4 h-4" />
              Stop
            </Button>
          ) : (
            <Button onClick={startScanning} className="gap-2 bg-purple-600 hover:bg-purple-700" disabled={!modelsLoaded}>
              <Scan className="w-4 h-4" />
              Start Scan
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
