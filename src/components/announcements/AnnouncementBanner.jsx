import React, { useEffect, useState } from "react";
import { X, Megaphone, AlertTriangle, Info, Zap, Volume2 } from "lucide-react";
import { useAnnouncements } from "./AnnouncementContext";
import { motion, AnimatePresence } from "framer-motion";

const priorityConfig = {
  low: {
    gradient: "linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 40%, #7DD3FC 100%)",
    glow: "0 0 40px rgba(56, 189, 248, 0.3)",
    iconBg: "linear-gradient(135deg, #0EA5E9, #0284C7)",
    textColor: "#0C4A6E",
    subtextColor: "#075985",
    dismissBg: "rgba(14, 165, 233, 0.15)",
    dismissHover: "rgba(14, 165, 233, 0.25)",
    icon: Info,
    accentLine: "#38BDF8",
  },
  normal: {
    gradient: "linear-gradient(135deg, #FFF7ED 0%, #FDE68A 40%, #FCD34D 100%)",
    glow: "0 0 40px rgba(251, 191, 36, 0.3)",
    iconBg: "linear-gradient(135deg, #F59E0B, #D97706)",
    textColor: "#78350F",
    subtextColor: "#92400E",
    dismissBg: "rgba(245, 158, 11, 0.15)",
    dismissHover: "rgba(245, 158, 11, 0.25)",
    icon: Megaphone,
    accentLine: "#FBBF24",
  },
  high: {
    gradient: "linear-gradient(135deg, #FFF7ED 0%, #FDBA74 40%, #FB923C 100%)",
    glow: "0 0 40px rgba(249, 115, 22, 0.3)",
    iconBg: "linear-gradient(135deg, #F97316, #EA580C)",
    textColor: "#7C2D12",
    subtextColor: "#9A3412",
    dismissBg: "rgba(249, 115, 22, 0.15)",
    dismissHover: "rgba(249, 115, 22, 0.25)",
    icon: AlertTriangle,
    accentLine: "#FB923C",
  },
  urgent: {
    gradient: "linear-gradient(135deg, #FEF2F2 0%, #FCA5A5 40%, #F87171 100%)",
    glow: "0 0 50px rgba(239, 68, 68, 0.35)",
    iconBg: "linear-gradient(135deg, #EF4444, #DC2626)",
    textColor: "#7F1D1D",
    subtextColor: "#991B1B",
    dismissBg: "rgba(239, 68, 68, 0.15)",
    dismissHover: "rgba(239, 68, 68, 0.25)",
    icon: Zap,
    accentLine: "#F87171",
  },
};

function ProgressBar({ duration, priority }) {
  const [progress, setProgress] = useState(100);
  
  useEffect(() => {
    if (!duration || duration <= 0) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [duration]);

  if (!duration || duration <= 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-2xl">
      <motion.div
        className="h-full rounded-full"
        style={{
          width: `${progress}%`,
          background: priorityConfig[priority || "normal"].accentLine,
          opacity: 0.6,
        }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}

export default function AnnouncementBanner() {
  const { activeAnnouncement, dismiss } = useAnnouncements();
  const [hovering, setHovering] = useState(false);

  if (!activeAnnouncement) return null;

  const config = priorityConfig[activeAnnouncement.priority || "normal"];
  const Icon = config.icon;
  const isUrgent = activeAnnouncement.priority === "urgent";

  return (
    <AnimatePresence>
      {activeAnnouncement && (
        <motion.div
          key={activeAnnouncement.id}
          initial={{ y: -200, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -200, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pointer-events-none"
          style={{ paddingTop: "88px" }}
        >
          <div
            className="pointer-events-auto mx-4 rounded-2xl max-w-xl w-full overflow-hidden relative"
            style={{
              background: config.gradient,
              boxShadow: `${config.glow}, 0 20px 60px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.6)`,
            }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            {/* Decorative accent line at top */}
            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{ background: config.accentLine }}
            />

            <div className="p-5">
              <div className="flex items-start gap-4">
                {/* Icon with pulse effect for urgent */}
                <div className="relative flex-shrink-0">
                  {isUrgent && (
                    <motion.div
                      className="absolute inset-0 rounded-2xl"
                      style={{ background: config.iconBg }}
                      animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                  <div
                    className="relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: config.iconBg }}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3
                    className="font-extrabold text-lg leading-tight tracking-tight"
                    style={{ color: config.textColor }}
                  >
                    {activeAnnouncement.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed mt-1.5 whitespace-pre-wrap"
                    style={{ color: config.subtextColor, opacity: 0.9 }}
                  >
                    {activeAnnouncement.message}
                  </p>

                  {activeAnnouncement.image_url && (
                    <motion.img
                      src={activeAnnouncement.image_url}
                      alt="Announcement"
                      className="mt-3 rounded-xl max-h-52 object-contain shadow-md"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    />
                  )}
                </div>

                {/* Dismiss button */}
                <motion.button
                  onClick={dismiss}
                  className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    background: hovering ? config.dismissHover : config.dismissBg,
                    backdropFilter: "blur(8px)",
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-4 h-4" style={{ color: config.textColor }} />
                </motion.button>
              </div>
            </div>

            {/* Auto-dismiss progress bar */}
            <ProgressBar
              duration={activeAnnouncement.duration_seconds}
              priority={activeAnnouncement.priority}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}