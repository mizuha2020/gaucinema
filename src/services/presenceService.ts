import {
  onValue,
  ref,
  remove,
  set,
} from 'firebase/database';
import { rtdb, sanitizeData } from './firebase';
import { ActiveViewerSession, MediaActivityType } from '../types';
import { userAnalyticsService } from './userAnalyticsService';

const HEARTBEAT_EXPIRATION_MS = 90 * 1000;
const SESSIONS_PATH = 'activeSessions';
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 giây

// Map MediaActivityType to ActiveViewerSession type
function mapToSessionType(mediaType: MediaActivityType): ActiveViewerSession['type'] {
  switch (mediaType) {
    case 'movie': return 'watching_movie';
    case 'manga': return 'reading_manga';
    case 'youtube': return 'browsing';
    case 'anime': return 'watching_movie';
    case 'browsing': return 'browsing';
    default: return 'browsing';
  }
}

interface PresenceSession {
  sessionId: string;
  accountId: string;
  accountDisplayName: string;
  profileId: string;
  profileName: string;
  profileAvatar: string;
  type: MediaActivityType;
  contentId: string;
  itemTitle: string;
  itemSubtitle: string;
  itemCover: string;
  apiSourceUsed: string;
  lastHeartbeat: number;
  deviceInfo: string;
}

class PresenceService {
  private currentSessionId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastSentData: Partial<PresenceSession> | null = null;
  private lastHeartbeatTime: number = 0;

  /**
   * Bắt đầu presence session
   */
  startSession(data: {
    accountId: string;
    accountDisplayName: string;
    profileId: string;
    profileName: string;
    profileAvatar?: string;
    type: MediaActivityType;
    contentId?: string;
    itemTitle: string;
    itemSubtitle?: string;
    itemCover?: string;
    apiSourceUsed?: string;
  }): void {
    const sessionId = `${data.accountId}_${data.profileId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.currentSessionId = sessionId;
    this.lastSentData = {
      sessionId,
      accountId: data.accountId,
      accountDisplayName: data.accountDisplayName,
      profileId: data.profileId,
      profileName: data.profileName,
      profileAvatar: data.profileAvatar || '',
      type: data.type,
      contentId: data.contentId || data.itemTitle,
      itemTitle: data.itemTitle,
      itemSubtitle: data.itemSubtitle || '',
      itemCover: data.itemCover || '',
      apiSourceUsed: data.apiSourceUsed || '',
      lastHeartbeat: Date.now(),
      deviceInfo: typeof window !== 'undefined' && window.innerWidth < 768 ? 'Mobile' : 'Desktop / Web',
    };

    this.lastHeartbeatTime = Date.now();
    this.sendPing();
    this.startHeartbeatTimer();

    userAnalyticsService.recordActivityHeartbeat({
      accountId: data.accountId,
      accountDisplayName: data.accountDisplayName,
      profileId: data.profileId,
      profileName: data.profileName,
      profileAvatar: data.profileAvatar,
      mediaType: data.type,
      contentId: data.contentId || data.itemTitle,
      title: data.itemTitle,
      subtitle: data.itemSubtitle,
      coverUrl: data.itemCover,
      apiSource: data.apiSourceUsed,
      secondsElapsed: 0,
      isActivelyPlaying: data.type !== 'browsing',
    });
  }

  /**
   * Cập nhật nội dung đang xem (khi switch tập, thay đổi)
   */
  updateContent(data: {
    type: MediaActivityType;
    contentId?: string;
    itemTitle: string;
    itemSubtitle?: string;
    itemCover?: string;
    apiSourceUsed?: string;
  }): void {
    if (!this.currentSessionId) return;

    this.lastSentData = {
      ...this.lastSentData,
      type: data.type,
      contentId: data.contentId || data.itemTitle,
      itemTitle: data.itemTitle,
      itemSubtitle: data.itemSubtitle || '',
      itemCover: data.itemCover || '',
      apiSourceUsed: data.apiSourceUsed || '',
      lastHeartbeat: Date.now(),
    };

    this.sendPing();
  }

  /**
   * Dừng session và xóa khỏi RTDB
   */
  stopSession(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.currentSessionId) {
      userAnalyticsService.flushPendingAnalytics().catch(() => {});
      remove(ref(rtdb, `${SESSIONS_PATH}/${this.currentSessionId}`)).catch(() => {});
      this.currentSessionId = null;
      this.lastSentData = null;
      this.lastHeartbeatTime = 0;
    }
  }

  /**
   * Gửi heartbeat ping
   */
  private sendPing(): void {
    if (!this.currentSessionId || !this.lastSentData) return;

    const sessionData: PresenceSession = {
      sessionId: this.lastSentData.sessionId || this.currentSessionId,
      accountId: this.lastSentData.accountId || 'anonymous',
      accountDisplayName: this.lastSentData.accountDisplayName || 'Khách',
      profileId: this.lastSentData.profileId || 'default',
      profileName: this.lastSentData.profileName || 'Người xem',
      profileAvatar: this.lastSentData.profileAvatar || '',
      type: this.lastSentData.type || 'browsing',
      contentId: this.lastSentData.contentId || '',
      itemTitle: this.lastSentData.itemTitle || 'Đang duyệt',
      itemSubtitle: this.lastSentData.itemSubtitle || '',
      itemCover: this.lastSentData.itemCover || '',
      apiSourceUsed: this.lastSentData.apiSourceUsed || '',
      lastHeartbeat: Date.now(),
      deviceInfo: this.lastSentData.deviceInfo || 'Desktop / Web',
    };

    set(ref(rtdb, `${SESSIONS_PATH}/${this.currentSessionId}`), sanitizeData(sessionData)).catch(() => {});

    const now = Date.now();
    const secondsElapsed = this.lastHeartbeatTime > 0
      ? Math.round((now - this.lastHeartbeatTime) / 1000)
      : 30;
    this.lastHeartbeatTime = now;

    userAnalyticsService.recordActivityHeartbeat({
      accountId: this.lastSentData.accountId || 'anonymous',
      accountDisplayName: this.lastSentData.accountDisplayName,
      profileId: this.lastSentData.profileId || 'default',
      profileName: this.lastSentData.profileName,
      profileAvatar: this.lastSentData.profileAvatar,
      mediaType: this.lastSentData.type || 'browsing',
      contentId: this.lastSentData.contentId || '',
      title: this.lastSentData.itemTitle,
      subtitle: this.lastSentData.itemSubtitle,
      coverUrl: this.lastSentData.itemCover,
      apiSource: this.lastSentData.apiSourceUsed,
      secondsElapsed,
      isActivelyPlaying: (this.lastSentData.type || 'browsing') !== 'browsing',
    });
  }

  /**
   * Bắt đầu heartbeat timer
   */
  private startHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Subscribe to real-time active sessions
   */
  subscribeSessions(callback: (sessions: ActiveViewerSession[]) => void): () => void {
    const sessionsRef = ref(rtdb, SESSIONS_PATH);

    const unsubscribe = onValue(
      sessionsRef,
      (snapshot) => {
        const now = Date.now();
        const activeSessions: ActiveViewerSession[] = [];

        snapshot.forEach((child) => {
          const data = child.val() as PresenceSession;
          if (data && data.lastHeartbeat && (now - data.lastHeartbeat) < HEARTBEAT_EXPIRATION_MS) {
            activeSessions.push({
              sessionId: data.sessionId,
              accountId: data.accountId,
              accountDisplayName: data.accountDisplayName,
              profileId: data.profileId,
              profileName: data.profileName,
              profileAvatar: data.profileAvatar,
              type: mapToSessionType(data.type),
              itemTitle: data.itemTitle,
              itemSubtitle: data.itemSubtitle,
              itemCover: data.itemCover,
              apiSourceUsed: data.apiSourceUsed,
              lastHeartbeat: data.lastHeartbeat,
              deviceInfo: data.deviceInfo,
            });
          }
        });

        callback(activeSessions.sort((a, b) => b.lastHeartbeat - a.lastHeartbeat));
      },
      (error) => {
        void 0;
      }
    );

    return unsubscribe;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }
}

export const presenceService = new PresenceService();
