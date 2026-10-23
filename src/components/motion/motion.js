// Shared motion vocabulary. Every animation in the app should pull durations,
// easings, and springs from here so surfaces move consistently.
export const duration = { micro: 0.12, ui: 0.18, surface: 0.28, page: 0.38 };

export const easing = {
  standard: [0.2, 0.0, 0.0, 1.0],
  decelerate: [0.0, 0.0, 0.2, 1.0],
  accelerate: [0.4, 0.0, 1.0, 1.0],
};

export const spring = {
  soft: { type: "spring", stiffness: 180, damping: 24 },
  snappy: { type: "spring", stiffness: 380, damping: 30 },
  bouncy: { type: "spring", stiffness: 320, damping: 18 },
};

export const staggerContainer = (step = 0.04, delay = 0.03) => ({
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const fadeUpItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: duration.surface, ease: easing.decelerate } },
};

export const pageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.ui, ease: easing.decelerate },
};
