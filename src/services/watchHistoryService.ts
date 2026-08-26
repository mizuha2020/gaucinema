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
      console.log(`[watchHistory] Recorded: ${activityId}`, activityData);
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

      // Get total count (for display) - simple query without where for speed
      let total = items.length;
      try {
        const totalSnapshot = await getDocs(collection(db, HISTORY_COLLECTION));
        total = totalSnapshot.size;
      } catch {}

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
        handleFirestoreError(e, OperationType.LIST, HISTORY_COLLECTION);
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

      if (options?.accountId && options.accountId !== 'all') {
        constraints.unshift(where('accountId', '==', options.accountId));
      }

      const q = query(collection(db, HISTORY_COLLECTION), ...constraints);
      const snapshot = await getDocs(q);

      const searchLower = searchText.toLowerCase();
      return snapshot.docs
        .map((doc) => doc.data() as UserActivityItem)
        .filter((item) =>
          item.title?.toLowerCase().includes(searchLower) ||
          item.subtitle?.toLowerCase().includes(searchLower) ||
          item.accountDisplayName?.toLowerCase().includes(searchLower)
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
      const q = query(collection(db, HISTORY_COLLECTION), where('accountId', '==', accountId), limit(100));
      const snapshot = await getDocs(q);

      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
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
      // Simple query - get all and filter client-side for reliability
      const q = query(
        collection(db, HISTORY_COLLECTION),
        orderBy('lastWatchedAt', 'desc'),
        limit(200) // Get more to filter
      );
      const snapshot = await getDocs(q);

      const allItems = snapshot.docs.map((doc) => doc.data() as UserActivityItem);
      console.log(`[watchHistory] Total items: ${allItems.length}, filtering for accountId: ${accountId}`);

      // Filter client-side for this account
      const filtered = allItems.filter(item => item.accountId === accountId);
      console.log(`[watchHistory] Filtered items for ${accountId}: ${filtered.length}`);

      return filtered.slice(0, pageSize);
    } catch (e) {
      console.warn('Failed to get user history:', e);
      return [];
    }
  }
}

export const watchHistoryService = new WatchHistoryService();
