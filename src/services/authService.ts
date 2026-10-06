import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { auth, db, sanitizeData } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { Account, UserProfile } from '../types';

// ---------------------------------------------------------------------------
// Hằng số (Prompt 2 — Firebase Auth thật)
// ---------------------------------------------------------------------------

/** Đuôi email nội bộ: user gõ username, app tự ghép thành email Firebase Auth. */
const AUTH_EMAIL_DOMAIN = 'gaucinema.local';
/** Giới hạn nhóm kín: tối đa 50 tài khoản. */
const MAX_ACCOUNTS = 50;
/** Mật khẩu tối thiểu 8 ký tự. */
const MIN_PASSWORD_LENGTH = 8;
/** Hiện banner cảnh báo khi còn dưới 7 ngày sử dụng. */
const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_AVATARS: string[] = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
];

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

// Helper with timeout to prevent hanging on Firestore queries
function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => {
        reject(new Error('Yêu cầu kết nối hết thời gian chờ.'));
      }, timeoutMs)
    ),
  ]);
}

/**
 * Cộng N tháng lịch vào mốc thời gian, xử lý tràn ngày.
 * Ví dụ: 31/01 + 1 tháng -> 28/02 (hoặc 29/02 năm nhuận), không nhảy sang 03/03.
 */
export function addCalendarMonths(fromMs: number, months: number): number {
  const base = new Date(fromMs);
  const day = base.getDate();
  const target = new Date(base);
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDayOfTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDayOfTarget));
  return target.getTime();
}

export function formatExpiryDate(expiresAt: number): string {
  try {
    return new Date(expiresAt).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return new Date(expiresAt).toLocaleDateString('vi-VN');
  }
}

async function readAccountDoc(uid: string): Promise<Account | null> {
  const snap = await withTimeout(getDoc(doc(db, 'accounts', uid)));
  if (!snap.exists()) return null;
  const data = snap.data() as Account;
  return { ...data, id: snap.id, uid: (data.uid || snap.id) as string };
}

function checkBlocked(acc: Account): void {
  if (acc.status === 'blocked') {
    throw new Error('Tài khoản đã bị quản trị viên tạm khóa.');
  }
}

function checkExpired(acc: Account): void {
  // Tài khoản admin không có thời hạn.
  if (acc.role === 'admin') return;
  if (acc.expiresAt && acc.expiresAt < Date.now()) {
    throw new Error(
      `Tài khoản đã hết hạn sử dụng (hết hạn ngày ${formatExpiryDate(acc.expiresAt)}). Vui lòng liên hệ quản trị viên để gia hạn.`
    );
  }
}

function mapSignInError(err: any): Error {
  const code = String(err?.code || '');
  if (code === 'auth/user-not-found') {
    return new Error('Tài khoản không tồn tại. Vui lòng liên hệ Quản trị viên để được cấp tài khoản.');
  }
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
    return new Error('Tên đăng nhập hoặc mật khẩu không chính xác!');
  }
  if (code === 'auth/too-many-requests') {
    return new Error('Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.');
  }
  if (code === 'auth/network-request-failed') {
    return new Error('Không kết nối được máy chủ. Vui lòng kiểm tra mạng rồi thử lại.');
  }
  return new Error(err?.message || 'Không thể đăng nhập. Vui lòng thử lại.');
}

export const authService = {
  /**
   * Đăng nhập bằng username + password.
   * User vẫn gõ username như cũ, app tự ghép đuôi email nội bộ.
   */
  async login(usernameInput: string, passwordInput: string): Promise<Account> {
    const trimmedUser = usernameInput.trim().toLowerCase();
    const trimmedPass = passwordInput.trim();

    if (!trimmedUser || !trimmedPass) {
      throw new Error('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
    }

    let uid: string;
    try {
      const cred = await signInWithEmailAndPassword(auth, usernameToEmail(trimmedUser), trimmedPass);
      uid = cred.user.uid;
    } catch (err: any) {
      throw mapSignInError(err);
    }

    const acc = await readAccountDoc(uid).catch(() => null);
    if (!acc) {
      await signOut(auth).catch(() => {});
      throw new Error('Tài khoản chưa được khởi tạo dữ liệu. Vui lòng liên hệ quản trị viên.');
    }

    try {
      checkBlocked(acc);
      checkExpired(acc);
    } catch (e) {
      await signOut(auth).catch(() => {});
      throw e;
    }

    return acc;
  },

  /**
   * Nguồn sự thật duy nhất của phiên đăng nhập.
   * Firebase Auth tự lưu phiên trong IndexedDB và tự khôi phục khi mở lại app.
   */
  subscribeAuth(onChange: (account: Account | null, notice?: string | null) => void): () => void {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        onChange(null);
        return;
      }
      let acc: Account | null = null;
      try {
        acc = await readAccountDoc(user.uid);
      } catch {
        // Lỗi mạng/tạm thời: giữ phiên Firebase, báo null để về màn hình đăng nhập.
        // User đăng nhập lại khi có mạng (không signOut để token còn dùng được).
        onChange(null, 'Không tải được thông tin tài khoản. Vui lòng kiểm tra mạng và đăng nhập lại.');
        return;
      }
      if (!acc) {
        await signOut(auth).catch(() => {});
        onChange(null, 'Tài khoản chưa được khởi tạo dữ liệu. Vui lòng liên hệ quản trị viên.');
        return;
      }
      if (acc.status === 'blocked') {
        await signOut(auth).catch(() => {});
        onChange(null, 'Tài khoản đã bị quản trị viên tạm khóa.');
        return;
      }
      if (acc.role !== 'admin' && acc.expiresAt && acc.expiresAt < Date.now()) {
        await signOut(auth).catch(() => {});
        onChange(
          null,
          `Tài khoản đã hết hạn sử dụng (hết hạn ngày ${formatExpiryDate(acc.expiresAt as number)}). Vui lòng liên hệ quản trị viên để gia hạn.`
        );
        return;
      }
      onChange(acc);
    });
  },

  async logout(): Promise<void> {
    await signOut(auth).catch(() => {});
  },

  // Admin: Get all Accounts
  async getAllAccounts(): Promise<Account[]> {
    try {
      const snap = await withTimeout(getDocs(collection(db, 'accounts')), 10000);
      const accounts: Account[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Account;
        let profilesCount = 1;
        try {
          const profilesSnap = await getDocs(collection(db, 'accounts', d.id, 'profiles'));
          profilesCount = profilesSnap.size;
        } catch {
          // giữ mặc định
        }
        accounts.push({ ...data, id: d.id, uid: (data.uid || d.id) as string, profilesCount });
      }
      return accounts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
      return [];
    }
  },

  /**
   * Admin tạo tài khoản mà không bị đăng xuất (dùng Firebase app instance thứ hai).
   * Giới hạn tối đa 50 tài khoản. Document id PHẢI là Firebase Auth uid.
   * TUYỆT ĐỐI không lưu mật khẩu vào Firestore dưới bất kỳ dạng nào.
   */
  async createAccount(
    username: string,
    password: string,
    displayName: string,
    months = 1
  ): Promise<Account> {
    const trimmedUser = username.trim().toLowerCase();
    if (!trimmedUser || trimmedUser.length < 2) {
      throw new Error('Tên đăng nhập phải có ít nhất 2 ký tự.');
    }
    if (!password || password.trim().length < MIN_PASSWORD_LENGTH) {
      throw new Error('Mật khẩu phải có ít nhất 8 ký tự.');
    }
    const validMonths = Math.floor(Number(months));
    if (!Number.isFinite(validMonths) || validMonths < 1 || validMonths > 12) {
      throw new Error('Thời hạn phải từ 1 đến 12 tháng.');
    }

    // Giới hạn tối đa 50 tài khoản
    const existingSnap = await withTimeout(getDocs(collection(db, 'accounts')), 10000).catch(() => null);
    if (existingSnap && existingSnap.size >= MAX_ACCOUNTS) {
      throw new Error(`Đã đạt tối đa ${MAX_ACCOUNTS} tài khoản. Không thể tạo thêm.`);
    }
    if (existingSnap) {
      const dup = existingSnap.docs.some((d) => String((d.data() as Account).username || '').toLowerCase() === trimmedUser);
      if (dup) {
        throw new Error(`Tên đăng nhập "${trimmedUser}" đã tồn tại! Vui lòng chọn tên khác.`);
      }
    } else {
      // Fallback kiểm tra theo username nếu không đếm được collection
      const q = query(collection(db, 'accounts'), where('username', '==', trimmedUser));
      const qsnap = await withTimeout(getDocs(q)).catch(() => null);
      if (qsnap && !qsnap.empty) {
        throw new Error(`Tên đăng nhập "${trimmedUser}" đã tồn tại! Vui lòng chọn tên khác.`);
      }
    }

    // Tạo Auth user trên instance thứ hai để không đá admin ra ngoài.
    const creatorApp = initializeApp(firebaseConfig, 'userCreator');
    let uid: string;
    try {
      const creatorAuth = getAuth(creatorApp);
      const cred = await createUserWithEmailAndPassword(
        creatorAuth,
        usernameToEmail(trimmedUser),
        password.trim()
      );
      uid = cred.user.uid;
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/email-already-in-use') {
        throw new Error(`Tên đăng nhập "${trimmedUser}" đã tồn tại! Vui lòng chọn tên khác.`);
      }
      if (code === 'auth/weak-password') {
        throw new Error('Mật khẩu phải có ít nhất 8 ký tự.');
      }
      throw new Error(err?.message || 'Không thể tạo tài khoản. Vui lòng thử lại.');
    } finally {
      await deleteApp(creatorApp).catch(() => {});
    }

    const now = Date.now();
    const newAccount: Account = {
      id: uid,
      uid,
      username: trimmedUser,
      role: 'user',
      displayName: displayName.trim() || trimmedUser,
      status: 'active',
      createdAt: now,
      expiresAt: addCalendarMonths(now, validMonths),
    };

    await setDoc(doc(db, 'accounts', uid), sanitizeData(newAccount));

    // Tạo hồ sơ chính mặc định
    const primaryProfileId = `prof_${trimmedUser}_primary`;
    const primaryProfile: UserProfile = {
      id: primaryProfileId,
      name: displayName.trim() || trimmedUser,
      avatar: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
      color: '#2563EB',
      isPrimary: true,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, 'accounts', uid, 'profiles', primaryProfileId), sanitizeData(primaryProfile)).catch(() => {});

    return newAccount;
  },

  /**
   * Admin cập nhật displayName / status.
   * KHÔNG đổi được mật khẩu của user khác ở bước này (cần Admin SDK — Prompt 5).
   */
  async updateAccount(
    accountId: string,
    updates: Partial<Pick<Account, 'displayName' | 'status'>>
  ): Promise<void> {
    await setDoc(
      doc(db, 'accounts', accountId),
      sanitizeData({ ...updates, updatedAt: Date.now() }),
      { merge: true }
    );
  },

  /** User tự đổi mật khẩu của mình. */
  async changeOwnPassword(newPassword: string): Promise<void> {
    if (!newPassword || newPassword.trim().length < MIN_PASSWORD_LENGTH) {
      throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự.');
    }
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.');
    }
    try {
      await updatePassword(user, newPassword.trim());
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/requires-recent-login') {
        throw new Error('Vì lý do bảo mật, vui lòng đăng xuất rồi đăng nhập lại trước khi đổi mật khẩu.');
      }
      throw new Error(err?.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.');
    }
  },

  // TODO (Prompt 5 — cần firebase-admin ở server):
  // - Admin đổi mật khẩu của user khác: POST /api/admin/users/:uid/password
  // - Admin gia hạn tài khoản: POST /api/admin/users/:uid/extend
  // Client TUYỆT ĐỐI không tự bịa cách đổi mật khẩu/giãn hạn cho người khác.

  /**
   * Xóa Firestore của tài khoản (subcollection + document).
   * Chặn cứng tài khoản admin và tự xóa chính mình.
   * NOTE: Chưa xóa được Firebase Auth user ở bước này (cần Admin SDK — Prompt 5).
   */
  async deleteAccount(accountId: string): Promise<void> {
    const snap = await getDoc(doc(db, 'accounts', accountId)).catch(() => null);
    const data = snap && snap.exists() ? (snap.data() as Account) : null;
    if (data && data.role === 'admin') {
      throw new Error('Không thể xóa tài khoản Quản trị viên!');
    }
    if (auth.currentUser && accountId === auth.currentUser.uid) {
      throw new Error('Không thể xóa tài khoản đang đăng nhập.');
    }

    const profilesSnap = await getDocs(collection(db, 'accounts', accountId, 'profiles')).catch(() => null);
    if (profilesSnap) {
      for (const pDoc of profilesSnap.docs) {
        await deleteDoc(pDoc.ref).catch(() => {});
      }
    }
    await deleteDoc(doc(db, 'accounts', accountId));
    // TODO (Prompt 5): gọi DELETE /api/admin/users/:uid để xóa Firebase Auth user
    // bằng admin.auth().deleteUser(uid). Hiện tại Auth user còn tồn tại nhưng không
    // còn document nên không đăng nhập vào app được nữa.
  },

  /** Thông tin hạn dùng phục vụ banner cảnh báo (< 7 ngày). */
  getExpiryInfo(account: Account | null): { daysLeft: number | null; dateStr: string | null; expiringSoon: boolean } {
    if (!account || account.role === 'admin' || !account.expiresAt) {
      return { daysLeft: null, dateStr: null, expiringSoon: false };
    }
    const msLeft = account.expiresAt - Date.now();
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    return {
      daysLeft,
      dateStr: formatExpiryDate(account.expiresAt),
      expiringSoon: msLeft > 0 && msLeft < EXPIRY_WARNING_MS,
    };
  },
};
