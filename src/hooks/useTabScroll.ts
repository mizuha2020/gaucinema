import { useEffect } from 'react';

export function useTabScroll(currentTab: string) {
  // Auto scroll to top when entering home tab
  useEffect(() => {
    if (currentTab === 'home') {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, [currentTab]);

  return {};
}

