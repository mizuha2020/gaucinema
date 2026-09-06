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
export async function loadCleanedM3u8Url(rawUrl: string): Promise<{ blobUrl: string; removed: number } | null> {
  if (!rawUrl || !rawUrl.startsWith('http')) return null;
  // Refresh rule chặn QC nền (không await để không chậm phát video)
  try {
    adblockService.refresh().catch(() => {});
  } catch {
    // ignore
  }
  try {
    let content = await fetchText(rawUrl);
    if (content.includes('#EXT-X-STREAM-INF')) {
      const lines = content.split(/\r?\n/);
      type Variant = { bw: number; uri: string };
      const variants: Variant[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('#EXT-X-STREAM-INF')) {
          const m = lines[i].match(/BANDWIDTH=(\d+)/);
          const bw = m ? parseInt(m[1], 10) : 0;
          const next = (lines[i + 1] || '').trim();
          if (next && !next.startsWith('#')) {
            variants.push({ bw, uri: next.startsWith('http') ? next : resolveUrl(rawUrl, next) });
          }
        }
      }
      if (variants.length > 0) {
        variants.sort((a, b) => b.bw - a.bw);
        const best = variants[0].uri;
        content = await fetchText(best);
        const { cleaned, removed } = cleanMediaPlaylist(content, best);
        if (!cleaned.includes('#EXTM3U')) return null;
        const blob = new Blob([cleaned], { type: 'application/vnd.apple.mpegurl' });
        return { blobUrl: URL.createObjectURL(blob), removed };
      }
      return null;
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

export function revokeBlobUrl(url: string | null) {
  try {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  } catch { /* ignore */ }
}
