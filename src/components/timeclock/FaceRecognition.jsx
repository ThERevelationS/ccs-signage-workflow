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

export default function FaceRecognition({ allUsers, onRecognized, isEnrollment = false, onEnrollCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  
  const [status, setStatus] = useState("init"); // init, loading, ready, error
  const [errorMsg, setErrorMsg] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [recognizedUser, setRecognizedUser] = useState(null);
  const [scanStatus, setScanStatus] = useState("");
  const [capturedDescriptors, setCapturedDescriptors] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      setStatus("loading");
      
      // Step 1: Get camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" }
        });
        
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("Camera error:", err);
        if (mounted) {
          setErrorMsg("Camera access denied. Please allow camera permissions.");
          setStatus("error");
        }
        return;
      }
      
      // Step 2: Load face models
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        if (mounted) {
          setModelsLoaded(true);
          setStatus("ready");
          setScanStatus("Camera ready. Position your face and click Capture.");
        }
      } catch (err) {
        console.error("Model load error:", err);
        if (mounted) {
          setErrorMsg("Failed to load face recognition models.");
          setStatus("error");
        }
      }
    };
    
    init();
    
    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

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
    let bestDistance = 0.6;

    for (const user of allUsers) {
      if (!user.face_descriptors?.length) continue;
      
      for (const stored of user.face_descriptors) {
        const distance = faceapi.euclideanDistance(descriptor, new Float32Array(stored));
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
      setScanStatus(`Captured ${newDescriptors.length}/3. ${newDescriptors.length < 3 ? "Move slightly and capture again." : "Ready to save!"}`);
      
      if (newDescriptors.length >= 3) {
        onEnrollCapture?.(newDescriptors);
      }
    } else {
      setScanStatus("No face detected. Look directly at camera with good lighting.");
    }
  };

  const resetEnrollment = () => {
    setCapturedDescriptors([]);
    setScanStatus("Camera ready.");
  };

  if (status === "loading" || status === "init") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600 mb-4" />
        <p className="text-gray-600 font-medium">Starting camera...</p>
        <p className="text-xs text-gray-400 mt-1">Please allow camera access if prompted</p>
      </div>
    );
  }

  if (status === "error") {
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
      <div className="relative rounded-2xl overflow-hidden bg-black mb-4" style={{ width: 320, height: 240 }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          width={320}
          height={240}
          style={{ width: 320, height: 240, objectFit: "cover", transform: "scaleX(-1)" }}
        />
        <canvas ref={canvasRef} width={320} height={240} className="absolute inset-0 pointer-events-none" />
        
        {isScanning && (
          <div className="absolute inset-0 border-4 border-purple-500 animate-pulse rounded-2xl" />
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
      {isEnrollment ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(i => (
              <div 
                key={i}
                className={`w-4 h-4 rounded-full ${capturedDescriptors.length >= i ? "bg-green-500" : "bg-gray-300"}`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <Button 
              onClick={captureForEnrollment}
              disabled={capturedDescriptors.length >= 3}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <Camera className="w-4 h-4" />
              Capture ({capturedDescriptors.length}/3)
            </Button>
            {capturedDescriptors.length > 0 && (
              <Button variant="outline" onClick={resetEnrollment}>Reset</Button>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center max-w-xs">
            Capture 3 samples. Move your head slightly between captures.
          </p>
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