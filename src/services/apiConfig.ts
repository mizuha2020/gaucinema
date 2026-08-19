import { Capacitor } from '@capacitor/core';

/**
 * Utility to get the base API URL.
 * In a Capacitor native app, relative URLs like /api/... won't work because 
 * the app is served from localhost, but the server is remote.
 */
export const getApiBaseUrl = (): string => {
  // Priority 1: Use the hardcoded environment variable from Vite build
  // This is the MOST reliable for Capacitor APKs.
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_APP_URL;
  if (envUrl && envUrl !== '') {
    const cleanUrl = envUrl.replace(/\/$/, '');
    console.log('API Base URL set from Vite env:', cleanUrl);
    return cleanUrl;
  }

  // Priority 2: If we're on a browser and not localhost, use the current origin
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    
    // In Capacitor, hostname might be 'localhost'
    const isCapacitor = (window as any).Capacitor || (window as any).webkit?.messageHandlers?.bridge;
    
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !isCapacitor) {
      return origin;
    }
    
    // Fallback for AI Studio preview specifically
    if (origin.includes('run.app')) {
      return origin;
    }
  }

  console.warn('API Base URL is EMPTY. This will likely cause failures on native platforms.');
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Helper to build a full API URL
 */
export const getFullApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};
