import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "framer-motion";

// Tweened number display for KPIs. Animates from the previous committed value
// to the new one; reduced-motion users see the final value immediately.
export default function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), duration: dur = 0.6, className }) {
  const reduceMotion = useReducedMotion();
  const ref = useRef(null);
  const prev = useRef(0);

  useEffect(() => {
    const node = ref.current;
    const target = Number(value);
    if (!node || !Number.isFinite(target)) return;
    if (reduceMotion) {
      node.textContent = format(target);
      prev.current = target;
      return;
    }
    const controls = animate(prev.current, target, {
      duration: dur,
      ease: "easeOut",
      onUpdate: (v) => { node.textContent = format(v); },
    });
    prev.current = target;
    return () => controls.stop();
  }, [value, reduceMotion, dur]);

  return <span ref={ref} className={className} aria-live="polite" />;
}
