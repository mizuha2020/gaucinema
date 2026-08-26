import {
  get,
  onValue,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';
import { rtdb, sanitizeData } from './firebase';
import { ActiveViewerSession, MediaActivityType, UserStats } from '../types';

const HEARTBEAT_EXPIRATION_MS = 90 * 1000;
const SESSIONS_PATH = 'activeSessions';
const STATS_PATH = 'userStats';

const ACTIVE_INTERVAL_MS = 10 * 1000;  // 10 giây khi đang active
const IDLE_INTERVAL_MS = 30 * 1000;     // 30 giây khi idle
const IDLE_TIMEOUT_MS = 60 * 1000;      // 1 phút không hoạt động → idle
const TAB_HIDDEN_INTERVAL_MS = 60 * 1000; // 60 giây khi tab bị ẩn

class SmartPresenceService {
  private currentSessionId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastSentData: Partial<ActiveViewerSession> | null = null;
  private lastPingTimestamp: number = 0;
  private lastActivityTimestamp: number = 0;
  private isActive: boolean = false;
  private isTabHidden: boolean = false;
  private visibilityHandler: (() => void) | null = null;

  private currentStats: Partial<UserStats> | null = null;
  private statsTimer: NodeJS.Timeout | null = null;

  /**
   * Tính interval dựa trên trạng thái active/idle/tab hidden
   */
  private getInterval(): number {
    // Tab bị ẩn → interval dài nhất
    if (this.isTabHidden) {
      return TAB_HIDDEN_INTERVAL_MS;
    }

    const now = Date.now();
    const timeSinceActivity = now - this.lastActivityTimestamp;

    if (timeSinceActivity < IDLE_TIMEOUT_MS) {
      return ACTIVE_INTERVAL_MS;
    }
    return IDLE_INTERVAL_MS;
  }

  /**
   * Khởi tạo Page Visibility API listener
   */
  private initVisibilityDetection(): void {
    if (typeof document === 'undefined') return;

    this.visibilityHandler = () => {
      const wasHidden = this.isTabHidden;
      this.isTabHidden = document.hidden;

      if (wasHidden && !this.isTabHidden) {
        // Tab trở lại visible → gửi ping ngay lập tức
        this.sendImmediatePing();
      } else if (!wasHidden && this.isTabHidden) {
        // Tab vừa bị ẩn → cập nhật stats ngay
        this.updateStatsOnTabHide();
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Dọn dẹp visibility listener
   */
  private cleanupVisibilityDetection(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /**
   * Gửi ping ngay khi tab trở lại visible
   */
  private sendImmediatePing(): void {
    if (this.currentSessionId && this.lastSentData) {
      const now = Date.now();
      const elapsedSeconds = this.lastPingTimestamp > 0
        ? Math.round((now - this.lastPingTimestamp) / 1000)
        : 10;
      this.lastPingTimestamp = now;
      this.sendPing(this.currentSessionId, this.lastSentData, elapsedSeconds);
      this.updateStats(elapsedSeconds);
    }
  }

  /**
   * Cập nhật stats khi tab bị ẩn
   */
  private updateStatsOnTabHide(): void {
    if (this.currentSessionId && this.lastSentData) {
      const now = Date.now();
      const elapsedSeconds = this.lastPingTimestamp > 0
        ? Math.round((now - this.lastPingTimestamp) / 1000)
        : 10;
      this.updateStats(elapsedSeconds);
    }
  }

  /**
   * Kiểm tra xem tab có đang bị ẩn không
   */
  isHidden(): boolean {
    return this.isTabHidden;
  }

  /**
   * Cập nhật trạng thái active khi có hoạt động mới
   */
  private markActive(): void {
    this.lastActivityTimestamp = Date.now();
    this.isActive = true;
  }

  /**
   * Bắt đầu heartbeat với dynamic interval
   */
  startHeartbeat(session: Omit<ActiveViewerSession, 'sessionId' | 'lastHeartbeat'>): void {
    const sessionId = `${session.accountId}_${session.profileId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.currentSessionId = sessionId;
    this.lastSentData = session;
    this.lastPingTimestamp = Date.now();
    this.lastActivityTimestamp = Date.now();
    this.isActive = true;
    this.isTabHidden = document?.hidden ?? false;

    this.sendPing(sessionId, session, 5);
    this.startStatsTracking(session);
    this.initVisibilityDetection();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.scheduleNextPing();
  }

  /**
   * Lên lịch ping tiếp theo với interval động
   */
  private scheduleNextPing(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    const interval = this.getInterval();

    this.heartbeatTimer = setInterval(() => {
      if (this.currentSessionId && this.lastSentData) {
        const now = Date.now();
        const elapsedSeconds = this.lastPingTimestamp > 0
          ? Math.round((now - this.lastPingTimestamp) / 1000)
          : Math.round(interval / 1000);
        this.lastPingTimestamp = now;
        this.sendPing(this.currentSessionId, this.lastSentData, elapsedSeconds);
        this.updateStats(elapsedSeconds);

        this.scheduleNextPing();
      }
    }, interval);
  }

  /**
   * Cập nhật tiến trình playback
   */
  updateProgress(currentTime?: number, duration?: number, progressPercent?: number): void {
    if (this.currentSessionId && this.lastSentData) {
      this.lastSentData = {
        ...this.lastSentData,
        currentTime,
        duration,
        progressPercent,
      };
      this.markActive();
    }
  }

  /**
   * Dừng heartbeat và xóa session
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }

    this.cleanupVisibilityDetection();

    if (this.currentSessionId) {
      remove(ref(rtdb, `${SESSIONS_PATH}/${this.currentSessionId}`)).catch(() => {});
      this.currentSessionId = null;
      this.lastSentData = null;
      this.lastPingTimestamp = 0;
      this.lastActivityTimestamp = 0;
      this.isActive = false;
      this.isTabHidden = false;
      this.currentStats = null;
    }
  }

  /**
   * Gửi heartbeat ping lên RTDB
   */
  private async sendPing(
    sessionId: string,
    sessionData: Partial<ActiveViewerSession>,
    secondsElapsed: number = 10
  ): Promise<void> {
    try {
      const fullSession: ActiveViewerSession = {
        sessionId,
        accountId: sessionData.accountId || 'anonymous',
        accountDisplayName: sessionData.accountDisplayName || 'Khách',
        profileId: sessionData.profileId || 'default',
        profileName: sessionData.profileName || 'Người xem',
        profileAvatar: sessionData.profileAvatar || '',
        type: sessionData.type || 'browsing',
        itemTitle: sessionData.itemTitle || 'Đang duyệt ứng dụng',
        itemSubtitle: sessionData.itemSubtitle || '',
        itemCover: sessionData.itemCover || '',
        apiSourceUsed: sessionData.apiSourceUsed || '',
        progressPercent: sessionData.progressPercent ?? 0,
        currentTime: sessionData.currentTime,
        duration: sessionData.duration,
        deviceInfo: typeof window !== 'undefined' && window.innerWidth < 768 ? 'Mobile' : 'Desktop / Web',
        lastHeartbeat: Date.now(),
      };

      await set(ref(rtdb, `${SESSIONS_PATH}/${sessionId}`), sanitizeData(fullSession));
    } catch (e) {
      console.warn('Smart presence heartbeat ping warning:', e);
    }
  }

  /**
   * Bắt đầu theo dõi stats
   */
  private startStatsTracking(session: Partial<ActiveViewerSession>): void {
    if (!session.accountId) return;

    this.currentStats = {
      accountId: session.accountId,
      accountDisplayName: session.accountDisplayName || session.accountId,
      totalOnlineSeconds: 0,
      totalWatchSeconds: 0,
      watchSecondsByMedia: {
        movie: 0,
        manga: 0,
        livetv: 0,
        youtube: 0,
      },
      totalSessions: 1,
      firstSeenAt: Date.now(),
      lastActiveAt: Date.now(),
      isOnline: true,
      lastActiveItem: session.type !== 'browsing' ? {
        mediaType: session.type as MediaActivityType,
        title: session.itemTitle || '',
        subtitle: session.itemSubtitle,
      } : undefined,
    };

    this.loadExistingStats(session.accountId);
  }

  /**
   * Load stats hiện tại từ RTDB
   */
  private async loadExistingStats(accountId: string): Promise<void> {
    try {
      const snap = await get(ref(rtdb, `${STATS_PATH}/${accountId}`));
      if (snap.exists()) {
        const existing = snap.val() as UserStats;
        if (this.currentStats) {
          this.currentStats.totalOnlineSeconds = existing.totalOnlineSeconds || 0;
          this.currentStats.totalWatchSeconds = existing.totalWatchSeconds || 0;
          this.currentStats.watchSecondsByMedia = existing.watchSecondsByMedia || {
            movie: 0,
            manga: 0,
            livetv: 0,
            youtube: 0,
          };
          this.currentStats.totalSessions = (existing.totalSessions || 0) + 1;
          this.currentStats.firstSeenAt = existing.firstSeenAt || Date.now();
        }
      }
    } catch (e) {
      console.warn('Failed to load existing stats:', e);
    }
  }

  /**
   * Cập nhật stats lên RTDB
   */
  private async updateStats(secondsElapsed: number): Promise<void> {
    if (!this.currentStats || !this.currentStats.accountId) return;

    const accountId = this.currentStats.accountId;
    const now = Date.now();

    this.currentStats.totalOnlineSeconds = (this.currentStats.totalOnlineSeconds || 0) + secondsElapsed;
    this.currentStats.lastActiveAt = now;
    this.currentStats.isOnline = true;

    if (this.lastSentData && this.lastSentData.type !== 'browsing') {
      this.currentStats.totalWatchSeconds = (this.currentStats.totalWatchSeconds || 0) + secondsElapsed;

      const mediaType = this.lastSentData.type as MediaActivityType;
      if (mediaType && this.currentStats.watchSecondsByMedia) {
        this.currentStats.watchSecondsByMedia[mediaType] =
          (this.currentStats.watchSecondsByMedia[mediaType] || 0) + secondsElapsed;
      }

      if (this.lastSentData.itemTitle) {
        this.currentStats.lastActiveItem = {
          mediaType,
          title: this.lastSentData.itemTitle,
          subtitle: this.lastSentData.itemSubtitle,
        };
      }
    }

    try {
      const statsRef = ref(rtdb, `${STATS_PATH}/${accountId}`);
      await update(statsRef, sanitizeData(this.currentStats));
    } catch (e) {
      console.warn('Failed to update stats:', e);
    }
  }

  /**
   * Fetch tất cả user stats
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
}

export const smartPresenceService = new SmartPresenceService();
