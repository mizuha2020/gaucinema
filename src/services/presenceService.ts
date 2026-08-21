import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from './firebase';
import { ActiveViewerSession } from '../types';

const HEARTBEAT_EXPIRATION_MS = 90 * 1000; // 90 seconds timeout for active viewers

class PresenceService {
  private currentSessionId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastSentData: Partial<ActiveViewerSession> | null = null;

  /**
   * Start or update real-time viewing/reading heartbeat
   */
  startHeartbeat(session: Omit<ActiveViewerSession, 'sessionId' | 'lastHeartbeat'>): void {
    const sessionId = `${session.accountId}_${session.profileId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.currentSessionId = sessionId;
    this.lastSentData = session;

    // Send initial ping immediately
    this.sendPing(sessionId, session);

    // Clear existing timer if any
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Schedule regular heartbeat every 20 seconds
    this.heartbeatTimer = setInterval(() => {
      if (this.currentSessionId && this.lastSentData) {
        this.sendPing(this.currentSessionId, this.lastSentData);
      }
    }, 20000);
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
      this.sendPing(this.currentSessionId, this.lastSentData);
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
    }
  }

  private async sendPing(sessionId: string, sessionData: Partial<ActiveViewerSession>): Promise<void> {
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
    } catch (e) {
      // Non-blocking warning for presence heartbeat
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
