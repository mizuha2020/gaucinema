import { get, ref, remove, set } from 'firebase/database';
import { rtdb, sanitizeData } from './firebase';
import { firestoreStorage } from './firestoreStorage';
import type { EpisodeServer, Movie, MovieEpisode } from '../types';
import type { MangaChapter, MangaItem } from './mangaApi';

// ---------------------------------------------------------------------------
// Tiến độ xem 3 tầng (Prompt 6 PHẦN B) — Firestore chỉ ghi khi KẾT THÚC phiên.
// TẦNG 1 localStorage: miễn phí, ghi liên tục (5s), khôi phục cùng thiết bị.
// TẦNG 2 RTDB: không tính theo lượt ghi — đồng bộ 30s, xem tiếp đa thiết bị.
// TẦNG 3 Firestore: đắt nhất — chỉ ghi ở mốc kết thúc (đóng player, chuyển
//   tập/phim, pause >30s, rời trang), debounce 3s, bỏ qua nếu chênh <10s.
// ---------------------------------------------------------------------------

const T2_INTERVAL_MS = 30 * 1000;
const FLUSH_DEBOUNCE_MS = 3000;
const FLUSH_MIN_DELTA_S = 10;
const MAX_RTD_B_ITEMS = 50;

export interface MovieTick {
  movieSlug: string;
  movieName: string;
  episodeSlug: string;
  episodeName: string;
  serverName: string;
  currentTime: number;
  duration: number;
}

export interface MangaTick {
  mangaId: string;
  title: string;
  chapterId: string;
  chapterNumber: string;
  pageIndex: number;
  totalPages: number;
}

// Trạng thái tick mới nhất + mốc throttle/flush theo key (memory, theo phiên)
const lastT2At: Record<string, number> = {};
const lastFlushedPos: Record<string, number> = {};
const lastMangaTick: Record<string, { uid: string; profileId: string; manga: MangaItem; chapter: MangaChapter; pageIndex: number; totalPages: number }> = {};
const lastMovieTick: Record<string, { uid: string; profileId: string; movie: Movie; episode: MovieEpisode; server: EpisodeServer; currentTime: number; duration: number }> = {};

function movieKey(uid: string, pid: string, slug: string, ep: string): string {
  return `m:${uid}:${pid}:${slug}:${ep}`;
}

function mangaKey(uid: string, pid: string, id: string): string {
  return `g:${uid}:${pid}:${id}`;
}

function t1Key(uid: string, pid: string, kind: string, id: string): string {
  try {
    return `gau_prog_${uid}_${pid}_${kind}_${id}`;
  } catch {
    return '';
  }
}

function writeT1(key: string, data: Record<string, unknown>): void {
  if (!key) return;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify({ ...data, updatedAt: Date.now() }));
    }
  } catch {
    // ignore (đầy bộ nhớ thì thôi)
  }
}

function readT1<T>(key: string): (T & { updatedAt: number }) | null {
  if (!key) return null;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- Tầng 2: RTDB (movie) ---
async function writeT2Movie(
  uid: string,
  pid: string,
  tick: MovieTick & { title: string }
): Promise<void> {
  try {
    if (!rtdb) return;
    await set(
      ref(rtdb, `progress/${uid}/${pid}/${tick.movieSlug}`),
      sanitizeData({
        currentTime: Math.floor(tick.currentTime),
        duration: Math.floor(tick.duration),
        episodeSlug: tick.episodeSlug,
        episodeName: tick.episodeName,
        serverName: tick.serverName,
        title: tick.title,
        updatedAt: Date.now(),
      })
    ).catch(() => {});
  } catch {
    // ignore
  }
}

async function writeT2Manga(uid: string, pid: string, tick: MangaTick): Promise<void> {
  try {
    if (!rtdb) return;
    await set(
      ref(rtdb, `progress_manga/${uid}/${pid}/${tick.mangaId}`),
      sanitizeData({
        pageIndex: tick.pageIndex,
        totalPages: tick.totalPages,
        chapterId: tick.chapterId,
        chapterNumber: tick.chapterNumber,
        title: tick.title,
        updatedAt: Date.now(),
      })
    ).catch(() => {});
  } catch {
    // ignore
  }
}

/** Dọn rác RTDB: mỗi hồ sơ giữ tối đa 50 mục gần nhất (trần 1GB). Gọi khi bắt đầu phát. */
export async function pruneProgress(uid: string, pid: string, manga = false): Promise<void> {
  try {
    if (!rtdb || !uid || !pid) return;
    const base = manga ? 'progress_manga' : 'progress';
    const snap = await get(ref(rtdb, `${base}/${uid}/${pid}`)).catch(() => null);
    const val = snap?.val() as Record<string, { updatedAt?: number }> | null;
    if (!val) return;
    const keys = Object.keys(val);
    if (keys.length <= MAX_RTD_B_ITEMS) return;
    keys
      .sort((a, b) => (val[a]?.updatedAt || 0) - (val[b]?.updatedAt || 0))
      .slice(0, keys.length - MAX_RTD_B_ITEMS)
      .forEach((k) => {
        remove(ref(rtdb, `${base}/${uid}/${pid}/${k}`)).catch(() => {});
      });
  } catch {
    // ignore
  }
}

/** Tick phim (gọi mỗi ~5s trong lúc phát): T1 luôn, T2 mỗi 30s. KHÔNG Firestore. */
export function tickMovie(
  uid: string,
  pid: string,
  movie: Movie,
  episode: MovieEpisode,
  server: EpisodeServer,
  currentTime: number,
  duration: number
): void {
  if (!uid || !pid || !movie?.slug) return;
  const key = movieKey(uid, pid, movie.slug, episode?.slug || '');
  const now = Date.now();
  lastMovieTick[key] = { uid, profileId: pid, movie, episode, server, currentTime, duration };
  writeT1(t1Key(uid, pid, 'm', `${movie.slug}:${episode?.slug || ''}`), {
    currentTime,
    duration,
  });
  if (!lastT2At[key] || now - lastT2At[key] >= T2_INTERVAL_MS) {
    lastT2At[key] = now;
    void writeT2Movie(uid, pid, {
      movieSlug: movie.slug,
      movieName: movie.name,
      episodeSlug: episode?.slug || '',
      episodeName: episode?.name || '',
      serverName: server?.server_name || '',
      currentTime,
      duration,
      title: episode?.name ? `${movie.name} — ${episode.name}` : movie.name,
    });
  }
}

/** Tick truyện (gọi khi đổi trang/chương): T1 luôn, T2 mỗi 30s. KHÔNG Firestore. */
export function tickManga(
  uid: string,
  pid: string,
  manga: MangaItem,
  chapter: MangaChapter,
  pageIndex: number,
  totalPages: number
): void {
  if (!uid || !pid || !manga?.id) return;
  const key = mangaKey(uid, pid, manga.id);
  const now = Date.now();
  lastMangaTick[key] = { uid, profileId: pid, manga, chapter, pageIndex, totalPages };
  void tickMangaT2(uid, pid, {
    mangaId: manga.id,
    title: manga.title,
    chapterId: chapter?.id || '',
    chapterNumber: chapter?.chapterNumber || '',
    pageIndex,
    totalPages,
  });
}

function tickMangaT2(uid: string, pid: string, tick: MangaTick): void {
  const key = mangaKey(uid, pid, tick.mangaId);
  const now = Date.now();
  writeT1(t1Key(uid, pid, 'g', tick.mangaId), {
    pageIndex: tick.pageIndex,
    totalPages: tick.totalPages,
    chapterId: tick.chapterId,
  });
  if (!lastT2At[key] || now - lastT2At[key] >= T2_INTERVAL_MS) {
    lastT2At[key] = now;
    void writeT2Manga(uid, pid, tick);
  }
}

async function doFlushMovie(
  uid: string,
  pid: string,
  movie: Movie,
  episode: MovieEpisode,
  server: EpisodeServer
): Promise<boolean> {
  const key = movieKey(uid, pid, movie.slug, episode?.slug || '');
  const tick = lastMovieTick[key];
  const t = tick ? tick.currentTime : 0;
  const d = tick ? tick.duration : 0;
  if (!(t > 0) || !(d > 0)) return false;
  // Bỏ qua nếu chênh <10s so với lần ghi trước
  const prevPos = lastFlushedPos[key];
  if (prevPos !== undefined && Math.abs(t - prevPos) < FLUSH_MIN_DELTA_S) {
    return false;
  }
  try {
    await firestoreStorage.saveWatchProgress(uid, pid, {
      id: `${movie.slug}_${episode?.slug || ''}`,
      movieSlug: movie.slug,
      movieName: movie.name,
      movieOriginName: movie.origin_name,
      movieThumb: movie.thumb_url,
      moviePoster: movie.poster_url,
      episodeName: episode?.name || '',
      episodeSlug: episode?.slug || '',
      serverName: server?.server_name || '',
      linkM3u8: episode?.link_m3u8 || '',
      currentTime: Math.floor(t),
      duration: Math.floor(d),
      progressPercent: d > 0 ? Math.min(100, Math.round((t / d) * 100)) : 0,
    });
    lastFlushedPos[key] = t;
    // Đồng bộ T1/T2 lần cuối để đa thiết bị thấy ngay
    writeT1(t1Key(uid, pid, 'm', `${movie.slug}:${episode?.slug || ''}`), {
      currentTime: t,
      duration: d,
    });
    await writeT2Movie(uid, pid, {
      movieSlug: movie.slug,
      movieName: movie.name,
      episodeSlug: episode?.slug || '',
      episodeName: episode?.name || '',
      serverName: server?.server_name || '',
      currentTime: t,
      duration: d,
      title: episode?.name ? `${movie.name} — ${episode.name}` : movie.name,
    });
    return true;
  } catch {
    return false;
  }
}

async function doFlushManga(
  uid: string,
  pid: string,
  manga: MangaItem,
  chapter: MangaChapter
): Promise<boolean> {
  const key = mangaKey(uid, pid, manga.id);
  const tick = lastMangaTick[key];
  if (!tick) return false;
  try {
    await firestoreStorage.saveMangaProgress(uid, pid, {
      mangaId: manga.id,
      source: manga.source,
      title: manga.title,
      coverUrl: manga.coverUrl,
      chapterId: tick.chapter.id,
      chapterNumber: tick.chapter.chapterNumber || '',
      chapterTitle: tick.chapter.title,
      pageIndex: tick.pageIndex,
      totalPages: tick.totalPages,
      timestamp: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Flush Tầng 3 cho mọi tick đang chờ của hồ sơ (debounce 3s).
 * Gọi ở: đóng player, chuyển tập/phim, pause, rời trang.
 * Trả về true nếu có ghi Firestore (caller refresh "Xem tiếp" 1 lần).
 */
const pendingPromise: Record<string, Promise<boolean>> = {};

export function flushPending(uid: string, pid: string): Promise<boolean> {
  const key = `f:${uid}:${pid}`;
  const running = pendingPromise[key];
  if (running) return running;
  const p = new Promise<boolean>((resolve) => {
    setTimeout(async () => {
      let wrote = false;
      try {
        for (const k of Object.keys(lastMovieTick)) {
          if (!k.startsWith(`m:${uid}:${pid}:`)) continue;
          const t = lastMovieTick[k];
          if (await doFlushMovie(uid, pid, t.movie, t.episode, t.server)) wrote = true;
        }
        for (const k of Object.keys(lastMangaTick)) {
          if (!k.startsWith(`g:${uid}:${pid}:`)) continue;
          const t = lastMangaTick[k];
          if (await doFlushManga(uid, pid, t.manga, t.chapter)) wrote = true;
        }
      } catch {
        // ignore
      } finally {
        delete pendingPromise[key];
        resolve(wrote);
      }
    }, FLUSH_DEBOUNCE_MS);
  });
  pendingPromise[key] = p;
  return p;
}

/**
 * Đọc mốc resume theo thứ tự ưu tiên: localStorage -> RTDB (nếu mới hơn) ->
 * null (caller tự lấy tiếp từ Firestore history).
 */
export async function readResumeMovie(
  uid: string,
  pid: string,
  movieSlug: string,
  episodeSlug: string
): Promise<{ currentTime: number; updatedAt: number } | null> {
  const t1 = readT1<{ currentTime: number }>(t1Key(uid, pid, 'm', `${movieSlug}:${episodeSlug}`));
  let best = t1 && t1.currentTime > 0 ? { currentTime: t1.currentTime, updatedAt: t1.updatedAt || 0 } : null;
  try {
    if (rtdb && uid && pid) {
      const snap = await get(ref(rtdb, `progress/${uid}/${pid}/${movieSlug}`)).catch(() => null);
      const v = snap?.val() as { currentTime?: number; updatedAt?: number } | null;
      if (v && (v.currentTime || 0) > 0 && (v.updatedAt || 0) > (best?.updatedAt || 0)) {
        best = { currentTime: v.currentTime as number, updatedAt: v.updatedAt as number };
      }
    }
  } catch {
    // ignore
  }
  return best;
}

export async function readResumeManga(
  uid: string,
  pid: string,
  mangaId: string
): Promise<{ pageIndex: number; updatedAt: number } | null> {
  const t1 = readT1<{ pageIndex: number }>(t1Key(uid, pid, 'g', mangaId));
  let best = t1 && (t1.pageIndex || 0) >= 0 ? { pageIndex: t1.pageIndex, updatedAt: t1.updatedAt || 0 } : null;
  try {
    if (rtdb && uid && pid) {
      const snap = await get(ref(rtdb, `progress_manga/${uid}/${pid}/${mangaId}`)).catch(() => null);
      const v = snap?.val() as { pageIndex?: number; updatedAt?: number } | null;
      if (v && (v.updatedAt || 0) > (best?.updatedAt || 0)) {
        best = { pageIndex: v.pageIndex || 0, updatedAt: v.updatedAt as number };
      }
    }
  } catch {
    // ignore
  }
  return best;
}
