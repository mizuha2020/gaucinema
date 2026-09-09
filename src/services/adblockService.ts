import { get, onValue, ref, set } from 'firebase/database';
import { rtdb, sanitizeData } from './firebase';

/**
 * Remote adblock rules cho M3U8 cleaner.
 * Admin thêm/sửa từ khóa trên RTDB path `system_cache/adblock`,
 * client + server tự đọc mà KHÔNG cần build lại app.
 *
 * Shape RTDB:
 * {
 *   keywords: string[],  // substring match, case-insensitive, vd "/v9/", "convertv"
 *   regexes: string[],   // regex match trên URI lowercase, vd "\\/v\\d+\\/"
 *   updatedAt: number
 * }
 */

export const ADBLOCK_RTDB_PATH = 'system_cache/adblock';
const LOCAL_CACHE_KEY = 'qtb_adblock_rules_v1';

/** Rule cứng fallback khi offline / RTDB chưa có — phải đồng bộ với server.ts
 * CHỈ giữ pattern độ tin cậy cao, có delimiter để tránh cắt nhầm nội dung:
 * - 'ads' trần từng match cả '/uploads/' (uplo-ads) -> phải dùng '/ads/' có delimiter
 * - '/ad' trần từng match '/adult', '/address', '/admin' -> dùng '/ad/' có delimiter
 * - ĐÃ BỎ: '/segment_', 'segment_00', regex \/v\d+\/ (trùng tên segment HLS chuẩn
 *   và path CDN versioned — cắt là mất luôn đoạn phim thật, vd quảng cáo chữ
 *   burned-in ở Hồ Tâm tập 12 không phải segment riêng nên không được cắt).
 */
export const DEFAULT_ADBLOCK_KEYWORDS: string[] = [
  'quangcao',
  'quang-cao',
  'preroll',
  'midroll',
  'adservice',
  'doubleclick',
  'convertv',
  '/convert',
  'advert',
  '/ads/',
  '/ad/',
  '_ad_',
  '-ad-',
  '.ad.',
  '/promo',
  '_promo',
  '-promo',
  '/banner',
  '_banner',
  '-banner',
];

export const DEFAULT_ADBLOCK_REGEXES: string[] = [];

export interface AdblockRules {
  keywords: string[];
  regexes: string[];
  updatedAt?: number;
}

function normalizeKeywords(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const k of list) {
    const s = String(k ?? '').trim().toLowerCase();
    if (s.length >= 2 && !out.includes(s)) out.push(s);
    if (out.length >= 200) break;
  }
  return out;
}

function normalizeRegexes(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const r of list) {
    const s = String(r ?? '').trim();
    if (!s || out.includes(s)) continue;
    try {
      // Validate compile được mới nhận
      // eslint-disable-next-line no-new
      new RegExp(s, 'i');
      out.push(s);
    } catch {
      // bỏ qua regex lỗi
    }
    if (out.length >= 50) break;
  }
  return out;
}

class AdblockService {
  private keywords: string[] = [...DEFAULT_ADBLOCK_KEYWORDS];
  private regexes: string[] = [...DEFAULT_ADBLOCK_REGEXES];
  private compiled: RegExp[] = [];
  private initialized = false;
  private listeners = new Set<(rules: AdblockRules) => void>();

  constructor() {
    this.recompile();
    this.loadFromLocalCache();
    // Refresh RTDB nền (không block UI)
    this.refresh().catch(() => {});
    this.ensureSubscription();
  }

  private recompile() {
    this.compiled = [];
    for (const src of this.regexes) {
      try {
        this.compiled.push(new RegExp(src, 'i'));
      } catch {
        // skip
      }
    }
  }

  private loadFromLocalCache() {
    try {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AdblockRules>;
      const kw = normalizeKeywords(parsed.keywords);
      const rx = normalizeRegexes(parsed.regexes);
      if (kw.length > 0) this.keywords = kw;
      if (rx.length > 0) {
        this.regexes = rx;
        this.recompile();
      }
    } catch {
      // ignore
    }
  }

  private saveToLocalCache() {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(
        LOCAL_CACHE_KEY,
        JSON.stringify({ keywords: this.keywords, regexes: this.regexes, updatedAt: Date.now() })
      );
    } catch {
      // ignore
    }
  }

  private applyRules(kw: string[], rx: string[], updatedAt?: number) {
    let changed = false;
    if (kw.length > 0 && JSON.stringify(kw) !== JSON.stringify(this.keywords)) {
      this.keywords = kw;
      changed = true;
    }
    if (rx.length > 0 && JSON.stringify(rx) !== JSON.stringify(this.regexes)) {
      this.regexes = rx;
      this.recompile();
      changed = true;
    }
    if (changed) {
      this.saveToLocalCache();
      this.notify();
    }
    return changed;
  }

  private notify() {
    const snap = this.getRules();
    for (const cb of this.listeners) {
      try {
        cb(snap);
      } catch {
        // ignore
      }
    }
  }

  private ensureSubscription() {
    try {
      if (!rtdb) return;
      onValue(
        ref(rtdb, ADBLOCK_RTDB_PATH),
        (snap) => {
          const data = snap.val() as Partial<AdblockRules> | null;
          if (!data) return;
          this.applyRules(normalizeKeywords(data.keywords), normalizeRegexes(data.regexes), data.updatedAt);
        },
        () => {}
      );
    } catch {
      // ignore
    }
  }

  /** Đọc 1 lần từ RTDB (dùng khi mở màn admin / cần force refresh) */
  async refresh(): Promise<AdblockRules> {
    try {
      if (rtdb) {
        const snap = await get(ref(rtdb, ADBLOCK_RTDB_PATH));
        if (snap.exists()) {
          const data = snap.val() as Partial<AdblockRules>;
          const kw = normalizeKeywords(data?.keywords);
          const rx = normalizeRegexes(data?.regexes);
          // Nếu RTDB có key nhưng rỗng -> giữ rule hiện tại (tránh admin xóa nhầm làm mất chặn)
          this.applyRules(kw.length > 0 ? kw : this.keywords, rx.length > 0 ? rx : this.regexes, data?.updatedAt);
        }
      }
    } catch {
      // offline -> dùng cache/default
    }
    this.initialized = true;
    return this.getRules();
  }

  getRules(): AdblockRules {
    return { keywords: [...this.keywords], regexes: [...this.regexes] };
  }

  /** Sync check — dùng trong m3u8Cleaner (hot path, không async) */
  matches(uri: string): boolean {
    const l = (uri || '').toLowerCase();
    if (!l) return false;
    for (const k of this.keywords) {
      if (k && l.includes(k)) return true;
    }
    for (const re of this.compiled) {
      try {
        if (re.test(l)) return true;
      } catch {
        // skip
      }
    }
    return false;
  }

  subscribe(cb: (rules: AdblockRules) => void): () => void {
    this.listeners.add(cb);
    cb(this.getRules());
    // Đảm bảo có data mới nhất sau subscribe
    this.refresh().catch(() => {});
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Admin ghi rules mới lên RTDB (ghi đè toàn bộ) */
  async saveRules(keywords: string[], regexes: string[]): Promise<AdblockRules> {
    const kw = normalizeKeywords(keywords);
    const rx = normalizeRegexes(regexes);
    if (kw.length === 0) throw new Error('Cần ít nhất 1 từ khóa');
    const payload: AdblockRules = { keywords: kw, regexes: rx, updatedAt: Date.now() };
    if (!rtdb) throw new Error('Chưa kết nối Firebase');
    await set(ref(rtdb, ADBLOCK_RTDB_PATH), sanitizeData(payload));
    this.applyRules(kw, rx.length > 0 ? rx : this.regexes, payload.updatedAt);
    return this.getRules();
  }

  async resetToDefaults(): Promise<AdblockRules> {
    return this.saveRules(DEFAULT_ADBLOCK_KEYWORDS, DEFAULT_ADBLOCK_REGEXES);
  }
}

export const adblockService = new AdblockService();
