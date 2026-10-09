/**
 * Bầu chọn tab duy nhất khi 2 tab CHIA CÙNG tabId.
 *
 * Chuột phải -> Duplicate Tab sẽ copy cả sessionStorage nên 2 tab chung
 * `qtb_tab_id`, claim RTDB không phân biệt được (cố tình chặn ở claim sẽ đá
 * cả tab gốc vì cùng id). Kênh BroadcastChannel chỉ tốn local, không tốn
 * Firebase: tab nào mở sau (load lớn hơn) tự rút lui vào màn hình chặn.
 * Tab ẩn danh/store khác partition không nghe thấy nhau — nhưng khác tabId
 * nên đã bị chặn ở tầng claim (tab-limit).
 *
 * Không có BroadcastChannel (WebView quá cũ) -> fail-open như hiện tại.
 */

// Giờ mở tab này (2 tab cùng máy chung đồng hồ nên so được).
const TAB_LOAD = Date.now();
const ELECTION_WINDOW_MS = 1500;

// Định danh phiên tab CHỈ trong memory (không persist): 2 tab duplicate
// chung tabId nhưng khác instanceId nên mới phân biệt được.
let instance: string | null = null;

function getInstance(): string {
  if (!instance) {
    try {
      instance = (crypto as Crypto).randomUUID();
    } catch {
      instance = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }
  return instance;
}

type Msg =
  | { kind: 'hello'; tabId: string; instance: string; load: number }
  | { kind: 'older'; tabId: string; to: string; load: number };

/**
 * Bắt đầu bầu chọn cho tabId này. Gọi sau khi claim slot thành công, giữ
 * listener suốt phiên để tab duplicate mở sau vẫn bị bắt.
 * @returns hàm dừng (gọi khi logout/block/unmount).
 */
export function startTabElection(tabId: string, onDuplicate: () => void): () => void {
  const noop = () => {};
  if (!tabId) return noop;
  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel === 'undefined') return noop;
    bc = new BroadcastChannel('gaucinema_tab_election_v1');
  } catch {
    return noop;
  }
  const me = getInstance();
  const channel: BroadcastChannel = bc;
  let stopped = false;
  let settled = false;

  const done = (dup: boolean) => {
    if (settled || stopped) return;
    settled = true;
    if (dup) {
      try {
        onDuplicate();
      } catch {
        // ignore
      }
    }
  };

  const onMessage = (e: MessageEvent) => {
    try {
      const m = e.data as Msg;
      if (!m || m.tabId !== tabId) return;
      if ((m as { instance?: string }).instance === me) return;
      if (m.kind === 'hello') {
        // Tab khác chung tabId: ai mở trước (load nhỏ hơn) ở lại, báo cho nó.
        if (m.load > TAB_LOAD || (m.load === TAB_LOAD && m.instance > me)) {
          try {
            channel.postMessage({ kind: 'older', tabId, to: m.instance, load: TAB_LOAD });
          } catch {
            // ignore
          }
        }
        // Nó mở trước -> nó sẽ reply older, mình chờ ở timer dưới.
      } else if (m.kind === 'older' && (m as { to: string }).to === me) {
        done(true);
      }
    } catch {
      // ignore
    }
  };

  try {
    channel.addEventListener('message', onMessage);
  } catch {
    try {
      (channel as unknown as { onmessage: unknown }).onmessage = onMessage;
    } catch {
      // ignore
    }
  }
  try {
    channel.postMessage({ kind: 'hello', tabId, instance: me, load: TAB_LOAD });
  } catch {
    // ignore
  }
  const timer = setTimeout(() => done(false), ELECTION_WINDOW_MS);

  return () => {
    stopped = true;
    try {
      clearTimeout(timer);
    } catch {
      // ignore
    }
    try {
      channel.removeEventListener('message', onMessage);
    } catch {
      // ignore
    }
    try {
      channel.close();
    } catch {
      // ignore
    }
  };
}
