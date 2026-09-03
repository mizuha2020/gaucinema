import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    // 1. Capacitor core platform check
    if (Capacitor.isNativePlatform()) return true;
    const platform = Capacitor.getPlatform();
    if (platform === 'android' || platform === 'ios') return true;

    // 2. Window Capacitor bridge check
    const capObj = (window as any).Capacitor;
    if (capObj?.isNative) return true;
    if (capObj?.getPlatform && typeof capObj.getPlatform === 'function') {
      const p = capObj.getPlatform();
      if (p === 'android' || p === 'ios') return true;
    }

    const origin = window.location.origin || '';
    const protocol = window.location.protocol || '';
    const hostname = window.location.hostname || '';
    const port = window.location.port || '';

    // 3. Native app protocol schemes
    if (
      origin.startsWith('capacitor://') ||
      origin.startsWith('ionic://') ||
      protocol === 'file:'
    ) {
      return true;
    }

    // 4. Capacitor Android default scheme (https://localhost or http://localhost with no dev port)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // In Android Capacitor APK, androidScheme is 'https' and port is empty (standard 443)
      if (protocol === 'https:' || port === '' || port === '80' || port === '443') {
        return true;
      }
      // Check user agent for Android WebView
      const ua = navigator.userAgent || '';
      if (/Android/i.test(ua) && (/wv/i.test(ua) || /Version\/4\.0/i.test(ua) || /Mobile/i.test(ua))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
};

export const CLOUD_BACKEND_URL = 'https://quocthubay-movie.ai.studio';

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
    // Guard: ignore Vite placeholder values baked at build time (e.g. "MY_APP_URL")
    // otherwise APK calls "MY_APP_URL/api/..." -> fetch fails, web still works via relative URL.
    if (envUrl && typeof envUrl === 'string' && envUrl.trim().startsWith('http') && !envUrl.includes('MY_')) {
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
  // Guard stale bundle where base is a placeholder (e.g. "MY_APP_URL")
  if (base && !base.startsWith('http') && !base.startsWith('/')) {
    if (isNativeApp()) {
      return `${CLOUD_BACKEND_URL}${cleanPath}`;
    }
    return cleanPath;
  }
  if (!base) {
    // Crucial safeguard for APK: Never return relative path if running in native app
    if (isNativeApp()) {
      return `${CLOUD_BACKEND_URL}${cleanPath}`;
    }
    return cleanPath;
  }
  return `${base}${cleanPath}`;
};

/**
 * Safely fetch JSON from backend or external URL with timeout and content-type validation.
 * Prevents "Unexpected token '<'" when receiving HTML error/redirect pages.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(options.headers || {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    // If upstream returns HTML (e.g. 302 cookie check or error page), reject safely
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      return null;
    }
    const data = await res.json();
    return data as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

