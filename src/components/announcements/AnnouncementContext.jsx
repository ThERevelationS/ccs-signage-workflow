import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { fetchActiveAnnouncementFeed, acknowledgeAnnouncement } from "./announcementPersistence";
import { usePolling } from "@/lib/usePolling";

const AnnouncementContext = createContext(null);

export function useAnnouncements() {
  // Null-safe: when the provider can't mount (backend unreachable), callers
  // destructuring the context must not take the whole app down with them.
  return useContext(AnnouncementContext) || { activeAnnouncement: null, dismiss: () => {}, acknowledge: () => {} };
}

// Stock sound generators using Web Audio API
export const playSoundEffect = (soundType, customUrl = null) => {
  if (soundType === "none") return;

  if (soundType === "custom" && customUrl) {
    const audio = new Audio(customUrl);
    audio.volume = 0.7;
    audio.play().catch(() => {});
    return;
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();

  const playTone = (freq, startTime, duration, type = "sine", gainVal = 0.3) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(gainVal, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration);
  };

  const t = ctx.currentTime;

  switch (soundType) {
    case "chime":
      playTone(880, t, 0.5); playTone(1108, t + 0.2, 0.5); playTone(1320, t + 0.4, 0.7);
      break;
    case "bell":
      playTone(1046, t, 1.2, "sine", 0.4); playTone(2093, t, 0.8, "sine", 0.15);
      break;
    case "alert":
      playTone(440, t, 0.15, "square", 0.2); playTone(440, t + 0.2, 0.15, "square", 0.2);
      playTone(880, t + 0.4, 0.3, "square", 0.25);
      break;
    case "fanfare":
      [523, 659, 784, 1047].forEach((f, i) => playTone(f, t + i * 0.12, 0.35, "triangle", 0.3));
      break;
    case "ding":
      playTone(1319, t, 0.8, "sine", 0.35); playTone(1760, t + 0.05, 0.5, "sine", 0.15);
      break;
    default:
      playTone(880, t, 0.5);
  }
};

const DEVICE_KEY_STORAGE = "ccs_announcement_viewer";

function deviceViewerKey() {
  try {
    let key = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!key) {
      key = `device:${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return `device:${Date.now()}`;
  }
}

const seenStorageKey = (ann) => `ccs_ann_seen:${ann?.id || ""}:${ann?.sent_at || ""}`;
const shownStorageKey = (ann) => `ccs_ann_shown:${ann?.id || ""}:${ann?.sent_at || ""}`;

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export function AnnouncementProvider({ children, currentPageName }) {
  const [allActive, setAllActive] = useState([]);
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const { currentUser } = useAuth();
  const lastSeenIdRef = useRef(null);
  const timerRef = useRef(null);
  const subscribeDebounceRef = useRef(null);
  const deviceKeyRef = useRef(null);
  if (!deviceKeyRef.current) deviceKeyRef.current = deviceViewerKey();
  const viewerKey = currentUser?.email
    ? `user:${String(currentUser.email).toLowerCase()}`
    : deviceKeyRef.current;

  const fetchActive = useCallback(async () => {
    try {
      // The server feed already applies targeting and scheduling for this
      // session; a failed fetch keeps the last feed rather than reading raw rows.
      const rows = await fetchActiveAnnouncementFeed();
      const now = Date.now();
      setAllActive((rows || []).filter((ann) => {
        const exp = Date.parse(ann?.expires_at || "");
        if (Number.isFinite(exp) && exp <= now) return false;
        const sched = Date.parse(ann?.scheduled_for || "");
        if (Number.isFinite(sched) && sched > now) return false;
        return true;
      }));
    } catch {}
  }, []);

  usePolling(fetchActive, 300000);

  // Targeting is resolved per session server-side, so a sign-in/out must drop
  // the previous viewer's feed and refetch for the new identity.
  const viewerEmail = currentUser?.email ? String(currentUser.email).toLowerCase() : "";
  const feedViewerRef = useRef(viewerEmail);
  useEffect(() => {
    if (feedViewerRef.current === viewerEmail) return;
    feedViewerRef.current = viewerEmail;
    setAllActive([]);
    fetchActive();
  }, [viewerEmail, fetchActive]);

  useEffect(() => {
    let unsubscribe = null;
    try {
      unsubscribe = base44.entities.Announcement.subscribe(() => {
        if (subscribeDebounceRef.current) clearTimeout(subscribeDebounceRef.current);
        subscribeDebounceRef.current = setTimeout(() => {
          subscribeDebounceRef.current = null;
          fetchActive();
        }, 1000);
      });
    } catch {}
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      if (subscribeDebounceRef.current) clearTimeout(subscribeDebounceRef.current);
    };
  }, [fetchActive]);

  useEffect(() => {
    const checkForAnnouncements = () => {
      const applicable = (allActive || []).filter((ann) => {
        if (ann.display_pages && ann.display_pages.length > 0) {
          const pageTargets = currentPageName === "Permitting"
            ? [...ann.display_pages, ...(ann.display_pages.includes("PermittingRepository") ? ["Permitting"] : [])]
            : ann.display_pages;
          if (!currentPageName || !pageTargets.includes(currentPageName)) return false;
        }
        return true;
      });
      if (applicable.length === 0) {
        setActiveAnnouncement(null);
        return;
      }

      // Pick the most recent announcement that actually applies to this user/page.
      const sorted = applicable.sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0));
      const ann = sorted[0];

      const isRepeat = ann.display_mode === "repeat";
      const seen = Boolean(storageGet(seenStorageKey(ann)));
      const lastShown = Number(storageGet(shownStorageKey(ann)) || 0);
      const intervalMin = Number(ann.repeat_interval_minutes) || 0;

      let shouldShow;
      if (seen && !isRepeat) {
        // Acknowledged/dismissed once-mode announcements never re-show,
        // even days later or after remounting the app.
        shouldShow = false;
      } else if (isRepeat && intervalMin > 0) {
        shouldShow = !lastShown || Date.now() - lastShown >= intervalMin * 60_000;
      } else {
        // interval 0 / default: once per mounted session.
        shouldShow = ann.id !== lastSeenIdRef.current;
      }

      if (!shouldShow) {
        setActiveAnnouncement(null);
        return;
      }

      lastSeenIdRef.current = ann.id;
      storageSet(shownStorageKey(ann), String(Date.now()));
      setDismissed(false);
      setActiveAnnouncement(ann);
      playSoundEffect(ann.sound_type, ann.custom_sound_url);

      // Auto-dismiss after duration (ack-required banners wait for the button).
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!ann.requires_ack && ann.duration_seconds > 0) {
        timerRef.current = setTimeout(() => {
          storageSet(seenStorageKey(ann), "1");
          setDismissed(true);
        }, ann.duration_seconds * 1000);
      }
    };

    checkForAnnouncements();
  }, [allActive, currentUser, currentPageName]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const dismiss = () => {
    if (activeAnnouncement?.id) storageSet(seenStorageKey(activeAnnouncement), "1");
    setDismissed(true);
  };

  const acknowledge = () => {
    const ann = activeAnnouncement;
    if (ann?.id) {
      storageSet(seenStorageKey(ann), "1");
      acknowledgeAnnouncement({ id: ann.id, viewerKey }).catch(() => {});
    }
    setDismissed(true);
  };

  const visibleAnnouncement = activeAnnouncement && !dismissed ? activeAnnouncement : null;

  return (
    <AnnouncementContext.Provider value={{ activeAnnouncement: visibleAnnouncement, dismiss, acknowledge }}>
      {children}
    </AnnouncementContext.Provider>
  );
}