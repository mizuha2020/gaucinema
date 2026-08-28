import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  DocumentSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { db, handleFirestoreError, isFirestoreQuotaExhausted, OperationType, sanitizeData } from './firebase';
import { UserActivityItem, MediaActivityType } from '../types';

const HISTORY_COLLECTION = 'userActivityHistory';
const PAGE_SIZE = 20;

function cleanDocId(raw: string): string {
  return raw.replace(/[\/\.#$\[\]\s]/g, '_').substring(0, 120);
}

export interface PaginatedHistory {
  items: UserActivityItem[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
  total: number;
}

class WatchHistoryService {
  /**
   * Ghi lại lịch sử xem (gọi khi pause, switch tập, đóng phim)
   */
  async recordWatch(params: {
    accountId: string;
    accountDisplayName: string;
    profileId: string;
    profileName: string;
    profileAvatar?: string;
    mediaType: MediaActivityType;
    contentId: string;
    title: string;
    subtitle?: string;
    coverUrl?: string;
    apiSource?: string;
    currentTime?: number;
    duration?: number;
    progressPercent?: number;
    watchedDurationSeconds?: number;
  }): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;

    try {
      const activityId = `act_${params.accountId}_${params.profileId}_${params.mediaType}_${cleanDocId(params.contentId)}`;
      const now = Date.now();

      // Check if exists
      const existingDoc = await getDoc(doc(db, HISTORY_COLLECTION, activityId));
      const existing = existingDoc.exists() ? existingDoc.data() as UserActivityItem : null;

      const activityData: Partial<UserActivityItem> = {
        id: activityId,
        accountId: params.accountId,
        accountDisplayName: params.accountDisplayName,
        profileId: params.profileId,
        profileName: params.profileName,
        profileAvatar: params.profileAvatar || '',
        mediaType: params.mediaType,
        contentId: params.contentId,
        title: params.title,
        subtitle: params.subtitle || '',
        coverUrl: params.coverUrl || '',
        apiSource: params.apiSource || '',
        currentTime: params.currentTime ?? existing?.currentTime ?? 0,
        duration: params.duration ?? existing?.duration ?? 0,
        progressPercent: params.progressPercent ?? existing?.progressPercent ?? 0,
        watchedDurationSeconds: (existing?.watchedDurationSeconds || 0) + (params.watchedDurationSeconds || 0),
        firstStartedAt: existing?.firstStartedAt || now,
        lastWatchedAt: now,
        deviceInfo: typeof window !== 'undefined' && window.innerWidth < 768 ? 'Mobile' : 'Desktop / Web',
        completed: (params.progressPercent ?? 0) >= 90 || existing?.completed || false,
      };

      await setDoc(doc(db, HISTORY_COLLECTION, activityId), sanitizeData(activityData), { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, HISTORY_COLLECTION);
    }
  }

  /**
   * Lấy lịch sử xem có phân trang (server-side)
   */
  async getHistoryPaginated(options?: {
    accountId?: string;
    mediaType?: MediaActivityType;
    pageSize?: number;
    lastDoc?: DocumentSnapshot | null;
  }): Promise<PaginatedHistory> {
    if (isFirestoreQuotaExhausted()) {
      return { items: [], lastDoc: null, hasMore: false, total: 0 };
    }

    try {
      // Build query constraints in correct order: where first, then orderBy, then limit
      const constraints: QueryConstraint[] = [];

      if (options?.accountId && options.accountId !== 'all') {
        constraints.push(where('accountId', '==', options.accountId));
      }

      if (options?.mediaType) {
        constraints.push(where('mediaType', '==', options.mediaType));
      }

      constraints.push(orderBy('lastWatchedAt', 'desc'));
      constraints.push(limit((options?.pageSize || PAGE_SIZE) + 1));

      if (options?.lastDoc) {
        constraints.push(startAfter(options.lastDoc));
      }

      const q = query(collection(db, HISTORY_COLLECTION), ...constraints);
      const snapshot = await getDocs(q);

      const items: UserActivityItem[] = [];
      let lastDoc: DocumentSnapshot | null = null;
      const hasExtra = snapshot.docs.length > (options?.pageSize || PAGE_SIZE);

      snapshot.docs.slice(0, options?.pageSize || PAGE_SIZE).forEach((doc) => {
        items.push(doc.data() as UserActivityItem);
        lastDoc = doc;
      });

      // Estimate total from current page (avoid fetching entire collection)
      let total = items.length;

      return {
        items,
        lastDoc,
        hasMore: hasExtra,
        total,
      };
    } catch (e) {
      console.warn('Failed to fetch paginated history:', e);
      // Fallback: try without complex query
      try {
        const simpleQuery = query(
          collection(db, HISTORY_COLLECTION),
          orderBy('lastWatchedAt', 'desc'),
          limit(options?.pageSize || PAGE_SIZE)
        );
        const snapshot = await getDocs(simpleQuery);
        const items = snapshot.docs.map(doc => doc.data() as UserActivityItem);
        return { items, lastDoc: null, hasMore: false, total: items.length };
      } catch (e2) {
        handleFirestoreError(e2, OperationType.LIST, HISTORY_COLLECTION);
        return { items: [], lastDoc: null, hasMore: false, total: 0 };
      }
    }
  }

  /**
   * Tìm kiếm lịch sử theo tên phim
   */
  async searchHistory(searchText: string, options?: {
    accountId?: string;
    pageSize?: number;
  }): Promise<UserActivityItem[]> {
    if (isFirestoreQuotaExhausted()) return [];

    try {
      const constraints: QueryConstraint[] = [
        orderBy('lastWatchedAt', 'desc'),
        limit(100), // Fetch more for client-side search
      ];

      // NOTE: Avoid combining where('accountId') + orderBy here — that requires a
      // Firestore composite index. Filter accountId client-side instead.
      const q = query(collection(db, HISTORY_COLLECTION), ...constraints);
      const snapshot = await getDocs(q);

      const searchLower = searchText.toLowerCase();
      return snapshot.docs
        .map((doc) => doc.data() as UserActivityItem)
        .filter((item) =>
          (!options?.accountId || options.accountId === 'all' || item.accountId === options.accountId) &&
          (item.title?.toLowerCase().includes(searchLower) ||
            item.subtitle?.toLowerCase().includes(searchLower) ||
            item.accountDisplayName?.toLowerCase().includes(searchLower))
        )
        .slice(0, options?.pageSize || PAGE_SIZE);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, HISTORY_COLLECTION);
      return [];
    }
  }

  /**
   * Xóa một bản ghi lịch sử
   */
  async deleteRecord(activityId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;

    try {
      await deleteDoc(doc(db, HISTORY_COLLECTION, activityId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${HISTORY_COLLECTION}/${activityId}`);
    }
  }

  /**
   * Xóa tất cả lịch sử của một account
   */
  async clearAccountHistory(accountId: string): Promise<void> {
    if (isFirestoreQuotaExhausted()) return;

    try {
      let hasMore = true;
      while (hasMore) {
        const q = query(collection(db, HISTORY_COLLECTION), where('accountId', '==', accountId), limit(100));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          hasMore = false;
          break;
        }
        await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
        if (snapshot.docs.length < 100) hasMore = false;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, HISTORY_COLLECTION);
    }
  }

  /**
   * Lấy lịch sử của một user cụ thể
   */
  async getUserHistory(accountId: string, pageSize: number = 20): Promise<UserActivityItem[]> {
    if (isFirestoreQuotaExhausted()) return [];

    try {
      const q = query(
        collection(db, HISTORY_COLLECTION),
        where('accountId', '==', accountId),
        orderBy('lastWatchedAt', 'desc'),
        limit(pageSize)
      );
      const snapshot = await getDocs(q);

      return snapshot.docs.map((doc) => doc.data() as UserActivityItem);
    } catch (e) {
      console.warn('Failed to get user history (compound query), trying fallback:', e);
      // Fallback: Firestore requires a composite index for where('accountId') + orderBy.
      // If that index is missing, fetch by lastWatchedAt and filter client-side.
      try {
        const fallbackQuery = query(
          collection(db, HISTORY_COLLECTION),
          orderBy('lastWatchedAt', 'desc'),
          limit(Math.max(pageSize, 200))
        );
        const snapshot = await getDocs(fallbackQuery);
        return snapshot.docs
          .map((doc) => doc.data() as UserActivityItem)
          .filter((item) => item.accountId === accountId)
          .slice(0, pageSize);
      } catch (e2) {
        handleFirestoreError(e2, OperationType.LIST, HISTORY_COLLECTION);
        return [];
      }
    }
  }
}

export const watchHistoryService = new WatchHistoryService();
