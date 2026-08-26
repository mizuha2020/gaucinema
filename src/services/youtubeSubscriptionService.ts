import { YouTubeChannel } from '../types';
import { firestoreStorage } from './firestoreStorage';
import { CURATED_CHANNELS } from './youtubeApi';

const subsKey = (profileId?: string | null) => `gau_yt_subscribed_channels_${profileId || 'default'}`;
const idsKey = (profileId?: string | null) => `gau_yt_subs_${profileId || 'default'}`;

export const youtubeSubscriptionService = {
  getSubscribedChannels: (profileId?: string | null): YouTubeChannel[] => {
    try {
      const savedRich = localStorage.getItem(subsKey(profileId));
      if (savedRich) {
        const parsed = JSON.parse(savedRich);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }

      // Check legacy string IDs
      const savedIds = JSON.parse(
        localStorage.getItem(idsKey(profileId)) || localStorage.getItem('gau_yt_subscriptions') || '[]'
      );
      if (Array.isArray(savedIds) && savedIds.length > 0) {
        // Map string IDs/titles to CURATED_CHANNELS or synthetic channels
        return savedIds.map((item: string | any) => {
          if (typeof item === 'object' && item.title) return item as YouTubeChannel;
          const match = CURATED_CHANNELS.find((c) => c.id === item || c.title === item);
          if (match) return match;
          return {
            id: String(item),
            title: String(item),
            subscribers: 'Đã đăng ký',
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(String(item))}&background=FF0000&color=fff&bold=true`,
          };
        });
      }
    } catch {
      // Fallback
    }
    return [];
  },

  isSubscribed: (profileId: string | null | undefined, channelIdOrTitle: string): boolean => {
    if (!channelIdOrTitle) return false;
    const channels = youtubeSubscriptionService.getSubscribedChannels(profileId);
    const target = channelIdOrTitle.toLowerCase().trim();
    return channels.some(
      (c) =>
        (c.id && c.id.toLowerCase().trim() === target) ||
        (c.title && c.title.toLowerCase().trim() === target)
    );
  },

  toggleSubscribe: async (
    currentAccount: { id: string } | null | undefined,
    activeProfile: { id: string } | null | undefined,
    channel: YouTubeChannel
  ): Promise<boolean> => {
    const profileId = activeProfile?.id;
    const accountId = currentAccount?.id;
    const channelIdOrTitle = channel.id || channel.title;
    if (!channelIdOrTitle) return false;

    const channels = youtubeSubscriptionService.getSubscribedChannels(profileId);
    const target = channelIdOrTitle.toLowerCase().trim();
    const exists = channels.some(
      (c) =>
        (c.id && c.id.toLowerCase().trim() === target) ||
        (c.title && c.title.toLowerCase().trim() === target)
    );

    let updated: YouTubeChannel[];
    if (exists) {
      updated = channels.filter(
        (c) =>
          (c.id ? c.id.toLowerCase().trim() !== target : true) &&
          (c.title ? c.title.toLowerCase().trim() !== target : true)
      );
    } else {
      const richChannel: YouTubeChannel = {
        id: channel.id || `chan_${Date.now()}`,
        title: channel.title,
        avatarUrl:
          channel.avatarUrl ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=FF0000&color=fff&bold=true`,
        subscribers: channel.subscribers || 'Đã đăng ký',
        description: channel.description || '',
      };
      updated = [richChannel, ...channels];
    }

    // Save to localStorage
    try {
      localStorage.setItem(subsKey(profileId), JSON.stringify(updated));
      const ids = updated.map((c) => c.id || c.title);
      localStorage.setItem(idsKey(profileId), JSON.stringify(ids));
      localStorage.setItem('gau_yt_subscriptions', JSON.stringify(ids));
    } catch {}

    // Save to Firestore
    if (accountId && profileId) {
      try {
        await firestoreStorage.toggleYoutubeSubscription(
          accountId,
          profileId,
          channel.id || channel.title,
          channel.title,
          channel.avatarUrl
        );
      } catch (e) {
        console.warn('Failed to sync subscription to Firestore:', e);
      }
    }

    // Broadcast event for UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gau_yt_subscriptions_updated'));
    }

    return !exists;
  },
};
