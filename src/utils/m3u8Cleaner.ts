// Client-side M3U8 ad-cleaner (same rules as server.ts /api/proxy/m3u8).
// Runs in the browser so it uses the client's VN IP (works) instead of the
// cloud server IP (blocked -> 502/404). Upstream sends CORS *, so fetch works.
//
// Rule cứng bên dưới là fallback offline. Rule động do admin cấu hình trên
// RTDB `system_cache/adblock` (qua adblockService) được check thêm —
// upstream đổi pattern chỉ cần sửa trên admin, không build lại app.
import { adblockService } from '../services/adblockService';

function isAdSegmentUri(uri: string): boolean {
  const l = (uri || '').toLowerCase();
  if (!l) return false;
  if (
    l.includes('/ad') || l.includes('/ad.') || l.includes('_ad.') || l.includes('-ad.') || l.includes('.ad.') || l.includes('ads') ||
    l.includes('quangcao') || l.includes('quang-cao') || l.includes('promo') ||
    l.includes('preroll') || l.includes('midroll') || l.includes('banner') ||
    l.includes('intro') || l.includes('advert')
  ) return true;
  if (l.includes('convertv') || l.includes('/convert')) return true;
  // SSAI injected ad path versioned: /v7/, /v8/, /v9/... + segment_*.ts
  // Phim này (Khánh Khánh Nhật Thường tập 01): /v7/<hash>/segment_*.ts
  if (/\/v\d+\//.test(l)) return true;
  if (l.includes('/segment_') || l.includes('segment_00')) return true;
  if (l.includes('adservice') || l.includes('doubleclick')) return true;
  // Rule động từ RTDB (admin thêm không cần build lại app)
  try {
    if (adblockService.matches(l)) return true;
  } catch {
    // ignore
  }
  return false;
}

function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).toString();
  } catch {
    return relative;
  }
}

export function cleanMediaPlaylist(content: string, baseUrl: string): { cleaned: string; removed: number } {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let pendingExtInf: string | null = null;
  let pendingDiscontinuity = false;
  let removed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { out.push(line); continue; }
    if (trimmed.startsWith('#EXT-X-DISCONTINUITY')) {
      pendingDiscontinuity = true;
      continue;
    }
    if (trimmed.startsWith('#EXTINF')) {
      pendingExtInf = line;
      continue;
    }
    if (trimmed.startsWith('#')) {
      if (pendingExtInf) { out.push(pendingExtInf); pendingExtInf = null; }
      if (pendingDiscontinuity) { out.push('#EXT-X-DISCONTINUITY'); pendingDiscontinuity = false; }
      out.push(line);
      continue;
    }
    const uri = trimmed;
    const absolute = uri.startsWith('http') ? uri : resolveUrl(baseUrl, uri);
    if (isAdSegmentUri(absolute) || isAdSegmentUri(uri)) {
      pendingExtInf = null;
      pendingDiscontinuity = false;
      removed++;
      continue;
    }
    if (pendingExtInf) { out.push(pendingExtInf); pendingExtInf = null; }
    if (pendingDiscontinuity) { out.push('#EXT-X-DISCONTINUITY'); pendingDiscontinuity = false; }
    out.push(absolute);
  }
  return { cleaned: out.join('\n'), removed };
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { Accept: '*/*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch m3u8 from client IP, strip ad segments, return a blob: URL.
 * Returns null if fetch/clean fails (caller falls back to direct/proxy).
 */
export interface CleanedM3u8 {
  blobUrl: string;
  removed: number;
  /** variant blob URLs khi master multivariant – caller revoke chung với blobUrl */
  extraBlobs?: string[];
}
export async function loadCleanedM3u8Url(rawUrl: string): Promise<CleanedM3u8 | null> {
  if (!rawUrl || !rawUrl.startsWith('http')) return null;
  // Refresh rule chặn QC nền (không await để không chậm phát video)
  try {
    adblockService.refresh().catch(() => {});
  } catch {
    // ignore
  }
  try {
    const content = await fetchText(rawUrl);
    if (content.includes('#EXT-X-STREAM-INF')) {
      // Master multivariant: GIỮ NGUYÊN cấu trúc để player ABR + tua mượt
      // (gộp về 1 variant max-bitrate như trước khiến seek phải tải segment nặng -> lag).
      // Clean từng variant rồi trỏ master sang blob tương ứng.
      const lines = content.split(/\r?\n/);
      const variantUris: { lineIdx: number; uri: string }[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('#EXT-X-STREAM-INF')) {
          const next = (lines[i + 1] || '').trim();
          if (next && !next.startsWith('#')) {
            variantUris.push({ lineIdx: i + 1, uri: next.startsWith('http') ? next : resolveUrl(rawUrl, next) });
          }
        }
      }
      if (variantUris.length === 0) return null;
      const cleanedVariants = await Promise.all(
        variantUris.slice(0, 8).map(async (v) => {
          try {
            const media = await fetchText(v.uri);
            if (!media.includes('#EXTM3U')) return null;
            const { cleaned, removed } = cleanMediaPlaylist(media, v.uri);
            if (!cleaned.includes('#EXTM3U')) return null;
            const blob = new Blob([cleaned], { type: 'application/vnd.apple.mpegurl' });
            return { lineIdx: v.lineIdx, url: URL.createObjectURL(blob), removed };
          } catch {
            return null;
          }
        })
      );
      const ok = cleanedVariants.filter(Boolean) as { lineIdx: number; url: string; removed: number }[];
      if (ok.length === 0) return null;
      const extraBlobs: string[] = [];
      let removed = 0;
      for (const c of ok) {
        lines[c.lineIdx] = c.url;
        extraBlobs.push(c.url);
        removed += c.removed;
      }
      // Variant nào clean fail thì giữ URI gốc (absolute) để player vẫn đủ level
      for (const v of variantUris) {
        if (!ok.some((c) => c.lineIdx === v.lineIdx)) lines[v.lineIdx] = v.uri;
      }
      const master = new Blob([lines.join('\n')], { type: 'application/vnd.apple.mpegurl' });
      return { blobUrl: URL.createObjectURL(master), removed, extraBlobs };
    }
    if (content.includes('#EXTM3U')) {
      const { cleaned, removed } = cleanMediaPlaylist(content, rawUrl);
      const blob = new Blob([cleaned], { type: 'application/vnd.apple.mpegurl' });
      return { blobUrl: URL.createObjectURL(blob), removed };
    }
    return null;
  } catch {
    return null;
  }
}

export function revokeBlobUrl(url: string | string[] | null | undefined) {
  try {
    const list = Array.isArray(url) ? url : [url];
    for (const u of list) {
      if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
    }
  } catch { /* ignore */ }
}
