import React from "react";
import { X, Megaphone, AlertTriangle, Info, Zap } from "lucide-react";
import { useAnnouncements } from "./AnnouncementContext";
import { motion, AnimatePresence } from "framer-motion";

const priorityStyles = {
  low:    { bg: "#F0F9FF", border: "#BAE6FD", icon: Info,          iconColor: "#0284C7", text: "#0C4A6E" },
  normal: { bg: "#FFF9C4", border: "#FDE68A", icon: Megaphone,     iconColor: "#D97706", text: "#78350F" },
  high:   { bg: "#FFF0E6", border: "#FDBA74", icon: AlertTriangle, iconColor: "#EA580C", text: "#7C2D12" },
  urgent: { bg: "#FEE2E2", border: "#FCA5A5", icon: Zap,           iconColor: "#DC2626", text: "#7F1D1D" },
};

export default function AnnouncementBanner() {
  const { activeAnnouncement, dismiss } = useAnnouncements();

  return (
    <AnimatePresence>
      {activeAnnouncement && (
        <motion.div
          key={activeAnnouncement.id}
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pointer-events-none"
          style={{ paddingTop: '80px' }}
        >
          <div
            className="pointer-events-auto mx-4 rounded-2xl shadow-2xl border-2 max-w-2xl w-full overflow-hidden"
            style={{
              background: priorityStyles[activeAnnouncement.priority || "normal"].bg,
              borderColor: priorityStyles[activeAnnouncement.priority || "normal"].border,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.8)"
            }}
          >
            <div className="flex items-start gap-3 p-4">
              {/* Icon */}
              {(() => {
                const style = priorityStyles[activeAnnouncement.priority || "normal"];
                const Icon = style.icon;
                return (
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: style.border }}>
                    <Icon className="w-5 h-5" style={{ color: style.iconColor }} />
                  </div>
                );
              })()}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base leading-tight mb-1"
                  style={{ color: priorityStyles[activeAnnouncement.priority || "normal"].text }}>
                  {activeAnnouncement.title}
                </p>
                <p className="text-sm leading-relaxed"
                  style={{ color: priorityStyles[activeAnnouncement.priority || "normal"].text, opacity: 0.85 }}>
                  {activeAnnouncement.message}
                </p>
                {activeAnnouncement.image_url && (
                  <img
                    src={activeAnnouncement.image_url}
                    alt="Announcement"
                    className="mt-3 rounded-xl max-h-48 object-contain"
                  />
                )}
              </div>

              {/* Dismiss */}
              <button
                onClick={dismiss}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
                style={{ background: priorityStyles[activeAnnouncement.priority || "normal"].border }}
              >
                <X className="w-4 h-4" style={{ color: priorityStyles[activeAnnouncement.priority || "normal"].iconColor }} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}