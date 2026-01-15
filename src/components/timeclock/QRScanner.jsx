import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, QrCode } from "lucide-react";

export default function QRScanner({ onScan, allUsers }) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  const startScanning = async () => {
    setError("");
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-reader");
      }

      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Check if it's a valid time clock QR code
          if (decodedText.startsWith("TIMECLOCK:")) {
            const email = decodedText.replace("TIMECLOCK:", "");
            const user = allUsers.find(u => u.email === email);
            if (user) {
              onScan(user);
              // Brief pause before continuing to scan
              html5QrCodeRef.current?.pause();
              setTimeout(() => {
                html5QrCodeRef.current?.resume();
              }, 2000);
            } else {
              setError("User not found");
            }
          }
        },
        () => {} // Ignore scan failures
      );
      setIsScanning(true);
    } catch (err) {
      console.error("Scanner error:", err);
      setError("Could not access camera. Please ensure camera permissions are granted.");
    }
  };

  const stopScanning = async () => {
    try {
      if (html5QrCodeRef.current?.isScanning) {
        await html5QrCodeRef.current.stop();
      }
      setIsScanning(false);
    } catch (err) {
      console.error("Stop scanner error:", err);
    }
  };

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="clay-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold">QR Badge Scanner</h3>
        </div>
        <Button
          variant={isScanning ? "destructive" : "default"}
          size="sm"
          onClick={isScanning ? stopScanning : startScanning}
          className="gap-2"
        >
          {isScanning ? (
            <>
              <CameraOff className="w-4 h-4" />
              Stop Scanner
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              Start Scanner
            </>
          )}
        </Button>
      </div>
      
      <div 
        id="qr-reader" 
        ref={scannerRef}
        className={`rounded-xl overflow-hidden ${isScanning ? 'block' : 'hidden'}`}
        style={{ width: '100%' }}
      />
      
      {!isScanning && (
        <div className="bg-gray-100 rounded-xl p-8 text-center">
          <Camera className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Click "Start Scanner" to scan QR badges</p>
        </div>
      )}
      
      {error && (
        <p className="text-red-500 text-sm mt-2 text-center">{error}</p>
      )}
    </div>
  );
}