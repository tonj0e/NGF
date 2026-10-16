export const animations = {
  pageTransition: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
  
  staggerContainer: {
    animate: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
  },
  
  cardEntrance: {
    initial: { opacity: 0, y: 30, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
  },
  
  chartDraw: {
    initial: { pathLength: 0 },
    animate: { pathLength: 1 },
    transition: { duration: 1.5, ease: [0.4, 0, 0.2, 1] },
  },
  
  countUp: {
    initial: 0,
    transition: { duration: 1.2, ease: [0.4, 0, 0.2, 1] },
  },
  
  hoverLift: {
    whileHover: { y: -4, scale: 1.02, transition: { duration: 0.2 } },
    whileTap: { scale: 0.98 },
  },
  
  badgeMorph: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.8, opacity: 0 },
    transition: { duration: 0.25, ease: 'easeOut' },
  },
} as const;