import React, { useState, useEffect } from 'react';
import { Account, AdminNotification } from '../types';
import { firestoreStorage } from '../services/firestoreStorage';
import { Bell } from 'lucide-react';

interface NotificationTickerBannerProps {
  currentAccount: Account | null;
}

const SEEN_NOTIFS_KEY = 'qtb_seen_notification_ids_v1';

function getSeenNotifIds(): string[] {
  try {
    const raw = sessionStorage.getItem(SEEN_NOTIFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore error
  }
  return [];
}

function saveSeenNotifId(id: string): void {
  try {
    const seen = getSeenNotifIds();
    if (!seen.includes(id)) {
      seen.push(id);
      sessionStorage.setItem(SEEN_NOTIFS_KEY, JSON.stringify(seen));
    }
  } catch {
    // Ignore error
  }
}

export const NotificationTickerBanner: React.FC<NotificationTickerBannerProps> = ({
  currentAccount,
}) => {
  const [activeNotifs, setActiveNotifs] = useState<AdminNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => getSeenNotifIds());
  const [currentNotifIndex, setCurrentNotifIndex] = useState(0);
  const [loopKey, setLoopKey] = useState(0);

  useEffect(() => {
    // Subscribe to Firestore notifications real-time
    const unsubscribe = firestoreStorage.subscribeNotifications((allNotifs) => {
      // Filter valid notifications for this user
      const relevant = allNotifs.filter((n) => {
        if (!n.active) return false;
        if (n.targetType === 'all') return true;
        if (!currentAccount) return false;
        const targetList = n.targetAccountIds || [];
        return (
          targetList.includes(currentAccount.username) ||
          targetList.includes(currentAccount.id)
        );
      });

      setActiveNotifs(relevant);
    });

    return () => unsubscribe();
  }, [currentAccount]);

  // Active uncompleted notifications
  const visibleNotifs = activeNotifs.filter((n) => !dismissedIds.includes(n.id));
  const currentNotif = visibleNotifs[currentNotifIndex] || visibleNotifs[0] || null;

  useEffect(() => {
    // Reset loop key when current notification changes
    if (currentNotif) {
      setLoopKey((k) => k + 1);
    }
  }, [currentNotif?.id]);

  if (!currentNotif) {
    return null;
  }

  const handleDismiss = (notifId: string) => {
    saveSeenNotifId(notifId);
    setDismissedIds((prev) => [...prev, notifId]);
  };

  const handleAnimationEnd = () => {
    // When animation completes all repeat loops
    if (currentNotif) {
      handleDismiss(currentNotif.id);
    }
  };

  const isTop = currentNotif.position === 'top';
  const speed = currentNotif.speedSeconds || 15;
  const repeat = currentNotif.repeatCount || 3;

  return (
    <div
      id="notification-ticker-container"
      className={`fixed left-0 right-0 z-[100] pointer-events-none flex items-center justify-center px-2 sm:px-4 transition-all duration-300 ${
        isTop ? 'top-1 sm:top-2' : 'bottom-16 sm:bottom-4'
      }`}
    >
      <div
        id={`notif-banner-${currentNotif.id}`}
        className="max-w-2xl w-full bg-[#091122]/95 border border-amber-500/40 text-amber-200 rounded-full py-1.5 px-3.5 sm:px-5 shadow-2xl backdrop-blur-md flex items-center gap-2.5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none"
      >
        {/* Left Badge Indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wide border border-amber-500/30 flex items-center gap-1 shrink-0">
            <Bell className="w-3 h-3 text-amber-400" />
            <span>Thông báo</span>
          </span>
        </div>

        {/* Center Marquee Cucumber Ticker Area */}
        <div className="overflow-hidden flex-1 relative h-6 flex items-center mx-1">
          <div
            key={`${currentNotif.id}-${loopKey}`}
            onAnimationEnd={handleAnimationEnd}
            className="animate-cucumber-marquee font-semibold text-xs sm:text-sm text-amber-100/95 whitespace-nowrap"
            style={{
              animationDuration: `${speed}s`,
              animationIterationCount: repeat,
            }}
          >
            {currentNotif.message}
          </div>
        </div>
      </div>
    </div>
  );
};
