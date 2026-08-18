import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { EpisodeServer, Movie, MovieEpisode } from '../types';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  SkipForward,
  Settings,
  Layers,
  Sparkles,
  Server,
  Film,
  AlertCircle,
  Clock,
  ExternalLink,
  Wand2,
  Monitor,
  Check,
  Info,
  Sun,
  SunMedium,
  SunDim,
  Moon,
  Scan,
  RectangleHorizontal,
} from 'lucide-react';

export type EnhanceMode = 'off' | 'sharp' | 'ultra_sharp' | 'hdr' | 'cinema';
export type AspectRatioMode = 'contain' | 'cover' | 'fill' | '16-9' | '21-9';

interface NetflixPlayerProps {
  movie: Movie;
  currentEpisode: MovieEpisode;
  currentServer: EpisodeServer;
  allServers: EpisodeServer[];
  onBack: () => void;
  onSelectEpisode: (ep: MovieEpisode, server: EpisodeServer, currentTime?: number) => void;
  onSaveProgress: (currentTime: number, duration: number) => void;
  initialTime?: number;
}

// Helper to get alternative mirror domains if a CDN stream is offline (404/CORS)
function getStreamCandidates(originalUrl?: string): string[] {
  if (!originalUrl || typeof originalUrl !== 'string') return [];
  const list: string[] = [originalUrl];

  const mirrorHosts = [
    'vip.opstream15.com',
    'vip.opstream16.com',
    'vip.opstream17.com',
    's1.phim1280.tv',
    'vip.opstream1.com',
    'vip.opstream2.com',
  ];

  try {
    const urlObj = new URL(originalUrl);
    const host = urlObj.host;
    if (host.includes('opstream') || host.includes('phim1280')) {
      for (const m of mirrorHosts) {
        if (m !== host) {
          const clone = new URL(originalUrl);
          clone.host = m;
          list.push(clone.toString());
        }
      }
    }
  } catch {
    // If not a valid standard URL, fallback to single entry
  }

  return list;
}

export const NetflixPlayer: React.FC<NetflixPlayerProps> = ({
  movie,
  currentEpisode,
  currentServer,
  allServers,
  onBack,
  onSelectEpisode,
  onSaveProgress,
  initialTime = 0,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Player States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('qtb_player_volume');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 0 && val <= 1) return val;
      }
    } catch {}
    return 1.0;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityLevels, setQualityLevels] = useState<{ height: number; level: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = Auto
  const [isEpisodeDrawerOpen, setIsEpisodeDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isBrightnessOpen, setIsBrightnessOpen] = useState(false);
  const [isAspectRatioOpen, setIsAspectRatioOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>(() => {
    try {
      const saved = localStorage.getItem('qtb_player_aspect_ratio');
      if (saved && ['contain', 'cover', 'fill', '16-9', '21-9'].includes(saved)) {
        return saved as AspectRatioMode;
      }
    } catch {}
    return 'contain';
  });
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);
  const [loadingCountdown, setLoadingCountdown] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);

  // Helper to close all popup menus
  const closeAllMenus = useCallback(() => {
    setIsSettingsOpen(false);
    setIsServerMenuOpen(false);
    setIsBrightnessOpen(false);
    setIsAspectRatioOpen(false);
    setIsEnhanceMenuOpen(false);
    setIsVolumeOpen(false);
  }, []);

  // Brightness Control (20% to 200%, default 100%)
  const [brightness, setBrightness] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('qtb_player_brightness');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 0.2 && val <= 2.0) return val;
      }
    } catch {
      // ignore
    }
    return 1.0;
  });

  // On-screen HUD Indicator (Netflix/VLC Style for Volume & Brightness)
  const [hudState, setHudState] = useState<{
    type: 'brightness' | 'volume' | 'seek';
    value: number;
    text: string;
  } | null>(null);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Touch gesture & double-tap state
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    mode: 'brightness' | 'volume' | 'none';
    startVal: number;
  } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const [doubleTapRipple, setDoubleTapRipple] = useState<{
    side: 'left' | 'right';
    id: number;
  } | null>(null);

  // Visual Enhancement & Sharpness Modes (Default is strictly 'off')
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>(() => {
    try {
      const saved = localStorage.getItem('qtb_player_enhance_mode');
      if (saved && ['off', 'sharp', 'ultra_sharp', 'hdr', 'cinema'].includes(saved)) {
        return saved as EnhanceMode;
      }
    } catch {
      // ignore
    }
    return 'off';
  });
  const [isEnhanceMenuOpen, setIsEnhanceMenuOpen] = useState(false);
  const [showGpuModal, setShowGpuModal] = useState(false);

  const triggerHud = useCallback((type: 'brightness' | 'volume' | 'seek', value: number, text: string) => {
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    setHudState({ type, value, text });
    hudTimeoutRef.current = setTimeout(() => {
      setHudState(null);
    }, 1300);
  }, []);

  const handleEnhanceModeChange = (mode: EnhanceMode) => {
    setEnhanceMode(mode);
    try {
      localStorage.setItem('qtb_player_enhance_mode', mode);
    } catch {
      // ignore
    }
  };

  const changeBrightness = (val: number, showHudToast = true) => {
    const clamped = Math.max(0.2, Math.min(2.0, parseFloat(val.toFixed(2))));
    setBrightness(clamped);
    try {
      localStorage.setItem('qtb_player_brightness', clamped.toString());
    } catch {
      // ignore
    }
    if (showHudToast) {
      triggerHud('brightness', (clamped / 2.0) * 100, `Độ sáng: ${Math.round(clamped * 100)}%`);
    }
    resetControlsTimer();
  };

  const handleAspectRatioChange = (mode: AspectRatioMode) => {
    setAspectRatio(mode);
    try {
      localStorage.setItem('qtb_player_aspect_ratio', mode);
    } catch {}
    const labels: Record<AspectRatioMode, string> = {
      contain: 'Tỉ lệ gốc (Fit)',
      cover: 'Tràn viền (Cắt đen)',
      fill: 'Giãn toàn màn hình',
      '16-9': 'Chuẩn 16:9',
      '21-9': 'Điện ảnh 21:9',
    };
    triggerHud('seek', 100, `Tỉ lệ: ${labels[mode]}`);
    setIsAspectRatioOpen(false);
    resetControlsTimer();
  };

  const getVideoRatioClass = (): string => {
    switch (aspectRatio) {
      case 'cover':
        return 'w-full h-full object-cover';
      case 'fill':
        return 'w-full h-full object-fill';
      case '16-9':
        return 'w-full h-full max-w-full max-h-full aspect-video object-contain';
      case '21-9':
        return 'w-full h-full max-w-full max-h-full aspect-[21/9] object-cover';
      case 'contain':
      default:
        return 'w-full h-full object-contain';
    }
  };

  const getEnhanceStyle = (): React.CSSProperties => {
    const brightnessFilter = `brightness(${Math.round(brightness * 100)}%)`;
    switch (enhanceMode) {
      case 'sharp':
        return {
          filter: `url(#qtb-sharpen) contrast(105%) saturate(104%) ${brightnessFilter}`,
          transition: 'filter 0.1s ease',
        };
      case 'ultra_sharp':
        return {
          filter: `url(#qtb-ultra-sharpen) contrast(108%) saturate(106%) ${brightnessFilter}`,
          transition: 'filter 0.1s ease',
        };
      case 'hdr':
        return {
          filter: `contrast(112%) saturate(120%) ${brightnessFilter}`,
          transition: 'filter 0.1s ease',
        };
      case 'cinema':
        return {
          filter: `url(#qtb-sharpen) contrast(107%) saturate(110%) ${brightnessFilter}`,
          transition: 'filter 0.1s ease',
        };
      case 'off':
      default:
        return {
          filter: brightness !== 1.0 ? brightnessFilter : 'none',
          transition: 'filter 0.1s ease',
        };
    }
  };

  // Determine next episode
  const currentEpIndex = currentServer.server_data.findIndex(
    (ep) => ep.slug === currentEpisode.slug
  );
  const nextEpisode =
    currentEpIndex !== -1 && currentEpIndex < currentServer.server_data.length - 1
      ? currentServer.server_data[currentEpIndex + 1]
      : null;

  // Smart Server Switcher - matches episode by episode number/name or index
  const handleSwitchServer = (targetServer: EpisodeServer) => {
    if (!targetServer || !targetServer.server_data || targetServer.server_data.length === 0) return;

    // 1. Try finding by matching episode name or clean episode number
    const cleanCurrent = currentEpisode.name.replace(/\D/g, '');
    let matchedEp = targetServer.server_data.find((ep) => {
      if (ep.slug === currentEpisode.slug) return true;
      if (ep.name === currentEpisode.name) return true;
      const cleanEp = ep.name.replace(/\D/g, '');
      return cleanCurrent && cleanEp && cleanEp === cleanCurrent;
    });

    // 2. Try by episode index if valid
    if (!matchedEp && currentEpIndex >= 0 && currentEpIndex < targetServer.server_data.length) {
      matchedEp = targetServer.server_data[currentEpIndex];
    }

    // 3. Fall back to first episode of target server
    if (!matchedEp) {
      matchedEp = targetServer.server_data[0];
    }

    if (matchedEp) {
      const currentTime = Math.max(0, (videoRef.current?.currentTime || 0) - 1);
      onSelectEpisode(matchedEp, targetServer, currentTime);
      triggerHud('seek', 100, `Nguồn: ${targetServer.server_name}`);
    }
  };

  // Format time (mm:ss or hh:mm:ss)
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Video stream source URL
  const m3u8Url = currentEpisode.link_m3u8;

  // Setup HLS Stream with Smart Mirror Failover & Server Auto-switch
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !m3u8Url || useIframeFallback) return;

    setIsLoadingVideo(true);
    setLoadingCountdown(0);
    setErrorMsg(null);
    setNextEpisodeCountdown(null);

    // Destroy existing HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // 5-second Watchdog Timer for Slow Loading / Stuck Buffer
    const loadTimer = setInterval(() => {
      setLoadingCountdown((prev) => prev + 1);
    }, 1000);

    const candidates = getStreamCandidates(m3u8Url);
    let candidateIndex = 0;
    let networkRetryCount = 0;

    const tryNextFallback = (hlsInstance?: Hls) => {
      // 1. Try next mirror domain if available
      candidateIndex += 1;
      if (candidateIndex < candidates.length && hlsInstance) {
        console.warn(`Switching to mirror stream URL candidate ${candidateIndex}: ${candidates[candidateIndex]}`);
        networkRetryCount = 0;
        hlsInstance.loadSource(candidates[candidateIndex]);
        hlsInstance.startLoad();
        return;
      }

      // 2. Try next available server if multiple exist
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsRef.current = null;
      }
      const otherServer = allServers.find((s) => s.server_name !== currentServer.server_name);
      if (otherServer) {
        const sameEp = otherServer.server_data[currentEpIndex] || otherServer.server_data[0];
        if (sameEp) {
          console.warn(`Auto-switching to alternative server: ${otherServer.server_name}`);
          const currentTime = Math.max(0, (videoRef.current?.currentTime || 0) - 1);
          onSelectEpisode(sameEp, otherServer, currentTime);
          return;
        }
      }

      // 3. Fallback to iframe embed if present
      if (currentEpisode.link_embed) {
        console.warn('Falling back to embed iframe player');
        setUseIframeFallback(true);
        setIsLoadingVideo(false);
        return;
      }

      // 4. Show friendly interactive error overlay
      setErrorMsg('Không thể kết nối đến luồng phát HLS này (404/Network Error). Vui lòng chọn máy chủ hoặc nguồn phát khác.');
      setIsLoadingVideo(false);
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: 6000000,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        manifestLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: 8000,
        levelLoadingMaxRetry: 1,
      });
      hlsRef.current = hls;

      hls.loadSource(candidates[0]);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        setIsLoadingVideo(false);
        setLoadingCountdown(0);
        setErrorMsg(null);
        const levels = data.levels.map((lvl, index) => ({
          height: lvl.height,
          level: index,
        }));
        setQualityLevels(levels);

        // Sync audio settings
        video.volume = isMuted ? 0 : volume;
        video.muted = isMuted;

        // Resume position if available
        if (initialTime > 5) {
          video.currentTime = initialTime;
        }

        video
          .play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch((e) => {
            console.warn('Autoplay with sound prevented by browser, retrying muted...', e);
            video.muted = true;
            setIsMuted(true);
            video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR: {
              const statusCode = (data.response as any)?.code;
              const is404 = statusCode === 404;
              const isManifestError = data.details === 'manifestLoadError' || data.details === 'manifestParsingError';

              if (is404 || isManifestError || networkRetryCount >= 1) {
                console.warn('Fatal network error on current manifest, triggering failover:', data);
                tryNextFallback(hls);
              } else {
                networkRetryCount += 1;
                console.warn('Transient network error, retrying startLoad...', networkRetryCount);
                hls.startLoad();
              }
              break;
            }
            case Hls.ErrorTypes.MEDIA_ERROR: {
              console.warn('HLS media error, recovering...', data);
              hls.recoverMediaError();
              break;
            }
            default: {
              console.warn('Fatal HLS error, triggering failover:', data);
              tryNextFallback(hls);
              break;
            }
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari HLS
      video.src = m3u8Url;
      video.volume = isMuted ? 0 : volume;
      video.muted = isMuted;
      video.addEventListener('loadedmetadata', () => {
        setIsLoadingVideo(false);
        setLoadingCountdown(0);
        setErrorMsg(null);
        if (initialTime > 5) {
          video.currentTime = initialTime;
        }
        video.play().then(() => setIsPlaying(true)).catch((e) => {
          console.warn('Native autoplay blocked, trying muted', e);
          video.muted = true;
          setIsMuted(true);
          video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });
      });

      video.onerror = () => {
        console.warn('Native video element error, falling back to embed');
        if (currentEpisode.link_embed) {
          setUseIframeFallback(true);
        } else {
          setErrorMsg('Không thể phát video trên thiết bị');
        }
      };
    } else if (currentEpisode.link_embed) {
      setUseIframeFallback(true);
    }

    return () => {
      clearInterval(loadTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [m3u8Url, useIframeFallback]);

  // Periodic watch progress save
  useEffect(() => {
    progressSaveIntervalRef.current = setInterval(() => {
      if (videoRef.current && duration > 0) {
        const time = videoRef.current.currentTime;
        onSaveProgress(time, duration);
      }
    }, 4000);

    return () => {
      if (progressSaveIntervalRef.current) clearInterval(progressSaveIntervalRef.current);
    };
  }, [duration, onSaveProgress]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (
        isPlaying &&
        !isEpisodeDrawerOpen &&
        !isSettingsOpen &&
        !isServerMenuOpen &&
        !isBrightnessOpen &&
        !isVolumeOpen &&
        !isEnhanceMenuOpen &&
        !isAspectRatioOpen
      ) {
        setShowControls(false);
      }
    }, 3500);
  }, [
    isPlaying,
    isEpisodeDrawerOpen,
    isSettingsOpen,
    isServerMenuOpen,
    isBrightnessOpen,
    isVolumeOpen,
    isEnhanceMenuOpen,
    isAspectRatioOpen,
  ]);

  // Fullscreen state sync listener (standard + webkit + moz + ms)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Global Outside-Click & Outside-Touch Listener to automatically close open popups/menus
  useEffect(() => {
    const handleOutsideInteraction = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      // Check if click/tap is inside any menu button or dropdown container
      const isInsideMenu = !!(
        target.closest('#player-settings-menu') ||
        target.closest('#player-settings-btn') ||
        target.closest('#player-server-btn') ||
        target.closest('#player-server-menu') ||
        target.closest('#player-brightness-popup') ||
        target.closest('#player-brightness-btn') ||
        target.closest('#player-volume-popup') ||
        target.closest('#player-volume-toggle') ||
        target.closest('#player-aspect-ratio-menu') ||
        target.closest('#player-aspect-ratio-btn') ||
        target.closest('#player-enhance-menu') ||
        target.closest('#player-enhance-btn') ||
        target.closest('#gpu-upscale-modal')
      );

      if (!isInsideMenu) {
        closeAllMenus();
      }
    };

    window.addEventListener('mousedown', handleOutsideInteraction, true);
    window.addEventListener('touchstart', handleOutsideInteraction, true);
    return () => {
      window.removeEventListener('mousedown', handleOutsideInteraction, true);
      window.removeEventListener('touchstart', handleOutsideInteraction, true);
    };
  }, [closeAllMenus]);

  // Keyboard Shortcuts (Space, F, M, Arrows, Brightness, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      // Ignore when user typing in text inputs
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
        return;
      }

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
          if (e.shiftKey) {
            changeBrightness(Math.min(2.0, brightness + 0.1));
          } else {
            changeVolume(Math.min(1, volume + 0.05));
          }
          break;
        case 'arrowdown':
          e.preventDefault();
          if (e.shiftKey) {
            changeBrightness(Math.max(0.2, brightness - 0.1));
          } else {
            changeVolume(Math.max(0, volume - 0.05));
          }
          break;
        case '[':
          e.preventDefault();
          changeBrightness(Math.max(0.2, brightness - 0.1));
          break;
        case ']':
          e.preventDefault();
          changeBrightness(Math.min(2.0, brightness + 0.1));
          break;
        case 'escape':
          if (isEpisodeDrawerOpen) setIsEpisodeDrawerOpen(false);
          else closeAllMenus();
          break;
      }
      resetControlsTimer();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [volume, brightness, isPlaying, isEpisodeDrawerOpen, closeAllMenus, resetControlsTimer]);

  // Controls actions
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
      triggerHud('seek', 100, 'Đang phát');
    } else {
      video.pause();
      setIsPlaying(false);
      triggerHud('seek', 0, 'Đã tạm dừng');
    }
    resetControlsTimer();
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
    video.currentTime = nextTime;
    triggerHud('seek', (nextTime / (duration || 1)) * 100, seconds > 0 ? `+${seconds}s` : `${seconds}s`);
    resetControlsTimer();
  };

  const changeVolume = (val: number, showHudToast = true) => {
    const video = videoRef.current;
    const clamped = Math.max(0, Math.min(1, parseFloat(val.toFixed(2))));
    if (video) {
      video.volume = clamped;
      video.muted = clamped === 0;
    }
    setVolume(clamped);
    setIsMuted(clamped === 0);
    try {
      localStorage.setItem('qtb_player_volume', clamped.toString());
    } catch {}
    if (showHudToast) {
      triggerHud('volume', clamped * 100, clamped === 0 ? 'Âm lượng: Tắt tiếng' : `Âm lượng: ${Math.round(clamped * 100)}%`);
    }
    resetControlsTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (isMuted || volume === 0) {
      const restoreVol = volume > 0 ? volume : 0.8;
      if (video) {
        video.volume = restoreVol;
        video.muted = false;
      }
      setVolume(restoreVol);
      setIsMuted(false);
      try {
        localStorage.setItem('qtb_player_volume', restoreVol.toString());
      } catch {}
      triggerHud('volume', restoreVol * 100, `Âm lượng: ${Math.round(restoreVol * 100)}%`);
    } else {
      if (video) {
        video.volume = 0;
        video.muted = true;
      }
      setIsMuted(true);
      triggerHud('volume', 0, 'Âm lượng: Đã tắt');
    }
    resetControlsTimer();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = target;
    setCurrentTime(target);
    resetControlsTimer();
  };

  const toggleFullscreen = () => {
    const container = playerContainerRef.current;
    const video = videoRef.current;
    if (!container) return;

    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (!isCurrentlyFullscreen) {
      const req =
        container.requestFullscreen ||
        (container as any).webkitRequestFullscreen ||
        (container as any).mozRequestFullScreen ||
        (container as any).msRequestFullscreen;

      if (req) {
        req.call(container).then(() => {
          // Auto landscape on mobile/tablet if supported
          try {
            if (screen.orientation && (screen.orientation as any).lock) {
              (screen.orientation as any).lock('landscape').catch(() => {});
            }
          } catch {}
        }).catch(() => {
          if (video && (video as any).webkitEnterFullscreen) {
            (video as any).webkitEnterFullscreen();
          }
        });
      } else if (video && (video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
      }
      setIsFullscreen(true);
    } else {
      const exit =
        document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;

      if (exit) {
        exit.call(document).then(() => {
          try {
            if (screen.orientation && (screen.orientation as any).unlock) {
              (screen.orientation as any).unlock();
            }
          } catch {}
        }).catch(console.error);
      }
      setIsFullscreen(false);
    }
    resetControlsTimer();
  };

  // Touch Gesture Handling for Mobile / iPad (Swipe Left = Brightness, Swipe Right = Volume, Tap = Toggle Controls, Double Tap = Skip/Play)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const container = playerContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const isLeftHalf = touch.clientX < rect.left + rect.width / 2;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      mode: isLeftHalf ? 'brightness' : 'volume',
      startVal: isLeftHalf ? brightness : volume,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touchStartRef.current.y - touch.clientY;
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);

    // If mainly vertical movement (>15px)
    if (Math.abs(deltaY) > 15 && deltaX < 60) {
      const container = playerContainerRef.current;
      const height = container ? container.clientHeight : 400;
      const ratio = deltaY / (height * 0.7);

      if (touchStartRef.current.mode === 'brightness') {
        const nextB = Math.max(0.2, Math.min(2.0, touchStartRef.current.startVal + ratio * 1.5));
        changeBrightness(nextB, true);
      } else if (touchStartRef.current.mode === 'volume') {
        const nextV = Math.max(0, Math.min(1.0, touchStartRef.current.startVal + ratio * 1.0));
        changeVolume(nextV, true);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touchDuration = Date.now() - touchStartRef.current.time;
    const touchX = touchStartRef.current.x;
    const container = playerContainerRef.current;

    // Check for tap / double tap (<280ms duration)
    if (touchDuration < 280 && container) {
      const rect = container.getBoundingClientRect();
      const now = Date.now();
      if (lastTapRef.current && now - lastTapRef.current.time < 320 && Math.abs(touchX - lastTapRef.current.x) < 70) {
        // Double tap confirmed!
        const isLeft = touchX < rect.left + rect.width * 0.35;
        const isRight = touchX > rect.left + rect.width * 0.65;

        if (isLeft) {
          skip(-10);
          setDoubleTapRipple({ side: 'left', id: now });
          setTimeout(() => setDoubleTapRipple(null), 700);
        } else if (isRight) {
          skip(10);
          setDoubleTapRipple({ side: 'right', id: now });
          setTimeout(() => setDoubleTapRipple(null), 700);
        } else {
          togglePlay();
        }
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { time: now, x: touchX };
        // Single tap: toggle controls (Show if hidden, Hide if shown) - Never pause on single tap!
        setShowControls((prev) => {
          const next = !prev;
          if (next) resetControlsTimer();
          return next;
        });
      }
    }
    touchStartRef.current = null;
  };

  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackRate(speed);
    setIsSettingsOpen(false);
    resetControlsTimer();
  };

  const handleQualityChange = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
    }
    setIsSettingsOpen(false);
    resetControlsTimer();
  };

  const handleNextEpisodeClick = () => {
    if (nextEpisode) {
      onSelectEpisode(nextEpisode, currentServer);
      setNextEpisodeCountdown(null);
    }
  };

  // Video Event Handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    // Buffer calculation
    if (video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      setBuffered(bufferedEnd);
    }

    // Auto next countdown when 15 seconds remaining
    if (nextEpisode && video.duration > 30 && video.duration - video.currentTime <= 15) {
      const remainingSecs = Math.ceil(video.duration - video.currentTime);
      setNextEpisodeCountdown(remainingSecs);
    } else {
      setNextEpisodeCountdown(null);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (nextEpisode) {
      handleNextEpisodeClick();
    }
  };

  return (
    <div
      ref={playerContainerRef}
      id="qtb-custom-player-container"
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden touch-none m-0 p-0 border-0 outline-none"
      onMouseMove={resetControlsTimer}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement)?.tagName?.toLowerCase() === 'video') {
          setShowControls((prev) => {
            const next = !prev;
            if (next) resetControlsTimer();
            return next;
          });
        }
      }}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement)?.tagName?.toLowerCase() === 'video') {
          toggleFullscreen();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Fallback Embed iFrame if m3u8 fails */}
      {useIframeFallback ? (
        <div className="relative w-full h-full bg-black flex flex-col">
          <iframe
            src={currentEpisode.link_embed}
            className="w-full h-full border-none flex-1"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            title={movie.name}
          />
          {/* Top toolbar overlay on iframe fallback */}
          <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="bg-slate-900/90 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl flex items-center gap-2 border border-slate-700 backdrop-blur-md shadow-2xl cursor-pointer text-xs font-semibold"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại</span>
              </button>

              <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 backdrop-blur-md">
                <span className="text-xs font-bold text-white max-w-[200px] truncate">{movie.name}</span>
                <span className="text-[10px] text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800">
                  {currentEpisode.name.startsWith('Tập') ? currentEpisode.name : `Tập ${currentEpisode.name}`}
                </span>
                <span className="text-[10px] text-amber-400 font-medium px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800">
                  Nguồn Embed
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {allServers.length > 1 && (
                <button
                  onClick={() => {
                    const otherServer = allServers.find((s) => s.server_name !== currentServer.server_name);
                    if (otherServer) {
                      const sameEp = otherServer.server_data[currentEpIndex] || otherServer.server_data[0];
                      if (sameEp) {
                        setUseIframeFallback(false);
                        setErrorMsg(null);
                        const currentTime = Math.max(0, (videoRef.current?.currentTime || 0) - 1);
                        onSelectEpisode(sameEp, otherServer, currentTime);
                      }
                    }
                  }}
                  className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold border border-slate-700 backdrop-blur-md cursor-pointer flex items-center gap-1.5"
                >
                  <Server className="w-3.5 h-3.5 text-sky-400" />
                  <span>Đổi Server</span>
                </button>
              )}

              <button
                onClick={() => setIsEpisodeDrawerOpen(true)}
                className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold border border-slate-700 backdrop-blur-md cursor-pointer flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Chọn Tập</span>
              </button>

              <button
                onClick={() => {
                  setUseIframeFallback(false);
                  setErrorMsg(null);
                }}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold border border-blue-500/30 backdrop-blur-md cursor-pointer flex items-center gap-1.5 shadow-lg shadow-blue-600/30"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Thử lại HLS</span>
              </button>
            </div>
          </div>

          {/* Slide-in Episode Drawer in Embed Mode */}
          {isEpisodeDrawerOpen && (
            <div
              id="player-episodes-drawer-fallback"
              className="absolute right-0 top-0 bottom-0 w-80 sm:w-96 bg-[#0b1329]/95 border-l border-blue-900/60 p-5 shadow-2xl z-50 flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-300 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-bold text-white">Danh Sách Tập Phim</h3>
                </div>
                <button
                  onClick={() => setIsEpisodeDrawerOpen(false)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  Đóng ✕
                </button>
              </div>

              <div className="text-xs text-slate-400 py-2">
                Nguồn: <span className="text-white font-semibold">{currentServer.server_name}</span> (
                {currentServer.server_data.length} tập)
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 mt-2 overscroll-contain">
                {currentServer.server_data.map((ep, idx) => {
                  const isActive = ep.slug === currentEpisode.slug;
                  return (
                    <button
                      key={ep.slug || idx}
                      onClick={() => {
                        onSelectEpisode(ep, currentServer);
                        setIsEpisodeDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-lg shadow-blue-600/30'
                          : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Play className={`w-3.5 h-3.5 ${isActive ? 'fill-white' : 'text-slate-400'}`} />
                        <span className="truncate">
                          {ep.name.startsWith('Tập') ? ep.name : `Tập ${ep.name}`}
                        </span>
                      </div>
                      {isActive && <span className="text-[10px] uppercase font-bold tracking-widest text-sky-200">Đang phát</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* SVG Kernels for Real-time Video Sharpening & Edge Enhancement */}
          <svg className="absolute w-0 h-0 pointer-events-none opacity-0" aria-hidden="true">
            <defs>
              <filter id="qtb-sharpen" x="0%" y="0%" width="100%" height="100%">
                <feConvolveMatrix
                  order="3,3"
                  preserveAlpha="true"
                  kernelMatrix="0 -0.5 0 -0.5 3 -0.5 0 -0.5 0"
                />
              </filter>
              <filter id="qtb-ultra-sharpen" x="0%" y="0%" width="100%" height="100%">
                <feConvolveMatrix
                  order="3,3"
                  preserveAlpha="true"
                  kernelMatrix="-0.25 -0.5 -0.25 -0.5 4 -0.5 -0.25 -0.5 -0.25"
                />
              </filter>
            </defs>
          </svg>

          {/* Native / HLS HTML5 Video with Dynamic Aspect Ratio & Visual Enhancement */}
          <video
            ref={videoRef}
            id="qtb-video-element"
            className={`${getVideoRatioClass()} cursor-pointer select-none`}
            style={getEnhanceStyle()}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={handleEnded}
            onWaiting={() => setIsLoadingVideo(true)}
            onPlaying={() => setIsLoadingVideo(false)}
            playsInline
          />

          {/* Center Play Button Overlay when paused */}
          {!isPlaying && !isLoadingVideo && showControls && (
            <button
              id="player-center-play-btn"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="absolute z-35 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/65 hover:bg-sky-600/90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 shadow-2xl transition-all hover:scale-110 active:scale-95 cursor-pointer pointer-events-auto group"
              aria-label="Phát"
            >
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current translate-x-0.5 text-white group-hover:text-white" />
            </button>
          )}

          {/* Universal Brightness Filter Overlay (Guaranteed to work across iOS, Android, and PC) */}
          {brightness < 1.0 && (
            <div
              className="absolute inset-0 bg-black pointer-events-none z-10 transition-opacity duration-75"
              style={{ opacity: Math.max(0, parseFloat((1 - brightness).toFixed(2))) }}
            />
          )}
          {brightness > 1.0 && (
            <div
              className="absolute inset-0 bg-white pointer-events-none mix-blend-screen z-10 transition-opacity duration-75"
              style={{ opacity: Math.min(0.7, parseFloat(((brightness - 1) * 0.4).toFixed(2))) }}
            />
          )}

          {/* On-Screen Netflix/VLC HUD Overlay (Brightness & Volume Indicator) */}
          {hudState && (
            <div
              id="player-hud-overlay"
              className="absolute top-14 sm:top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0b1329]/95 border border-blue-800/80 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-150 pointer-events-none min-w-[210px]"
            >
              {hudState.type === 'brightness' && (
                brightness > 1.2 ? (
                  <Sun className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                ) : brightness < 0.6 ? (
                  <SunDim className="w-5 h-5 text-slate-400 shrink-0" />
                ) : (
                  <SunMedium className="w-5 h-5 text-yellow-400 shrink-0" />
                )
              )}
              {hudState.type === 'volume' && (
                volume === 0 || isMuted ? (
                  <VolumeX className="w-5 h-5 text-sky-400 shrink-0" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-5 h-5 text-sky-400 shrink-0" />
                ) : (
                  <Volume2 className="w-5 h-5 text-sky-400 shrink-0" />
                )
              )}
              {hudState.type === 'seek' && <RotateCw className="w-5 h-5 text-cyan-400 shrink-0" />}

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-white tracking-wide">
                  <span>{hudState.text}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-100 rounded-full ${
                      hudState.type === 'brightness'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-300'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, hudState.value))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Double Tap Skip Animation Ripple */}
          {doubleTapRipple && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 z-40 pointer-events-none flex flex-col items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-blue-600/30 backdrop-blur-md border border-cyan-400/40 animate-ping duration-700 ${
                doubleTapRipple.side === 'left' ? 'left-8 sm:left-24' : 'right-8 sm:right-24'
              }`}
            >
              {doubleTapRipple.side === 'left' ? (
                <>
                  <RotateCcw className="w-8 h-8 text-cyan-300" />
                  <span className="text-xs font-black text-white">-10s</span>
                </>
              ) : (
                <>
                  <RotateCw className="w-8 h-8 text-cyan-300" />
                  <span className="text-xs font-black text-white">+10s</span>
                </>
              )}
            </div>
          )}

          {/* Loading Spinner & 5s Server Failover Watchdog */}
          {isLoadingVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20 pointer-events-none p-4 text-center">
              <div className="w-14 h-14 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin mb-3 shadow-[0_0_20px_rgba(6,182,212,0.6)] pointer-events-none" />
              <span className="text-sky-200 text-sm font-medium tracking-wide pointer-events-none">
                Đang kết nối luồng phát ({currentServer.server_name})...
              </span>

              {loadingCountdown >= 4 && allServers.length > 1 && (
                <div className="mt-4 flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-200 max-w-sm pointer-events-auto">
                  <div className="text-xs text-amber-300 font-semibold bg-amber-950/70 border border-amber-800/80 px-3 py-1.5 rounded-xl shadow-lg">
                    ⚠️ Máy chủ phản hồi chậm ({loadingCountdown}s)
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                    {allServers
                      .filter((s) => s.server_name !== currentServer.server_name)
                      .map((otherSrv, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSwitchServer(otherSrv)}
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg shadow-blue-600/40 cursor-pointer transition-transform hover:scale-105 flex items-center gap-1.5"
                        >
                          <Server className="w-3.5 h-3.5" />
                          <span>Đổi sang {otherSrv.server_name}</span>
                        </button>
                      ))}
                    {currentEpisode.link_embed && (
                      <button
                        onClick={() => setUseIframeFallback(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-xl cursor-pointer border border-slate-700"
                      >
                        Dùng Embed
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error / Fallback Box */}
          {errorMsg && (
            <div className="absolute inset-0 bg-[#070b16]/90 flex flex-col items-center justify-center p-6 text-center z-30">
              <AlertCircle className="w-12 h-12 text-sky-400 mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">Gặp sự cố với luồng phát m3u8</h3>
              <p className="text-sm text-slate-400 max-w-md mb-4">{errorMsg}</p>
              {currentEpisode.link_embed && (
                <button
                  onClick={() => setUseIframeFallback(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-blue-600/30 cursor-pointer transition-transform hover:scale-105"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Chuyển sang nguồn Embed dự phòng</span>
                </button>
              )}
            </div>
          )}

          {/* Auto Next Episode Countdown Overlay */}
          {nextEpisodeCountdown !== null && nextEpisodeCountdown > 0 && nextEpisode && (
            <div
              id="next-episode-banner"
              className="absolute right-8 bottom-28 z-40 bg-[#0f172a]/95 border border-blue-900/60 p-4 rounded-2xl shadow-2xl backdrop-blur-md max-w-xs animate-in slide-in-from-right duration-300"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="font-semibold">TẬP TIẾP THEO</span>
                <span className="text-cyan-400 font-bold">{nextEpisodeCountdown}s</span>
              </div>
              <h4 className="text-sm font-bold text-white line-clamp-1 mb-3">
                {nextEpisode.name.startsWith('Tập') ? nextEpisode.name : `Tập ${nextEpisode.name}`}
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNextEpisodeClick}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-blue-600/30"
                >
                  <Play className="w-3.5 h-3.5 fill-white" /> Phát Ngay
                </button>
                <button
                  onClick={() => setNextEpisodeCountdown(null)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          {/* Player Overlays and Controls */}
          <div
            className={`absolute inset-0 flex flex-col justify-between p-3 sm:p-6 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] transition-opacity duration-300 pointer-events-none z-30 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Top Bar: Back, Title, Server & Episode Pickers */}
            <div className="flex items-center justify-between pointer-events-auto gap-2">
              <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
                <button
                  id="player-back-btn"
                  onClick={onBack}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0b1329]/80 hover:bg-slate-800 text-white flex items-center justify-center border border-slate-700 transition-transform hover:scale-110 active:scale-95 cursor-pointer shadow-lg shrink-0"
                  aria-label="Quay lại"
                >
                  <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base md:text-lg font-bold text-white drop-shadow-md truncate">
                    {movie.name}
                  </h2>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-300 truncate">
                    <span className="text-sky-400 font-semibold shrink-0">
                      {currentEpisode.name.startsWith('Tập')
                        ? currentEpisode.name
                        : `Tập ${currentEpisode.name}`}
                    </span>
                    <span>•</span>
                    <span className="text-slate-400 truncate">{currentServer.server_name}</span>
                  </div>
                </div>
              </div>

              {/* Right Top Buttons: Server & Drawer */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {/* Server Switcher Dropdown */}
                {allServers.length > 1 && (
                  <div className="relative">
                    <button
                      id="player-server-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = !isServerMenuOpen;
                        closeAllMenus();
                        setIsServerMenuOpen(next);
                      }}
                      className="flex items-center gap-1.5 bg-[#0b1329]/80 hover:bg-slate-800 text-[11px] sm:text-xs text-slate-200 px-2.5 sm:px-3.5 py-1.5 rounded-xl border border-slate-700 backdrop-blur-md cursor-pointer shadow-lg"
                    >
                      <Server className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="hidden sm:inline">{currentServer.server_name}</span>
                      <span className="sm:hidden">Server</span>
                    </button>

                    {isServerMenuOpen && (
                      <div id="player-server-menu" className="absolute right-0 top-9 w-48 bg-[#0f172a] border border-blue-900/60 rounded-xl shadow-2xl p-2 z-50 pointer-events-auto">
                        <div className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase">
                          Chọn Nguồn Server
                        </div>
                        {allServers.map((srv, sIdx) => (
                          <button
                            key={sIdx}
                            onClick={() => {
                              handleSwitchServer(srv);
                              setIsServerMenuOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between gap-1 pointer-events-auto ${
                              srv.server_name === currentServer.server_name
                                ? 'bg-blue-600 text-white font-bold'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <span className="truncate">
                              {srv.sourceLabel ? `${srv.sourceLabel} - ${srv.server_name}` : srv.server_name}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {srv.server_data.length} tập
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Episodes Drawer Toggle Button */}
                <button
                  id="player-episodes-drawer-btn"
                  onClick={() => {
                    const next = !isEpisodeDrawerOpen;
                    closeAllMenus();
                    setIsEpisodeDrawerOpen(next);
                  }}
                  className="flex items-center gap-1.5 bg-[#0b1329]/80 hover:bg-slate-800 text-[11px] sm:text-xs text-white px-2.5 sm:px-3.5 py-1.5 rounded-xl border border-slate-700 backdrop-blur-md cursor-pointer shadow-lg"
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="hidden sm:inline">Danh Sách Tập</span>
                  <span className="sm:hidden">Tập</span>
                </button>
              </div>
            </div>

            {/* Bottom Controls Bar */}
            <div className="space-y-1.5 sm:space-y-2 pointer-events-auto bg-gradient-to-t from-[#070b16]/95 via-[#070b16]/80 to-transparent pt-6 sm:pt-8 pb-2 px-1 sm:px-2 rounded-xl">
              {/* Seek Timeline Progress Bar */}
              <div className="relative group/timeline flex items-center cursor-pointer">
                {/* Buffered & Progress tracks */}
                <div className="relative w-full h-1.5 group-hover/timeline:h-2.5 bg-slate-800 rounded-full overflow-hidden transition-all">
                  {/* Buffer Bar */}
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-slate-600/70"
                    style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
                  />
                  {/* Played Progress Bar */}
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-blue-600 to-cyan-400"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>

                {/* Range Slider Overlay */}
                <input
                  id="player-seek-slider"
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between gap-1 sm:gap-4 pt-0.5">
                {/* Left Controls: Play, Skip, Volume, Time */}
                <div className="flex items-center gap-1.5 sm:gap-3.5 shrink-0">
                  {/* Play / Pause */}
                  <button
                    id="player-play-toggle-btn"
                    onClick={togglePlay}
                    className="text-white hover:text-sky-400 transition-transform hover:scale-110 active:scale-95 cursor-pointer p-1"
                    aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                  >
                    {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />}
                  </button>

                  {/* Skip -10s */}
                  <button
                    id="player-rewind-btn"
                    onClick={() => skip(-10)}
                    className="text-slate-300 hover:text-white transition-transform hover:scale-110 active:scale-95 cursor-pointer p-1"
                    title="Lùi 10 giây (Phím Left)"
                  >
                    <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  {/* Skip +10s */}
                  <button
                    id="player-forward-btn"
                    onClick={() => skip(10)}
                    className="text-slate-300 hover:text-white transition-transform hover:scale-110 active:scale-95 cursor-pointer p-1"
                    title="Tua 10 giây (Phím Right)"
                  >
                    <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  {/* Next Episode Button */}
                  {nextEpisode && (
                    <button
                      id="player-next-ep-btn"
                      onClick={handleNextEpisodeClick}
                      className="hidden xs:inline-block text-slate-300 hover:text-white transition-transform hover:scale-110 active:scale-95 cursor-pointer p-1"
                      title="Tập kế tiếp"
                    >
                      <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  )}

                  {/* Volume Control */}
                  <div className="relative flex items-center gap-1.5 group/volume">
                    <button
                      id="player-volume-toggle"
                      onClick={() => {
                        setIsVolumeOpen(!isVolumeOpen);
                        setIsBrightnessOpen(false);
                        setIsSettingsOpen(false);
                        setIsEnhanceMenuOpen(false);
                      }}
                      className="text-slate-300 hover:text-white cursor-pointer p-1 transition-transform hover:scale-110 active:scale-95"
                      title="Âm lượng (M để tắt/bật)"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                      ) : volume < 0.5 ? (
                        <Volume1 className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                    <input
                      id="player-volume-slider-inline"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => changeVolume(parseFloat(e.target.value))}
                      className="hidden md:inline-block w-14 lg:w-20 h-1 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"
                    />

                    {/* Volume Slider Popup */}
                    {isVolumeOpen && (
                      <div
                        id="player-volume-popup"
                        className="absolute bottom-10 left-0 bg-[#0f172a]/95 backdrop-blur-xl border border-blue-900/80 rounded-2xl p-3.5 shadow-2xl z-50 flex flex-col items-center gap-2.5 w-36 animate-in fade-in zoom-in-95 duration-150"
                      >
                        <div className="flex items-center justify-between w-full border-b border-slate-800 pb-1.5">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Âm lượng</span>
                          <span className="text-xs font-black text-sky-400">
                            {isMuted ? 'Tắt tiếng' : `${Math.round(volume * 100)}%`}
                          </span>
                        </div>

                        <input
                          id="player-volume-slider-popup"
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={(e) => changeVolume(parseFloat(e.target.value))}
                          className="w-28 h-1.5 bg-slate-700 rounded-lg accent-sky-400 cursor-pointer my-1"
                        />

                        {/* Quick Presets & Mute button */}
                        <div className="grid grid-cols-3 gap-1 w-full pt-1">
                          <button
                            onClick={toggleMute}
                            className={`py-1 px-1 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                              isMuted || volume === 0
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            Tắt
                          </button>
                          <button
                            onClick={() => changeVolume(0.5)}
                            className={`py-1 px-1 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                              !isMuted && volume === 0.5
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            50%
                          </button>
                          <button
                            onClick={() => changeVolume(1.0)}
                            className={`py-1 px-1 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                              !isMuted && volume === 1.0
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            100%
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Time Counter */}
                  <div className="text-[10px] sm:text-xs text-slate-300 font-mono tracking-tight whitespace-nowrap">
                    <span>{formatTime(currentTime)}</span>
                    <span className="text-slate-500 mx-0.5 sm:mx-1">/</span>
                    <span className="text-slate-400">{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Right Controls: Brightness, Enhancement, Settings, Fullscreen */}
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 relative">
                  {/* Brightness Control (Netflix / VLC style) */}
                  <div className="relative">
                    <button
                      id="player-brightness-btn"
                      onClick={() => {
                        setIsBrightnessOpen(!isBrightnessOpen);
                        setIsSettingsOpen(false);
                        setIsEnhanceMenuOpen(false);
                      }}
                      className="text-slate-300 hover:text-white transition-transform hover:scale-110 active:scale-95 cursor-pointer p-1"
                      title="Độ sáng màn hình (Phím [ và ])"
                    >
                      {brightness > 1.2 ? (
                        <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                      ) : brightness < 0.6 ? (
                        <SunDim className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                      ) : (
                        <SunMedium className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300 hover:text-amber-300" />
                      )}
                    </button>

                    {/* Brightness Vertical Slider Popup */}
                    {isBrightnessOpen && (
                      <div
                        id="player-brightness-popup"
                        className="absolute bottom-10 right-0 sm:left-0 bg-[#0f172a]/95 backdrop-blur-xl border border-blue-900/80 rounded-2xl p-3.5 shadow-2xl z-50 flex flex-col items-center gap-2.5 w-36 animate-in fade-in zoom-in-95 duration-150"
                      >
                        <div className="flex items-center justify-between w-full border-b border-slate-800 pb-1.5">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Độ sáng</span>
                          <span className="text-xs font-black text-amber-400">{Math.round(brightness * 100)}%</span>
                        </div>
                        <input
                          id="player-brightness-slider"
                          type="range"
                          min={0.2}
                          max={2.0}
                          step={0.05}
                          value={brightness}
                          onChange={(e) => changeBrightness(parseFloat(e.target.value))}
                          className="w-28 h-1.5 bg-slate-700 rounded-lg accent-amber-400 cursor-pointer my-1"
                        />
                        <button
                          onClick={() => changeBrightness(1.0)}
                          className="w-full text-center text-[10px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          Đặt lại (100%)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Enhancement / Upscaling Visual FX Button */}
                  <div className="relative">
                    <button
                      id="player-enhance-btn"
                      onClick={() => {
                        setIsEnhanceMenuOpen(!isEnhanceMenuOpen);
                        setIsSettingsOpen(false);
                        setIsBrightnessOpen(false);
                      }}
                      className={`relative flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        enhanceMode !== 'off'
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/40 ring-1 ring-cyan-300'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
                      }`}
                      title="Nâng cao chất lượng & Độ nét hình ảnh (Upscale)"
                    >
                      <Sparkles className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${enhanceMode !== 'off' ? 'text-amber-300 fill-amber-300 animate-pulse' : 'text-sky-400'}`} />
                      <span className="hidden sm:inline">
                        {enhanceMode === 'off' ? 'Tăng Nét' : 'Đang Bật Nét'}
                      </span>
                    </button>

                    {/* Enhancement Dropdown Menu */}
                    {isEnhanceMenuOpen && (
                      <div
                        id="player-enhance-menu"
                        className="absolute right-0 bottom-11 w-72 sm:w-80 bg-[#0b1329]/95 backdrop-blur-xl border border-blue-800/80 rounded-2xl shadow-2xl p-4 z-50 space-y-3 animate-in fade-in zoom-in-95 duration-200"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                          <div className="flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-cyan-400" />
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                              Bộ Lọc Tăng Nét & Upscale
                            </h4>
                          </div>
                          <button
                            onClick={() => setIsEnhanceMenuOpen(false)}
                            className="text-slate-400 hover:text-white text-xs p-1"
                          >
                            ✕
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-snug">
                          Tùy chọn xử lý hình ảnh trực tiếp trên trình duyệt giúp khử mờ khi xem trên màn hình PC lớn (mặc định luôn là <strong className="text-slate-200">Nguyên bản</strong>):
                        </p>

                        {/* Presets List */}
                        <div className="space-y-1.5">
                          {[
                            {
                              id: 'off' as EnhanceMode,
                              name: 'Nguyên Bản (Mặc định)',
                              desc: 'Không can thiệp, giữ 100% video gốc từ máy chủ',
                              badge: 'Chuẩn',
                            },
                            {
                              id: 'sharp' as EnhanceMode,
                              name: 'Làm Nét Cạnh (Sharpness)',
                              desc: 'Làm rõ đường viền, phụ đề và chi tiết khuôn mặt',
                              badge: 'Khuyên dùng',
                            },
                            {
                              id: 'ultra_sharp' as EnhanceMode,
                              name: 'Siêu Nét Chi Tiết (Ultra Clarity)',
                              desc: 'Bộ lọc ma trận khử mờ sâu cho màn hình 2K/4K',
                              badge: 'Cao cấp',
                            },
                            {
                              id: 'hdr' as EnhanceMode,
                              name: 'HDR Sống Động (Vibrant Boost)',
                              desc: 'Tăng dải tương phản và bão hòa màu rực rỡ',
                              badge: 'Rực rỡ',
                            },
                            {
                              id: 'cinema' as EnhanceMode,
                              name: 'Chuẩn Điện Ảnh (Cinematic)',
                              desc: 'Độ nét sắc sảo kết hợp tông màu phim chân thực',
                              badge: 'Cinema',
                            },
                          ].map((item) => {
                            const isSelected = enhanceMode === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => handleEnhanceModeChange(item.id)}
                                className={`w-full flex items-start justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                                  isSelected
                                    ? 'bg-blue-600/25 border-blue-500/80 shadow-md'
                                    : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                                }`}
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-xs font-bold ${
                                        isSelected ? 'text-cyan-300' : 'text-slate-200'
                                      }`}
                                    >
                                      {item.name}
                                    </span>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.2 rounded font-medium border ${
                                        isSelected
                                          ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                                          : 'bg-slate-800 text-slate-400 border-slate-700'
                                      }`}
                                    >
                                      {item.badge}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400">{item.desc}</p>
                                </div>
                                {isSelected && (
                                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Hardware AI 4K Upscaling Tip */}
                        <div className="pt-2 border-t border-slate-800">
                          <button
                            onClick={() => {
                              setShowGpuModal(true);
                              setIsEnhanceMenuOpen(false);
                            }}
                            className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-blue-950/60 border border-blue-900/60 text-left transition-colors cursor-pointer text-xs text-sky-300"
                          >
                            <div className="flex items-center gap-2">
                              <Monitor className="w-4 h-4 text-cyan-400 shrink-0" />
                              <span>Mẹo AI 4K phần cứng trên PC</span>
                            </div>
                            <span className="text-[10px] text-slate-400">Xem ngay →</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Aspect Ratio Menu */}
                  <div className="relative">
                    <button
                      id="player-aspect-ratio-btn"
                      onClick={() => {
                        const next = !isAspectRatioOpen;
                        closeAllMenus();
                        setIsAspectRatioOpen(next);
                      }}
                      className={`text-slate-300 hover:text-white transition-transform hover:scale-110 active:scale-95 cursor-pointer p-1 rounded-lg ${
                        aspectRatio !== 'contain' ? 'text-cyan-400 font-bold' : ''
                      }`}
                      title="Tỉ lệ khung hình"
                    >
                      <Scan className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

                    {/* Aspect Ratio Dropdown */}
                    {isAspectRatioOpen && (
                      <div
                        id="player-aspect-ratio-menu"
                        className="absolute right-0 bottom-10 w-52 bg-[#0b1329]/95 backdrop-blur-xl border border-blue-900/80 rounded-2xl shadow-2xl p-3 z-50 space-y-1.5 animate-in fade-in zoom-in-95 duration-150"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1">
                          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                            Tỉ lệ khung hình
                          </span>
                        </div>

                        {[
                          { id: 'contain' as AspectRatioMode, label: 'Tỉ lệ gốc (Fit)', desc: 'Chuẩn 100% gốc không cắt' },
                          { id: 'cover' as AspectRatioMode, label: 'Tràn viền (Cover)', desc: 'Lấp đầy màn hình, cắt đen' },
                          { id: '16-9' as AspectRatioMode, label: 'Chuẩn 16:9', desc: 'Tỉ lệ TV & màn rộng 16:9' },
                          { id: '21-9' as AspectRatioMode, label: 'Điện ảnh 21:9', desc: 'Chuẩn Cinema Ultrawide' },
                          { id: 'fill' as AspectRatioMode, label: 'Giãn đầy màn (Fill)', desc: 'Kéo dãn toàn bộ khung hình' },
                        ].map((item) => {
                          const isActive = aspectRatio === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleAspectRatioChange(item.id)}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold shadow-md shadow-blue-600/30'
                                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                              }`}
                            >
                              <div>
                                <div className="text-xs font-semibold">{item.label}</div>
                                <div className="text-[10px] text-slate-400">{item.desc}</div>
                              </div>
                              {isActive && <Check className="w-4 h-4 text-white shrink-0 ml-1.5" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Settings / Speed / Quality Menu */}
                  <div className="relative">
                    <button
                      id="player-settings-btn"
                      onClick={() => {
                        const next = !isSettingsOpen;
                        closeAllMenus();
                        setIsSettingsOpen(next);
                      }}
                      className="text-slate-300 hover:text-white transition-transform hover:scale-110 active:scale-95 cursor-pointer p-1"
                      title="Cài đặt tốc độ & chất lượng"
                    >
                      <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

                    {/* Settings Dropdown */}
                    {isSettingsOpen && (
                      <div
                        id="player-settings-menu"
                        className="absolute right-0 bottom-10 w-56 bg-[#0f172a] border border-blue-900/60 rounded-xl shadow-2xl p-3 z-50 space-y-3"
                      >
                        {/* Playback Speed */}
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                            Tốc độ phát
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                              <button
                                key={spd}
                                onClick={() => handleSpeedChange(spd)}
                                className={`text-xs py-1 rounded-md text-center transition-colors ${
                                  playbackRate === spd
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                {spd}x
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Quality Levels */}
                        {qualityLevels.length > 0 && (
                          <div className="border-t border-slate-800 pt-2">
                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                              Độ phân giải
                            </div>
                            <div className="space-y-1">
                              <button
                                onClick={() => handleQualityChange(-1)}
                                className={`w-full text-left px-2 py-1 rounded text-xs ${
                                  currentQuality === -1
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                Tự động (Auto)
                              </button>
                              {qualityLevels.map((lvl) => (
                                <button
                                  key={lvl.level}
                                  onClick={() => handleQualityChange(lvl.level)}
                                  className={`w-full text-left px-2 py-1 rounded text-xs ${
                                    currentQuality === lvl.level
                                      ? 'bg-blue-600 text-white font-bold'
                                      : 'text-slate-300 hover:bg-slate-800'
                                  }`}
                                >
                                  {lvl.height}p {lvl.height >= 1080 ? 'Full HD' : lvl.height >= 720 ? 'HD' : ''}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Fullscreen Button */}
                  <button
                    id="player-fullscreen-toggle"
                    onClick={toggleFullscreen}
                    className="text-slate-200 hover:text-white bg-blue-600/20 sm:bg-transparent p-1 sm:p-1.5 rounded-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer shrink-0"
                    title={isFullscreen ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)'}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Slide-in Episode Drawer */}
          {isEpisodeDrawerOpen && (
            <div
              id="player-episodes-drawer"
              className="absolute right-0 top-0 bottom-0 w-80 sm:w-96 bg-[#0b1329]/95 border-l border-blue-900/60 p-5 shadow-2xl z-50 flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-300 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-bold text-white">Danh Sách Tập Phim</h3>
                </div>
                <button
                  onClick={() => setIsEpisodeDrawerOpen(false)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  Đóng ✕
                </button>
              </div>

              <div className="text-xs text-slate-400 py-2">
                Nguồn: <span className="text-white font-semibold">{currentServer.server_name}</span> (
                {currentServer.server_data.length} tập)
              </div>

              <div
                className="flex-1 overflow-y-auto space-y-1.5 pr-1 mt-2 overscroll-contain"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {currentServer.server_data.map((ep, idx) => {
                  const isActive = ep.slug === currentEpisode.slug;
                  return (
                    <button
                      key={ep.slug || idx}
                      id={`drawer-ep-btn-${ep.slug}`}
                      onClick={() => {
                        onSelectEpisode(ep, currentServer);
                        setIsEpisodeDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-lg shadow-blue-600/30'
                          : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Play className={`w-3.5 h-3.5 ${isActive ? 'fill-white' : 'text-slate-400'}`} />
                        <span className="truncate">
                          {ep.name.startsWith('Tập') ? ep.name : `Tập ${ep.name}`}
                        </span>
                      </div>
                      {isActive && <span className="text-[10px] uppercase font-bold tracking-widest text-sky-200">Đang phát</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Hardware AI 4K Super Resolution Instructions Modal */}
          {showGpuModal && (
            <div
              id="gpu-upscale-modal"
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
              onClick={() => setShowGpuModal(false)}
            >
              <div
                className="bg-[#0f172a] border border-blue-900/80 rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Monitor className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-base font-bold text-white">
                      Cách Bật AI 4K Upscale Phần Cứng trên PC
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowGpuModal(false)}
                    className="text-slate-400 hover:text-white text-sm p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs text-slate-300 leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                  <div className="p-3 bg-blue-950/40 border border-blue-900/60 rounded-xl space-y-1">
                    <span className="font-bold text-sky-300">💡 Nguyên lý hoạt động:</span>
                    <p className="text-slate-300">
                      Card đồ họa (GPU) và trình duyệt máy tính có khả năng dùng nhân AI (Deep Learning) để khử răng cưa, tái tạo lại từng điểm ảnh từ nguồn 1080p/720p lên độ nét 4K theo thời gian thực mà không làm giật lag máy tính.
                    </p>
                  </div>

                  {/* Option 1: Microsoft Edge */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1.5">
                    <h4 className="font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      1. Dành cho Trình duyệt Microsoft Edge (Mọi máy tính PC / Laptop):
                    </h4>
                    <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                      <li>Mở trình duyệt Microsoft Edge.</li>
                      <li>
                        Nhập vào thanh địa chỉ: <code className="text-cyan-300 bg-slate-800 px-1 py-0.5 rounded">edge://settings/system</code>
                      </li>
                      <li>
                        Bật mục: <strong className="text-slate-200">"Tăng cường video trong Microsoft Edge (Clarity Boost / Super Resolution)"</strong>.
                      </li>
                      <li>F5 lại trang QTB Cinema và trải nghiệm video sắc nét vượt trội.</li>
                    </ol>
                  </div>

                  {/* Option 2: NVIDIA RTX */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1.5">
                    <h4 className="font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      2. Dành cho Card đồ họa NVIDIA RTX (Dòng RTX 3000 / 4000 / 5000):
                    </h4>
                    <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                      <li>Nhấp chuột phải vào màn hình Desktop $\to$ Chọn <strong>NVIDIA Control Panel</strong>.</li>
                      <li>Vào mục <strong>Adjust video image settings</strong> (Cài đặt hình ảnh video).</li>
                      <li>Tại phần <em>RTX Video Enhancement</em>, tích chọn <strong>Super Resolution</strong>.</li>
                      <li>Kéo chất lượng lên <strong>Level 4</strong> (hoặc Level 2 - 3 tùy cấu hình).</li>
                      <li>Mở lại trình duyệt Chrome hoặc Edge để xem video với độ nét AI tiệm cận 4K.</li>
                    </ol>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => setShowGpuModal(false)}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer"
                  >
                    Đã hiểu & Đóng
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
