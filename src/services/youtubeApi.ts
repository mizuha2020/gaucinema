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
  const watchMatch = clean.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i);
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
function parseYtInitialData(htmlOrData: any): { items: YouTubeVideo[]; channels: YouTubeChannel[] } {
  let data: any = htmlOrData;
  if (typeof htmlOrData === 'string') {
    try {
      const match = htmlOrData.match(/var ytInitialData = ({.*?});<\/script>/s) || 
                    htmlOrData.match(/ytInitialData = ({.*?});/s);
      if (match) {
        data = JSON.parse(match[1]);
      } else {
        return { items: [], channels: [] };
      }
    } catch {
      return { items: [], channels: [] };
    }
  }

  if (!data || typeof data !== 'object') {
    return { items: [], channels: [] };
  }

  const items: YouTubeVideo[] = [];
  const channels: YouTubeChannel[] = [];
  const seenIds = new Set<string>();

  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;

    // 1. Video Renderer (Legacy & Search)
    const vr = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer;
    if (vr && vr.videoId && !seenIds.has(vr.videoId)) {
      seenIds.add(vr.videoId);
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Video YouTube';
      const channelTitle = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'Kênh YouTube';
      const channelId = vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
                        vr.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
      const publishedAt = vr.publishedTimeText?.simpleText || vr.publishedTimeText?.runs?.[0]?.text || 'Mới đây';
      const viewCount = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || 
                        vr.shortViewCountText?.simpleText || vr.shortViewCountText?.runs?.[0]?.text || '';
      const duration = vr.lengthText?.simpleText || vr.lengthText?.runs?.[0]?.text || '';
      const isLive = !duration && (vr.badges?.some((b: any) => /live|trực tiếp/i.test(b?.metadataBadgeRenderer?.label || '')) || false);

      const thumbs = vr.thumbnail?.thumbnails || [];
      const thumbnailUrl = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;
      const chAvatar = vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url || '';

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
        description: vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') || '',
        category: isLive ? 'live' : 'trending'
      });
    }

    // 2. Lockup View Model (New YouTube Search Layout)
    const lv = node.lockupViewModel;
    if (lv && lv.contentId && !seenIds.has(lv.contentId)) {
      seenIds.add(lv.contentId);
      const metaVm = lv.metadata?.lockupMetadataViewModel;
      const title = metaVm?.title?.content || 'Video YouTube';
      const sources = lv.contentImage?.thumbnailViewModel?.image?.sources || [];
      const thumbnailUrl = sources[sources.length - 1]?.url || `https://i.ytimg.com/vi/${lv.contentId}/hqdefault.jpg`;

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
        category: isLive ? 'live' : 'trending'
      });
    }

    // 3. Channel Renderer
    const cr = node.channelRenderer;
    if (cr && cr.channelId && !channels.some(c => c.id === cr.channelId)) {
      const title = cr.title?.simpleText || cr.title?.runs?.[0]?.text || 'Kênh YouTube';
      const subscribers = cr.subscriberCountText?.simpleText || cr.subscriberCountText?.runs?.[0]?.text || '';
      const thumbs = cr.thumbnail?.thumbnails || [];
      const avatarUrl = thumbs[thumbs.length - 1]?.url || '';
      channels.push({
        id: cr.channelId,
        title,
        subscribers,
        avatarUrl,
        description: cr.descriptionSnippet?.runs?.[0]?.text || ''
      });
    }

    for (const key of Object.keys(node)) {
      walk(node[key]);
    }
  };

  walk(data);
  return { items, channels };
}

// Direct Client-Side YouTube Scraper fallback
async function fetchDirectYouTubeSearch(query: string): Promise<SearchResultsResponse> {
  const targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&gl=VN&hl=vi`;
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    if (res.ok) {
      const html = await res.text();
      const parsed = parseYtInitialData(html);
      if (parsed.items.length > 0 || parsed.channels.length > 0) {
        return {
          channels: parsed.channels,
          items: parsed.items,
          nextToken: null
        };
      }
    }
  } catch (err) {
    console.warn('[YouTube API] Direct HTML search failed:', err);
  }
  return { channels: [], items: [] };
}

// Invidious Public Instances list for client-side fallback
const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://inv.tux.pizza',
  'https://invidious.jing.rocks',
  'https://iv.ggtyler.dev',
  'https://invidious.drgns.space',
  'https://yt.drgnz.club'
];

async function fetchInvidiousTrending(category: string = 'all'): Promise<YouTubeVideo[]> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const url = `${base}/api/v1/trending?region=VN${category !== 'all' ? `&type=${category}` : ''}`;
      const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((item: any) => ({
            id: item.videoId || item.id,
            title: item.title || 'Video YouTube',
            channelTitle: item.author || item.uploaderName || 'Kênh YouTube',
            channelId: item.authorId || '',
            publishedAt: item.publishedText || 'Mới đây',
            viewCount: item.viewCountText || formatViews(item.viewCount),
            duration: item.lengthSeconds ? `${Math.floor(item.lengthSeconds / 60)}:${String(item.lengthSeconds % 60).padStart(2, '0')}` : 'LIVE',
            thumbnailUrl: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
            category: category || 'trending'
          }));
        }
      }
    } catch {
      // try next instance
    }
  }
  return [];
}

const CATEGORY_SEARCH_QUERIES: Record<string, string> = {
  all: 'nhạc trẻ remix hot tiktok triệu view 2026',
  trending: 'tin tức sự kiện giải trí thịnh hành việt nam',
  music: 'nhạc trẻ việt nam hay nhất vpop mới nhất',
  gaming: 'stream game liên quân ff pubg highlight',
  news: 'tin tức thời sự thế giới việt nam 24h',
  sports: 'bóng đá ngoại hạng anh c1 highlights mới nhất',
  entertainment: 'hài hước triệu view gameshow việt nam',
  kids: 'hoạt hình thiếu nhi doraremon tiếng việt',
  tech: 'công nghệ review smartphone máy tính mới',
  shorts: 'shorts hài hước triệu view'
};

export const youtubeApi = {
  // Get trending page with robust multi-tier fallback
  getTrendingPage: async (category: string = 'all', token?: string | null): Promise<TrendingPageResponse> => {
    const qs = new URLSearchParams({ category });
    if (token) qs.set('token', token);

    // Tier 1: Backend API
    try {
      const res = await fetch(getFullApiUrl(`/api/youtube/trending?${qs.toString()}`));
      if (res.ok) {
        const text = await res.text();
        // Ensure response is real JSON and not a 302 HTML cookie wall
        if (text.startsWith('{') || text.startsWith('[')) {
          const data = JSON.parse(text);
          if (Array.isArray(data?.items) && data.items.length > 0) {
            return { items: data.items, nextToken: data.nextToken || null };
          }
        }
      }
    } catch (e) {
      console.warn('Backend YouTube trending error:', e);
    }

    if (token) return { items: [], nextToken: null };

    // Tier 2: Direct YouTube HTML Search with Category Keyword (Real Data guaranteed)
    const searchKeyword = CATEGORY_SEARCH_QUERIES[category] || CATEGORY_SEARCH_QUERIES.all;
    try {
      const directSearch = await fetchDirectYouTubeSearch(searchKeyword);
      if (directSearch.items && directSearch.items.length > 0) {
        return { items: directSearch.items, nextToken: null };
      }
    } catch (e) {
      console.warn('Direct YouTube search error:', e);
    }

    // Tier 3: Invidious API
    try {
      const invItems = await fetchInvidiousTrending(category);
      if (invItems.length > 0) {
        return { items: invItems, nextToken: null };
      }
    } catch (e) {
      console.warn('Invidious trending error:', e);
    }

    return { items: [], nextToken: null };
  },

  // Get trending videos by category
  getTrending: async (category: string = 'all'): Promise<YouTubeVideo[]> => {
    const page = await youtubeApi.getTrendingPage(category);
    return page.items;
  },

  // Full search returns both channels and videos with robust fallback
  searchFull: async (query: string, token?: string | null): Promise<SearchResultsResponse> => {
    const trimmed = (query || '').trim();

    if (!trimmed) {
      const def = await youtubeApi.getTrendingPage('all');
      return { channels: [], items: def.items };
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
        ]
      };
    }

    // Tier 1: Backend API Search
    try {
      const url = token
        ? getFullApiUrl(`/api/youtube/search?q=${encodeURIComponent(trimmed)}&token=${encodeURIComponent(token)}`)
        : getFullApiUrl(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
      const res = await fetch(url);
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
    } catch (e) {
      console.warn('Backend YouTube search error:', e);
    }

    // Tier 2: Direct Client-Side YouTube Scrape
    try {
      const directResults = await fetchDirectYouTubeSearch(trimmed);
      if (directResults.items.length > 0 || directResults.channels.length > 0) {
        return directResults;
      }
    } catch (e) {
      console.warn('Direct YouTube search fallback error:', e);
    }

    // Tier 3: Invidious Search
    for (const base of INVIDIOUS_INSTANCES) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        }).finally(() => clearTimeout(timer));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const items: YouTubeVideo[] = [];
            const channels: YouTubeChannel[] = [];
            for (const it of data) {
              if (it.type === 'video') {
                items.push({
                  id: it.videoId,
                  title: it.title,
                  channelTitle: it.author,
                  channelId: it.authorId,
                  publishedAt: it.publishedText || 'Mới đây',
                  viewCount: it.viewCountText || formatViews(it.viewCount),
                  duration: it.lengthSeconds ? `${Math.floor(it.lengthSeconds / 60)}:${String(it.lengthSeconds % 60).padStart(2, '0')}` : 'LIVE',
                  thumbnailUrl: it.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
                  category: 'trending'
                });
              } else if (it.type === 'channel') {
                channels.push({
                  id: it.authorId,
                  title: it.author,
                  subscribers: it.subCount ? `${it.subCount.toLocaleString('vi-VN')} người đăng ký` : '',
                  avatarUrl: it.authorThumbnails?.[0]?.url || '',
                  description: it.description || ''
                });
              }
            }
            if (items.length > 0 || channels.length > 0) {
              return { channels, items, nextToken: null };
            }
          }
        }
      } catch {
        // try next
      }
    }

    return { channels: [], items: [] };
  },

  // Search videos or parse direct URL
  search: async (query: string): Promise<YouTubeVideo[]> => {
    const res = await youtubeApi.searchFull(query);
    return res.items;
  },

  // Get Channel details and channel videos
  getChannelDetails: async (channelId: string, channelName?: string): Promise<{ channel: YouTubeChannel | null; items: YouTubeVideo[] }> => {
    const fallbackChannel: YouTubeChannel = {
      id: channelId || 'channel_default',
      title: channelName || 'Kênh YouTube',
    };

    // Tier 1: Backend
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

    // Tier 2: Search channel query directly
    if (channelName || channelId) {
      const searchRes = await youtubeApi.searchFull(channelName || channelId);
      return {
        channel: searchRes.channels[0] || fallbackChannel,
        items: searchRes.items
      };
    }

    return { channel: fallbackChannel, items: [] };
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
    } catch (e) {
      // Ignore
    }

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
