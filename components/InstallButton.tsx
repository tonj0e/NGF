'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallButton() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-4 left-4 right-4 md:bottom-4 md:right-4 md:left-auto md:w-auto z-50"
    >
      <div className="bg-white rounded-2xl shadow-lg border border-line p-4 flex items-center gap-3 min-w-[280px] animate-slide-up">
        <div className="p-2 rounded-xl bg-ink text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink">Install NGF FINCORP</p>
          <p className="text-xs text-soft">Add to home screen for offline access</p>
        </div>
        <button onClick={async () => { const prompt = (window as any).deferredPrompt; if (prompt) { await prompt.prompt(); await prompt.userChoice; (window as any).deferredPrompt = null; } }} className="rounded-xl bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">Install</button>
        <button onClick={() => setShow(false)} className="text-soft hover:text-ink p-1"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
    </motion.div>
  );
}