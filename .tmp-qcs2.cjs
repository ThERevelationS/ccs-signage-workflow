const fs = require("fs");
const f = "src/components/timeclock/QuickClockSection.jsx";
let s = fs.readFileSync(f, "utf8");
let applied = 0;

// 1) Post-punch day summary - append worked-hours to the confirm messages (#42)
const cin = "setRecognitionStatus(\"Clock-in confirmed by server.\");";
if (s.includes(cin) && !s.includes("Clock-in confirmed")) {}
// actually rewrite the string itself
if (s.includes(cin) && !s.includes("entry?.total_hours")) {
  // no-op: the status response gets rendered separately; skip
}

// 2) Per-kiosk methods filter - gate the identify-method chooser (#53)
const chooser = "            {!recognitionMethod && (() => {";
if (s.includes(chooser) && !s.includes("allowedMethods")) {
  s = s.replace(chooser, `            {!recognitionMethod && (() => {
              const allowedMethods = (() => { try { const m = localStorage.getItem("ccs_kiosk_methods"); return m ? m.split(",").map((x) => x.trim()).filter(Boolean) : ["face", "qr", "manual"]; } catch { return ["face", "qr", "manual"]; } })();
              const stored = (() => { try { return localStorage.getItem("ccs_kiosk_method"); } catch { return null; } })();
              const preferred = allowedMethods.includes(stored) ? stored : allowedMethods[0];`);
  applied += 1;
}

// 3) Paid-break hint in the break summary line (#62)
const bsAnchor = "const [breakSummary, setBreakSummary]";
if (s.includes(bsAnchor) && !s.includes("paidBreakRemaining")) {
  s = s.replace("  const [breakSummary, setBreakSummary] = useState({ count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });", "  const [breakSummary, setBreakSummary] = useState({ count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 });\n  const paidBreakRemaining = Math.max(0, 20 - (breakSummary?.paid_minutes || 0)); // 20m paid allowance policy");
  applied += 1;
}

fs.writeFileSync(f, s);
console.log("applied " + applied);
