import {
  get,
  goOffline as rtdbGoOffline,
  goOnline as rtdbGoOnline,
  onDisconnect,
  onValue,
  ref,
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
  /** Refcount tab trên cùng máy (F6): mỗi tab 1 tabId, đóng tab nào dọn tab đó.
   *  Slot chỉ trống khi hết tab. Row legacy (không có tabs) giữ hành vi cũ. */
  tabs?: Record<string, number>;
}

export type ClaimResult =
  | { ok: true; slot: '1' | '2' }
  | { ok: false; sessions: SessionSlot[]; reason: 'occupied' | 'timeout' };

const SESSIONS_PATH = 'sessions';
const DEVICE_KEY = 'qtb_device_id';
/** Định danh TAB (khác deviceId của máy): sessionStorage tồn tại theo tab —
 *  reload cùng tab giữ nguyên, tab mới id mới, đóng tab là mất. */
const TAB_KEY = 'qtb_tab_id';
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

/** Định danh tab hiện tại ( Ổn định khi reload, khác nhau giữa các tab). */
export function getTabId(): string {
  try {
    let id = window.sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as Crypto).randomUUID()
          : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch {
    return `tab_${Date.now()}_fallback`;
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
 * Thứ tự trong transaction (F6/F3):
 *  1. Slot máy này đang giữ (theo deviceId, cả row legacy) -> thêm tabId, giữ.
 *  2. Slot trống: chưa tồn tại, HOẶC zombie (mất deviceId, vd bị kick rồi
 *     update tái tạo), HOẶC hết tab (tabs rỗng — các tab đã đóng hết).
 *  3. Còn lại -> abort (hết slot).
 * Hết slot -> KHÔNG đăng xuất, trả về danh sách 2 phiên để hiện màn hình chặn.
 */
export async function claimSession(
  uid: string,
  profile: { id: string; name: string }
): Promise<ClaimResult> {
  const deviceId = getDeviceId();
  const tabId = getTabId();
  const now = Date.now();
  const basePayload: SessionSlot = {
    deviceId,
    deviceInfo: getDeviceInfo(),
    profileId: profile.id,
    profileName: profile.name,
    kind: '',
    title: '',
    startedAt: now,
  };

  let result: TransactionResult;
  try {
    result = await withTimeoutReject(
      runTransaction(
        ref(rtdb, `${SESSIONS_PATH}/${uid}`),
        (current: Record<string, SessionSlot> | null) => {
          const data: Record<string, SessionSlot> = current || {};
          // 1. Slot của chính máy này
          for (const s of SLOTS) {
            if (data[s]?.deviceId === deviceId) {
              data[s] = {
                ...basePayload,
                startedAt: data[s].startedAt || now,
                tabs: { ...(data[s].tabs || {}), [tabId]: now },
              };
              return data;
            }
          }
          // 2. Slot trống / zombie / hết tab
          for (const s of SLOTS) {
            const row = data[s];
            if (!row || !row.deviceId) {
              data[s] = { ...basePayload, tabs: { [tabId]: now } };
              return data;
            }
            if (row.tabs && Object.keys(row.tabs).length === 0) {
              data[s] = { ...basePayload, tabs: { [tabId]: now } };
              return data;
            }
          }
          // Row legacy có deviceId của máy khác (không tabs): KHÔNG cướp.
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
    return { ok: false, sessions: list, reason: 'occupied' };
  }

  // Xác định slot vừa thắng (so startedAt của chính payload này).
  const data = (result.snapshot.val() as Record<string, SessionSlot>) || {};
  let won: (typeof SLOTS)[number] = '1';
  for (const s of SLOTS) {
    const cur = data?.[s];
    if (cur?.deviceId === deviceId && cur?.startedAt === basePayload.startedAt) {
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
  // onDisconnect theo TAB (F6): đóng tab nào dọn tabId đó, tab còn lại giữ slot.
  const tabRef = ref(rtdb, `${SESSIONS_PATH}/${uid}/${won}/tabs/${tabId}`);
  await onDisconnect(tabRef).remove().catch(() => {});
  currentSlot = { uid, slot: won };
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

/** Nhả tab hiện tại khỏi slot (khi đăng xuất). Hết tab thì xóa cả node.
 *  Dùng transaction để 2 tab cùng logout không rò rỉ node rỗng. */
export async function releaseSession(): Promise<void> {
  try {
    if (!currentSlot) return;
    const { uid, slot } = currentSlot;
    const tabId = getTabId();
    const tabRef = ref(rtdb, `${SESSIONS_PATH}/${uid}/${slot}/tabs/${tabId}`);
    await onDisconnect(tabRef).cancel().catch(() => {});
    try {
      await withTimeoutReject(
        runTransaction(ref(rtdb, `${SESSIONS_PATH}/${uid}`), (current: Record<string, SessionSlot> | null) => {
          const data: Record<string, SessionSlot> = current || {};
          const row = data[slot];
          if (!row) return undefined;
          // Chỉ dọn slot của chính máy này (đề phòng state lệch)
          if (row.deviceId && row.deviceId !== getDeviceId()) return undefined;
          if (row.tabs) {
            const tabs = { ...row.tabs };
            delete tabs[tabId];
            if (Object.keys(tabs).length === 0) {
              delete (data as Record<string, unknown>)[slot];
            } else {
              row.tabs = tabs;
            }
          } else {
            // Row legacy (không tabs): hành vi cũ — nhả cả node
            delete (data as Record<string, unknown>)[slot];
          }
          return data;
        }),
        CLAIM_TIMEOUT_MS
      );
    } catch {
      // Rớt mạng giữa chừng: onDisconnect đã hủy ở trên, server sẽ... không dọn
      // được nữa. Tab còn lại (nếu có) giữ slot qua tabs của nó; hết tab thì
      // claim sau thu hồi (empty-tabs/zombie). Chấp nhận được, không chặn logout.
    }
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
