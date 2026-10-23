import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { spring } from "./motion";

const TONES = {
  neutral: "glow-card",
  success: "glow-card glow-success",
  warning: "glow-card glow-warning",
  danger: "glow-card glow-danger",
  info: "glow-card glow-info",
};

// Card with ambient status lighting (CSS classes in index.css) and a soft
// spring lift on hover. `tone` colors the edge glow.
export default function GlowCard({ tone = "neutral", className, children, hover = true, ...props }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={cn(TONES[tone] || TONES.neutral, "rounded-xl border bg-card text-card-foreground", className)}
      whileHover={hover && !reduceMotion ? { y: -2 } : undefined}
      transition={spring.soft}
      {...props}
    >
      {children}
    </motion.div>
  );
}
