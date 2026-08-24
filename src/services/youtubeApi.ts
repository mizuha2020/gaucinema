import { YouTubeVideo, YouTubeChannel } from '../types';
import { getFullApiUrl } from './apiConfig';

// Helper to extract YouTube Video ID from any input string or URL
export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const clean = input.trim();

  // Standard 11 char video ID (e.g. dQw4w9WgXcQ)
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }

  // Match youtube.com/watch?v=VIDEO_ID or youtu.be or shorts
  const watchMatch = clean.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i
  );
  if (watchMatch && watchMatch[1]) {
    return watchMatch[1];
  }

  return null;
}

// Build 0-Ad YouTube No-Cookie Embed URL
export function getYouTubeEmbedUrl(videoId: string, autoplay = true): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    modestbranding: '1',
    rel: '0',
    iv_load_policy: '3',
    controls: '1',
    fs: '1',
    enablejsapi: '1',
    playsinline: '1',
    origin: typeof window !== 'undefined' ? window.location.origin : 'https://youtube.com',
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

// Format numbers (e.g., 1500000 -> 1.5 Tr)
export function formatViews(views?: number | string): string {
  if (!views && views !== 0) return 'Nhiều lượt xem';
  if (typeof views === 'string') return views;
  if (views >= 1_000_000_000) {
    return `${(views / 1_000_000_000).toFixed(1).replace('.0', '')} Tỷ lượt xem`;
  }
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(1).replace('.0', '')} Tr lượt xem`;
  }
  if (views >= 1_000) {
    return `${(views / 1_000).toFixed(1).replace('.0', '')} N lượt xem`;
  }
  return `${views} lượt xem`;
}

export interface SearchResultsResponse {
  channels: YouTubeChannel[];
  items: YouTubeVideo[];
  nextToken?: string | null;
}

export interface TrendingPageResponse {
  items: YouTubeVideo[];
  nextToken: string | null;
}

// Client-side HTML / JSON extractor for YouTube ytInitialData
export function parseYtInitialData(htmlOrData: any): { items: YouTubeVideo[]; channels: YouTubeChannel[]; nextToken?: string | null } {
  let data: any = htmlOrData;
  if (typeof htmlOrData === 'string') {
    try {
      const match =
        htmlOrData.match(/var ytInitialData = ({.*?});<\/script>/s) ||
        htmlOrData.match(/ytInitialData = ({.*?});/s);
      if (match) {
        data = JSON.parse(match[1]);
      } else {
        return { items: [], channels: [], nextToken: null };
      }
    } catch {
      return { items: [], channels: [], nextToken: null };
    }
  }

  if (!data || typeof data !== 'object') {
    return { items: [], channels: [], nextToken: null };
  }

  const items: YouTubeVideo[] = [];
  const channels: YouTubeChannel[] = [];
  const seenIds = new Set<string>();
  let nextToken: string | null = null;

  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;

    // Continuation token
    if (node.continuationItemRenderer && !nextToken) {
      const tok =
        node.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ||
        node.continuationItemRenderer.continuationEndpoint?.nextContinuationData?.continuation;
      if (tok && typeof tok === 'string') {
        nextToken = tok;
      }
    }

    // 1. Video Renderer (Legacy & Search)
    const vr = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer;
    if (vr && vr.videoId && !seenIds.has(vr.videoId)) {
      seenIds.add(vr.videoId);
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Video YouTube';
      const channelTitle =
        vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'Kênh YouTube';
      const channelId =
        vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
        vr.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
        '';
      const publishedAt =
        vr.publishedTimeText?.simpleText || vr.publishedTimeText?.runs?.[0]?.text || 'Mới đây';
      const viewCount =
        vr.viewCountText?.simpleText ||
        vr.viewCountText?.runs?.[0]?.text ||
        vr.shortViewCountText?.simpleText ||
        vr.shortViewCountText?.runs?.[0]?.text ||
        '';
      const duration = vr.lengthText?.simpleText || vr.lengthText?.runs?.[0]?.text || '';
      const isLive =
        !duration &&
        (vr.badges?.some((b: any) => /live|trực tiếp/i.test(b?.metadataBadgeRenderer?.label || '')) ||
          false);

      const thumbs = vr.thumbnail?.thumbnails || [];
      const thumbnailUrl =
        thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;
      const chAvatar =
        vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url ||
        '';

      items.push({
        id: vr.videoId,
        title,
        channelTitle,
        channelId,
        channelAvatar: chAvatar,
        publishedAt,
        viewCount,
        duration: isLive ? 'LIVE' : duration || '04:20',
        thumbnailUrl,
        description:
          vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') || '',
        category: isLive ? 'live' : 'trending',
      });
    }

    // 2. Lockup View Model (New YouTube Search Layout)
    const lv = node.lockupViewModel;
    if (lv && lv.contentId && !seenIds.has(lv.contentId)) {
      seenIds.add(lv.contentId);
      const metaVm = lv.metadata?.lockupMetadataViewModel;
      const title = metaVm?.title?.content || 'Video YouTube';
      const sources = lv.contentImage?.thumbnailViewModel?.image?.sources || [];
      const thumbnailUrl =
        sources[sources.length - 1]?.url || `https://i.ytimg.com/vi/${lv.contentId}/hqdefault.jpg`;

      let duration = '';
      let isLive = false;
      const overlays = lv.contentImage?.thumbnailViewModel?.overlays || [];
      for (const ov of overlays) {
        const badges = ov?.thumbnailBottomOverlayViewModel?.badges || [];
        for (const b of badges) {
          const t = b?.thumbnailBadgeViewModel?.text || '';
          if (/live|trực tiếp/i.test(t)) {
            isLive = true;
            duration = 'LIVE';
          } else if (!duration && /\d/.test(t)) {
            duration = t;
          }
        }
      }

      let channelTitle = '';
      let channelAvatar = '';
      let viewCount = '';
      let publishedAt = '';
      const avSrcs = metaVm?.image?.avatarViewModel?.avatar?.image?.sources || [];
      if (avSrcs.length > 0) channelAvatar = avSrcs[avSrcs.length - 1]?.url || '';

      const rows = metaVm?.metadata?.contentMetadataViewModel?.metadataRows || [];
      for (const row of rows) {
        for (const part of row?.metadataParts || []) {
          const t = part?.text?.content || '';
          if (!t) continue;
          if (/lượt xem|views|đang xem|watching/i.test(t)) {
            if (!viewCount) viewCount = t;
            if (/đang xem|watching/i.test(t)) isLive = true;
          } else if (/(trước|ago|hôm nay|giờ trước|phút trước)/i.test(t)) {
            if (!publishedAt) publishedAt = t;
          } else if (!channelTitle) {
            channelTitle = t;
          }
        }
      }

      items.push({
        id: lv.contentId,
        title,
        channelTitle: channelTitle || 'Kênh YouTube',
        channelId: '',
        channelAvatar,
        publishedAt: publishedAt || 'Mới đây',
        viewCount,
        duration: isLive ? 'LIVE' : duration || '03:45',
        thumbnailUrl,
        description: '',
        category: isLive ? 'live' : 'trending',
      });
    }

    // 3. Channel Renderer
    const cr = node.channelRenderer;
    if (cr && cr.channelId && !channels.some((c) => c.id === cr.channelId)) {
      const title = cr.title?.simpleText || cr.title?.runs?.[0]?.text || 'Kênh YouTube';
      const subscribers =
        cr.subscriberCountText?.simpleText || cr.subscriberCountText?.runs?.[0]?.text || '';
      const thumbs = cr.thumbnail?.thumbnails || [];
      const avatarUrl = thumbs[thumbs.length - 1]?.url || '';
      channels.push({
        id: cr.channelId,
        title,
        subscribers,
        avatarUrl,
        description: cr.descriptionSnippet?.runs?.[0]?.text || '',
      });
    }

    for (const key of Object.keys(node)) {
      walk(node[key]);
    }
  };

  walk(data);
  return { items, channels, nextToken };
}

// Category search queries for YouTube
export const CATEGORY_SEARCH_QUERIES: Record<string, string> = {
  all: 'nhạc trẻ remix hot tiktok triệu view việt nam 2026',
  home: 'video thịnh hành youtube việt nam mới nhất triệu view',
  trending: 'thịnh hành việt nam hôm nay tin tức giải trí',
  music_vn: 'top bài hát nhạc trẻ vpop việt nam hay nhất',
  music: 'nhạc việt nam mới nhất thịnh hành vpop mv triệu view',
  news_vn: 'tin tức thời sự vtv24 chuyển động 24h việt nam hôm nay',
  news: 'tin tức việt nam trong ngày thời sự mới nhất',
  comedy_vn: 'tiểu phẩm hài hước việt nam cười vỡ bụng triệu view',
  entertainment: 'gameshow việt nam triệu view hài hước 2 ngày 1 đêm',
  gaming_vn: 'streamer việt nam highlights liên quân tốc chiến free fire pubg',
  gaming: 'streamer việt nam gaming highlight lmht liên quân',
  review_phim: 'review phim hay tóm tắt phim chiếu rạp việt nam thuyết minh',
  podcast_vn: 'vietcetera have a sip podcast việt nam chữa lành tâm sự',
  food_vn: 'ẩm thực đường phố việt nam món ngon hà nội sài gòn',
  tech_vn: 'vật vờ studio schannel đánh giá công nghệ điện thoại review',
  tech: 'công nghệ review smartphone máy tính mới nhất việt nam',
  kids_vn: 'hoạt hình thiếu nhi tiếng việt doraemon cổ tích bé xem',
  kids: 'nhạc thiếu nhi việt nam vui nhộn cho bé ăn cơm',
  sports: 'bóng đá việt nam ngoại hạng anh highlights mới nhất',
  live_vn: 'trực tiếp việt nam livestream phát sóng hot',
  shorts: 'shorts việt nam hài hước triệu view xu hướng',
};

// CORS Proxies for Client-Side Direct YouTube Scrape
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// Direct YouTube InnerTube API Client (Official YouTube Web Engine)
async function fetchYouTubeInnerTube(query: string, continuationToken?: string | null): Promise<SearchResultsResponse> {
  const targetUrl = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
  const requestBody: any = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        hl: 'vi',
        gl: 'VN',
      },
    },
  };

  if (continuationToken) {
    requestBody.continuation = continuationToken;
  } else {
    requestBody.query = query;
  }

  const jsonBody = JSON.stringify(requestBody);

  // 1. Direct Fetch to YouTube InnerTube (Fastest & 100% Real Live Data on Android APK / Capacitor)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
      body: jsonBody,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const data = await res.json();
      const parsed = parseYtInitialData(data);
      if (parsed.items.length > 0 || parsed.channels.length > 0) {
        return {
          channels: parsed.channels,
          items: parsed.items,
          nextToken: parsed.nextToken || null,
        };
      }
    }
  } catch (e) {
    // Direct fetch blocked by CORS or network, try next layers
  }

  // 2. Try Backend API (if running on Web with live Express server)
  try {
    const backendUrl = continuationToken
      ? getFullApiUrl(`/api/youtube/search?q=${encodeURIComponent(query)}&token=${encodeURIComponent(continuationToken)}`)
      : getFullApiUrl(`/api/youtube/search?q=${encodeURIComponent(query)}`);
    
    if (backendUrl && !backendUrl.startsWith('http://localhost') && !backendUrl.startsWith('https://localhost')) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(backendUrl, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{') || text.startsWith('[')) {
          const data = JSON.parse(text);
          if ((data?.items && data.items.length > 0) || (data?.channels && data.channels.length > 0)) {
            return {
              channels: data.channels || [],
              items: data.items || [],
              nextToken: data.nextToken || null,
            };
          }
        }
      }
    }
  } catch (e) {}

  // 3. Fallback via Public CORS Proxies with HTML Search Scraper
  const directHtmlUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&gl=VN&hl=vi`;
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const proxyUrl = buildProxyUrl(directHtmlUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(proxyUrl, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (res.ok) {
        const html = await res.text();
        const parsed = parseYtInitialData(html);
        if (parsed.items.length > 0 || parsed.channels.length > 0) {
          return {
            channels: parsed.channels,
            items: parsed.items,
            nextToken: null,
          };
        }
      }
    } catch {}
  }

  return { channels: [], items: [] };
}

// Active Piped instances list for client fallback
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacydev.net',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.tokhmi.xyz',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.leptons.xyz',
  'https://piped-api.lunar.icu',
  'https://pa.il.ax',
];

// Active Invidious Public Instances list
const INVIDIOUS_INSTANCES = [
  'https://vid.puffyan.us',
  'https://invidious.projectsegfau.lt',
  'https://invidious.protokolla.fi',
  'https://iv.melmac.space',
  'https://invidious.private.coffee',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
];

// Fetch trending from public Piped instances
async function fetchPipedTrending(): Promise<YouTubeVideo[]> {
  for (const base of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${base}/trending?region=VN`, { signal: controller.signal }).finally(() =>
        clearTimeout(timer)
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data
            .filter((item: any) => item.url)
            .map((item: any) => {
              const vid = String(item.url || '').replace('/watch?v=', '').replace('/shorts/', '');
              const isLive = Boolean(item.livestream) || item.duration === -1;
              return {
                id: vid,
                title: item.title || 'Video YouTube',
                channelTitle: item.uploaderName || 'Kênh YouTube',
                channelId: item.uploaderUrl ? String(item.uploaderUrl).replace('/channel/', '') : '',
                channelAvatar: item.uploaderAvatar || '',
                publishedAt: item.uploadedDate || 'Mới đây',
                viewCount:
                  typeof item.views === 'number' && item.views > 0
                    ? `${item.views.toLocaleString('vi-VN')} lượt xem`
                    : 'Nhiều lượt xem',
                duration: isLive
                  ? 'LIVE'
                  : item.duration > 0
                  ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`
                  : '04:00',
                thumbnailUrl: item.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                description: item.shortDescription || '',
                category: isLive ? 'live' : 'trending',
              };
            })
            .filter((v: any) => v.id && v.title);
        }
      }
    } catch {}
  }
  return [];
}

// Fetch search from public Piped instances
async function fetchPipedSearch(query: string): Promise<SearchResultsResponse> {
  for (const base of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${base}/search?q=${encodeURIComponent(query)}&filter=all`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (res.ok) {
        const data = await res.json();
        if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
          const items: YouTubeVideo[] = [];
          const channels: YouTubeChannel[] = [];

          for (const item of data.items) {
            if (item.type === 'stream' && item.url) {
              const vid = item.url.replace('/watch?v=', '').replace('/shorts/', '');
              const isLive = Boolean(item.livestream) || item.duration === -1;
              items.push({
                id: vid,
                title: item.title || 'Video YouTube',
                channelTitle: item.uploaderName || 'Kênh YouTube',
                channelId: item.uploaderUrl ? String(item.uploaderUrl).replace('/channel/', '') : '',
                channelAvatar: item.uploaderAvatar || '',
                publishedAt: item.uploadedDate || 'Mới đây',
                viewCount:
                  typeof item.views === 'number' && item.views > 0
                    ? `${item.views.toLocaleString('vi-VN')} lượt xem`
                    : 'Nhiều lượt xem',
                duration: isLive
                  ? 'LIVE'
                  : item.duration > 0
                  ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`
                  : '03:50',
                thumbnailUrl: item.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                description: item.shortDescription || '',
                category: isLive ? 'live' : 'trending',
              });
            } else if (item.type === 'channel' && item.url) {
              const chId = item.url.replace('/channel/', '');
              channels.push({
                id: chId,
                title: item.name || 'Kênh YouTube',
                subscribers:
                  typeof item.subscriberCount === 'number' && item.subscriberCount > 0
                    ? `${item.subscriberCount.toLocaleString('vi-VN')} người đăng ký`
                    : '',
                avatarUrl: item.avatarUrl || '',
                description: item.description || '',
              });
            }
          }

          if (items.length > 0 || channels.length > 0) {
            return { channels, items, nextToken: null };
          }
        }
      }
    } catch {}
  }
  return { channels: [], items: [] };
}

// Fetch trending from public Invidious instances
async function fetchInvidiousTrending(category: string = 'all'): Promise<YouTubeVideo[]> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const url = `${base}/api/v1/trending?region=VN${category !== 'all' && category !== 'trending' ? `&type=${category}` : ''}`;
      const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data
            .map((item: any) => ({
              id: item.videoId || item.id,
              title: item.title || 'Video YouTube',
              channelTitle: item.author || item.uploaderName || 'Kênh YouTube',
              channelId: item.authorId || '',
              publishedAt: item.publishedText || 'Mới đây',
              viewCount: item.viewCountText || formatViews(item.viewCount),
              duration: item.lengthSeconds
                ? `${Math.floor(item.lengthSeconds / 60)}:${String(item.lengthSeconds % 60).padStart(2, '0')}`
                : 'LIVE',
              thumbnailUrl:
                item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId || item.id}/hqdefault.jpg`,
              category: category || 'trending',
            }))
            .filter((v: any) => v.id && v.title);
        }
      }
    } catch {}
  }
  return [];
}

// Comprehensive Curated Vietnamese YouTube Fallback Catalog
export const CURATED_VIETNAM_VIDEOS: Record<string, YouTubeVideo[]> = {
  all: [
    {
      id: 'z2X2nSE8BIw',
      title: 'SƠN TÙNG M-TP | ĐỪNG LÀM TRÁI TIM ANH ĐAU | OFFICIAL MUSIC VIDEO',
      channelTitle: 'Sơn Tùng M-TP Official',
      channelId: 'UClyAursxRoaoN-7PpnngA1g',
      publishedAt: 'Thịnh hành #1',
      viewCount: '115 Tr lượt xem',
      duration: '05:32',
      thumbnailUrl: 'https://i.ytimg.com/vi/z2X2nSE8BIw/hqdefault.jpg',
      description: 'SƠN TÙNG M-TP | ĐỪNG LÀM TRÁI TIM ANH ĐAU | OFFICIAL MUSIC VIDEO',
      category: 'trending',
    },
    {
      id: 'xypzmu5mMPY',
      title: 'Đen - Nấu ăn cho em ft. PiaLinh (M/V)',
      channelTitle: 'Đen Vâu Official',
      channelId: 'UCG6rBf1u_T8T1bZ6mG0x4eQ',
      publishedAt: 'Mới đây',
      viewCount: '58 Tr lượt xem',
      duration: '04:48',
      thumbnailUrl: 'https://i.ytimg.com/vi/xypzmu5mMPY/hqdefault.jpg',
      description: 'Nấu ăn cho em - Đen ft. PiaLinh',
      category: 'trending',
    },
    {
      id: '7C2z4GqqS5E',
      title: '2 NGÀY 1 ĐÊM - TẬP ĐẶC BIỆT | Cười nghiêng ngả với dàn cast siêu lầy lội',
      channelTitle: 'ĐÔNG TÂY PROMOTION OFFICIAL',
      channelId: 'UCgB3wF9uJp4o8Z_L8y_o6hQ',
      publishedAt: '2 ngày trước',
      viewCount: '4.8 Tr lượt xem',
      duration: '01:25:30',
      thumbnailUrl: 'https://i.ytimg.com/vi/7C2z4GqqS5E/hqdefault.jpg',
      description: 'Chương trình truyền hình thực tế hot nhất Việt Nam 2 Ngày 1 Đêm.',
      category: 'trending',
    },
    {
      id: 'LkJ4QWl_q_4',
      title: 'Bản Tin Thời Sự VTV24 - Chuyển Động 24h Toàn Cảnh',
      channelTitle: 'VTV24',
      channelId: 'UCpP37hE2D2Wk7S5i7Zf5y_g',
      publishedAt: 'Hôm nay',
      viewCount: '1.2 Tr lượt xem',
      duration: 'LIVE',
      thumbnailUrl: 'https://i.ytimg.com/vi/LkJ4QWl_q_4/hqdefault.jpg',
      description: 'Tin tức thời sự nóng hổi 24h cập nhật liên tục từ Đài Truyền hình Việt Nam.',
      category: 'live',
    },
    {
      id: 'adLGHcj_fmA',
      title: 'HOA CỎ LAU - PHONG MAX (OFFICIAL MUSIC VIDEO)',
      channelTitle: 'Phong Max',
      channelId: 'UC1234567890',
      publishedAt: '1 tuần trước',
      viewCount: '28 Tr lượt xem',
      duration: '03:45',
      thumbnailUrl: 'https://i.ytimg.com/vi/adLGHcj_fmA/hqdefault.jpg',
      description: 'Ca khúc Hoa Cỏ Lau gây bão bảng xếp hạng âm nhạc.',
      category: 'trending',
    },
    {
      id: 'NxgPfqnE_kI',
      title: 'Vật Vờ Studio | Đánh giá chi tiết Flagship mới nhất năm 2026',
      channelTitle: 'Vật Vờ Studio',
      channelId: 'UCxKz3P_mX6E_R6g4Z_123',
      publishedAt: '1 ngày trước',
      viewCount: '350 N lượt xem',
      duration: '14:22',
      thumbnailUrl: 'https://i.ytimg.com/vi/NxgPfqnE_kI/hqdefault.jpg',
      description: 'Kênh công nghệ hàng đầu Việt Nam đánh giá thiết bị.',
      category: 'trending',
    },
    {
      id: 'knW7-x7Y7RE',
      title: 'HIEUTHUHAI - KHÔNG THỂ SAY (OFFICIAL MUSIC VIDEO)',
      channelTitle: 'HIEUTHUHAI',
      channelId: 'UCHIEUTHUHAI',
      publishedAt: 'Mới đây',
      viewCount: '45 Tr lượt xem',
      duration: '03:32',
      thumbnailUrl: 'https://i.ytimg.com/vi/knW7-x7Y7RE/hqdefault.jpg',
      description: 'HIEUTHUHAI bản hit triệu view.',
      category: 'trending',
    },
    {
      id: 'g3jCAyPai2Y',
      title: 'Tóm Tắt Phim Siêu Cuốn | Review Phim Điện Ảnh Bom Tấn Mới Nhất',
      channelTitle: 'Vua Review Phim',
      channelId: 'UCReviewPhimVN',
      publishedAt: 'Hôm nay',
      viewCount: '890 N lượt xem',
      duration: '18:40',
      thumbnailUrl: 'https://i.ytimg.com/vi/g3jCAyPai2Y/hqdefault.jpg',
      description: 'Review tóm tắt phim rạp hấp dẫn đầy kịch tính.',
      category: 'trending',
    },
  ],
  music_vn: [
    {
      id: 'z2X2nSE8BIw',
      title: 'SƠN TÙNG M-TP | ĐỪNG LÀM TRÁI TIM ANH ĐAU | OFFICIAL MUSIC VIDEO',
      channelTitle: 'Sơn Tùng M-TP Official',
      publishedAt: 'Thịnh hành #1',
      viewCount: '115 Tr lượt xem',
      duration: '05:32',
      thumbnailUrl: 'https://i.ytimg.com/vi/z2X2nSE8BIw/hqdefault.jpg',
      category: 'trending',
    },
    {
      id: 'xypzmu5mMPY',
      title: 'Đen - Nấu ăn cho em ft. PiaLinh (M/V)',
      channelTitle: 'Đen Vâu Official',
      publishedAt: 'Mới đây',
      viewCount: '58 Tr lượt xem',
      duration: '04:48',
      thumbnailUrl: 'https://i.ytimg.com/vi/xypzmu5mMPY/hqdefault.jpg',
      category: 'trending',
    },
    {
      id: 'knW7-x7Y7RE',
      title: 'HIEUTHUHAI - KHÔNG THỂ SAY (OFFICIAL MUSIC VIDEO)',
      channelTitle: 'HIEUTHUHAI',
      publishedAt: 'Mới đây',
      viewCount: '45 Tr lượt xem',
      duration: '03:32',
      thumbnailUrl: 'https://i.ytimg.com/vi/knW7-x7Y7RE/hqdefault.jpg',
      category: 'trending',
    },
    {
      id: '3v309c6y6wA',
      title: 'Vũ. - Lạ Lùng (Official MV)',
      channelTitle: 'Vũ. Official',
      publishedAt: 'Mới đây',
      viewCount: '92 Tr lượt xem',
      duration: '04:20',
      thumbnailUrl: 'https://i.ytimg.com/vi/3v309c6y6wA/hqdefault.jpg',
      category: 'trending',
    },
  ],
  comedy_vn: [
    {
      id: '7C2z4GqqS5E',
      title: '2 NGÀY 1 ĐÊM - TẬP ĐẶC BIỆT | Cười nghiêng ngả với dàn cast siêu lầy lội',
      channelTitle: 'ĐÔNG TÂY PROMOTION OFFICIAL',
      publishedAt: '2 ngày trước',
      viewCount: '4.8 Tr lượt xem',
      duration: '01:25:30',
      thumbnailUrl: 'https://i.ytimg.com/vi/7C2z4GqqS5E/hqdefault.jpg',
      category: 'trending',
    },
    {
      id: 'Y3k3G7w2G2k',
      title: 'Táo Quân Chọn Lọc - Những Pha Bắn Pháo Cười Ra Nước Mắt',
      channelTitle: 'VTV Show',
      publishedAt: 'Mới đây',
      viewCount: '8.5 Tr lượt xem',
      duration: '42:15',
      thumbnailUrl: 'https://i.ytimg.com/vi/Y3k3G7w2G2k/hqdefault.jpg',
      category: 'trending',
    },
  ],
  news_vn: [
    {
      id: 'LkJ4QWl_q_4',
      title: 'Bản Tin Thời Sự VTV24 - Chuyển Động 24h Toàn Cảnh',
      channelTitle: 'VTV24',
      publishedAt: 'Hôm nay',
      viewCount: '1.2 Tr lượt xem',
      duration: 'LIVE',
      thumbnailUrl: 'https://i.ytimg.com/vi/LkJ4QWl_q_4/hqdefault.jpg',
      category: 'live',
    },
  ],
  gaming_vn: [
    {
      id: 'MixiGaming_Live1',
      title: 'Độ Mixi | Khoảnh khắc lầy lội cùng Bộ Tộc MixiGaming',
      channelTitle: 'MixiGaming',
      publishedAt: 'Hôm nay',
      viewCount: '1.5 Tr lượt xem',
      duration: '35:40',
      thumbnailUrl: 'https://i.ytimg.com/vi/adLGHcj_fmA/hqdefault.jpg',
      category: 'trending',
    },
  ],
  tech_vn: [
    {
      id: 'NxgPfqnE_kI',
      title: 'Vật Vờ Studio | Đánh giá chi tiết Flagship mới nhất năm 2026',
      channelTitle: 'Vật Vờ Studio',
      publishedAt: '1 ngày trước',
      viewCount: '350 N lượt xem',
      duration: '14:22',
      thumbnailUrl: 'https://i.ytimg.com/vi/NxgPfqnE_kI/hqdefault.jpg',
      category: 'trending',
    },
  ],
};

export const CURATED_CHANNELS: YouTubeChannel[] = [
  {
    id: 'UClyAursxRoaoN-7PpnngA1g',
    title: 'Sơn Tùng M-TP Official',
    subscribers: '10.5 Tr người đăng ký',
    avatarUrl: 'https://i.ytimg.com/vi/z2X2nSE8BIw/hqdefault.jpg',
    description: 'Kênh YouTube chính thức của nghệ sĩ Sơn Tùng M-TP.',
  },
  {
    id: 'UCG6rBf1u_T8T1bZ6mG0x4eQ',
    title: 'Đen Vâu Official',
    subscribers: '5.2 Tr người đăng ký',
    avatarUrl: 'https://i.ytimg.com/vi/xypzmu5mMPY/hqdefault.jpg',
    description: 'Kênh YouTube chính thức của Đen Vâu.',
  },
  {
    id: 'UCpP37hE2D2Wk7S5i7Zf5y_g',
    title: 'VTV24',
    subscribers: '6.8 Tr người đăng ký',
    avatarUrl: 'https://i.ytimg.com/vi/LkJ4QWl_q_4/hqdefault.jpg',
    description: 'Trung tâm Tin tức VTV24 - Đài Truyền hình Việt Nam.',
  },
  {
    id: 'UCDongTayPromotion',
    title: 'ĐÔNG TÂY PROMOTION OFFICIAL',
    subscribers: '11.2 Tr người đăng ký',
    avatarUrl: 'https://i.ytimg.com/vi/7C2z4GqqS5E/hqdefault.jpg',
    description: 'Kênh sản xuất các gameshow giải trí số 1 Việt Nam.',
  },
];

export const youtubeApi = {
  // Get trending page with direct InnerTube API and multi-tier fallback
  getTrendingPage: async (category: string = 'all', token?: string | null): Promise<TrendingPageResponse> => {
    const cleanCat = category || 'all';
    const searchKeyword = CATEGORY_SEARCH_QUERIES[cleanCat] || CATEGORY_SEARCH_QUERIES.all;

    // Tier 1: Direct YouTube InnerTube Search (100% Real Live YouTube Data on APK and Web)
    try {
      const innerTubeRes = await fetchYouTubeInnerTube(searchKeyword, token);
      if (innerTubeRes.items && innerTubeRes.items.length > 0) {
        return { items: innerTubeRes.items, nextToken: innerTubeRes.nextToken || null };
      }
    } catch (e) {
      console.warn('Direct InnerTube trending error:', e);
    }

    // Tier 2: Backend API (if running on Web)
    const qs = new URLSearchParams({ category: cleanCat });
    if (token) qs.set('token', token);
    try {
      const url = getFullApiUrl(`/api/youtube/trending?${qs.toString()}`);
      if (url && !url.startsWith('http://localhost') && !url.startsWith('https://localhost')) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
        if (res.ok) {
          const text = await res.text();
          if (text.startsWith('{') || text.startsWith('[')) {
            const data = JSON.parse(text);
            if (Array.isArray(data?.items) && data.items.length > 0) {
              return { items: data.items, nextToken: data.nextToken || null };
            }
          }
        }
      }
    } catch (e) {
      console.warn('Backend YouTube trending error:', e);
    }

    if (token) return { items: [], nextToken: null };

    // Tier 3: Curated Vietnamese catalog
    const fallbackList = CURATED_VIETNAM_VIDEOS[cleanCat] || CURATED_VIETNAM_VIDEOS.all || [];
    return { items: fallbackList, nextToken: null };
  },

  // Get trending videos by category
  getTrending: async (category: string = 'all'): Promise<YouTubeVideo[]> => {
    const page = await youtubeApi.getTrendingPage(category);
    return page.items;
  },

  // Full search returns both channels and videos with real Live YouTube data
  searchFull: async (query: string, token?: string | null): Promise<SearchResultsResponse> => {
    const trimmed = (query || '').trim();

    if (!trimmed) {
      const def = await youtubeApi.getTrendingPage('all');
      return { channels: CURATED_CHANNELS, items: def.items };
    }

    // Direct YouTube Link or Video ID paste check
    const extractedId = extractYouTubeId(trimmed);
    if (extractedId) {
      return {
        channels: [],
        items: [
          {
            id: extractedId,
            title: `Video YouTube (${extractedId})`,
            channelTitle: 'YouTube Video',
            publishedAt: 'Mới đây',
            thumbnailUrl: `https://i.ytimg.com/vi/${extractedId}/hqdefault.jpg`,
            description: 'Video phát trực tiếp từ liên kết YouTube bạn đã nhập (Đã loại bỏ toàn bộ quảng cáo).',
            category: 'trending',
          },
        ],
      };
    }

    // Tier 1: Direct YouTube InnerTube Search (Works directly on Android APK without localhost issues)
    try {
      const innerTubeRes = await fetchYouTubeInnerTube(trimmed, token);
      if ((innerTubeRes.items && innerTubeRes.items.length > 0) || (innerTubeRes.channels && innerTubeRes.channels.length > 0)) {
        return innerTubeRes;
      }
    } catch (e) {
      console.warn('InnerTube search error:', e);
    }

    // Tier 2: Backend API Search (when available)
    try {
      const url = token
        ? getFullApiUrl(`/api/youtube/search?q=${encodeURIComponent(trimmed)}&token=${encodeURIComponent(token)}`)
        : getFullApiUrl(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
      if (url && !url.startsWith('http://localhost') && !url.startsWith('https://localhost')) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
        if (res.ok) {
          const text = await res.text();
          if (text.startsWith('{') || text.startsWith('[')) {
            const data = JSON.parse(text);
            if ((data?.items && data.items.length > 0) || (data?.channels && data.channels.length > 0)) {
              return {
                channels: data.channels || [],
                items: data.items || [],
                nextToken: data.nextToken || null,
              };
            }
          }
        }
      }
    } catch (e) {
      console.warn('Backend YouTube search error:', e);
    }

    // Tier 3: Filter curated database by keyword
    const qLower = trimmed.toLowerCase();
    const matchedVideos = (CURATED_VIETNAM_VIDEOS.all || []).filter(
      (v) => v.title.toLowerCase().includes(qLower) || v.channelTitle.toLowerCase().includes(qLower)
    );
    const matchedChannels = CURATED_CHANNELS.filter((c) => c.title.toLowerCase().includes(qLower));

    if (matchedVideos.length > 0 || matchedChannels.length > 0) {
      return { channels: matchedChannels, items: matchedVideos };
    }

    return { channels: [], items: CURATED_VIETNAM_VIDEOS.all || [] };
  },

  // Search videos or parse direct URL
  search: async (query: string): Promise<YouTubeVideo[]> => {
    const res = await youtubeApi.searchFull(query);
    return res.items;
  },

  // Get Channel details and channel videos
  getChannelDetails: async (
    channelId: string,
    channelName?: string
  ): Promise<{ channel: YouTubeChannel | null; items: YouTubeVideo[] }> => {
    const fallbackChannel: YouTubeChannel = {
      id: channelId || 'channel_default',
      title: channelName || 'Kênh YouTube',
      subscribers: '100 N người đăng ký',
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(channelName || 'Kênh')}&background=ef4444&color=fff`,
    };

    // Tier 1: Search InnerTube directly with channel query
    if (channelName || channelId) {
      try {
        const targetSearch = channelName || channelId;
        const searchRes = await youtubeApi.searchFull(targetSearch);
        if (searchRes.items.length > 0 || searchRes.channels.length > 0) {
          const matchedChan = searchRes.channels.find(
            (c) => c.id === channelId || (channelName && c.title.toLowerCase().includes(channelName.toLowerCase()))
          ) || searchRes.channels[0] || fallbackChannel;

          return {
            channel: matchedChan,
            items: searchRes.items,
          };
        }
      } catch (e) {
        console.warn('Channel details InnerTube error:', e);
      }
    }

    // Tier 2: Backend
    try {
      const queryParams = new URLSearchParams();
      if (channelId) queryParams.set('id', channelId);
      if (channelName) queryParams.set('name', channelName);

      const res = await fetch(getFullApiUrl(`/api/youtube/channel?${queryParams.toString()}`));
      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{')) {
          const data = JSON.parse(text);
          return {
            channel: data?.channel ? { ...fallbackChannel, ...data.channel } : fallbackChannel,
            items: Array.isArray(data?.items) ? data.items : [],
          };
        }
      }
    } catch (e) {
      console.warn('Backend channel details error:', e);
    }

    return { channel: fallbackChannel, items: CURATED_VIETNAM_VIDEOS.all || [] };
  },

  // Search videos within a specific channel
  searchChannelVideos: async (
    channelId: string,
    channelName: string,
    query: string
  ): Promise<YouTubeVideo[]> => {
    const qTrim = (query || '').trim();
    if (!qTrim) return [];

    // Tier 1: Search InnerTube directly with channel context
    try {
      const searchQuery = channelName ? `"${channelName}" ${qTrim}` : `${channelId} ${qTrim}`;
      const searchRes = await youtubeApi.searchFull(searchQuery);
      if (searchRes.items.length > 0) {
        const cLower = (channelName || '').toLowerCase().trim();
        const prioritized = searchRes.items.filter((v) =>
          cLower ? (v.channelTitle || '').toLowerCase().includes(cLower) || cLower.includes((v.channelTitle || '').toLowerCase()) : true
        );
        return prioritized.length > 0 ? prioritized : searchRes.items;
      }
    } catch (e) {
      console.warn('InnerTube search channel error:', e);
    }

    // Tier 2: Backend API
    try {
      const queryParams = new URLSearchParams();
      if (channelId) queryParams.set('id', channelId);
      if (channelName) queryParams.set('name', channelName);
      queryParams.set('q', qTrim);

      const res = await fetch(getFullApiUrl(`/api/youtube/channel?${queryParams.toString()}`));
      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{')) {
          const data = JSON.parse(text);
          if (Array.isArray(data?.items) && data.items.length > 0) {
            return data.items;
          }
        }
      }
    } catch (e) {
      console.warn('Backend search channel videos error:', e);
    }

    return [];
  },

  // Get single video details
  getVideoDetail: async (videoId: string): Promise<YouTubeVideo> => {
    const extracted = extractYouTubeId(videoId) || videoId;

    try {
      const res = await fetch(getFullApiUrl(`/api/youtube/video/${extracted}`));
      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{')) {
          const data = JSON.parse(text);
          if (data?.video) return data.video;
        }
      }
    } catch {}

    return {
      id: extracted,
      title: `Video YouTube (${extracted})`,
      channelTitle: 'YouTube Video',
      publishedAt: 'Đang phát',
      thumbnailUrl: `https://i.ytimg.com/vi/${extracted}/hqdefault.jpg`,
      description: 'Phát trực tiếp không quảng cáo trên Gấu YouTube.',
    };
  },
};
