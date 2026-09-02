import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Movie, MovieEpisode, EpisodeServer } from '../types';

// Thời gian lưu: 7 ngày
export const OFFLINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface OfflineEpisodeFile {
  episodeSlug: string;
  episodeName: string;
  serverName: string;
  remoteUrl: string;
  localPath?: string; // relative path in Directory.Data
  localUri?: string; // Capacitor.convertFileSrc uri for playback
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number; // 0-100
  sizeBytes?: number;
  downloadedAt?: number;
  errorMsg?: string;
}

export interface OfflineSavedMovie {
  slug: string;
  name: string;
  origin_name: string;
  thumb_url: string;
  poster_url: string;
  year?: number;
  quality?: string;
  lang?: string;
  episode_current?: string;
  savedAt: number;
  expiresAt: number;
  movieSnapshot?: Movie;
  // Filesystem extension
  episodes?: OfflineEpisodeFile[];
  downloadStatus?: 'pending' | 'downloading' | 'completed' | 'error' | 'partial';
  totalSizeBytes?: number;
}

function getStorageKey(accountId: string, profileId: string): string {
  return `gau_offline_${accountId}_${profileId}`;
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function safeParse(raw: string | null): OfflineSavedMovie[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function loadRaw(accountId: string, profileId: string): OfflineSavedMovie[] {
  try {
    const key = getStorageKey(accountId, profileId);
    const raw = localStorage.getItem(key);
    return safeParse(raw);
  } catch {
    return [];
  }
}

function saveRaw(accountId: string, profileId: string, list: OfflineSavedMovie[]) {
  try {
    const key = getStorageKey(accountId, profileId);
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('gau_offline_changed', { detail: { accountId, profileId } }));
  } catch (e) {
    void 0;
  }
}

function filterExpired(list: OfflineSavedMovie[]): { valid: OfflineSavedMovie[]; expiredCount: number } {
  const now = Date.now();
  const valid = list.filter((m) => m.expiresAt > now);
  return { valid, expiredCount: list.length - valid.length };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
}

function getOfflineDir(accountId: string, profileId: string, movieSlug: string): string {
  return `offline/${sanitizeFileName(accountId)}_${sanitizeFileName(profileId)}/${sanitizeFileName(movieSlug)}`;
}

// Helper: ensure directory exists
async function ensureDir(path: string) {
  try {
    await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true });
  } catch (e) {
    // ignore if exists
  }
}

// Helper: delete file/directory
async function deletePath(path: string) {
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch {
    try {
      await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true });
    } catch {}
  }
}

// Download helper with progress, supports both direct file and HLS m3u8
async function downloadFileWithProgress(
  url: string,
  destPath: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  // Try native Filesystem.downloadFile if available (streams, no OOM)
  const anyFs = Filesystem as any;
  if (typeof anyFs.downloadFile === 'function') {
    try {
      await anyFs.downloadFile({
        path: destPath,
        url,
        directory: Directory.Data,
      });
      onProgress?.(100);
      return;
    } catch (e) {
      void 0;
    }
  }
  // Fallback: fetch + writeFile (may OOM for large files, but ok for demo)
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body?.getReader();
  if (!reader) {
    const blob = await res.blob();
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({ path: destPath, data: base64, directory: Directory.Data });
    onProgress?.(100);
    return;
  }
  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0) onProgress?.(Math.round((received / total) * 100));
    }
  }
  const totalLen = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  const base64 = uint8ToBase64(merged);
  await Filesystem.writeFile({ path: destPath, data: base64, directory: Directory.Data });
  onProgress?.(100);
}

function uint8ToBase64(u8: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// HLS download: fetch m3u8, save, download segments
async function downloadHls(
  hlsUrl: string,
  dirPath: string,
  episodeSlug: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  await ensureDir(dirPath);
  const m3u8Text = await fetch(hlsUrl).then(r => {
    if (!r.ok) throw new Error(`m3u8 fetch failed ${r.status}`);
    return r.text();
  });
  const lines = m3u8Text.split('\n');
  const segmentUrls: string[] = [];
  const baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // segment line
    let segUrl = trimmed;
    if (!segUrl.startsWith('http')) segUrl = baseUrl + segUrl;
    segmentUrls.push(segUrl);
  }
  // Save original m3u8 as local
  const localM3u8Path = `${dirPath}/${sanitizeFileName(episodeSlug)}.m3u8`;
  // Rewrite m3u8 to point to local segments
  let localM3u8 = m3u8Text;
  const segmentFileNames: string[] = [];
  for (let i = 0; i < segmentUrls.length; i++) {
    const segUrl = segmentUrls[i];
    const ext = segUrl.split('?')[0].split('.').pop() || 'ts';
    const fname = `seg_${i.toString().padStart(4, '0')}.${ext}`;
    segmentFileNames.push(fname);
    const segFileName = segUrl.split('/').pop() || fname;
    // replace remote seg url with local fname
    localM3u8 = localM3u8.split(segFileName).join(fname);
    // also handle full url
    localM3u8 = localM3u8.split(segUrl).join(fname);
  }
  await Filesystem.writeFile({ path: localM3u8Path, data: btoa(unescape(encodeURIComponent(localM3u8))), directory: Directory.Data });
  // Download segments sequentially with progress
  for (let i = 0; i < segmentUrls.length; i++) {
    const segUrl = segmentUrls[i];
    const fname = segmentFileNames[i];
    const segPath = `${dirPath}/${fname}`;
    try {
      await downloadFileWithProgress(segUrl, segPath, undefined);
    } catch (e) {
      void 0;
      // continue, not fatal
    }
    onProgress?.(Math.round(((i + 1) / segmentUrls.length) * 100));
  }
  return localM3u8Path;
}

export const offlineMovieService = {
  isSupported(): boolean {
    return isNative();
  },
  isNativeApp(): boolean {
    return isNative();
  },

  getAll(accountId: string, profileId: string): OfflineSavedMovie[] {
    const raw = loadRaw(accountId, profileId);
    const { valid, expiredCount } = filterExpired(raw);
    if (expiredCount > 0) {
      // also delete files for expired
      raw.filter(m => m.expiresAt <= Date.now()).forEach(m => {
        if (m.episodes) {
          m.episodes.forEach(ep => {
            if (ep.localPath) deletePath(ep.localPath);
          });
        }
        const dir = getOfflineDir(accountId, profileId, m.slug);
        deletePath(dir);
      });
      saveRaw(accountId, profileId, valid);
    }
    return valid.sort((a, b) => b.savedAt - a.savedAt);
  },

  isSaved(accountId: string, profileId: string, slug: string): boolean {
    const list = this.getAll(accountId, profileId);
    return list.some((m) => m.slug === slug);
  },

  save(accountId: string, profileId: string, movie: Movie): { success: boolean; already: boolean } {
    if (!isNative()) return { success: false, already: false };
    const list = this.getAll(accountId, profileId);
    if (list.some((m) => m.slug === movie.slug)) {
      return { success: false, already: true };
    }
    const now = Date.now();
    const item: OfflineSavedMovie = {
      slug: movie.slug,
      name: movie.name,
      origin_name: movie.origin_name,
      thumb_url: movie.thumb_url,
      poster_url: movie.poster_url,
      year: movie.year,
      quality: movie.quality,
      lang: movie.lang,
      episode_current: movie.episode_current,
      savedAt: now,
      expiresAt: now + OFFLINE_TTL_MS,
      movieSnapshot: movie,
      episodes: [],
      downloadStatus: 'pending',
    };
    const next = [item, ...list];
    saveRaw(accountId, profileId, next);
    return { success: true, already: false };
  },

  // New: download episode video via Filesystem (only mobile)
  async downloadEpisode(
    accountId: string,
    profileId: string,
    movie: Movie,
    episode: MovieEpisode,
    server: EpisodeServer,
    onProgress?: (pct: number, episodeSlug: string) => void
  ): Promise<{ success: boolean; localPath?: string; error?: string }> {
    if (!isNative()) return { success: false, error: 'Chỉ hỗ trợ trên App di động' };
    const remoteUrl = episode.link_m3u8 || episode.link_embed;
    if (!remoteUrl) return { success: false, error: 'Không có link video' };
    if (remoteUrl.includes('embed') || remoteUrl.includes('.html')) {
      return { success: false, error: 'Link embed không hỗ trợ tải offline, cần link m3u8' };
    }

    // Ensure movie is in saved list
    let list = this.getAll(accountId, profileId);
    let movieEntry = list.find(m => m.slug === movie.slug);
    if (!movieEntry) {
      this.save(accountId, profileId, movie);
      list = this.getAll(accountId, profileId);
      movieEntry = list.find(m => m.slug === movie.slug)!;
    }

    const dir = getOfflineDir(accountId, profileId, movie.slug);
    await ensureDir(dir);

    // Update status to downloading
    const episodes = movieEntry.episodes || [];
    let epFile = episodes.find(e => e.episodeSlug === episode.slug && e.serverName === server.server_name);
    if (!epFile) {
      epFile = {
        episodeSlug: episode.slug,
        episodeName: episode.name,
        serverName: server.server_name,
        remoteUrl,
        status: 'downloading',
        progress: 0,
      };
      episodes.push(epFile);
    } else {
      epFile.status = 'downloading';
      epFile.progress = 0;
    }
    movieEntry.episodes = episodes;
    movieEntry.downloadStatus = 'downloading';
    saveRaw(accountId, profileId, list);
    window.dispatchEvent(new CustomEvent('gau_offline_progress', { detail: { accountId, profileId, slug: movie.slug, episodeSlug: episode.slug, progress: 0 } }));

    try {
      let localPath: string;
      if (remoteUrl.includes('.m3u8')) {
        localPath = await downloadHls(remoteUrl, dir, episode.slug, (pct) => {
          epFile!.progress = pct;
          onProgress?.(pct, episode.slug);
          window.dispatchEvent(new CustomEvent('gau_offline_progress', { detail: { accountId, profileId, slug: movie.slug, episodeSlug: episode.slug, progress: pct } }));
          // throttle save
          if (pct % 10 === 0) {
            const curList = loadRaw(accountId, profileId);
            const curMovie = curList.find(m => m.slug === movie.slug);
            if (curMovie && curMovie.episodes) {
              const curEp = curMovie.episodes.find(e => e.episodeSlug === episode.slug);
              if (curEp) { curEp.progress = pct; saveRaw(accountId, profileId, curList); }
            }
          }
        });
      } else {
        const ext = remoteUrl.split('?')[0].split('.').pop() || 'mp4';
        localPath = `${dir}/${sanitizeFileName(episode.slug)}.${ext}`;
        await downloadFileWithProgress(remoteUrl, localPath, (pct) => {
          epFile!.progress = pct;
          onProgress?.(pct, episode.slug);
          window.dispatchEvent(new CustomEvent('gau_offline_progress', { detail: { accountId, profileId, slug: movie.slug, episodeSlug: episode.slug, progress: pct } }));
        });
      }

      // Get file uri for playback
      let localUri: string | undefined;
      try {
        const stat = await Filesystem.getUri({ path: localPath, directory: Directory.Data });
        localUri = Capacitor.convertFileSrc(stat.uri);
      } catch {
        localUri = undefined;
      }

      // Update completed
      const finalList = loadRaw(accountId, profileId);
      const finalMovie = finalList.find(m => m.slug === movie.slug);
      if (finalMovie && finalMovie.episodes) {
        const finalEp = finalMovie.episodes.find(e => e.episodeSlug === episode.slug && e.serverName === server.server_name);
        if (finalEp) {
          finalEp.localPath = localPath;
          finalEp.localUri = localUri;
          finalEp.status = 'completed';
          finalEp.progress = 100;
          finalEp.downloadedAt = Date.now();
          try {
            const stat = await Filesystem.stat({ path: localPath, directory: Directory.Data });
            finalEp.sizeBytes = Number(stat.size);
          } catch {}
        }
        const allDone = finalMovie.episodes.every(e => e.status === 'completed');
        finalMovie.downloadStatus = allDone ? 'completed' : 'partial';
        finalMovie.totalSizeBytes = finalMovie.episodes.reduce((a, e) => a + (e.sizeBytes || 0), 0);
        saveRaw(accountId, profileId, finalList);
      }
      window.dispatchEvent(new CustomEvent('gau_offline_progress', { detail: { accountId, profileId, slug: movie.slug, episodeSlug: episode.slug, progress: 100, done: true } }));
      return { success: true, localPath };
    } catch (e: any) {
      const errList = loadRaw(accountId, profileId);
      const errMovie = errList.find(m => m.slug === movie.slug);
      if (errMovie && errMovie.episodes) {
        const errEp = errMovie.episodes.find(ep => ep.episodeSlug === episode.slug);
        if (errEp) { errEp.status = 'error'; errEp.errorMsg = e?.message || 'Lỗi tải'; saveRaw(accountId, profileId, errList); }
      }
      return { success: false, error: e?.message || 'Lỗi tải video' };
    }
  },

  // Download whole movie (all episodes of first server) sequentially
  async downloadMovie(
    accountId: string,
    profileId: string,
    movie: Movie,
    server?: EpisodeServer,
    onProgress?: (overallPct: number, episodeSlug: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (!isNative()) return { success: false, error: 'Chỉ hỗ trợ trên App' };
    const targetServer = server || (movie as any).episodeServers?.[0] || (movie as any).episodes?.[0];
    // Try to get episodes from snapshot
    const snapshot = movie;
    // Attempt to find server data
    let episodes: MovieEpisode[] = [];
    let srv: EpisodeServer | undefined = server;
    // Fallback: if movie has episodes field
    if (!srv) {
      // try to use first server from movieSnapshot if available
      const anyMovie = movie as any;
      if (anyMovie.servers && anyMovie.servers[0]) {
        srv = anyMovie.servers[0];
        episodes = srv.server_data || [];
      }
    } else {
      episodes = srv.server_data || [];
    }
    if (!episodes.length) {
      // single episode fallback: treat movie as one episode
      const fakeEp: MovieEpisode = { name: movie.name, slug: movie.slug, link_m3u8: (movie as any).link_m3u8 || '', link_embed: '' } as any;
      if (!fakeEp.link_m3u8) return { success: false, error: 'Không tìm thấy link tập phim' };
      const res = await this.downloadEpisode(accountId, profileId, movie, fakeEp, srv || { server_name: 'default', server_data: [] } as any, onProgress ? (p, s) => onProgress(p, s) : undefined);
      return { success: res.success, error: res.error };
    }
    // Download each episode sequentially
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const overall = Math.round(((i) / episodes.length) * 100);
      onProgress?.(overall, ep.slug);
      const res = await this.downloadEpisode(accountId, profileId, movie, ep, srv!, (pct) => {
        const overall2 = Math.round(((i + pct / 100) / episodes.length) * 100);
        onProgress?.(overall2, ep.slug);
      });
      if (!res.success) {
        void 0;
        // continue to next
      }
    }
    onProgress?.(100, episodes[episodes.length - 1].slug);
    return { success: true };
  },

  async getEpisodeLocalUri(
    accountId: string,
    profileId: string,
    movieSlug: string,
    episodeSlug: string
  ): Promise<string | null> {
    if (!isNative()) return null;
    const list = this.getAll(accountId, profileId);
    const movie = list.find(m => m.slug === movieSlug);
    if (!movie || !movie.episodes) return null;
    const ep = movie.episodes.find(e => e.episodeSlug === episodeSlug && e.status === 'completed' && e.localPath);
    if (!ep || !ep.localPath) return null;
    try {
      // verify file exists
      await Filesystem.stat({ path: ep.localPath, directory: Directory.Data });
      if (ep.localUri) return ep.localUri;
      const uri = await Filesystem.getUri({ path: ep.localPath, directory: Directory.Data });
      return Capacitor.convertFileSrc(uri.uri);
    } catch {
      return null;
    }
  },

  isEpisodeDownloaded(accountId: string, profileId: string, movieSlug: string, episodeSlug: string): boolean {
    const list = this.getAll(accountId, profileId);
    const movie = list.find(m => m.slug === movieSlug);
    if (!movie || !movie.episodes) return false;
    return movie.episodes.some(e => e.episodeSlug === episodeSlug && e.status === 'completed');
  },

  getDownloadProgress(accountId: string, profileId: string, movieSlug: string, episodeSlug: string): number {
    const list = this.getAll(accountId, profileId);
    const movie = list.find(m => m.slug === movieSlug);
    if (!movie || !movie.episodes) return 0;
    const ep = movie.episodes.find(e => e.episodeSlug === episodeSlug);
    return ep?.progress || 0;
  },

  async removeEpisodeFile(accountId: string, profileId: string, movieSlug: string, episodeSlug: string): Promise<void> {
    const list = loadRaw(accountId, profileId);
    const movie = list.find(m => m.slug === movieSlug);
    if (!movie || !movie.episodes) return;
    const idx = movie.episodes.findIndex(e => e.episodeSlug === episodeSlug);
    if (idx >= 0) {
      const ep = movie.episodes[idx];
      if (ep.localPath) await deletePath(ep.localPath);
      // if m3u8, also delete segments (whole dir)
      movie.episodes.splice(idx, 1);
      if (movie.episodes.length === 0) {
        movie.downloadStatus = 'pending';
      }
      saveRaw(accountId, profileId, list);
    }
  },

  remove(accountId: string, profileId: string, slug: string): void {
    // also delete files
    const list = loadRaw(accountId, profileId);
    const movie = list.find(m => m.slug === slug);
    if (movie) {
      const dir = getOfflineDir(accountId, profileId, slug);
      deletePath(dir);
      if (movie.episodes) {
        movie.episodes.forEach(ep => { if (ep.localPath) deletePath(ep.localPath); });
      }
    }
    const next = list.filter((m) => m.slug !== slug);
    saveRaw(accountId, profileId, next);
  },

  clearAll(accountId: string, profileId: string): void {
    const list = loadRaw(accountId, profileId);
    list.forEach(m => {
      const dir = getOfflineDir(accountId, profileId, m.slug);
      deletePath(dir);
    });
    saveRaw(accountId, profileId, []);
  },

  cleanupExpired(accountId: string, profileId: string): number {
    const raw = loadRaw(accountId, profileId);
    const { valid, expiredCount } = filterExpired(raw);
    if (expiredCount > 0) {
      raw.filter(m => m.expiresAt <= Date.now()).forEach(m => {
        const dir = getOfflineDir(accountId, profileId, m.slug);
        deletePath(dir);
        if (m.episodes) m.episodes.forEach(ep => { if (ep.localPath) deletePath(ep.localPath); });
      });
      saveRaw(accountId, profileId, valid);
    }
    return expiredCount;
  },

  getRemainingMs(item: OfflineSavedMovie): number {
    return Math.max(0, item.expiresAt - Date.now());
  },

  formatRemaining(ms: number): string {
    if (ms <= 0) return 'Đã hết hạn';
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    if (days > 0) return `Còn ${days} ngày ${hours} giờ`;
    if (hours > 0) return `Còn ${hours} giờ`;
    const mins = Math.floor((totalSec % 3600) / 60);
    return `Còn ${mins} phút`;
  },

  formatSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  },

  subscribe(accountId: string, profileId: string, cb: (list: OfflineSavedMovie[]) => void): () => void {
    const handler = () => {
      cb(this.getAll(accountId, profileId));
    };
    window.addEventListener('gau_offline_changed', handler as EventListener);
    const storageHandler = (e: StorageEvent) => {
      if (e.key === getStorageKey(accountId, profileId)) handler();
    };
    window.addEventListener('storage', storageHandler);
    const progressHandler = () => handler();
    window.addEventListener('gau_offline_progress', progressHandler as EventListener);
    return () => {
      window.removeEventListener('gau_offline_changed', handler as EventListener);
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener('gau_offline_progress', progressHandler as EventListener);
    };
  },

  // Check if device is offline
  isOffline(): boolean {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  },
};
