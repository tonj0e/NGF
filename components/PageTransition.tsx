'use client';
import { motion, AnimatePresence } from 'framer-motion';

export function PageTransition({ children, key }: { children: React.ReactNode; key?: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key || 'page-transition'}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}