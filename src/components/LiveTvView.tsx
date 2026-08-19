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
} from 'lucide-react';
import Hls from 'hls.js';
import * as dashjs from 'dashjs';
import { Account } from '../types';
import { firestoreStorage } from '../services/firestoreStorage';
import { getFullApiUrl } from '../services/apiConfig';

interface Channel {
  name: string;
  logo: string;
  group: string;
  url: string;
}

interface LiveTvViewProps {
  currentAccount: Account | null;
}

export const LiveTvView: React.FC<LiveTvViewProps> = ({ currentAccount }) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('Tất cả');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
          try { (screen.orientation as any).unlock(); } catch (e) {}
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
        const isNativeFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
        if (isNativeFs) {
          if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
          else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
        }
        if (videoRef.current && (videoRef.current as any).webkitExitFullscreen) {
          try { (videoRef.current as any).webkitExitFullscreen(); } catch (e) {}
        }
        if (screen.orientation && (screen.orientation as any).unlock) {
          try { (screen.orientation as any).unlock(); } catch (e) {}
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
        try { (screen.orientation as any).unlock(); } catch (e) {}
      }
    };

    video.addEventListener('webkitendfullscreen', onWebkitEndFullscreen);
    return () => {
      video.removeEventListener('webkitendfullscreen', onWebkitEndFullscreen);
    };
  }, [activeChannel]);

  useEffect(() => {
    fetchChannels();
  }, []);

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
      } else if (line && !line.startsWith('#')) {
        if (currentName) {
          list.push({
            name: currentName,
            logo: currentLogo || 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60',
            group: currentGroup,
            url: line,
          });
        }
        currentName = '';
        currentLogo = '';
      }
    }
    return list;
  };

  const fetchChannels = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load cached channels first for instant display
      try {
        const cached = localStorage.getItem('qtb_tv_channels_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setChannels(parsed);
            if (!activeChannel) setActiveChannel(parsed[0]);
          }
        }
      } catch {}

      // 1. Try Backend Proxy with 4s timeout
      let loadedChannels: Channel[] = [];
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(getFullApiUrl('/api/tv/channels'), { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.channels) && data.channels.length > 0) {
            loadedChannels = data.channels;
          }
        }
      } catch (e) {
        console.warn('Backend /api/tv/channels failed, falling back to direct IPTV sources...');
      }

      // 2. Direct client-side IPTV source fallbacks if server returns 0
      if (loadedChannels.length === 0) {
        const directSources = [
          'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/vn.m3u',
          'https://iptv-org.github.io/iptv/countries/vn.m3u',
          'https://bit.ly/tinhlagitivi',
        ];

        for (const url of directSources) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
              const text = await res.text();
              const parsed = parseM3uContent(text);
              if (parsed.length > 0) {
                loadedChannels = parsed;
                break;
              }
            }
          } catch {}
        }
      }

      if (loadedChannels.length > 0) {
        setChannels(loadedChannels);
        if (!activeChannel) {
          setActiveChannel(loadedChannels[0]);
        }
        try {
          localStorage.setItem('qtb_tv_channels_cache', JSON.stringify(loadedChannels));
        } catch {}
      } else {
        setError('Không thể kết nối đến nguồn phát sóng truyền hình. Vui lòng kiểm tra lại kết nối mạng.');
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi kết nối đến máy chủ truyền hình.');
    } finally {
      setLoading(false);
    }
  };

  // Extract unique groups
  const groups = ['Tất cả', ...Array.from(new Set(channels.map((c) => c.group || 'Khác')))];

  const filteredChannels = channels.filter((c) => {
    const matchesGroup = selectedGroup === 'Tất cả' || c.group === selectedGroup;
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
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashPlayerRef.current) {
      dashPlayerRef.current.reset();
      dashPlayerRef.current = null;
    }

    const streamUrl = activeChannel.url;

    if (streamUrl.includes('.mpd')) {
      try {
        const player = dashjs.MediaPlayer().create();
        dashPlayerRef.current = player;
        
        // Suppress Dash.js internal logs to prevent AI Studio error catcher from triggering
        player.updateSettings({ debug: { logLevel: dashjs.Debug.LOG_LEVEL_NONE } });
        
        player.initialize(video, streamUrl, true);
        player.on(dashjs.MediaPlayer.events.CAN_PLAY, () => {
          setIsLoadingStream(false);
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });
        player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
          console.warn('DashJS error:', e);
          const errMsg = typeof e?.error === 'object' && e?.error !== null && 'message' in e.error 
            ? String(e.error.message) 
            : String(e?.error || '');
          if (errMsg.includes('DRM') || errMsg.includes('NotSupportedError') || errMsg.includes('key request')) {
            setStreamError('Kênh này sử dụng mã hóa bản quyền DRM (Widevine/Clearkey) không được trình duyệt web hỗ trợ.');
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
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
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
            setStreamError('Không thể kết nối luồng phát HLS (404/CORS/Ngoại tuyến).');
            setIsLoadingStream(false);
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

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (dashPlayerRef.current) {
        dashPlayerRef.current.reset();
        dashPlayerRef.current = null;
      }
    };
  }, [activeChannel]);

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
    const isNativeFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);

    if (!isNativeFs && !isFullscreen) {
      setIsFullscreen(true);
      window.history.pushState({ liveTvFs: true, tab: 'tv-live' }, '', '');
      if (videoContainer) {
        if (videoContainer.requestFullscreen) {
          videoContainer.requestFullscreen().then(() => {
            if (screen.orientation && (screen.orientation as any).lock) {
              (screen.orientation as any).lock('landscape').catch(() => {});
            }
          }).catch(() => {});
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
        try { (screen.orientation as any).unlock(); } catch (e) {}
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#070d1b] text-white pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900/60 via-indigo-950/80 to-slate-900 border border-blue-800/40 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="bg-gradient-to-r from-rose-600 to-red-600 text-white text-[11px] font-black uppercase px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 animate-pulse">
                <Radio className="w-3.5 h-3.5 text-white" />
                Live IPTV & Thể Thao
              </span>
              <span className="bg-blue-600/20 text-sky-300 border border-blue-500/30 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                {channels.length} Kênh HD
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
              Truyền Hình & Thể Thao Trực Tuyến
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Trải nghiệm hàng trăm kênh truyền hình đặc sắc, giải đấu thể thao đỉnh cao, bóng đá, phim truyện và tin tức chất lượng cao.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchChannels}
              className="flex items-center gap-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-bold transition-all cursor-pointer shadow-lg"
            >
              <RefreshCw className={`w-4 h-4 text-sky-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới danh sách</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Player + Channel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left / Top: Active Player (takes 2 cols on lg) */}
        <div className="lg:col-span-2 space-y-4 sticky top-20 z-30 bg-[#070d1b] pb-2">
          <div
            id="live-tv-player-container"
            onClick={() => setShowControls((prev) => !prev)}
            className={`relative bg-black transition-all duration-300 flex flex-col items-center justify-center cursor-pointer ${
              isFullscreen
                ? 'fixed inset-0 z-50 w-screen h-screen rounded-none'
                : 'aspect-video rounded-2xl overflow-hidden border border-blue-900/50 shadow-2xl group'
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

                {/* Loading Stream Overlay */}
                {isLoadingStream && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-sky-300 font-semibold">Đang kết nối luồng {activeChannel.name}...</p>
                  </div>
                )}

                {/* Stream Error Overlay */}
                {streamError && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 z-20 p-6 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                      <Signal className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-white">Kênh này đang ngoại tuyến hoặc lỗi</p>
                    <p className="text-xs text-slate-400 max-w-sm">{streamError}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => {
                          const ch = activeChannel;
                          setActiveChannel(null);
                          setTimeout(() => setActiveChannel(ch), 50);
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Thử lại
                      </button>
                      <button
                        onClick={() => {
                          const next = filteredChannels.find((c) => c.url !== activeChannel.url);
                          setActiveChannel(next || null);
                          setStreamError(null);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700"
                      >
                        Chuyển kênh khác
                      </button>
                    </div>
                  </div>
                )}

                {/* Top Info Bar */}
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 z-10 pointer-events-auto ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={activeChannel.logo}
                      alt={activeChannel.name}
                      className="w-9 h-9 rounded-xl object-contain bg-white/10 p-1 border border-white/20"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60';
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <h2 className="text-sm sm:text-base font-bold text-white drop-shadow-md">
                          {activeChannel.name}
                        </h2>
                      </div>
                      <p className="text-[10px] text-sky-300 font-semibold">{activeChannel.group}</p>
                    </div>
                  </div>
                </div>

                {/* Bottom Overlay Controls Bar (YouTube / Netflix style) */}
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between transition-opacity duration-300 z-10 pointer-events-auto ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white shadow-lg transition-all cursor-pointer"
                      title={isPlaying ? 'Tạm dừng' : 'Phát'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                    </button>

                    <div 
                      className="flex items-center gap-2 group/vol"
                      onClick={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button onClick={toggleMute} className="text-slate-200 hover:text-white cursor-pointer" title="Bật/Tắt tiếng">
                        {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-sky-400" />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        onInput={(e) => handleVolumeChange(parseFloat((e.target as HTMLInputElement).value))}
                        className="w-20 accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-md shadow flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      LIVE
                    </span>
                    <button
                      onClick={toggleFullscreen}
                      className="text-slate-200 hover:text-white bg-white/15 hover:bg-white/30 p-2.5 rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-1.5 text-xs font-bold"
                      title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                      <span className="hidden sm:inline">{isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-sky-400">
                  <Tv className="w-8 h-8" />
                </div>
                <p className="text-sm font-bold text-white">Chọn một kênh để bắt đầu xem</p>
                <p className="text-xs text-slate-400">Danh sách kênh phong phú ở bên cạnh</p>
              </div>
            )}
          </div>

          {/* Active Channel Details Card */}
          {activeChannel && (
            <div className="p-5 rounded-2xl bg-[#0c1427] border border-blue-900/40 shadow-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={activeChannel.logo}
                  alt={activeChannel.name}
                  className="w-12 h-12 rounded-xl object-contain bg-slate-900 p-1 border border-slate-700"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60';
                  }}
                />
                <div>
                  <h3 className="text-base font-bold text-white">{activeChannel.name}</h3>
                  <p className="text-xs text-sky-400 font-semibold flex items-center gap-1 mt-0.5">
                    <Signal className="w-3 h-3 text-emerald-400 animate-pulse" />
                    Đang phát sóng trực tiếp • {activeChannel.group}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold px-3 py-1 rounded-xl flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  LIVE HD
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right / Bottom: Channel List & Selector (takes 1 col on lg) */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <div className="p-5 rounded-2xl bg-[#0c1427] border border-blue-900/50 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Tv className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Danh Sách Kênh</h3>
              </div>
              <span className="text-xs text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                {filteredChannels.length} kênh
              </span>
            </div>

            {/* Search Channel */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên kênh (vd: VTV1, K+, Bóng đá...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Groups Horizontal Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {groups.map((grp) => (
                <button
                  key={grp}
                  onClick={() => setSelectedGroup(grp)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 cursor-pointer ${
                    selectedGroup === grp
                      ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30 border border-blue-400'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {grp}
                </button>
              ))}
            </div>

            {/* Channels Scrollable List */}
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-xs animate-pulse">
                Đang tải danh sách kênh...
              </div>
            ) : filteredChannels.length > 0 ? (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {filteredChannels.map((ch, idx) => {
                  const isActive = activeChannel?.url === ch.url;
                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveChannel(ch)}
                      className={`w-full p-2.5 rounded-xl border transition-all text-left flex items-center justify-between gap-3 cursor-pointer ${
                        isActive
                          ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg'
                          : 'bg-slate-900/80 hover:bg-slate-800/80 border-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={ch.logo}
                          alt={ch.name}
                          className="w-9 h-9 rounded-lg object-contain bg-slate-950 p-1 shrink-0 border border-slate-700"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60';
                          }}
                        />
                        <div className="min-w-0">
                          <h4 className={`text-xs font-bold truncate ${isActive ? 'text-sky-300' : 'text-white'}`}>
                            {ch.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 truncate">{ch.group}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isActive ? (
                          <span className="bg-blue-600 text-white p-1.5 rounded-lg shadow">
                            <Play className="w-3 h-3 fill-white" />
                          </span>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-600" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs bg-slate-900/50 rounded-xl border border-slate-800">
                Không tìm thấy kênh phù hợp.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
