import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from './firebase';
import { CustomAvatar, MyListItem, UserProfile, WatchHistoryItem, YouTubeVideo } from '../types';
import { MangaItem, MangaHistoryItem } from './mangaApi';
import { DEFAULT_AVATARS } from './authService';

const ACTIVE_PROFILE_KEY = 'qtb_active_profile_id_v2';
const PROFILES_CACHE_PREFIX = 'qtb_profiles_cache_v2_';

function getLocalProfilesCache(accountId: string): UserProfile[] | null {
  try {
    const raw = localStorage.getItem(`${PROFILES_CACHE_PREFIX}${accountId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading profiles cache', e);
  }
  return null;
}

function saveLocalProfilesCache(accountId: string, profiles: UserProfile[]): void {
  try {
    localStorage.setItem(`${PROFILES_CACHE_PREFIX}${accountId}`, JSON.stringify(profiles));
  } catch (e) {
    console.warn('Error saving profiles cache', e);
  }
}

export const firestoreStorage = {
  // --- PROFILES MANAGEMENT (Max 5 per account) ---

  async getProfiles(accountId: string): Promise<UserProfile[]> {
    if (!accountId) return [];
    
    const cached = getLocalProfilesCache(accountId);

    const profilesCol = collection(db, 'accounts', accountId, 'profiles');
    try {
      const snap = await getDocs(profilesCol);
      if (!snap.empty) {
        const profiles = snap.docs.map((d) => d.data() as UserProfile);
        profiles.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        saveLocalProfilesCache(accountId, profiles);
        return profiles;
      }

      // If Firestore returns empty but local cache exists, return cached
      if (cached && cached.length > 0) {
        return cached;
      }

      // Otherwise, create default primary profile once
      const primaryId = accountId === 'admin' ? 'admin_primary' : `prof_${accountId}_primary`;
      const primaryProf: UserProfile = {
        id: primaryId,
        name: accountId === 'admin' ? 'Quản trị viên' : accountId,
        avatar: DEFAULT_AVATARS[0],
        color: '#2563EB',
        isPrimary: true,
        createdAt: Date.now(),
      };
      await setDoc(doc(db, 'accounts', accountId, 'profiles', primaryId), sanitizeData(primaryProf));
      const newProfiles = [primaryProf];
      saveLocalProfilesCache(accountId, newProfiles);
      return newProfiles;
    } catch (e) {
      console.warn('getProfiles warning:', e);
      if (cached && cached.length > 0) {
        return cached;
      }
      const fallbackProf: UserProfile = {
        id: accountId === 'admin' ? 'admin_primary' : `prof_${accountId}_primary`,
        name: accountId === 'admin' ? 'Quản trị viên' : accountId,
        avatar: DEFAULT_AVATARS[0],
        color: '#2563EB',
        isPrimary: true,
        createdAt: Date.now(),
      };
      return [fallbackProf];
    }
  },

  async addProfile(accountId: string, newProf: Omit<UserProfile, 'id' | 'createdAt'>): Promise<UserProfile> {
    const current = await this.getProfiles(accountId);
    if (current.length >= 5) {
      throw new Error('Tài khoản đã đạt giới hạn tối đa 5 hồ sơ người xem.');
    }

    const profileId = `prof_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fullProfile: UserProfile = {
      ...newProf,
      id: profileId,
      isPrimary: false,
      createdAt: Date.now(),
    };

    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId);
    try {
      await setDoc(docRef, sanitizeData(fullProfile));
      const updatedList = [...current, fullProfile];
      saveLocalProfilesCache(accountId, updatedList);
      return fullProfile;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `accounts/${accountId}/profiles/${profileId}`);
      throw e;
    }
  },

  async updateProfile(accountId: string, profile: UserProfile): Promise<void> {
    const docRef = doc(db, 'accounts', accountId, 'profiles', profile.id);
    try {
      await setDoc(docRef, sanitizeData(profile));
      const current = getLocalProfilesCache(accountId) || [];
      const updatedList = current.map((p) => (p.id === profile.id ? profile : p));
      saveLocalProfilesCache(accountId, updatedList);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `accounts/${accountId}/profiles/${profile.id}`);
    }
  },

  async deleteProfile(accountId: string, profileId: string): Promise<void> {
    const profileRef = doc(db, 'accounts', accountId, 'profiles', profileId);
    try {
      const snap = await getDoc(profileRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        if (data.isPrimary) {
          throw new Error('Không thể xóa hồ sơ chính mặc định của tài khoản.');
        }
      }
      await deleteDoc(profileRef);
      const current = getLocalProfilesCache(accountId) || [];
      const updatedList = current.filter((p) => p.id !== profileId);
      saveLocalProfilesCache(accountId, updatedList);
    } catch (e: any) {
      if (e.message && e.message.includes('hồ sơ chính')) {
        throw e;
      }
      handleFirestoreError(e, OperationType.DELETE, `accounts/${accountId}/profiles/${profileId}`);
    }
  },

  getActiveProfileId(accountId: string): string | null {
    try {
      return localStorage.getItem(`${ACTIVE_PROFILE_KEY}_${accountId}`);
    } catch {
      return null;
    }
  },

  setActiveProfileId(accountId: string, profileId: string): void {
    try {
      localStorage.setItem(`${ACTIVE_PROFILE_KEY}_${accountId}`, profileId);
    } catch (e) {
      console.error('Error setting active profile id', e);
    }
  },

  clearActiveProfileId(accountId: string): void {
    try {
      localStorage.removeItem(`${ACTIVE_PROFILE_KEY}_${accountId}`);
    } catch (e) {
      console.error('Error clearing active profile id', e);
    }
  },

  // --- WATCH HISTORY (Per Profile) ---

  async getHistory(accountId: string, profileId: string): Promise<WatchHistoryItem[]> {
    if (!accountId || !profileId) return [];
    const historyCol = collection(db, 'accounts', accountId, 'profiles', profileId, 'history');
    try {
      const snap = await getDocs(historyCol);
      const items = snap.docs.map((d) => d.data() as WatchHistoryItem);
      return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `accounts/${accountId}/profiles/${profileId}/history`);
      return [];
    }
  },

  async saveWatchProgress(
    accountId: string,
    profileId: string,
    item: Omit<WatchHistoryItem, 'updatedAt'>
  ): Promise<void> {
    if (!accountId || !profileId) return;
    const historyDocId = item.movieSlug;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'history', historyDocId);

    const fullItem: WatchHistoryItem = {
      ...item,
      updatedAt: Date.now(),
    };

    try {
      await setDoc(docRef, sanitizeData(fullItem), { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `accounts/${accountId}/profiles/${profileId}/history/${historyDocId}`);
    }
  },

  async removeHistoryItem(accountId: string, profileId: string, movieSlug: string): Promise<void> {
    if (!accountId || !profileId) return;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'history', movieSlug);
    try {
      await deleteDoc(docRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `accounts/${accountId}/profiles/${profileId}/history/${movieSlug}`);
    }
  },

  // --- MY LIST / WATCHLIST (Per Profile) ---

  async getMyList(accountId: string, profileId: string): Promise<MyListItem[]> {
    if (!accountId || !profileId) return [];
    const listCol = collection(db, 'accounts', accountId, 'profiles', profileId, 'myList');
    try {
      const snap = await getDocs(listCol);
      const items = snap.docs.map((d) => d.data() as MyListItem);
      return items.sort((a, b) => b.addedAt - a.addedAt);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `accounts/${accountId}/profiles/${profileId}/myList`);
      return [];
    }
  },

  async toggleMyList(
    accountId: string,
    profileId: string,
    item: Omit<MyListItem, 'addedAt'>
  ): Promise<boolean> {
    if (!accountId || !profileId) return false;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'myList', item.movieSlug);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await deleteDoc(docRef);
        return false; // Removed
      } else {
        const fullItem: MyListItem = {
          ...item,
          addedAt: Date.now(),
        };
        await setDoc(docRef, sanitizeData(fullItem));
        return true; // Added
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `accounts/${accountId}/profiles/${profileId}/myList/${item.movieSlug}`);
      return false;
    }
  },

  // --- CUSTOM AVATARS GALLERY (Managed by Admin) ---

  async getCustomAvatars(): Promise<CustomAvatar[]> {
    const avatarsCol = collection(db, 'customAvatars');
    try {
      const snap = await getDocs(avatarsCol);
      const list = snap.docs.map((d) => d.data() as CustomAvatar);
      return list.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'customAvatars');
      return [];
    }
  },

  async addCustomAvatar(url: string, name: string, addedBy: string): Promise<CustomAvatar> {
    const avatarId = `av_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const docRef = doc(db, 'customAvatars', avatarId);
    const newAvatar: CustomAvatar = {
      id: avatarId,
      url,
      name: name.trim() || 'Avatar mới',
      addedBy,
      createdAt: Date.now(),
    };
    try {
      await setDoc(docRef, sanitizeData(newAvatar));
      return newAvatar;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `customAvatars/${avatarId}`);
      throw e;
    }
  },

  async deleteCustomAvatar(avatarId: string): Promise<void> {
    const docRef = doc(db, 'customAvatars', avatarId);
    try {
      await deleteDoc(docRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `customAvatars/${avatarId}`);
    }
  },

  // --- GLOBAL TV HIDDEN CHANNELS (Admin Managed) ---

  async getHiddenChannels(): Promise<string[]> {
    try {
      const docRef = doc(db, 'global', 'tv_config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return (data.hiddenUrls as string[]) || [];
      }
      return [];
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'global/tv_config');
      return [];
    }
  },

  async saveHiddenChannels(hiddenUrls: string[]): Promise<void> {
    try {
      const docRef = doc(db, 'global', 'tv_config');
      await setDoc(docRef, sanitizeData({ hiddenUrls, updatedAt: Date.now() }));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'global/tv_config');
    }
  },

  // --- MANGA SAVED & HISTORY (Per Profile) ---

  async getSavedManga(accountId: string, profileId: string): Promise<MangaItem[]> {
    if (!accountId || !profileId) return [];
    const colRef = collection(db, 'accounts', accountId, 'profiles', profileId, 'savedManga');
    try {
      const snap = await getDocs(colRef);
      return snap.docs.map((d) => d.data() as MangaItem);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `accounts/${accountId}/profiles/${profileId}/savedManga`);
      return [];
    }
  },

  async toggleSavedManga(accountId: string, profileId: string, manga: MangaItem): Promise<boolean> {
    if (!accountId || !profileId) return false;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'savedManga', manga.id);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await deleteDoc(docRef);
        return false;
      } else {
        await setDoc(docRef, sanitizeData(manga));
        return true;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `accounts/${accountId}/profiles/${profileId}/savedManga/${manga.id}`);
      return false;
    }
  },

  async getMangaHistory(accountId: string, profileId: string): Promise<MangaHistoryItem[]> {
    if (!accountId || !profileId) return [];
    const colRef = collection(db, 'accounts', accountId, 'profiles', profileId, 'mangaHistory');
    try {
      const snap = await getDocs(colRef);
      const items = snap.docs.map((d) => d.data() as MangaHistoryItem);
      return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `accounts/${accountId}/profiles/${profileId}/mangaHistory`);
      return [];
    }
  },

  async saveMangaProgress(accountId: string, profileId: string, item: MangaHistoryItem): Promise<void> {
    if (!accountId || !profileId) return;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'mangaHistory', item.mangaId);
    try {
      await setDoc(docRef, sanitizeData(item), { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `accounts/${accountId}/profiles/${profileId}/mangaHistory/${item.mangaId}`);
    }
  },

  async removeMangaHistoryItem(accountId: string, profileId: string, mangaId: string): Promise<void> {
    if (!accountId || !profileId) return;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'mangaHistory', mangaId);
    try {
      await deleteDoc(docRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `accounts/${accountId}/profiles/${profileId}/mangaHistory/${mangaId}`);
    }
  },

  // --- YOUTUBE FAVORITES & HISTORY & SUBSCRIPTIONS (Per Profile) ---

  async getYoutubeFavorites(accountId: string, profileId: string): Promise<YouTubeVideo[]> {
    if (!accountId || !profileId) return [];
    const colRef = collection(db, 'accounts', accountId, 'profiles', profileId, 'youtubeFavorites');
    try {
      const snap = await getDocs(colRef);
      const items = snap.docs.map((d) => d.data() as YouTubeVideo & { addedAt?: number });
      return items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `accounts/${accountId}/profiles/${profileId}/youtubeFavorites`);
      return [];
    }
  },

  async toggleYoutubeFavorite(accountId: string, profileId: string, video: YouTubeVideo): Promise<boolean> {
    if (!accountId || !profileId || !video.id) return false;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'youtubeFavorites', video.id);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await deleteDoc(docRef);
        return false; // Removed
      } else {
        const itemToSave = {
          ...video,
          addedAt: Date.now(),
        };
        await setDoc(docRef, sanitizeData(itemToSave));
        return true; // Added
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `accounts/${accountId}/profiles/${profileId}/youtubeFavorites/${video.id}`);
      return false;
    }
  },

  async getYoutubeHistory(accountId: string, profileId: string): Promise<YouTubeVideo[]> {
    if (!accountId || !profileId) return [];
    const colRef = collection(db, 'accounts', accountId, 'profiles', profileId, 'youtubeHistory');
    try {
      const snap = await getDocs(colRef);
      const items = snap.docs.map((d) => d.data() as YouTubeVideo & { updatedAt?: number });
      return items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 50);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `accounts/${accountId}/profiles/${profileId}/youtubeHistory`);
      return [];
    }
  },

  async saveYoutubeHistory(accountId: string, profileId: string, video: YouTubeVideo): Promise<void> {
    if (!accountId || !profileId || !video.id) return;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'youtubeHistory', video.id);
    try {
      const itemToSave = {
        ...video,
        updatedAt: Date.now(),
      };
      await setDoc(docRef, sanitizeData(itemToSave), { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `accounts/${accountId}/profiles/${profileId}/youtubeHistory/${video.id}`);
    }
  },

  async removeYoutubeHistoryItem(accountId: string, profileId: string, videoId: string): Promise<void> {
    if (!accountId || !profileId || !videoId) return;
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'youtubeHistory', videoId);
    try {
      await deleteDoc(docRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `accounts/${accountId}/profiles/${profileId}/youtubeHistory/${videoId}`);
    }
  },

  async getYoutubeSubscriptions(accountId: string, profileId: string): Promise<string[]> {
    if (!accountId || !profileId) return [];
    const colRef = collection(db, 'accounts', accountId, 'profiles', profileId, 'youtubeSubscriptions');
    try {
      const snap = await getDocs(colRef);
      return snap.docs.map((d) => (d.data().channelId as string) || d.id);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `accounts/${accountId}/profiles/${profileId}/youtubeSubscriptions`);
      return [];
    }
  },

  async toggleYoutubeSubscription(
    accountId: string,
    profileId: string,
    channelId: string,
    channelTitle?: string,
    avatarUrl?: string
  ): Promise<boolean> {
    if (!accountId || !profileId || !channelId) return false;
    // Clean key for doc ID (alphanumeric/safe)
    const docId = channelId.replace(/[\/\.#$\[\]]/g, '_');
    const docRef = doc(db, 'accounts', accountId, 'profiles', profileId, 'youtubeSubscriptions', docId);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await deleteDoc(docRef);
        return false;
      } else {
        await setDoc(
          docRef,
          sanitizeData({
            channelId,
            channelTitle: channelTitle || '',
            channelAvatar: avatarUrl || '',
            subscribedAt: Date.now(),
          })
        );
        return true;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `accounts/${accountId}/profiles/${profileId}/youtubeSubscriptions/${docId}`);
      return false;
    }
  },
};
