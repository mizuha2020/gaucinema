import { YouTubeVideo, YouTubeChannel } from '../types';

// Curated high quality default YouTube videos for instant loading across categories
const CURATED_YOUTUBE_VIDEOS: YouTubeVideo[] = [
  {
    id: 'dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
    channelTitle: 'Rick Astley',
    channelAvatar: 'https://yt3.ggpht.com/fG_R3L10Q-0d7-F3l-q07w6hLgP2Z-E-E_Q=s88-c-k-c0x00ffffff-no-rj',
    publishedAt: '14 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    duration: '03:33',
    durationSeconds: 213,
    viewCount: 1600000000,
    likeCount: 18000000,
    category: 'music',
    description: 'Bản nhạc kinh điển bất hủ mọi thời đại trên YouTube!',
  },
  {
    id: 'kJQP7kiw5Fk',
    title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
    channelTitle: 'Luis Fonsi',
    publishedAt: '7 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/maxresdefault.jpg',
    duration: '04:41',
    durationSeconds: 281,
    viewCount: 8400000000,
    category: 'music',
    description: 'MV âm nhạc đạt kỷ lục lượt xem nhiều nhất lịch sử YouTube.',
  },
  {
    id: '9bZkp7q19f0',
    title: 'PSY - GANGNAM STYLE (강남스타일) M/V',
    channelTitle: 'officialpsy',
    publishedAt: '12 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/9bZkp7q19f0/maxresdefault.jpg',
    duration: '04:13',
    durationSeconds: 253,
    viewCount: 5100000000,
    category: 'music',
    description: 'Cơn sốt điệu nhảy ngựa Gangnam Style bùng nổ toàn cầu.',
  },
  {
    id: 'fnlJw9H0xAM',
    title: 'SƠN TÙNG M-TP | CÚS THIÊN HƯƠNG - LẠC TRÔI (OFFICIAL MUSIC VIDEO)',
    channelTitle: 'Sơn Tùng M-TP Official',
    publishedAt: '7 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/fnlJw9H0xAM/maxresdefault.jpg',
    duration: '04:24',
    durationSeconds: 264,
    viewCount: 260000000,
    category: 'music',
    description: 'MV cổ trang ấn tượng làm nên tên tuổi Sơn Tùng M-TP.',
  },
  {
    id: 'knW7-x7Y7RE',
    title: 'SƠN TÙNG M-TP | HÃY CỦA ANH (OFFICIAL MUSIC VIDEO) ft. Snoop Dogg',
    channelTitle: 'Sơn Tùng M-TP Official',
    publishedAt: '5 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/knW7-x7Y7RE/maxresdefault.jpg',
    duration: '04:36',
    durationSeconds: 276,
    viewCount: 270000000,
    category: 'music',
    description: 'Sự kết hợp bùng nổ giữa Sơn Tùng M-TP và siêu sao quốc tế Snoop Dogg.',
  },
  {
    id: 'L3wKzyIN1yk',
    title: 'ĐỘ MIXI - TỘI CHO CÔ GÁI ĐÓ (OFFICIAL MUSIC VIDEO)',
    channelTitle: 'MixiGaming',
    publishedAt: '3 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/L3wKzyIN1yk/maxresdefault.jpg',
    duration: '03:45',
    durationSeconds: 225,
    viewCount: 95000000,
    category: 'entertainment',
    description: 'Siêu phẩm ca nhạc hài hước gây bão cộng đồng MixiCity.',
  },
  {
    id: 'fJ9rUzIMcZQ',
    title: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
    channelTitle: 'Queen Official',
    publishedAt: '15 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/maxresdefault.jpg',
    duration: '05:59',
    durationSeconds: 359,
    viewCount: 1700000000,
    category: 'music',
    description: 'Kiệt tác nhạc Rock huyền thoại của nhóm Queen.',
  },
  {
    id: 'CevxZvSJLk8',
    title: 'Katy Perry - Roar (Official)',
    channelTitle: 'Katy Perry',
    publishedAt: '10 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/CevxZvSJLk8/maxresdefault.jpg',
    duration: '04:29',
    durationSeconds: 269,
    viewCount: 4000000000,
    category: 'music',
    description: 'MV Roar rực rỡ sắc màu rừng xanh của Katy Perry.',
  },
  {
    id: '09R8_2nJtjg',
    title: 'Maroon 5 - Sugar (Official Music Video)',
    channelTitle: 'Maroon 5',
    publishedAt: '9 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/09R8_2nJtjg/maxresdefault.jpg',
    duration: '05:01',
    durationSeconds: 301,
    viewCount: 4000000000,
    category: 'music',
    description: 'Maroon 5 đột nhập các đám cưới bất ngờ gây bão mạng xã hội.',
  },
  {
    id: 'L0MK7qz13bU',
    title: 'Frozen - Let It Go (Sing-Along Version)',
    channelTitle: 'DisneyAnimation',
    publishedAt: '10 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/L0MK7qz13bU/maxresdefault.jpg',
    duration: '03:43',
    durationSeconds: 223,
    viewCount: 3200000000,
    category: 'kids',
    description: 'Ca khúc Nữ Hoàng Băng Giá huyền thoại dành cho mọi lứa tuổi.',
  },
  {
    id: '7PCkvCPvDXk',
    title: 'Playstation 5 Pro - Announcement Trailer | PS5 Pro',
    channelTitle: 'PlayStation',
    publishedAt: '5 tháng trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/7PCkvCPvDXk/maxresdefault.jpg',
    duration: '09:12',
    durationSeconds: 552,
    viewCount: 12000000,
    category: 'tech',
    description: 'Sự kiện ra mắt PlayStation 5 Pro thế hệ mới với hiệu năng đồ họa cực khủng.',
  },
  {
    id: 'f_J_3cT7qK8',
    title: 'GTA VI Trailer 1 (Rockstar Games)',
    channelTitle: 'Rockstar Games',
    publishedAt: '8 tháng trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/QdBZY2fkU-0/maxresdefault.jpg',
    duration: '01:31',
    durationSeconds: 91,
    viewCount: 210000000,
    category: 'gaming',
    description: 'Trailer bom tấn Grand Theft Auto VI đỉnh cao từ Rockstar Games.',
  },
  {
    id: 'tOM_W3A5Pno',
    title: 'Apple Vision Pro — Introducing Apple Vision Pro',
    channelTitle: 'Apple',
    publishedAt: '1 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/TX9qSaGXFyg/maxresdefault.jpg',
    duration: '09:22',
    durationSeconds: 562,
    viewCount: 60000000,
    category: 'tech',
    description: 'Kính thực tế không gian đột phá Apple Vision Pro.',
  },
  {
    id: 'kXYiU_JCYtU',
    title: 'NÚT BẠC YOUTUBE ĐẦU TIÊN CỦA MIXIGAMING',
    channelTitle: 'MixiGaming',
    publishedAt: '4 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/kXYiU_JCYtU/maxresdefault.jpg',
    duration: '15:20',
    durationSeconds: 920,
    viewCount: 18000000,
    category: 'gaming',
    description: 'Khoảnh khắc nhận nút bạc YouTube của streamer Độ Mixi.',
  },
  {
    id: '3JZ_D3ELwOQ',
    title: 'LoL Esports - League of Legends World Championship 2024 Finals Highlights',
    channelTitle: 'LoL Esports',
    publishedAt: '3 tháng trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/3JZ_D3ELwOQ/maxresdefault.jpg',
    duration: '18:40',
    durationSeconds: 1120,
    viewCount: 15000000,
    category: 'gaming',
    description: 'Trận chung kết CKTG LMHT đỉnh cao với Faker và T1.',
  },
  {
    id: 'C_cQ4vC8dWE',
    title: 'Mèo Ú Doraemon - Tập Đặc Biệt Thuyết Minh Tiếng Việt',
    channelTitle: 'Doraemon Vietnam',
    publishedAt: '1 năm trước',
    thumbnailUrl: 'https://i.ytimg.com/vi/C_cQ4vC8dWE/maxresdefault.jpg',
    duration: '22:15',
    durationSeconds: 1335,
    viewCount: 45000000,
    category: 'kids',
    description: 'Bộ phim hoạt hình Doraemon quen thuộc gắn liền với tuổi thơ.',
  },
  {
    id: '5qap5aO4i9A',
    title: 'lofi hip hop radio - beats to relax/study to',
    channelTitle: 'Lofi Girl',
    publishedAt: 'Đang phát trực tiếp',
    thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/maxresdefault.jpg',
    duration: 'LIVESTREAM',
    durationSeconds: 999999,
    viewCount: 850000000,
    category: 'music',
    description: 'Nhạc Lofi Chill không lời nhẹ nhàng học tập và thư giãn 24/7.',
  },
  {
    id: 'shorts_demo_1',
    title: 'Kỹ năng chơi game siêu đỉnh của tuyển thủ chuyên nghiệp #shorts',
    channelTitle: 'Gamer Pro',
    publishedAt: '1 ngày trước',
    thumbnailUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
    duration: '00:45',
    durationSeconds: 45,
    viewCount: 2500000,
    category: 'shorts',
    isShort: true,
  },
  {
    id: 'shorts_demo_2',
    title: 'Hướng dẫn làm món ăn cực ngon chỉ trong 1 minute! #shorts #cooking',
    channelTitle: 'Bếp Của Mẹ',
    publishedAt: '3 ngày trước',
    thumbnailUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80',
    duration: '00:58',
    durationSeconds: 58,
    viewCount: 4100000,
    category: 'shorts',
    isShort: true,
  },
  {
    id: 'shorts_demo_3',
    title: 'Thử thách hài hước cười bể bụng #shorts #funny',
    channelTitle: 'Hài Hước TV',
    publishedAt: '1 tuần trước',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    duration: '00:30',
    durationSeconds: 30,
    viewCount: 8900000,
    category: 'shorts',
    isShort: true,
  }
];

// Helper to extract YouTube Video ID from any input string or URL
export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const clean = input.trim();
  
  // Standard 11 char video ID (e.g. dQw4w9WgXcQ)
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }
  
  // Match youtube.com/watch?v=VIDEO_ID
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

export const youtubeApi = {
  // Get one trending page; pass token for the next page (infinite scroll)
  getTrendingPage: async (category: string = 'all', token?: string | null): Promise<TrendingPageResponse> => {
    const qs = new URLSearchParams({ category });
    if (token) qs.set('token', token);

    try {
      const res = await fetch(`/api/youtube/trending?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.items)) {
          return { items: data.items, nextToken: data.nextToken || null };
        }
      }
    } catch (e) {
      console.warn('Backend YouTube trending error, falling back to curated list:', e);
    }

    // Curated fallback only makes sense for the first page
    if (token) return { items: [], nextToken: null };
    if (category === 'all' || !category) {
      return { items: CURATED_YOUTUBE_VIDEOS, nextToken: null };
    }
    const filtered = CURATED_YOUTUBE_VIDEOS.filter((v) => v.category === category || (category === 'shorts' && v.isShort));
    return { items: filtered.length > 0 ? filtered : CURATED_YOUTUBE_VIDEOS, nextToken: null };
  },

  // Get trending videos by category
  getTrending: async (category: string = 'all'): Promise<YouTubeVideo[]> => {
    const page = await youtubeApi.getTrendingPage(category);
    if (page.items.length > 0) return page.items;

    // Legacy keyword-search endpoint as last resort
    try {
      const res = await fetch(`/api/youtube/trending-legacy?category=${encodeURIComponent(category)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
          return data.items;
        }
      }
    } catch {
      // Ignore
    }
    return [];
  },

  // Full search returns both channels and videos; pass token to fetch the next page (infinite scroll)
  searchFull: async (query: string, token?: string | null): Promise<SearchResultsResponse> => {
    const trimmed = (query || '').trim();

    // Continuation page request
    if (token) {
      try {
        const res = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(trimmed)}&token=${encodeURIComponent(token)}`
        );
        if (res.ok) {
          const data = await res.json();
          return {
            channels: data.channels || [],
            items: Array.isArray(data.items) ? data.items : [],
            nextToken: data.nextToken || null,
          };
        }
      } catch {
        // Ignore
      }
      return { channels: [], items: [], nextToken: null };
    }

    if (!trimmed) {
      return { channels: [], items: CURATED_YOUTUBE_VIDEOS };
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

    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.items || data?.channels) {
          return {
            channels: data.channels || [],
            items: data.items || [],
            nextToken: data.nextToken || null,
          };
        }
      }
    } catch (e) {
      console.warn('Backend YouTube search error, using local fallback:', e);
    }

    return {
      channels: [],
      items: CURATED_YOUTUBE_VIDEOS.slice(0, 8)
    };
  },

  // Search videos or parse direct URL
  search: async (query: string): Promise<YouTubeVideo[]> => {
    const res = await youtubeApi.searchFull(query);
    return res.items;
  },

  // Get Channel details and channel videos (server scrapes the channel's real VIDEOS tab)
  getChannelDetails: async (channelId: string, channelName?: string): Promise<{ channel: YouTubeChannel | null; items: YouTubeVideo[] }> => {
    const fallbackChannel: YouTubeChannel = {
      id: channelId || 'channel_default',
      title: channelName || 'Kênh YouTube',
    };

    try {
      const queryParams = new URLSearchParams();
      if (channelId) queryParams.set('id', channelId);
      if (channelName) queryParams.set('name', channelName);

      const res = await fetch(`/api/youtube/channel?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return {
          channel: data?.channel ? { ...fallbackChannel, ...data.channel } : fallbackChannel,
          // Only trust server-scraped videos of this exact channel; no keyword-search pollution
          items: Array.isArray(data?.items) ? data.items : [],
        };
      }
    } catch (e) {
      console.warn('Backend channel details error:', e);
    }

    return { channel: fallbackChannel, items: [] };
  },

  // Get single video details
  getVideoDetail: async (videoId: string): Promise<YouTubeVideo> => {
    const extracted = extractYouTubeId(videoId) || videoId;
    const found = CURATED_YOUTUBE_VIDEOS.find((v) => v.id === extracted);
    if (found) return found;

    try {
      const res = await fetch(`/api/youtube/video/${extracted}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.video) return data.video;
      }
    } catch (e) {
      // Ignore
    }

    return {
      id: extracted,
      title: `Video YouTube (${extracted})`,
      channelTitle: 'YouTube Video',
      publishedAt: 'Đang phát',
      thumbnailUrl: `https://i.ytimg.com/vi/${extracted}/maxresdefault.jpg`,
      description: 'Phát trực tiếp không quảng cáo trên Gấu YouTube.',
    };
  },
};
