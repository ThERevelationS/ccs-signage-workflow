const fs = require("fs");
const f = "src/components/timeclock/QuickClockSection.jsx";
let s = fs.readFileSync(f, "utf8");
let applied = 0;

// 1) qrLoopRef alongside the other media refs
if (s.includes("const faceScanSessionRef = useRef(null);") && !s.includes("qrLoopRef")) {
  s = s.replace("const faceScanSessionRef = useRef(null);", "const faceScanSessionRef = useRef(null);\n  const qrLoopRef = useRef(0);");
  applied++;
}

// 2) Kill the QR tick loop whenever the shared stream stops
const stopFc = "  const stopFaceCamera = () => {\n    faceRunRef.current += 1;";
if (s.includes(stopFc) && !s.includes("qrLoopRef.current += 1;")) {
  s = s.replace(stopFc, stopFc + "\n    qrLoopRef.current += 1;");
  applied++;
}

// 3) Rewrite startFaceMode -> unified camera mode (single stream, face + QR)
const oldStart = `  const startFaceMode = async () => {
    await stopAllMedia();
    identifyFlowSeqRef.current += 1;
    recognitionLockedRef.current = false;
    setIsRecognizing(true);
    setRecognitionMethod("face");
    setUsernameError("");

    if (!authoritativeSessionToken) {
      setRecognitionStatus("Face mode requires a signed-in employee or admin kiosk session. Use Secure QR or Username instead.");
      return;
    }
    if (!canUseFace) {
      setRecognitionStatus("No enrolled faces are available to this signed-in session. Use Secure QR or Username instead.");
      return;
    }`;
const newStart = `  const startCameraMode = async () => {
    await stopAllMedia();
    identifyFlowSeqRef.current += 1;
    recognitionLockedRef.current = false;
    setIsRecognizing(true);
    setRecognitionMethod("camera");
    setUsernameError("");

    const faceEnabled = Boolean(authoritativeSessionToken) && canUseFace;`;
if (s.includes(oldStart)) { s = s.replace(oldStart, newStart); applied++; }

// 4) Camera start: face models only load when face is enabled; QR needs no session
const oldGather = `      const [modelsReady, stream] = await Promise.all([
        loadFaceModels(),
        navigator.mediaDevices.getUserMedia({`;
const newGather = `      const [modelsReady, stream] = await Promise.all([
        faceEnabled ? loadFaceModels() : Promise.resolve(false),
        navigator.mediaDevices.getUserMedia({`;
if (s.includes(oldGather)) { s = s.replace(oldGather, newGather); applied++; }

// 5) Models-failure path: degrade to QR-only instead of bailing
const oldFail = `      if (!modelsReady) {
        stream.getTracks().forEach((track) => track.stop());
        setRecognitionStatus("Face models could not load. Use Secure QR or Username instead.");
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (faceRun !== faceRunRef.current) return;
      setRecognitionStatus("Look directly at the camera...");`;
const newFail = `      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (faceRun !== faceRunRef.current) return;
      setRecognitionStatus(faceEnabled ? "Look at the camera or hold up your QR badge." : "Hold your QR badge up to the camera.");`;
if (s.includes(oldFail)) { s = s.replace(oldFail, newFail); applied++; }

// 6) Face session only when enabled + QR tick loop on the same video element
const oldSession = `      // Same shared scan session as the reusable FaceRecognition component -
      // one cadence, quality gate, brightness check, and voter for every
      // face-recognition surface in the app.
      const session = createFaceScanSession({`;
const qrTick = `      // QR badge detection on the same video - no second camera stream.
      // BarcodeDetector covers Chromium/Edge kiosks; only TIMECLOCK2 codes act.
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const qrRun = ++qrLoopRef.current;
        const tick = async () => {
          if (qrRun !== qrLoopRef.current || faceRun !== faceRunRef.current) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2 && !recognitionLockedRef.current) {
            try {
              const codes = await detector.detect(v);
              const hit = (codes || []).find((c) => String(c?.rawValue || "").startsWith("TIMECLOCK2:"));
              if (hit) { void handleQrDecoded(hit.rawValue); return; }
            } catch {}
          }
          setTimeout(tick, 350);
        };
        setTimeout(tick, 400);
      }

      if (!faceEnabled || !modelsReady) {
        setRecognitionStatus("BarcodeDetector" in window
          ? "Hold your QR badge up to the camera. Face recognition needs a signed session."
          : "QR scanning needs a supported browser - use Username instead.");
        return;
      }

      // Same shared scan session as the reusable FaceRecognition component -
      // one cadence, quality gate, brightness check, and voter for every
      // face-recognition surface in the app.
      const session = createFaceScanSession({`;
if (s.includes(oldSession)) { s = s.replace(oldSession, qrTick); applied++; }

// 7) catch: report camera status correctly (QR may still work without models)
const oldCatch = `      console.error("Camera error:", err);
      stopFaceCamera();
      setRecognitionStatus("Camera unavailable. Use Secure QR or Username instead.");`;
const newCatch = `      console.error("Camera error:", err);
      stopFaceCamera();
      setRecognitionStatus("Camera unavailable. Use Username instead.");`;
if (s.includes(oldCatch)) { s = s.replace(oldCatch, newCatch); applied++; }

// 8) QR decode failure returns to the combined camera, not QR-only mode
const oldQrFail = `    } catch {
      setIsRecognizing(true);
      setRecognitionMethod("qr");
      recognitionLockedRef.current = false;
    }
  };`;
const newQrFail = `    } catch {
      setIsRecognizing(true);
      setRecognitionMethod("camera");
      recognitionLockedRef.current = false;
    }
  };`;
if (s.includes(oldQrFail)) { s = s.replace(oldQrFail, newQrFail); applied++; }

// 9) startRecognition always opens the combined camera
const oldPick = `    if (canUseFace) await startFaceMode();
    else await startQrMode();`;
if (s.includes(oldPick)) { s = s.replace(oldPick, "    await startCameraMode();"); applied++; }

// 10) Render: video shows for "camera" mode
s = s.replaceAll('recognitionMethod === "face" && (', '(recognitionMethod === "face" || recognitionMethod === "camera") && (');
applied++;

// 11) Buttons: camera is automatic - Username is the only manual fallback,
//     plus a legacy QR button only when BarcodeDetector is missing.
const oldBtns = `            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant={recognitionMethod === "face" ? "default" : "outline"}
                onClick={startFaceMode}
                disabled={isLoading || !canUseFace}
                className="gap-2"
                title={!authoritativeSessionToken ? "Sign in an employee or admin kiosk session to use face recognition" : undefined}
              >
                <Camera className="w-4 h-4" /> Face
              </Button>
              <Button type="button" variant={recognitionMethod === "qr" ? "default" : "outline"} onClick={startQrMode} disabled={isLoading} className="gap-2">
                <QrCode className="w-4 h-4" /> Secure QR
              </Button>
              <Button type="button" variant={recognitionMethod === "manual" ? "default" : "outline"} onClick={startManualMode} disabled={isLoading} className="gap-2">
                <User className="w-4 h-4" /> Username
              </Button>
            </div>`;
const newBtns = `            <div className="flex flex-wrap justify-center gap-2">
              {recognitionMethod !== "manual" && !("BarcodeDetector" in window) && (
                <Button type="button" variant="outline" onClick={startQrMode} disabled={isLoading} className="gap-2">
                  <QrCode className="w-4 h-4" /> Scan QR badge
                </Button>
              )}
              <Button type="button" variant={recognitionMethod === "manual" ? "default" : "outline"} onClick={startManualMode} disabled={isLoading} className="gap-2">
                <User className="w-4 h-4" /> Type username instead
              </Button>
            </div>`;
if (s.includes(oldBtns)) { s = s.replace(oldBtns, newBtns); applied++; }

// 12) Spinner condition includes camera mode
s = s.replace('recognitionMethod === "face" || \nrecognitionMethod === "qr" || isLoading', '(recognitionMethod === "face" || recognitionMethod === "camera" || \nrecognitionMethod === "qr" || isLoading');

// 13) Other call sites: startFaceMode -> startCameraMode
s = s.replaceAll("startFaceMode()", "startCameraMode()");
s = s.replaceAll('onClick={startFaceMode}', 'onClick={startCameraMode}');

// 14) Default status text + face-disabled hint copy
s = s.replace('recognitionStatus || "Choose an identification method."', 'recognitionStatus || "Look at the camera or hold up your QR badge."');
s = s.replace("Face mode is disabled until an employee or admin kiosk session is signed in. Secure QR and username/password remain available.", "QR badge scanning works for everyone. Face recognition also runs automatically once an employee or admin kiosk session is signed in.");

fs.writeFileSync(f, s);
console.log("applied " + applied);
