import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { getFullApiUrl, isNativeApp } from './apiConfig';

// Nhạc nền manga (BGM) KHÔNG còn nhúng trong APK để giảm dung lượng.
// - Mặc định: stream trực tiếp từ backend (getFullApiUrl trên native).
// - Ai có nhu cầu: bấm tải về máy (Filesystem, Directory.Data) để nghe
//   offline, và xóa được khi không cần nữa.

export interface BgmDownloadInfo {
  sizeBytes?: number;
  downloadedAt: number;
}

const BGM_DIR = 'sounds';
const STORE_KEY = 'manga_bgm_downloads_v1';

/** Chỉ APK native mới hỗ trợ tải/xóa file (cần Filesystem). Web nghe online. */
export function isBgmDownloadSupported(): boolean {
  try {
    return isNativeApp() && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** URL stream: native -> absolute backend URL, web -> relative path. */
export function getBgmStreamUrl(remoteSrc: string): string {
  return getFullApiUrl(remoteSrc);
}

function fileNameOf(remoteSrc: string): string {
  const base = (remoteSrc || '').split('?')[0].split('/').pop() || 'track.mp3';
  return base.replace(/[^a-zA-Z0-9-_.]/g, '_');
}

export function bgmFilePath(remoteSrc: string): string {
  return `${BGM_DIR}/${fileNameOf(remoteSrc)}`;
}

function loadMap(): Record<string, BgmDownloadInfo> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, BgmDownloadInfo>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {}
}

export function getBgmDownloadInfo(trackId: string): BgmDownloadInfo | null {
  return loadMap()[trackId] || null;
}

function uint8ToBase64(u8: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Kiểm tra file tải về còn tồn tại không (dọn state cũ nếu mất file). */
export async function isBgmDownloaded(trackId: string, remoteSrc: string): Promise<boolean> {
  if (!isBgmDownloadSupported()) return false;
  const info = getBgmDownloadInfo(trackId);
  if (!info) return false;
  try {
    await Filesystem.stat({ path: bgmFilePath(remoteSrc), directory: Directory.Data });
    return true;
  } catch {
    const map = loadMap();
    delete map[trackId];
    saveMap(map);
    return false;
  }
}

/** Tải track về máy, trả về URL phát được (convertFileSrc). */
export async function downloadBgmTrack(
  trackId: string,
  remoteSrc: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const url = getBgmStreamUrl(remoteSrc);
  const destPath = bgmFilePath(remoteSrc);
  try {
    await Filesystem.mkdir({ path: BGM_DIR, directory: Directory.Data, recursive: true });
  } catch {}

  const anyFs = Filesystem as any;
  if (typeof anyFs.downloadFile === 'function') {
    try {
      await anyFs.downloadFile({ path: destPath, url, directory: Directory.Data });
      onProgress?.(100);
      await saveDownloadRecord(trackId, destPath);
      return await toLocalPlayUrl(destPath);
    } catch (e) {
      // rớt xuống fallback fetch bên dưới
    }
  }

  // Fallback: fetch rồi ghi base64 (mp3 5-9MB, chấp nhận được)
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải thất bại (HTTP ${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  await Filesystem.writeFile({ path: destPath, data: uint8ToBase64(buf), directory: Directory.Data });
  onProgress?.(100);
  await saveDownloadRecord(trackId, destPath, buf.length);
  return await toLocalPlayUrl(destPath);
}

/** Xóa file đã tải + state. */
export async function deleteBgmDownload(trackId: string, remoteSrc: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: bgmFilePath(remoteSrc), directory: Directory.Data });
  } catch {}
  const map = loadMap();
  delete map[trackId];
  saveMap(map);
}

async function saveDownloadRecord(trackId: string, destPath: string, knownSize?: number) {
  const info: BgmDownloadInfo = { downloadedAt: Date.now() };
  if (typeof knownSize === 'number') {
    info.sizeBytes = knownSize;
  } else {
    try {
      const st = await Filesystem.stat({ path: destPath, directory: Directory.Data });
      if (typeof (st as any)?.size === 'number') info.sizeBytes = (st as any).size;
    } catch {}
  }
  const map = loadMap();
  map[trackId] = info;
  saveMap(map);
}

/** file:// uri -> URL phát được trong WebView. */
async function toLocalPlayUrl(destPath: string): Promise<string> {
  const st = await Filesystem.getUri({ path: destPath, directory: Directory.Data });
  return Capacitor.convertFileSrc(st.uri);
}

/**
 * URL phát thực tế: ưu tiên file đã tải (offline), còn không thì stream.
 * Luôn verify file tồn tại trước khi dùng.
 */
export async function resolveBgmPlayUrl(trackId: string, remoteSrc: string): Promise<string> {
  const streamUrl = getBgmStreamUrl(remoteSrc);
  if (!isBgmDownloadSupported()) return streamUrl;
  const ok = await isBgmDownloaded(trackId, remoteSrc);
  if (!ok) return streamUrl;
  try {
    return await toLocalPlayUrl(bgmFilePath(remoteSrc));
  } catch {
    return streamUrl;
  }
}
