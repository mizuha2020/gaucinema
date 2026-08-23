import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  if ((window as any).Capacitor?.isNative) return true;
  const origin = window.location.origin || '';
  return origin.includes('localhost') || 
         origin.includes('capacitor://') || 
         window.location.protocol === 'file:';
};

export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const isNative = isNativeApp();
    // Use relative path ONLY when running on a real remote web browser domain (not Capacitor / localhost app)
    if (!isNative) {
      return '';
    }
  }
  
  const envUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_APP_URL;
  if (envUrl && envUrl !== '') {
    return envUrl.replace(/\/$/, '');
  }

  return "https://ais-pre-vnvd2uudmu6l2atxxr7h75-18391378124.asia-southeast1.run.app";
};

export const API_BASE_URL = getApiBaseUrl();

export const getFullApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL === '') {
    return cleanPath;
  }
  return `${API_BASE_URL}${cleanPath}`;
};
