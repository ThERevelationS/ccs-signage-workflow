import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formatCompanyDateTime,
  formatMinutes
} from "@/components/timeclock/timeClockCompanyTime";
export default function WorkDayGroupDialog({
  open,
  prompt,
  // { signature, anchor_date, span_minutes, entries: [{id,clock_in,clock_out,total_hours,pending}] }
  userName,
  busy = false,
  error = "",
  onSameDay,
  onSeparate,
  onLater
}) {
  const [localError, setLocalError] = useState("");
  const shownError = localError || error;
  const entries = Array.isArray(prompt?.entries) ? prompt.entries : [];
  const pendingCount = entries.filter((entry) => entry.pending).length;
  const act = async (fn) => {
    setLocalError("");
    try {
      await fn();
    } catch (err) {
      setLocalError(err?.message || "The answer could not be saved.");
    }
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange: () => {
  }, children: /* @__PURE__ */ jsxs(DialogContent, { className: "clay-card border-none max-w-md", onInteractOutside: (e) => e.preventDefault(), children: [
    /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsxs(DialogTitle, { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Layers, { className: "w-5 h-5 text-blue-600" }),
      "Same work day",
      userName ? ` - ${userName}` : "",
      "?"
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-600", children: pendingCount > 0 ? `You just clocked in again within one ${prompt?.span_minutes ? formatMinutes(prompt.span_minutes) : "12-hour"} window. Was this new shift part of the same work day as the session${entries.length - pendingCount === 1 ? "" : "s"} below?` : `These shifts all fall inside one ${prompt?.span_minutes ? formatMinutes(prompt.span_minutes) : "12-hour"} window. If they were really one work day with breaks in between, say so - your tracker will count all of them toward that day.` }),
      /* @__PURE__ */ jsx("ul", { className: "space-y-1.5", children: entries.map((entry) => /* @__PURE__ */ jsxs("li", { className: `flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${entry.pending ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`, children: [
        /* @__PURE__ */ jsxs("span", { className: "font-medium text-slate-800", children: [
          formatCompanyDateTime(entry.clock_in),
          " ",
          /* @__PURE__ */ jsx("span", { className: "text-slate-400", children: "->" }),
          " ",
          entry.pending ? /* @__PURE__ */ jsx("span", { className: "font-semibold text-blue-700", children: "in progress" }) : formatCompanyDateTime(entry.clock_out)
        ] }),
        /* @__PURE__ */ jsx("span", { className: "shrink-0 text-xs font-semibold text-slate-600", children: entry.pending ? "now" : Number.isFinite(Number(entry.total_hours)) ? `${Number(entry.total_hours).toFixed(2)}h` : "" })
      ] }, entry.id)) }),
      /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900", children: "This never changes your punches - it only tells the tracker whether to add all of these periods to the same day." }),
      shownError && /* @__PURE__ */ jsx("p", { className: "text-sm text-red-600", children: shownError }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-3 pt-1", children: [
        /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => act(onSeparate), disabled: busy, className: "flex-1", children: busy ? /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin" }) : "No, separate days" }),
        /* @__PURE__ */ jsx(Button, { type: "button", onClick: () => act(onSameDay), disabled: busy, className: "flex-1 bg-blue-600 hover:bg-blue-700", children: busy ? /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin" }) : "Yes, one work day" })
      ] }),
      typeof onLater === "function" && /* @__PURE__ */ jsx("button", { type: "button", onClick: onLater, disabled: busy, className: "mx-auto block text-xs text-slate-500 underline-offset-2 hover:underline disabled:opacity-50", children: "Ask me later" })
    ] })
  ] }) });
}
