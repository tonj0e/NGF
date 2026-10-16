'use client';
import { useEffect, useState, createContext, useContext } from 'react';
import { motion } from 'framer-motion';

const ReducedMotionContext = createContext(false);

export function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return (
    <ReducedMotionContext.Provider value={reduced}>
      {children}
    </ReducedMotionContext.Provider>
  );
}

export function useReducedMotion() {
  return useContext(ReducedMotionContext);
}

export function MotionWrapper({ children, animate, ...props }: any) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return <motion.div animate={animate} {...props} />;
}