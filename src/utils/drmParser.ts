import { Channel } from '../types';

/**
 * Utility to convert Base64 or Base64URL string to 32-character lowercase Hex string.
 */
export function base64ToHex(b64: string): string {
  try {
    let clean = b64.trim().replace(/-/g, '+').replace(/_/g, '/');
    while (clean.length % 4 !== 0) {
      clean += '=';
    }
    const binary = atob(clean);
    let hex = '';
    for (let i = 0; i < binary.length; i++) {
      const h = binary.charCodeAt(i).toString(16).padStart(2, '0');
      hex += h;
    }
    return hex.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Utility to convert 32-character Hex string to Base64URL (no padding).
 */
export function hexToBase64Url(hex: string): string {
  try {
    const cleanHex = hex.trim().replace(/[^0-9a-fA-F]/g, '');
    if (cleanHex.length % 2 !== 0) return '';
    let binary = '';
    for (let i = 0; i < cleanHex.length; i += 2) {
      binary += String.fromCharCode(parseInt(cleanHex.substring(i, i + 2), 16));
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch {
    return '';
  }
}

/**
 * Normalizes a key or kid string to 32-character lowercase hex.
 * Handles:
 * 1. 32-char hex (e.g. "e39a06709a3c9e658097b6a482b098ab")
 * 2. 16-byte base64/base64url (e.g. "45oGcJp8nmWAl7akg7CYqw" or with ==)
 */
export function normalizeToHex(input: string): string {
  if (!input) return '';
  const trimmed = input.trim().replace(/["']/g, '');

  // 1. Is it already 32 hex characters?
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // 2. Is it 16 bytes base64 / base64url (~22-24 characters)?
  if (/^[A-Za-z0-9+/_-]{20,24}={0,2}$/.test(trimmed)) {
    const converted = base64ToHex(trimmed);
    if (converted && converted.length === 32) {
      return converted;
    }
  }

  // 3. Fallback check for arbitrary hex with dashes (UUID format 8-4-4-4-12)
  const noDashes = trimmed.replace(/-/g, '');
  if (/^[0-9a-fA-F]{32}$/.test(noDashes)) {
    return noDashes.toLowerCase();
  }

  return '';
}

/**
 * Checks if a string is a license server URL (e.g. https://vmttv.dpdns.org/AutoKey/)
 */
export function isLicenseServerUrl(keyStr?: string): boolean {
  if (!keyStr || typeof keyStr !== 'string') return false;
  const trimmed = keyStr.trim().toLowerCase();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/');
}

/**
 * Parses any Clearkey license key format into a clean Shaka Player compatible
 * ClearKey map: { [kid_hex_32]: key_hex_32 }
 *
 * Supported formats:
 * - Hex pair: "e39a06709a3c9e658097b6a482b098ab:128be38dcf014827dfd5bec38743c6a2"
 * - Base64 pair: "45oGcJp8nmWAl7akg7CYqw:EIvjjc8BSCff1b7Dh0PGog"
 * - W3C JWK JSON: {"keys":[{"kty":"oct","k":"...","kid":"..."}]}
 * - Simple JSON object: {"<kid>":"<key>"}
 * - Base64 encoded JSON string: "eyJrZXlzIjpb..."
 */
export function parseClearkeyToHexMap(licenseKeyStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!licenseKeyStr || typeof licenseKeyStr !== 'string') return result;

  const rawTrimmed = licenseKeyStr.trim();
  if (isLicenseServerUrl(rawTrimmed)) {
    return result;
  }

  let raw = rawTrimmed;

  // If raw string starts with base64 encoded JSON (e.g. eyJ...)
  if (raw.startsWith('eyJ') || (!raw.startsWith('{') && !raw.includes(':') && raw.length > 30)) {
    try {
      const decoded = atob(raw);
      if (decoded.trim().startsWith('{')) {
        raw = decoded.trim();
      }
    } catch {
      // Continue
    }
  }

  // Handle JSON format
  if (raw.startsWith('{')) {
    try {
      const json = JSON.parse(raw);

      // Format 1: W3C ClearKey JSON Web Key Set: { "keys": [ { "kid": "...", "k": "...", "kty": "oct" } ] }
      if (Array.isArray(json.keys)) {
        for (const item of json.keys) {
          if (item && item.kid && item.k) {
            const kidHex = normalizeToHex(item.kid);
            const keyHex = normalizeToHex(item.k);
            if (kidHex && keyHex) {
              result[kidHex] = keyHex;
            }
          }
        }
      } else {
        // Format 2: Direct key-value map: { "<kid>": "<key>" }
        for (const [k, v] of Object.entries(json)) {
          if (typeof v === 'string') {
            const kidHex = normalizeToHex(k);
            const keyHex = normalizeToHex(v);
            if (kidHex && keyHex) {
              result[kidHex] = keyHex;
            }
          }
        }
      }
      return result;
    } catch (e) {
      console.warn('[DRM Parser] JSON parse error:', e);
    }
  }

  // Handle KID:KEY format (delimited by colon or comma)
  if (raw.includes(':')) {
    const parts = raw.split(':');
    if (parts.length >= 2) {
      const kidHex = normalizeToHex(parts[0]);
      const keyHex = normalizeToHex(parts[1]);
      if (kidHex && keyHex) {
        result[kidHex] = keyHex;
        return result;
      }
    }
  }

  // Handle KID=KEY format
  if (raw.includes('=')) {
    const parts = raw.split('=');
    if (parts.length >= 2) {
      const kidHex = normalizeToHex(parts[0]);
      const keyHex = normalizeToHex(parts[1]);
      if (kidHex && keyHex) {
        result[kidHex] = keyHex;
        return result;
      }
    }
  }

  return result;
}

/**
 * Full M3U parser supporting:
 * - #EXTINF (group-title, tvg-logo, name)
 * - #KODIPROP:inputstream.adaptive.license_key=...
 * - #KODIPROP:inputstream.adaptive.license_type=...
 * - #EXTVLCOPT:http-user-agent=... or #EXTVLCOPT:user-agent=...
 * - #EXTHTTP:{"User-Agent":"..."}
 */
export function parseM3uWithDrmAndUA(m3uContent: string): Channel[] {
  const list: Channel[] = [];
  if (!m3uContent || m3uContent.length < 10) return list;

  // If input is JSON format (e.g. from an API)
  if (m3uContent.trim().startsWith('{') || m3uContent.trim().startsWith('[')) {
    try {
      const json = JSON.parse(m3uContent);
      if (Array.isArray(json)) return json;
      if (json.channels && Array.isArray(json.channels)) return json.channels;
    } catch {
      // Continue as plain text M3U
    }
  }

  const lines = m3uContent.split(/\r?\n/);
  let currentGroup = 'Truyền Hình';
  let currentLogo = '';
  let currentName = '';
  let currentDrmKey = '';
  let currentLicenseType = '';
  let currentUserAgent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      if (groupMatch) currentGroup = groupMatch[1];

      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      if (logoMatch) currentLogo = logoMatch[1];

      const uaMatch = line.match(/(?:http-)?user-agent="([^"]*)"/i);
      if (uaMatch) currentUserAgent = uaMatch[1];

      const commaIndex = line.lastIndexOf(',');
      if (commaIndex !== -1) {
        currentName = line.substring(commaIndex + 1).trim();
      }
    } else if (line.match(/license_key\s*=\s*(.+)/i)) {
      // Matches #KODIPROP:inputstream.adaptive.license_key=... or #LICENSE_KEY=...
      const match = line.match(/license_key\s*=\s*(.+)/i);
      if (match) {
        currentDrmKey = match[1].trim();
      }
    } else if (line.match(/license_type\s*=\s*(.+)/i)) {
      const match = line.match(/license_type\s*=\s*(.+)/i);
      if (match) {
        currentLicenseType = match[1].trim();
      }
    } else if (line.match(/(?:http-user-agent|user-agent)\s*=\s*(.+)/i)) {
      // Matches #EXTVLCOPT:http-user-agent=Dalvik/2.1.0 or #EXTVLCOPT:user-agent=...
      const match = line.match(/(?:http-user-agent|user-agent)\s*=\s*(.+)/i);
      if (match) {
        currentUserAgent = match[1].trim();
      }
    } else if (line.startsWith('#EXTHTTP:')) {
      try {
        const jsonStr = line.replace('#EXTHTTP:', '').trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed['User-Agent']) currentUserAgent = parsed['User-Agent'];
      } catch {}
    } else if (!line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('/'))) {
      if (currentName || line) {
        list.push({
          name: currentName || 'Kênh LiveTV',
          logo:
            currentLogo ||
            'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60',
          group: currentGroup || 'Truyền Hình',
          url: line,
          drmKey: currentDrmKey || undefined,
          licenseType: currentLicenseType || undefined,
          userAgent: currentUserAgent || undefined,
        });
      }
      // Reset channel metadata for next entry
      currentName = '';
      currentLogo = '';
      currentDrmKey = '';
      currentLicenseType = '';
      currentUserAgent = '';
    }
  }

  return list;
}
