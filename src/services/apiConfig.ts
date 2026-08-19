import { Capacitor } from '@capacitor/core';

/**
 * Utility to get the base API URL.
 * In a Capacitor native app, relative URLs like /api/... won't work because 
 * the app is served from localhost, but the server is remote.
 */
export const getApiBaseUrl = (): string => {
  // If we're on a browser and not localhost, use the current origin
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    
    // In Capacitor, hostname might be 'localhost'
    const isCapacitor = (window as any).Capacitor || (window as any).webkit?.messageHandlers?.bridge;
    
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !isCapacitor) {
      return origin;
    }
  }

  // Use the environment variable if provided (MUST be prefixed with VITE_)
  // For Capacitor builds, this is the most reliable way to point to the remote server.
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_APP_URL;
  
  if (envUrl) {
    const cleanUrl = envUrl.replace(/\/$/, '');
    console.log('API Base URL set from environment:', cleanUrl);
    return cleanUrl;
  }

  // Fallback for AI Studio specifically - try to derive it from the window location if we are in an iframe
  // or if we can find a hint in the environment.
  if (typeof window !== 'undefined' && window.location.origin.includes('run.app')) {
    return window.location.origin;
  }

  console.warn('API Base URL is EMPTY. Native app connectivity will fail.');
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
