import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, isFirestoreQuotaExhausted, markFirestoreQuotaExhausted, OperationType, sanitizeData } from './firebase';
import { ActiveViewerSession, MediaActivityType } from '../types';
import { userAnalyticsService } from './userAnalyticsService';

const HEARTBEAT_EXPIRATION_MS = 90 * 1000; // 90 seconds timeout for active viewers

class PresenceService {
  private currentSessionId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastSentData: Partial<ActiveViewerSession> | null = null;
  private lastPingTimestamp: number = 0;

  /**
   * Start or update real-time viewing/reading heartbeat
   */
  startHeartbeat(session: Omit<ActiveViewerSession, 'sessionId' | 'lastHeartbeat'>): void {
    if (isFirestoreQuotaExhausted()) {
      return;
    }
    const sessionId = `${session.accountId}_${session.profileId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.currentSessionId = sessionId;
    this.lastSentData = session;
    this.lastPingTimestamp = Date.now();

    // Send initial ping immediately
    this.sendPing(sessionId, session, 5);

    // Clear existing timer if any
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Schedule regular heartbeat every 45 seconds (optimized for Firestore quota preservation)
    this.heartbeatTimer = setInterval(() => {
      if (isFirestoreQuotaExhausted()) {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        return;
      }
      if (this.currentSessionId && this.lastSentData) {
        const now = Date.now();
        const elapsedSeconds = this.lastPingTimestamp > 0 ? Math.round((now - this.lastPingTimestamp) / 1000) : 45;
        this.lastPingTimestamp = now;
        this.sendPing(this.currentSessionId, this.lastSentData, elapsedSeconds);
      }
    }, 45000);
  }

  /**
   * Update current playback/progress without resetting heartbeat timer
   */
  updateProgress(currentTime?: number, duration?: number, progressPercent?: number): void {
    if (this.currentSessionId && this.lastSentData) {
      this.lastSentData = {
        ...this.lastSentData,
        currentTime,
        duration,
        progressPercent,
      };
      this.sendPing(this.currentSessionId, this.lastSentData, 0);
    }
  }

  /**
   * Stop heartbeat and remove session from active list
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.currentSessionId) {
      const docRef = doc(db, 'activeSessions', this.currentSessionId);
      deleteDoc(docRef).catch(() => {});
      this.currentSessionId = null;
      this.lastSentData = null;
      this.lastPingTimestamp = 0;
    }
  }

  private async sendPing(sessionId: string, sessionData: Partial<ActiveViewerSession>, secondsElapsed: number = 20): Promise<void> {
    if (isFirestoreQuotaExhausted()) {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      return;
    }

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

      const docRef = doc(db, 'activeSessions', sessionId);
      await setDoc(docRef, sanitizeData(fullSession), { merge: true });

      // Record to persistent Analytics & History
      if (secondsElapsed > 0 && sessionData.accountId) {
        let mediaType: MediaActivityType = 'browsing';
        let isActivelyPlaying = false;

        if (sessionData.type === 'watching_movie') {
          mediaType = 'movie';
          isActivelyPlaying = true;
        } else if (sessionData.type === 'reading_manga') {
          mediaType = 'manga';
          isActivelyPlaying = true;
        } else if (sessionData.type === 'watching_tv') {
          mediaType = 'livetv';
          isActivelyPlaying = true;
        }

        userAnalyticsService.recordActivityHeartbeat({
          accountId: sessionData.accountId,
          accountDisplayName: sessionData.accountDisplayName,
          profileId: sessionData.profileId,
          profileName: sessionData.profileName,
          profileAvatar: sessionData.profileAvatar,
          mediaType,
          contentId: sessionData.itemTitle,
          title: sessionData.itemTitle,
          subtitle: sessionData.itemSubtitle,
          coverUrl: sessionData.itemCover,
          apiSource: sessionData.apiSourceUsed,
          currentTime: sessionData.currentTime,
          duration: sessionData.duration,
          progressPercent: sessionData.progressPercent,
          isActivelyPlaying,
          secondsElapsed,
        }).catch((err) => console.warn('Analytics heartbeat recording warning:', err));
      }
    } catch (e: any) {
      if (e?.code === 'resource-exhausted' || String(e).includes('Quota limit exceeded')) {
        markFirestoreQuotaExhausted();
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      }
      console.warn('Presence heartbeat ping warning:', e);
    }
  }

  /**
   * Fetch currently active sessions from Firestore (filtered by expiration)
   */
  async getActiveSessions(): Promise<{
    sessions: ActiveViewerSession[];
    stats: {
      total: number;
      movies: number;
      manga: number;
      tv: number;
      browsing: number;
    };
  }> {
    if (isFirestoreQuotaExhausted()) {
      return {
        sessions: [],
        stats: { total: 0, movies: 0, manga: 0, tv: 0, browsing: 0 },
      };
    }
    try {
      const colRef = collection(db, 'activeSessions');
      const snap = await getDocs(colRef);
      const now = Date.now();

      const activeList: ActiveViewerSession[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as ActiveViewerSession;
        if (data && data.lastHeartbeat && now - data.lastHeartbeat < HEARTBEAT_EXPIRATION_MS) {
          activeList.push(data);
        }
      });

      // Sort by newest activity first
      activeList.sort((a, b) => b.lastHeartbeat - a.lastHeartbeat);

      return {
        sessions: activeList,
        stats: {
          total: activeList.length,
          movies: activeList.filter((s) => s.type === 'watching_movie').length,
          manga: activeList.filter((s) => s.type === 'reading_manga').length,
          tv: activeList.filter((s) => s.type === 'watching_tv').length,
          browsing: activeList.filter((s) => s.type === 'browsing').length,
        },
      };
    } catch (e) {
      console.warn('Failed to fetch active viewer sessions:', e);
      return {
        sessions: [],
        stats: { total: 0, movies: 0, manga: 0, tv: 0, browsing: 0 },
      };
    }
  }

  /**
   * Subscribe to real-time viewer presence updates via Firestore onSnapshot
   */
  subscribeActiveSessions(
    callback: (data: {
      sessions: ActiveViewerSession[];
      stats: {
        total: number;
        movies: number;
        manga: number;
        tv: number;
        browsing: number;
      };
    }) => void
  ): () => void {
    if (isFirestoreQuotaExhausted()) {
      callback({
        sessions: [],
        stats: { total: 0, movies: 0, manga: 0, tv: 0, browsing: 0 },
      });
      return () => {};
    }
    const colRef = collection(db, 'activeSessions');
    
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const now = Date.now();
        const activeList: ActiveViewerSession[] = [];

        snapshot.docs.forEach((d) => {
          const data = d.data() as ActiveViewerSession;
          if (data && data.lastHeartbeat && now - data.lastHeartbeat < HEARTBEAT_EXPIRATION_MS) {
            activeList.push(data);
          }
        });

        activeList.sort((a, b) => b.lastHeartbeat - a.lastHeartbeat);

        callback({
          sessions: activeList,
          stats: {
            total: activeList.length,
            movies: activeList.filter((s) => s.type === 'watching_movie').length,
            manga: activeList.filter((s) => s.type === 'reading_manga').length,
            tv: activeList.filter((s) => s.type === 'watching_tv').length,
            browsing: activeList.filter((s) => s.type === 'browsing').length,
          },
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'activeSessions');
      }
    );

    return unsubscribe;
  }
}

export const presenceService = new PresenceService();
