import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { 
  Camera, 
  Loader2, 
  UserCheck, 
  UserX, 
  RefreshCw,
  Scan,
  Square
} from "lucide-react";
import * as faceapi from "face-api.js";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";

export default function FaceRecognition({ allUsers, onRecognized, isEnrollment = false, onEnrollCapture, mode, onFaceDetected, onCancel }) {
  // Support both old and new prop names
  const isEnrollMode = isEnrollment || mode === "enroll";
  const handleEnrollCapture = onEnrollCapture || onFaceDetected;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  
  const [errorMsg, setErrorMsg] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [recognizedUser, setRecognizedUser] = useState(null);
  const [scanStatus, setScanStatus] = useState("Initializing...");
  const [capturedDescriptors, setCapturedDescriptors] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [autoCapturing, setAutoCapturing] = useState(false);
  const countdownIntervalRef = useRef(null);

  // Start camera
  useEffect(() => {
    let mounted = true;
    
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" }
        });
        
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera error:", err);
        if (mounted) {
          setErrorMsg("Camera access denied. Please allow camera permissions.");
        }
      }
    };
    
    startCamera();
    
    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Handle video playing
  const handleVideoPlaying = () => {
    setCameraReady(true);
    setScanStatus("Loading face models...");
  };

  // Load models after camera is ready, then auto-start scanning in recognition mode
  useEffect(() => {
    if (!cameraReady) return;
    
    let mounted = true;
    
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        if (mounted) {
          setModelsLoaded(true);
          if (!isEnrollMode) {
            // Auto-start scanning for recognition mode
            setScanStatus("Looking for face...");
          } else {
            setScanStatus("Ready! Position your face and click Capture.");
          }
        }
      } catch (err) {
        console.error("Model load error:", err);
        if (mounted) {
          setErrorMsg("Failed to load face recognition models.");
        }
      }
    };
    
    loadModels();
    
    return () => { mounted = false; };
  }, [cameraReady, isEnrollMode]);

  // Auto-start scanning when models are loaded (recognition mode only)
  useEffect(() => {
    if (modelsLoaded && !isEnrollMode && !isScanning) {
      startScanning();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsLoaded]);

  const detectFace = async () => {
    if (!videoRef.current || !modelsLoaded) return null;
    
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      return detection;
    } catch (err) {
      console.error("Detection error:", err);
      return null;
    }
  };

  const findMatchingUser = (descriptor) => {
    let bestMatch = null;
    let bestDistance = Infinity;
    // Stricter threshold: 0.45 instead of 0.6 for better accuracy with similar faces
    const CONFIDENCE_THRESHOLD = 0.45;
    // Require match to be at least this much better than second-best to avoid ambiguity
    const SEPARATION_RATIO = 1.25;

    const allMatches = [];

    for (const user of allUsers) {
      if (!user.face_descriptors?.length) continue;
      
      let userBestDistance = Infinity;
      for (const stored of user.face_descriptors) {
        const distance = faceapi.euclideanDistance(descriptor, new Float32Array(stored));
        userBestDistance = Math.min(userBestDistance, distance);
      }
      
      allMatches.push({ user, distance: userBestDistance });
      if (userBestDistance < bestDistance) {
        bestDistance = userBestDistance;
        bestMatch = user;
      }
    }

    // Only return match if it's confident AND clearly better than alternatives
    if (bestDistance <= CONFIDENCE_THRESHOLD && allMatches.length > 0) {
      allMatches.sort((a, b) => a.distance - b.distance);
      const secondBest = allMatches[1]?.distance || Infinity;
      
      // Ensure best match is significantly better than runner-up
      if (secondBest / bestDistance >= SEPARATION_RATIO) {
        return bestMatch;
      }
    }
    
    return null;
  };

  const startScanning = () => {
    setIsScanning(true);
    setRecognizedUser(null);
    setScanStatus("Looking for face...");
    
    scanIntervalRef.current = setInterval(async () => {
      const detection = await detectFace();
      if (detection) {
        setScanStatus("Face detected, identifying...");
        const user = findMatchingUser(detection.descriptor);
        if (user) {
          setRecognizedUser(user);
          setScanStatus(`Recognized: ${user.full_name || user.email}`);
          stopScanning();
          onRecognized?.(user);
        } else {
          setScanStatus("Face not recognized.");
        }
      } else {
        setScanStatus("No face detected. Look at camera.");
      }
    }, 1000);
  };

  const stopScanning = () => {
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  const captureForEnrollment = async () => {
    setScanStatus("Capturing...");
    const detection = await detectFace();
    
    if (detection) {
      const newDescriptors = [...capturedDescriptors, Array.from(detection.descriptor)];
      setCapturedDescriptors(newDescriptors);
      
      if (newDescriptors.length >= 5) {
        setScanStatus("Ready to save!");
        setAutoCapturing(false);
        handleEnrollCapture?.(newDescriptors);
      } else {
        setScanStatus(`Captured ${newDescriptors.length}/5. Move slightly...`);
        // Auto-start next countdown
        startCountdown(newDescriptors);
      }
    } else {
      setScanStatus("No face detected. Look directly at camera.");
      // Retry countdown
      if (autoCapturing) {
        startCountdown(capturedDescriptors);
      }
    }
  };

  const startCountdown = (currentDescriptors) => {
    if (currentDescriptors.length >= 10) return;
    
    setAutoCapturing(true);
    setCountdown(3);
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          // Capture after countdown
          setTimeout(() => captureForEnrollmentAuto(currentDescriptors), 100);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const captureForEnrollmentAuto = async (currentDescriptors) => {
    setScanStatus("Capturing...");
    const detection = await detectFace();
    
    if (detection) {
      const newDescriptors = [...currentDescriptors, Array.from(detection.descriptor)];
      setCapturedDescriptors(newDescriptors);
      
      if (newDescriptors.length >= 5) {
       setScanStatus("Ready to save!");
       setAutoCapturing(false);
       handleEnrollCapture?.(newDescriptors);
      } else {
       setScanStatus(`Captured ${newDescriptors.length}/5. Move slightly...`);
       // Auto-start next countdown
       setTimeout(() => startCountdown(newDescriptors), 500);
      }
    } else {
      setScanStatus("No face detected. Retrying...");
      // Retry countdown
      setTimeout(() => startCountdown(currentDescriptors), 500);
    }
  };

  const startAutoEnrollment = () => {
    setCapturedDescriptors([]);
    setScanStatus("Starting auto-capture...");
    startCountdown([]);
  };

  const stopAutoEnrollment = () => {
    setAutoCapturing(false);
    setCountdown(null);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setScanStatus("Auto-capture stopped.");
  };

  const resetEnrollment = () => {
    setCapturedDescriptors([]);
    setAutoCapturing(false);
    setCountdown(null);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setScanStatus("Camera ready.");
  };

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
        
        {isScanning && (
          <div className="absolute inset-0 border-4 border-purple-500 animate-pulse rounded-2xl" />
        )}
        
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-7xl font-bold text-white drop-shadow-lg animate-pulse">
              {countdown}
            </div>
          </div>
        )}
        
        {recognizedUser && (
          <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
            <div className="bg-white/90 px-4 py-2 rounded-full flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-700">{recognizedUser.full_name}</span>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <p className={`text-sm mb-4 text-center ${recognizedUser ? "text-green-600" : "text-gray-600"}`}>
        {scanStatus}
      </p>

      {/* Controls */}
      {isEnrollMode ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div 
                key={i}
                className={`w-4 h-4 rounded-full ${capturedDescriptors.length >= i ? "bg-green-500" : "bg-gray-300"}`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {!autoCapturing ? (
              <Button 
                onClick={startAutoEnrollment}
                disabled={capturedDescriptors.length >= 3 || !modelsLoaded}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                <Camera className="w-4 h-4" />
                Start Auto-Capture
              </Button>
            ) : (
              <Button 
                onClick={stopAutoEnrollment}
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
            Auto-captures 5 photos with a 3-second countdown. Move your head slightly between captures for better accuracy.
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
            <Button onClick={startScanning} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <Scan className="w-4 h-4" />
              Start Scan
            </Button>
          )}
        </div>
      )}
    </div>
  );
}