import { motion, useReducedMotion } from "framer-motion";
import { duration, easing } from "./motion";

// One-shot entrance: fades and rises on mount. Under prefers-reduced-motion it
// renders instantly. `as` picks the element (default div).
export default function FadeIn({ children, className, delay = 0, as = "div", ...props }) {
  const reduceMotion = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.ui, ease: easing.decelerate, delay }}
      {...props}
    >
      {children}
    </Tag>
  );
}
