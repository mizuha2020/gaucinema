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
import { CustomAvatar, MyListItem, UserProfile, WatchHistoryItem } from '../types';
import { DEFAULT_AVATARS } from './authService';

const ACTIVE_PROFILE_KEY = 'qtb_active_profile_id_v2';

export const firestoreStorage = {
  // --- PROFILES MANAGEMENT (Max 5 per account) ---

  async getProfiles(accountId: string): Promise<UserProfile[]> {
    if (!accountId) return [];
    const profilesCol = collection(db, 'accounts', accountId, 'profiles');
    try {
      const snap = await getDocs(profilesCol);
      if (snap.empty) {
        // Fallback: If for any reason no profile exists, create the primary profile
        const primaryId = `prof_${accountId}_primary`;
        const primaryProf: UserProfile = {
          id: primaryId,
          name: accountId,
          avatar: DEFAULT_AVATARS[0],
          color: '#2563EB',
          isPrimary: true,
          createdAt: Date.now(),
        };
        await setDoc(doc(db, 'accounts', accountId, 'profiles', primaryId), sanitizeData(primaryProf));
        return [primaryProf];
      }

      const profiles = snap.docs.map((d) => d.data() as UserProfile);
      return profiles.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `accounts/${accountId}/profiles`);
      return [];
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
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `accounts/${accountId}/profiles/${profile.id}`);
    }
  },

  async deleteProfile(accountId: string, profileId: string): Promise<void> {
    // Check if is primary
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
};
