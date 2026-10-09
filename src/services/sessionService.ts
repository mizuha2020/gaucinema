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
  /** Refcount tab trên cùng máy (F6): mỗi tab 1 tabId, đóng tab nào dọn tab đó.
   *  Slot chỉ trống khi hết tab. Row legacy (không có tabs) giữ hành vi cũ. */
  tabs?: Record<string, number>;
}

export type ClaimResult =
  | { ok: true; slot: '1' | '2' }
  | { ok: false; sessions: SessionSlot[]; reason: 'occupied' | 'timeout' | 'tab-limit' };

const SESSIONS_PATH = 'sessions';
const DEVICE_KEY = 'qtb_device_id';
/** Định danh TAB (khác deviceId của máy): sessionStorage tồn tại theo tab —
 *  reload cùng tab giữ nguyên, tab mới id mới, đóng tab là mất. */
const TAB_KEY = 'qtb_tab_id';
const CLAIM_TIMEOUT_MS = 10000;
/** Ngân sách cho transaction xóa slot lúc logout (ngắn hơn claim để tổng
 *  release không vượt race ở handleLogout). */
const RELEASE_TX_TIMEOUT_MS = 5000;
/** Tab ẩn liên tục quá 30 phút -> nhả slot (tránh chiếm chỗ khi để quên). */
const HIDDEN_TIMEOUT_MS = 30 * 60 * 1000;

const SLOTS = ['1', '2'] as const;

let currentSlot: { uid: string; slot: string } | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenHandler: (() => void) | null = null;

/** Persist slot đang giữ vào sessionStorage (dự phòng currentSlot in-memory
 *  bị mất, vd HMR/reload lỗi giữa chừng): logout vẫn biết cần xóa uid/slot
 *  nào thay vì return sớm và kẹt node RTDB. */
const SLOT_KEY = 'qtb_slot';

function persistSlot(uid: string, slot: string): void {
  try {
    window.sessionStorage.setItem(SLOT_KEY, JSON.stringify({ uid, slot }));
  } catch {
    // ignore
  }
}

function readPersistedSlot(): { uid: string; slot: string } | null {
  try {
    const raw = window.sessionStorage.getItem(SLOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: unknown; slot?: unknown };
    if (
      typeof parsed.uid === 'string' &&
      (parsed.slot === '1' || parsed.slot === '2')
    ) {
      return { uid: parsed.uid, slot: parsed.slot };
    }
    return null;
  } catch {
    return null;
  }
}

function clearPersistedSlot(): void {
  try {
    window.sessionStorage.removeItem(SLOT_KEY);
  } catch {
    // ignore
  }
}

/** Chờ socket RTDB nối lại sau goOnlineDb (tối đa timeoutMs). Release gọi
 *  transaction ngay khi socket chưa nối sẽ ăn RTDB_TIMEOUT rồi rớt vào
 *  fallback trong lúc offline -> kẹt node mà không một dòng log nào. */
async function waitForConnected(timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const snap = await withTimeoutReject(
        get(ref(rtdb, '.info/connected')),
        500
      );
      if (snap.val() === true) return true;
    } catch {
      // ignore — thử lại tới hết deadline
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/** Định danh thiết bị: ngẫu nhiên lần đầu, lưu localStorage, dùng lại các lần sau.
 *  Fallback BẮT BUỘC ổn định trong phiên (biến module): nếu storage ném lỗi
 *  (vd chặn cookie), mỗi lần gọi sinh id mới sẽ làm claim và release lệch
 *  nhau -> slot kẹt vĩnh viễn mà không một dòng log nào. */
let memDeviceId: string | null = null;

export function getDeviceId(): string {
  if (memDeviceId) return memDeviceId;
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as Crypto).randomUUID()
          : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    memDeviceId = id;
    return id;
  } catch {
    if (!memDeviceId) {
      memDeviceId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    return memDeviceId;
  }
}

/** Định danh tab hiện tại ( Ổn định khi reload, khác nhau giữa các tab).
 *  Fallback ổn định trong phiên như getDeviceId (lý do tương tự). */
let memTabId: string | null = null;

export function getTabId(): string {
  if (memTabId) return memTabId;
  try {
    let id = window.sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as Crypto).randomUUID()
          : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(TAB_KEY, id);
    }
    memTabId = id;
    return id;
  } catch {
    if (!memTabId) {
      memTabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    return memTabId;
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

/** Row nào coi như TRỐNG và được thu hồi/purge:
 *  - chưa tồn tại / mất deviceId (zombie, vd bị kick rồi update tái tạo), hoặc
 *  - không có tabs / tabs rỗng (các tab đã đóng hết — onDisconnect chỉ xóa
 *    leaf tabs/{tabId}, node cha còn lại).
 *  Row legacy (client cũ, không tabs) giờ cũng coi như trống: toàn bộ client
 *  đã cùng bản có tabs nên không còn phiên legacy sống để bảo vệ. */
function isRowFree(row: SessionSlot | null | undefined): boolean {
  if (!row) return true;
  if (!row.deviceId) return true;
  const tabs = row.tabs ? Object.keys(row.tabs) : [];
  return tabs.length === 0;
}

/**
 * Chiếm slot NGAY KHI VÀO APP (trong onAuthStateChanged), không phải khi bấm xem.
 * Dùng TRANSACTION nguyên tử (đọc+sửa 1 bước ở server): nhiều máy claim cùng
 * lúc cũng chỉ 1 bên thắng mỗi slot — đọc-rồi-ghi thường sẽ cùng thấy "trống"
 * rồi ghi đè nhau (3 máy cùng vào được).
 *  Thứ tự trong transaction (F6/F3):
 *  1. Slot máy này đang giữ (theo deviceId, còn tab sống) -> thêm tabId, giữ.
 *     1 MÁY CHỈ 1 TAB: tabId lạ mà slot còn tab sống -> abort để caller hiện
 *     màn hình chặn tab (kiểu Netflix), không gộp tab, không chiếm slot khác.
 *  2. Slot trống: chưa tồn tại, HOẶC zombie (mất deviceId), HOẶC hết tab
 *     (tabs rỗng HOẶC mất hẳn — các tab đã đóng hết, onDisconnect chỉ xóa
 *     leaf tabs/{tabId} nên node cha còn lại) -> chiếm mới.
 *  Orphan trống khác (nếu còn) cũng bị purge trong cùng transaction.
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
          const data: Record<string, SessionSlot> = { ...(current || {}) };
          // Purge orphan trống (zombie / hết tab) để DB không tích node chết.
          for (const s of SLOTS) {
            if (data[s] && isRowFree(data[s])) {
              delete (data as Record<string, unknown>)[s];
            }
          }
          // 1. Slot của chính máy này — nhưng 1 MÁY CHỈ 1 TAB: tabId lạ mà
          // slot còn tab sống -> abort (caller map thành tab-limit), không
          // gộp tab, không chiếm slot khác. Reload cùng tab (tabId cũ còn)
          // hoặc slot đã hết tab -> gộp/chiếm như thường.
          let tabLimited = false;
          for (const s of SLOTS) {
            if (data[s]?.deviceId === deviceId) {
              const liveTabs = data[s].tabs ? Object.keys(data[s].tabs) : [];
              if (liveTabs.includes(tabId) || liveTabs.length === 0) {
                data[s] = {
                  ...basePayload,
                  startedAt: data[s].startedAt || now,
                  tabs: { ...(data[s].tabs || {}), [tabId]: now },
                };
                return data;
              }
              tabLimited = true;
              break;
            }
          }
          if (tabLimited) return undefined; // abort -> tab-limit
          // 2. Slot trống đầu tiên
          for (const s of SLOTS) {
            if (!data[s]) {
              data[s] = { ...basePayload, tabs: { [tabId]: now } };
              return data;
            }
          }
          return undefined; // abort: hết slot (cả 2 đều là máy khác còn sống)
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
    // Tab-limit: row của máy mình còn tab sống mà không có tabId này ->
    // máy đã mở tab khác, tab này ăn màn hình chặn (kiểu Netflix).
    for (const s of SLOTS) {
      const row = data?.[s];
      if (row?.deviceId === deviceId) {
        const liveTabs = row.tabs ? Object.keys(row.tabs) : [];
        if (liveTabs.length > 0 && !liveTabs.includes(tabId)) {
          return { ok: false, sessions: [{ ...row, slot: s }], reason: 'tab-limit' };
        }
      }
    }
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
  persistSlot(uid, won);
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

/** Nhả slot khi đăng xuất: xóa CẢ slot của máy này (mọi tabId cùng deviceId),
 *  vì signOut Firebase lan sang mọi tab cùng browser — tab còn lại không còn
 *  auth để tự dọn (rules yêu cầu auth) nên chỉ xóa 1 tabId sẽ rò rỉ.
 *  Dùng transaction để 2 tab cùng logout không rò rỉ node rỗng.
 *  Trả về true khi slot của mình đã sạch (hoặc vốn đã sạch), false khi
 *  thất bại để caller retry + toast — KHÔNG im lặng như trước. */
export async function releaseSession(): Promise<boolean> {
  const target = currentSlot || readPersistedSlot();
  if (!target) {
    try {
      console.warn('[session] release skip: no currentSlot');
    } catch {
      // ignore
    }
    return true;
  }
  const { uid, slot } = target;
  const deviceId = getDeviceId();
  const tabId = getTabId();
  const tabRef = ref(rtdb, `${SESSIONS_PATH}/${uid}/${slot}/tabs/${tabId}`);
  const slotRef = ref(rtdb, `${SESSIONS_PATH}/${uid}/${slot}`);
  try {
    rtdbGoOnline(rtdb);
  } catch {
    // ignore
  }
  const t0 = Date.now();
  const slog = (msg: string, extra?: unknown) => {
    try {
      console.warn(`[session] ${msg} (+${Date.now() - t0}ms)`, extra ?? '');
    } catch {
      // ignore
    }
  };
  // 1. Đo online (chẩn đoán, tối đa 1s — không chặn release).
  const connected = await waitForConnected(1000);
  if (!connected) {
    slog('release: socket chưa online sau goOnline 1s (vẫn thử xóa tiếp)');
  }
  // 2. Hủy onDisconnect — BẮT BUỘC có timeout: offline mà await trần sẽ treo
  // vĩnh viễn, race ở handleLogout nổ rồi signOut giết write đang queue.
  try {
    await withTimeoutReject(onDisconnect(tabRef).cancel(), 1500);
  } catch {
    // ignore — tiếp tục xóa (bản ghi onDisconnect sót sẽ tự xóa leaf, vô hại)
  }
  try {
    const result = await withTimeoutReject(
      runTransaction(
        ref(rtdb, `${SESSIONS_PATH}/${uid}`),
        (current: Record<string, SessionSlot> | null) => {
          if (!current) return undefined; // đã sạch — abort, coi như xong
          const data: Record<string, SessionSlot> = { ...current };
          const row = data[slot];
          if (!row) {
            // Slot đã mất: abort, caller check snapshot để coi như xong.
            return undefined;
          }
          const mine =
            !!row.deviceId && row.deviceId === deviceId;
          // Chỉ dọn slot của chính máy này, hoặc orphan trống (không tab sống
          // — vd các tab đóng hết chỉ còn node cha). Slot máy khác còn sống
          // thì không đụng.
          if (!mine && !isRowFree(row)) return undefined;
          delete (data as Record<string, unknown>)[slot];
          // Purge luôn orphan trống còn lại (nếu có) cho sạch DB.
          for (const s of SLOTS) {
            if (s !== slot && data[s] && isRowFree(data[s])) {
              delete (data as Record<string, unknown>)[s];
            }
          }
          // Trả null để xóa hẳn sessions/{uid} khi hết slot (tránh node {} rỗng).
          if (Object.keys(data).length === 0) return null as unknown as Record<string, SessionSlot>;
          return data;
        }
      ),
      RELEASE_TX_TIMEOUT_MS
    );
    const snapVal = result.snapshot.val() as Record<string, SessionSlot> | null;
    if (!result.committed) {
      // Abort: hoặc đã sạch, hoặc slot máy khác còn sống — đọc snapshot.
      const gone = !snapVal || !snapVal[slot];
      if (gone) {
        currentSlot = null;
        clearPersistedSlot();
        return true;
      }
      slog('release: transaction abort, slot còn trên RTDB', {
        slot,
        rtdbDeviceId: snapVal?.[slot]?.deviceId,
        localDeviceId: deviceId,
        rtdbTabs: snapVal?.[slot]?.tabs ? Object.keys(snapVal[slot].tabs || {}) : null,
        localTabId: tabId,
      });
      return false;
    }
    try {
      console.info(`[session] released slot ${slot} (+${Date.now() - t0}ms)`);
    } catch {
      // ignore
    }
    currentSlot = null;
    clearPersistedSlot();
    return true;
  } catch (err) {
    // Fallback khi transaction treo/lỗi: xóa thẳng cả slot nếu là của máy
    // mình hoặc orphan trống. Mọi await đều có bound để không treo logout.
    slog('release: transaction lỗi, fallback xóa thẳng slot', {
      slot,
      message: err instanceof Error ? err.message : String(err),
    });
    try {
      const snap = await withTimeoutReject(get(slotRef), 2000);
      const val = snap.val() as SessionSlot | null;
      // Slot của máy mình hoặc orphan trống (kể cả mất hẳn tabs) -> xóa cả
      // node cho sạch; slot máy khác còn sống thì không đụng.
      if (!val || (val.deviceId && val.deviceId === deviceId) || isRowFree(val)) {
        await withTimeoutReject(remove(slotRef), 2000);
        try {
          console.info(`[session] released slot ${slot} via fallback (+${Date.now() - t0}ms)`);
        } catch {
          // ignore
        }
      } else {
        slog('release: fallback giữ nguyên (slot máy khác còn sống)');
        return false;
      }
      currentSlot = null;
      clearPersistedSlot();
      return true;
    } catch (err2) {
      slog('release: fallback thất bại', {
        message: err2 instanceof Error ? err2.message : String(err2),
      });
      return false;
    }
  }
}

/** Tab sắp đóng (pagehide): xóa nhanh leaf tab của mình (fire-and-forget,
 *  không await vì browser không cho nhiều thời gian). onDisconnect đã đăng ký
 *  lúc claim là lưới an toàn phía server. Node cha còn lại (nếu hết tab) sẽ
 *  được claim/logout sau purge — xem isRowFree. */
export function notifyTabClosing(): void {
  try {
    const target = currentSlot || readPersistedSlot();
    if (!target) return;
    const tabId = getTabId();
    void remove(ref(rtdb, `${SESSIONS_PATH}/${target.uid}/${target.slot}/tabs/${tabId}`)).catch(() => {});
  } catch {
    // ignore
  }
}

export function getCurrentSlot(): { uid: string; slot: string } | null {
  return currentSlot || readPersistedSlot();
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
