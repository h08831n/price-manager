import { useEffect } from 'react';

/**
 * Custom hook to trigger a callback when the Escape key is pressed.
 * Only triggers if enabled is true.
 */
export function useEscapeKey(onEscape?: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || !onEscape) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, enabled]);
}
