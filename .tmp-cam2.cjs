const fs = require("fs");
const f = "src/components/timeclock/QuickClockSection.jsx";
let s = fs.readFileSync(f, "utf8");
let applied = 0;

// 1) stopFaceCamera kills the QR tick loop too (shared stream)
const stopAnchor = "  const stopFaceCamera = () => {\n    faceRunRef.current += 1;";
if (s.includes(stopAnchor) && !s.includes("qrLoopRef.current += 1")) {
  s = s.replace(stopAnchor, stopAnchor + "\n    qrLoopRef.current += 1;");
  applied++;
}

// 2) QR decode failure returns to combined camera, not QR-only
const qrFail = `      setIsRecognizing(true);
      setRecognitionMethod("qr");
      recognitionLockedRef.current = false;
    }
  };`;
if (s.includes(qrFail)) {
  s = s.replace(qrFail, `      setIsRecognizing(true);
      setRecognitionMethod("camera");
      recognitionLockedRef.current = false;
    }
  };`);
  applied++;
}

// 3) startRecognition always opens the combined camera
const pick = `    if (canUseFace) await startCameraMode();
    else await startQrMode();`;
if (s.includes(pick)) {
  s = s.replace(pick, "    await startCameraMode();");
  applied++;
}

// 4) Spinner condition includes camera mode
const spin = '{(recognitionMethod === "face" || \nrecognitionMethod === "qr" || isLoading) && <Loader2 className="w-4 h-4 animate-spin" />}';
if (s.includes(spin)) {
  s = s.replace(spin, '{(recognitionMethod === "face" || recognitionMethod === "camera" || \nrecognitionMethod === "qr" || isLoading) && <Loader2 className="w-4 h-4 animate-spin" />}');
  applied++;
}

// 5) Buttons: remove Face/QR method pickers; Username is the only fallback,
//    plus a legacy QR scanner button only when BarcodeDetector is missing.
const faceBtn = `              <Button
                type="button"
                variant={recognitionMethod === "face" ? "default" : "outline"}
                onClick={startCameraMode}
                disabled={isLoading || !canUseFace}
                className="gap-2"
                title={!authoritativeSessionToken ? "Sign in an employee or admin kiosk session to use face recognition" : undefined}
              >
                <Camera className="w-4 h-4" /> Face
              </Button>
              <Button type="button" variant={recognitionMethod === "qr" ? "default" : "outline"} onClick={startQrMode} disabled={isLoading} className="gap-2">
                <QrCode className="w-4 h-4" /> Secure QR
              </Button>`;
const newBtn = `              {!("BarcodeDetector" in window) && (
                <Button type="button" variant="outline" onClick={startQrMode} disabled={isLoading} className="gap-2">
                  <QrCode className="w-4 h-4" /> Scan QR badge
                </Button>
              )}`;
if (s.includes(faceBtn)) { s = s.replace(faceBtn, newBtn); applied++; }

// 6) Username button label
s = s.replace('<User className="w-4 h-4" /> Username', '<User className="w-4 h-4" /> Type username instead');

// 7) Face-disabled hint copy
s = s.replace("Face mode is disabled until an employee or admin kiosk session is signed in. Secure QR and username/password remain available.", "QR badge scanning works for everyone. Face recognition also runs automatically once an employee or admin kiosk session is signed in.");

// 8) Default chooser text
s = s.replace('recognitionStatus || "Choose an identification method."', 'recognitionStatus || "Look at the camera or hold up your QR badge."');

fs.writeFileSync(f, s);
console.log("applied " + applied);
