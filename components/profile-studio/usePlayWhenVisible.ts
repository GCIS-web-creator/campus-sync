import { useEffect, useState, type RefObject } from 'react';

/** Pause decorative motion while its card is outside the viewport. */
export function usePlayWhenVisible<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0.02 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}
