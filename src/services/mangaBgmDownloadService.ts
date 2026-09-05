import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { CLOUD_BACKEND_URL, getFullApiUrl, isNativeApp } from './apiConfig';

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

function cleanSrc(remoteSrc: string): string {
  return remoteSrc.startsWith('/') ? remoteSrc : `/${remoteSrc}`;
}

/**
 * Các URL ứng viên theo thứ tự ưu tiên:
 * 1. primary (custom backend / VITE_API_URL / cloud mặc định)
 * 2. CLOUD_BACKEND_URL trực tiếp (phòng custom backend thiếu file /sounds)
 * 3. relative (chỉ có nghĩa trên web/dev)
 */
export function candidateBgmUrls(remoteSrc: string): string[] {
  const clean = cleanSrc(remoteSrc);
  const list: string[] = [];
  const primary = getFullApiUrl(remoteSrc);
  if (primary) list.push(primary);
  try {
    const cloud = `${CLOUD_BACKEND_URL}${clean}`;
    if (!list.includes(cloud)) list.push(cloud);
  } catch {}
  if (!list.includes(clean)) list.push(clean);
  return list;
}

async function urlReachable(url: string, timeoutMs = 6000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      if (res.ok) return true;
      // Một số host chặn HEAD -> thử GET 1 byte
      if (res.status === 403 || res.status === 405) {
        const res2 = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: ctrl.signal });
        return res2.ok;
      }
      return false;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return false;
  }
}

const BASE_OK_KEY = 'manga_bgm_base_ok_v1';

/**
 * Tìm URL stream sống (check song song, ưu tiên theo thứ tự).
 * Dùng cho download. Playback thì dùng multi-source nên không cần đợi.
 */
export async function resolveBgmStreamUrl(remoteSrc: string): Promise<string> {
  const candidates = candidateBgmUrls(remoteSrc);
  // Fast path: base đã verified trước đó
  try {
    const saved = localStorage.getItem(BASE_OK_KEY);
    if (saved) {
      const hit = candidates.find((u) => u.startsWith(saved));
      if (hit && (await urlReachable(hit, 5000))) return hit;
    }
  } catch {}
  const results = await Promise.all(candidates.map((u) => urlReachable(u)));
  const idx = results.findIndex(Boolean);
  const pick = idx >= 0 ? candidates[idx] : candidates[0] || remoteSrc;
  if (idx >= 0) {
    try {
      const base = pick.slice(0, pick.length - cleanSrc(remoteSrc).length);
      if (base) localStorage.setItem(BASE_OK_KEY, base);
    } catch {}
  }
  return pick;
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
  // Tìm URL sống trước (phòng custom backend thiếu file)
  const url = await resolveBgmStreamUrl(remoteSrc);
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
 * Danh sách source để phát: file offline nếu có, ngược lại toàn bộ URL ứng
 * viên. <audio> sẽ tự thử từng <source> khi gặp lỗi nên không cần preflight
 * (tránh CORS false-negative + phát ngay không đợi).
 */
export async function resolveBgmPlaybackSources(trackId: string, remoteSrc: string): Promise<string[]> {
  if (isBgmDownloadSupported()) {
    try {
      if (await isBgmDownloaded(trackId, remoteSrc)) {
        return [await toLocalPlayUrl(bgmFilePath(remoteSrc))];
      }
    } catch {}
  }
  return candidateBgmUrls(remoteSrc);
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
