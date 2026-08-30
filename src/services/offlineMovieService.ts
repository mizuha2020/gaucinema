import { Capacitor } from '@capacitor/core';
import { Movie } from '../types';

// Thời gian lưu: 7 ngày
export const OFFLINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  // snapshot full movie để phát lại không cần fetch
  movieSnapshot?: Movie;
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
    // notify listeners
    window.dispatchEvent(new CustomEvent('gau_offline_changed', { detail: { accountId, profileId } }));
  } catch (e) {
    console.error('[offlineMovieService] save error', e);
  }
}

// Lọc bỏ phim hết hạn
function filterExpired(list: OfflineSavedMovie[]): { valid: OfflineSavedMovie[]; expiredCount: number } {
  const now = Date.now();
  const valid = list.filter((m) => m.expiresAt > now);
  return { valid, expiredCount: list.length - valid.length };
}

export const offlineMovieService = {
  isSupported(): boolean {
    return isNative();
  },

  // Dùng để ẩn/hiện button - true nếu đang chạy trên APK
  isNativeApp(): boolean {
    return isNative();
  },

  getAll(accountId: string, profileId: string): OfflineSavedMovie[] {
    const raw = loadRaw(accountId, profileId);
    const { valid, expiredCount } = filterExpired(raw);
    if (expiredCount > 0) {
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
    };
    const next = [item, ...list];
    saveRaw(accountId, profileId, next);
    return { success: true, already: false };
  },

  remove(accountId: string, profileId: string, slug: string): void {
    const list = this.getAll(accountId, profileId);
    const next = list.filter((m) => m.slug !== slug);
    saveRaw(accountId, profileId, next);
  },

  clearAll(accountId: string, profileId: string): void {
    saveRaw(accountId, profileId, []);
  },

  // Gọi định kỳ để xóa hết hạn (dùng trong App.tsx)
  cleanupExpired(accountId: string, profileId: string): number {
    const raw = loadRaw(accountId, profileId);
    const { valid, expiredCount } = filterExpired(raw);
    if (expiredCount > 0) {
      saveRaw(accountId, profileId, valid);
    }
    return expiredCount;
  },

  // Tính thời gian còn lại (ms)
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

  // Lắng nghe thay đổi
  subscribe(accountId: string, profileId: string, cb: (list: OfflineSavedMovie[]) => void): () => void {
    const handler = () => {
      cb(this.getAll(accountId, profileId));
    };
    window.addEventListener('gau_offline_changed', handler as EventListener);
    // storage event cho multi-tab
    const storageHandler = (e: StorageEvent) => {
      if (e.key === getStorageKey(accountId, profileId)) handler();
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('gau_offline_changed', handler as EventListener);
      window.removeEventListener('storage', storageHandler);
    };
  },
};
