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
import { db, sanitizeData } from './firebase';
import { Account, UserProfile } from '../types';

const SESSION_ACCOUNT_KEY = 'qtb_logged_in_account_v1';
const SESSION_PROFILE_KEY = 'qtb_current_active_profile_v1';
const PASSWORD_SALT = 'qtb_cinema_secure_salt_2026';

// Helper with timeout to prevent hanging on Firestore queries
function withTimeout<T>(promise: Promise<T>, timeoutMs = 4500, fallbackVal?: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve, reject) =>
      setTimeout(() => {
        if (fallbackVal !== undefined) {
          resolve(fallbackVal);
        } else {
          reject(new Error('Yêu cầu kết nối hết thời gian chờ.'));
        }
      }, timeoutMs)
    ),
  ]);
}

// Hash password with SHA-256 using Web Crypto API
export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password + PASSWORD_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Check if string matches a 64-char hex SHA-256 hash
function isSha256Hash(str: string): boolean {
  return /^[a-f0-9]{64}$/i.test(str);
}

export const DEFAULT_AVATARS: string[] = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
];

export const authService = {
  // Ensure default Admin Account exists without overwriting custom password
  async bootstrapAdminAccount(forceReset = false): Promise<Account> {
    const adminDocRef = doc(db, 'accounts', 'admin');
    const hashedDefaultPass = await hashPassword('Admin@2026!');

    try {
      if (!forceReset) {
        const snap = await getDoc(adminDocRef);
        if (snap.exists()) {
          return snap.data() as Account;
        }
      }
    } catch (e) {
      console.warn('Admin account check warning:', e);
    }

    const adminAccount: Account = {
      id: 'admin',
      username: 'admin',
      password: hashedDefaultPass,
      role: 'admin',
      displayName: 'Quản trị viên (Admin)',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await setDoc(adminDocRef, sanitizeData(adminAccount), { merge: true });
      // Only set primary profile if no profiles exist
      const profilesCol = collection(db, 'accounts', 'admin', 'profiles');
      const profilesSnap = await getDocs(profilesCol).catch(() => null);
      if (!profilesSnap || profilesSnap.empty) {
        const primaryProfileRef = doc(db, 'accounts', 'admin', 'profiles', 'admin_primary');
        const primaryProfile: UserProfile = {
          id: 'admin_primary',
          name: 'Quản trị viên',
          avatar: DEFAULT_AVATARS[0],
          color: '#2563EB',
          isPrimary: true,
          createdAt: Date.now(),
        };
        await setDoc(primaryProfileRef, sanitizeData(primaryProfile), { merge: true });
      }
    } catch (e) {
      console.warn('Admin bootstrap save warning:', e);
    }

    return adminAccount;
  },

  // Log in
  async login(usernameInput: string, passwordInput: string): Promise<Account> {
    const trimmedUser = usernameInput.trim().toLowerCase();
    const trimmedPass = passwordInput.trim();

    if (!trimmedUser || !trimmedPass) {
      throw new Error('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
    }

    const hashedInput = await hashPassword(trimmedPass);
    const accountRef = doc(db, 'accounts', trimmedUser);

    try {
      // Fetch account with 4.5s timeout
      const snap = await withTimeout(getDoc(accountRef), 4500).catch((e) => {
        console.warn('Account getDoc timeout/warning:', e);
        return null;
      });

      let acc: Account | null = null;
      let targetDocRef = accountRef;

      if (snap && snap.exists()) {
        acc = snap.data() as Account;
      } else {
        // Query by username field as secondary lookup
        try {
          const q = query(collection(db, 'accounts'), where('username', '==', trimmedUser));
          const querySnap = await withTimeout(getDocs(q), 3500);
          if (querySnap && !querySnap.empty) {
            acc = querySnap.docs[0].data() as Account;
            targetDocRef = doc(db, 'accounts', querySnap.docs[0].id);
          }
        } catch {
          // Ignore query error
        }
      }

      // Special handling for admin if not found in Firestore yet
      if (!acc && trimmedUser === 'admin') {
        const bootstrapped = await this.bootstrapAdminAccount(false);
        acc = bootstrapped;
      }

      if (!acc) {
        throw new Error('Tài khoản không tồn tại. Vui lòng liên hệ Quản trị viên để được cấp tài khoản.');
      }

      // Validate password
      const storedPass = String(acc.password || '').trim();

      const isPasswordValid =
        storedPass === hashedInput ||
        storedPass === trimmedPass;

      if (!isPasswordValid) {
        throw new Error('Mật khẩu không chính xác!');
      }

      // Upgrade plaintext password to SHA-256 hash if needed
      if (!isSha256Hash(storedPass)) {
        updateDoc(targetDocRef, {
          password: hashedInput,
          updatedAt: Date.now(),
        }).catch((err) => console.warn('Background auto-hash password error:', err));
        acc.password = hashedInput;
      }

      if (acc.status === 'blocked') {
        throw new Error('Tài khoản đã bị tạm khóa bởi Quản trị viên.');
      }

      this.saveSessionAccount(acc);
      return acc;
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('Mật khẩu') ||
          err.message.includes('Tài khoản') ||
          err.message.includes('tạm khóa') ||
          err.message.includes('đầy đủ'))
      ) {
        throw err;
      }
      console.error('Login error:', err);

      // Emergency offline/fallback for admin login if network fails
      if (trimmedUser === 'admin' && trimmedPass === 'Admin@2026!') {
        const adminAcc = await this.bootstrapAdminAccount(false);
        this.saveSessionAccount(adminAcc);
        return adminAcc;
      }

      throw new Error(err.message || 'Không thể đăng nhập. Vui lòng kiểm tra lại mật khẩu hoặc kết nối mạng.');
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
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.username) {
          return parsed as Account;
        } else {
          localStorage.removeItem(SESSION_ACCOUNT_KEY);
        }
      }
    } catch (e) {
      console.error('Error reading session account', e);
      try {
        localStorage.removeItem(SESSION_ACCOUNT_KEY);
      } catch {}
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
      const snap = await withTimeout(getDocs(colRef), 4000);
      const accounts: Account[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Account;
        try {
          const profilesSnap = await getDocs(collection(db, 'accounts', d.id, 'profiles'));
          data.profilesCount = profilesSnap.size;
        } catch {
          data.profilesCount = 1;
        }
        accounts.push({ ...data, id: d.id });
      }

      // Ensure admin exists in list
      if (!accounts.some((a) => a.username === 'admin')) {
        const adminAcc = await this.bootstrapAdminAccount(false);
        accounts.unshift(adminAcc);
      }

      return accounts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (err) {
      console.warn('getAllAccounts error:', err);
      return [];
    }
  },

  // Admin: Create new user account (with hashed password & default primary profile)
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
      const existing = await withTimeout(getDoc(accountRef), 3500).catch(() => null);
      if (existing && existing.exists()) {
        throw new Error(`Tên đăng nhập "${trimmedUser}" đã tồn tại! Vui lòng chọn tên khác.`);
      }

      const hashedPassword = await hashPassword(password.trim());
      const newAccount: Account = {
        id: trimmedUser,
        username: trimmedUser,
        password: hashedPassword,
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
        name: displayName.trim() || trimmedUser,
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
      console.error('createAccount error:', err);
      throw new Error(err.message || 'Không thể tạo tài khoản');
    }
  },

  // Admin: Update Account (hash password if updated)
  async updateAccount(
    accountId: string,
    updates: Partial<Pick<Account, 'password' | 'displayName' | 'status'>>
  ): Promise<void> {
    const accountRef = doc(db, 'accounts', accountId);
    try {
      const sanitizedUpdates: any = {
        ...updates,
        updatedAt: Date.now(),
      };
      if (updates.password && updates.password.trim()) {
        sanitizedUpdates.password = await hashPassword(updates.password.trim());
      }
      await setDoc(accountRef, sanitizeData(sanitizedUpdates), { merge: true });

      // If updating current active session account, update localStorage
      const currentSession = this.getSessionAccount();
      if (currentSession && currentSession.id === accountId) {
        this.saveSessionAccount({
          ...currentSession,
          ...sanitizedUpdates,
        });
      }
    } catch (err) {
      console.error('updateAccount error:', err);
      throw err;
    }
  },

  // Admin: Delete Account (Cannot delete admin)
  async deleteAccount(accountId: string): Promise<void> {
    if (accountId === 'admin') {
      throw new Error('Không thể xóa tài khoản Quản trị viên gốc!');
    }
    const accountRef = doc(db, 'accounts', accountId);
    try {
      const profilesSnap = await getDocs(collection(db, 'accounts', accountId, 'profiles'));
      for (const pDoc of profilesSnap.docs) {
        await deleteDoc(pDoc.ref);
      }
      await deleteDoc(accountRef);
    } catch (err) {
      console.error('deleteAccount error:', err);
      throw err;
    }
  },
};
