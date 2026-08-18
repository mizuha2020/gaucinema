import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from './firebase';
import { Account, UserProfile } from '../types';

const SESSION_ACCOUNT_KEY = 'qtb_logged_in_account_v1';
const SESSION_PROFILE_KEY = 'qtb_current_active_profile_v1';

export const DEFAULT_AVATARS: string[] = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
];

export const authService = {
  // Initialize Admin Account if not exists
  async bootstrapAdminAccount(): Promise<void> {
    const adminDocRef = doc(db, 'accounts', 'admin');
    try {
      const snap = await getDoc(adminDocRef);
      if (!snap.exists()) {
        const adminAccount: Account = {
          id: 'admin',
          username: 'admin',
          password: '123456',
          role: 'admin',
          displayName: 'Quản trị viên (Admin)',
          status: 'active',
          createdAt: Date.now(),
        };
        await setDoc(adminDocRef, sanitizeData(adminAccount));

        // Create default primary profile for admin
        const primaryProfileRef = doc(db, 'accounts', 'admin', 'profiles', 'admin_primary');
        const primaryProfile: UserProfile = {
          id: 'admin_primary',
          name: 'admin',
          avatar: DEFAULT_AVATARS[0],
          color: '#2563EB',
          isPrimary: true,
          createdAt: Date.now(),
        };
        await setDoc(primaryProfileRef, sanitizeData(primaryProfile));
      }
    } catch (e) {
      console.warn('Bootstrap admin error, retrying offline or handling rule:', e);
      handleFirestoreError(e, OperationType.GET, 'accounts/admin');
    }
  },

  // Log in with Username & Password
  async login(usernameInput: string, passwordInput: string): Promise<Account> {
    const trimmedUser = usernameInput.trim().toLowerCase();
    const trimmedPass = passwordInput.trim();

    const accountRef = doc(db, 'accounts', trimmedUser);
    try {
      const snap = await getDoc(accountRef);
      if (!snap.exists()) {
        // Double check by query if ID doesn't match lowercase
        const q = query(collection(db, 'accounts'), where('username', '==', trimmedUser));
        const querySnap = await getDocs(q);
        if (querySnap.empty) {
          throw new Error('Tài khoản không tồn tại. Vui lòng liên hệ Quản trị viên để được cấp tài khoản.');
        }
        const acc = querySnap.docs[0].data() as Account;
        if (acc.password !== trimmedPass) {
          throw new Error('Mật khẩu không chính xác!');
        }
        if (acc.status === 'blocked') {
          throw new Error('Tài khoản đã bị tạm khóa bởi Quản trị viên.');
        }
        this.saveSessionAccount(acc);
        return acc;
      }

      const acc = snap.data() as Account;
      if (acc.password !== trimmedPass) {
        throw new Error('Mật khẩu không chính xác!');
      }
      if (acc.status === 'blocked') {
        throw new Error('Tài khoản đã bị tạm khóa bởi Quản trị viên.');
      }

      this.saveSessionAccount(acc);
      return acc;
    } catch (err: any) {
      if (err.message && (err.message.includes('Mật khẩu') || err.message.includes('Tài khoản'))) {
        throw err;
      }
      handleFirestoreError(err, OperationType.GET, `accounts/${trimmedUser}`);
      throw err;
    }
  },

  // Save session in localStorage
  saveSessionAccount(account: Account): void {
    try {
      localStorage.setItem(SESSION_ACCOUNT_KEY, JSON.stringify(account));
    } catch (e) {
      console.error('Error saving session account', e);
    }
  },

  getSessionAccount(): Account | null {
    try {
      const stored = localStorage.getItem(SESSION_ACCOUNT_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error reading session account', e);
    }
    return null;
  },

  logout(): void {
    try {
      localStorage.removeItem(SESSION_ACCOUNT_KEY);
      localStorage.removeItem(SESSION_PROFILE_KEY);
    } catch (e) {
      console.error('Error on logout', e);
    }
  },

  // Admin: Get all Accounts
  async getAllAccounts(): Promise<Account[]> {
    const colRef = collection(db, 'accounts');
    try {
      const snap = await getDocs(colRef);
      const accounts: Account[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Account;
        // Count profiles
        try {
          const profilesSnap = await getDocs(collection(db, 'accounts', d.id, 'profiles'));
          data.profilesCount = profilesSnap.size;
        } catch {
          data.profilesCount = 1;
        }
        accounts.push({ ...data, id: d.id });
      }
      return accounts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'accounts');
      return [];
    }
  },

  // Admin: Create new user account (with default primary profile)
  async createAccount(username: string, password: string, displayName: string): Promise<Account> {
    const trimmedUser = username.trim().toLowerCase();
    if (!trimmedUser || trimmedUser.length < 2) {
      throw new Error('Tên đăng nhập phải có ít nhất 2 ký tự.');
    }
    if (!password || password.length < 4) {
      throw new Error('Mật khẩu phải có ít nhất 4 ký tự.');
    }

    const accountRef = doc(db, 'accounts', trimmedUser);
    try {
      const existing = await getDoc(accountRef);
      if (existing.exists()) {
        throw new Error(`Tên đăng nhập "${trimmedUser}" đã tồn tại! Vui lòng chọn tên khác.`);
      }

      const newAccount: Account = {
        id: trimmedUser,
        username: trimmedUser,
        password: password.trim(),
        role: 'user',
        displayName: displayName.trim() || trimmedUser,
        status: 'active',
        createdAt: Date.now(),
      };

      await setDoc(accountRef, sanitizeData(newAccount));

      // Create Default Primary Profile matching the username
      const primaryProfileId = `prof_${trimmedUser}_primary`;
      const primaryProfileRef = doc(db, 'accounts', trimmedUser, 'profiles', primaryProfileId);
      const primaryProfile: UserProfile = {
        id: primaryProfileId,
        name: trimmedUser,
        avatar: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
        color: '#2563EB',
        isPrimary: true,
        createdAt: Date.now(),
      };
      await setDoc(primaryProfileRef, sanitizeData(primaryProfile));

      return newAccount;
    } catch (err: any) {
      if (err.message && (err.message.includes('tồn tại') || err.message.includes('ký tự'))) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `accounts/${trimmedUser}`);
      throw err;
    }
  },

  // Admin: Update Account
  async updateAccount(
    accountId: string,
    updates: Partial<Pick<Account, 'password' | 'displayName' | 'status'>>
  ): Promise<void> {
    const accountRef = doc(db, 'accounts', accountId);
    try {
      await updateDoc(accountRef, sanitizeData({
        ...updates,
        updatedAt: Date.now(),
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `accounts/${accountId}`);
    }
  },

  // Admin: Delete Account (Cannot delete admin)
  async deleteAccount(accountId: string): Promise<void> {
    if (accountId === 'admin') {
      throw new Error('Không thể xóa tài khoản Quản trị viên gốc!');
    }
    const accountRef = doc(db, 'accounts', accountId);
    try {
      // Delete profiles subcollection
      const profSnap = await getDocs(collection(db, 'accounts', accountId, 'profiles'));
      for (const p of profSnap.docs) {
        await deleteDoc(doc(db, 'accounts', accountId, 'profiles', p.id));
      }
      await deleteDoc(accountRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `accounts/${accountId}`);
    }
  },
};
