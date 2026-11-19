const fs = require("fs");
const f = "src/components/timeclock/QuickClockSection.jsx";
let s = fs.readFileSync(f, "utf8");
let applied = 0;

// 1) Screensaver dim + voice prompts + fail counter + holiday greeting state -
//    one effect block after the device heartbeat.
const hb = "      base44.functions.invoke(\"timeClockAction\", { action: \"register_device\"";
const hbEnd = "  }, []);\n\n  // Device heartbeat";
if (s.includes(hb) && s.includes(hbEnd)) {
  const insert = `  }, []);

  // --- Kiosk comfort features (localStorage-gated, no backend) ---
  const [dimmed, setDimmed] = useState(false);
  const dimTimerRef = useRef(null);
  const wake = () => { setDimmed(false); if (dimTimerRef.current) clearTimeout(dimTimerRef.current); dimTimerRef.current = setTimeout(() => setDimmed(true), 120000); };
  useEffect(() => { wake(); const h = () => wake(); window.addEventListener("pointerdown", h); window.addEventListener("keydown", h); return () => { window.removeEventListener("pointerdown", h); window.removeEventListener("keydown", h); if (dimTimerRef.current) clearTimeout(dimTimerRef.current); }; }, []);
  const [voiceOn] = useState(() => { try { return localStorage.getItem("ccs_kiosk_voice") === "1"; } catch { return false; } });
  useEffect(() => { if (voiceOn && recognitionStatus && "speechSynthesis" in window) { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(recognitionStatus)); } catch {} } }, [recognitionStatus, voiceOn]);
  const [faceFails, setFaceFails] = useState(() => { try { return Number(localStorage.getItem("ccs_face_fails") || 0); } catch { return 0; } });
  const [holiday] = useState(() => { const d = new Date(); const key = d.toISOString().slice(0, 10); const map = { "2026-01-01": "New Year's Day", "2026-07-04": "Independence Day", "2026-11-26": "Thanksgiving", "2026-12-25": "Christmas" }; return map[key] || null; });
  const quietNow = () => { try { const w = localStorage.getItem("ccs_kiosk_quiet"); if (!w) return false; const [a, b] = w.split("-").map(Number); const h = new Date().getHours(); return a <= b ? h >= a && h < b : h >= a || h < b; } catch { return false; } };

  // Device heartbeat`;
  s = s.replace(hbEnd, insert);
  applied += 1;
}

// 2) Screensaver overlay + holiday greeting + re-enroll banner - render near tutorial
const tut = "        {showKioskTutorial && (";
if (s.includes(tut) && !s.includes("kiosk-dim-overlay")) {
  s = s.replace(tut, `        {dimmed && <div className="kiosk-dim-overlay fixed inset-0 z-50 bg-slate-900/90 transition-opacity" onClick={wake} />}
        {holiday && <p className="mb-2 rounded-md bg-amber-50 px-3 py-1.5 text-center text-sm font-semibold text-amber-800">Happy {holiday}! Holiday hours apply today.</p>}
        {faceFails >= 5 && <p className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-700">Face not recognizing you? Ask a manager to re-enroll your photo.</p>}
` + tut);
  applied += 1;
}

// 3) Track face failures - bump counter on recognition failure
const failAnchor = "setRecognitionStatus(\"Face not recognized";
if (s.includes(failAnchor) && !s.includes("setFaceFails((v) => { const n = v + 1")) {
  s = s.replace(failAnchor, "setFaceFails((v) => { const n = v + 1; try { localStorage.setItem(\"ccs_face_fails\", String(n)); } catch {} return n; });\n        " + failAnchor);
  applied += 1;
}

// 4) Quiet hours suppress the chime
const chimeAnchor = "const playChime = () => {";
if (s.includes(chimeAnchor) && !s.includes("quietNow()")) {
  s = s.replace(chimeAnchor, chimeAnchor + "\n    if (quietNow()) return;");
  applied += 1;
}

// 5) Glove mode - reuse large-text but scale button row extra
const lt = "zoom: largeText ? 1.3 : 1";
if (s.includes(lt) && !s.includes("gloveMode")) {
  s = s.replace("  const toggleLargeText = () => setLargeText((v) => {", "  const [gloveMode, setGloveMode] = useState(() => { try { return localStorage.getItem(\"ccs_kiosk_glove\") === \"1\"; } catch { return false; } });\n  const toggleLargeText = () => setLargeText((v) => {");
  s = s.replace(lt, "zoom: largeText ? 1.3 : gloveMode ? 1.6 : 1");
  applied += 1;
}

fs.writeFileSync(f, s);
console.log("applied " + applied + " blocks");
