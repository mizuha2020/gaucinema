/**
 * URL tải APK cho TV/box. Ưu tiên biến môi trường (set trong AI Studio Secrets),
 * fallback về Release tự động mà CI gắn mỗi lần push branch tv.
 */
const DEFAULT_APK_URL =
  'https://github.com/mizuha2020/qtb-movie/releases/download/tv-apk/app-debug.apk';

export function getApkDownloadUrl(): string {
  try {
    const envUrl = (import.meta as any).env?.VITE_APK_URL;
    if (typeof envUrl === 'string' && envUrl.trim()) return envUrl.trim();
  } catch {}
  return DEFAULT_APK_URL;
}
