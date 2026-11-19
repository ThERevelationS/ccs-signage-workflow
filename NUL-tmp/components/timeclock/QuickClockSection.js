import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarX2,
  Camera,
  Clock,
  Clock3,
  Loader2,
  LogOut,
  MessageSquare,
  QrCode,
  User,
  X
} from "lucide-react";
import { format } from "date-fns";
import { playSoundEffect } from "@/components/announcements/AnnouncementContext";
import ClockOutDialog from "@/components/timeclock/ClockOutDialog";
import MissedPunchResolutionDialog from "@/components/timeclock/MissedPunchResolutionDialog";
import LateClockInReviewDialog from "@/components/timeclock/LateClockInReviewDialog";
import MissedClockInDialog from "@/components/timeclock/MissedClockInDialog";
import MissedShiftDialog from "@/components/timeclock/MissedShiftDialog";
import AdminNoteDialog from "@/components/timeclock/AdminNoteDialog";
import WorkDayGroupDialog from "@/components/timeclock/WorkDayGroupDialog";
import WorkPauseOverlay from "@/components/timeclock/WorkPauseOverlay";
import CrystalShiftButton from "@/components/timeclock/CrystalShiftButton";
import {
  createFaceMatcher,
  createFaceScanSession,
  loadFaceModelsOnce,
  supportsInlineQrDetection
} from "@/components/timeclock/faceScanRuntime";
import {
  IDENTIFY_CAMERA_BLURB,
  IDENTIFY_QR_BADGE_BLURB,
  IDENTIFY_QR_BADGE_BLURB_FACE,
  IDENTIFY_QR_ONLY_BLURB,
  IDENTIFY_QR_BUTTON_PROMPT
} from "@/components/timeclock/timeClockIdentifyCopy";
function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}
const FACE_SCAN_STATUS_TEXT = {
  "no-face": "Look directly at the camera in even lighting.",
  "low-quality": "Move closer and face the light for a clearer scan.",
  dim: "Lighting is dim. Move to better light or face the light source.",
  "no-match": "Face not recognized. Look straight ahead; if this continues, re-enroll your face in Time Clock Settings.",
  verifying: "Hold still - verifying your identity...",
  liveness: "Blink or turn your head slightly to prove you're really here.",
  ambiguous: "Two faces are matching - hold your badge up or step back so only you are in frame."
};
function apiErrorFrom(err, fallback) {
  const data = err?.response?.data;
  const status = Number(err?.response?.status || 0);
  const error = new Error(data?.error || err?.message || fallback);
  error.retrySameRequest = data?.retry_same_request === true;
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
  try {
    const key = requestStorageKey(action, email);
    sessionStorage.setItem(key, requestId);
    return sessionStorage.getItem(key) === requestId;
  } catch {
    return false;
  }
}
function removeStoredRequestId(action, email) {
  try {
    sessionStorage.removeItem(requestStorageKey(action, email));
  } catch {
  }
}
function clockOutSnapshotKey(email) {
  return `ccs_timeclock_pending_clock_out:${String(email || "").trim().toLowerCase()}`;
}
function clockOutSnapshotFor(email) {
  try {
    const raw = sessionStorage.getItem(clockOutSnapshotKey(email)) || "";
    if (!raw || raw.length > 131072) return null;
    const snapshot = JSON.parse(raw);
    const body = snapshot?.body;
    if (snapshot?.version !== 1 || snapshot.email !== String(email || "").trim().toLowerCase() || !snapshot.entryId || !snapshot.requestId || !body || typeof body.notes !== "string" || !Number.isFinite(Number(body.lunch_minutes)) || !Array.isArray(body.job_allocations) || body.job_allocations.length < 1 || body.job_allocations.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return null;
    return snapshot;
  } catch {
    return null;
  }
}
function saveClockOutSnapshot(email, entryId, requestId, body) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const snapshot = {
    version: 1,
    email: normalizedEmail,
    entryId: String(entryId),
    requestId: String(requestId),
    body
  };
  try {
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > 131072) return false;
    sessionStorage.setItem(clockOutSnapshotKey(normalizedEmail), serialized);
    return sessionStorage.getItem(clockOutSnapshotKey(normalizedEmail)) === serialized;
  } catch {
    return false;
  }
}
function clearClockOutSnapshot(email, requestId = "") {
  const snapshot = clockOutSnapshotFor(email);
  if (requestId && snapshot && snapshot.requestId !== requestId) return;
  if (requestId && !snapshot && storedRequestId("clock_out", email) !== requestId) return;
  try {
    sessionStorage.removeItem(clockOutSnapshotKey(email));
  } catch {
  }
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
  labor_stop: "Stopping Current Work"
};
function transitionLabel(transition) {
  return TRANSITION_LABELS[transition] || "Finishing Time Clock Action";
}
export default function QuickClockSection({
  allUsers,
  employeeSessionToken = "",
  employeeSessionUser = null
}) {
  const { sessionToken: shellSessionToken, currentUser: shellUser } = useAuth();
  const authoritativeSessionToken = employeeSessionToken || shellSessionToken || "";
  const authoritativeSessionUser = employeeSessionUser || shellUser || null;
  const [activeEntry, setActiveEntry] = useState(null);
  const [breakStatus, setBreakStatus] = useState("working");
  const [activeBreak, setActiveBreak] = useState(null);
  const [breakSummary, setBreakSummary] = useState({ count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
  const paidBreakRemaining = Math.max(0, 20 - (breakSummary?.paid_minutes || 0));
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
  const [crystalSuccess, setCrystalSuccess] = useState(null);
  const [persistenceError, setPersistenceError] = useState("");
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionMethod, setRecognitionMethodRaw] = useState(null);
  const setRecognitionMethod = (m) => {
    setRecognitionMethodRaw(m);
    if (m) {
      try {
        localStorage.setItem("ccs_kiosk_method", m);
      } catch {
      }
    }
  };
  const [recognitionStatus, setRecognitionStatus] = useState("");
  const [authoritativeTransition, setAuthoritativeTransition] = useState(null);
  const [punchResolution, setPunchResolution] = useState(null);
  const [punchResolutionError, setPunchResolutionError] = useState("");
  const [lateClockInReview, setLateClockInReview] = useState(null);
  const [lateClockInError, setLateClockInError] = useState("");
  const [missedClockInPrompt, setMissedClockInPrompt] = useState(false);
  const [missedShiftPrompt, setMissedShiftPrompt] = useState(false);
  const [missedShiftError, setMissedShiftError] = useState("");
  const [adminNotePrompt, setAdminNotePrompt] = useState(false);
  const [adminNoteError, setAdminNoteError] = useState("");
  const [workDayPrompt, setWorkDayPrompt] = useState(null);
  const [workDayError, setWorkDayError] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const videoRef = useRef(null);
  const workDayDismissedRef = useRef(/* @__PURE__ */ new Set());
  const streamRef = useRef(null);
  const qrScannerRef = useRef(null);
  const faceScanSessionRef = useRef(null);
  const qrLoopRef = useRef(0);
  const healthCanvasRef = useRef(null);
  const healthTimerRef = useRef(null);
  const [cameraHealth, setCameraHealth] = useState("ok");
  useEffect(() => {
    if (cameraHealth === "ok") return;
    const key = (() => {
      try {
        return localStorage.getItem("ccs_kiosk_device_id") || "";
      } catch {
        return "";
      }
    })();
    if (!key) return;
    invokeTimeClock({ action: "report_camera_health", device_key: key, health: cameraHealth }).catch(() => {
    });
  }, [cameraHealth]);
  const recognitionLockedRef = useRef(false);
  const modelsLoadedRef = useRef(false);
  const faceRunRef = useRef(0);
  const matchFace = useMemo(() => createFaceMatcher(allUsers || []), [allUsers]);
  const matchFaceRef = useRef(matchFace);
  matchFaceRef.current = matchFace;
  const credentialRef = useRef(null);
  const requestRef = useRef({});
  const lastPunchRef = useRef({ email: "", at: 0 });
  const [showKioskTutorial, setShowKioskTutorial] = useState(() => {
    try {
      return localStorage.getItem("ccs_kiosk_tutorial_seen") !== "1";
    } catch {
      return false;
    }
  });
  const dismissKioskTutorial = () => {
    setShowKioskTutorial(false);
    try {
      localStorage.setItem("ccs_kiosk_tutorial_seen", "1");
    } catch {
    }
  };
  const [cameraMirrored, setCameraMirrored] = useState(() => {
    try {
      return localStorage.getItem("ccs_kiosk_camera_mirror") !== "0";
    } catch {
      return true;
    }
  });
  const toggleCameraMirror = () => setCameraMirrored((v) => {
    const next = !v;
    try {
      localStorage.setItem("ccs_kiosk_camera_mirror", next ? "1" : "0");
    } catch {
    }
    return next;
  });
  const clockOutAttemptRef = useRef(null);
  const clockOutDismissalKey = (entryId) => entryId ? `qcs-clockout-dismissed:${entryId}` : null;
  const setClockOutDismissed = (entryId, dismissed) => {
    try {
      const key = clockOutDismissalKey(entryId);
      if (!key) return;
      if (dismissed) {
        const stale = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith("qcs-clockout-dismissed:") && k !== key) stale.push(k);
        }
        stale.forEach((k) => sessionStorage.removeItem(k));
        sessionStorage.setItem(key, "1");
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
    }
  };
  const notificationTimerRef = useRef(null);
  const displayResetTimerRef = useRef(null);
  const statusRefreshSequenceRef = useRef(0);
  const workViewEpochRef = useRef(0);
  const identifyFlowSeqRef = useRef(0);
  const identifyIntentRef = useRef("clock_in");
  const activeActionCountRef = useRef(/* @__PURE__ */ new Map());
  const sessionScopeRef = useRef({ token: "", email: "" });
  const selectionRef = useRef({ email: "", entryId: "" });
  sessionScopeRef.current = {
    token: authoritativeSessionToken,
    email: String(authoritativeSessionUser?.email || "").trim().toLowerCase()
  };
  selectionRef.current = {
    email: String(selectedUser?.email || "").trim().toLowerCase(),
    entryId: String(activeEntry?.id || "")
  };
  const currentActionScope = () => JSON.stringify([
    sessionScopeRef.current.token,
    sessionScopeRef.current.email
  ]);
  const actionCountForScope = (scope = currentActionScope()) => activeActionCountRef.current.get(scope) || 0;
  const canUseFace = Boolean(authoritativeSessionToken) && (allUsers || []).some(
    (user) => Array.isArray(user.face_descriptors) && user.face_descriptors.length > 0
  );
  const authoritativeSessionGuardsSelected = Boolean(
    authoritativeSessionToken && authoritativeSessionUser?.email && selectedUser?.email && authoritativeSessionUser.email.toLowerCase() === selectedUser.email.toLowerCase()
  );
  const cancelDisplayReset = () => {
    if (displayResetTimerRef.current !== null) clearTimeout(displayResetTimerRef.current);
    displayResetTimerRef.current = null;
  };
  useEffect(() => {
    return () => {
      cancelDisplayReset();
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      stopAllMedia();
    };
  }, []);
  useEffect(() => {
    if (!isRecognizing) return void 0;
    const timer = setTimeout(() => {
      void resetState();
    }, 9e4);
    return () => clearTimeout(timer);
  }, [isRecognizing]);
  const showNotification = (type, userName, timestamp) => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    setNotification({ type, userName, time: format(new Date(timestamp), "h:mm a") });
    setCrystalSuccess(type === "in" ? "in" : "out");
    setTimeout(() => setCrystalSuccess(null), 1400);
    if (!quietNow()) playSoundEffect(type === "in" ? "chime" : "ding");
    notificationTimerRef.current = setTimeout(() => setNotification(null), 5e3);
  };
  const geoCacheRef = useRef({ at: 0, data: null });
  const refreshGeo = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoCacheRef.current = { at: Date.now(), data: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0) } };
      },
      () => {
      },
      { timeout: 4e3, maximumAge: 6e5 }
    );
  };
  useEffect(() => {
    refreshGeo();
    const t = setInterval(refreshGeo, 3e5);
    return () => clearInterval(t);
  }, []);
  const [dimmed, setDimmed] = useState(false);
  const dimTimerRef = useRef(null);
  const wake = () => {
    setDimmed(false);
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    dimTimerRef.current = setTimeout(() => setDimmed(true), 12e4);
  };
  useEffect(() => {
    wake();
    const h = () => wake();
    window.addEventListener("pointerdown", h);
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("pointerdown", h);
      window.removeEventListener("keydown", h);
      if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    };
  }, []);
  const [voiceOn] = useState(() => {
    try {
      return localStorage.getItem("ccs_kiosk_voice") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (voiceOn && recognitionStatus && "speechSynthesis" in window) {
      try {
        speechSynthesis.cancel();
        speechSynthesis.speak(new SpeechSynthesisUtterance(recognitionStatus));
      } catch {
      }
    }
  }, [recognitionStatus, voiceOn]);
  const [faceFails, setFaceFails] = useState(() => {
    try {
      return Number(localStorage.getItem("ccs_face_fails") || 0);
    } catch {
      return 0;
    }
  });
  const [holiday] = useState(() => {
    const d = /* @__PURE__ */ new Date();
    const key = d.toISOString().slice(0, 10);
    const map = { "2026-01-01": "New Year's Day", "2026-07-04": "Independence Day", "2026-11-26": "Thanksgiving", "2026-12-25": "Christmas" };
    return map[key] || null;
  });
  const quietNow = () => {
    try {
      const w = localStorage.getItem("ccs_kiosk_quiet");
      if (!w) return false;
      const [a, b] = w.split("-").map(Number);
      const h = (/* @__PURE__ */ new Date()).getHours();
      return a <= b ? h >= a && h < b : h >= a || h < b;
    } catch {
      return false;
    }
  };
  const [gloveMode] = useState(() => {
    try {
      return localStorage.getItem("ccs_kiosk_glove") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      let key = localStorage.getItem("ccs_kiosk_device_id");
      if (!key) {
        key = `kiosk-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("ccs_kiosk_device_id", key);
      }
      const regPayload = () => ({ action: "register_device", device_key: key, device_name: `Kiosk ${key.slice(-4)}`, scope: "kiosk", request_id: `devreg-${Date.now().toString(36)}` });
      base44.functions.invoke("timeClockAction", regPayload()).catch(() => {
        setTimeout(() => base44.functions.invoke("timeClockAction", regPayload()).catch((e) => console.warn("Kiosk device registration failed:", e?.message || e)), 15e3);
      });
    } catch {
    }
  }, []);
  const geoStamp = () => geoCacheRef.current.data && Date.now() - geoCacheRef.current.at < 6e5 ? geoCacheRef.current.data : null;
  const invokeTimeClock = async (payload) => {
    cancelDisplayReset();
    if (["clock_in", "clock_out", "break_start", "labor_start", "missed_clock_in"].includes(payload?.action) && !payload.geo) {
      const g = geoStamp();
      if (g) payload = { ...payload, geo: g };
    }
    if (payload?.action !== "status" && payload?.action !== "labor_allocation_preview") {
      workViewEpochRef.current += 1;
    }
    const actionScope = currentActionScope();
    activeActionCountRef.current.set(actionScope, actionCountForScope(actionScope) + 1);
    statusRefreshSequenceRef.current += 1;
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
      if (err?.retrySameRequest !== void 0) throw err;
      throw apiErrorFrom(err, "Time Clock action was not confirmed by the server.");
    } finally {
      const remaining = Math.max(0, actionCountForScope(actionScope) - 1);
      if (remaining) activeActionCountRef.current.set(actionScope, remaining);
      else activeActionCountRef.current.delete(actionScope);
      if (actionScope === currentActionScope()) statusRefreshSequenceRef.current += 1;
    }
  };
  const requestIdFor = (action, email) => {
    const key = `${action}:${String(email || "").trim().toLowerCase()}`;
    if (requestRef.current?.[key]) return requestRef.current[key];
    const recovered = storedRequestId(action, email);
    const id = recovered || newRequestId();
    const retained = recovered || persistRequestId(action, email, id);
    if (!retained && action !== "clock_out") {
      const message = "This browser cannot preserve the exact Time Clock request ID. Nothing was submitted. Enable session storage or use a trusted browser.";
      setPersistenceError(message);
      throw new Error(message);
    }
    requestRef.current = { ...requestRef.current, [key]: id };
    return id;
  };
  const clearRequest = (action, email, expectedRequestId = "") => {
    const key = `${action}:${String(email || "").trim().toLowerCase()}`;
    const inMemoryRequestId = requestRef.current?.[key] || "";
    const storedId = storedRequestId(action, email);
    if (!expectedRequestId || inMemoryRequestId === expectedRequestId) {
      const next = { ...requestRef.current };
      delete next[key];
      requestRef.current = next;
    }
    if (!expectedRequestId || storedId === expectedRequestId) {
      removeStoredRequestId(action, email);
    }
  };
  const stopFaceCamera = () => {
    faceRunRef.current += 1;
    qrLoopRef.current += 1;
    if (healthTimerRef.current) clearTimeout(healthTimerRef.current);
    setCameraHealth("ok");
    faceScanSessionRef.current?.stop();
    faceScanSessionRef.current = null;
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
    }
  };
  const stopAllMedia = async () => {
    stopFaceCamera();
    await stopQrScanner();
  };
  const loadFaceModels = async () => {
    if (modelsLoadedRef.current) return true;
    try {
      await loadFaceModelsOnce();
      modelsLoadedRef.current = true;
      return true;
    } catch (err) {
      console.error("Error loading face models:", err);
      return false;
    }
  };
  const findMatchingUser = (descriptor) => matchFaceRef.current(descriptor);
  const credentialPayload = (credential, userEmail) => {
    if (credential?.badgeCode) return { badge_code: credential.badgeCode };
    return {
      session_token: credential?.sessionToken || "",
      target_email: userEmail
    };
  };
  const applyAuthoritativeStatus = useCallback((status, fallbackUser, credential) => {
    cancelDisplayReset();
    workViewEpochRef.current += 1;
    const verifiedUser = status?.user || fallbackUser;
    if (!verifiedUser?.email) throw new Error("The server did not return a verified employee identity.");
    credentialRef.current = credential;
    setSelectedUser(verifiedUser);
    const verifiedEmail = String(verifiedUser.email).trim().toLowerCase();
    const pendingClockOut = clockOutSnapshotFor(verifiedEmail);
    if (status?.status === "clocked_out" || status?.status === "clocked_in" && status?.entry?.id && pendingClockOut && pendingClockOut.entryId !== String(status.entry.id)) {
      clearClockOutSnapshot(verifiedEmail);
      clearRequest("clock_out", verifiedEmail);
      if (clockOutAttemptRef.current?.email === verifiedEmail) {
        clockOutAttemptRef.current = null;
      }
    }
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
        startedAt: status.transition_started_at || null
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
      if (status?.work_pause_status === "paused") {
        setShowClockOut(false);
      } else if (pendingClockOut && pendingClockOut.entryId === String(status.entry.id)) {
        setShowClockOut(true);
      }
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
    if (!authoritativeSessionToken || !email || actionCountForScope() > 0) return null;
    const sequence = ++statusRefreshSequenceRef.current;
    const isCurrentRefresh = () => sequence === statusRefreshSequenceRef.current && actionCountForScope() === 0 && sessionScopeRef.current.token === authoritativeSessionToken && sessionScopeRef.current.email === email;
    if (!quiet) setIsLoading(true);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "status",
        session_token: authoritativeSessionToken,
        target_email: email
      });
      if (!isCurrentRefresh()) return null;
      const status = response?.data || response;
      if (!status?.success) throw new Error(status?.error || "Authoritative Time Clock status could not be restored.");
      const liveWorkDayPrompt = status?.work_day_prompt?.signature ? status.work_day_prompt : null;
      if (liveWorkDayPrompt && !workDayDismissedRef.current.has(liveWorkDayPrompt.signature)) {
        setWorkDayError("");
        setWorkDayPrompt(liveWorkDayPrompt);
      }
      const restored = applyAuthoritativeStatus(status, authoritativeSessionUser, { sessionToken: authoritativeSessionToken });
      const unresolvedPunchCount = Number(status?.unresolved_punch_review?.count || 0);
      const hasUnresolvedPunchReview = Number.isFinite(unresolvedPunchCount) && unresolvedPunchCount > 0;
      const unresolvedPunchLabel = unresolvedPunchCount === 1 ? "A previous punch report is" : `${unresolvedPunchCount} previous punch reports are`;
      const pendingShiftReviewCount = Number(status?.pending_shift_review?.count || 0);
      const hasPendingShiftReview = Number.isFinite(pendingShiftReviewCount) && pendingShiftReviewCount > 0;
      const pendingMissedClockInCount = Math.max(0, Number(status?.pending_shift_review?.missed_clock_in_count || 0));
      const pendingCorrectedShiftCount = Math.max(0, Number(status?.pending_shift_review?.corrected_shift_count || 0));
      const pendingShiftLabel = pendingMissedClockInCount > 0 && pendingCorrectedShiftCount === 0 ? pendingShiftReviewCount === 1 ? "Your reconstructed missed-Clock-In shift still needs" : `${pendingShiftReviewCount} reconstructed missed-Clock-In shifts still need` : pendingShiftReviewCount === 1 ? "A reviewed shift still needs" : `${pendingShiftReviewCount} reviewed shifts still need`;
      if (restored === "clocked_in") {
        setPersistenceError("");
        setRecognitionStatus(hasUnresolvedPunchReview ? `Active shift restored. ${unresolvedPunchLabel} still awaiting manager follow-up.` : hasPendingShiftReview ? `Active shift restored. ${pendingShiftLabel} final manager shift approval.` : `Active shift restored for ${status.user?.full_name || status.user?.email || email}.`);
      } else if (restored === "punch_resolution") {
        setPersistenceError("");
        setRecognitionStatus("Previous shift needs punch confirmation before a new Clock In.");
      } else if (restored === "transition") {
        setPersistenceError("");
      } else if (restored === "clocked_out") {
        setPersistenceError("");
        setRecognitionStatus(hasUnresolvedPunchReview ? `${unresolvedPunchLabel} still awaiting manager follow-up. You are currently Clocked Out.` : hasPendingShiftReview ? `${pendingShiftLabel} final manager shift approval. You are currently Clocked Out.` : "");
      }
      return status;
    } catch (err) {
      if (!quiet && isCurrentRefresh()) setPersistenceError(err?.response?.data?.error || err?.message || "Authoritative Time Clock status could not be restored.");
      return null;
    } finally {
      if (!quiet && isCurrentRefresh()) setIsLoading(false);
    }
  }, [applyAuthoritativeStatus, authoritativeSessionToken, authoritativeSessionUser]);
  useEffect(() => {
    if (!authoritativeSessionToken || !authoritativeSessionUser?.email) {
      statusRefreshSequenceRef.current += 1;
      setAuthoritativeTransition(null);
      return void 0;
    }
    refreshAuthoritativeSessionState({ quiet: true });
    const onFocus = () => refreshAuthoritativeSessionState({ quiet: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshAuthoritativeSessionState({ quiet: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      statusRefreshSequenceRef.current += 1;
      cancelDisplayReset();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authoritativeSessionToken, authoritativeSessionUser?.email, refreshAuthoritativeSessionState]);
  useEffect(() => {
    if (!authoritativeTransition || !authoritativeSessionToken || !authoritativeSessionUser?.email) return void 0;
    const poll = setInterval(() => {
      if (!document.hidden) refreshAuthoritativeSessionState({ quiet: true });
    }, 3e3);
    return () => clearInterval(poll);
  }, [authoritativeTransition, authoritativeSessionToken, authoritativeSessionUser?.email, refreshAuthoritativeSessionState]);
  const resetState = async () => {
    cancelDisplayReset();
    workViewEpochRef.current += 1;
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
    setMissedClockInPrompt(false);
    setWorkDayPrompt(null);
    setWorkDayError("");
    identifyIntentRef.current = "clock_in";
    setUsernameInput("");
    setManualPassword("");
    setUsernameError("");
    setIsLoading(false);
  };
  const scheduleDisplayReset = (delayMs) => {
    cancelDisplayReset();
    const currentSequence = statusRefreshSequenceRef.current;
    const currentScope = { ...sessionScopeRef.current };
    displayResetTimerRef.current = setTimeout(() => {
      displayResetTimerRef.current = null;
      if (statusRefreshSequenceRef.current !== currentSequence || sessionScopeRef.current.token !== currentScope.token || sessionScopeRef.current.email !== currentScope.email || actionCountForScope() > 0) return;
      resetState();
    }, delayMs);
  };
  const performClockIn = async (user, credential) => {
    const email = user?.email;
    if (!email) throw new Error("Verified employee identity is missing an email address.");
    const normEmail = String(email).trim().toLowerCase();
    if (lastPunchRef.current.email === normEmail && Date.now() - lastPunchRef.current.at < 5e3) {
      setRecognitionStatus("Already clocked in. Duplicate punch ignored.");
      scheduleDisplayReset(3e3);
      return null;
    }
    const clockScope = currentActionScope();
    const stillCurrent = () => clockScope === currentActionScope();
    const requestId = requestIdFor("clock_in", email);
    let actionEpoch = workViewEpochRef.current;
    setIsLoading(true);
    setPersistenceError("");
    try {
      const pending = invokeTimeClock({
        action: "clock_in",
        request_id: requestId,
        ...credentialPayload(credential, email)
      });
      actionEpoch = workViewEpochRef.current;
      const data = await pending;
      assertEmployeeAcknowledgement(data, email, "Clock-in");
      clearRequest("clock_in", email, requestId);
      if (!stillCurrent() || actionEpoch !== workViewEpochRef.current) return null;
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
        lastPunchRef.current = { email: normEmail, at: Date.now() };
        setActiveEntry(data.entry || null);
        setRecognitionStatus("Already clocked in. No duplicate entry was created.");
        scheduleDisplayReset(3e3);
        return data;
      }
      lastPunchRef.current = { email: normEmail, at: Date.now() };
      showNotification("in", data.user?.full_name || user.full_name || email, data.entry?.clock_in || (/* @__PURE__ */ new Date()).toISOString());
      const clockInPrompt = data.work_day_prompt?.signature ? data.work_day_prompt : null;
      if (clockInPrompt && !workDayDismissedRef.current.has(clockInPrompt.signature)) {
        setWorkDayError("");
        setWorkDayPrompt(clockInPrompt);
      }
      const clockInAt = data.entry?.clock_in ? new Date(data.entry.clock_in) : /* @__PURE__ */ new Date();
      const lunchEta = new Date(clockInAt.getTime() + 4.5 * 36e5);
      const schedStart = data.todays_schedule?.scheduled_start || data.todays_schedule?.start_time || "";
      const early = schedStart ? (() => {
        const [sh, sm] = String(schedStart).split(":").map(Number);
        const sMin = sh * 60 + (sm || 0);
        const pMin = clockInAt.getHours() * 60 + clockInAt.getMinutes();
        return sMin - pMin > 20 ? Math.round(sMin - pMin) : 0;
      })() : 0;
      setRecognitionStatus(
        `Clocked in at ${format(clockInAt, "h:mm a")} \u2014 lunch reminder ~${format(lunchEta, "h:mm a")}.` + (early ? ` (${early}m ahead of your ${schedStart} schedule)` : "")
      );
      setClockOutDismissed(data.entry?.id, true);
      scheduleDisplayReset(5e3);
      return data;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("clock_in", email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        setPersistenceError(err.message || "Clock-in was not confirmed by the server.");
        setRecognitionStatus(err.retrySameRequest ? "Clock-in may have been saved. Retry the same action to recover safely." : "Clock-in blocked. Review the message below.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };
  const resolveVerifiedIdentity = async ({ user = null, credential }) => {
    setIsLoading(true);
    setPersistenceError("");
    try {
      const status = await invokeTimeClock({
        action: "status",
        clock_action_intent: true,
        ...credentialPayload(credential, user?.email)
      });
      const verifiedUser = status.user || user;
      if (!verifiedUser?.email) throw new Error("The server did not return a verified employee identity.");
      const resolvedStatus = applyAuthoritativeStatus(status, verifiedUser, credential);
      if (identifyIntentRef.current === "missed_shift") {
        identifyIntentRef.current = "clock_in";
        setMissedShiftError("");
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}. Enter the shift that was missed.`);
        setMissedShiftPrompt(true);
        return;
      }
      if (identifyIntentRef.current === "admin_note") {
        identifyIntentRef.current = "clock_in";
        setAdminNoteError("");
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}.`);
        setAdminNotePrompt(true);
        return;
      }
      if (resolvedStatus === "clocked_in") {
        if (identifyIntentRef.current === "missed_clock_in") {
          identifyIntentRef.current = "clock_in";
          setClockOutDismissed(status?.entry?.id, true);
          setShowClockOut(false);
          setRecognitionStatus(`${verifiedUser.full_name || verifiedUser.email}, you're already clocked in - no missed Clock In to report.`);
          return;
        }
        if (identifyIntentRef.current === "missed_clock_out") {
          identifyIntentRef.current = "clock_in";
          setClockOutDismissed(status?.entry?.id, false);
          setShowClockOut(true);
          setRecognitionStatus(`${verifiedUser.full_name || verifiedUser.email}, this shift is still open - clock out now. For an older shift that ended wrong, request a correction on your Time Clock page.`);
          return;
        }
        setClockOutDismissed(status?.entry?.id, false);
        setShowClockOut(true);
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}! Active shift restored.`);
        return;
      }
      if (resolvedStatus === "punch_resolution") {
        if (identifyIntentRef.current === "missed_clock_out") {
          identifyIntentRef.current = "clock_in";
          setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email} - tell us when you actually left and we'll send the fix to your manager.`);
        } else {
          setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}. Resolve the previous shift before starting a new one.`);
        }
        return;
      }
      if (resolvedStatus === "transition") return;
      if (identifyIntentRef.current === "missed_clock_out") {
        identifyIntentRef.current = "clock_in";
        setRecognitionStatus(`${verifiedUser.full_name || verifiedUser.email}, there's no open shift to fix. To correct a finished shift, use Request a correction on your Time Clock page.`);
        return;
      }
      if (identifyIntentRef.current === "missed_clock_in") {
        setLateClockInReview(null);
        setLateClockInError("");
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}. Enter the time you actually arrived today.`);
        setMissedClockInPrompt(true);
        return;
      }
      if (resolvedStatus === "late_clock_in_review") {
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}. Confirm whether you missed Clock In before continuing.`);
        return;
      }
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
    identifyFlowSeqRef.current += 1;
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
  const startCameraMode = async () => {
    await stopAllMedia();
    identifyFlowSeqRef.current += 1;
    recognitionLockedRef.current = false;
    setIsRecognizing(true);
    setRecognitionMethod("camera");
    setUsernameError("");
    const faceEnabled = Boolean(authoritativeSessionToken) && canUseFace;
    setRecognitionStatus("Starting camera...");
    const faceRun = faceRunRef.current;
    try {
      const [modelsReady, stream] = await Promise.all([
        faceEnabled ? loadFaceModels() : Promise.resolve(false),
        Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: (() => {
              const pref = (() => {
                try {
                  return localStorage.getItem("ccs_kiosk_camera_id");
                } catch {
                  return null;
                }
              })();
              const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
              return pref ? { ...base, deviceId: { exact: pref } } : { ...base, facingMode: "user" };
            })()
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Camera start timed out. Check that the camera is connected and permissions are granted.")), 12e3))
        ])
      ]);
      if (faceRun !== faceRunRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (faceRun !== faceRunRef.current) return;
      if (supportsInlineQrDetection()) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const qrRun = ++qrLoopRef.current;
        const tick = async () => {
          if (qrRun !== qrLoopRef.current || faceRun !== faceRunRef.current) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2 && !recognitionLockedRef.current) {
            try {
              const codes = await detector.detect(v);
              const hit = (codes || []).find((c) => String(c?.rawValue || "").startsWith("TIMECLOCK2:"));
              if (hit) {
                void handleQrDecoded(hit.rawValue);
                return;
              }
            } catch {
            }
          }
          setTimeout(tick, 350);
        };
        setTimeout(tick, 400);
      }
      const healthRun = faceRun;
      const healthTick = () => {
        if (healthRun !== faceRunRef.current) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2) {
          try {
            const c = healthCanvasRef.current || (healthCanvasRef.current = document.createElement("canvas"));
            c.width = 32;
            c.height = 24;
            c.getContext("2d").drawImage(v, 0, 0, 32, 24);
            const d = c.getContext("2d").getImageData(0, 0, 32, 24).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
            const brightness = sum / (d.length / 4);
            setCameraHealth(brightness < 30 ? "dark" : brightness > 225 ? "blown" : "ok");
          } catch {
          }
        }
        healthTimerRef.current = setTimeout(healthTick, 5e3);
      };
      healthTimerRef.current = setTimeout(healthTick, 2e3);
      if (!faceEnabled || !modelsReady) {
        const qrHint = supportsInlineQrDetection() ? IDENTIFY_QR_ONLY_BLURB : IDENTIFY_QR_BUTTON_PROMPT;
        const faceHint = authoritativeSessionToken && !canUseFace ? " Face scan is unavailable right now - retrying in the background." : "";
        setRecognitionStatus(qrHint + faceHint);
        return;
      }
      setRecognitionStatus(IDENTIFY_CAMERA_BLURB);
      const session = createFaceScanSession({
        getVideo: () => videoRef.current,
        matchFace: (descriptor) => findMatchingUser(descriptor),
        isActive: () => !recognitionLockedRef.current,
        onFrame: ({ status, winner, votes }) => {
          if (faceRun !== faceRunRef.current) {
            session.stop();
            return;
          }
          if (status === "recognized" && winner) {
            session.stop();
            void handleFaceRecognized(winner);
            return;
          }
          setRecognitionStatus(status === "verifying" && votes?.required ? `Hold still - verifying your identity... ${votes.count}/${votes.required}` : FACE_SCAN_STATUS_TEXT[status] || "Look directly at the camera in even lighting.");
        }
      });
      faceScanSessionRef.current = session;
      session.start();
    } catch (err) {
      console.error("Camera error:", err);
      stopFaceCamera();
      setRecognitionStatus("Camera unavailable. Use Secure QR or Username instead.");
    }
  };
  useEffect(() => {
    if (canUseFace && isRecognizing && recognitionMethod === "camera" && !faceScanSessionRef.current?.isRunning?.()) {
      void startCameraMode();
    }
  }, [canUseFace, isRecognizing, recognitionMethod]);
  const handleQrDecoded = async (decodedText) => {
    if (recognitionLockedRef.current) return;
    identifyFlowSeqRef.current += 1;
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
      setRecognitionMethod("camera");
      recognitionLockedRef.current = false;
    }
  };
  const startQrScannerWithFacingMode = async (facingMode) => {
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("hybrid-qr-reader");
    qrScannerRef.current = scanner;
    await scanner.start(
      { facingMode },
      { fps: 8, qrbox: { width: 220, height: 220 }, aspectRatio: 1.333333 },
      handleQrDecoded,
      () => {
      }
    );
  };
  const startQrMode = async () => {
    await stopAllMedia();
    identifyFlowSeqRef.current += 1;
    recognitionLockedRef.current = false;
    setIsRecognizing(true);
    setRecognitionMethod("qr");
    setRecognitionStatus("Starting QR camera...");
    setUsernameError("");
    const qrPrompt = canUseFace ? IDENTIFY_QR_BADGE_BLURB_FACE : IDENTIFY_QR_BADGE_BLURB;
    try {
      await startQrScannerWithFacingMode("environment");
      setRecognitionStatus(qrPrompt);
    } catch (environmentError) {
      console.warn("Rear QR camera unavailable, trying front camera:", environmentError);
      await stopQrScanner();
      try {
        await startQrScannerWithFacingMode("user");
        setRecognitionStatus(qrPrompt);
      } catch (frontError) {
        console.error("QR camera error:", frontError);
        await stopQrScanner();
        setRecognitionStatus("QR camera unavailable. Use Username instead.");
      }
    }
  };
  const startManualMode = async () => {
    await stopAllMedia();
    identifyFlowSeqRef.current += 1;
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
    workViewEpochRef.current += 1;
    identifyFlowSeqRef.current += 1;
    cancelDisplayReset();
    setPersistenceError("");
    setUsernameInput("");
    setManualPassword("");
    setSelectedUser(null);
    setActiveEntry(null);
    credentialRef.current = null;
    requestRef.current = {};
    await startCameraMode();
  };
  const handleManualSubmit = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed || !manualPassword) {
      setUsernameError("Enter your username and password.");
      return;
    }
    const identifySeq = ++identifyFlowSeqRef.current;
    const requestEpoch = workViewEpochRef.current;
    const stillCurrent = () => identifyFlowSeqRef.current === identifySeq && workViewEpochRef.current === requestEpoch;
    setIsLoading(true);
    setUsernameError("");
    try {
      const response = await base44.functions.invoke("verifyLogin", {
        username: trimmed,
        password: manualPassword
      });
      const data = response?.data || response;
      if (!stillCurrent()) return;
      if (!data?.success || !data?.user || !data?.token) {
        throw new Error(data?.error || "Invalid username or password.");
      }
      setManualPassword("");
      recognitionLockedRef.current = true;
      setIsRecognizing(false);
      await resolveVerifiedIdentity({ user: data.user, credential: { sessionToken: data.token } });
    } catch (err) {
      if (!stillCurrent()) return;
      const message = err?.response?.data?.error || err?.message || "Invalid username or password.";
      setUsernameError(message);
      setIsRecognizing(true);
      setRecognitionMethod("manual");
      recognitionLockedRef.current = false;
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };
  const applyBreakResponse = (data) => {
    setBreakStatus(data?.break_status || "working");
    setActiveBreak(data?.break_status === "on_break" ? data?.break || null : null);
    setBreakSummary(data?.break_summary || { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });
    if (Object.prototype.hasOwnProperty.call(data || {}, "active_labor")) setActiveLabor(data.active_labor || null);
    if (data?.labor_summary) setLaborSummary(data.labor_summary);
    if (data?.entry?.id) setActiveEntry(data.entry);
  };
  const applyWorkPauseResponse = (data) => {
    setWorkPauseAllowed(data?.work_pause_allowed === true || workPauseAllowed);
    setWorkPauseStatus(data?.work_pause_status || "working");
    setActiveWorkPause(data?.work_pause_status === "paused" ? data?.work_pause || data?.active_work_pause || null : null);
    setWorkPauseSummary(data?.work_pause_summary || { count: 0, total_minutes: 0 });
    if (Object.prototype.hasOwnProperty.call(data || {}, "active_labor")) setActiveLabor(data.active_labor || null);
    if (data?.labor_summary) setLaborSummary(data.labor_summary);
    if (data?.entry?.id) setActiveEntry(data.entry);
  };
  const breakContextFor = (email) => {
    const scope = currentActionScope();
    const expectedEmail = String(email || "").trim().toLowerCase();
    const expectedEntryId = String(activeEntry?.id || "");
    return () => scope === currentActionScope() && selectionRef.current.email === expectedEmail && selectionRef.current.entryId === expectedEntryId;
  };
  const assertBreakAcknowledgementIdentity = (data, email, entryId) => {
    const expectedEmail = String(email || "").trim().toLowerCase();
    const responseEmail = String(data?.user?.email || "").trim().toLowerCase();
    const responseEntryId = String(data?.entry?.id || "");
    const entryEmail = String(data?.entry?.user_email || "").trim().toLowerCase();
    if (responseEmail === expectedEmail && responseEntryId === String(entryId || "") && entryEmail === expectedEmail) return;
    const error = new Error("Break response could not be matched to this employee and active shift. The exact request is preserved; refresh status and retry the same action.");
    error.retrySameRequest = true;
    throw error;
  };
  const assertEmployeeAcknowledgement = (data, email, label) => {
    const expectedEmail = String(email || "").trim().toLowerCase();
    const responseEmail = String(data?.user?.email || "").trim().toLowerCase();
    const entryEmail = String(data?.entry?.user_email || "").trim().toLowerCase();
    if (responseEmail === expectedEmail && (!entryEmail || entryEmail === expectedEmail)) return;
    const error = new Error(`${label} response could not be matched to this employee. The exact request is preserved; refresh status and retry the same action.`);
    error.retrySameRequest = true;
    throw error;
  };
  const assertPunchResolutionAcknowledgementIdentity = (data, email, entryId) => {
    const expectedEmail = String(email || "").trim().toLowerCase();
    const responseEmail = String(data?.user?.email || "").trim().toLowerCase();
    const entryMatches = !data?.entry || String(data.entry.id || "") === String(entryId || "") && (!data.entry.user_email || String(data.entry.user_email).trim().toLowerCase() === expectedEmail);
    const punchCase = data?.punch_exception;
    const punchCaseMatches = !punchCase || String(punchCase.user_email || "").trim().toLowerCase() === expectedEmail && String(punchCase.time_entry_id || "") === String(entryId || "");
    if (responseEmail === expectedEmail && entryMatches && punchCaseMatches) return;
    const error = new Error("Punch resolution response could not be matched to this employee and active shift. The exact request is preserved; refresh status and retry the same action.");
    error.retrySameRequest = true;
    throw error;
  };
  const handleStartBreak = async ({ breakType, isPaid }) => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Break identity is no longer verified. Close this dialog and identify again.");
    }
    const email = selectedUser.email;
    const stillCurrent = breakContextFor(email);
    const actionKey = `break_start:${breakType}:${isPaid ? "paid" : "unpaid"}`;
    const requestId = requestIdFor(actionKey, email);
    let actionEpoch = workViewEpochRef.current;
    setPersistenceError("");
    try {
      const pending = invokeTimeClock({
        action: "break_start",
        request_id: requestId,
        break_type: breakType,
        is_paid: isPaid,
        ...credentialPayload(credentialRef.current, email)
      });
      actionEpoch = workViewEpochRef.current;
      const result = await pending;
      assertBreakAcknowledgementIdentity(result, email, activeEntry.id);
      clearRequest(actionKey, email, requestId);
      if (!stillCurrent() || actionEpoch !== workViewEpochRef.current) return null;
      applyBreakResponse(result);
      setRecognitionStatus(isPaid ? "Paid break started and confirmed by server." : "Unpaid lunch started and confirmed by server.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest(actionKey, email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        setPersistenceError(err?.message || "Break start was not confirmed by the server.");
      }
      throw err;
    }
  };
  const handleEndBreak = async () => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Break identity is no longer verified. Close this dialog and identify again.");
    }
    const email = selectedUser.email;
    const stillCurrent = breakContextFor(email);
    const requestId = requestIdFor("break_end", email);
    let actionEpoch = workViewEpochRef.current;
    setPersistenceError("");
    try {
      const pending = invokeTimeClock({
        action: "break_end",
        request_id: requestId,
        ...credentialPayload(credentialRef.current, email)
      });
      actionEpoch = workViewEpochRef.current;
      const result = await pending;
      assertBreakAcknowledgementIdentity(result, email, activeEntry.id);
      clearRequest("break_end", email, requestId);
      if (!stillCurrent() || actionEpoch !== workViewEpochRef.current) return null;
      applyBreakResponse(result);
      setRecognitionStatus("Break ended and confirmed by server.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("break_end", email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        setPersistenceError(err?.message || "Break end was not confirmed by the server.");
      }
      throw err;
    }
  };
  const assertCurrentWorkAcknowledgementIdentity = (data, email, entryId) => {
    const expectedEmail = String(email || "").trim().toLowerCase();
    const responseEmail = String(data?.user?.email || "").trim().toLowerCase();
    const responseEntryId = String(data?.entry?.id || "");
    const entryEmail = String(data?.entry?.user_email || "").trim().toLowerCase();
    const labor = data?.active_labor;
    const laborMatches = !labor || String(labor.user_email || "").trim().toLowerCase() === expectedEmail && String(labor.time_entry_id || "") === String(entryId || "");
    if (responseEmail === expectedEmail && responseEntryId === String(entryId || "") && entryEmail === expectedEmail && laborMatches) return;
    const error = new Error("Current Work response could not be matched to this employee, active shift, and labor segment. The exact request is preserved; refresh status and retry the same action.");
    error.retrySameRequest = true;
    throw error;
  };
  const handleLaborAction = async (action, { activityType = "", workOrderId = "" } = {}) => {
    if (!activeEntry?.id || !selectedUser?.email || !credentialRef.current) {
      throw new Error("Current Work identity is no longer verified. Close this dialog and identify again.");
    }
    if (breakStatus !== "working" || activeBreak?.id) throw new Error("End the active break before changing Current Work.");
    if (workPauseStatus !== "working" || activeWorkPause?.id) throw new Error("Resume Work before changing Current Work.");
    const email = selectedUser.email;
    const stillCurrentEntry = breakContextFor(email);
    const requestId = requestIdFor(action, email);
    let actionEpoch = workViewEpochRef.current;
    setPersistenceError("");
    try {
      const pending = invokeTimeClock({
        action,
        request_id: requestId,
        activity_type: activityType,
        work_order_id: workOrderId,
        ...credentialPayload(credentialRef.current, email)
      });
      actionEpoch = workViewEpochRef.current;
      const result = await pending;
      if (!stillCurrentEntry() || actionEpoch !== workViewEpochRef.current) {
        clearRequest(action, email, requestId);
        return null;
      }
      assertCurrentWorkAcknowledgementIdentity(result, email, activeEntry.id);
      clearRequest(action, email, requestId);
      setActiveLabor(result.active_labor || null);
      setLaborSummary(result.labor_summary || { count: 0, total_minutes: 0 });
      if (result?.entry?.id) setActiveEntry(result.entry);
      setRecognitionStatus(action === "labor_stop" ? "Current Work stopped and confirmed by server." : action === "labor_change" ? "Current Work changed and confirmed by server." : "Current Work started and confirmed by server.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest(action, email, requestId);
      if (stillCurrentEntry() && actionEpoch === workViewEpochRef.current) {
        setPersistenceError(err?.message || "Current Work was not confirmed by the server.");
      }
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
        ...credentialPayload(credentialRef.current, selectedUser.email)
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
    const entryId = String(activeEntry.id);
    const stillCurrent = breakContextFor(email);
    const requestId = requestIdFor("resolve_punch_exception", email);
    const credential = credentialRef.current;
    const user = selectedUser;
    let actionEpoch = workViewEpochRef.current;
    setPunchResolutionError("");
    setPersistenceError("");
    setIsLoading(true);
    try {
      const pending = invokeTimeClock({
        action: "resolve_punch_exception",
        request_id: requestId,
        response,
        ...claimedClockOut ? { claimed_clock_out: claimedClockOut } : {},
        ...credentialPayload(credential, email)
      });
      actionEpoch = workViewEpochRef.current;
      const result = await pending;
      assertPunchResolutionAcknowledgementIdentity(result, email, entryId);
      clearRequest("resolve_punch_exception", email, requestId);
      if (!stillCurrent() || actionEpoch !== workViewEpochRef.current) return null;
      if (result?.worked_through === true && result?.status === "clocked_in") {
        setPunchResolution(null);
        setActiveEntry(result.entry || activeEntry);
        setRecognitionStatus("Continuous shift confirmed. Your original Clock In remains active and no punch time was changed.");
        scheduleDisplayReset(2500);
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
      if (!shouldRetainRequest(err)) clearRequest("resolve_punch_exception", email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        const message = err?.message || "Punch resolution was not confirmed by the server.";
        setPunchResolutionError(message);
        setRecognitionStatus(err?.retrySameRequest ? "Punch resolution may have been saved. Retry the same response to recover safely." : "Punch resolution is blocked. Review the message in the window.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };
  const handleMissedClockOutResolution = (claimedClockOut) => handlePunchResolution({ response: "missed_clock_out", claimedClockOut });
  const handleWorkedThroughResolution = () => handlePunchResolution({ response: "worked_through" });
  const handleRecoverMissedClockIn = async (claimedClockIn) => {
    if (!selectedUser?.email || !credentialRef.current) {
      throw new Error("Missed Clock In identity is no longer verified. Identify again before continuing.");
    }
    const email = selectedUser.email;
    const stillCurrent = breakContextFor(email);
    const requestId = requestIdFor("recover_missed_clock_in", email);
    let actionEpoch = workViewEpochRef.current;
    setLateClockInError("");
    setPersistenceError("");
    setIsLoading(true);
    try {
      const pending = invokeTimeClock({
        action: "recover_missed_clock_in",
        request_id: requestId,
        claimed_clock_in: claimedClockIn,
        ...credentialPayload(credentialRef.current, email)
      });
      actionEpoch = workViewEpochRef.current;
      const result = await pending;
      assertEmployeeAcknowledgement(result, email, "Missed Clock In recovery");
      clearRequest("recover_missed_clock_in", email, requestId);
      if (!stillCurrent() || actionEpoch !== workViewEpochRef.current) return null;
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
      if (!shouldRetainRequest(err)) clearRequest("recover_missed_clock_in", email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        const message = err?.message || "Missed Clock In recovery was not confirmed by the server.";
        setLateClockInError(message);
        setRecognitionStatus(err?.retrySameRequest ? "Missed Clock In may have been saved. Retry the same recovery to finish safely." : "Missed Clock In recovery is blocked. Review the message in the window.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };
  const handleReportMissedClockIn = async (claimedClockIn) => {
    if (!selectedUser?.email || !credentialRef.current) {
      throw new Error("Missed Clock In identity is no longer verified. Identify again before continuing.");
    }
    const email = selectedUser.email;
    const stillCurrent = breakContextFor(email);
    const requestId = requestIdFor("report_missed_clock_in", email);
    let actionEpoch = workViewEpochRef.current;
    setLateClockInError("");
    setPersistenceError("");
    setIsLoading(true);
    try {
      const pending = invokeTimeClock({
        action: "report_missed_clock_in",
        request_id: requestId,
        claimed_clock_in: claimedClockIn,
        ...credentialPayload(credentialRef.current, email)
      });
      actionEpoch = workViewEpochRef.current;
      const result = await pending;
      assertEmployeeAcknowledgement(result, email, "Missed Clock In report");
      clearRequest("report_missed_clock_in", email, requestId);
      if (!stillCurrent() || actionEpoch !== workViewEpochRef.current) return null;
      if (result?.recovered_missed_clock_in !== true || result?.status !== "clocked_in" || !result?.entry?.id) {
        throw new Error("Missed Clock In report returned an unexpected authoritative state. Reload before continuing.");
      }
      identifyIntentRef.current = "clock_in";
      setMissedClockInPrompt(false);
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
      showNotification("in", result.user?.full_name || selectedUser.full_name || email, result.entry?.clock_in || (/* @__PURE__ */ new Date()).toISOString());
      setRecognitionStatus("Shift started from your reported arrival time. A manager will review this Clock In.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("report_missed_clock_in", email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        const message = err?.message || "Missed Clock In report was not confirmed by the server.";
        setLateClockInError(message);
        setRecognitionStatus(err?.retrySameRequest ? "Missed Clock In may have been saved. Retry the same report to finish safely." : "Missed Clock In report is blocked. Review the message in the window.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };
  const handleReportMissedShift = async ({ claimed_clock_in, claimed_clock_out, lunch_minutes, reason }) => {
    if (!selectedUser?.email || !credentialRef.current) {
      throw new Error("Missed-shift identity is no longer verified. Identify again before continuing.");
    }
    const email = selectedUser.email;
    const stillCurrent = breakContextFor(email);
    const requestId = requestIdFor("report_missed_shift", email);
    let actionEpoch = workViewEpochRef.current;
    setMissedShiftError("");
    setPersistenceError("");
    setIsLoading(true);
    try {
      const result = await invokeTimeClock({
        action: "report_missed_shift",
        request_id: requestId,
        claimed_clock_in,
        claimed_clock_out,
        lunch_minutes,
        reason,
        ...credentialPayload(credentialRef.current, email)
      });
      assertEmployeeAcknowledgement(result, email, "Missed shift report");
      clearRequest("report_missed_shift", email, requestId);
      if (!stillCurrent() || actionEpoch !== workViewEpochRef.current) return null;
      if (result?.success !== true || !result?.entry?.id || result.entry.status !== "clocked_out") {
        throw new Error("Missed shift report returned an unexpected response. Reload before continuing.");
      }
      setMissedShiftPrompt(false);
      setMissedShiftError("");
      setRecognitionStatus("Missed shift reported - a manager will review and approve those hours.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("report_missed_shift", email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        setMissedShiftError(err?.message || "Missed shift report was not confirmed by the server.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };
  const handleSendAdminNote = async (note) => {
    if (!selectedUser?.email || !credentialRef.current) {
      throw new Error("Note identity is no longer verified. Identify again before continuing.");
    }
    const email = selectedUser.email;
    const stillCurrent = breakContextFor(email);
    const requestId = requestIdFor("send_admin_note", email);
    setAdminNoteError("");
    setPersistenceError("");
    setIsLoading(true);
    try {
      const result = await invokeTimeClock({
        action: "send_admin_note",
        request_id: requestId,
        note,
        ...credentialPayload(credentialRef.current, email)
      });
      if (result?.success !== true || !result?.note?.id || String(result.note.user_email || "").trim().toLowerCase() !== email.trim().toLowerCase()) {
        throw new Error("The note was not confirmed by the server.");
      }
      clearRequest("send_admin_note", email, requestId);
      if (!stillCurrent()) return null;
      setAdminNotePrompt(false);
      setAdminNoteError("");
      setRecognitionStatus("Note sent to the admins.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("send_admin_note", email, requestId);
      if (stillCurrent()) {
        setAdminNoteError(err?.message || "The note could not be sent.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };
  const handleResolveWorkDay = async (decision) => {
    if (!selectedUser?.email || !credentialRef.current || !workDayPrompt?.signature) {
      throw new Error("Work-day identity is no longer verified. Identify again before continuing.");
    }
    const email = selectedUser.email;
    const signature = workDayPrompt.signature;
    const stillCurrent = breakContextFor(email);
    const requestId = requestIdFor("resolve_work_day", email);
    setWorkDayError("");
    setPersistenceError("");
    setIsLoading(true);
    try {
      const result = await invokeTimeClock({
        action: "resolve_work_day",
        request_id: requestId,
        decision,
        signature,
        ...credentialPayload(credentialRef.current, email)
      });
      assertEmployeeAcknowledgement(result, email, "Work-day decision");
      clearRequest("resolve_work_day", email, requestId);
      if (!stillCurrent()) return null;
      workDayDismissedRef.current.add(signature);
      setWorkDayPrompt(null);
      setWorkDayError("");
      setRecognitionStatus(decision === "same_day" ? "Work day confirmed - all listed shifts count toward it." : "Got it - those shifts stay on separate days.");
      if (!activeEntry?.id) scheduleDisplayReset(2e3);
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("resolve_work_day", email, requestId);
      if (stillCurrent()) {
        setWorkDayError(err?.message || "The work-day answer was not confirmed by the server.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
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
    const entryId = String(activeEntry.id);
    const stillCurrent = breakContextFor(email);
    const storedBeforeAttempt = storedRequestId("clock_out", email);
    const requestId = requestIdFor("clock_out", email);
    const submittedBody = {
      lunch_minutes: data.lunchMinutes,
      job_allocations: data.jobAllocations,
      notes: data.notes
    };
    const previous = clockOutAttemptRef.current;
    const savedSnapshot = clockOutSnapshotFor(email);
    const payloadJson = JSON.stringify(submittedBody);
    if (previous?.requestId === requestId && previous.email === String(email).toLowerCase() && previous.entryId === entryId && previous.payloadJson !== payloadJson || savedSnapshot && (savedSnapshot.requestId !== requestId || savedSnapshot.entryId !== entryId || JSON.stringify(savedSnapshot.body) !== payloadJson)) {
      throw new Error("An earlier Clock Out is unconfirmed. Retry with the original lunch, allocations and notes; do not replace the pending request details.");
    }
    if (storedBeforeAttempt && !savedSnapshot && !previous) {
      throw new Error("The previous Clock Out request cannot be reconstructed safely on this device. Reload authoritative status and contact a manager before changing this shift.");
    }
    if (!savedSnapshot && !saveClockOutSnapshot(email, entryId, requestId, submittedBody)) {
      throw new Error("This browser cannot preserve the original Clock Out for interruption recovery. Nothing was submitted. Enable session storage or use a trusted browser.");
    }
    clockOutAttemptRef.current = {
      email: String(email).toLowerCase(),
      entryId,
      requestId,
      payloadJson
    };
    setPersistenceError("");
    if (stillCurrent()) setIsLoading(true);
    try {
      const result = await invokeTimeClock({
        action: "clock_out",
        request_id: requestId,
        ...submittedBody,
        ...credentialPayload(credentialRef.current, email)
      });
      clearClockOutSnapshot(email, requestId);
      clearRequest("clock_out", email, requestId);
      if (clockOutAttemptRef.current?.requestId === requestId) clockOutAttemptRef.current = null;
      if (stillCurrent()) {
        showNotification("out", result.user?.full_name || selectedUser.full_name || email, result.entry?.clock_out || (/* @__PURE__ */ new Date()).toISOString());
        setShowClockOut(false);
        setActiveEntry(null);
        setRecognitionStatus("Clock-out confirmed by server.");
        if (result?.work_day_prompt?.signature) {
          setWorkDayError("");
          setWorkDayPrompt(result.work_day_prompt);
        } else {
          scheduleDisplayReset(2500);
        }
      }
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) {
        clearClockOutSnapshot(email, requestId);
        clearRequest("clock_out", email, requestId);
        if (clockOutAttemptRef.current?.requestId === requestId) clockOutAttemptRef.current = null;
      }
      if (stillCurrent()) {
        const message = err?.message || "Clock-out was not confirmed by the server.";
        setPersistenceError(message);
        setRecognitionStatus(shouldRetainRequest(err) ? "Clock-out may already be saved. Retry the identical request to recover safely." : "Clock-out blocked. Correct the issue and submit again.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      MissedPunchResolutionDialog,
      {
        open: Boolean(punchResolution && activeEntry && selectedUser),
        entry: activeEntry,
        userName: selectedUser?.full_name || selectedUser?.email,
        resolution: punchResolution,
        busy: isLoading,
        error: punchResolutionError,
        onMissedClockOut: handleMissedClockOutResolution,
        onWorkedThrough: handleWorkedThroughResolution
      }
    ),
    /* @__PURE__ */ jsx(
      LateClockInReviewDialog,
      {
        open: Boolean(lateClockInReview && selectedUser && !activeEntry),
        userName: selectedUser?.full_name || selectedUser?.email,
        review: lateClockInReview,
        busy: isLoading,
        error: lateClockInError,
        onRecoverMissedClockIn: handleRecoverMissedClockIn,
        onClockInNow: handleLateClockInClockInNow
      }
    ),
    /* @__PURE__ */ jsx(
      MissedClockInDialog,
      {
        open: missedClockInPrompt && Boolean(selectedUser),
        userName: selectedUser?.full_name || selectedUser?.email,
        busy: isLoading,
        error: lateClockInError,
        onReport: handleReportMissedClockIn,
        onCancel: resetState
      }
    ),
    /* @__PURE__ */ jsx(
      MissedShiftDialog,
      {
        open: missedShiftPrompt && Boolean(selectedUser),
        userName: selectedUser?.full_name || selectedUser?.email,
        busy: isLoading,
        error: missedShiftError,
        onReport: handleReportMissedShift,
        onCancel: () => {
          setMissedShiftPrompt(false);
          setMissedShiftError("");
        }
      }
    ),
    /* @__PURE__ */ jsx(
      AdminNoteDialog,
      {
        open: adminNotePrompt && Boolean(selectedUser),
        userName: selectedUser?.full_name || selectedUser?.email,
        busy: isLoading,
        error: adminNoteError,
        onSend: handleSendAdminNote,
        onCancel: () => {
          setAdminNotePrompt(false);
          setAdminNoteError("");
        }
      }
    ),
    /* @__PURE__ */ jsx(
      WorkDayGroupDialog,
      {
        open: Boolean(workDayPrompt?.signature),
        prompt: workDayPrompt,
        userName: selectedUser?.full_name || selectedUser?.email,
        busy: isLoading,
        error: workDayError,
        onSameDay: () => handleResolveWorkDay("same_day"),
        onSeparate: () => handleResolveWorkDay("separate"),
        onLater: () => {
          if (workDayPrompt?.signature) workDayDismissedRef.current.add(workDayPrompt.signature);
          setWorkDayPrompt(null);
          setWorkDayError("");
          if (!activeEntry?.id) scheduleDisplayReset(1200);
        }
      }
    ),
    /* @__PURE__ */ jsx(
      WorkPauseOverlay,
      {
        userOverride: selectedUser,
        credentialOverride: credentialRef.current,
        disabled: workPauseStatus !== "paused" || !activeWorkPause?.id || !selectedUser?.email || !credentialRef.current,
        onResumed: (data) => {
          applyWorkPauseResponse(data);
          setRecognitionStatus("Work resumed and confirmed by server.");
          scheduleDisplayReset(800);
        }
      }
    ),
    notification && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", onClick: () => setNotification(null), children: /* @__PURE__ */ jsxs("div", { className: `relative overflow-hidden px-12 py-10 rounded-3xl shadow-2xl text-center transform animate-in zoom-in-95 ${notification.type === "in" ? "bg-green-500 text-white" : "bg-orange-500 text-white"}`, children: [
      /* @__PURE__ */ jsx("div", { className: "success-burst" }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4", children: [
        notification.type === "in" ? /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", className: "w-16 h-16", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { className: "check-draw", d: "M4 12.5l5 5L20 6.5" }) }) : /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", className: "w-16 h-16", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { className: "check-draw", d: "M6 6l12 12M18 6L6 18" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-3xl font-bold mb-2", children: notification.userName }),
          /* @__PURE__ */ jsxs("p", { className: "text-xl", children: [
            "Successfully Clocked ",
            notification.type === "in" ? "In" : "Out"
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-2xl font-semibold mt-2", children: notification.time })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm opacity-75 mt-4", children: "Tap anywhere to dismiss" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "clay-card p-6 mb-6", style: { zoom: gloveMode ? 1.5 : 1 }, children: [
      /* @__PURE__ */ jsxs("h2", { className: "text-lg font-semibold mb-6 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Clock, { className: "w-5 h-5 text-purple-600" }),
        "Quick Clock In/Out"
      ] }),
      (() => {
        const tips = ["Check your harness before any lift work.", "Lock out power before changing signage wiring.", "Report spills - wet concrete is a fall hazard.", "Eye protection on the shop floor, always.", "Keep exits and extinguisher paths clear.", "Lift with your legs, not your back.", "Verify the permit copy is on the job site.", "Hydrate - shop temps run high in summer."];
        const tip = tips[Math.floor(Date.now() / 864e5) % tips.length];
        const lastAction = (() => {
          try {
            return localStorage.getItem("ccs_last_action");
          } catch {
            return null;
          }
        })();
        return /* @__PURE__ */ jsxs(Fragment, { children: [
          lastAction && /* @__PURE__ */ jsxs("p", { className: "mb-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800", children: [
            "Last action: ",
            lastAction
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "mb-3 text-center text-[11px] italic text-slate-500", children: [
            "Safety tip: ",
            tip
          ] })
        ] });
      })(),
      dimmed && /* @__PURE__ */ jsx("div", { className: "kiosk-dim-overlay fixed inset-0 z-50 bg-slate-900/90 transition-opacity", onClick: wake }),
      holiday && /* @__PURE__ */ jsxs("p", { className: "mb-2 rounded-md bg-amber-50 px-3 py-1.5 text-center text-sm font-semibold text-amber-800", children: [
        "Happy ",
        holiday,
        "! Holiday hours apply today."
      ] }),
      faceFails >= 5 && /* @__PURE__ */ jsx("p", { className: "mb-2 rounded-md bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-700", children: "Face not recognizing you? Ask a manager to re-enroll your photo." }),
      showKioskTutorial && /* @__PURE__ */ jsx("div", { className: "mb-4 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-indigo-900", children: "First time? It's three steps:" }),
          /* @__PURE__ */ jsxs("ol", { className: "mt-1 list-decimal space-y-0.5 pl-4 text-xs text-indigo-800", children: [
            /* @__PURE__ */ jsx("li", { children: "Choose Face, Badge, or Email below" }),
            /* @__PURE__ */ jsx("li", { children: "Look at the camera or enter your code" }),
            /* @__PURE__ */ jsx("li", { children: "Clock In or Clock Out - done" })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: dismissKioskTutorial,
            className: "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-500 hover:bg-indigo-100",
            children: "Got it"
          }
        )
      ] }) }),
      persistenceError && /* @__PURE__ */ jsxs("div", { className: "mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Time Clock action not confirmed" }),
          /* @__PURE__ */ jsx("div", { className: "mt-1 text-xs", children: persistenceError })
        ] }),
        /* @__PURE__ */ jsx(Button, { type: "button", size: "sm", variant: "outline", className: "shrink-0 border-red-300 bg-white text-red-800", onClick: () => setPersistenceError(""), children: "Dismiss" })
      ] }),
      authoritativeTransition && !isRecognizing && !showClockOut && /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-blue-200 bg-blue-50 p-5 text-center", children: [
        /* @__PURE__ */ jsx(Loader2, { className: "w-6 h-6 animate-spin text-blue-600 mx-auto mb-3" }),
        /* @__PURE__ */ jsx("p", { className: "font-semibold text-blue-900", children: transitionLabel(authoritativeTransition.transition) }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-blue-800", children: "The server is resolving the prior Time Clock action. Conflicting actions stay blocked until authoritative state is confirmed." }),
        /* @__PURE__ */ jsxs(
          Button,
          {
            type: "button",
            variant: "outline",
            className: "mt-4 border-blue-300 bg-white text-blue-800",
            onClick: () => refreshAuthoritativeSessionState({ quiet: false }),
            disabled: isLoading,
            children: [
              isLoading ? /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin mr-2" }) : null,
              "Refresh Status"
            ]
          }
        )
      ] }),
      !authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && selectedUser && activeEntry && /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4 w-72", "data-summary-entry-id": activeEntry.id, children: [
        /* @__PURE__ */ jsxs("div", { className: "w-full rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white px-5 py-4 shadow-sm", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5", children: [
            /* @__PURE__ */ jsxs("span", { className: "relative flex h-2.5 w-2.5", children: [
              /* @__PURE__ */ jsx("span", { className: "absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" }),
              /* @__PURE__ */ jsx("span", { className: "relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-emerald-900", children: "You're clocked in" })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-1.5 text-sm text-emerald-800/90", children: selectedUser.full_name || selectedUser.email }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-emerald-700/80", children: [
            Number.isFinite(new Date(activeEntry.clock_in).getTime()) && `Since ${format(new Date(activeEntry.clock_in), "h:mm a")}${new Date(activeEntry.clock_in).toDateString() !== (/* @__PURE__ */ new Date()).toDateString() ? ` (${format(new Date(activeEntry.clock_in), "EEE, MMM d")})` : ""}`,
            activeEntry.approval_status === "needs_review" && " - pending manager review"
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          CrystalShiftButton,
          {
            single: "out",
            onClockOut: () => {
              setClockOutDismissed(activeEntry?.id, false);
              setShowClockOut(true);
            },
            disabled: isLoading,
            verifying: isLoading,
            success: crystalSuccess
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: resetState,
            disabled: isLoading,
            className: "text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded",
            children: "Not you? Identify a different employee"
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-center gap-2", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => {
                setMissedShiftError("");
                setMissedShiftPrompt(true);
              },
              disabled: isLoading,
              className: "inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-100/90 to-amber-50/90 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm transition hover:border-amber-400 hover:shadow disabled:opacity-50 touch-manipulation",
              children: [
                /* @__PURE__ */ jsx(CalendarX2, { className: "w-3.5 h-3.5" }),
                "Missed a shift?"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => {
                setAdminNoteError("");
                setAdminNotePrompt(true);
              },
              disabled: isLoading,
              className: "inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:shadow disabled:opacity-50 touch-manipulation",
              children: [
                /* @__PURE__ */ jsx(MessageSquare, { className: "w-3.5 h-3.5" }),
                "Note to admin"
              ]
            }
          )
        ] })
      ] }),
      !authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && !(selectedUser && activeEntry) && /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-6", children: [
        /* @__PURE__ */ jsx("p", { className: "text-gray-600 text-center", children: "Tap the button, then identify with face recognition, a secure QR badge, or username/password." }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => {
              identifyIntentRef.current = "missed_clock_in";
              startRecognition();
            },
            disabled: isLoading,
            className: "group relative w-72 sm:w-80 flex items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-100/90 via-white/95 to-amber-100/90 px-4 py-3 text-sm font-bold text-amber-900 shadow-lg shadow-amber-900/10 backdrop-blur-sm transition-[box-shadow,transform,border-color] duration-200 hover:border-amber-400 hover:shadow-xl hover:shadow-amber-900/15 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/60 touch-manipulation",
            children: [
              /* @__PURE__ */ jsx("span", { className: "flex h-8 w-8 items-center justify-center rounded-xl bg-amber-200/70 ring-1 ring-amber-300/80 transition-transform duration-200 group-hover:scale-110", children: /* @__PURE__ */ jsx(Clock3, { className: "w-4 h-4" }) }),
              "Forgot to Clock In? Set arrival time",
              /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/60", "aria-hidden": "true" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => {
              identifyIntentRef.current = "missed_clock_out";
              startRecognition();
            },
            disabled: isLoading,
            className: "group relative w-72 sm:w-80 flex items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-100/90 via-white/95 to-amber-100/90 px-4 py-3 text-sm font-bold text-amber-900 shadow-lg shadow-amber-900/10 backdrop-blur-sm transition-[box-shadow,transform,border-color] duration-200 hover:border-amber-400 hover:shadow-xl hover:shadow-amber-900/15 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/60 touch-manipulation",
            children: [
              /* @__PURE__ */ jsx("span", { className: "flex h-8 w-8 items-center justify-center rounded-xl bg-amber-200/70 ring-1 ring-amber-300/80 transition-transform duration-200 group-hover:scale-110", children: /* @__PURE__ */ jsx(LogOut, { className: "w-4 h-4" }) }),
              "Forgot to Clock Out? Report it",
              /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/60", "aria-hidden": "true" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-center gap-2", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => {
                identifyIntentRef.current = "missed_shift";
                startRecognition();
              },
              disabled: isLoading,
              className: "inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-100/90 to-amber-50/90 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm transition hover:border-amber-400 hover:shadow disabled:opacity-50 touch-manipulation",
              children: [
                /* @__PURE__ */ jsx(CalendarX2, { className: "w-3.5 h-3.5" }),
                "Missed a whole shift?"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => {
                identifyIntentRef.current = "admin_note";
                startRecognition();
              },
              disabled: isLoading,
              className: "inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:shadow disabled:opacity-50 touch-manipulation",
              children: [
                /* @__PURE__ */ jsx(MessageSquare, { className: "w-3.5 h-3.5" }),
                "Note to admin"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx(
          CrystalShiftButton,
          {
            onClockIn: startRecognition,
            onClockOut: startRecognition,
            disabled: isLoading,
            verifying: isLoading,
            success: crystalSuccess
          }
        ),
        isLoading && /* @__PURE__ */ jsx(Loader2, { className: "w-6 h-6 animate-spin text-purple-600" })
      ] }),
      isRecognizing && /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center", children: [
        !recognitionMethod && (() => {
          const allowedMethods = (() => {
            try {
              const m = localStorage.getItem("ccs_kiosk_methods");
              return m ? m.split(",").map((x) => x.trim()).filter(Boolean) : ["face", "qr", "manual"];
            } catch {
              return ["face", "qr", "manual"];
            }
          })();
          const stored = (() => {
            try {
              return localStorage.getItem("ccs_kiosk_method");
            } catch {
              return null;
            }
          })();
          const preferred = allowedMethods.includes(stored) ? stored : allowedMethods[0];
          return preferred ? /* @__PURE__ */ jsxs("p", { className: "mb-3 text-[10px] text-slate-400", children: [
            "Last used on this kiosk: ",
            /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-600", children: preferred === "face" || preferred === "camera" ? "Camera" : preferred === "qr" ? "QR Badge" : "Email" })
          ] }) : null;
        })(),
        (recognitionMethod === "face" || recognitionMethod === "camera") && /* @__PURE__ */ jsxs("div", { className: "relative mb-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative inline-block", children: [
            /* @__PURE__ */ jsx("video", { ref: videoRef, autoPlay: true, muted: true, playsInline: true, className: `w-80 h-60 object-cover rounded-2xl bg-gray-900 ${cameraMirrored ? "scale-x-[-1]" : ""}` }),
            cameraHealth !== "ok" && /* @__PURE__ */ jsx("p", { className: "absolute bottom-2 left-2 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white", children: cameraHealth === "dark" ? "Camera too dark - check lighting/lens" : "Camera too bright - adjust angle" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: toggleCameraMirror,
                className: "absolute right-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-black/70",
                title: "Flip camera preview",
                children: cameraMirrored ? "Unflip" : "Mirror"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "scan-reticle scan-tone-scanning", "aria-hidden": "true", children: [
            /* @__PURE__ */ jsx("div", { className: "scan-bracket tl" }),
            /* @__PURE__ */ jsx("div", { className: "scan-bracket tr" }),
            /* @__PURE__ */ jsx("div", { className: "scan-bracket bl" }),
            /* @__PURE__ */ jsx("div", { className: "scan-bracket br" }),
            /* @__PURE__ */ jsx("div", { className: "scan-oval" }),
            /* @__PURE__ */ jsx("div", { className: "scan-line" })
          ] }),
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: resetState, className: "absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full", children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5" }) })
        ] }),
        recognitionMethod === "qr" && /* @__PURE__ */ jsxs("div", { className: "relative w-full max-w-sm mb-4 rounded-2xl overflow-hidden bg-gray-100 min-h-[260px]", children: [
          /* @__PURE__ */ jsx("div", { id: "hybrid-qr-reader", className: "w-full" }),
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: resetState, className: "absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full", children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5" }) })
        ] }),
        recognitionMethod === "manual" && /* @__PURE__ */ jsxs("div", { className: "relative w-full max-w-xs mb-4", children: [
          /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: resetState, className: "absolute -top-2 -right-10 rounded-full", children: /* @__PURE__ */ jsx(X, { className: "w-5 h-5" }) }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(User, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" }),
              /* @__PURE__ */ jsx(
                Input,
                {
                  value: usernameInput,
                  onChange: (e) => {
                    setUsernameInput(e.target.value);
                    setUsernameError("");
                  },
                  placeholder: "Username",
                  className: "pl-10",
                  autoComplete: "username",
                  autoFocus: true
                }
              )
            ] }),
            /* @__PURE__ */ jsx(
              Input,
              {
                type: "password",
                value: manualPassword,
                onChange: (e) => {
                  setManualPassword(e.target.value);
                  setUsernameError("");
                },
                onKeyDown: (e) => e.key === "Enter" && !isLoading && handleManualSubmit(),
                placeholder: "Password",
                autoComplete: "current-password"
              }
            ),
            /* @__PURE__ */ jsx(Button, { onClick: handleManualSubmit, disabled: isLoading, className: "w-full bg-purple-600 hover:bg-purple-700", children: isLoading ? /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin" }) : "Continue" }),
            usernameError && /* @__PURE__ */ jsx("p", { className: "text-red-500 text-sm text-center", children: usernameError })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "px-4 py-2 rounded-full mb-4 bg-purple-100 text-purple-700 text-center", children: /* @__PURE__ */ jsxs("p", { className: "font-medium flex items-center justify-center gap-2", children: [
          (recognitionMethod === "face" || recognitionMethod === "camera" || recognitionMethod === "qr" || isLoading) && /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin" }),
          recognitionStatus || IDENTIFY_CAMERA_BLURB
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap justify-center gap-2", children: [
          !supportsInlineQrDetection() && /* @__PURE__ */ jsxs(Button, { type: "button", variant: "outline", onClick: startQrMode, disabled: isLoading, className: "gap-2", children: [
            /* @__PURE__ */ jsx(QrCode, { className: "w-4 h-4" }),
            " Scan QR badge"
          ] }),
          /* @__PURE__ */ jsxs(Button, { type: "button", variant: recognitionMethod === "manual" ? "default" : "outline", onClick: startManualMode, disabled: isLoading, className: "gap-2", children: [
            /* @__PURE__ */ jsx(User, { className: "w-4 h-4" }),
            " Type username instead"
          ] })
        ] }),
        !authoritativeSessionToken && /* @__PURE__ */ jsx("p", { className: "mt-3 text-xs text-gray-500 text-center max-w-md", children: "QR badge scanning works for everyone. Face recognition also runs automatically once an employee or admin kiosk session is signed in." }),
        authoritativeSessionToken && authoritativeSessionUser && /* @__PURE__ */ jsxs("p", { className: "mt-3 text-xs text-gray-400 text-center", children: [
          "Signed authority: ",
          authoritativeSessionUser.full_name || authoritativeSessionUser.email
        ] })
      ] })
    ] }),
    showClockOut && activeEntry && selectedUser && /* @__PURE__ */ jsx(
      ClockOutDialog,
      {
        isOpen: showClockOut,
        onClose: () => {
          setClockOutDismissed(activeEntry?.id, true);
          void resetState();
        },
        timeEntry: activeEntry,
        userName: selectedUser.full_name || selectedUser.email,
        breakStatus,
        activeBreak,
        breakSummary,
        workPauseSummary,
        onStartBreak: handleStartBreak,
        onEndBreak: handleEndBreak,
        activeLabor,
        laborSummary,
        onStartLabor: (payload) => handleLaborAction("labor_start", payload),
        onChangeLabor: (payload) => handleLaborAction("labor_change", payload),
        onStopLabor: () => handleLaborAction("labor_stop"),
        onLoadLaborAllocationPreview: handleLoadLaborAllocationPreview,
        onClockOut: handleClockOut,
        pendingClockOutRecovery: !authoritativeSessionToken || authoritativeSessionGuardsSelected ? (() => {
          const pending = clockOutSnapshotFor(selectedUser.email);
          return pending?.entryId === String(activeEntry.id) && pending?.requestId === storedRequestId("clock_out", selectedUser.email) ? pending : null;
        })() : null
      }
    )
  ] });
}
