import { motion, useReducedMotion } from "framer-motion";
import { fadeUpItem, staggerContainer } from "./motion";

// Wrap a list/grid in <Stagger> and each child in <StaggerItem> for a
// staggered entrance. Reduced-motion users get instant rendering.
export function Stagger({ children, className, step = 0.04, delay = 0.03, ...props }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={staggerContainer(step, delay)}
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, ...props }) {
  return (
    <motion.div className={className} variants={fadeUpItem} {...props}>
      {children}
    </motion.div>
  );
}
