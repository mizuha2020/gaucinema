import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { getFullApiUrl } from './apiConfig';

/**
 * Prompt 7 PHẦN B: kiểm tra phiên bản cho bản native (APK cài trực tiếp,
 * không qua Play Store). Bản web bỏ qua hoàn toàn.
 *
 * Cùng 1 cuộc gọi phục vụ 2 việc:
 * - So versionCode hiện tại (App.getInfo().build) với /api/app/version.
 * - Probe kết nối: gọi lỗi/timeout lúc khởi động = server không tới được
 *   (màn hình lỗi A2), chứ không phải "đã là bản mới".
 */

export interface AppVersionInfo {
  latestVersionCode: number;
  latestVersionName: string;
  minSupportedVersionCode: number;
  apkUrl: string;
  releaseNotes: string;
}

export type UpdateCheck =
  | { state: 'skip' | 'ok' }
  | { state: 'offline' }
  | { state: 'optional'; info: AppVersionInfo }
  | { state: 'forced'; info: AppVersionInfo };

const SKIP_PREFIX = 'gau_update_skip_';

export function isNativeRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function checkAppUpdate(): Promise<UpdateCheck> {
  if (!isNativeRuntime()) return { state: 'skip' };
  let build = 0;
  try {
    const info = await CapApp.getInfo();
    build = parseInt(String(info?.build ?? ''), 10) || 0;
  } catch {
    return { state: 'skip' };
  }
  // Không đọc được versionCode (giả lập lạ) -> không chặn bừa.
  if (build <= 0) return { state: 'skip' };

  // Fetch tay thay vì safeFetchJson để phân biệt 3 trường hợp:
  // - mạng chết/timeout -> 'offline' (màn hình lỗi A2),
  // - server sống nhưng endpoint chưa có (backend cũ, 404/HTML) hoặc payload
  //   lạ -> 'ok' (fail-open: không bao giờ chặn app vì lý do parse),
  // - 200 JSON chuẩn -> so version như thường.
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }, 8000);
    try {
      res = await fetch(getFullApiUrl('/api/app/version'), { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { state: 'offline' };
  }
  if (!res || !res.ok) return { state: 'ok' };
  let data: AppVersionInfo | null = null;
  try {
    data = (await res.json()) as AppVersionInfo;
  } catch {
    return { state: 'ok' };
  }
  if (!data || !Number(data.latestVersionCode)) return { state: 'offline' };

  if (build < Number(data.minSupportedVersionCode || 0)) {
    return { state: 'forced', info: data };
  }
  if (build < Number(data.latestVersionCode)) {
    let skipped = false;
    try {
      skipped = window.localStorage.getItem(`${SKIP_PREFIX}${data.latestVersionCode}`) === '1';
    } catch {
      skipped = false;
    }
    if (!skipped) return { state: 'optional', info: data };
  }
  return { state: 'ok' };
}

/** Nhớ lựa chọn "Để sau" theo từng versionCode (không hỏi lại mỗi lần mở). */
export function dismissUpdate(versionCode: number): void {
  try {
    window.localStorage.setItem(`${SKIP_PREFIX}${versionCode}`, '1');
  } catch {
    // ignore
  }
}

/** Mở apkUrl bằng trình duyệt hệ thống (B4: KHÔNG tự cài, Android bắt xác nhận). */
export function openApkDownload(url: string): void {
  try {
    window.open(url, '_blank', 'noopener');
  } catch {
    // ignore
  }
}
