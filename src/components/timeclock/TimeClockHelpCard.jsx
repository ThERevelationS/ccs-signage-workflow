import { useState } from "react";
import { ChevronDown, HelpCircle, Sparkles } from "lucide-react";

const FAQ = [
  {
    q: "How do I clock in?",
    a: "At the kiosk, pick Face, Badge, or Email. Face scans take a few seconds - hold still and look at the camera. Signed in on your own device? The same controls appear on this page.",
  },
  {
    q: "The camera doesn't recognize me. Now what?",
    a: "Try better lighting, remove glasses/hat, and hold the badge steady - if it still fails, use Email + PIN or ask a manager to re-enroll your face from the admin Time Clock page.",
  },
  {
    q: "I forgot to clock out yesterday.",
    a: "Open the missed-punch banner on this page or submit a correction request from Time History. A manager reviews it - you can watch the status chip in the Time Tracker popover.",
  },
  {
    q: "What's the difference between Break and Work Pause?",
    a: "Break is personal time (lunch, rest). Work Pause is a job-related stop - machine down, waiting on materials, weather hold - and shows on manager reports.",
  },
  {
    q: "What does Current Work track?",
    a: "The labor you're on right now - fabrication, install, a specific WorkOrder. It feeds job costing; recent jobs are pinned as quick-pick chips so switching takes one tap.",
  },
  {
    q: "Where do my hours go?",
    a: "The Time Tracker counts paid time live. The popover shows your weekly grid, PTO balance, pay-period progress, and an Export button for your full punch history.",
  },
];

const WHATS_NEW = [
  "Track overtime and milestones right in the Time Tracker - it warns before you hit OT.",
  "See your PTO balance, pay-period progress, and next approved day off in the tracker popover.",
  "Export your whole punch history to CSV from the tracker - one tap.",
  "Recent labor jobs are pinned in Current Work - one tap to resume.",
  "Managers: bulk-approve corrections, see who's in, and check face-enrollment status from the admin page.",
];

export default function TimeClockHelpCard() {
  const [open, setOpen] = useState(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  return (
    <div className="clay-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-indigo-600" />
          Time Clock Help
        </h3>
        <button
          type="button"
          onClick={() => setShowWhatsNew((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {showWhatsNew ? "Hide what's new" : "What's new"}
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">Common questions, quick answers.</p>

      {showWhatsNew && (
        <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
          <p className="mb-1.5 text-xs font-bold text-indigo-900">Recently added</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-indigo-800">
            {WHATS_NEW.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {FAQ.map((item, i) => (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between py-2.5 text-left text-sm font-medium text-slate-700 hover:text-indigo-700"
            >
              {item.q}
              <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && <p className="pb-3 text-xs leading-relaxed text-slate-500">{item.a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
