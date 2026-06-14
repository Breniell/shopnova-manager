import React, { useState } from 'react';
import { X } from 'lucide-react';

interface OneTimeHintProps {
  id: string;
  children: React.ReactNode;
}

/**
 * Displays a one-time dismissible hint bubble.
 * Persists dismissal in localStorage under 'legwan-hint-<id>'.
 * Shows above the nearest sibling, with a downward arrow.
 */
export const OneTimeHint: React.FC<OneTimeHintProps> = ({ id, children }) => {
  const storageKey = `legwan-hint-${id}`;

  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(storageKey); } catch { return false; }
  });

  const dismiss = () => {
    try { localStorage.setItem(storageKey, '1'); } catch { /* quota/private */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="flex px-1 mb-1">
      <div className="relative inline-flex items-center gap-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg px-3 py-1.5 shadow-md max-w-full">
        <span>{children}</span>
        <button
          type="button"
          onClick={dismiss}
          className="ml-1 rounded p-0.5 hover:bg-white/20 transition-colors shrink-0"
          aria-label="Fermer"
        >
          <X className="w-3 h-3" />
        </button>
        {/* Downward arrow toward the target below */}
        <span
          className="absolute top-full left-5 border-[6px] border-transparent border-t-primary"
          style={{ marginTop: '-1px' }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};
