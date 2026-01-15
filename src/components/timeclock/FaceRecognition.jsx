import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { 
  Camera, 
  Loader2, 
  UserCheck, 
  UserX, 
  RefreshCw,
  Scan
} from "lucide-react";
import * as faceapi from "face-api.js";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";

export default function FaceRecognition({ allUsers, onRecognized, isEnrollment = false, onEnrollCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [recognizedUser, setRecognizedUser] = useState(null);
  const [scanStatus, setScanStatus] = useState("");
  const [capturedDescriptors, setCapturedDescriptors] = useState([]);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  useEffect(() => {
    loadModels();
    return () => {
      stopCamera();
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  const loadModels = async () => {
    setIsLoading(true);
    setError("");
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      setIsModelLoaded(true);
      await startCamera();
    } catch (err) {
      console.error("Error loading face models:", err);
      setError("Failed to load face recognition models. Please refresh.");
    }
    setIsLoading(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setError("Could not access camera. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const detectFace = async () => {
    if (!videoRef.current || !isModelLoaded) return null;
    
    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    return detection;
  };

  const findMatchingUser = (descriptor) => {
    let bestMatch = null;
    let bestDistance = 0.6; // Threshold - lower is stricter

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
          onRecognized(user);
        } else {
          setScanStatus("Face not recognized. Please try again or use username.");
        }
      } else {
        setScanStatus("No face detected. Please look at the camera.");
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

  // Enrollment mode - capture face for registration
  const captureForEnrollment = async () => {
    setScanStatus("Capturing face...");
    const detection = await detectFace();
    
    if (detection) {
      const newDescriptors = [...capturedDescriptors, Array.from(detection.descriptor)];
      setCapturedDescriptors(newDescriptors);
      setScanStatus(`Captured ${newDescriptors.length}/3 samples. ${newDescriptors.length < 3 ? "Please move slightly and capture again." : "Ready to save!"}`);
      
      if (newDescriptors.length >= 3 && onEnrollCapture) {
        onEnrollCapture(newDescriptors);
      }
    } else {
      setScanStatus("No face detected. Please look at the camera and try again.");
    }
  };

  const resetEnrollment = () => {
    setCapturedDescriptors([]);
    setScanStatus("");
  };

  if (isLoading) {
    return (
      <div className="clay-card p-6 mb-6">
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mb-3" />
          <p className="text-gray-600">Loading face recognition...</p>
          <p className="text-xs text-gray-400 mt-1">This may take a moment on first load</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="clay-card p-6 mb-6">
        <div className="flex flex-col items-center justify-center py-8">
          <UserX className="w-8 h-8 text-red-500 mb-3" />
          <p className="text-red-600">{error}</p>
          <Button onClick={loadModels} className="mt-4 gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="clay-card p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Camera className="w-5 h-5 text-purple-600" />
        {isEnrollment ? "Face Enrollment" : "Face Recognition Clock In"}
      </h2>

      <div className="flex flex-col items-center">
        {/* Video Preview */}
        <div className="relative rounded-2xl overflow-hidden bg-gray-900 mb-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-80 h-60 object-cover"
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-80 h-60"
          />
          
          {/* Scanning overlay */}
          {isScanning && (
            <div className="absolute inset-0 border-4 border-purple-500 animate-pulse rounded-2xl" />
          )}
          
          {/* Recognition success overlay */}
          {recognizedUser && (
            <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
              <div className="bg-white/90 px-4 py-2 rounded-full flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-700">{recognizedUser.full_name}</span>
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        {scanStatus && (
          <p className={`text-sm mb-4 ${recognizedUser ? "text-green-600" : "text-gray-600"}`}>
            {scanStatus}
          </p>
        )}

        {/* Controls */}
        {isEnrollment ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 mb-2">
              {[1, 2, 3].map(i => (
                <div 
                  key={i}
                  className={`w-4 h-4 rounded-full ${
                    capturedDescriptors.length >= i ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={captureForEnrollment}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
                disabled={capturedDescriptors.length >= 3}
              >
                <Camera className="w-4 h-4" />
                Capture Face ({capturedDescriptors.length}/3)
              </Button>
              {capturedDescriptors.length > 0 && (
                <Button variant="outline" onClick={resetEnrollment}>
                  Reset
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center max-w-xs">
              Capture 3 samples for better accuracy. Slightly change your angle between captures.
            </p>
          </div>
        ) : (
          <div className="flex gap-3">
            {isScanning ? (
              <Button onClick={stopScanning} variant="outline" className="gap-2">
                <Square className="w-4 h-4" />
                Stop Scanning
              </Button>
            ) : (
              <Button onClick={startScanning} className="gap-2 bg-purple-600 hover:bg-purple-700">
                <Scan className="w-4 h-4" />
                Start Face Scan
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Square(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}