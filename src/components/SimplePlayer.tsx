import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  List,
  X,
  AlertCircle,
  Server,
  Zap,
  SkipForward,
  PictureInPicture2,
} from 'lucide-react';
import { EpisodeServer, Movie, MovieEpisode, Account, UserProfile } from '../types';
import { presenceService } from '../services/presenceService';
import { watchHistoryService } from '../services/watchHistoryService';
import { enterNativePip, setNativeVideoPlaying, checkNativePipSupported } from '../utils/nativeVideoPlayer';
import { Capacitor } from '@capacitor/core';

interface SimplePlayerProps {
  movie: Movie;
  currentEpisode: MovieEpisode;
  currentServer: EpisodeServer;
  allServers: EpisodeServer[];
  onBack: () => void;
  onSelectEpisode: (ep: MovieEpisode, server: EpisodeServer, currentTime?: number) => void;
  onSaveProgress: (currentTime: number, duration: number) => void;
  initialTime?: number;
  autoFullscreen?: boolean; // 👈 Thêm prop này, mặc định true
  currentAccount?: Account | null;
  activeProfile?: UserProfile | null;
}

function getMirrorUrls(originalUrl: string): string[] {
  if (!originalUrl) return [];
  const mirrors = [
    'vip.opstream15.com',
    'vip.opstream16.com',
    'vip.opstream17.com',
    's1.phim1280.tv',
  ];
  const list: string[] = [originalUrl];
  try {
    const url = new URL(originalUrl);
    const host = url.host;
    if (host.includes('opstream') || host.includes('phim1280')) {
      for (const m of mirrors) {
        if (m !== host) {
          const copy = new URL(originalUrl);
          copy.host = m;
          list.push(copy.toString());
        }
      }
    }
  } catch {}
  return list;
}

export const SimplePlayer: React.FC<SimplePlayerProps> = ({
  movie,
  currentEpisode,
  currentServer,
  allServers,
  onBack,
  onSelectEpisode,
  onSaveProgress,
  initialTime = 0,
  autoFullscreen = false, // 👈 Mặc định bật
  currentAccount,
  activeProfile,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const saveInterval = useRef<NodeJS.Timeout | null>(null);
  const lastSavedTimeRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('player_volume');
      return saved ? parseFloat(saved) : 1;
    } catch {
      return 1;
    }
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityLevels, setQualityLevels] = useState<{ height: number; level: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [brightness, setBrightness] = useState(() => {
    try {
      const saved = localStorage.getItem('player_brightness');
      return saved ? parseFloat(saved) : 1;
    } catch {
      return 1;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useEmbed, setUseEmbed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isEpisodesOpen, setIsEpisodesOpen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [pipSupported, setPipSupported] = useState(true);

  // Auto skip 30s ad at 15:00 - 15:30
  const [autoSkipAd, setAutoSkipAd] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('player_auto_skip_ad');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [skippedAdToast, setSkippedAdToast] = useState<boolean>(false);
  const hasSkippedAdRef = useRef<boolean>(false);

  const [hud, setHud] = useState<{ type: 'volume' | 'brightness'; value: number } | null>(null);
  const hudTimer = useRef<NodeJS.Timeout | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioInitializedRef = useRef<boolean>(false);

  const initAudioBoost = () => {
    if (audioInitializedRef.current || !videoRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const gainNode = ctx.createGain();
        gainNodeRef.current = gainNode;
        const source = ctx.createMediaElementSource(videoRef.current);
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        audioInitializedRef.current = true;
      }
    } catch (e) {
      // AudioContext source might already be connected or restricted
    }
  };

  // Safe cleanup of AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close().catch(() => {});
        } catch {}
        audioCtxRef.current = null;
      }
      audioInitializedRef.current = false;
    };
  }, []);

  const touchData = useRef<{
    x: number;
    y: number;
    mode: 'brightness' | 'volume';
    startVal: number;
    startTime: number;
    hasMoved: boolean;
  } | null>(null);
  const lastTouchTapTime = useRef<number>(0);
  const lastTouchTime = useRef<number>(0);

  const handleMouseMove = () => {
    if (Date.now() - lastTouchTime.current < 600) return;
    resetControlsTimer();
  };

  const showHud = useCallback((type: 'volume' | 'brightness', value: number) => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    setHud({ type, value });
    hudTimer.current = setTimeout(() => setHud(null), 1200);
  }, []);

  const changeBrightness = useCallback(
    (val: number, showToast = true) => {
      const clamped = Math.min(1.0, Math.max(0.2, val));
      setBrightness(clamped);
      localStorage.setItem('player_brightness', String(clamped));
      if (showToast) showHud('brightness', clamped);
    },
    [showHud]
  );

  const changeVolume = useCallback(
    (val: number, showToast = true) => {
      const clamped = Math.min(1.0, Math.max(0, val));
      setVolume(clamped);
      setIsMuted(clamped === 0);

      const video = videoRef.current;
      if (video) {
        video.volume = clamped;
        video.muted = clamped === 0;
      }
      localStorage.setItem('player_volume', String(clamped));
      if (showToast) showHud('volume', clamped);
    },
    [showHud]
  );

  const toggleMute = useCallback(() => {
    if (isMuted || volume === 0) {
      const newVol = volume > 0 ? volume : 0.8;
      changeVolume(newVol);
    } else {
      changeVolume(0);
    }
  }, [isMuted, volume, changeVolume]);

  // 👇 Hàm togglePlay có auto fullscreen
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
      // Tự động fullscreen nếu chưa fullscreen và autoFullscreen=true
      if (autoFullscreen && !document.fullscreenElement) {
        // iOS Safari
        if (typeof (video as any).webkitEnterFullscreen === 'function') {
          (video as any).webkitEnterFullscreen();
        } else if (container?.requestFullscreen) {
          container.requestFullscreen().then(() => {
            if ((window.screen?.orientation as any)?.lock) {
              (window.screen.orientation as any).lock('landscape').catch(() => {});
            }
          }).catch(() => {});
        }
      }
    } else {
      video.pause();
    }
  }, [autoFullscreen]);

  const skip = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const target = Math.min(duration, Math.max(0, video.currentTime + seconds));
      video.currentTime = target;
      setCurrentTime(target);
    },
    [duration]
  );

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    
    const isMobile = window.innerWidth <= 1024;
    const isLandscape = isMobile && window.innerWidth > window.innerHeight;
    const isFs = !!document.fullscreenElement;

    if (!isFs && (!isMobile || !isLandscape)) {
      try {
        if (typeof (videoRef.current as any)?.webkitEnterFullscreen === 'function') {
          (videoRef.current as any).webkitEnterFullscreen();
        } else {
          await container.requestFullscreen?.();
        }
        if ((window.screen?.orientation as any)?.lock) {
          await (window.screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch (err) {}
    } else {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen?.();
        }
        if (window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        }
      } catch (err) {}
    }
  }, []);

  const togglePip = useCallback(async () => {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const res = await enterNativePip();
      if (res) return;
    }

    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('[SimplePlayer] Lỗi chuyển đổi PiP:', err);
    }
  }, []);

  // Check PiP support on mount
  useEffect(() => {
    const isWebPip = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;
    if (Capacitor.isNativePlatform()) {
      checkNativePipSupported().then((sup) => setPipSupported(sup || isWebPip));
    } else {
      setPipSupported(isWebPip);
    }
  }, []);

  // PiP Event Listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      (video as any).autoPictureInPicture = true;
    } catch (e) {}

    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);

    video.addEventListener('enterpictureinpicture', onEnterPip);
    video.addEventListener('leavepictureinpicture', onLeavePip);

    const onNativePipChange = (e: any) => {
      setIsPip(!!e.detail?.isPip);
    };
    window.addEventListener('native-pip-change', onNativePipChange);

    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip);
      video.removeEventListener('leavepictureinpicture', onLeavePip);
      window.removeEventListener('native-pip-change', onNativePipChange);
    };
  }, []);

  // Auto PiP when exiting/leaving app or switching tabs while video is playing
  useEffect(() => {
    setNativeVideoPlaying(isPlaying);

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        const video = videoRef.current;
        if (video && !video.paused && !video.ended) {
          if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
            await enterNativePip();
          } else if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
            try {
              await video.requestPictureInPicture();
            } catch (e) {
              console.warn('[Auto-PiP] Notice:', e);
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
      setNativeVideoPlaying(false);
    };
  }, [isPlaying]);

  // MediaSession API setup
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${movie.name} - ${currentEpisode.name}`,
        artist: 'Gấu Cinema',
        album: currentServer.server_name || 'Stream HLS',
        artwork: [
          {
            src: movie.poster_url || movie.thumb_url || '/app_logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
          },
        ],
      });

      try {
        navigator.mediaSession.setActionHandler('play', () => {
          videoRef.current?.play();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          videoRef.current?.pause();
        });
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          skip(-(details.seekOffset || 10));
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          skip(details.seekOffset || 10);
        });
        (navigator.mediaSession.setActionHandler as any)('enterpictureinpicture', () => {
          togglePip();
        });
      } catch (e) {
        console.warn('[MediaSession] Warning:', e);
      }
    }
  }, [movie, currentEpisode, currentServer, skip, togglePip]);

  const nextEpisode = useMemo(() => {
    const idx = currentServer.server_data.findIndex((e) => e.slug === currentEpisode.slug);
    return idx !== -1 && idx < currentServer.server_data.length - 1
      ? currentServer.server_data[idx + 1]
      : null;
  }, [currentServer, currentEpisode]);

  const goToNextEpisode = useCallback(() => {
    if (nextEpisode) {
      const time = videoRef.current?.currentTime || 0;
      onSelectEpisode(nextEpisode, currentServer, time);
    }
  }, [nextEpisode, currentServer, onSelectEpisode]);

  const switchServer = useCallback(
    (targetServer: EpisodeServer) => {
      const currentIdx = currentServer.server_data.findIndex((e) => e.slug === currentEpisode.slug);
      let matched = targetServer.server_data.find(
        (e) => e.slug === currentEpisode.slug || e.name === currentEpisode.name
      );
      if (!matched && currentIdx >= 0 && currentIdx < targetServer.server_data.length) {
        matched = targetServer.server_data[currentIdx];
      }
      if (!matched) matched = targetServer.server_data[0];
      if (matched) {
        const time = Math.max(0, (videoRef.current?.currentTime || 0) - 1);
        onSelectEpisode(matched, targetServer, time);
        setIsServerMenuOpen(false);
      }
    },
    [currentServer, currentEpisode, onSelectEpisode]
  );

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (!isSettingsOpen && !isServerMenuOpen && !isEpisodesOpen) {
        setShowControls(false);
      }
    }, 3000);
  }, [isSettingsOpen, isServerMenuOpen, isEpisodesOpen]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.player-menu-btn') && !target.closest('.player-menu-content')) {
        setIsSettingsOpen(false);
        setIsServerMenuOpen(false);
        setIsEpisodesOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      // Check if we are physically in landscape mode (mobile mostly) or in actual fullscreen
      const isFs = !!document.fullscreenElement;
      const isLandscape = window.innerWidth > window.innerHeight;
      
      // On small screens, being in landscape is practically "fullscreen"
      if (window.innerWidth <= 1024) {
        setIsFullscreen(isFs || isLandscape);
      } else {
        setIsFullscreen(isFs);
      }
    };
    
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('resize', onFsChange);
    window.addEventListener('orientationchange', onFsChange);
    
    // Initial check
    onFsChange();

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('resize', onFsChange);
      window.removeEventListener('orientationchange', onFsChange);
    };
  }, []);

  // Khởi tạo HLS (giống như cũ)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentEpisode.link_m3u8 || useEmbed) return;

    setIsLoading(true);
    setErrorMsg(null);
    setQualityLevels([]);
    setCurrentQuality(-1);
    hasSkippedAdRef.current = false;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const candidates = getMirrorUrls(currentEpisode.link_m3u8);
    let candidateIndex = 0;

    const tryNext = (hls: Hls) => {
      candidateIndex++;
      if (candidateIndex < candidates.length) {
        hls.loadSource(candidates[candidateIndex]);
        hls.startLoad();
        return;
      }
      const other = allServers.find((s) => s.server_name !== currentServer.server_name);
      if (other) {
        const ep = other.server_data.find((e) => e.slug === currentEpisode.slug) || other.server_data[0];
        if (ep) {
          const time = Math.max(0, (video.currentTime || 0) - 1);
          onSelectEpisode(ep, other, time);
          return;
        }
      }
      if (currentEpisode.link_embed) {
        setUseEmbed(true);
        setIsLoading(false);
        return;
      }
      setErrorMsg('Không thể tải luồng phát. Vui lòng thử lại hoặc chọn server khác.');
      setIsLoading(false);
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000, // 30MB limit for mobile stability
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 20000,
        startLevel: -1,
        capLevelToPlayerSize: true,
      });
      hlsRef.current = hls;

      hls.loadSource(candidates[0]);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsLoading(false);
        setErrorMsg(null);
        const levels = data.levels.map((lvl, i) => ({ height: lvl.height, level: i }));
        setQualityLevels(levels);
        if (initialTime > 5) video.currentTime = initialTime;
        video.play().catch(() => {});
        video.volume = isMuted ? 0 : volume;
        video.muted = isMuted;
      });

      let errorCount = 0;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          errorCount++;
          if (errorCount <= 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (errorCount <= 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            tryNext(hls);
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = currentEpisode.link_m3u8;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        if (initialTime > 5) video.currentTime = initialTime;
        video.play().catch(() => {});
      });
      video.onerror = () => {
        if (currentEpisode.link_embed) setUseEmbed(true);
        else setErrorMsg('Không thể phát video trên trình duyệt này.');
        setIsLoading(false);
      };
    } else if (currentEpisode.link_embed) {
      setUseEmbed(true);
      setIsLoading(false);
    } else {
      setErrorMsg('Trình duyệt không hỗ trợ HLS.');
      setIsLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentEpisode.link_m3u8, useEmbed, allServers, currentServer, initialTime, onSelectEpisode]);

  useEffect(() => {
    presenceService.startSession({
      accountId: currentAccount?.id || currentAccount?.username || 'user',
      accountDisplayName: currentAccount?.displayName || currentAccount?.username || 'Khán Giả Phim',
      profileId: activeProfile?.id || 'movie_profile',
      profileName: activeProfile?.name || 'Người xem',
      profileAvatar: activeProfile?.avatar || '',
      type: 'movie',
      contentId: movie.slug,
      itemTitle: movie.name,
      itemSubtitle: currentEpisode.name ? `Tập ${currentEpisode.name}` : undefined,
      itemCover: movie.poster_url || movie.thumb_url,
      apiSourceUsed: currentServer.server_name || 'movie',
    });

    return () => {
      presenceService.stopSession();
    };
  }, [movie.name, currentEpisode.name, currentServer.server_name, currentAccount, activeProfile]);

  useEffect(() => {
    lastSavedTimeRef.current = 0;
    saveInterval.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || duration <= 0) return;
      if (video.paused) return;
      const cur = video.currentTime;
      if (lastSavedTimeRef.current > 0 && cur - lastSavedTimeRef.current < 15) return;
      lastSavedTimeRef.current = cur;
      onSaveProgress(cur, duration);
      watchHistoryService.recordWatch({
        accountId: currentAccount?.id || currentAccount?.username || 'user',
        accountDisplayName: currentAccount?.displayName || currentAccount?.username || 'Khán Giả Phim',
        profileId: activeProfile?.id || 'movie_profile',
        profileName: activeProfile?.name || 'Người xem',
        profileAvatar: activeProfile?.avatar || '',
        mediaType: 'movie',
        contentId: movie.slug || movie._id || movie.id || '',
        title: movie.name,
        subtitle: currentEpisode.name ? `Tập ${currentEpisode.name}` : undefined,
        coverUrl: movie.poster_url || movie.thumb_url,
        apiSource: currentServer.server_name || 'movie',
        currentTime: cur,
        duration: duration,
        progressPercent: Math.round((cur / duration) * 100),
        watchedDurationSeconds: 30,
      });
    }, 30000);
    return () => {
      if (saveInterval.current) clearInterval(saveInterval.current);
    };
  }, [duration, onSaveProgress]);

  // Phím tắt (giữ nguyên)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'p':
          e.preventDefault();
          togglePip();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          skip(-10);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          skip(10);
          break;
        case 'arrowup':
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.05));
          break;
        case 'arrowdown':
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.05));
          break;
        case '[':
          e.preventDefault();
          changeBrightness(Math.max(0.2, brightness - 0.1));
          break;
        case ']':
          e.preventDefault();
          changeBrightness(Math.min(2, brightness + 0.1));
          break;
        default:
          break;
      }
      resetControlsTimer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    togglePlay,
    toggleFullscreen,
    togglePip,
    toggleMute,
    skip,
    changeVolume,
    changeBrightness,
    volume,
    brightness,
    resetControlsTimer,
  ]);

  // Touch gesture & tap-to-toggle controls (mobile/tablet)
  const handleTouchStart = (e: React.TouchEvent) => {
    lastTouchTime.current = Date.now();
    const target = e.target as HTMLElement;
    if (target.closest('button, input, .controls-area, a, .player-menu-btn, .player-menu-content')) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const isLeft = touch.clientX < rect.left + rect.width / 2;
    touchData.current = {
      x: touch.clientX,
      y: touch.clientY,
      mode: isLeft ? 'brightness' : 'volume',
      startVal: isLeft ? brightness : volume,
      startTime: Date.now(),
      hasMoved: false,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    lastTouchTime.current = Date.now();
    if (!touchData.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touchData.current.y - touch.clientY;
    const deltaX = Math.abs(touch.clientX - touchData.current.x);

    if (Math.abs(deltaY) > 8 || deltaX > 8) {
      touchData.current.hasMoved = true;
    }

    if (Math.abs(deltaY) < 15 || deltaX > Math.abs(deltaY) * 0.7) return;

    const container = containerRef.current;
    if (!container) return;
    const height = container.clientHeight;
    const ratio = deltaY / (height * 0.6);

    if (touchData.current.mode === 'brightness') {
      const newVal = Math.min(1.0, Math.max(0.2, touchData.current.startVal + ratio));
      changeBrightness(newVal, true);
    } else {
      const newVal = Math.min(1.0, Math.max(0, touchData.current.startVal + ratio));
      changeVolume(newVal, true);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastTouchTime.current = Date.now();
    if (touchData.current) {
      const elapsed = Date.now() - touchData.current.startTime;
      // On mobile/touch: a clean tap (no swipe) only toggles overlay controls instantly, does NOT play/pause
      if (!touchData.current.hasMoved && elapsed < 350) {
        lastTouchTapTime.current = Date.now();
        setShowControls((prev) => {
          if (prev) {
            // Instantly hide overlay
            if (controlsTimeout.current) {
              clearTimeout(controlsTimeout.current);
              controlsTimeout.current = null;
            }
            return false;
          } else {
            // Show overlay and start timer
            resetControlsTimer();
            return true;
          }
        });
      }
      touchData.current = null;
    }
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    // If click was triggered by recent touch tap on touch screen, do not toggle play
    const isRecentTouch = Date.now() - lastTouchTapTime.current < 450;
    if (isRecentTouch) return;

    // On PC (mouse click): play / pause
    togglePlay();
  };

  const formatTime = (seconds: number) => {
    if (!seconds || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const cur = video.currentTime;
    setCurrentTime(cur);
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }

    if (cur < 890 && hasSkippedAdRef.current) {
      hasSkippedAdRef.current = false;
    }

    // Tự động nhảy 30s quảng cáo từ phút 15:00 (899.5s -> 930.5s) khi ON
    if (autoSkipAd && !hasSkippedAdRef.current && cur >= 899.5 && cur <= 901.5) {
      hasSkippedAdRef.current = true;
      video.currentTime = 930.5;
      setCurrentTime(930.5);
      setSkippedAdToast(true);
      setTimeout(() => setSkippedAdToast(false), 3500);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
    resetControlsTimer();
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 flex items-center justify-center select-none touch-none"
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {useEmbed ? (
        <div className="relative w-full h-full bg-black">
          <iframe
            src={currentEpisode.link_embed}
            className="w-full h-full border-none"
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen"
            title={movie.name}
          />
          <button
            onClick={onBack}
            className="absolute top-4 left-4 z-50 bg-black/60 text-white p-2 rounded-full hover:bg-black/80"
          >
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={() => setUseEmbed(false)}
            className="absolute top-4 right-4 z-50 bg-blue-600 text-white px-3 py-1 rounded text-sm"
          >
            Quay lại HLS
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            style={{ filter: `brightness(${brightness * 100}%)` }}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onEnded={() => {
              if (nextEpisode) goToNextEpisode();
            }}
            playsInline
            {...({ autopictureinpicture: 'true' } as any)}
            onClick={handleVideoClick}
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}

          {errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
              <p className="text-white text-lg font-semibold">{errorMsg}</p>
              {currentEpisode.link_embed && (
                <button
                  onClick={() => setUseEmbed(true)}
                  className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-500"
                >
                  Chuyển sang chế độ Embed
                </button>
              )}
            </div>
          )}

          {hud && (
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg flex items-center gap-3 pointer-events-none z-40">
              <span className="text-sm">
                {hud.type === 'brightness' ? '☀️' : hud.value === 0 ? '🔇' : '🔊'}
              </span>
              <span className="text-sm font-mono">
                {hud.type === 'brightness'
                  ? `${Math.round(hud.value * 100)}%`
                  : `${Math.round(hud.value * 100)}%`}
              </span>
              <div className="w-24 h-1 bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white"
                  style={{
                    width: `${Math.min(100, Math.max(0, hud.value * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {skippedAdToast && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 font-extrabold px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 text-xs sm:text-sm z-50 animate-bounce border border-amber-300">
              <Zap className="w-4 h-4 fill-current" />
              <span>Đã tự động bỏ qua 30s quảng cáo (15:00 - 15:30)!</span>
            </div>
          )}

          <div
            className={`absolute inset-0 flex flex-col justify-between pt-[max(2.75rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] px-3 sm:px-6 transition-opacity duration-300 pointer-events-none ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 25%, transparent 45%, transparent 65%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0.9) 100%)',
            }}
          >
            {/* Top Bar Header */}
            <div className="flex items-center justify-between gap-3 pointer-events-auto shrink-0">
              <div className="flex flex-col min-w-0 pr-2">
                <h2 className="text-white text-base sm:text-lg font-bold drop-shadow-md truncate">
                  {movie.name}
                </h2>
                <span className="text-gray-300 text-xs sm:text-sm font-medium drop-shadow-md truncate">
                  {currentEpisode.name.startsWith('Tập')
                    ? currentEpisode.name
                    : `Tập ${currentEpisode.name}`}
                </span>
              </div>
              <button
                id="simple-player-close-btn"
                onClick={onBack}
                className="bg-black/60 hover:bg-black/80 text-white min-w-[42px] min-h-[42px] p-2.5 rounded-full border border-white/20 shadow-xl cursor-pointer active:scale-95 shrink-0 flex items-center justify-center transition-all"
                title="Đóng trình phát"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </button>
            </div>

            {/* Center Controls (Play/Pause & Seek 10s) for Mobile & Tablet */}
            <div className="flex items-center justify-center gap-6 sm:gap-10 my-auto pointer-events-auto">
              {/* Skip Back 10s */}
              <button
                onClick={() => skip(-10)}
                className="p-3.5 sm:p-4 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 shadow-2xl backdrop-blur-md active:scale-90 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 group/center-skip"
                title="Lùi 10 giây"
              >
                <RotateCcw className="w-6 h-6 sm:w-7 sm:h-7 group-active/center-skip:-rotate-45 transition-transform" />
                <span className="text-[10px] sm:text-xs font-bold font-mono text-gray-200">-10s</span>
              </button>

              {/* Play / Pause Big Button */}
              <button
                onClick={togglePlay}
                className="p-5 sm:p-6 rounded-full bg-blue-600/90 hover:bg-blue-600 text-white border-2 border-white/40 shadow-2xl backdrop-blur-md active:scale-90 transition-all cursor-pointer flex items-center justify-center group/center-play"
                title={isPlaying ? 'Tạm dừng' : 'Phát'}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 sm:w-10 sm:h-10 text-white fill-white" />
                ) : (
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 text-white fill-white ml-1" />
                )}
              </button>

              {/* Skip Forward 10s */}
              <button
                onClick={() => skip(10)}
                className="p-3.5 sm:p-4 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 shadow-2xl backdrop-blur-md active:scale-90 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 group/center-skip"
                title="Tới 10 giây"
              >
                <RotateCw className="w-6 h-6 sm:w-7 sm:h-7 group-active/center-skip:rotate-45 transition-transform" />
                <span className="text-[10px] sm:text-xs font-bold font-mono text-gray-200">+10s</span>
              </button>
            </div>

            {/* Bottom Controls Area */}
            <div className="pointer-events-auto space-y-2 sm:space-y-3 shrink-0">
              {/* Progress Slider */}
              <div className="relative w-full h-2 group/seek cursor-pointer flex items-center">
                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 bg-gray-700/80 rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full bg-gray-500/80 rounded-full transition-all"
                    style={{
                      width: `${duration > 0 ? (buffered / duration) * 100 : 0}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
              </div>

              {/* Controls Bar */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
                {/* Left controls: Volume, Time */}
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <div className="relative flex items-center group/vol">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="text-white hover:text-blue-400 p-1.5 rounded-lg cursor-pointer transition-colors"
                      title={isMuted || volume === 0 ? 'Bật âm thanh (M)' : 'Tắt âm thanh (M)'}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>

                    {/* PC volume slider on hover */}
                    <div className="hidden md:flex items-center w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all duration-200 ease-out overflow-hidden ml-0 group-hover/vol:ml-1">
                      <input
                        type="range"
                        min={0}
                        max={1.0}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          changeVolume(parseFloat(e.target.value));
                        }}
                        className="w-18 h-1 bg-slate-600 rounded-lg cursor-pointer appearance-none accent-blue-500 hover:accent-sky-400"
                        title={`Âm lượng: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                      />
                    </div>
                  </div>
                  <span className="text-white text-[11px] sm:text-xs font-mono whitespace-nowrap shrink-0 ml-0.5 sm:ml-1 tracking-tight">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Right controls: Next, Settings, Server, Episode List, Fullscreen */}
                <div className="flex items-center gap-1 sm:gap-2 ml-auto shrink-0">
                  {nextEpisode && (
                    <button
                      onClick={goToNextEpisode}
                      className="text-white hover:text-blue-400 p-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                      title="Tập tiếp theo"
                    >
                      <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="text-xs hidden md:inline">Tập tiếp</span>
                    </button>
                  )}

                  <div className="relative">
                    <button
                      onClick={() => {
                        setIsSettingsOpen(!isSettingsOpen);
                        setIsServerMenuOpen(false);
                        setIsEpisodesOpen(false);
                      }}
                      className="text-white hover:text-blue-400 p-1.5 rounded-lg player-menu-btn cursor-pointer"
                      title="Cài đặt"
                    >
                      <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    {isSettingsOpen && (
                      <div className="absolute right-0 bottom-10 bg-gray-900/95 backdrop-blur-md rounded-xl shadow-2xl p-3 w-48 z-50 player-menu-content border border-white/10">
                        <div className="mb-3">
                          <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Tốc độ phát</p>
                          <div className="grid grid-cols-3 gap-1">
                            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                              <button
                                key={spd}
                                onClick={() => {
                                  setPlaybackRate(spd);
                                  if (videoRef.current) videoRef.current.playbackRate = spd;
                                  setIsSettingsOpen(false);
                                }}
                                className={`text-xs py-1 rounded transition-colors ${
                                  playbackRate === spd
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                              >
                                {spd}x
                              </button>
                            ))}
                          </div>
                        </div>
                        {qualityLevels.length > 0 && (
                          <div className="mb-3">
                            <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Chất lượng</p>
                            <div className="space-y-1">
                              <button
                                onClick={() => {
                                  if (hlsRef.current) hlsRef.current.currentLevel = -1;
                                  setCurrentQuality(-1);
                                  setIsSettingsOpen(false);
                                }}
                                className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${
                                  currentQuality === -1
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                              >
                                Tự động
                              </button>
                              {qualityLevels.map((lvl) => (
                                <button
                                  key={lvl.level}
                                  onClick={() => {
                                    if (hlsRef.current) hlsRef.current.currentLevel = lvl.level;
                                    setCurrentQuality(lvl.level);
                                    setIsSettingsOpen(false);
                                  }}
                                  className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${
                                    currentQuality === lvl.level
                                      ? 'bg-blue-600 text-white font-bold'
                                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                  }`}
                                >
                                  {lvl.height}p
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-white/10">
                          <label className="flex items-center justify-between text-xs text-gray-300 cursor-pointer hover:text-white py-1">
                            <span className="flex items-center gap-1.5 font-medium">
                              <Zap className="w-3.5 h-3.5 text-amber-400" />
                              <span>skip QC</span>
                            </span>
                            <input
                              type="checkbox"
                              checked={autoSkipAd}
                              onChange={(e) => {
                                const val = e.target.checked;
                                setAutoSkipAd(val);
                                localStorage.setItem('player_auto_skip_ad', String(val));
                              }}
                              className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {allServers.length > 1 && (
                    <div className="relative">
                      <button
                        onClick={() => {
                          setIsServerMenuOpen(!isServerMenuOpen);
                          setIsSettingsOpen(false);
                          setIsEpisodesOpen(false);
                        }}
                        className="text-white hover:text-blue-400 p-1.5 rounded-lg flex items-center gap-1 player-menu-btn cursor-pointer"
                        title="Đổi server"
                      >
                        <Server className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="text-xs hidden md:inline">{currentServer.server_name}</span>
                      </button>
                      {isServerMenuOpen && (
                        <div className="absolute right-0 bottom-10 bg-gray-900/95 backdrop-blur-md rounded-xl shadow-2xl p-2 w-56 z-50 player-menu-content overflow-y-auto max-h-60 border border-white/10">
                          {allServers.map((srv) => (
                            <button
                              key={srv.server_name}
                              onClick={() => switchServer(srv)}
                              className={`w-full text-left px-3 py-2.5 rounded text-xs mb-1 last:mb-0 transition-colors ${
                                srv.server_name === currentServer.server_name
                                  ? 'bg-blue-600 text-white font-bold'
                                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                              }`}
                            >
                              {srv.server_name}
                              {srv.sourceLabel && <span className="opacity-60 ml-1">({srv.sourceLabel})</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="relative">
                    <button
                      onClick={() => {
                        setIsEpisodesOpen(!isEpisodesOpen);
                        setIsSettingsOpen(false);
                        setIsServerMenuOpen(false);
                      }}
                      className="text-white hover:text-blue-400 p-1.5 rounded-lg flex items-center gap-1 player-menu-btn cursor-pointer"
                      title="Danh sách tập"
                    >
                      <List className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="text-xs hidden md:inline">Tập phim</span>
                    </button>
                    {isEpisodesOpen && (
                      <div className="absolute right-0 bottom-10 bg-gray-900/95 backdrop-blur-md rounded-xl shadow-2xl p-3 w-64 z-50 player-menu-content overflow-y-auto max-h-64 custom-scrollbar border border-white/10">
                        <p className="text-gray-400 text-[10px] uppercase font-bold mb-3 px-1 tracking-wider">Danh sách tập</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {currentServer.server_data.map((ep) => (
                            <button
                              key={ep.slug}
                              onClick={() => {
                                onSelectEpisode(ep, currentServer);
                                setIsEpisodesOpen(false);
                              }}
                              className={`text-[11px] py-2 rounded text-center truncate transition-colors ${
                                ep.slug === currentEpisode.slug
                                  ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30'
                                  : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700 hover:text-white'
                              }`}
                            >
                              {ep.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {pipSupported && (
                    <button
                      onClick={togglePip}
                      className={`text-white hover:text-blue-400 p-1.5 rounded-lg active:scale-90 transition-transform cursor-pointer ${
                        isPip ? 'text-blue-400 bg-blue-500/20' : ''
                      }`}
                      title={isPip ? 'Thoát Picture-in-Picture (P)' : 'Hình trong hình / Thu nhỏ (P)'}
                      aria-label="Picture-in-Picture"
                    >
                      <PictureInPicture2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  )}

                  <button
                    onClick={toggleFullscreen}
                    className="text-white hover:text-blue-400 p-1.5 rounded-lg active:scale-90 transition-transform cursor-pointer"
                    title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                  >
                    {isFullscreen ? (
                      <Minimize className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
