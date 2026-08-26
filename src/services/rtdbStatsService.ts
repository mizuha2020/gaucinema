import {
  get,
  onValue,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';
import { rtdb, sanitizeData } from './firebase';
import { UserStats, MediaActivityType, UserActivityItem } from '../types';

const STATS_PATH = 'userStats';
const ACTIVITY_PATH = 'userActivityHistory';
const HEARTBEAT_EXPIRATION_MS = 90 * 1000;

function cleanDocId(raw: string): string {
  return raw.replace(/[\/\.#$\[\]\s]/g, '_').substring(0, 120);
}

class RtdbStatsService {
  /**
   * Update user stats (gọi từ heartbeat)
   */
  async updateStats(accountId: string, data: Partial<UserStats>): Promise<void> {
    try {
      const statsRef = ref(rtdb, `${STATS_PATH}/${accountId}`);
      await update(statsRef, sanitizeData(data));
    } catch (e) {
      console.warn('Failed to update stats in RTDB:', e);
    }
  }

  /**
   * Get single user stats
   */
  async getStats(accountId: string): Promise<UserStats | null> {
    try {
      const snap = await get(ref(rtdb, `${STATS_PATH}/${accountId}`));
      if (snap.exists()) {
        return snap.val() as UserStats;
      }
      return null;
    } catch (e) {
      console.warn('Failed to get stats:', e);
      return null;
    }
  }

  /**
   * Get all user stats
   */
  async getAllStats(): Promise<UserStats[]> {
    try {
      const snap = await get(ref(rtdb, STATS_PATH));
      const stats: UserStats[] = [];

      snap.forEach((child) => {
        const data = child.val() as UserStats;
        if (data && data.accountId) {
          stats.push(data);
        }
      });

      return stats.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
    } catch (e) {
      console.warn('Failed to fetch all stats:', e);
      return [];
    }
  }

  /**
   * Subscribe to real-time stats updates
   */
  subscribeStats(callback: (stats: UserStats[]) => void): () => void {
    const statsRef = ref(rtdb, STATS_PATH);

    const unsubscribe = onValue(
      statsRef,
      (snapshot) => {
        const stats: UserStats[] = [];

        snapshot.forEach((child) => {
          const data = child.val() as UserStats;
          if (data && data.accountId) {
            const now = Date.now();
            const isOnline = data.lastActiveAt && (now - data.lastActiveAt) < HEARTBEAT_EXPIRATION_MS;
            stats.push({
              ...data,
              isOnline,
            });
          }
        });

        callback(stats.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)));
      },
      (error) => {
        console.warn('Failed to subscribe to stats:', error);
      }
    );

    return unsubscribe;
  }

  /**
   * Delete user stats
   */
  async deleteStats(accountId: string): Promise<void> {
    try {
      await remove(ref(rtdb, `${STATS_PATH}/${accountId}`));
    } catch (e) {
      console.warn('Failed to delete stats:', e);
    }
  }

  /**
   * Clear all stats
   */
  async clearAllStats(): Promise<void> {
    try {
      await remove(ref(rtdb, STATS_PATH));
    } catch (e) {
      console.warn('Failed to clear all stats:', e);
    }
  }

  /**
   * Update activity history item
   */
  async updateActivity(activityId: string, data: Partial<UserActivityItem>): Promise<void> {
    try {
      const activityRef = ref(rtdb, `${ACTIVITY_PATH}/${activityId}`);
      await update(activityRef, sanitizeData(data));
    } catch (e) {
      console.warn('Failed to update activity:', e);
    }
  }

  /**
   * Get activity history for a user
   */
  async getUserActivities(accountId: string, limit: number = 50): Promise<UserActivityItem[]> {
    try {
      const snap = await get(ref(rtdb, ACTIVITY_PATH));
      const activities: UserActivityItem[] = [];

      snap.forEach((child) => {
        const data = child.val() as UserActivityItem;
        if (data && data.accountId === accountId) {
          activities.push(data);
        }
      });

      return activities
        .sort((a, b) => (b.lastWatchedAt || 0) - (a.lastWatchedAt || 0))
        .slice(0, limit);
    } catch (e) {
      console.warn('Failed to get user activities:', e);
      return [];
    }
  }

  /**
   * Subscribe to real-time activity updates
   */
  subscribeActivities(callback: (activities: UserActivityItem[]) => void): () => void {
    const activityRef = ref(rtdb, ACTIVITY_PATH);

    const unsubscribe = onValue(
      activityRef,
      (snapshot) => {
        const activities: UserActivityItem[] = [];

        snapshot.forEach((child) => {
          const data = child.val() as UserActivityItem;
          if (data && data.id) {
            activities.push(data);
          }
        });

        callback(activities.sort((a, b) => (b.lastWatchedAt || 0) - (a.lastWatchedAt || 0)));
      },
      (error) => {
        console.warn('Failed to subscribe to activities:', error);
      }
    );

    return unsubscribe;
  }
}

export const rtdbStatsService = new RtdbStatsService();
