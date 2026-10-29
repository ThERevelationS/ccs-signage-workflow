const fs = require('fs');
const p = 'src/index.css';
const t = fs.readFileSync(p, 'utf8');
if (t.includes('.tracker-bg-glass')) { console.log('already present'); process.exit(0); }
const add = `

/* ===== Time Tracker: accent-var backgrounds + extra animations ===== */
/* The pill sets --tracker-accent / --tracker-accent-soft / --tracker-accent-text
   inline from the resolved accent (named or custom hex), so every background
   works with the color wheel. */
.tracker-bg-glass {
  background: color-mix(in srgb, var(--tracker-accent, #6366f1) 12%, rgba(255,255,255,0.72));
  border: 1px solid color-mix(in srgb, var(--tracker-accent, #6366f1) 35%, transparent);
  backdrop-filter: blur(10px);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-solid {
  background: var(--tracker-accent-soft, #eef2ff);
  border: 1px solid color-mix(in srgb, var(--tracker-accent, #6366f1) 30%, transparent);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-outline {
  background: transparent;
  border: 1.5px solid var(--tracker-accent, #6366f1);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-soft {
  background: color-mix(in srgb, var(--tracker-accent, #6366f1) 8%, transparent);
  border: 1px solid transparent;
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-accent {
  background: var(--tracker-accent, #6366f1);
  border: 1px solid var(--tracker-accent, #6366f1);
  color: #fff;
}
.tracker-bg-halo {
  background: var(--tracker-accent-soft, #eef2ff);
  border: 1px solid color-mix(in srgb, var(--tracker-accent, #6366f1) 45%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tracker-accent, #6366f1) 18%, transparent), 0 0 18px color-mix(in srgb, var(--tracker-accent, #6366f1) 35%, transparent);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-dotted {
  background: rgba(255,255,255,0.5);
  border: 2px dashed var(--tracker-accent, #6366f1);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-striped {
  background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--tracker-accent, #6366f1) 10%, transparent) 0 8px, transparent 8px 16px), var(--tracker-accent-soft, #eef2ff);
  border: 1px solid color-mix(in srgb, var(--tracker-accent, #6366f1) 30%, transparent);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-elevated {
  background: #fff;
  border: 1px solid rgba(15,23,42,0.06);
  box-shadow: 0 8px 24px -6px color-mix(in srgb, var(--tracker-accent, #6366f1) 45%, rgba(0,0,0,0.25)), 0 2px 6px rgba(15,23,42,0.08);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-inset {
  background: color-mix(in srgb, var(--tracker-accent, #6366f1) 9%, #f8fafc);
  border: 1px solid color-mix(in srgb, var(--tracker-accent, #6366f1) 22%, transparent);
  box-shadow: inset 0 2px 6px rgba(15,23,42,0.10);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-neon {
  background: #0f172a;
  border: 1.5px solid var(--tracker-accent, #6366f1);
  box-shadow: 0 0 10px color-mix(in srgb, var(--tracker-accent, #6366f1) 55%, transparent), inset 0 0 8px color-mix(in srgb, var(--tracker-accent, #6366f1) 20%, transparent);
  color: #fff;
}
.tracker-bg-pearl {
  background: linear-gradient(135deg, #ffffff 0%, color-mix(in srgb, var(--tracker-accent, #6366f1) 10%, #f1f5f9) 55%, #ffffff 100%);
  border: 1px solid rgba(148,163,184,0.35);
  box-shadow: 0 1px 3px rgba(15,23,42,0.08);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-carbon {
  background: repeating-linear-gradient(45deg, #1e293b 0 6px, #0f172a 6px 12px);
  border: 1px solid #334155;
  color: #f1f5f9;
}
.tracker-bg-mesh {
  background:
    radial-gradient(at 20% 20%, color-mix(in srgb, var(--tracker-accent, #6366f1) 28%, transparent) 0, transparent 55%),
    radial-gradient(at 80% 10%, rgba(56,189,248,0.22) 0, transparent 50%),
    radial-gradient(at 60% 90%, color-mix(in srgb, var(--tracker-accent, #6366f1) 18%, transparent) 0, transparent 55%),
    #fff;
  border: 1px solid rgba(148,163,184,0.3);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-aurora {
  background: linear-gradient(115deg,
    color-mix(in srgb, var(--tracker-accent, #6366f1) 26%, transparent),
    rgba(45,212,191,0.22) 35%,
    rgba(168,85,247,0.24) 70%,
    color-mix(in srgb, var(--tracker-accent, #6366f1) 20%, transparent));
  border: 1px solid rgba(148,163,184,0.3);
  backdrop-filter: blur(6px);
  color: var(--tracker-accent-text, #1e293b);
}
.tracker-bg-dusk {
  background: linear-gradient(135deg, #1e1b4b, #312e81 55%, #4c1d95);
  border: 1px solid #4338ca;
  color: #e0e7ff;
}
.tracker-bg-forest {
  background: linear-gradient(135deg, #052e16, #14532d 55%, #166534);
  border: 1px solid #15803d;
  color: #dcfce7;
}
.tracker-bg-ocean {
  background: linear-gradient(135deg, #082f49, #0c4a6e 55%, #075985);
  border: 1px solid #0369a1;
  color: #e0f2fe;
}
.tracker-bg-sunset {
  background: linear-gradient(115deg, #7c2d12, #c2410c 45%, #f59e0b 90%);
  border: 1px solid #ea580c;
  color: #fff7ed;
}
.tracker-bg-berry {
  background: linear-gradient(135deg, #500724, #9d174d 55%, #be185d);
  border: 1px solid #be185d;
  color: #fce7f3;
}
.tracker-bg-mono {
  background: #18181b;
  border: 1px solid #3f3f46;
  color: #fafafa;
}

/* ===== Time Tracker: extra animation styles ===== */
@keyframes trackerWave { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
.tracker-wave { animation: trackerWave 2.2s ease-in-out infinite; }
@keyframes trackerSparkle { 0%,100% { text-shadow: 0 0 0 transparent; } 50% { text-shadow: 0 0 8px var(--tracker-accent, #6366f1), 0 0 14px color-mix(in srgb, var(--tracker-accent, #6366f1) 70%, transparent); } }
.tracker-sparkle { animation: trackerSparkle 2s ease-in-out infinite; }
@keyframes trackerFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.tracker-float { animation: trackerFloat 3s ease-in-out infinite; }
@keyframes trackerFlicker { 0%,100% { opacity: 1; } 45% { opacity: 1; } 50% { opacity: 0.55; } 55% { opacity: 1; } 80% { opacity: 0.8; } 85% { opacity: 1; } }
.tracker-flicker { animation: trackerFlicker 4s linear infinite; }
@keyframes trackerRainbow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
.tracker-rainbow { animation: trackerRainbow 5s linear infinite; }
@keyframes trackerPop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
.tracker-pop { animation: trackerPop 1.6s cubic-bezier(0.34,1.56,0.64,1) infinite; }
@keyframes trackerWobble { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-2.5deg); } 75% { transform: rotate(2.5deg); } }
.tracker-wobble { animation: trackerWobble 2.4s ease-in-out infinite; }
@keyframes trackerRipple { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--tracker-accent, #6366f1) 45%, transparent); } 100% { box-shadow: 0 0 0 12px transparent; } }
.tracker-ripple { animation: trackerRipple 1.8s ease-out infinite; }
@keyframes trackerShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-2px); } 40% { transform: translateX(2px); } 60% { transform: translateX(-1px); } 80% { transform: translateX(1px); } }
.tracker-shake { animation: trackerShake 3.2s ease-in-out infinite; }
@keyframes trackerGradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.tracker-gradient {
  background-image: linear-gradient(115deg, var(--tracker-accent, #6366f1), #38bdf8, #a855f7, var(--tracker-accent, #6366f1));
  background-size: 300% 300%;
  animation: trackerGradient 4s ease-in-out infinite;
  color: #fff;
  border: 1px solid transparent;
}

@media (prefers-reduced-motion: reduce) {
  .tracker-wave, .tracker-sparkle, .tracker-float, .tracker-flicker, .tracker-rainbow,
  .tracker-pop, .tracker-wobble, .tracker-ripple, .tracker-shake, .tracker-gradient { animation: none !important; }
}
`;
fs.writeFileSync(p, t + add);
console.log('css appended');
