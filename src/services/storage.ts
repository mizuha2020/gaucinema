import { MyListItem, UserProfile, WatchHistoryItem } from '../types';

const STORAGE_PROFILES_KEY = 'qtb_users_profiles_v1';
const STORAGE_ACTIVE_PROFILE_KEY = 'qtb_active_profile_id_v1';
const STORAGE_HISTORY_PREFIX = 'qtb_history_profile_';
const STORAGE_MYLIST_PREFIX = 'qtb_mylist_profile_';

export const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'user-1',
    name: 'Quốc (Chính)',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    color: '#2563EB',
  },
  {
    id: 'user-2',
    name: 'Thành viên 2',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
    color: '#38BDF8',
  },
  {
    id: 'user-3',
    name: 'Thành viên 3',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    color: '#10B981',
  },
  {
    id: 'user-4',
    name: 'Thành viên 4',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    color: '#F59E0B',
  },
  {
    id: 'user-5',
    name: 'Trẻ Em (Kids)',
    avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80',
    color: '#6366F1',
    isKid: true,
  },
];

export const storage = {
  // Profiles
  getProfiles(): UserProfile[] {
    try {
      const stored = localStorage.getItem(STORAGE_PROFILES_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error loading profiles', e);
    }
    localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(DEFAULT_PROFILES));
    return DEFAULT_PROFILES;
  },

  saveProfiles(profiles: UserProfile[]): void {
    try {
      localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));
    } catch (e) {
      console.error('Error saving profiles', e);
    }
  },

  getActiveProfileId(): string | null {
    try {
      return localStorage.getItem(STORAGE_ACTIVE_PROFILE_KEY);
    } catch {
      return null;
    }
  },

  setActiveProfileId(id: string): void {
    try {
      localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, id);
    } catch (e) {
      console.error('Error setting active profile', e);
    }
  },

  clearActiveProfile(): void {
    try {
      localStorage.removeItem(STORAGE_ACTIVE_PROFILE_KEY);
    } catch (e) {
      console.error('Error clearing active profile', e);
    }
  },

  // Watch History (per profile)
  getHistory(profileId: string): WatchHistoryItem[] {
    try {
      const stored = localStorage.getItem(`${STORAGE_HISTORY_PREFIX}${profileId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error loading history', e);
    }
    return [];
  },

  saveWatchProgress(profileId: string, item: Omit<WatchHistoryItem, 'updatedAt'>): void {
    try {
      const current = this.getHistory(profileId);
      const filtered = current.filter((h) => h.movieSlug !== item.movieSlug);
      const newItem: WatchHistoryItem = {
        ...item,
        updatedAt: Date.now(),
      };
      // Keep max 30 items
      const updated = [newItem, ...filtered].slice(0, 30);
      localStorage.setItem(`${STORAGE_HISTORY_PREFIX}${profileId}`, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving progress', e);
    }
  },

  removeHistoryItem(profileId: string, movieSlug: string): void {
    try {
      const current = this.getHistory(profileId);
      const updated = current.filter((h) => h.movieSlug !== movieSlug);
      localStorage.setItem(`${STORAGE_HISTORY_PREFIX}${profileId}`, JSON.stringify(updated));
    } catch (e) {
      console.error('Error removing history item', e);
    }
  },

  // My List (Favorites per profile)
  getMyList(profileId: string): MyListItem[] {
    try {
      const stored = localStorage.getItem(`${STORAGE_MYLIST_PREFIX}${profileId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error loading my list', e);
    }
    return [];
  },

  isInMyList(profileId: string, movieSlug: string): boolean {
    const list = this.getMyList(profileId);
    return list.some((item) => item.movieSlug === movieSlug);
  },

  toggleMyList(profileId: string, item: Omit<MyListItem, 'addedAt'>): boolean {
    try {
      const current = this.getMyList(profileId);
      const exists = current.some((i) => i.movieSlug === item.movieSlug);
      let updated: MyListItem[];
      if (exists) {
        updated = current.filter((i) => i.movieSlug !== item.movieSlug);
      } else {
        updated = [{ ...item, addedAt: Date.now() }, ...current];
      }
      localStorage.setItem(`${STORAGE_MYLIST_PREFIX}${profileId}`, JSON.stringify(updated));
      return !exists;
    } catch (e) {
      console.error('Error toggling my list', e);
      return false;
    }
  },
};
