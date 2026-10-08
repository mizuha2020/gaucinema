import {
  get,
  goOffline as rtdbGoOffline,
  goOnline as rtdbGoOnline,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  update,
  type TransactionResult,
} from 'firebase/database';
import { rtdb, sanitizeData } from './firebase';

// ---------------------------------------------------------------------------
// Giới hạn 2 thiết bị cùng lúc (Prompt 4 — PHẦN B)
// Slot cố định sessions/{uid}/1|2 trên RTDB (có onDisconnect tự dọn).
// ---------------------------------------------------------------------------

export interface SessionSlot {
  slot?: '1' | '2';
  deviceId: string;
  deviceInfo: string;
  profileId: string;
  profileName: string;
  kind: 'movie' | 'manga' | '';
  title: string;
  startedAt: number;
}

export type ClaimResult =
  | { ok: true; slot: '1' | '2' }
  | { ok: false; sessions: SessionSlot[]; reason: 'occupied' | 'timeout' };

const SESSIONS_PATH = 'sessions';
const DEVICE_KEY = 'qtb_device_id';
const CLAIM_TIMEOUT_MS = 10000;
/** Tab ẩn liên tục quá 30 phút -> nhả slot (tránh chiếm chỗ khi để quên). */
const HIDDEN_TIMEOUT_MS = 30 * 60 * 1000;

const SLOTS = ['1', '2'] as const;

let currentSlot: { uid: string; slot: string } | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenHandler: (() => void) | null = null;

/** Định danh thiết bị: ngẫu nhiên lần đầu, lưu localStorage, dùng lại các lần sau. */
export function getDeviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as Crypto).randomUUID()
          : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `dev_${Date.now()}_fallback`;
  }
}

export function getDeviceInfo(): string {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    // Nhận diện mobile bằng UA + touch, KHÔNG dùng chiều rộng cửa sổ
    // (3 cửa sổ để cạnh nhau trên desktop cũng hẹp <768px).
    const mobileUa = /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    let touch = false;
    try {
      touch =
        (typeof navigator !== 'undefined' && (navigator as any).maxTouchPoints > 0) ||
        (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
    } catch {
      touch = false;
    }
    return mobileUa || touch ? 'Mobile' : 'Desktop / Web';
  } catch {
    return 'Desktop / Web';
  }
}

function withTimeoutReject<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('RTDB_TIMEOUT')), ms)
    ),
  ]);
}

/**
 * Chiếm slot NGAY KHI VÀO APP (trong onAuthStateChanged), không phải khi bấm xem.
 * Dùng TRANSACTION nguyên tử (đọc+sửa 1 bước ở server): nhiều máy claim cùng
 * lúc cũng chỉ 1 bên thắng mỗi slot — đọc-rồi-ghi thường sẽ cùng thấy "trống"
 * rồi ghi đè nhau (3 máy cùng vào được).
 * Thứ tự: giữ slot cũ của chính máy này trước, rồi mới lấy slot trống đầu
 * tiên. Hết slot -> KHÔNG đăng xuất, trả về danh sách 2 phiên để hiện màn
 * hình chặn.
 */
export async function claimSession(
  uid: string,
  profile: { id: string; name: string }
): Promise<ClaimResult> {
  const deviceId = getDeviceId();
  const shortId = String(deviceId).slice(0, 8);
  const payload: SessionSlot = {
    deviceId,
    deviceInfo: getDeviceInfo(),
    profileId: profile.id,
    profileName: profile.name,
    kind: '',
    title: '',
    startedAt: Date.now(),
  };

  let result: TransactionResult;
  try {
    result = await withTimeoutReject(
      runTransaction(
        ref(rtdb, `${SESSIONS_PATH}/${uid}`),
        (current: Record<string, SessionSlot> | null) => {
          const data: Record<string, SessionSlot> = current || {};
          if (data['1']?.deviceId === deviceId) {
            data['1'] = payload;
            return data;
          }
          if (data['2']?.deviceId === deviceId) {
            data['2'] = payload;
            return data;
          }
          if (!data['1']) {
            data['1'] = payload;
            return data;
          }
          if (!data['2']) {
            data['2'] = payload;
            return data;
          }
          return undefined; // abort: hết slot
        }
      ),
      CLAIM_TIMEOUT_MS
    );
  } catch {
    // Kết nối RTDB lỗi/timeout (kể cả chạm trần 100 connect) -> báo timeout,
    // hiện thông báo thử lại, KHÔNG đăng xuất.
    return { ok: false, sessions: [], reason: 'timeout' };
  }

  if (!result.committed) {
    const data = (result.snapshot.val() as Record<string, SessionSlot>) || {};
    const list: SessionSlot[] = [];
    for (const s of SLOTS) {
      const cur = data?.[s];
      if (cur) list.push({ ...cur, slot: s });
    }
    try {
      console.log(
        `[slot-claim] ABORT device=${shortId} holders=[${list.map((x) => `${x.slot}:${String(x.deviceId).slice(0, 8)}`).join(',')}]`
      );
    } catch {
      // ignore
    }
    return { ok: false, sessions: list, reason: 'occupied' };
  }

  // Xác định slot vừa thắng (so startedAt của chính payload này).
  const data = (result.snapshot.val() as Record<string, SessionSlot>) || {};
  let won: (typeof SLOTS)[number] = '1';
  for (const s of SLOTS) {
    const cur = data?.[s];
    if (cur?.deviceId === deviceId && cur?.startedAt === payload.startedAt) {
      won = s;
      break;
    }
  }
  if (data?.[won]?.deviceId !== deviceId) {
    // Dự phòng: cùng máy 2 tab đua nhau (startedAt khác nhau) — cùng 1 slot.
    for (const s of SLOTS) {
      if (data?.[s]?.deviceId === deviceId) {
        won = s;
        break;
      }
    }
  }
  const slotRef = ref(rtdb, `${SESSIONS_PATH}/${uid}/${won}`);
  // RTDB tự xóa node khi client mất kết nối/đóng tab/sập trình duyệt/rớt mạng.
  await onDisconnect(slotRef).remove().catch(() => {});
  currentSlot = { uid, slot: won };
  try {
    console.log(`[slot-claim] WIN device=${shortId} slot=${won}`);
  } catch {
    // ignore
  }
  return { ok: true, slot: won };
}

/** Cập nhật nội dung đang xem vào slot đang giữ (để admin nhìn thấy). */
export async function updateSessionActivity(
  uid: string,
  patch: Partial<Pick<SessionSlot, 'profileId' | 'profileName' | 'kind' | 'title'>>
): Promise<void> {
  try {
    if (!currentSlot || currentSlot.uid !== uid) return;
    await update(
      ref(rtdb, `${SESSIONS_PATH}/${uid}/${currentSlot.slot}`),
      sanitizeData({ ...patch })
    ).catch(() => {});
  } catch {
    // ignore — hiển thị admin thiếu thì thôi, không chặn xem
  }
}

/** Nhả slot đang giữ (khi đăng xuất). */
export async function releaseSession(): Promise<void> {
  try {
    if (!currentSlot) return;
    const slotRef = ref(rtdb, `${SESSIONS_PATH}/${currentSlot.uid}/${currentSlot.slot}`);
    await onDisconnect(slotRef).cancel().catch(() => {});
    await remove(slotRef).catch(() => {});
  } catch {
    // ignore
  } finally {
    currentSlot = null;
  }
}

export function getCurrentSlot(): { uid: string; slot: string } | null {
  return currentSlot;
}

/** Thiết bị bị chặn phải ngắt websocket để không tốn connect (trần 100). */
export function goOfflineDb(): void {
  try {
    rtdbGoOffline(rtdb);
  } catch {
    // ignore
  }
}

/** Mở lại kết nối (khi bấm "Thử lại" hoặc đăng xuất xong). */
export function goOnlineDb(): void {
  try {
    rtdbGoOnline(rtdb);
  } catch {
    // ignore
  }
}

/** Đọc sessions/{uid} MỘT LẦN (không listener thường trực — dùng cho màn hình
 *  chặn và xử lý 409, để thiết bị bị chặn không giữ kết nối sống). */
export async function fetchSessions(uid: string): Promise<SessionSlot[]> {
  try {
    const snap = await withTimeoutReject(get(ref(rtdb, `${SESSIONS_PATH}/${uid}`)), CLAIM_TIMEOUT_MS);
    const val = (snap.val() as Record<string, SessionSlot>) || {};
    const list: SessionSlot[] = [];
    for (const s of SLOTS) {
      const cur = val?.[s];
      if (cur) list.push({ ...cur, slot: s });
    }
    return list;
  } catch {
    return [];
  }
}

/** Theo dõi RTDB sessions/{uid} theo thời gian thực (admin xem ai đang xem gì). */
export function subscribeSessions(uid: string, cb: (slots: SessionSlot[]) => void): () => void {
  try {
    return onValue(
      ref(rtdb, `${SESSIONS_PATH}/${uid}`),
      (snap) => {
        const val = (snap.val() as Record<string, SessionSlot>) || {};
        const list: SessionSlot[] = [];
        for (const s of SLOTS) {
          const cur = val?.[s];
          if (cur) list.push({ ...cur, slot: s });
        }
        cb(list);
      },
      () => cb([])
    );
  } catch {
    return () => {};
  }
}

/**
 * Tab ẩn liên tục quá 30 phút -> coi như bỏ quên -> nhả slot + đăng xuất.
 * Gọi sau khi chiếm slot thành công, dừng khi logout/unmount.
 */
export function startHiddenWatch(onExpired: () => void): () => void {
  stopHiddenWatch();
  const arm = () => {
    clearHiddenTimer();
    hiddenTimer = setTimeout(() => {
      onExpired();
    }, HIDDEN_TIMEOUT_MS);
  };
  const clearHiddenTimer = () => {
    if (hiddenTimer) {
      clearTimeout(hiddenTimer);
      hiddenTimer = null;
    }
  };
  hiddenHandler = () => {
    try {
      if (document.visibilityState === 'hidden') arm();
      else clearHiddenTimer();
    } catch {
      // ignore
    }
  };
  try {
    document.addEventListener('visibilitychange', hiddenHandler);
  } catch {
    // ignore
  }
  return stopHiddenWatch;
}

export function stopHiddenWatch(): void {
  try {
    if (hiddenTimer) {
      clearTimeout(hiddenTimer);
      hiddenTimer = null;
    }
    if (hiddenHandler) {
      document.removeEventListener('visibilitychange', hiddenHandler);
      hiddenHandler = null;
    }
  } catch {
    // ignore
  }
}
