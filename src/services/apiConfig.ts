import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  if ((window as any).Capacitor?.isNative) return true;
  const origin = window.location.origin || '';
  return (
    origin.includes('capacitor://') ||
    window.location.protocol === 'file:'
  );
};

export const CLOUD_BACKEND_URL = 'https://ais-dev-vnvd2uudmu6l2atxxr7h75-18391378124.asia-southeast1.run.app';

export const getApiBaseUrl = (): string => {
  // 1. Check custom user/admin saved backend URL in localStorage
  if (typeof window !== 'undefined') {
    try {
      const customUrl = localStorage.getItem('qtb_custom_backend_url');
      if (customUrl && customUrl.trim().startsWith('http')) {
        return customUrl.trim().replace(/\/$/, '');
      }
    } catch {}
  }

  // 2. ONLY for native mobile app (Capacitor Android APK), use absolute backend URL
  if (isNativeApp()) {
    const envUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_APP_URL;
    if (envUrl && envUrl.trim() !== '') {
      return envUrl.trim().replace(/\/$/, '');
    }
    return CLOUD_BACKEND_URL;
  }

  // 3. For ALL web browsers (Preview, Published link, AI Studio iframe, local dev):
  // MUST return empty string so relative URLs like `/api/proxy/...` are used directly
  // on the current host origin without cross-origin redirects.
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

export const getFullApiUrl = (path: string): string => {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  if (!base) {
    return cleanPath;
  }
  return `${base}${cleanPath}`;
};
