import { Capacitor } from '@capacitor/core';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import { getDeviceId } from './sessionService';

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

// --- Tự chữa backend chết (APK bake VITE_API_URL cũ mà không ai hay) ---
// Thứ tự ưu tiên: custom (người dùng chỉ định) > session đã verify kỳ này >
// verified đã lưu (kỳ trước chữa khỏi) > env baked-in > cloud mặc định.
const VERIFIED_KEY = 'qtb_verified_backend_url';
const VERIFIED_TTL_MS = 24 * 60 * 60 * 1000;
let sessionBackendOverride: string | null = null;
let verifyPromise: Promise<string> | null = null;

function readPersistedVerified(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = localStorage.getItem(VERIFIED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: string; at?: number };
    const url = (parsed?.url || '').trim().replace(/\/$/, '');
    if (!url.startsWith('http') || !parsed?.at || Date.now() - parsed.at > VERIFIED_TTL_MS) return null;
    return url;
  } catch {
    return null;
  }
}

function persistVerified(url: string) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(VERIFIED_KEY, JSON.stringify({ url: url.replace(/\/$/, ''), at: Date.now() }));
  } catch {
    // ignore
  }
}

async function checkBackendHealth(base: string, ms = 6000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const r = await fetch(`${base.replace(/\/$/, '')}/api/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return !!(j && (j as any).status === 'ok');
  } catch {
    return false;
  }
}

/**
 * Kiểm tra backend đang dùng còn sống không; chết thì đổi sang cloud cho kỳ này
 * (và lưu lại để lần sau dùng ngay từ đầu, khỏi chờ fetch rớt mới biết).
 * Web (relative URL) thì no-op. Luôn resolve, không bao giờ throw.
 */
export function verifyBackendUrl(): Promise<string> {
  if (typeof window === 'undefined' || !isNativeApp()) {
    return Promise.resolve(getApiBaseUrl());
  }
  if (!verifyPromise) {
    verifyPromise = (async () => {
      const current = getApiBaseUrl();
      if (await checkBackendHealth(current)) {
        sessionBackendOverride = current;
        persistVerified(current);
        return current;
      }
      if (current !== CLOUD_BACKEND_URL && (await checkBackendHealth(CLOUD_BACKEND_URL))) {
        console.info(`[backend] ${current} unreachable, fallback to ${CLOUD_BACKEND_URL}`);
        sessionBackendOverride = CLOUD_BACKEND_URL;
        persistVerified(CLOUD_BACKEND_URL);
        return CLOUD_BACKEND_URL;
      }
      return current;
    })();
  }
  return verifyPromise;
}

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

  // 1b. Session override / verified URL từ lần verify trước (xem verifyBackendUrl)
  if (sessionBackendOverride && sessionBackendOverride.startsWith('http')) {
    return sessionBackendOverride;
  }
  const persisted = readPersistedVerified();
  if (persisted) {
    return persisted;
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

// ---------------------------------------------------------------------------
// Authenticated backend fetch (Prompt 3 BƯỚC 6)
// Helper dùng chung cho MỌI lời gọi tới /api/*: gắn ID token vào header
// Authorization. Token CHỈ gắn khi gọi đúng backend của mình, không bao giờ
// gắn vào request đi domain bên thứ ba.
// 401 -> refresh token 1 lần -> vẫn 401 -> signOut + về màn hình đăng nhập.
// ---------------------------------------------------------------------------

let cachedIdToken: string | null = null;
let cachedIdTokenAt = 0;
const TOKEN_CACHE_MS = 10 * 60 * 1000;

/** Lấy (và cache 10 phút) Firebase ID token của user hiện tại. */
export async function getBackendToken(forceRefresh = false): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) {
      // Hết phiên (logout/bị đá): xóa token cũ để request ẩn danh sau đó
      // không đính token chết gây 401 → reload oan.
      cachedIdToken = null;
      cachedIdTokenAt = 0;
      return null;
    }
    if (!forceRefresh && cachedIdToken && Date.now() - cachedIdTokenAt < TOKEN_CACHE_MS) {
      return cachedIdToken;
    }
    cachedIdToken = await user.getIdToken(forceRefresh);
    cachedIdTokenAt = Date.now();
    return cachedIdToken;
  } catch {
    return cachedIdToken;
  }
}

/** xhrSetup cho Hls.js: Hls tự tải /api/proxy/m3u8 bằng XHR nên phải gắn
 *  Authorization tại đây (thẻ video/fetch thường không chen vào được).
 *  Bỏ sót là phim không phát được (401). */
export function hlsXhrSetup(xhr: XMLHttpRequest, _url: string): void {
  try {
    if (cachedIdToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${cachedIdToken}`);
    }
  } catch {
    // ignore
  }
}

function isBackendUrl(url: string): boolean {
  if (url.startsWith('/api/')) return true;
  try {
    if (typeof window !== 'undefined') {
      const base = getApiBaseUrl();
      if (base && url.startsWith(base + '/api/')) return true;
      const origin = window.location.origin;
      if (origin && url.startsWith(origin + '/api/')) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function handleSessionExpired(): void {
  try {
    cachedIdToken = null;
    cachedIdTokenAt = 0;
    signOut(auth).catch(() => {});
  } catch {
    // ignore
  } finally {
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  }
}

export interface ApiFetchOptions {
  /** Thời gian chờ (ms). Mặc định không tự timeout (giữ hành vi fetch cũ). */
  timeoutMs?: number;
  /** Tự refresh token 1 lần khi gặp 401. Mặc định true. */
  retry401?: boolean;
}

export async function apiFetch(
  pathOrUrl: string,
  init: RequestInit = {},
  opts: ApiFetchOptions = {}
): Promise<Response> {
  const url = pathOrUrl.startsWith('/api/') ? getFullApiUrl(pathOrUrl) : pathOrUrl;
  const backend = isBackendUrl(url);
  const { timeoutMs, retry401 = true } = opts;

  const doFetch = async (token: string | null, signal?: AbortSignal): Promise<Response> => {
    const headers = new Headers(init.headers || {});
    if (backend && token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    // Prompt 4 B7: mọi request gửi kèm deviceId để server kiểm tra slot.
    // Thẻ <img> không dùng helper này nên /api/proxy/image giữ public.
    if (backend && !headers.has('X-Device-Id')) {
      try {
        headers.set('X-Device-Id', getDeviceId());
      } catch {
        // ignore
      }
    }
    return fetch(url, { ...init, headers, ...(signal ? { signal } : {}) });
  };

  const runWithTimeout = async (token: string | null, ms?: number): Promise<Response> => {
    if (!ms) return doFetch(token);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      if (init.signal) {
        if (init.signal.aborted) controller.abort();
        else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      return await doFetch(token, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await runWithTimeout(backend ? await getBackendToken() : null, timeoutMs);
  if (res.status === 409 && backend) {
    // Prompt 4 B7: thiết bị mất slot (vd admin ngắt phiên). Hiện màn hình
    // chặn, GIỮ ĐĂNG NHẬP (không signOut). Dùng clone để không nuốt body.
    try {
      const probe = await res.clone().json().catch(() => null);
      if (probe && (probe as any)?.error === 'NO_SESSION_SLOT') {
        try {
          window.dispatchEvent(new CustomEvent('gau:session-lost'));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    return res;
  }
  if (res.status === 401 && backend && retry401) {
    const fresh = await getBackendToken(true);
    res = await runWithTimeout(fresh, timeoutMs);
    if (res.status === 401) {
      // Chỉ đá về login khi request CÓ gửi token mà vẫn bị từ chối (= phiên thật
      // sự hết hạn). Request ẩn danh (chưa login) ăn 401 là bình thường — trả
      // response để caller đi fallback, TUYỆT ĐỐI không reload (reload ở đây
      // gây vòng lặp vô hạn vì fetchHomeData chạy ngay khi mở app).
      const sentToken = !!(fresh || cachedIdToken);
      if (sentToken) {
        handleSessionExpired();
        throw new Error('Phiên đăng nhập đã hết. Đang đưa về màn hình đăng nhập...');
      }
    }
  }
  return res;
}

/** apiFetch + parse JSON. Trả null khi !ok (trừ 401 đã xử lý: đá về login). */
export async function apiFetchJson<T = any>(
  pathOrUrl: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<T | null> {
  try {
    const res = await apiFetch(pathOrUrl, init, { timeoutMs });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      return null;
    }
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

