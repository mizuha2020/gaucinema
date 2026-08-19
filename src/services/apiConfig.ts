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

  // Priority 2: Hardcoded fallback for this specific deployment
  // This ensures that even if Vite env fails, the app still works.
  const fallbackUrl = "https://ais-pre-vnvd2uudmu6l2atxxr7h75-18391378124.asia-southeast1.run.app";
  
  // Priority 3: If we're on a browser and not localhost, use the current origin
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    
    // In Capacitor, hostname might be 'localhost'
    const isCapacitor = (window as any).Capacitor || (window as any).webkit?.messageHandlers?.bridge || Capacitor.isNativePlatform();
    
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !isCapacitor) {
      return origin;
    }
    
    // Fallback for AI Studio preview specifically
    if (origin.includes('run.app')) {
      return origin;
    }

    if (isCapacitor) {
      return fallbackUrl;
    }
  }

  return fallbackUrl;
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Helper to build a full API URL
 */
export const getFullApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};
