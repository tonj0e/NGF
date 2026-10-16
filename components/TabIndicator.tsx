'use client';
import { motion } from 'framer-motion';

interface TabIndicatorProps {
  tabs: { key: string; label: string }[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function TabIndicator({ tabs, activeTab, onChange }: TabIndicatorProps) {
  const activeIndex = tabs.findIndex(t => t.key === activeTab);
  
  return (
    <div className="relative flex gap-1 bg-gray-100 rounded-xl p-1">
      <motion.div
        layoutId="tab-indicator"
        className="absolute top-1 bottom-1 bg-white rounded-xl shadow-sm z-10"
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
      {tabs.map((tab, i) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className="relative z-10 flex-1 px-4 py-2 text-sm font-medium rounded-xl transition-colors"
          style={{
            color: activeTab === tab.key ? '#fff' : '#697586',
            backgroundColor: activeTab === tab.key ? 'transparent' : 'transparent'
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}