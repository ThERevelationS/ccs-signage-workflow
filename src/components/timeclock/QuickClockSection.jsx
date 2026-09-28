import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera,
  Clock,
  Loader2,
  Play,
  QrCode,
  Square,
  User,
  X,
} from "lucide-react";
import { format } from "date-fns";
import ClockOutDialog from "@/components/timeclock/ClockOutDialog";
import MissedPunchResolutionDialog from "@/components/timeclock/MissedPunchResolutionDialog";
import LateClockInReviewDialog from "@/components/timeclock/LateClockInReviewDialog";
import WorkPauseOverlay from "@/components/timeclock/WorkPauseOverlay";
import * as faceapi from "face-api.js";
import { Html5Qrcode } from "html5-qrcode";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function apiErrorFrom(err, fallback) {
  const data = err?.response?.data;
  const status = Number(err?.response?.status || 0);
  const error = new Error(data?.error || err?.message || fallback);
  error.retrySameRequest = data?.retry_same_request === true;
  // No response (network/interruption) or a 5xx response can have an unknown
  // commit outcome. Keep the same idempotency key so a retry can recover.
  error.ambiguousOutcome = !err?.response || status >= 500;
  return error;
}

function requestStorageKey(action, email) {
  return `ccs_timeclock_request:${action}:${String(email || "").trim().toLowerCase()}`;
}

function storedRequestId(action, email) {
  try {
    const value = sessionStorage.getItem(requestStorageKey(action, email)) || "";
    return value.length >= 8 && value.length <= 128 ? value : "";
  } catch {
    return "";
  }
}

function persistRequestId(action, email, requestId) {
  try { sessionStorage.setItem(requestStorageKey(action, email), requestId); } catch {}
}

function removeStoredRequestId(action, email) {
  try { sessionStorage.removeItem(requestStorageKey(action, email)); } catch {}
}

function shouldRetainRequest(err) {
  return err?.retrySameRequest === true || err?.ambiguousOutcome === true;
}

const TRANSITION_LABELS = {
  clock_in: "Finishing Clock In",
  clock_out: "Finishing Clock Out",
  break_start: "Starting Break",
  break_end: "Ending Break",
  work_pause_start: "Pausing Work",
  work_pause_resume: "Resuming Work",
  labor_start: "Starting Current Work",
  labor_change: "Changing Current Work",
  labor_stop: "Stopping Current Work",
};

function transitionLabel(transition) {
  return TRANSITION_LABELS[transition] || "Finishing Time Clock Action";
}

export default function QuickClockSection({
  allUsers,
  employeeSessionToken = "",
  employeeSessionUser = null,
}) {
  const { sessionToken: shellSessionToken, currentUser: shellUser } = useAuth();
  const authoritativeSessionToken = employeeSessionToken || shellSessionToken || "";
  const authoritativeSessionUser = employeeSessionUser || shellUser || null;

  const [activeEntry, setActiveEntry] = useState(null);
  const [breakStatus, setBreakStatus] = useState("working");
  const [activeBreak, setActiveBreak] = useState(null);
  const [breakSummary, setBreakSummary] = useState({ count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
  const [workPauseAllowed, setWorkPauseAllowed] = useState(false);
  const [workPauseStatus, setWorkPauseStatus] = useState("working");
  const [activeWorkPause, setActiveWorkPause] = useState(null);
  const [workPauseSummary, setWorkPauseSummary] = useState({ count: 0, total_minutes: 0 });
  const [activeLabor, setActiveLabor] = useState(null);
  const [laborSummary, setLaborSummary] = useState({ count: 0, total_minutes: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [showClockOut, setShowClockOut] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [notification, setNotification] = useState(null);
  const [persistenceError, setPersistenceError] = useState("");
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionMethod, setRecognitionMethod] = useState(null); // face | qr | manual
  const [recognitionStatus, setRecognitionStatus] = useState("");
  const [authoritativeTransition, setAuthoritativeTransition] = useState(null);
  const [punchResolution, setPunchResolution] = useState(null);
  const [punchResolutionError, setPunchResolutionError] = useState("");
  const [lateClockInReview, setLateClockInReview] = useState(null);
  const [lateClockInError, setLateClockInError] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const qrScannerRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const faceDetectionBusyRef = useRef(false);
  const recognitionLockedRef = useRef(false);
  const modelsLoadedRef = useRef(false);
  const credentialRef = useRef(null);
  const requestRef = useRef({});
  const notificationTimerRef = useRef(null);

  const canUseFace = Boolean(authoritativeSessionToken) && (allUsers || []).some(
    (user) => Array.isArray(user.face_descriptors) && user.face_descriptors.length > 0,
  );
  const authoritativeSessionGuardsSelected = Boolean(
    authoritativeSessionToken &&
    authoritativeSessionUser?.email &&
    selectedUser?.email &&
    authoritativeSessionUser.email.toLowerCase() === selectedUser.email.toLowerCase()
  );

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      stopAllMedia();
    };
  }, []);

  const showNotification = (type, userName, timestamp) => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    setNotification({ type, userName, time: format(new Date(timestamp), "h:mm a") });
    notificationTimerRef.current = setTimeout(() => setNotification(null), 5000);
  };

  const invokeTimeClock = async (payload) => {
    try {
      const response = await base44.functions.invoke("timeClockAction", payload);
      const data = response?.data || response;
      if (!data?.success) {
        const error = new Error(data?.error || "Time Clock action was not confirmed.");
        error.retrySameRequest = data?.retry_same_request === true;
        error.ambiguousOutcome = false;
        throw error;
      }
      return data;
    } catch (err) {
      if (err?.retrySameRequest !== undefined) throw err;
      throw apiErrorFrom(err, "Time Clock action was not confirmed by the server.");
    }
  };

  const requestIdFor = (action, email) => {
    const key = `${action}:${String(email || "").trim().toLowerCase()}`;
    if (requestRef.current?.[key]) return requestRef.current[key];
    const recovered = storedRequestId(action, email);
    const id = recovered || newRequestId();
    requestRef.current = { ...requestRef.current, [key]: id };
    if (!recovered) persistRequestId(action, email, id);
    return id;
  };

  const clearRequest = (action, email) => {
    const key = `${action}:${String(email || "").trim().toLowerCase()}`;
    const next = { ...requestRef.current };
    delete next[key];
    requestRef.current = next;
    removeStoredRequestId(action, email);
  };

  const stopFaceCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    faceDetectionBusyRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const stopQrScanner = async () => {
    const scanner = qrScannerRef.current;
    qrScannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch (err) {
      console.warn("QR scanner stop warning:", err);
    }
    try {
      await scanner.clear();
    } catch {
      // The reader may already have been cleared after a failed camera start.
    }
  };

  const stopAllMedia = async () => {
    stopFaceCamera();
    await stopQrScanner();
  };

  const loadFaceModels = async () => {
    if (modelsLoadedRef.current) return true;
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoadedRef.current = true;
      return true;
    } catch (err) {
      console.error("Error loading face models:", err);
      return false;
    }
  };

  const findMatchingUser = (descriptor) => {
    const matches = [];
    for (const user of allUsers || []) {
      if (!Array.isArray(user.face_descriptors) || user.face_descriptors.length === 0) continue;
      let bestDistance = Infinity;
      for (const stored of user.face_descriptors) {
        const distance = faceapi.euclideanDistance(descriptor, new Float32Array(stored));
        bestDistance = Math.min(bestDistance, distance);
      }
      matches.push({ user, distance: bestDistance });
    }

    matches.sort((a, b) => a.distance - b.distance);
    const best = matches[0];
    if (!best || best.distance > 0.38) return null;
    const second = matches[1]?.distance ?? Infinity;
    if (second / best.distance < 1.5) return null;
    return best.user;
  };

  const credentialPayload = (credential, userEmail) => {
    if (credential?.badgeCode) return { badge_code: credential.badgeCode };
    return {
      session_token: credential?.sessionToken || "",
      target_email: userEmail,
    };
  };

  const applyAuthoritativeStatus = useCallback((status, fallbackUser, credential) => {
    const verifiedUser = status?.user || fallbackUser;
    if (!verifiedUser?.email) throw new Error("The server did not return a verified employee identity.");

    credentialRef.current = credential;
    setSelectedUser(verifiedUser);
    setBreakStatus(status?.break_status || "working");
    setActiveBreak(status?.active_break || null);
    setBreakSummary(status?.break_summary || { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
    setWorkPauseAllowed(status?.work_pause_allowed === true);
    setWorkPauseStatus(status?.work_pause_status || "working");
    setActiveWorkPause(status?.active_work_pause || null);
    setWorkPauseSummary(status?.work_pause_summary || { count: 0, total_minutes: 0 });
    setActiveLabor(status?.active_labor || null);
    setLaborSummary(status?.labor_summary || { count: 0, total_minutes: 0 });

    if (status?.requires_punch_resolution === true && status?.entry?.id && status?.punch_resolution) {
      setLateClockInReview(null);
      setLateClockInError("");
      setAuthoritativeTransition(null);
      setPunchResolution({ ...status.punch_resolution, entry: status.entry });
      setPunchResolutionError("");
      setActiveEntry(status.entry);
      setShowClockOut(false);
      setIsRecognizing(false);
      return "punch_resolution";
    }
    setPunchResolution(null);

    if (status?.requires_late_clock_in_review === true && status?.status === "clocked_out" && status?.late_clock_in_review) {
      setAuthoritativeTransition(null);
      setLateClockInReview(status.late_clock_in_review);
      setLateClockInError("");
      setActiveEntry(null);
      setShowClockOut(false);
      setIsRecognizing(false);
      return "late_clock_in_review";
    }
    setLateClockInReview(null);

    if (status?.transition) {
      const transition = status.transition;
      setAuthoritativeTransition({
        status: status.status || "clocked_in",
        transition,
        startedAt: status.transition_started_at || null,
      });
      setActiveEntry(status?.entry?.id ? status.entry : null);
      setShowClockOut(false);
      setIsRecognizing(false);
      setRecognitionStatus(`${transitionLabel(transition)} is being finalized by the server. Conflicting Time Clock actions are temporarily blocked.`);
      return "transition";
    }

    if (status?.status === "clocked_in" && status?.entry?.id) {
      setAuthoritativeTransition(null);
      setActiveEntry(status.entry);
      setShowClockOut(true);
      setIsRecognizing(false);
      return "clocked_in";
    }

    if (["clocking_in", "clocking_out"].includes(status?.status)) {
      const transition = status.status === "clocking_out" ? "clock_out" : "clock_in";
      setAuthoritativeTransition({ status: status.status, transition, startedAt: status.transition_started_at || null });
      setActiveEntry(null);
      setShowClockOut(false);
      setIsRecognizing(false);
      setRecognitionStatus(`${transitionLabel(transition)} is being finalized by the server. Conflicting Time Clock actions are temporarily blocked.`);
      return "transition";
    }

    setAuthoritativeTransition(null);
    setActiveEntry(null);
    setShowClockOut(false);
    return status?.status || "clocked_out";
  }, []);

  const refreshAuthoritativeSessionState = useCallback(async ({ quiet = false } = {}) => {
    const email = String(authoritativeSessionUser?.email || "").trim().toLowerCase();
    if (!authoritativeSessionToken || !email) return null;

    if (!quiet) setIsLoading(true);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "status",
        session_token: authoritativeSessionToken,
        target_email: email,
      });
      const status = response?.data || response;
      if (!status?.success) throw new Error(status?.error || "Authoritative Time Clock status could not be restored.");
      const restored = applyAuthoritativeStatus(status, authoritativeSessionUser, { sessionToken: authoritativeSessionToken });
      if (restored === "clocked_in") {
        setPersistenceError("");
        setRecognitionStatus(`Active shift restored for ${status.user?.full_name || status.user?.email || email}.`);
      } else if (restored === "punch_resolution") {
        setPersistenceError("");
        setRecognitionStatus("Previous shift needs punch confirmation before a new Clock In.");
      } else if (restored === "transition") {
        setPersistenceError("");
      } else if (restored === "clocked_out") {
        setPersistenceError("");
        setRecognitionStatus("");
      }
      return status;
    } catch (err) {
      if (!quiet) setPersistenceError(err?.response?.data?.error || err?.message || "Authoritative Time Clock status could not be restored.");
      return null;
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [applyAuthoritativeStatus, authoritativeSessionToken, authoritativeSessionUser]);

  useEffect(() => {
    if (!authoritativeSessionToken || !authoritativeSessionUser?.email) {
      setAuthoritativeTransition(null);
      return undefined;
    }
    refreshAuthoritativeSessionState({ quiet: true });
    const onFocus = () => refreshAuthoritativeSessionState({ quiet: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshAuthoritativeSessionState({ quiet: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authoritativeSessionToken, authoritativeSessionUser?.email, refreshAuthoritativeSessionState]);

  useEffect(() => {
    if (!authoritativeTransition || !authoritativeSessionToken || !authoritativeSessionUser?.email) return undefined;
    const poll = setInterval(() => refreshAuthoritativeSessionState({ quiet: true }), 3000);
    return () => clearInterval(poll);
  }, [authoritativeTransition, authoritativeSessionToken, authoritativeSessionUser?.email, refreshAuthoritativeSessionState]);

  const resetState = async () => {
    recognitionLockedRef.current = false;
    await stopAllMedia();
    credentialRef.current = null;
    requestRef.current = {};
    setSelectedUser(null);
    setActiveEntry(null);
    setBreakStatus("working");
    setActiveBreak(null);
    setBreakSummary({ count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
    setWorkPauseAllowed(false);
    setWorkPauseStatus("working");
    setActiveWorkPause(null);
    setWorkPauseSummary({ count: 0, total_minutes: 0 });
    setActiveLabor(null);
    setLaborSummary({ count: 0, total_minutes: 0 });
    setShowClockOut(false);
    setIsRecognizing(false);
    setRecognitionMethod(null);
    setRecognitionStatus("");
    setAuthoritativeTransition(null);
    setPunchResolution(null);
    setPunchResolutionError("");
    setLateClockInReview(null);
    setLateClockInError("");
    setUsernameInput("");
    setManualPassword("");
    setUsernameError("");
    setIsLoading(false);
  };

  const performClockIn = async (user, credential) => {
    const email = user?.email;
    if (!email) throw new Error("Verified employee identity is missing an email address.");

    const requestId = requestIdFor("clock_in", email);
    setIsLoading(true);
    setPersistenceError("");
    try {
      const data = await invokeTimeClock({
        action: "clock_in",
        request_id: requestId,
        ...credentialPayload(credential, email),
      });
      clearRequest("clock_in", email);
      credentialRef.current = credential;
      setSelectedUser(data.user || user);
      setBreakStatus(data.break_status || "working");
      setActiveBreak(data.active_break || null);
      setBreakSummary(data.break_summary || { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
      setWorkPauseAllowed(data.work_pause_allowed === true);
      setWorkPauseStatus(data.work_pause_status || "working");
      setActiveWorkPause(data.active_work_pause || null);
      setWorkPauseSummary(data.work_pause_summary || { count: 0, total_minutes: 0 });
      setActiveLabor(data.active_labor || null);
      setLaborSummary(data.labor_summary || { count: 0, total_minutes: 0 });

      if (data.status === "already_clocked_in") {
        setActiveEntry(data.entry || null);
        setRecognitionStatus("Already clocked in. No duplicate entry was created.");
        setTimeout(() => resetState(), 3000);
        return data;
      }

      showNotification("in", data.user?.full_name || user.full_name || email, data.entry?.clock_in || new Date().toISOString());
      setRecognitionStatus("Clock-in confirmed by server.");
      setTimeout(() => resetState(), 5000);
      return data;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("clock_in", email);
      setPersistenceError(err.message || "Clock-in was not confirmed by the server.");
      setRecognitionStatus(err.retrySameRequest
        ? "Clock-in may have been saved. Retry the same action to recover safely."
        : "Clock-in blocked. Review the message below.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const resolveVerifiedIdentity = async ({ user = null, credential }) => {
    setIsLoading(true);
    setPersistenceError("");
    try {
      const status = await invokeTimeClock({
        action: "status",
        clock_action_intent: true,
        ...credentialPayload(credential, user?.email),
      });
      const verifiedUser = status.user || user;
      if (!verifiedUser?.email) throw new Error("The server did not return a verified employee identity.");

      const resolvedStatus = applyAuthoritativeStatus(status, verifiedUser, credential);
      if (resolvedStatus === "clocked_in") {
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}! Active shift restored.`);
        return;
      }
      if (resolvedStatus === "punch_resolution") {
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}. Resolve the previous shift before starting a new one.`);
        return;
      }
      if (resolvedStatus === "late_clock_in_review") {
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}. Confirm whether you missed Clock In before continuing.`);
        return;
      }
      if (resolvedStatus === "transition") return;

      setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}!`);
      await performClockIn(verifiedUser, credential);
    } catch (err) {
      setPersistenceError(err.message || "Employee identity could not be verified for Time Clock.");
      setRecognitionStatus("Time Clock verification failed. Try QR or username/password.");
      recognitionLockedRef.current = false;
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaceRecognized = async (user) => {
    if (recognitionLockedRef.current) return;
    recognitionLockedRef.current = true;
    stopFaceCamera();
    setIsRecognizing(false);

    if (!authoritativeSessionToken) {
      setPersistenceError("Face Quick Clock requires a signed-in employee or admin kiosk session. Use your secure QR badge or username/password instead.");
      setRecognitionStatus("Face identity needs a signed Time Clock session.");
      recognitionLockedRef.current = false;
      setIsRecognizing(true);
      setRecognitionMethod("manual");
      return;
    }

    try {
      await resolveVerifiedIdentity({ user, credential: { sessionToken: authoritativeSessionToken } });
    } catch {
      setIsRecognizing(true);
      setRecognitionMethod("manual");
    }
  };

  const startFaceMode = async () => {
    await stopAllMedia();
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
    }

    setRecognitionStatus("Starting camera...");
    try {
      const [modelsReady, stream] = await Promise.all([
        loadFaceModels(),
        navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        }),
      ]);
      if (!modelsReady) {
        stream.getTracks().forEach((track) => track.stop());
        setRecognitionStatus("Face models could not load. Use Secure QR or Username instead.");
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRecognitionStatus("Look directly at the camera...");

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || faceDetectionBusyRef.current || recognitionLockedRef.current) return;
        faceDetectionBusyRef.current = true;
        try {
          const detection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.3 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (detection) {
            const matched = findMatchingUser(detection.descriptor);
            if (matched) await handleFaceRecognized(matched);
            else setRecognitionStatus("Face detected but not confidently matched.");
          }
        } catch (err) {
          console.warn("Face scan warning:", err);
        } finally {
          faceDetectionBusyRef.current = false;
        }
      }, 650);
    } catch (err) {
      console.error("Camera error:", err);
      stopFaceCamera();
      setRecognitionStatus("Camera unavailable. Use Secure QR or Username instead.");
    }
  };

  const handleQrDecoded = async (decodedText) => {
    if (recognitionLockedRef.current) return;
    recognitionLockedRef.current = true;

    if (!String(decodedText || "").startsWith("TIMECLOCK2:")) {
      setPersistenceError("This is an old or invalid Time Clock badge. Generate a new secure badge from Time Clock Settings.");
      setRecognitionStatus("Legacy QR badges are no longer accepted.");
      recognitionLockedRef.current = false;
      return;
    }

    await stopQrScanner();
    setIsRecognizing(false);
    try {
      await resolveVerifiedIdentity({ credential: { badgeCode: decodedText } });
    } catch {
      setIsRecognizing(true);
      setRecognitionMethod("qr");
      recognitionLockedRef.current = false;
    }
  };

  const startQrScannerWithFacingMode = async (facingMode) => {
    const scanner = new Html5Qrcode("hybrid-qr-reader");
    qrScannerRef.current = scanner;
    await scanner.start(
      { facingMode },
      { fps: 8, qrbox: { width: 220, height: 220 }, aspectRatio: 1.333333 },
      handleQrDecoded,
      () => {},
    );
  };

  const startQrMode = async () => {
    await stopAllMedia();
    recognitionLockedRef.current = false;
    setIsRecognizing(true);
    setRecognitionMethod("qr");
    setRecognitionStatus("Starting QR camera...");
    setUsernameError("");

    try {
      await startQrScannerWithFacingMode("environment");
      setRecognitionStatus("Scan your secure Time Clock QR badge.");
    } catch (environmentError) {
      console.warn("Rear QR camera unavailable, trying front camera:", environmentError);
      await stopQrScanner();
      try {
        await startQrScannerWithFacingMode("user");
        setRecognitionStatus("Scan your secure Time Clock QR badge.");
      } catch (frontError) {
        console.error("QR camera error:", frontError);
        await stopQrScanner();
        setRecognitionStatus("QR camera unavailable. Use Username instead.");
      }
    }
  };

  const startManualMode = async () => {
    await stopAllMedia();
    recognitionLockedRef.current = false;
    setIsRecognizing(true);
    setRecognitionMethod("manual");
    setRecognitionStatus("Enter your Time Clock username and password.");
    setUsernameError("");
  };

  const startRecognition = async () => {
    if (authoritativeTransition) {
      setPersistenceError("A Time Clock punch is still being finalized by the server. Wait for authoritative status to settle before starting another punch.");
      return;
    }
    setPersistenceError("");
    setUsernameInput("");
    setManualPassword("");
    setSelectedUser(null);
    setActiveEntry(null);
    credentialRef.current = null;
    requestRef.current = {};
    if (canUseFace) await startFaceMode();
    else await startQrMode();
  };

  const handleManualSubmit = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed || !manualPassword) {
      setUsernameError("Enter your username and password.");
      return;
    }

    setIsLoading(true);
    setUsernameError("");
    try {
      const response = await base44.functions.invoke("verifyLogin", {
        username: trimmed,
        password: manualPassword,
      });
      const data = response?.data || response;
      if (!data?.success || !data?.user || !data?.token) {
        throw new Error(data?.error || "Invalid username or password.");
      }

      setManualPassword("");
      recognitionLockedRef.current = true;
      setIsRecognizing(false);
      await resolveVerifiedIdentity({ user: data.user, credential: { sessionToken: data.token } });
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "Invalid username or password.";
      setUsernameError(message);
      setIsRecognizing(true);
      setRecognitionMethod("manual");
      recognitionLockedRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  const applyBreakResponse = (data) => {
    setBreakStatus(data?.break_status || "working");
    setActiveBreak(data?.break_status === "on_break" ? (data?.break || null) : null);
    setBreakSummary(data?.break_summary || { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
    if (Object.prototype.hasOwnProperty.call(data || {}, "active_labor")) setActiveLabor(data.active_labor || null);
    if (data?.labor_summary) setLaborSummary(data.labor_summary);
    if (data?.entry?.id) setActiveEntry(data.entry);
  };

  const applyWorkPauseResponse = (data) => {
    setWorkPauseAllowed(data?.work_pause_allowed === true || workPauseAllowed);
    setWorkPauseStatus(data?.work_pause_status || "working");
    setActiveWorkPause(data?.work_pause_status === "paused" ? (data?.work_pause || data?.active_work_pause || null) : null);
    setWorkPauseSummary(data?.work_pause_summary || { count: 0, total_minutes: 0 });
    if (Object.prototype.hasOwnProperty.call(data || {}, "active_labor")) setActiveLabor(data.active_labor || null);
    if (data?.labor_summary) setLaborSummary(data.labor_summary);
    if (data?.entry?.id) setActiveEntry(data.entry);
  };

  const signalWorkPauseChanged = () => {
    window.dispatchEvent(new CustomEvent("ccs-timeclock-work-pause-changed"));
    try { localStorage.setItem("ccs_work_pause_signal", String(Date.now())); } catch {}
  };

  const handleStartWorkPause = async () => {
    if (!workPauseAllowed) throw new Error("Work Pause is not enabled for this employee.");
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Work Pause identity is no longer verified. Close this dialog and identify again.");
    }
    if (breakStatus !== "working" || activeBreak?.id) throw new Error("End the active break before pausing work.");
    const email = selectedUser.email;
    const requestId = requestIdFor("work_pause_start", email);
    setPersistenceError("");
    try {
      const result = await invokeTimeClock({
        action: "work_pause_start",
        request_id: requestId,
        ...credentialPayload(credentialRef.current, email),
      });
      clearRequest("work_pause_start", email);
      applyWorkPauseResponse(result);
      setShowClockOut(false);
      setRecognitionStatus("Work Pause confirmed by server.");
      signalWorkPauseChanged();
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("work_pause_start", email);
      setPersistenceError(err?.message || "Work Pause was not confirmed by the server.");
      throw err;
    }
  };

  const handleStartBreak = async ({ breakType, isPaid }) => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Break identity is no longer verified. Close this dialog and identify again.");
    }
    const email = selectedUser.email;
    const actionKey = `break_start:${breakType}:${isPaid ? "paid" : "unpaid"}`;
    const requestId = requestIdFor(actionKey, email);
    setPersistenceError("");
    try {
      const result = await invokeTimeClock({
        action: "break_start",
        request_id: requestId,
        break_type: breakType,
        is_paid: isPaid,
        ...credentialPayload(credentialRef.current, email),
      });
      clearRequest(actionKey, email);
      applyBreakResponse(result);
      setRecognitionStatus(isPaid ? "Paid break started and confirmed by server." : "Unpaid lunch started and confirmed by server.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest(actionKey, email);
      setPersistenceError(err?.message || "Break start was not confirmed by the server.");
      throw err;
    }
  };

  const handleEndBreak = async () => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Break identity is no longer verified. Close this dialog and identify again.");
    }
    const email = selectedUser.email;
    const requestId = requestIdFor("break_end", email);
    setPersistenceError("");
    try {
      const result = await invokeTimeClock({
        action: "break_end",
        request_id: requestId,
        ...credentialPayload(credentialRef.current, email),
      });
      clearRequest("break_end", email);
      applyBreakResponse(result);
      setRecognitionStatus("Break ended and confirmed by server.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("break_end", email);
      setPersistenceError(err?.message || "Break end was not confirmed by the server.");
      throw err;
    }
  };

  const handleLaborAction = async (action, { activityType = "", workOrderId = "" } = {}) => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Current Work identity is no longer verified. Close this dialog and identify again.");
    }
    if (breakStatus !== "working" || activeBreak?.id) throw new Error("End the active break before changing Current Work.");
    if (workPauseStatus !== "working" || activeWorkPause?.id) throw new Error("Resume Work before changing Current Work.");
    const email = selectedUser.email;
    const requestId = requestIdFor(action, email);
    setPersistenceError("");
    try {
      const result = await invokeTimeClock({
        action,
        request_id: requestId,
        activity_type: activityType,
        work_order_id: workOrderId,
        ...credentialPayload(credentialRef.current, email),
      });
      clearRequest(action, email);
      setActiveLabor(result.active_labor || null);
      setLaborSummary(result.labor_summary || { count: 0, total_minutes: 0 });
      if (result?.entry?.id) setActiveEntry(result.entry);
      setRecognitionStatus(action === "labor_stop" ? "Current Work stopped and confirmed by server." : action === "labor_change" ? "Current Work changed and confirmed by server." : "Current Work started and confirmed by server.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest(action, email);
      setPersistenceError(err?.message || "Current Work was not confirmed by the server.");
      throw err;
    }
  };

  const handleLoadLaborAllocationPreview = async () => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Allocation preview identity is no longer verified. Close this dialog and identify again.");
    }
    try {
      return await invokeTimeClock({
        action: "labor_allocation_preview",
        ...credentialPayload(credentialRef.current, selectedUser.email),
      });
    } catch (err) {
      setPersistenceError(err?.message || "Tracked Current Work suggestions could not be loaded.");
      throw err;
    }
  };

  const handlePunchResolution = async ({ response, claimedClockOut = "" }) => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Punch-resolution identity is no longer verified. Identify again before continuing.");
    }

    const email = selectedUser.email;
    const requestId = requestIdFor("resolve_punch_exception", email);
    const credential = credentialRef.current;
    const user = selectedUser;
    setPunchResolutionError("");
    setPersistenceError("");
    setIsLoading(true);

    try {
      const result = await invokeTimeClock({
        action: "resolve_punch_exception",
        request_id: requestId,
        response,
        ...(claimedClockOut ? { claimed_clock_out: claimedClockOut } : {}),
        ...credentialPayload(credential, email),
      });
      clearRequest("resolve_punch_exception", email);

      if (result?.worked_through === true && result?.status === "clocked_in") {
        setPunchResolution(null);
        setActiveEntry(result.entry || activeEntry);
        setRecognitionStatus("Continuous shift confirmed. Your original Clock In remains active and no punch time was changed.");
        setTimeout(() => resetState(), 2500);
        return result;
      }

      if (result?.punch_resolution_pending === true && result?.status === "clocked_out") {
        setPunchResolution(null);
        setActiveEntry(null);
        setRecognitionStatus("Previous shift sent to manager review. Clocking you in now...");
        await performClockIn(result.user || user, credential);
        return result;
      }

      throw new Error("Punch resolution returned an unexpected authoritative state. Reload before continuing.");
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("resolve_punch_exception", email);
      const message = err?.message || "Punch resolution was not confirmed by the server.";
      setPunchResolutionError(message);
      setRecognitionStatus(err?.retrySameRequest
        ? "Punch resolution may have been saved. Retry the same response to recover safely."
        : "Punch resolution is blocked. Review the message in the window.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleMissedClockOutResolution = (claimedClockOut) =>
    handlePunchResolution({ response: "missed_clock_out", claimedClockOut });

  const handleWorkedThroughResolution = () =>
    handlePunchResolution({ response: "worked_through" });

  const handleRecoverMissedClockIn = async (claimedClockIn) => {
    if (!selectedUser?.email || !credentialRef.current) {
      throw new Error("Missed Clock In identity is no longer verified. Identify again before continuing.");
    }

    const email = selectedUser.email;
    const requestId = requestIdFor("recover_missed_clock_in", email);
    setLateClockInError("");
    setPersistenceError("");
    setIsLoading(true);
    try {
      const result = await invokeTimeClock({
        action: "recover_missed_clock_in",
        request_id: requestId,
        claimed_clock_in: claimedClockIn,
        ...credentialPayload(credentialRef.current, email),
      });
      clearRequest("recover_missed_clock_in", email);
      if (result?.recovered_missed_clock_in !== true || result?.status !== "clocked_in" || !result?.entry?.id) {
        throw new Error("Missed Clock In recovery returned an unexpected authoritative state. Reload before continuing.");
      }

      setLateClockInReview(null);
      setLateClockInError("");
      setPunchResolution(null);
      setActiveEntry(result.entry);
      setBreakStatus("working");
      setActiveBreak(null);
      setBreakSummary({ count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
      setWorkPauseStatus("working");
      setActiveWorkPause(null);
      setWorkPauseSummary({ count: 0, total_minutes: 0 });
      setActiveLabor(null);
      setLaborSummary({ count: 0, total_minutes: 0 });
      setShowClockOut(true);
      setRecognitionStatus("Missing Clock In restored from your reported arrival time. Complete Clock Out now; this shift will require manager review.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("recover_missed_clock_in", email);
      const message = err?.message || "Missed Clock In recovery was not confirmed by the server.";
      setLateClockInError(message);
      setRecognitionStatus(err?.retrySameRequest
        ? "Missed Clock In may have been saved. Retry the same recovery to finish safely."
        : "Missed Clock In recovery is blocked. Review the message in the window.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLateClockInClockInNow = async () => {
    if (!selectedUser?.email || !credentialRef.current) {
      throw new Error("Clock In identity is no longer verified. Identify again before continuing.");
    }
    const user = selectedUser;
    const credential = credentialRef.current;
    setLateClockInReview(null);
    setLateClockInError("");
    await performClockIn(user, credential);
  };

  const handleClockOut = async (data) => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Clock-out identity is no longer verified. Close this dialog and identify again.");
    }

    if (breakStatus !== "working" || activeBreak?.id) {
      throw new Error("End the active break before clocking out.");
    }
    if (workPauseStatus !== "working" || activeWorkPause?.id) {
      throw new Error("Resume Work before clocking out.");
    }

    const email = selectedUser.email;
    const requestId = requestIdFor("clock_out", email);
    setPersistenceError("");
    setIsLoading(true);
    try {
      const result = await invokeTimeClock({
        action: "clock_out",
        request_id: requestId,
        lunch_minutes: data.lunchMinutes,
        job_allocations: data.jobAllocations,
        notes: data.notes,
        ...credentialPayload(credentialRef.current, email),
      });
      clearRequest("clock_out", email);
      showNotification("out", result.user?.full_name || selectedUser.full_name || email, result.entry?.clock_out || new Date().toISOString());
      setShowClockOut(false);
      setRecognitionStatus("Clock-out confirmed by server.");
      setTimeout(() => resetState(), 2500);
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("clock_out", email);
      const message = err?.message || "Clock-out was not confirmed by the server.";
      setPersistenceError(message);
      setRecognitionStatus(err?.retrySameRequest
        ? "Clock-out may have been saved. Submit again to recover the same request safely."
        : "Clock-out blocked. Correct the issue and submit again.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <MissedPunchResolutionDialog
        open={Boolean(punchResolution && activeEntry && selectedUser)}
        entry={activeEntry}
        userName={selectedUser?.full_name || selectedUser?.email}
        resolution={punchResolution}
        busy={isLoading}
        error={punchResolutionError}
        onMissedClockOut={handleMissedClockOutResolution}
        onWorkedThrough={handleWorkedThroughResolution}
      />

      <LateClockInReviewDialog
        open={Boolean(lateClockInReview && selectedUser && !activeEntry)}
        userName={selectedUser?.full_name || selectedUser?.email}
        review={lateClockInReview}
        busy={isLoading}
        error={lateClockInError}
        onRecoverMissedClockIn={handleRecoverMissedClockIn}
        onClockInNow={handleLateClockInClockInNow}
      />

      <WorkPauseOverlay
        userOverride={selectedUser}
        credentialOverride={credentialRef.current}
        disabled={authoritativeSessionGuardsSelected || workPauseStatus !== "paused" || !activeWorkPause?.id || !selectedUser?.email || !credentialRef.current}
        onResumed={(data) => {
          applyWorkPauseResponse(data);
          setRecognitionStatus("Work resumed and confirmed by server.");
          setTimeout(() => resetState(), 800);
        }}
      />

      {notification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setNotification(null)}>
          <div className={`px-12 py-10 rounded-3xl shadow-2xl text-center transform animate-in zoom-in-95 ${notification.type === "in" ? "bg-green-500 text-white" : "bg-orange-500 text-white"}`}>
            <div className="flex flex-col items-center gap-4">
              {notification.type === "in" ? <Play className="w-16 h-16" /> : <Square className="w-16 h-16" />}
              <div>
                <p className="text-3xl font-bold mb-2">{notification.userName}</p>
                <p className="text-xl">Successfully Clocked {notification.type === "in" ? "In" : "Out"}</p>
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
              <div className="font-medium">Time Clock action not confirmed</div>
              <div className="mt-1 text-xs">{persistenceError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={() => setPersistenceError("")}>Dismiss</Button>
          </div>
        )}

        {authoritativeTransition && !isRecognizing && !showClockOut && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="font-semibold text-blue-900">
              {transitionLabel(authoritativeTransition.transition)}
            </p>
            <p className="mt-1 text-sm text-blue-800">
              The server is resolving the prior Time Clock action. Conflicting actions stay blocked until authoritative state is confirmed.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 border-blue-300 bg-white text-blue-800"
              onClick={() => refreshAuthoritativeSessionState({ quiet: false })}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Refresh Status
            </Button>
          </div>
        )}

        {!authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-gray-600 text-center">
              Tap the button, then identify with face recognition, a secure QR badge, or username/password.
            </p>
            <button
              onClick={startRecognition}
              disabled={isLoading}
              className="relative w-64 h-32 rounded-2xl shadow-lg disabled:opacity-50 overflow-hidden hover:scale-105 transition-transform"
            >
              <div className="absolute inset-0 bg-green-600" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
              <div className="absolute inset-0 bg-red-600" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
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

        {isRecognizing && (
          <div className="flex flex-col items-center">
            {recognitionMethod === "face" && (
              <div className="relative mb-4">
                <video ref={videoRef} autoPlay muted playsInline className="w-80 h-60 object-cover rounded-2xl bg-gray-900 scale-x-[-1]" />
                <div className="absolute inset-0 border-4 border-purple-500 rounded-2xl animate-pulse pointer-events-none" />
                <Button variant="ghost" size="icon" onClick={resetState} className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            )}

            {recognitionMethod === "qr" && (
              <div className="relative w-full max-w-sm mb-4 rounded-2xl overflow-hidden bg-gray-100 min-h-[260px]">
                <div id="hybrid-qr-reader" className="w-full" />
                <Button variant="ghost" size="icon" onClick={resetState} className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            )}

            {recognitionMethod === "manual" && (
              <div className="relative w-full max-w-xs mb-4">
                <Button variant="ghost" size="icon" onClick={resetState} className="absolute -top-2 -right-10 rounded-full">
                  <X className="w-5 h-5" />
                </Button>
                <div className="space-y-3">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      value={usernameInput}
                      onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(""); }}
                      placeholder="Username"
                      className="pl-10"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                  <Input
                    type="password"
                    value={manualPassword}
                    onChange={(e) => { setManualPassword(e.target.value); setUsernameError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && !isLoading && handleManualSubmit()}
                    placeholder="Password"
                    autoComplete="current-password"
                  />
                  <Button onClick={handleManualSubmit} disabled={isLoading} className="w-full bg-purple-600 hover:bg-purple-700">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                  </Button>
                  {usernameError && <p className="text-red-500 text-sm text-center">{usernameError}</p>}
                </div>
              </div>
            )}

            <div className="px-4 py-2 rounded-full mb-4 bg-purple-100 text-purple-700 text-center">
              <p className="font-medium flex items-center justify-center gap-2">
                {(recognitionMethod === "face" || recognitionMethod === "qr" || isLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
                {recognitionStatus || "Choose an identification method."}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
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
            </div>

            {!authoritativeSessionToken && (
              <p className="mt-3 text-xs text-gray-500 text-center max-w-md">
                Face mode is disabled until an employee or admin kiosk session is signed in. Secure QR and username/password remain available.
              </p>
            )}
            {authoritativeSessionToken && authoritativeSessionUser && (
              <p className="mt-3 text-xs text-gray-400 text-center">
                Signed authority: {authoritativeSessionUser.full_name || authoritativeSessionUser.email}
              </p>
            )}
          </div>
        )}
      </div>

      {showClockOut && activeEntry && selectedUser && (
        <ClockOutDialog
          isOpen={showClockOut}
          onClose={resetState}
          timeEntry={activeEntry}
          userName={selectedUser.full_name || selectedUser.email}
          breakStatus={breakStatus}
          activeBreak={activeBreak}
          breakSummary={breakSummary}
          workPauseAllowed={workPauseAllowed}
          workPauseSummary={workPauseSummary}
          onStartBreak={handleStartBreak}
          onEndBreak={handleEndBreak}
          onStartWorkPause={handleStartWorkPause}
          activeLabor={activeLabor}
          laborSummary={laborSummary}
          onStartLabor={(payload) => handleLaborAction("labor_start", payload)}
          onChangeLabor={(payload) => handleLaborAction("labor_change", payload)}
          onStopLabor={() => handleLaborAction("labor_stop")}
          onLoadLaborAllocationPreview={handleLoadLaborAllocationPreview}
          onClockOut={handleClockOut}
        />
      )}
    </>
  );
}
