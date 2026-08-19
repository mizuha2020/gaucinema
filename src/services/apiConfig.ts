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
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return origin;
    }
  }

  // Use the environment variable if provided (MUST be prefixed with VITE_)
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_APP_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  // Fallback: If on native platform and no URL provided, we might be in trouble
  // but we can try to return empty string for browser-based localhost dev
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
