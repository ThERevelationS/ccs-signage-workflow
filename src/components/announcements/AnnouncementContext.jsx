import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const AnnouncementContext = createContext(null);

export function useAnnouncements() {
  return useContext(AnnouncementContext);
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

export function AnnouncementProvider({ children, currentPageName }) {
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const { currentUser } = useAuth();
  const lastSeenIdRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const checkForAnnouncements = async () => {
      try {
        const all = await loadAllEntityRows({
          entity: base44.entities.Announcement,
          query: { is_active: true },
          sort: null,
          label: "Active announcements",
        });
        const applicable = (all || []).filter((ann) => {
          if (ann.target_users && ann.target_users.length > 0) {
            if (!currentUser?.email || !ann.target_users.includes(currentUser.email)) return false;
          }
          if (ann.display_pages && ann.display_pages.length > 0) {
            if (!currentPageName || !ann.display_pages.includes(currentPageName)) return false;
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

        // If it's a new announcement, show it and play sound
        if (ann.id !== lastSeenIdRef.current) {
          lastSeenIdRef.current = ann.id;
          setDismissed(false);
          setActiveAnnouncement(ann);
          playSoundEffect(ann.sound_type, ann.custom_sound_url);

          // Auto-dismiss after duration
          if (ann.duration_seconds > 0) {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              setDismissed(true);
            }, ann.duration_seconds * 1000);
          }
        }
      } catch (e) {}
    };

    checkForAnnouncements();
    const interval = setInterval(checkForAnnouncements, 5000);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentUser, currentPageName]);

  const dismiss = () => setDismissed(true);

  const visibleAnnouncement = activeAnnouncement && !dismissed ? activeAnnouncement : null;

  return (
    <AnnouncementContext.Provider value={{ activeAnnouncement: visibleAnnouncement, dismiss }}>
      {children}
    </AnnouncementContext.Provider>
  );
}