import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { get, ref } from 'firebase/database';
import { db, rtdb, handleFirestoreError, isFirestoreQuotaExhausted, markFirestoreQuotaExhausted, OperationType, sanitizeData } from './firebase';
import { UserActivityItem, UserStats, MediaActivityType, ActiveViewerSession, Account } from '../types';
import { authService } from './authService';

const HEARTBEAT_EXPIRATION_MS = 240 * 1000; // 4 minutes
const PENDING_STORAGE_KEY = 'gau_pending_analytics_v1';
const AUTO_FLUSH_INTERVAL_MS = 180 * 1000; // 3 minutes

function cleanDocId(raw: string): string {
  return raw.replace(/[\/\.#$\[\]\s]/g, '_').substring(0, 120);
}

export interface ActivityHeartbeatParams {
  accountId: string;
  accountDisplayName?: string;
  profileId?: string;
  profileName?: string;
  profileAvatar?: string;
  mediaType: MediaActivityType;
  contentId?: string;
  title?: string;
  subtitle?: string;
  coverUrl?: string;
  apiSource?: string;
  currentTime?: number;
  duration?: number;
  progressPercent?: number;
  isActivelyPlaying?: boolean;
  secondsElapsed: number;
}

interface PendingAccountStats {
  accountId: string;
  accountDisplayName?: string;
  onlineSeconds: number;
  watchSeconds: number;
  mediaSeconds: Record<MediaActivityType, number>;
  lastActiveItem?: {
    mediaType: MediaActivityType;
    title: string;
    subtitle?: string;
  };
  lastTimestamp: number;
}

class UserAnalyticsService {
  // In-memory accumulation buffer
  private pendingStats: Map<string, PendingAccountStats> = new Map();
  private pendingActivities: Map<string, UserActivityItem> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor() {
    this.restoreFromLocalStorage();
    this.startAutoFlushTimer();
  }

  private startAutoFlushTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      this.flushPendingAnalytics().catch(() => {});
    }, AUTO_FLUSH_INTERVAL_MS);
  }

  /**
   * Save accumulated pending analytics to localStorage to prevent data loss on tab close/crash
   */
  private persistToLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const statsArray = Array.from(this.pendingStats.values());
      const activitiesArray = Array.from(this.pendingActivities.values());
      if (statsArray.length === 0 && activitiesArray.length === 0) {
        localStorage.removeItem(PENDING_STORAGE_KEY);
        return;
      }
      const data = {
        stats: statsArray,
        activities: activitiesArray,
        savedAt: Date.now(),
      };
      localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota errors in localStorage
    }
  }

  /**
   * Restore any unsent analytics pending from previous session
   */
  public restoreFromLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = localStorage.getItem(PENDING_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.stats)) {
        data.stats.forEach((s: PendingAccountStats) => {
          if (s && s.accountId) {
            const existing = this.pendingStats.get(s.accountId);
            if (existing) {
              existing.onlineSeconds += s.onlineSeconds || 0;
              existing.watchSeconds += s.watchSeconds || 0;
              existing.mediaSeconds.movie = (existing.mediaSeconds.movie || 0) + (s.mediaSeconds?.movie || 0);
              existing.mediaSeconds.manga = (existing.mediaSeconds.manga || 0) + (s.mediaSeconds?.manga || 0);
              existing.mediaSeconds.youtube = (existing.mediaSeconds.youtube || 0) + (s.mediaSeconds?.youtube || 0);
              if (s.lastActiveItem) existing.lastActiveItem = s.lastActiveItem;
            } else {
              this.pendingStats.set(s.accountId, s);
            }
          }
        });
      }
      if (Array.isArray(data.activities)) {
        data.activities.forEach((a: UserActivityItem) => {
          if (a && a.id) {
            this.pendingActivities.set(a.id, a);
          }
        });
      }
    } catch (e) {
      void 0;
    }
  }

  /**
   * Record periodic heartbeat progress into local memory & localStorage buffer (0 Firestore writes)
   */
  recordActivityHeartbeat(params: ActivityHeartbeatParams): Promise<void> {
    const accountId = params.accountId || 'anonymous';
    const accountDisplayName = params.accountDisplayName || accountId;
    const profileId = params.profileId || 'default';
    const profileName = params.profileName || 'Hồ sơ 1';
    const mediaType = params.mediaType || 'browsing';
    const isActivelyPlaying = !!params.isActivelyPlaying;
    const seconds = Math.max(1, Math.min(300, params.secondsElapsed ?? 60));
    const now = Date.now();

    // 1. Accumulate Account Stats
    const current = this.pendingStats.get(accountId) || {
      accountId,
      accountDisplayName,
      onlineSeconds: 0,
      watchSeconds: 0,
      mediaSeconds: { movie: 0, manga: 0, youtube: 0, browsing: 0, anime: 0 },
      lastTimestamp: now,
    };

    current.onlineSeconds += seconds;
    current.lastTimestamp = now;
    if (accountDisplayName) current.accountDisplayName = accountDisplayName;

    if (isActivelyPlaying && mediaType !== 'browsing') {
      current.watchSeconds += seconds;
      current.mediaSeconds[mediaType] = (current.mediaSeconds[mediaType] || 0) + seconds;
      if (params.title) {
        current.lastActiveItem = {
          mediaType,
          title: params.title,
          subtitle: params.subtitle,
        };
      }
    }
    this.pendingStats.set(accountId, current);

    // 2. Buffer User Activity History Item
    if (params.contentId && params.title && mediaType !== 'browsing') {
      const cleanContentKey = cleanDocId(params.contentId);
      const activityId = `act_${accountId}_${profileId}_${mediaType}_${cleanContentKey}`;

      let progress = params.progressPercent;
      if (progress === undefined && params.duration && params.duration > 0 && params.currentTime !== undefined) {
        progress = Math.min(100, Math.round((params.currentTime / params.duration) * 100));
      }

      const existingActivity = this.pendingActivities.get(activityId);
      const watchedDuration = (existingActivity?.watchedDurationSeconds || 0) + (isActivelyPlaying ? seconds : 0);

      const activityItem: UserActivityItem = {
        id: activityId,
        accountId,
        accountDisplayName,
        profileId,
        profileName,
        profileAvatar: params.profileAvatar || '',
        mediaType,
        contentId: params.contentId,
        title: params.title,
        subtitle: params.subtitle || '',
        coverUrl: params.coverUrl || '',
        apiSource: params.apiSource || '',
        progressPercent: progress ?? existingActivity?.progressPercent ?? 0,
        currentTime: params.currentTime ?? existingActivity?.currentTime ?? 0,
        duration: params.duration ?? existingActivity?.duration ?? 0,
        watchedDurationSeconds: watchedDuration,
        firstStartedAt: existingActivity?.firstStartedAt || now,
        lastWatchedAt: now,
        deviceInfo: typeof window !== 'undefined' && window.innerWidth < 768 ? 'Mobile' : 'Desktop / Web',
        completed: (progress ?? 0) >= 90 || existingActivity?.completed || false,
      };

      this.pendingActivities.set(activityId, activityItem);
    }

    this.persistToLocalStorage();
    return Promise.resolve();
  }

  /**
   * Flush all locally accumulated analytics to Firestore using a single atomic writeBatch (0 reads required!)
   */
  async flushPendingAnalytics(): Promise<void> {
    if (this.isFlushing || isFirestoreQuotaExhausted()) return;
    if (this.pendingStats.size === 0 && this.pendingActivities.size === 0) return;

    this.isFlushing = true;
    try {
      const batch = writeBatch(db);
      const statsToFlush = Array.from(this.pendingStats.values());
      const activitiesToFlush = Array.from(this.pendingActivities.values());

      // 1. Prepare userStats updates using atomic increment() (0 reads needed!)
      for (const stat of statsToFlush) {
        if (stat.onlineSeconds <= 0 && stat.watchSeconds <= 0 && !stat.lastActiveItem) continue;
        const statsRef = doc(db, 'userStats', stat.accountId);
        const updatePayload: Record<string, any> = {
          accountId: stat.accountId,
          lastActiveAt: stat.lastTimestamp || Date.now(),
        };

        if (stat.accountDisplayName) {
          updatePayload.accountDisplayName = stat.accountDisplayName;
        }
        if (stat.onlineSeconds > 0) {
          updatePayload.totalOnlineSeconds = increment(stat.onlineSeconds);
        }
        if (stat.watchSeconds > 0) {
          updatePayload.totalWatchSeconds = increment(stat.watchSeconds);
        }
        if (stat.mediaSeconds.movie > 0) {
          updatePayload['watchSecondsByMedia.movie'] = increment(stat.mediaSeconds.movie);
        }
        if (stat.mediaSeconds.manga > 0) {
          updatePayload['watchSecondsByMedia.manga'] = increment(stat.mediaSeconds.manga);
        }
        if (stat.mediaSeconds.youtube > 0) {
          updatePayload['watchSecondsByMedia.youtube'] = increment(stat.mediaSeconds.youtube);
        }
        if (stat.lastActiveItem) {
          updatePayload.lastActiveItem = stat.lastActiveItem;
        }

        batch.set(statsRef, sanitizeData(updatePayload), { merge: true });
      }

      // 2. Prepare userActivityHistory updates
      for (const act of activitiesToFlush) {
        const actRef = doc(db, 'userActivityHistory', act.id);
        const actPayload = {
          ...act,
          watchedDurationSeconds: increment(act.watchedDurationSeconds || 0),
        };
        batch.set(actRef, sanitizeData(actPayload), { merge: true });
      }

      // 3. Atomic commit
      await batch.commit();

      // Clear memory buffer on success
      this.pendingStats.clear();
      this.pendingActivities.clear();
      this.persistToLocalStorage();
    } catch (e: any) {
      if (e?.code === 'resource-exhausted' || String(e).includes('Quota limit exceeded')) {
        markFirestoreQuotaExhausted();
      }
      void 0;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Fix corrupted userStats documents where increment() FieldValue objects were saved
   * as plain objects instead of being resolved by Firestore.
   */
  async fixCorruptedStats(): Promise<number> {
    if (isFirestoreQuotaExhausted()) return 0;
    try {
      const snap = await getDocs(query(collection(db, 'userStats'), limit(100)));
      let fixed = 0;
      const batch = writeBatch(db);

      for (const d of snap.docs) {
        const data = d.data() as any;
        const needsFix =
          (data.totalOnlineSeconds && typeof data.totalOnlineSeconds === 'object') ||
          (data.totalWatchSeconds && typeof data.totalWatchSeconds === 'object') ||
          (data.watchSecondsByMedia && typeof data.watchSecondsByMedia === 'object' &&
            Object.values(data.watchSecondsByMedia).some(v => typeof v === 'object'));

        if (needsFix) {
          const media = data.watchSecondsByMedia || {};
          const movie = typeof media.movie === 'number' ? media.movie : 0;
          const manga = typeof media.manga === 'number' ? media.manga : 0;
          const youtube = typeof media.youtube === 'number' ? media.youtube : 0;
          const mediaTotal = movie + manga + youtube;

          const fixedData: Record<string, any> = {
            totalOnlineSeconds: (typeof data.totalOnlineSeconds === 'number' ? data.totalOnlineSeconds : 0) || (mediaTotal > 0 ? mediaTotal + 300 : 0),
            totalWatchSeconds: (typeof data.totalWatchSeconds === 'number' ? data.totalWatchSeconds : 0) || mediaTotal,
            watchSecondsByMedia: { movie, manga, youtube },
          };

          batch.set(doc(db, 'userStats', d.id), fixedData, { merge: true });
          fixed++;
        }
      }

      if (fixed > 0) {
        await batch.commit();
        void 0;
      }
      return fixed;
    } catch (e) {
      void 0;
      return 0;
    }
  }

  /**
   * Fetch all user statistics combined with accounts list
   */
  async getAllUserStats(): Promise<UserStats[]> {
    if (isFirestoreQuotaExhausted()) return [];
    try {
      const [statsSnap, accounts, activeSessionsSnap] = await Promise.all([
        getDocs(query(collection(db, 'userStats'), limit(100))),
        authService.getAllAccounts(),
        get(ref(rtdb, 'activeSessions')),
      ]);

      const now = Date.now();
      const onlineAccountIds = new Set<string>();

      activeSessionsSnap.forEach((child) => {
        const data = child.val() as ActiveViewerSession;
        if (data && data.lastHeartbeat && now - data.lastHeartbeat < HEARTBEAT_EXPIRATION_MS) {
          onlineAccountIds.add(data.accountId);
        }
      });

      const statsMap = new Map<string, UserStats>();
      statsSnap.docs.forEach((d) => {
        const item = d.data() as UserStats;
        if (item && item.accountId) {
          statsMap.set(item.accountId, item);
        }
      });

      // Ensure every account in system is represented
      const result: UserStats[] = accounts.map((acc) => {
        const existing = statsMap.get(acc.id) || statsMap.get(acc.username);
        const isOnline = onlineAccountIds.has(acc.id) || onlineAccountIds.has(acc.username);

        if (existing) {
          return {
            ...existing,
            accountDisplayName: acc.displayName || existing.accountDisplayName || acc.username,
            isOnline,
          };
        }

        return {
          accountId: acc.id || acc.username,
          accountDisplayName: acc.displayName || acc.username,
          totalOnlineSeconds: 0,
          totalWatchSeconds: 0,
          watchSecondsByMedia: {
            movie: 0,
            manga: 0,
            youtube: 0,
          },
          totalSessions: 1,
          firstSeenAt: acc.createdAt || now,
          lastActiveAt: acc.createdAt || now,
          isOnline,
        };
      });

      // Include extra stats docs
      statsMap.forEach((val, key) => {
        if (!accounts.some((a) => a.id === key || a.username === key)) {
          result.push({
            ...val,
            isOnline: onlineAccountIds.has(key),
          });
        }
      });

      // Sort: Online first, then highest watch duration
      result.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
      });

      return result;
    } catch (e) {
      void 0;
      return [];
    }
  }

  /**
   * Subscribe to user statistics with debounce/throttle to avoid read storms
   */
  subscribeUserStats(callback: (stats: UserStats[]) => void): () => void {
    if (isFirestoreQuotaExhausted()) {
      callback([]);
      return () => {};
    }
    const colRef = query(collection(db, 'userStats'), limit(50));
    let throttleTimeout: NodeJS.Timeout | null = null;

    const unsubscribe = onSnapshot(
      colRef,
      () => {
        if (throttleTimeout) return;
        throttleTimeout = setTimeout(async () => {
          throttleTimeout = null;
          const fullStats = await this.getAllUserStats();
          callback(fullStats);
        }, 5000); // Throttle refresh to max once every 5 seconds
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'userStats');
      }
    );

    return () => {
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
        throttleTimeout = null;
      }
      unsubscribe();
    };
  }

  /**
   * Fetch historical user activity records with query limits
   */
  async getAllActivityHistory(options?: {
    accountId?: string;
    mediaType?: MediaActivityType | 'all';
    search?: string;
    maxLimit?: number;
  }): Promise<UserActivityItem[]> {
    if (isFirestoreQuotaExhausted()) return [];
    try {
      const q = query(
        collection(db, 'userActivityHistory'),
        orderBy('lastWatchedAt', 'desc'),
        limit(options?.maxLimit || 100)
      );
      const snap = await getDocs(q);

      let list: UserActivityItem[] = snap.docs.map((d) => d.data() as UserActivityItem);

      if (list.length === 0) {
        list = await this.aggregateLegacyHistory();
      }

      if (options?.accountId && options.accountId !== 'all') {
        list = list.filter((item) => item.accountId === options.accountId);
      }

      if (options?.mediaType && options.mediaType !== 'all') {
        list = list.filter((item) => item.mediaType === options.mediaType);
      }

      if (options?.search && options.search.trim()) {
        const queryText = options.search.toLowerCase().trim();
        list = list.filter(
          (item) =>
            item.title.toLowerCase().includes(queryText) ||
            item.accountDisplayName?.toLowerCase().includes(queryText) ||
            item.accountId.toLowerCase().includes(queryText) ||
            item.subtitle?.toLowerCase().includes(queryText)
        );
      }

      return list;
    } catch (e) {
      void 0;
      return [];
    }
  }

  /**
   * Subscribe to activity history updates with limit
   */
  subscribeActivityHistory(callback: (items: UserActivityItem[]) => void): () => void {
    if (isFirestoreQuotaExhausted()) {
      callback([]);
      return () => {};
    }
    const q = query(collection(db, 'userActivityHistory'), orderBy('lastWatchedAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as UserActivityItem);
        callback(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'userActivityHistory');
      }
    );
  }

  /**
   * Aggregate legacy watch history from accounts subcollections if needed
   */
  private async aggregateLegacyHistory(): Promise<UserActivityItem[]> {
    const aggregated: UserActivityItem[] = [];
    try {
      const accounts = await authService.getAllAccounts();
      for (const acc of accounts) {
        const profilesSnap = await getDocs(collection(db, 'accounts', acc.id, 'profiles'));
        for (const profDoc of profilesSnap.docs) {
          const profId = profDoc.id;
          const profData = profDoc.data();

          try {
            const histSnap = await getDocs(query(collection(db, 'accounts', acc.id, 'profiles', profId, 'history'), limit(20)));
            histSnap.docs.forEach((hDoc) => {
              const h = hDoc.data();
              const item: UserActivityItem = {
                id: `act_${acc.id}_${profId}_movie_${cleanDocId(h.movieSlug || hDoc.id)}`,
                accountId: acc.id,
                accountDisplayName: acc.displayName || acc.username,
                profileId: profId,
                profileName: profData.name || 'Hồ sơ',
                profileAvatar: profData.avatar || '',
                mediaType: 'movie',
                contentId: h.movieSlug || hDoc.id,
                title: h.movieName || 'Phim',
                subtitle: h.episodeName ? `Tập ${h.episodeName}` : undefined,
                coverUrl: h.moviePoster || h.movieThumb || '',
                apiSource: h.serverName || 'kkphim',
                progressPercent: h.progressPercent || 0,
                currentTime: h.currentTime || 0,
                duration: h.duration || 0,
                watchedDurationSeconds: Math.round(h.currentTime || 60),
                firstStartedAt: h.updatedAt || Date.now(),
                lastWatchedAt: h.updatedAt || Date.now(),
              };
              aggregated.push(item);
            });
          } catch {}
        }
      }
    } catch (e) {
      void 0;
    }
    return aggregated;
  }

  /**
   * One-click Sync & Aggregate all legacy history records to userActivityHistory and userStats using batching
   */
  async syncAndAggregateLegacyHistory(): Promise<{ totalRecords: number; totalAccounts: number }> {
    const legacyRecords = await this.aggregateLegacyHistory();
    const accountStatsMap = new Map<string, {
      totalWatchSeconds: number;
      movieSec: number;
      mangaSec: number;
      youtubeSec: number;
      lastWatched: number;
      lastItem?: { mediaType: MediaActivityType; title: string; subtitle?: string };
    }>();

    const batch = writeBatch(db);

    for (const record of legacyRecords) {
      try {
        const activityRef = doc(db, 'userActivityHistory', record.id);
        batch.set(activityRef, sanitizeData(record), { merge: true });

        const accId = record.accountId;
        const current = accountStatsMap.get(accId) || {
          totalWatchSeconds: 0,
          movieSec: 0,
          mangaSec: 0,
          youtubeSec: 0,
          lastWatched: 0,
        };

        const sec = record.watchedDurationSeconds || 60;
        current.totalWatchSeconds += sec;
        if (record.mediaType === 'movie') current.movieSec += sec;
        else if (record.mediaType === 'manga') current.mangaSec += sec;
        else if (record.mediaType === 'youtube') current.youtubeSec += sec;

        if (record.lastWatchedAt > current.lastWatched) {
          current.lastWatched = record.lastWatchedAt;
          current.lastItem = {
            mediaType: record.mediaType,
            title: record.title,
            subtitle: record.subtitle,
          };
        }

        accountStatsMap.set(accId, current);
      } catch (e) {
        void 0;
      }
    }

    // Update userStats documents in batch
    for (const [accId, data] of accountStatsMap.entries()) {
      try {
        const statsRef = doc(db, 'userStats', accId);
        const updated: Partial<UserStats> = {
          totalWatchSeconds: data.totalWatchSeconds,
          totalOnlineSeconds: data.totalWatchSeconds + 300,
          watchSecondsByMedia: {
            movie: data.movieSec,
            manga: data.mangaSec,
            youtube: data.youtubeSec,
          },
          lastActiveAt: data.lastWatched,
          lastActiveItem: data.lastItem,
        };

        batch.set(statsRef, sanitizeData(updated), { merge: true });
      } catch (e) {
        void 0;
      }
    }

    await batch.commit();
    return { totalRecords: legacyRecords.length, totalAccounts: accountStatsMap.size };
  }

  /**
   * Delete a single activity record
   */
  async deleteActivityRecord(activityId: string): Promise<void> {
    try {
      const docRef = doc(db, 'userActivityHistory', activityId);
      await deleteDoc(docRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `userActivityHistory/${activityId}`);
    }
  }

  /**
   * Clear all history records for a given account
   */
  async clearAccountActivities(accountId: string): Promise<void> {
    try {
      const colRef = collection(db, 'userActivityHistory');
      const snap = await getDocs(query(colRef, limit(100)));
      const batchDeletes = snap.docs
        .filter((d) => d.data().accountId === accountId)
        .map((d) => deleteDoc(d.ref));
      await Promise.all(batchDeletes);
    } catch (e) {
      void 0;
    }
  }
}

export const userAnalyticsService = new UserAnalyticsService();

export function formatDurationText(seconds?: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0 giây';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs} giờ ${mins > 0 ? `${mins} phút` : ''}`.trim();
  }
  if (mins > 0) {
    return `${mins} phút ${secs > 0 ? `${secs} giây` : ''}`.trim();
  }
  return `${secs} giây`;
}

export function formatDateTimeExact(timestamp?: number): string {
  if (!timestamp) return 'Chưa ghi nhận';
  const d = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  return `${hours}:${minutes}:${seconds} - ${day}/${month}/${year}`;
}

export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return 'Chưa từng';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 15) return 'Vừa xong';
  if (diffSec < 60) return `${diffSec} giây trước`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return `${Math.floor(diffDay / 30)} tháng trước`;
}

function getMediaTotal(stat: { watchSecondsByMedia?: { movie?: number; manga?: number; youtube?: number } }): number {
  const m = stat.watchSecondsByMedia;
  return (m?.movie || 0) + (m?.manga || 0) + (m?.youtube || 0);
}

export function getEffectiveTotalOnline(stat: UserStats): number {
  if (stat.totalOnlineSeconds && stat.totalOnlineSeconds > 0) return stat.totalOnlineSeconds;
  const media = getMediaTotal(stat);
  return media > 0 ? media + 300 : 0;
}

export function getEffectiveTotalWatch(stat: UserStats): number {
  if (stat.totalWatchSeconds && stat.totalWatchSeconds > 0) return stat.totalWatchSeconds;
  return getMediaTotal(stat);
}
