import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Account } from '../types';

/**
 * Ghép đôi TV bằng mã 6 ký tự (thay cho gõ password bằng remote).
 * Luồng: TV tạo mã -> hiện mã to -> user nhập mã trên ĐT đã login
 * (menu tài khoản > "Ghép đôi TV") -> TV tự đăng nhập.
 * Mã sống 5 phút, dùng 1 lần rồi xóa.
 */

export const TV_PAIR_TTL_MS = 5 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I/L dễ nhầm
const CODE_LEN = 6;

export interface TvPairDoc {
  code: string;
  status: 'pending' | 'approved';
  createdAt: number;
  expiresAt: number;
  accountId?: string;
  username?: string;
  displayName?: string;
  approvedAt?: number;
}

function randomCode(): string {
  let s = '';
  const arr = new Uint32Array(CODE_LEN);
  try {
    crypto.getRandomValues(arr);
  } catch {
    for (let i = 0; i < CODE_LEN; i++) arr[i] = Math.floor(Math.random() * 0xffffffff);
  }
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[arr[i] % CODE_CHARS.length];
  return s;
}

export function normalizePairCode(input: string): string {
  return (input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .slice(0, CODE_LEN);
}

function pairRef(code: string) {
  return doc(db, 'tvPairCodes', code);
}

export const tvPairService = {
  /** TV gọi: tạo mã mới (thử lại nếu trùng). */
  async createCode(): Promise<TvPairDoc> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomCode();
      const ref = pairRef(code);
      const existing = await getDoc(ref).catch(() => null);
      if (existing && existing.exists()) continue;
      const now = Date.now();
      const payload: TvPairDoc = {
        code,
        status: 'pending',
        createdAt: now,
        expiresAt: now + TV_PAIR_TTL_MS,
      };
      await setDoc(ref, payload);
      return payload;
    }
    throw new Error('Không tạo được mã ghép đôi, vui lòng thử lại.');
  },

  /** TV gọi: nghe trạng thái mã (pending -> approved). */
  subscribeCode(code: string, cb: (d: TvPairDoc | null) => void): () => void {
    try {
      return onSnapshot(pairRef(code), (snap) => {
        if (!snap.exists()) {
          cb(null);
          return;
        }
        cb(snap.data() as TvPairDoc);
      });
    } catch {
      return () => {};
    }
  },

  /** ĐT gọi: duyệt mã, gắn tài khoản đang login vào. */
  async approveCode(code: string, account: Account): Promise<void> {
    const normalized = normalizePairCode(code);
    if (normalized.length !== CODE_LEN) {
      throw new Error('Mã ghép đôi phải gồm 6 ký tự.');
    }
    const snap = await getDoc(pairRef(normalized));
    if (!snap.exists()) {
      throw new Error('Mã không tồn tại hoặc đã hết hạn. Kiểm tra lại mã trên TV.');
    }
    const data = snap.data() as TvPairDoc;
    if (data.status === 'approved') {
      throw new Error('Mã này đã được dùng. Hãy tạo mã mới trên TV.');
    }
    if (Date.now() > data.expiresAt) {
      await deleteDoc(pairRef(normalized)).catch(() => {});
      throw new Error('Mã đã hết hạn (5 phút). Hãy tạo mã mới trên TV.');
    }
    await updateDoc(pairRef(normalized), {
      status: 'approved',
      accountId: account.id,
      username: account.username,
      displayName: account.displayName || account.username,
      approvedAt: Date.now(),
    });
  },

  /** TV gọi sau khi thấy approved: lấy full account rồi xóa mã (dùng 1 lần). */
  async consumeApproved(code: string): Promise<Account> {
    const snap = await getDoc(pairRef(code));
    if (!snap.exists()) throw new Error('Mã ghép đôi đã hết hạn.');
    const data = snap.data() as TvPairDoc;
    if (data.status !== 'approved' || !data.accountId) {
      throw new Error('Mã chưa được duyệt trên điện thoại.');
    }
    const accSnap = await getDoc(doc(db, 'accounts', data.accountId));
    await deleteDoc(pairRef(code)).catch(() => {});
    if (!accSnap.exists()) throw new Error('Không tìm thấy tài khoản đã duyệt.');
    const acc = { ...(accSnap.data() as Account), id: accSnap.id };
    if (acc.status === 'blocked') throw new Error('Tài khoản đã bị tạm khóa.');
    return acc;
  },

  /** TV gọi khi hủy/bấm tạo mã mới: xóa mã cũ. */
  async revoke(code: string): Promise<void> {
    await deleteDoc(pairRef(code)).catch(() => {});
  },
};
