import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, LogIn, LogOut } from "lucide-react";

// Crystal Shift ??? the premium dual-action punch control.
// Two real 50/50 hit targets sit over a single diagonal glass surface: the
// emerald In field and the coral Out field keep the prismatic split look, but
// each half is an equally-tappable button with its own spring press, hover
// edge-glow, and click spark. `verifying` shimmers while identity resolves;
// `success` flashes only after the backend confirms.
let sparkId = 0;

const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.9 };

function Spark({ x, y, color }) {
  const rays = [0, 60, 120, 180, 240, 300];
  return (
    <span className="pointer-events-none absolute z-30" style={{ left: x, top: y }} aria-hidden="true">
      <motion.span
        className="absolute -inset-4 rounded-full border-2"
        style={{ borderColor: color }}
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: 1.9, opacity: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      />
      {rays.map((deg) => (
        <motion.span
          key={deg}
          className="absolute h-[3px] w-3 rounded-full"
          style={{ backgroundColor: color, rotate: deg, transformOrigin: "0 50%" }}
          initial={{ x: 2, opacity: 1, scaleX: 1 }}
          animate={{ x: 22, opacity: 0, scaleX: 0.4 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      ))}
    </span>
  );
}

function Half({ side, onSpark, onAct, disabled, children, tint, edge }) {
  return (
    <motion.button
      type="button"
      onPointerDown={(e) => onSpark(side, e)}
      onClick={() => onAct(side)}
      disabled={disabled}
      whileTap={{ scale: 0.955 }}
      whileHover={disabled ? undefined : { y: -2 }}
      transition={SPRING}
      className={`group absolute inset-y-0 ${side === "in" ? "left-0" : "right-0"} w-1/2 outline-none focus-visible:z-20 touch-manipulation`}
      aria-label={side === "in" ? "Clock In ??? identify yourself" : "Clock Out ??? identify yourself"}
    >
      {/* per-half hover + focus edge glow, clipped to the surface */}
      <span
        className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 ${tint}`}
        aria-hidden="true"
      />
      <span
        className={`pointer-events-none absolute inset-0 rounded-[2rem] opacity-0 transition-opacity duration-300 group-focus-visible:opacity-100 ${edge}`}
        aria-hidden="true"
      />
      {children}
    </motion.button>
  );
}

export default function CrystalShiftButton({ onClockIn, onClockOut, disabled = false, verifying = false, success = null }) {
  const reduceMotion = useReducedMotion();
  const [sparks, setSparks] = useState([]);
  const hostRef = useRef(null);

  const spark = useCallback((side, e) => {
    if (disabled || reduceMotion || !hostRef.current) return;
    const r = hostRef.current.getBoundingClientRect();
    const s = { id: ++sparkId, x: e.clientX - r.left, y: e.clientY - r.top, color: side === "in" ? "#a7f3d0" : "#fecdd3" };
    setSparks((v) => [...v.slice(-5), s]);
  }, [disabled, reduceMotion]);

  // The action lives on click (not pointerdown) so keyboard Enter/Space and
  // assistive-tech activation work ??? pointerdown only seeds the spark coords.
  const act = useCallback((side) => {
    if (disabled) return;
    (side === "in" ? onClockIn : onClockOut)?.();
  }, [disabled, onClockIn, onClockOut]);

  return (
    <div className="relative w-72 sm:w-80" ref={hostRef}>
      {/* ambient colored glow bleeding past the shell */}
      <div className="absolute -inset-3 -z-10 rounded-[2.4rem] opacity-70 blur-xl" aria-hidden="true"
        style={{ background: "linear-gradient(120deg, rgba(16,185,129,0.35), transparent 45%, transparent 55%, rgba(244,63,94,0.32))" }} />
      <div className="absolute -inset-6 -z-20 rounded-[3rem] opacity-40 blur-2xl" aria-hidden="true"
        style={{ background: "linear-gradient(120deg, rgba(52,211,153,0.25), transparent 50%, rgba(251,113,133,0.22))" }} />

      <motion.div
        className="relative h-36 sm:h-40 overflow-hidden rounded-[2rem] shadow-2xl shadow-emerald-950/30"
        animate={success ? { scale: [1, 1.04, 1] } : {}}
        transition={{ duration: 0.5 }}
      >
        {/* dual gradient fields meeting on the diagonal */}
        <div className="absolute inset-0" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)",
          background: "linear-gradient(135deg, #34d399 0%, #10b981 38%, #059669 70%, #047857 100%)" }} />
        <div className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          background: "linear-gradient(315deg, #fda4af 0%, #fb7185 30%, #f43f5e 62%, #be123c 100%)" }} />

        {/* glass highlights per field */}
        <div className="absolute inset-x-0 top-0 h-16" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.38), rgba(255,255,255,0))" }} />
        <div className="absolute inset-x-0 bottom-0 h-16" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          background: "linear-gradient(0deg, rgba(255,255,255,0.3), rgba(255,255,255,0))" }} />

        {/* prismatic diagonal seam */}
        <div className="absolute inset-0" aria-hidden="true" style={{
          background: "linear-gradient(to bottom right, transparent calc(50% - 1.5px), rgba(255,255,255,0.95) calc(50% - 0.5px), rgba(147,197,253,0.55) 50%, rgba(255,255,255,0.9) calc(50% + 0.5px), transparent calc(50% + 1.5px))" }} />
        <div className="absolute inset-0 opacity-60" aria-hidden="true" style={{
          background: "linear-gradient(to bottom right, transparent calc(50% - 5px), rgba(255,255,255,0.22) 50%, transparent calc(50% + 5px))" }} />

        {/* metallic edging */}
        <div className="pointer-events-none absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-white/60" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-black/15" style={{ maskImage: "linear-gradient(180deg, transparent 55%, black)" }} aria-hidden="true" />

        {/* periodic glass sweeps */}
        {!reduceMotion && (
          <>
            <div className="punch-sheen absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent" aria-hidden="true" />
            <div className="crystal-sweep absolute -inset-y-2 w-1/4 bg-gradient-to-r from-transparent via-cyan-100/25 to-transparent" aria-hidden="true" />
          </>
        )}

        {/* verifying shimmer ??? while identity resolves */}
        <AnimatePresence>
          {verifying && (
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center rounded-[2rem] bg-slate-900/45 backdrop-blur-[2px]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <span className="flex items-center gap-2.5 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying???
              </span>
            </motion.div>
          )}
          {success && (
            <motion.div
              className={`absolute inset-0 z-20 flex items-center justify-center rounded-[2rem] ${success === "in" ? "bg-emerald-400/50" : "bg-rose-400/50"}`}
              initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0.35] }} transition={{ duration: 0.7 }}
            >
              <span className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-bold text-slate-800 shadow-lg">
                {success === "in" ? "Clocked In ???" : "Clocked Out ???"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* labels ??? anchored to each field's visible polygon side */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2.5 text-white drop-shadow-md sm:left-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/25 ring-1 ring-white/60 backdrop-blur-sm">
            <LogIn className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-2xl font-bold leading-none tracking-wide">Clock In</span>
            <span className="mt-1 block text-[11px] font-medium text-white/85">Start your shift</span>
          </span>
        </div>
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex items-center gap-2.5 text-white drop-shadow-md sm:right-5">
          <span className="text-right">
            <span className="block text-2xl font-bold leading-none tracking-wide">Clock Out</span>
            <span className="mt-1 block text-[11px] font-medium text-white/85">End your shift</span>
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/25 ring-1 ring-white/60 backdrop-blur-sm">
            <LogOut className="h-5 w-5" />
          </span>
        </div>

        {/* click sparks */}
        <AnimatePresence>
          {sparks.map((s) => (
            <Spark key={s.id} x={s.x} y={s.y} color={s.color} />
          ))}
        </AnimatePresence>

        {/* the two real hit targets ??? equal halves, on top of everything visual */}
        <Half side="in" onSpark={spark} onAct={act} disabled={disabled}
          tint="bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.35),transparent_60%)]"
          edge="shadow-[inset_0_0_0_3px_rgba(167,243,208,0.9)]">
          <span className="sr-only">Clock In</span>
        </Half>
        <Half side="out" onSpark={spark} onAct={act} disabled={disabled}
          tint="bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.35),transparent_60%)]"
          edge="shadow-[inset_0_0_0_3px_rgba(254,205,211,0.9)]">
          <span className="sr-only">Clock Out</span>
        </Half>
      </motion.div>
    </div>
  );
}

