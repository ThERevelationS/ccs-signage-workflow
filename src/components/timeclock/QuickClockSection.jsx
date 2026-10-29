import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera,
  Clock,
  Clock3,
  Loader2,
  Play,
  QrCode,
  Square,
  User,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { playSoundEffect } from "@/components/announcements/AnnouncementContext";
import ClockOutDialog from "@/components/timeclock/ClockOutDialog";
import MissedPunchResolutionDialog from "@/components/timeclock/MissedPunchResolutionDialog";
import LateClockInReviewDialog from "@/components/timeclock/LateClockInReviewDialog";
import MissedClockInDialog from "@/components/timeclock/MissedClockInDialog";
import WorkPauseOverlay from "@/components/timeclock/WorkPauseOverlay";
import {
  createFaceMatcher,
  createFaceScanSession,
  loadFaceModelsOnce,
} from '@/components/timeclock/faceScanRuntime';
import { Html5Qrcode } from "html5-qrcode";

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
};

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
  try {
    const key = requestStorageKey(action, email);
    sessionStorage.setItem(key, requestId);
    return sessionStorage.getItem(key) === requestId;
  } catch {
    return false;
  }
}

function removeStoredRequestId(action, email) {
  try { sessionStorage.removeItem(requestStorageKey(action, email)); } catch {}
}

// Temporary tab-only recovery, never a payroll source of truth. Contains no
// credential, badge, session token, or server timestamp. The backend still
// validates the original request ID, exact payload, identity, and shift state.
function clockOutSnapshotKey(email) {
  return `ccs_timeclock_pending_clock_out:${String(email || "").trim().toLowerCase()}`;
}

function clockOutSnapshotFor(email) {
  try {
    const raw = sessionStorage.getItem(clockOutSnapshotKey(email)) || "";
    if (!raw || raw.length > 131072) return null;
    const snapshot = JSON.parse(raw);
    const body = snapshot?.body;
    if (snapshot?.version !== 1 ||
        snapshot.email !== String(email || "").trim().toLowerCase() ||
        !snapshot.entryId || !snapshot.requestId ||
        !body || typeof body.notes !== "string" ||
        !Number.isFinite(Number(body.lunch_minutes)) ||
        !Array.isArray(body.job_allocations) ||
        body.job_allocations.length < 1 ||
        body.job_allocations.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function saveClockOutSnapshot(email, entryId, requestId, body) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const snapshot = {
    version: 1, email: normalizedEmail, entryId: String(entryId),
    requestId: String(requestId), body,
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
  try { sessionStorage.removeItem(clockOutSnapshotKey(email)); } catch {}
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
  const [recognitionMethod, setRecognitionMethodRaw] = useState(null); // face | qr | manual
  // Per-device preferred method - remembers how this kiosk usually identifies.
  const setRecognitionMethod = (m) => {
    setRecognitionMethodRaw(m);
    if (m) { try { localStorage.setItem("ccs_kiosk_method", m); } catch {} }
  };
  const [recognitionStatus, setRecognitionStatus] = useState("");
  const [authoritativeTransition, setAuthoritativeTransition] = useState(null);
  const [punchResolution, setPunchResolution] = useState(null);
  const [punchResolutionError, setPunchResolutionError] = useState("");
  const [lateClockInReview, setLateClockInReview] = useState(null);
  const [lateClockInError, setLateClockInError] = useState("");
  const [missedClockInPrompt, setMissedClockInPrompt] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const qrScannerRef = useRef(null);
  const faceScanSessionRef = useRef(null);
  const recognitionLockedRef = useRef(false);
  const modelsLoadedRef = useRef(false);
  const faceRunRef = useRef(0);
  const matchFace = useMemo(() => createFaceMatcher(allUsers || []), [allUsers]);
  const matchFaceRef = useRef(matchFace);
  matchFaceRef.current = matchFace;
  const credentialRef = useRef(null);
  const requestRef = useRef({});
  const lastPunchRef = useRef({ email: "", at: 0 });
  // Per-device large-text mode for shared kiosks (gloves / distance viewing).
  const [largeText, setLargeText] = useState(() => {
    try { return localStorage.getItem("ccs_kiosk_large_text") === "1"; } catch { return false; }
  });
  const toggleLargeText = () => setLargeText((v) => {
    const next = !v;
    try { localStorage.setItem("ccs_kiosk_large_text", next ? "1" : "0"); } catch {}
    return next;
  });
  // First-run kiosk tutorial strip; dismisses per device forever.
  const [showKioskTutorial, setShowKioskTutorial] = useState(() => {
    try { return localStorage.getItem("ccs_kiosk_tutorial_seen") !== "1"; } catch { return false; }
  });
  const dismissKioskTutorial = () => {
    setShowKioskTutorial(false);
    try { localStorage.setItem("ccs_kiosk_tutorial_seen", "1"); } catch {}
  };
  // Camera preview orientation - mirrored reads naturally for most, but
  // some users prefer the raw feed. Persisted per kiosk device.
  const [cameraMirrored, setCameraMirrored] = useState(() => {
    try { return localStorage.getItem("ccs_kiosk_camera_mirror") !== "0"; } catch { return true; }
  });
  const toggleCameraMirror = () => setCameraMirrored((v) => {
    const next = !v;
    try { localStorage.setItem("ccs_kiosk_camera_mirror", next ? "1" : "0"); } catch {}
    return next;
  });
  // Keep an uncertain Clock Out bound to its exact original body/request ID.
  // A different reconciliation payload may not reuse that idempotency key.
  const clockOutAttemptRef = useRef(null);
  // A dismissed Clock Out stays dismissed until the employee re-identifies.
  // Passive status refresh must never steal the page back.
  // Clock Out dismissal is persisted per TimeEntry so remounts and passive
  // refreshes can never resurrect the dialog the employee already closed.
  const clockOutDismissalKey = (entryId) => (entryId ? `qcs-clockout-dismissed:${entryId}` : null);
  const setClockOutDismissed = (entryId, dismissed) => {
    try {
      const key = clockOutDismissalKey(entryId);
      if (!key) return;
      if (dismissed) {
        // One dismissed shift at a time keeps storage bounded on shared kiosks.
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
    } catch {}
  };
  const notificationTimerRef = useRef(null);
  const displayResetTimerRef = useRef(null);
  // Passive refreshes may return out of order, after a session switch, or
  // after a punch mutation. Never let an old response replace newer state.
  const statusRefreshSequenceRef = useRef(0);
  // An acknowledged Current Work result cannot supersede a later break,
  // Work Pause, Clock Out, labor action, or authoritative status restoration.
  const workViewEpochRef = useRef(0);
  const identifyFlowSeqRef = useRef(0);
  // "clock_in" punches immediately after identity; "missed_clock_in" first
  // collects the employee's reported arrival time before starting the shift.
  const identifyIntentRef = useRef("clock_in");
  // In-flight actions are isolated by the signed Time Clock session: a slow
  // request for one employee must not block status restoration for another.
  const activeActionCountRef = useRef(new Map());
  const sessionScopeRef = useRef({ token: "", email: "" });
  const selectionRef = useRef({ email: "", entryId: "" });
  sessionScopeRef.current = {
    token: authoritativeSessionToken,
    email: String(authoritativeSessionUser?.email || "").trim().toLowerCase(),
  };
  selectionRef.current = {
    email: String(selectedUser?.email || "").trim().toLowerCase(),
    entryId: String(activeEntry?.id || ""),
  };
  const currentActionScope = () => JSON.stringify([
    sessionScopeRef.current.token, sessionScopeRef.current.email,
  ]);
  const actionCountForScope = (scope = currentActionScope()) =>
    activeActionCountRef.current.get(scope) || 0;

  const canUseFace = Boolean(authoritativeSessionToken) && (allUsers || []).some(
    (user) => Array.isArray(user.face_descriptors) && user.face_descriptors.length > 0,
  );
  const authoritativeSessionGuardsSelected = Boolean(
    authoritativeSessionToken &&
    authoritativeSessionUser?.email &&
    selectedUser?.email &&
    authoritativeSessionUser.email.toLowerCase() === selectedUser.email.toLowerCase()
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

  // Abandoned identify flows must not hold the kiosk open: after 90s in
  // identify mode, return to the idle card automatically.
  useEffect(() => {
    if (!isRecognizing) return undefined;
    const timer = setTimeout(() => { void resetState(); }, 90000);
    return () => clearTimeout(timer);
  }, [isRecognizing]);

  const showNotification = (type, userName, timestamp) => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    setNotification({ type, userName, time: format(new Date(timestamp), "h:mm a") });
    playSoundEffect(type === "in" ? "chime" : "ding");
    notificationTimerRef.current = setTimeout(() => setNotification(null), 5000);
  };

  // Device geo stamp - captured in the background, attached to punches when fresh.
  const geoCacheRef = useRef({ at: 0, data: null });
  const refreshGeo = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { geoCacheRef.current = { at: Date.now(), data: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0) } }; },
      () => {},
      { timeout: 4000, maximumAge: 600000 },
    );
  };
  useEffect(() => { refreshGeo(); const t = setInterval(refreshGeo, 300000); return () => clearInterval(t); }, []);

  // Device heartbeat - register this kiosk so the admin sees it in the
  // device list with a live last_seen stamp. Id is stable per browser.
  useEffect(() => {
    try {
      let key = localStorage.getItem("ccs_kiosk_device_id");
      if (!key) { key = `kiosk-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem("ccs_kiosk_device_id", key); }
      base44.functions.invoke("timeClockAction", { action: "register_device", device_key: key, device_name: `Kiosk ${key.slice(-4)}`, scope: "kiosk", request_id: `devreg-${Date.now().toString(36)}` }).catch(() => {});
    } catch {}
  }, []);
  const geoStamp = () => (geoCacheRef.current.data && Date.now() - geoCacheRef.current.at < 600000 ? geoCacheRef.current.data : null);

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
      if (err?.retrySameRequest !== undefined) throw err;
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
    // Clock Out also stores and verifies its full immutable recovery snapshot
    // before submission. Every other mutation needs a durable exact retry ID.
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
    // Old asynchronous acknowledgements must not erase a newer action's key.
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
      target_email: userEmail,
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
    if (status?.status === "clocked_out" ||
        (status?.status === "clocked_in" && status?.entry?.id &&
         pendingClockOut && pendingClockOut.entryId !== String(status.entry.id))) {
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
      // Status loads never auto-open the Clock Out dialog and never close an
      // already-open one. Only a deliberate identification or an explicit
      // Clock Out action may surface it; the clocked-in summary card carries
      // the persistent state otherwise.
      if (status?.work_pause_status === "paused") {
        setShowClockOut(false);
      } else if (pendingClockOut && pendingClockOut.entryId === String(status.entry.id)) {
        // An interrupted Clock Out must resurface so its exact retry finishes.
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
    const isCurrentRefresh = () =>
      sequence === statusRefreshSequenceRef.current &&
      actionCountForScope() === 0 &&
      sessionScopeRef.current.token === authoritativeSessionToken &&
      sessionScopeRef.current.email === email;

    if (!quiet) setIsLoading(true);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "status",
        session_token: authoritativeSessionToken,
        target_email: email,
      });
      if (!isCurrentRefresh()) return null;
      const status = response?.data || response;
      if (!status?.success) throw new Error(status?.error || "Authoritative Time Clock status could not be restored.");
      const restored = applyAuthoritativeStatus(status, authoritativeSessionUser, { sessionToken: authoritativeSessionToken });
      const unresolvedPunchCount = Number(status?.unresolved_punch_review?.count || 0);
      const hasUnresolvedPunchReview = Number.isFinite(unresolvedPunchCount) && unresolvedPunchCount > 0;
      const unresolvedPunchLabel = unresolvedPunchCount === 1 ? "A previous punch report is" : `${unresolvedPunchCount} previous punch reports are`;
      const pendingShiftReviewCount = Number(status?.pending_shift_review?.count || 0);
      const hasPendingShiftReview = Number.isFinite(pendingShiftReviewCount) && pendingShiftReviewCount > 0;
      const pendingMissedClockInCount = Math.max(0, Number(status?.pending_shift_review?.missed_clock_in_count || 0));
      const pendingCorrectedShiftCount = Math.max(0, Number(status?.pending_shift_review?.corrected_shift_count || 0));
      const pendingShiftLabel = pendingMissedClockInCount > 0 && pendingCorrectedShiftCount === 0
        ? (pendingShiftReviewCount === 1 ? "Your reconstructed missed-Clock-In shift still needs" : `${pendingShiftReviewCount} reconstructed missed-Clock-In shifts still need`)
        : pendingShiftReviewCount === 1 ? "A reviewed shift still needs" : `${pendingShiftReviewCount} reviewed shifts still need`;
      if (restored === "clocked_in") {
        setPersistenceError("");
        setRecognitionStatus(hasUnresolvedPunchReview
          ? `Active shift restored. ${unresolvedPunchLabel} still awaiting manager follow-up.`
          : hasPendingShiftReview
            ? `Active shift restored. ${pendingShiftLabel} final manager shift approval.`
            : `Active shift restored for ${status.user?.full_name || status.user?.email || email}.`);
      } else if (restored === "punch_resolution") {
        setPersistenceError("");
        setRecognitionStatus("Previous shift needs punch confirmation before a new Clock In.");
      } else if (restored === "transition") {
        setPersistenceError("");
      } else if (restored === "clocked_out") {
        setPersistenceError("");
        setRecognitionStatus(hasUnresolvedPunchReview
          ? `${unresolvedPunchLabel} still awaiting manager follow-up. You are currently Clocked Out.`
          : hasPendingShiftReview
            ? `${pendingShiftLabel} final manager shift approval. You are currently Clocked Out.`
            : "");
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
      statusRefreshSequenceRef.current += 1;
      cancelDisplayReset();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authoritativeSessionToken, authoritativeSessionUser?.email, refreshAuthoritativeSessionState]);

  useEffect(() => {
    if (!authoritativeTransition || !authoritativeSessionToken || !authoritativeSessionUser?.email) return undefined;
    const poll = setInterval(() => { if (!document.hidden) refreshAuthoritativeSessionState({ quiet: true }); }, 3000);
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
      if (statusRefreshSequenceRef.current !== currentSequence ||
          sessionScopeRef.current.token !== currentScope.token ||
          sessionScopeRef.current.email !== currentScope.email ||
          actionCountForScope() > 0) return;
      resetState();
    }, delayMs);
  };

  const performClockIn = async (user, credential) => {
    const email = user?.email;
    if (!email) throw new Error("Verified employee identity is missing an email address.");

    // Client-side duplicate debounce: a fast double scan within 5s of a
    // confirmed punch must not send a second request at all.
    const normEmail = String(email).trim().toLowerCase();
    if (lastPunchRef.current.email === normEmail && Date.now() - lastPunchRef.current.at < 5000) {
      setRecognitionStatus("Already clocked in. Duplicate punch ignored.");
      scheduleDisplayReset(3000);
      return null;
    }

    const clockScope = currentActionScope();
    const stillCurrent = () => clockScope === currentActionScope();
    const requestId = requestIdFor("clock_in", email);
    let actionEpoch = workViewEpochRef.current;
    setIsLoading(true);
    setPersistenceError("");
    try {
      // The invocation increments the transition epoch synchronously before
      // sending; a later transition or status restore invalidates this reply.
      const pending = invokeTimeClock({
        action: "clock_in",
        request_id: requestId,
        ...credentialPayload(credential, email),
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
        scheduleDisplayReset(3000);
        return data;
      }

      lastPunchRef.current = { email: normEmail, at: Date.now() };
      showNotification("in", data.user?.full_name || user.full_name || email, data.entry?.clock_in || new Date().toISOString());
      setRecognitionStatus("Clock-in confirmed by server.");
      setClockOutDismissed(data.entry?.id, true);
      scheduleDisplayReset(5000);
      return data;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("clock_in", email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        setPersistenceError(err.message || "Clock-in was not confirmed by the server.");
        setRecognitionStatus(err.retrySameRequest
          ? "Clock-in may have been saved. Retry the same action to recover safely."
          : "Clock-in blocked. Review the message below.");
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
        ...credentialPayload(credential, user?.email),
      });
      const verifiedUser = status.user || user;
      if (!verifiedUser?.email) throw new Error("The server did not return a verified employee identity.");

      const resolvedStatus = applyAuthoritativeStatus(status, verifiedUser, credential);
      if (resolvedStatus === "clocked_in") {
        if (identifyIntentRef.current === "missed_clock_in") {
          identifyIntentRef.current = "clock_in";
          setClockOutDismissed(status?.entry?.id, true);
          setShowClockOut(false);
          setRecognitionStatus(`${verifiedUser.full_name || verifiedUser.email}, you're already clocked in - no missed Clock In to report.`);
          return;
        }
        // Deliberate identification while clocked in is the Clock Out path:
        // surface the shift panel once even if it was dismissed before.
        setClockOutDismissed(status?.entry?.id, false);
        setShowClockOut(true);
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}! Active shift restored.`);
        return;
      }
      if (resolvedStatus === "punch_resolution") {
        setRecognitionStatus(`Welcome, ${verifiedUser.full_name || verifiedUser.email}. Resolve the previous shift before starting a new one.`);
        return;
      }
      if (resolvedStatus === "transition") return;

      if (identifyIntentRef.current === "missed_clock_in") {
        // The employee explicitly chose the missed Clock In flow; the
        // arrival-time prompt takes priority over the late-day review gate.
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

  const startFaceMode = async () => {
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
    }

    setRecognitionStatus("Starting camera...");
    const faceRun = faceRunRef.current;
    try {
      const [modelsReady, stream] = await Promise.all([
        loadFaceModels(),
        navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        }),
      ]);
      if (faceRun !== faceRunRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
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
      if (faceRun !== faceRunRef.current) return;
      setRecognitionStatus("Look directly at the camera...");

      // Same shared scan session as the reusable FaceRecognition component -
      // one cadence, quality gate, brightness check, and voter for every
      // face-recognition surface in the app.
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
          setRecognitionStatus(status === "verifying" && votes?.required
            ? `Hold still - verifying your identity... ${votes.count}/${votes.required}`
            : FACE_SCAN_STATUS_TEXT[status] || "Look directly at the camera in even lighting.");
        },
      });
      faceScanSessionRef.current = session;
      session.start();
    } catch (err) {
      console.error("Camera error:", err);
      stopFaceCamera();
      setRecognitionStatus("Camera unavailable. Use Secure QR or Username instead.");
    }
  };

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
    identifyFlowSeqRef.current += 1;
    recognitionLockedRef.current = false;
    setIsRecognizing(true);
    setRecognitionMethod("qr");
    setRecognitionStatus("Starting QR camera...");
    setUsernameError("");

    const qrPrompt = canUseFace
      ? "Show your face or scan your secure Time Clock QR badge."
      : "Scan your secure Time Clock QR badge.";
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
    if (canUseFace) await startFaceMode();
    else await startQrMode();
  };

  const handleManualSubmit = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed || !manualPassword) {
      setUsernameError("Enter your username and password.");
      return;
    }
    const identifySeq = ++identifyFlowSeqRef.current;
    const requestEpoch = workViewEpochRef.current;
    const stillCurrent = () =>
      identifyFlowSeqRef.current === identifySeq && workViewEpochRef.current === requestEpoch;

    setIsLoading(true);
    setUsernameError("");
    try {
      const response = await base44.functions.invoke("verifyLogin", {
        username: trimmed,
        password: manualPassword,
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

  const breakContextFor = (email) => {
    const scope = currentActionScope();
    const expectedEmail = String(email || "").trim().toLowerCase();
    const expectedEntryId = String(activeEntry?.id || "");
    return () => scope === currentActionScope() &&
      selectionRef.current.email === expectedEmail &&
      selectionRef.current.entryId === expectedEntryId;
  };

  const assertBreakAcknowledgementIdentity = (data, email, entryId) => {
    const expectedEmail = String(email || "").trim().toLowerCase();
    const responseEmail = String(data?.user?.email || "").trim().toLowerCase();
    const responseEntryId = String(data?.entry?.id || "");
    const entryEmail = String(data?.entry?.user_email || "").trim().toLowerCase();
    if (responseEmail === expectedEmail && responseEntryId === String(entryId || "") &&
        entryEmail === expectedEmail) return;

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
    const entryMatches = !data?.entry || (
      String(data.entry.id || "") === String(entryId || "") &&
      (!data.entry.user_email || String(data.entry.user_email).trim().toLowerCase() === expectedEmail)
    );
    const punchCase = data?.punch_exception;
    const punchCaseMatches = !punchCase || (
      String(punchCase.user_email || "").trim().toLowerCase() === expectedEmail &&
      String(punchCase.time_entry_id || "") === String(entryId || "")
    );
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
      // invokeTimeClock increments the transition epoch synchronously before sending.
      const pending = invokeTimeClock({
        action: "break_start",
        request_id: requestId,
        break_type: breakType,
        is_paid: isPaid,
        ...credentialPayload(credentialRef.current, email),
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
      // Ignore an acknowledgement if any newer punch, break, or status restore wins.
      const pending = invokeTimeClock({
        action: "break_end",
        request_id: requestId,
        ...credentialPayload(credentialRef.current, email),
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
    const laborMatches = !labor || (
      String(labor.user_email || "").trim().toLowerCase() === expectedEmail &&
      String(labor.time_entry_id || "") === String(entryId || "")
    );
    if (responseEmail === expectedEmail && responseEntryId === String(entryId || "") &&
        entryEmail === expectedEmail && laborMatches) return;

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
      // The invocation increments the epoch synchronously before sending.
      const pending = invokeTimeClock({
        action,
        request_id: requestId,
        activity_type: activityType,
        work_order_id: workOrderId,
        ...credentialPayload(credentialRef.current, email),
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
        ...(claimedClockOut ? { claimed_clock_out: claimedClockOut } : {}),
        ...credentialPayload(credential, email),
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
        setRecognitionStatus(err?.retrySameRequest
          ? "Punch resolution may have been saved. Retry the same response to recover safely."
          : "Punch resolution is blocked. Review the message in the window.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
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
        ...credentialPayload(credentialRef.current, email),
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
        setRecognitionStatus(err?.retrySameRequest
          ? "Missed Clock In may have been saved. Retry the same recovery to finish safely."
          : "Missed Clock In recovery is blocked. Review the message in the window.");
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
        ...credentialPayload(credentialRef.current, email),
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
      showNotification("in", result.user?.full_name || selectedUser.full_name || email, result.entry?.clock_in || new Date().toISOString());
      setRecognitionStatus("Shift started from your reported arrival time. A manager will review this Clock In.");
      return result;
    } catch (err) {
      if (!shouldRetainRequest(err)) clearRequest("report_missed_clock_in", email, requestId);
      if (stillCurrent() && actionEpoch === workViewEpochRef.current) {
        const message = err?.message || "Missed Clock In report was not confirmed by the server.";
        setLateClockInError(message);
        setRecognitionStatus(err?.retrySameRequest
          ? "Missed Clock In may have been saved. Retry the same report to finish safely."
          : "Missed Clock In report is blocked. Review the message in the window.");
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
      notes: data.notes,
    };
    const previous = clockOutAttemptRef.current;
    const savedSnapshot = clockOutSnapshotFor(email);
    const payloadJson = JSON.stringify(submittedBody);
    if ((previous?.requestId === requestId &&
         previous.email === String(email).toLowerCase() &&
         previous.entryId === entryId &&
         previous.payloadJson !== payloadJson) ||
        (savedSnapshot && (
          savedSnapshot.requestId !== requestId ||
          savedSnapshot.entryId !== entryId ||
          JSON.stringify(savedSnapshot.body) !== payloadJson
        ))) {
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
      entryId, requestId, payloadJson,
    };
    setPersistenceError("");
    if (stillCurrent()) setIsLoading(true);
    try {
      const result = await invokeTimeClock({
        action: "clock_out",
        request_id: requestId,
        ...submittedBody,
        ...credentialPayload(credentialRef.current, email),
      });
      clearClockOutSnapshot(email, requestId);
      clearRequest("clock_out", email, requestId);
      if (clockOutAttemptRef.current?.requestId === requestId) clockOutAttemptRef.current = null;
      if (stillCurrent()) {
        showNotification("out", result.user?.full_name || selectedUser.full_name || email, result.entry?.clock_out || new Date().toISOString());
        setShowClockOut(false);
        setActiveEntry(null);
        setRecognitionStatus("Clock-out confirmed by server.");
        scheduleDisplayReset(2500);
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
        setRecognitionStatus(shouldRetainRequest(err)
          ? "Clock-out may already be saved. Retry the identical request to recover safely."
          : "Clock-out blocked. Correct the issue and submit again.");
      }
      throw err;
    } finally {
      if (stillCurrent()) setIsLoading(false);
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

      <MissedClockInDialog
        open={missedClockInPrompt && Boolean(selectedUser)}
        userName={selectedUser?.full_name || selectedUser?.email}
        busy={isLoading}
        error={lateClockInError}
        onReport={handleReportMissedClockIn}
        onCancel={resetState}
      />

      <WorkPauseOverlay
        userOverride={selectedUser}
        credentialOverride={credentialRef.current}
        disabled={workPauseStatus !== "paused" || !activeWorkPause?.id || !selectedUser?.email || !credentialRef.current}
        onResumed={(data) => {
          applyWorkPauseResponse(data);
          setRecognitionStatus("Work resumed and confirmed by server.");
          scheduleDisplayReset(800);
        }}
      />

      {notification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setNotification(null)}>
          <div className={`relative overflow-hidden px-12 py-10 rounded-3xl shadow-2xl text-center transform animate-in zoom-in-95 ${notification.type === "in" ? "bg-green-500 text-white" : "bg-orange-500 text-white"}`}>
            <div className="success-burst" />
            <div className="flex flex-col items-center gap-4">
              {notification.type === "in" ? (
                <svg viewBox="0 0 24 24" className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path className="check-draw" d="M4 12.5l5 5L20 6.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path className="check-draw" d="M6 6l12 12M18 6L6 18" />
                </svg>
              )}
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

      <div className="clay-card p-6 mb-6" style={largeText ? { zoom: 1.18 } : undefined}>
        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" />
          Quick Clock In/Out
          <button
            type="button" onClick={toggleLargeText}
            className={`ml-auto rounded-md border px-2 py-0.5 text-[10px] font-bold ${largeText ? "border-purple-300 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-400"}`}
            title="Large text mode for the kiosk"
          >A+</button>
        </h2>

        {showKioskTutorial && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-indigo-900">First time? It's three steps:</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-indigo-800">
                  <li>Choose Face, Badge, or Email below</li>
                  <li>Look at the camera or enter your code</li>
                  <li>Clock In or Clock Out - done</li>
                </ol>
              </div>
              <button type="button" onClick={dismissKioskTutorial}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-500 hover:bg-indigo-100">
                Got it
              </button>
            </div>
          </div>
        )}

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

        {!authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && selectedUser && activeEntry && (
          <div className="flex flex-col items-center gap-4 w-64" data-summary-entry-id={activeEntry.id}>
            <div className="w-full rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white px-5 py-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <p className="text-sm font-bold text-emerald-900">You're clocked in</p>
              </div>
              <p className="mt-1.5 text-sm text-emerald-800/90">
                {selectedUser.full_name || selectedUser.email}
              </p>
              <p className="text-xs text-emerald-700/80">
                {Number.isFinite(new Date(activeEntry.clock_in).getTime()) && `Since ${format(new Date(activeEntry.clock_in), "h:mm a")}${new Date(activeEntry.clock_in).toDateString() !== new Date().toDateString() ? ` (${format(new Date(activeEntry.clock_in), "EEE, MMM d")})` : ""}`}
                {activeEntry.approval_status === "needs_review" && " - pending manager review"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setClockOutDismissed(activeEntry?.id, false); setShowClockOut(true); }}
              disabled={isLoading}
              className="w-64 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-900/25 transition-[transform,box-shadow] duration-200 hover:shadow-xl motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.97] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/60"
            >
              <Square className="w-4 h-4 fill-current" />
              Clock Out
            </button>
            <button
              type="button"
              onClick={resetState}
              disabled={isLoading}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded"
            >
              Not you? Identify a different employee
            </button>
          </div>
        )}

        {!authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && !(selectedUser && activeEntry) && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-gray-600 text-center">
              Tap the button, then identify with face recognition, a secure QR badge, or username/password.
            </p>
            <button
              type="button"
              onClick={() => { identifyIntentRef.current = "missed_clock_in"; startRecognition(); }}
              disabled={isLoading}
              className="w-64 flex items-center justify-center gap-2 rounded-xl border border-amber-300/70 bg-gradient-to-r from-amber-50 via-white to-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 shadow-sm transition-[box-shadow,transform,border-color] duration-200 hover:border-amber-400 hover:shadow-md motion-safe:active:scale-[0.97] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/60"
            >
              <Clock3 className="w-4 h-4" />
              Forgot to Clock In? Set arrival time
            </button>
            <button
              onClick={startRecognition}
              disabled={isLoading}
              className="group relative w-64 h-32 rounded-3xl shadow-xl shadow-emerald-900/25 hover:shadow-2xl disabled:opacity-50 overflow-hidden motion-safe:hover:scale-[1.04] motion-safe:active:scale-[0.96] transition-[transform,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-400/60"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
              <div className="absolute inset-0 bg-gradient-to-tl from-rose-400 via-red-500 to-red-700" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom right, transparent calc(50% - 1px), rgba(255,255,255,0.55) 50%, transparent calc(50% + 1px))" }} />
              <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/40" />
              <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/25 to-transparent" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
              <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white/20 to-transparent" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
              <div className="punch-sheen absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent" aria-hidden="true" />
              <div className="absolute top-4 left-5 text-white flex items-center gap-2.5 drop-shadow-md">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/25 ring-1 ring-white/50 backdrop-blur-sm">
                  <Play className="w-4 h-4 fill-current" />
                </span>
                <span className="text-xl font-bold tracking-wide">In</span>
              </div>
              <div className="absolute bottom-4 right-5 text-white flex items-center gap-2.5 drop-shadow-md">
                <span className="text-xl font-bold tracking-wide">Out</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/25 ring-1 ring-white/50 backdrop-blur-sm">
                  <Square className="w-4 h-4 fill-current" />
                </span>
              </div>
            </button>
            {isLoading && <Loader2 className="w-6 h-6 animate-spin text-purple-600" />}
          </div>
        )}

        {isRecognizing && (
          <div className="flex flex-col items-center">
            {!recognitionMethod && (() => {
              const preferred = (() => { try { return localStorage.getItem("ccs_kiosk_method"); } catch { return null; } })();
              return preferred ? (
                <p className="mb-3 text-[10px] text-slate-400">Last used on this kiosk: <span className="font-semibold text-slate-600">{preferred === "face" ? "Face" : preferred === "qr" ? "QR Badge" : "Email"}</span></p>
              ) : null;
            })()}
            {recognitionMethod === "face" && (
              <div className="relative mb-4">
                <div className="relative inline-block">
                  <video ref={videoRef} autoPlay muted playsInline className={`w-80 h-60 object-cover rounded-2xl bg-gray-900 ${cameraMirrored ? "scale-x-[-1]" : ""}`} />
                  <button type="button" onClick={toggleCameraMirror}
                    className="absolute right-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-black/70"
                    title="Flip camera preview">
                    {cameraMirrored ? "Unflip" : "Mirror"}
                  </button>
                </div>
                <div className="scan-reticle scan-tone-scanning" aria-hidden="true">
                  <div className="scan-bracket tl" />
                  <div className="scan-bracket tr" />
                  <div className="scan-bracket bl" />
                  <div className="scan-bracket br" />
                  <div className="scan-oval" />
                  <div className="scan-line" />
                </div>
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
          onClose={() => {
            setClockOutDismissed(activeEntry?.id, true);
            void resetState();
          }}
          timeEntry={activeEntry}
          userName={selectedUser.full_name || selectedUser.email}
          breakStatus={breakStatus}
          activeBreak={activeBreak}
          breakSummary={breakSummary}
          workPauseSummary={workPauseSummary}
          onStartBreak={handleStartBreak}
          onEndBreak={handleEndBreak}
          activeLabor={activeLabor}
          laborSummary={laborSummary}
          onStartLabor={(payload) => handleLaborAction("labor_start", payload)}
          onChangeLabor={(payload) => handleLaborAction("labor_change", payload)}
          onStopLabor={() => handleLaborAction("labor_stop")}
          onLoadLaborAllocationPreview={handleLoadLaborAllocationPreview}
          onClockOut={handleClockOut}
          pendingClockOutRecovery={
            (!authoritativeSessionToken || authoritativeSessionGuardsSelected)
              ? (() => {
                  const pending = clockOutSnapshotFor(selectedUser.email);
                  return pending?.entryId === String(activeEntry.id) &&
                    pending?.requestId === storedRequestId("clock_out", selectedUser.email)
                    ? pending : null;
                })()
              : null
          }
        />
      )}
    </>
  );
}