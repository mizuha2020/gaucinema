import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  if ((window as any).Capacitor?.isNative) return true;
  const origin = window.location.origin || '';
  return (
    origin.includes('localhost') ||
    origin.includes('capacitor://') ||
    origin.includes('https://localhost') ||
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

  // 2. Check environment variable
  const envUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_APP_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/$/, '');
  }

  // 3. In web browser or native app default, return empty base unless custom remote is set
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

export const getFullApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  if (!base) {
    return cleanPath;
  }
  return `${base}${cleanPath}`;
};
