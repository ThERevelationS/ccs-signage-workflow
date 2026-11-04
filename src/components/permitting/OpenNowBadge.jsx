// MP-11.2 — "Open now" badge: parses office `hours` text against local time.
// Best-effort: "8:00 AM - 4:30 PM", "M-F 8-4:30", "8-5". When the text can't
// be parsed the badge is silent (an honest unknown beats a wrong answer).
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

function parseHours(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  const day = new Date().getDay(); // 0 Sun .. 6 Sat
  const everyday = /daily|every ?day|7 days|mon(mon)?-?\s*sun/i.test(t);
  const mentions = { 0: /\bsun/, 6: /\bsat/ };
  if (day === 0 || day === 6) {
    // Government offices are weekday affairs — only open on a weekend when
    // the text explicitly says so.
    if (!everyday && !mentions[day].test(t)) return { open: false, why: "weekend" };
  }
  const hm = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:[-–]|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i.exec(t);
  if (!hm) return null;
  const toMins = (h, m, ampm, isStart) => {
    let hh = Number(h);
    let ap = (ampm || "").replace(/\./g, "");
    if (!ap) ap = isStart ? "am" : "pm"; // gov hours: bare start is AM, bare end is PM
    if (ap === "pm" && hh < 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;
    return hh * 60 + Number(m || 0);
  };
  const open = toMins(hm[1], hm[2], hm[3], true);
  const close = toMins(hm[4], hm[5], hm[6], false);
  if (!(open < close)) return null;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return { open: mins >= open && mins <= close, why: null };
}

export default function OpenNowBadge({ hours }) {
  const r = parseHours(hours);
  if (!r) return null;
  return r.open ? (
    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
      <Clock className="w-3 h-3 mr-1" />Open now
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-500 border-gray-200">
      <Clock className="w-3 h-3 mr-1" />Closed{r.why ? ` — ${r.why}` : ""}
    </Badge>
  );
}
