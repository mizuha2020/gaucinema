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

export const getApiBaseUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_APP_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/$/, '');
  }

  // In browser, relative path uses the same host
  if (typeof window !== 'undefined' && !isNativeApp()) {
    return '';
  }

  // In native Android APK, use empty or custom remote API if provided
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
