import React, { useEffect, useState, useRef } from 'react';
import {
  Tv,
  Search,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Signal,
  X,
  Radio,
  Star,
  Grid,
  List,
  Server,
  ChevronDown,
  Check,
  SkipForward,
  SkipBack,
} from 'lucide-react';
import Hls from 'hls.js';
import * as dashjs from 'dashjs';
import { Account, Channel } from '../types';
import { firestoreStorage } from '../services/firestoreStorage';
import { getFullApiUrl } from '../services/apiConfig';
import { systemApiService } from '../services/systemApiService';
import { presenceService } from '../services/presenceService';
import { DEFAULT_CHANNELS } from '../data/defaultChannels';

interface LiveTvViewProps {
  currentAccount: Account | null;
}

export const LiveTvView: React.FC<LiveTvViewProps> = ({ currentAccount }) => {
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('Tất cả');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'player' | 'channels'>('player');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showSourceModal, setShowSourceModal] = useState(false);

  // Favorites state
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('qtb_tv_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = (channelUrl: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(channelUrl)
        ? prev.filter((u) => u !== channelUrl)
        : [...prev, channelUrl];
      try {
        localStorage.setItem('qtb_tv_favorites', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Source selection state
  const LIVE_SOURCES = [
    {
      id: 'default',
      name: 'Nguồn Tổng Hợp Premium',
      shortName: 'Nguồn Tổng Hợp',
      count: '400+ Kênh',
      badge: 'Ổn định nhất',
      desc: 'Kho kênh chất lượng cao đầy đủ VTV, HTV, K+, Thể Thao & Quốc Tế',
      url: '',
    },
    {
      id: 'hqclick',
      name: 'Hội Quán Click',
      shortName: 'Hội Quán Click',
      count: '45+ Kênh',
      badge: 'Tốc độ cao',
      desc: 'Nguồn kênh chuyên biệt tốc độ cao độ trễ thấp',
      url: 'https://tinyurl.com/HQClick',
    },
    {
      id: 'kenhtv5',
      name: 'KenhTV5 Thể Thao',
      shortName: 'KenhTV5',
      count: '230+ Kênh',
      badge: 'Thể thao HD',
      desc: 'Truyền hình & Trực tiếp bóng đá, giải đấu thể thao',
      url: 'https://tinyurl.com/kenhtv5',
    },
    {
      id: 'quidni',
      name: 'Quidni IPTV Quốc Tế',
      shortName: 'Quidni IPTV',
      count: '99+ Kênh',
      badge: 'Đa dạng',
      desc: 'Tổng hợp kênh Việt Nam & các đài truyền hình thế giới',
      url: 'https://quidniptv.blogspot.com/p/iptv.html',
    },
    {
      id: 'iptvorg',
      name: 'IPTV Org Mở',
      shortName: 'IPTV Org',
      count: '40+ Kênh',
      badge: 'Chính thống',
      desc: 'Danh sách các đài truyền hình mở phát sóng trực tiếp',
      url: 'https://iptv-org.github.io/iptv/countries/vn.m3u',
    },
  ];
  const [selectedSource, setSelectedSource] = useState<string>('default');

  const currentSourceObj = LIVE_SOURCES.find((s) => s.id === selectedSource) || LIVE_SOURCES[0];

  // Player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const dashPlayerRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFs);
      if (!isFs) {
        if (screen.orientation && (screen.orientation as any).unlock) {
          try {
            (screen.orientation as any).unlock();
          } catch (e) {}
        }
        if (window.history.state && window.history.state.liveTvFs) {
          window.history.back();
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('webkitbeginfullscreen', handleFullscreenChange);
    document.addEventListener('webkitendfullscreen', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('webkitbeginfullscreen', handleFullscreenChange);
      document.removeEventListener('webkitendfullscreen', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isFullscreen && !(e.state && e.state.liveTvFs)) {
        setIsFullscreen(false);
        const isNativeFs = !!(
          document.fullscreenElement || (document as any).webkitFullscreenElement
        );
        if (isNativeFs) {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if ((document as any).webkitExitFullscreen)
            (document as any).webkitExitFullscreen();
        }
        if (videoRef.current && (videoRef.current as any).webkitExitFullscreen) {
          try {
            (videoRef.current as any).webkitExitFullscreen();
          } catch (e) {}
        }
        if (screen.orientation && (screen.orientation as any).unlock) {
          try {
            (screen.orientation as any).unlock();
          } catch (e) {}
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isFullscreen]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onWebkitEndFullscreen = () => {
      setIsFullscreen(false);
      if (window.history.state && window.history.state.liveTvFs) {
        window.history.back();
      }
      if (screen.orientation && (screen.orientation as any).unlock) {
        try {
          (screen.orientation as any).unlock();
        } catch (e) {}
      }
    };

    video.addEventListener('webkitendfullscreen', onWebkitEndFullscreen);
    return () => {
      video.removeEventListener('webkitendfullscreen', onWebkitEndFullscreen);
    };
  }, [activeChannel]);

  useEffect(() => {
    fetchChannels();
  }, [selectedSource]);

  const parseM3uContent = (text: string): Channel[] => {
    const list: Channel[] = [];
    if (!text || text.length < 50) return list;

    if (text.trim().startsWith('{')) {
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json.channels)) return json.channels;
      } catch {}
    }

    const lines = text.split(/\r?\n/);
    let currentGroup = 'Truyền Hình';
    let currentLogo = '';
    let currentName = '';
    let currentKey = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const groupMatch = line.match(/group-title="([^"]*)"/);
        if (groupMatch) currentGroup = groupMatch[1];

        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
        if (logoMatch) currentLogo = logoMatch[1];

        const commaIndex = line.lastIndexOf(',');
        if (commaIndex !== -1) {
          currentName = line.substring(commaIndex + 1).trim();
        }
      } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
        currentKey = line.replace('#KODIPROP:inputstream.adaptive.license_key=', '').trim();
      } else if (line && !line.startsWith('#')) {
        if (currentName) {
          list.push({
            name: currentName,
            logo:
              currentLogo ||
              'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60',
            group: currentGroup,
            url: line,
            drmKey: currentKey || undefined,
          });
        }
        currentName = '';
        currentLogo = '';
        currentKey = '';
      }
    }
    return list;
  };

  const fetchChannels = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first for instant responsiveness
      const cacheKey = `qtb_tv_channels_${selectedSource}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setChannels(parsed);
            if (!activeChannel) setActiveChannel(parsed[0]);
          }
        }
      } catch {}

      const sourceObj = LIVE_SOURCES.find((s) => s.id === selectedSource);
      const targetUrl = sourceObj?.url;
      let loadedChannels: Channel[] = [];

      // 1. Try Backend Proxy first (Handles multi-source aggregation & HTML/JSON/M3U parsing)
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        let fetchUrl = getFullApiUrl('/api/tv/channels');
        if (targetUrl) {
          fetchUrl += `?url=${encodeURIComponent(targetUrl)}`;
        }

        const res = await fetch(fetchUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.channels) && data.channels.length > 0) {
            loadedChannels = data.channels;
          }
        }
      } catch (e) {
        console.warn('Backend /api/tv/channels fetch failed, attempting client-side fallback...', e);
      }

      // 2. Direct client-side fetch fallback (useful for mobile/direct m3u)
      if (loadedChannels.length === 0 && targetUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(targetUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) {
            const text = await res.text();
            const parsed = parseM3uContent(text);
            if (parsed.length > 0) {
              loadedChannels = parsed;
            }
          }
        } catch (e) {
          console.warn('Direct client-side fetch failed:', e);
        }
      }

      // 3. Fallback or update state
      if (loadedChannels.length > 0) {
        setChannels(loadedChannels);
        if (!activeChannel || !loadedChannels.some((c) => c.url === activeChannel.url)) {
          setActiveChannel(loadedChannels[0]);
        }
        try {
          localStorage.setItem(cacheKey, JSON.stringify(loadedChannels));
        } catch {}
      } else {
        // Safe fallback to built-in default channels
        setChannels(DEFAULT_CHANNELS);
        if (!activeChannel || !DEFAULT_CHANNELS.some((c) => c.url === activeChannel.url)) {
          setActiveChannel(DEFAULT_CHANNELS[0]);
        }
      }
    } catch (err: any) {
      console.warn('Error loading TV channels:', err);
      setChannels(DEFAULT_CHANNELS);
    } finally {
      setLoading(false);
      window.dispatchEvent(new Event('app-data-loaded'));
    }
  };

  // Extract unique groups
  const groups = [
    'Tất cả',
    '⭐ Yêu thích',
    ...Array.from(new Set(channels.map((c) => c.group || 'Khác'))),
  ];

  const filteredChannels = channels.filter((c) => {
    let matchesGroup = true;
    if (selectedGroup === '⭐ Yêu thích') {
      matchesGroup = favorites.includes(c.url);
    } else if (selectedGroup !== 'Tất cả') {
      matchesGroup = c.group === selectedGroup;
    }
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  // Handle stream playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeChannel) return;

    setIsLoadingStream(true);
    setStreamError(null);

    // Cleanup previous players
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (e) {}
      hlsRef.current = null;
    }
    if (dashPlayerRef.current) {
      try {
        dashPlayerRef.current.destroy();
      } catch (e) {}
      try {
        dashPlayerRef.current.reset();
      } catch (e) {}
      dashPlayerRef.current = null;
    }

    const streamUrl = activeChannel.url;

    if (streamUrl.includes('.mpd')) {
      try {
        const player = dashjs.MediaPlayer().create();
        dashPlayerRef.current = player;

        player.updateSettings({ debug: { logLevel: dashjs.Debug.LOG_LEVEL_NONE } });

        if (activeChannel.drmKey) {
          try {
            if (activeChannel.drmKey.trim().startsWith('{')) {
              const parsedKey = JSON.parse(activeChannel.drmKey);
              if (parsedKey.keys && Array.isArray(parsedKey.keys)) {
                const clearkeyMap: Record<string, string> = {};
                for (const item of parsedKey.keys) {
                  if (item.kid && item.k) {
                    clearkeyMap[item.kid] = item.k;
                  }
                }
                if (Object.keys(clearkeyMap).length > 0) {
                  player.setProtectionData({
                    'org.w3.clearkey': {
                      clearkeys: clearkeyMap,
                    },
                  });
                }
              }
            } else if (activeChannel.drmKey.includes(':')) {
              const [kid, k] = activeChannel.drmKey.split(':');
              player.setProtectionData({
                'org.w3.clearkey': {
                  clearkeys: {
                    [kid.trim()]: k.trim(),
                  },
                },
              });
            }
          } catch (e) {
            console.warn('Error applying ClearKey DRM config:', e);
          }
        }

        player.initialize(video, streamUrl, true);
        player.on(dashjs.MediaPlayer.events.CAN_PLAY, () => {
          setIsLoadingStream(false);
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });
        player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
          console.warn('DashJS error:', e);
          const errMsg =
            typeof e?.error === 'object' && e?.error !== null && 'message' in e.error
              ? String(e.error.message)
              : String(e?.error || '');
          if (
            errMsg.includes('DRM') ||
            errMsg.includes('NotSupportedError') ||
            errMsg.includes('key request')
          ) {
            setStreamError(
              'Kênh này sử dụng mã hóa bản quyền DRM (Widevine/Clearkey) không được trình duyệt hỗ trợ.'
            );
          } else {
            setStreamError('Không thể phát luồng DASH (Lỗi kết nối hoặc mã hóa).');
          }
          setIsLoadingStream(false);
        });
      } catch (err: any) {
        setStreamError('Lỗi khởi tạo trình phát DASH: ' + err.message);
        setIsLoadingStream(false);
      }
    } else if (streamUrl.includes('.m3u8') || Hls.isSupported()) {
      if (Hls.isSupported()) {
        let isProxyAttempt = false;
        const initialPlayUrl = streamUrl;

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsRef.current = hls;

        hls.loadSource(initialPlayUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoadingStream(false);
          video.volume = isMuted ? 0 : volume;
          video.muted = isMuted;
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.warn('HLS fatal error:', data);
            if (!isProxyAttempt) {
              isProxyAttempt = true;
              const proxyUrl = getFullApiUrl(
                `/api/tv/stream-proxy?url=${encodeURIComponent(streamUrl)}`
              );
              hls.loadSource(proxyUrl);
              hls.attachMedia(video);
            } else {
              setStreamError(
                'Không thể kết nối luồng phát HLS (Kênh ngoại tuyến hoặc cần đổi nguồn).'
              );
              setIsLoadingStream(false);
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          setIsLoadingStream(false);
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });
      }
    } else {
      video.src = streamUrl;
      setIsLoadingStream(false);
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }

    if (activeChannel) {
      presenceService.startHeartbeat({
        accountId: currentAccount?.id || currentAccount?.username || 'user',
        accountDisplayName: currentAccount?.displayName || 'Khách LiveTV',
        profileId: 'tv_profile',
        profileName: currentAccount?.displayName || 'Người xem TV',
        type: 'watching_tv',
        itemTitle: activeChannel.name,
        itemSubtitle: activeChannel.group || 'Kênh LiveTV',
        itemCover: activeChannel.logo,
        apiSourceUsed: 'livetv',
      });
    }

    return () => {
      presenceService.stopHeartbeat();
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch (e) {}
        hlsRef.current = null;
      }
      if (dashPlayerRef.current) {
        try {
          dashPlayerRef.current.destroy();
        } catch (e) {}
        try {
          dashPlayerRef.current.reset();
        } catch (e) {}
        dashPlayerRef.current = null;
      }
    };
  }, [activeChannel, currentAccount]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true));
    }
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    const video = videoRef.current;
    if (video) {
      video.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    video.muted = nextMuted;
  };

  const toggleFullscreen = () => {
    const videoContainer = document.getElementById('live-tv-player-container');
    const isNativeFs = !!(
      document.fullscreenElement || (document as any).webkitFullscreenElement
    );

    if (!isNativeFs && !isFullscreen) {
      setIsFullscreen(true);
      window.history.pushState({ liveTvFs: true, tab: 'tv-live' }, '', '');
      if (videoContainer) {
        if (videoContainer.requestFullscreen) {
          videoContainer
            .requestFullscreen()
            .then(() => {
              if (screen.orientation && (screen.orientation as any).lock) {
                (screen.orientation as any).lock('landscape').catch(() => {});
              }
            })
            .catch(() => {});
        } else if ((videoContainer as any).webkitRequestFullscreen) {
          (videoContainer as any).webkitRequestFullscreen();
        } else if ((videoContainer as any).msRequestFullscreen) {
          (videoContainer as any).msRequestFullscreen();
        } else if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
          (videoRef.current as any).webkitEnterFullscreen();
        }
      }
    } else {
      if (isNativeFs) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      } else {
        setIsFullscreen(false);
        if (window.history.state && window.history.state.liveTvFs) {
          window.history.back();
        }
      }
      if (screen.orientation && (screen.orientation as any).unlock) {
        try {
          (screen.orientation as any).unlock();
        } catch (e) {}
      }
    }
  };

  const handleNextChannel = () => {
    if (!activeChannel || filteredChannels.length === 0) return;
    const currIdx = filteredChannels.findIndex((c) => c.url === activeChannel.url);
    const nextIdx = (currIdx + 1) % filteredChannels.length;
    setActiveChannel(filteredChannels[nextIdx]);
  };

  const handlePrevChannel = () => {
    if (!activeChannel || filteredChannels.length === 0) return;
    const currIdx = filteredChannels.findIndex((c) => c.url === activeChannel.url);
    const prevIdx = (currIdx - 1 + filteredChannels.length) % filteredChannels.length;
    setActiveChannel(filteredChannels[prevIdx]);
  };

  const selectChannelAndPlay = (ch: Channel) => {
    setActiveChannel(ch);
    setMobileTab('player');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#070c18] text-slate-100 pt-16 sm:pt-20 pb-20 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-4 sm:space-y-6 font-sans">
      {/* Top Header & Compact Controls Bar */}
      <div className="bg-gradient-to-r from-orange-950/80 via-[#0d162d] to-[#0a1020] rounded-2xl p-3.5 sm:p-5 border border-orange-900/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 p-2 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 shrink-0">
            <Radio className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-black text-white tracking-tight">
                Gấu LiveTV
              </h1>
              <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                LIVE
              </span>
              <span className="bg-orange-500/15 text-amber-300 border border-orange-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {channels.length} Kênh HD
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              Truyền hình, thể thao & bóng đá chất lượng cao không quảng cáo
            </p>
          </div>
        </div>

        {/* Source Selector Trigger Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSourceModal(true)}
            className="flex-1 sm:flex-none bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-orange-500/60 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg flex items-center justify-between gap-2.5 group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Server className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <div className="text-left truncate">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">
                  Nguồn phát
                </div>
                <div className="text-xs font-bold text-amber-300 truncate">
                  {currentSourceObj.shortName}
                </div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition-transform" />
          </button>

          <button
            onClick={() => fetchChannels()}
            title="Tải lại danh sách kênh"
            className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white p-2.5 sm:px-3 sm:py-2.5 rounded-xl border border-slate-700/80 text-xs font-bold transition-all cursor-pointer shadow-lg flex items-center justify-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Bar (Visible only on screens below lg) */}
      <div className="lg:hidden flex bg-[#0d162d] p-1 rounded-xl border border-slate-800/80 shadow-lg">
        <button
          onClick={() => setMobileTab('player')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mobileTab === 'player'
              ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>📺 Trực Tiếp</span>
        </button>
        <button
          onClick={() => setMobileTab('channels')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mobileTab === 'channels'
              ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>📋 Danh Sách ({filteredChannels.length})</span>
        </button>
      </div>

      {/* Main Grid Layout: Video Player + Channel Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left Column: Player & Active Channel Card */}
        <div
          className={`lg:col-span-2 space-y-4 ${
            mobileTab === 'player' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Video Player Box */}
          <div
            id="live-tv-player-container"
            onClick={() => setShowControls((prev) => !prev)}
            className={`relative bg-black transition-all duration-300 flex flex-col items-center justify-center cursor-pointer ${
              isFullscreen
                ? 'fixed inset-0 z-50 w-screen h-screen rounded-none'
                : 'aspect-video rounded-2xl overflow-hidden border border-slate-800 shadow-2xl group'
            }`}
          >
            {activeChannel ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain bg-black"
                  playsInline
                  autoPlay
                />

                {/* Stream Loading Overlay */}
                {isLoadingStream && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-3 z-20 p-4 text-center">
                    <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-amber-300 font-bold">
                      Đang kết nối luồng {activeChannel.name}...
                    </p>
                    <p className="text-[10px] text-slate-400">Vui lòng chờ trong giây lát</p>
                  </div>
                )}

                {/* Stream Error Overlay */}
                {streamError && (
                  <div
                    className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-3 z-20 p-5 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                      <Signal className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-white">Kênh đang không thể kết nối</p>
                    <p className="text-xs text-slate-400 max-w-md">{streamError}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                      <button
                        onClick={() => {
                          const ch = activeChannel;
                          setActiveChannel(null);
                          setTimeout(() => setActiveChannel(ch), 50);
                        }}
                        className="bg-orange-600 hover:bg-orange-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg"
                      >
                        Thử lại
                      </button>
                      <button
                        onClick={() => setShowSourceModal(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Đổi nguồn phát
                      </button>
                      <button
                        onClick={handleNextChannel}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Kênh tiếp theo
                      </button>
                    </div>
                  </div>
                )}

                {/* Top Video Title Overlay */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 z-10 pointer-events-auto ${
                    showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={activeChannel.logo}
                      alt={activeChannel.name}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-contain bg-white/10 p-1 border border-white/20 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60';
                      }}
                    />
                    <div className="min-w-0">
                      <h2 className="text-xs sm:text-sm font-bold text-white truncate drop-shadow">
                        {activeChannel.name}
                      </h2>
                      <p className="text-[10px] text-amber-300 font-medium truncate">
                        {activeChannel.group}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => toggleFavorite(activeChannel.url, e)}
                    className="p-2 rounded-xl bg-black/40 hover:bg-black/60 text-amber-400 transition-all cursor-pointer border border-white/10 shrink-0"
                    title={
                      favorites.includes(activeChannel.url)
                        ? 'Xóa khỏi yêu thích'
                        : 'Thêm vào yêu thích'
                    }
                  >
                    <Star
                      className={`w-4 h-4 ${
                        favorites.includes(activeChannel.url) ? 'fill-amber-400' : ''
                      }`}
                    />
                  </button>
                </div>

                {/* Bottom Player Overlay Controls Bar */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute bottom-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between transition-opacity duration-300 z-10 pointer-events-auto ${
                    showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevChannel}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                      title="Kênh trước"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                      onClick={togglePlay}
                      className="w-9 h-9 rounded-xl bg-orange-600 hover:bg-orange-500 flex items-center justify-center text-white shadow-lg transition-all cursor-pointer"
                      title={isPlaying ? 'Tạm dừng' : 'Phát'}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-white" />
                      ) : (
                        <Play className="w-4 h-4 fill-white" />
                      )}
                    </button>

                    <button
                      onClick={handleNextChannel}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                      title="Kênh tiếp"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>

                    <div
                      className="hidden sm:flex items-center gap-2 ml-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={toggleMute}
                        className="text-slate-200 hover:text-white cursor-pointer"
                        title="Bật/Tắt tiếng"
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="w-5 h-5 text-rose-400" />
                        ) : (
                          <Volume2 className="w-5 h-5 text-amber-400" />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-16 sm:w-20 accent-orange-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded shadow flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      LIVE
                    </span>

                    <button
                      onClick={toggleFullscreen}
                      className="text-slate-200 hover:text-white bg-white/15 hover:bg-white/30 p-2 rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-1 text-xs font-bold"
                      title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center text-amber-400">
                  <Tv className="w-8 h-8" />
                </div>
                <p className="text-sm font-bold text-white">Chọn một kênh để bắt đầu phát sóng</p>
                <p className="text-xs text-slate-400">Danh sách kênh ở phía dưới hoặc bên phải</p>
              </div>
            )}
          </div>

          {/* Active Channel Info & Quick Actions Card */}
          {activeChannel && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-[#0c1427] border border-slate-800 shadow-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={activeChannel.logo}
                  alt={activeChannel.name}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-contain bg-slate-950 p-1 border border-slate-700 shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60';
                  }}
                />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">
                    {activeChannel.name}
                  </h3>
                  <p className="text-[11px] text-amber-400 font-medium flex items-center gap-1.5 truncate">
                    <Signal className="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
                    <span className="truncate">{activeChannel.group}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => toggleFavorite(activeChannel.url, e)}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    favorites.includes(activeChannel.url)
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  <Star
                    className={`w-4 h-4 ${
                      favorites.includes(activeChannel.url) ? 'fill-amber-400 text-amber-400' : ''
                    }`}
                  />
                  <span className="hidden sm:inline">
                    {favorites.includes(activeChannel.url) ? 'Đã thích' : 'Yêu thích'}
                  </span>
                </button>

                <button
                  onClick={() => setMobileTab('channels')}
                  className="lg:hidden bg-orange-600 text-white font-bold px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-md"
                >
                  Đổi kênh
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Channel Explorer (List/Grid View) */}
        <div
          className={`space-y-3.5 lg:sticky lg:top-20 ${
            mobileTab === 'channels' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#0c1427] border border-slate-800 shadow-xl space-y-3">
            {/* Header with Search & Layout Toggle */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Danh Sách Kênh</h3>
                <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                  {filteredChannels.length}
                </span>
              </div>

              {/* Grid / List Mode Toggle */}
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md text-xs transition-all cursor-pointer ${
                    viewMode === 'grid' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Chế độ lưới"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md text-xs transition-all cursor-pointer ${
                    viewMode === 'list' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Chế độ danh sách"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Channel Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kênh (VTV, K+, Thể Thao...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Groups Horizontal Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
              {groups.map((grp) => {
                const isFav = grp === '⭐ Yêu thích';
                const isSelected = selectedGroup === grp;
                return (
                  <button
                    key={grp}
                    onClick={() => setSelectedGroup(grp)}
                    className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? isFav
                          ? 'bg-amber-500 text-slate-950 font-black shadow-md border border-amber-300'
                          : 'bg-orange-600 text-white font-bold shadow-md border border-orange-400'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <span>{grp}</span>
                    {isFav && favorites.length > 0 && (
                      <span className="text-[10px] bg-black/30 px-1.5 py-0.2 rounded-full font-bold">
                        {favorites.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Channel List or Grid Container */}
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-xs animate-pulse flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
                <span>Đang tải danh sách kênh...</span>
              </div>
            ) : filteredChannels.length > 0 ? (
              <div className="max-h-[460px] lg:max-h-[520px] overflow-y-auto pr-1 space-y-2">
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
                    {filteredChannels.map((ch, idx) => {
                      const isActive = activeChannel?.url === ch.url;
                      const isFav = favorites.includes(ch.url);

                      return (
                        <div
                          key={idx}
                          onClick={() => selectChannelAndPlay(ch)}
                          className={`relative p-2.5 rounded-xl border transition-all text-left flex flex-col items-center justify-center text-center cursor-pointer group ${
                            isActive
                              ? 'bg-gradient-to-b from-orange-900/40 to-slate-900 border-orange-500 shadow-lg shadow-orange-500/10'
                              : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800/90'
                          }`}
                        >
                          <button
                            onClick={(e) => toggleFavorite(ch.url, e)}
                            className="absolute top-1.5 right-1.5 p-1 text-slate-500 hover:text-amber-400 z-10 cursor-pointer"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isFav ? 'fill-amber-400 text-amber-400' : ''
                              }`}
                            />
                          </button>

                          <img
                            src={ch.logo}
                            alt={ch.name}
                            className="w-12 h-12 rounded-lg object-contain bg-slate-950 p-1 border border-slate-800 my-1 group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60';
                            }}
                          />

                          <h4
                            className={`text-xs font-bold truncate w-full mt-1 ${
                              isActive ? 'text-amber-300' : 'text-slate-100'
                            }`}
                          >
                            {ch.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 truncate w-full">{ch.group}</p>

                          {isActive && (
                            <span className="mt-1 bg-orange-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Play className="w-2.5 h-2.5 fill-white" /> Đang phát
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredChannels.map((ch, idx) => {
                      const isActive = activeChannel?.url === ch.url;
                      const isFav = favorites.includes(ch.url);

                      return (
                        <div
                          key={idx}
                          onClick={() => selectChannelAndPlay(ch)}
                          className={`w-full p-2.5 rounded-xl border transition-all text-left flex items-center justify-between gap-3 cursor-pointer ${
                            isActive
                              ? 'bg-orange-600/20 border-orange-500 text-white shadow-md'
                              : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800/90 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={ch.logo}
                              alt={ch.name}
                              className="w-9 h-9 rounded-lg object-contain bg-slate-950 p-1 shrink-0 border border-slate-800"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60';
                              }}
                            />
                            <div className="min-w-0">
                              <h4
                                className={`text-xs font-bold truncate ${
                                  isActive ? 'text-amber-300' : 'text-white'
                                }`}
                              >
                                {ch.name}
                              </h4>
                              <p className="text-[10px] text-slate-400 truncate">{ch.group}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={(e) => toggleFavorite(ch.url, e)}
                              className="p-1 text-slate-500 hover:text-amber-400 cursor-pointer"
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  isFav ? 'fill-amber-400 text-amber-400' : ''
                                }`}
                              />
                            </button>
                            {isActive ? (
                              <span className="bg-orange-600 text-white p-1 rounded-md">
                                <Play className="w-3 h-3 fill-white" />
                              </span>
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-600" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-10 text-center text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-slate-800/80 space-y-1">
                <p className="font-semibold text-slate-300">Không tìm thấy kênh phù hợp</p>
                <p className="text-[11px] text-slate-500">Thử tìm cụm từ khác hoặc chọn lại nhóm kênh</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Source Selection Custom Modal / Sheet */}
      {showSourceModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-lg bg-[#0d152a] border border-orange-900/50 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Chọn Nguồn Phát IPTV</h3>
                  <p className="text-[11px] text-slate-400">
                    Chuyển đổi danh sách kênh khi nguồn hiện tại gián đoạn
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSourceModal(false)}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {LIVE_SOURCES.map((src) => {
                const isSelected = selectedSource === src.id;
                return (
                  <div
                    key={src.id}
                    onClick={() => {
                      setSelectedSource(src.id);
                      setShowSourceModal(false);
                    }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-gradient-to-r from-orange-950/60 to-slate-900 border-orange-500 shadow-lg shadow-orange-500/10'
                        : 'bg-slate-900/80 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">{src.name}</span>
                        <span className="text-[10px] font-bold bg-orange-500/20 text-amber-300 border border-orange-500/30 px-2 py-0.2 rounded-full">
                          {src.count}
                        </span>
                        <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-full">
                          {src.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{src.desc}</p>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <div className="w-7 h-7 rounded-full bg-orange-600 flex items-center justify-center text-white shadow">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full border border-slate-700 bg-slate-950" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowSourceModal(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-700"
            >
              Đóng cửa sổ
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
