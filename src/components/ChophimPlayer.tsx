import React, { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, PictureInPicture2, X, RotateCcw, RotateCw, SkipForward, List, Server } from 'lucide-react';
import { EpisodeServer, Movie, MovieEpisode } from '../types';
import { getMirrorUrls } from '../utils/mirrorUrls';
import { getFullApiUrl } from '../services/apiConfig';
import { Capacitor } from '@capacitor/core';

type IntroSegment = { start_sec: number; end_sec: number; start_ms: number; end_ms: number; confidence?: number; submission_count?: number } | null;
type SegmentsResponse = { imdb_id: string; season: number; episode: number; intro: IntroSegment; recap: IntroSegment; outro: IntroSegment };

interface ChophimPlayerProps {
  movie: Movie;
  currentEpisode: MovieEpisode;
  currentServer: EpisodeServer;
  allServers: EpisodeServer[];
  onBack: () => void;
  onSelectEpisode: (ep: MovieEpisode, server: EpisodeServer, currentTime?: number) => void;
  onSaveProgress?: (currentTime: number, duration: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  initialTime?: number;
}

function getAdCleanUrl(raw: string): string {
  if (!raw) return raw;
  if (raw.startsWith('blob:') || raw.startsWith('data:') || raw.startsWith('file:')) return raw;
  try {
    const b64 = btoa(unescape(encodeURIComponent(raw)));
    return getFullApiUrl(`/api/proxy/m3u8?url=${encodeURIComponent(b64)}`);
  } catch {
    return getFullApiUrl(`/api/proxy/m3u8?url=${encodeURIComponent(raw)}`);
  }
}

function formatTime(s: number): string {
  if (!s || isNaN(s)) return '00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const ChophimPlayer: React.FC<ChophimPlayerProps> = memo(({
  movie,
  currentEpisode,
  currentServer,
  allServers,
  onBack,
  onSelectEpisode,
  onSaveProgress,
  onTimeUpdate,
  initialTime = 0,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // ui state
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityLevels, setQualityLevels] = useState<{ height: number; level: number; bitrate?: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [showSettings, setShowSettings] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [useIframe, setUseIframe] = useState(false);
  // intro/recap/outro segments (single fetch per episode, no cache)
  const [segments, setSegments] = useState<SegmentsResponse | null>(null);
  const [activeSegment, setActiveSegment] = useState<'intro' | 'recap' | 'outro' | null>(null);

  // timeline refs like chophim n4
  const progressBarRef = useRef<HTMLDivElement>(null);
  const bufferedBarRef = useRef<HTMLDivElement>(null);
  const hoverTrackRef = useRef<HTMLDivElement>(null);
  const progressInputRef = useRef<HTMLInputElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  // preview refs - chophim sprite style (hidden video + canvas)
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewHlsRef = useRef<Hls | null>(null);
  const previewSeekTimer = useRef<number | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  const nextEpisode = useMemo(() => {
    const idx = currentServer.server_data.findIndex(e => e.slug === currentEpisode.slug);
    return idx !== -1 && idx < currentServer.server_data.length - 1 ? currentServer.server_data[idx + 1] : null;
  }, [currentServer, currentEpisode]);

  // single fetch per episode: imdb from movie detail (movie.imdb.id), season/episode parsed locally
  useEffect(() => {
    const imdbId = (movie as any)?.imdb?.id ? String((movie as any).imdb.id).trim() : '';
    if (!imdbId || !/^tt\d{7,8}$/.test(imdbId)) { setSegments(null); setActiveSegment(null); return; }
    const season = Number((movie as any)?.tmdb?.season) > 0 ? Number((movie as any).tmdb.season) : 1;
    let epNum = NaN;
    const m = String(currentEpisode.name || '').match(/\d+/);
    if (m) epNum = parseInt(m[0], 10);
    if (isNaN(epNum)) {
      const idx2 = currentServer.server_data.findIndex(e => e.slug === currentEpisode.slug);
      epNum = idx2 >= 0 ? idx2 + 1 : 1;
    }
    if (epNum < 1) epNum = 1;
    let cancelled = false;
    setSegments(null); setActiveSegment(null);
    // APK-safe: use backend proxy via getFullApiUrl so relative URL resolves to CLOUD_BACKEND_URL on native
    const url = getFullApiUrl(`/api/intro/segments?imdb_id=${encodeURIComponent(imdbId)}&season=${season}&episode=${epNum}`);
    fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) as any })
      .then(async r => {
        if (r.status === 404) return { imdb_id: imdbId, season, episode: epNum, intro: null, recap: null, outro: null } as any;
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data: SegmentsResponse) => { if (!cancelled) setSegments(data); })
      .catch(() => { if (!cancelled) setSegments(null); });
    return () => { cancelled = true; };
  }, [(movie as any)?.imdb?.id, (movie as any)?.tmdb?.season, currentEpisode.slug, currentEpisode.name, currentServer]);

  const handleSkipSegment = useCallback((type: 'intro' | 'recap' | 'outro') => {
    const v = videoRef.current;
    if (!v) return;
    const seg = type === 'intro' ? segments?.intro : type === 'recap' ? segments?.recap : segments?.outro;
    if (type === 'outro') {
      if (nextEpisode) onSelectEpisode(nextEpisode, currentServer);
      else if (seg && typeof seg.end_sec === 'number' && seg.end_sec > 0) v.currentTime = Math.min(v.duration || seg.end_sec, seg.end_sec);
      return;
    }
    if (seg && typeof seg.end_sec === 'number') v.currentTime = seg.end_sec + 0.2;
  }, [segments, nextEpisode, currentServer, onSelectEpisode]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = window.setTimeout(() => {
      if (!showSettings && !showServerMenu && !showEpisodes && !isDraggingRef.current) setShowControls(false);
    }, 3000);
  }, [showSettings, showServerMenu, showEpisodes]);

  const capturePreviewFrame = useCallback(() => {
    const pv = previewVideoRef.current;
    const cv = previewCanvasRef.current;
    if (!pv || !cv) return;
    try {
      // render 2x for retina sharpness (320x180 displayed as 160x90)
      const cw = 320, ch = 180;
      cv.width = cw; cv.height = ch;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      // high quality scaling
      (ctx as any).imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = 'high';
      ctx.drawImage(pv, 0, 0, cw, ch);
      setPreviewImg(cv.toDataURL('image/jpeg', 0.85));
    } catch { setPreviewImg(null); }
  }, []);
  const seekPreviewTo = useCallback((time: number) => {
    const pv = previewVideoRef.current;
    if (!pv || !duration) return;
    const clamped = Math.max(0, Math.min(duration - 0.5, time));
    if (previewSeekTimer.current) window.clearTimeout(previewSeekTimer.current);
    previewSeekTimer.current = window.setTimeout(() => { try { pv.currentTime = clamped; } catch {} }, 60);
  }, [duration]);

  // preview hls setup (chophim style but lightweight canvas)
  useEffect(() => {
    const pv = previewVideoRef.current;
    if (!pv || !currentEpisode.link_m3u8) return;
    if (previewHlsRef.current) { previewHlsRef.current.destroy(); previewHlsRef.current = null; }
    const raw = getMirrorUrls(currentEpisode.link_m3u8).map(getAdCleanUrl)[0];
    if (!raw) return;
    pv.muted = true;
    pv.preload = 'metadata';
    // @ts-ignore
    pv.crossOrigin = 'anonymous';
    const onSeeked = () => capturePreviewFrame();
    pv.addEventListener('seeked', onSeeked);
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 10,
        maxBufferLength: 10,
        maxMaxBufferLength: 15,
        maxBufferSize: 10 * 1000 * 1000,
        manifestLoadingTimeOut: 8000,
        levelLoadingTimeOut: 8000,
        fragLoadingTimeOut: 15000,
        startLevel: 2,
        capLevelToPlayerSize: false,
      });
      previewHlsRef.current = hls;
      hls.loadSource(raw);
      hls.attachMedia(pv);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // try to switch to highest available for sharp preview (if auto)
        try {
          const levels = (hls as any).levels || [];
          if (levels.length > 2) hls.currentLevel = Math.min(2, levels.length - 1);
        } catch {}
      });
    } else if (pv.canPlayType('application/vnd.apple.mpegurl')) {
      pv.src = raw;
    }
    return () => {
      pv.removeEventListener('seeked', onSeeked);
      if (previewHlsRef.current) { previewHlsRef.current.destroy(); previewHlsRef.current = null; }
    };
  }, [currentEpisode.link_m3u8, capturePreviewFrame]);

  // hls setup - single instance only, no preview video
  useEffect(() => {
    setUseIframe(false);
    if (!currentEpisode.link_m3u8) {
      if (currentEpisode.link_embed) {
        setUseIframe(true);
        setIsLoading(false);
        return;
      }
      setErrorMsg('Tập phim này chưa có dữ liệu phát. Vui lòng chọn server hoặc tập khác.');
      setIsLoading(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setErrorMsg(null);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const rawCandidates = getMirrorUrls(currentEpisode.link_m3u8);
    const candidates: string[] = [];
    // 1. Try ad-cleaned proxied URLs first
    rawCandidates.forEach((u) => {
      if (u) {
        const proxied = getAdCleanUrl(u);
        if (proxied && !candidates.includes(proxied)) candidates.push(proxied);
      }
    });
    // 2. Direct raw m3u8 URLs as fallbacks
    rawCandidates.forEach((u) => {
      if (u && !candidates.includes(u)) candidates.push(u);
    });

    let candidateIndex = 0;
    const tryNext = (hls: Hls) => {
      candidateIndex++;
      if (candidateIndex < candidates.length) {
        hls.loadSource(candidates[candidateIndex]);
        hls.startLoad();
        return;
      }
      if (currentEpisode.link_embed) {
        setUseIframe(true);
        setIsLoading(false);
        return;
      }
      const other = allServers.find(s => s.server_name !== currentServer.server_name);
      if (other) {
        const ep = other.server_data.find(e => e.slug === currentEpisode.slug) || other.server_data[0];
        if (ep) { onSelectEpisode(ep, other, video.currentTime || 0); return; }
      }
      setErrorMsg('Không thể tải luồng phát HLS. Bạn có thể chọn server khác hoặc thử Player Embed.');
      setIsLoading(false);
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
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
        const levels = (data.levels || [])
          .map((l: any, i: number) => ({
            height: l.height || (l.width ? Math.round((l.width * 9) / 16) : 0),
            level: i,
            bitrate: l.bitrate,
          }))
          .filter((l: any) => l.height > 0 || l.bitrate > 0);
        // dedupe by height
        const seen = new Set<number>();
        const deduped = levels.filter((l: any) => {
          if (l.height && seen.has(l.height)) return false;
          if (l.height) seen.add(l.height);
          return true;
        });
        setQualityLevels(deduped.length ? deduped : levels);
        if (initialTime > 5) video.currentTime = initialTime;
        video.play().catch(() => {});
      });
      let ec = 0;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          ec++;
          if (ec <= 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (ec <= 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else tryNext(hls);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = getAdCleanUrl(currentEpisode.link_m3u8);
      const onLoaded = () => { setIsLoading(false); if (initialTime > 5) video.currentTime = initialTime; video.play().catch(() => {}); };
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.onerror = () => {
        if (currentEpisode.link_embed) {
          setUseIframe(true);
          setIsLoading(false);
        } else {
          setErrorMsg('Không thể phát trên trình duyệt này');
          setIsLoading(false);
        }
      };
    } else {
      if (currentEpisode.link_embed) {
        setUseIframe(true);
        setIsLoading(false);
      } else {
        setErrorMsg('Trình duyệt không hỗ trợ HLS');
        setIsLoading(false);
      }
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [currentEpisode.link_m3u8, currentEpisode.link_embed, allServers, currentServer, initialTime, onSelectEpisode]);

  // sync volume/mute without recreating hls
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = isMuted ? 0 : volume;
    v.muted = isMuted;
  }, [volume, isMuted]);

  // time update - segment detection (intro/recap/outro) + progress
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const cur = v.currentTime;
    setCurrentTime(cur);
    onTimeUpdate?.(cur, v.duration || 0);
    if (segments) {
      const inIntro = segments.intro && cur >= segments.intro.start_sec && cur < segments.intro.end_sec - 0.15;
      const inRecap = segments.recap && cur >= segments.recap.start_sec && cur < segments.recap.end_sec - 0.15;
      const inOutro = segments.outro && cur >= segments.outro.start_sec && cur < (segments.outro.end_sec || (v.duration || 1e9));
      const next = inIntro ? 'intro' as const : inRecap ? 'recap' as const : inOutro ? 'outro' as const : null;
      setActiveSegment(prev => prev !== next ? next : prev);
    } else {
      setActiveSegment(null);
    }
    if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
    // update progress bar width directly via ref for performance (no re-render)
    if (progressBarRef.current && v.duration) {
      progressBarRef.current.style.width = `${(cur / v.duration) * 100}%`;
    }
    if (bufferedBarRef.current && v.duration) {
      bufferedBarRef.current.style.width = `${(v.buffered.length ? (v.buffered.end(v.buffered.length - 1) / v.duration) * 100 : 0)}%`;
    }
    if (progressInputRef.current && v.duration) {
      progressInputRef.current.value = String((cur / v.duration) * 100);
    }
  }, [onTimeUpdate]);

  // controls handlers
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);
  const skip = useCallback((s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + s));
  }, []);
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const nv = !isMuted;
    setIsMuted(nv);
    v.muted = nv;
  }, [isMuted]);
  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setIsMuted(v === 0);
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
  };
  const toggleFullscreen = useCallback(async () => {
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement) await c.requestFullscreen?.();
    else await document.exitFullscreen?.();
  }, []);
  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch {}
  }, []);

  const handleVideoAreaClick = useCallback(() => {
    if (showEpisodes || showServerMenu || showSettings) {
      setShowEpisodes(false);
      setShowServerMenu(false);
      setShowSettings(false);
      return;
    }
    togglePlay();
  }, [showEpisodes, showServerMenu, showSettings, togglePlay]);

  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    handleVideoAreaClick();
  }, [handleVideoAreaClick]);

  // click outside to close menus (episodes / server / settings) - use click so video handler runs first
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // let video-area clicks be handled by handleVideoAreaClick (which already closes without toggling)
      if (target.closest('.video-area')) return;
      if (!target.closest('.player-menu-panel') && !target.closest('.player-menu-btn')) {
        setShowEpisodes(false);
        setShowServerMenu(false);
        setShowSettings(false);
      }
    };
    document.addEventListener('click', handleClickOutside as any);
    return () => {
      document.removeEventListener('click', handleClickOutside as any);
    };
  }, []);

  // fullscreen + pip listeners
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    const v = videoRef.current;
    const onEnter = () => setIsPip(true);
    const onLeave = () => setIsPip(false);
    v?.addEventListener('enterpictureinpicture', onEnter);
    v?.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      v?.removeEventListener('enterpictureinpicture', onEnter);
      v?.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  // hover preview logic - chophim style: no second video, just time tooltip + track
  const getPctFromEvent = (e: React.MouseEvent | MouseEvent): number => {
    const track = (e.currentTarget as HTMLElement).closest('.group\\/scrub') || (e.currentTarget as HTMLElement);
    // fallback: find scrub container
    const container = document.querySelector('.group\\/scrub') as HTMLElement;
    const rect = (container || e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, (e as React.MouseEvent).clientX - rect.left));
    return rect.width ? (x / rect.width) : 0;
  };
  const handleProgressMouseMove = useCallback((e: React.MouseEvent) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = pct * duration;
    // tooltip position
    if (hoverTooltipRef.current) {
      const tip = hoverTooltipRef.current;
      tip.style.opacity = '1';
      const tipW = tip.offsetWidth || 160;
      const r = Math.min(1 - tipW / 2 / rect.width, Math.max(tipW / 2 / rect.width, pct));
      tip.style.left = `${r * 100}%`;
    }
    if (hoverTimeRef.current) hoverTimeRef.current.innerText = formatTime(hoverTime);
    if (hoverTrackRef.current) hoverTrackRef.current.style.width = `${pct * 100}%`;
    setPreviewVisible(true);
    seekPreviewTo(hoverTime);
  }, [duration, seekPreviewTo]);
  const handleProgressMouseLeave = useCallback(() => {
    if (hoverTooltipRef.current) hoverTooltipRef.current.style.opacity = '0';
    if (hoverTrackRef.current) hoverTrackRef.current.style.width = '0%';
    setPreviewVisible(false);
  }, []);
  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
  }, [duration]);
  const handleSeekMouseDown = useCallback(() => { isDraggingRef.current = true; const v = videoRef.current; if (v && !v.paused) v.pause(); }, []);
  const handleSeekMouseUp = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    isDraggingRef.current = false;
    const v = videoRef.current;
    if (!v || !duration) return;
    const pct = parseFloat((e.target as HTMLInputElement).value) / 100;
    v.currentTime = pct * duration;
    if (v.paused) v.play().catch(() => {});
    resetControlsTimer();
  }, [duration, resetControlsTimer]);
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseFloat(e.target.value);
    if (progressBarRef.current) progressBarRef.current.style.width = `${pct}%`;
  };

  // save progress every 30s
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || !duration) return;
      onSaveProgress?.(v.currentTime, duration);
    }, 30000);
    return () => window.clearInterval(id);
  }, [duration, onSaveProgress]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-10); }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip(10); }
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'm') toggleMute();
      if (e.key.toLowerCase() === 's' && activeSegment) { e.preventDefault(); handleSkipSegment(activeSegment); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, skip, toggleFullscreen, toggleMute, activeSegment, handleSkipSegment]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[70] bg-black flex flex-col select-none"
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      <div className="video-area relative flex-1 bg-black flex items-center justify-center overflow-hidden" onClick={handleVideoAreaClick}>
        {useIframe && currentEpisode.link_embed ? (
          <iframe
            src={currentEpisode.link_embed}
            className="w-full h-full border-0 bg-black"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            title={`${movie.name} - ${currentEpisode.name}`}
          />
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onEnded={() => { if (nextEpisode) onSelectEpisode(nextEpisode, currentServer); }}
            playsInline
            onClick={handleVideoClick}
          />
        )}
        {/* hidden preview video + canvas for hover thumbnail - chophim smooth */}
        <video ref={previewVideoRef} muted playsInline preload="metadata" crossOrigin="anonymous" className="hidden w-0 h-0 pointer-events-none" tabIndex={-1} />
        <canvas ref={previewCanvasRef} className="hidden w-0 h-0 pointer-events-none" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center z-40">
            <p className="text-white font-medium">{errorMsg}</p>
            <div className="flex items-center gap-3 mt-4">
              {currentEpisode.link_embed && (
                <button
                  onClick={() => { setUseIframe(true); setErrorMsg(null); }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg transition-all"
                >
                  Phát qua Embed Iframe
                </button>
              )}
              <button onClick={onBack} className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-all">
                Thoát
              </button>
            </div>
          </div>
        )}

        {/* Skip intro/recap/outro - always visible when in segment, APK-safe (fixed position, no dependency on showControls) */}
        {activeSegment && (
          <div className="absolute bottom-20 right-4 sm:bottom-24 sm:right-6 z-30 pointer-events-auto">
            {activeSegment === 'intro' && (
              <button onClick={(e) => { e.stopPropagation(); handleSkipSegment('intro'); }} className="flex items-center gap-2 bg-white text-black px-4 py-2.5 rounded-lg text-sm font-bold shadow-2xl hover:bg-white/90 active:scale-95 transition-all border border-black/10">
                <SkipForward className="w-4 h-4" /> Bỏ qua phần giới thiệu
              </button>
            )}
            {activeSegment === 'recap' && (
              <button onClick={(e) => { e.stopPropagation(); handleSkipSegment('recap'); }} className="flex items-center gap-2 bg-white text-black px-4 py-2.5 rounded-lg text-sm font-bold shadow-2xl hover:bg-white/90 active:scale-95 transition-all border border-black/10">
                <SkipForward className="w-4 h-4" /> Bỏ qua tóm tắt
              </button>
            )}
            {activeSegment === 'outro' && (
              <button onClick={(e) => { e.stopPropagation(); handleSkipSegment('outro'); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-2xl hover:bg-blue-500 active:scale-95 transition-all">
                <SkipForward className="w-4 h-4" /> {nextEpisode ? 'Tập tiếp theo' : 'Bỏ qua outro'}
              </button>
            )}
          </div>
        )}

        {/* Minimal top bar like chophim */}
        <div className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 z-30 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-white text-sm font-medium truncate pr-2">{movie.name} - {currentEpisode.name}</h2>
            <div className="flex items-center gap-2 shrink-0">
              {currentEpisode.link_embed && (
                <button
                  onClick={(e) => { e.stopPropagation(); setUseIframe(!useIframe); }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all"
                >
                  {useIframe ? "Dùng HLS Player" : "Dùng Embed"}
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onBack(); }} style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', aspectRatio: '1 / 1', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden' } as any} className="shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-none overflow-hidden border-0">
                <X className="w-4 h-4 text-white shrink-0" style={{ display: 'block' } as any} />
              </button>
            </div>
          </div>
        </div>

        {/* Center play button when paused */}
        {!isPlaying && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} style={{ width: 64, height: 64, borderRadius: 9999 }} className="shrink-0 rounded-full bg-white/15 backdrop-blur flex items-center justify-center pointer-events-auto hover:bg-white/25 transition flex-none aspect-square overflow-hidden">
              <Play className="w-7 h-7 text-white ml-1 shrink-0" fill="white" />
            </button>
          </div>
        )}

        {/* Bottom controls - chophim style */}
        <div
          className={`absolute bottom-0 left-0 right-0 pt-10 pb-3 px-3 sm:px-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-all duration-300 ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}
          onClick={e => e.stopPropagation()}
        >
          <div className="max-w-screen-2xl mx-auto flex flex-col gap-2">
            {/* Timeline - chophim n4 */}
            <div className="flex items-center gap-2 w-full">
              <span className="hidden sm:block shrink-0 text-[11px] font-medium text-white/80 tabular-nums">{formatTime(currentTime)}</span>
              <div
                className="flex-1 group/scrub relative flex flex-col justify-center h-7 cursor-pointer"
                onMouseMove={handleProgressMouseMove}
                onMouseLeave={handleProgressMouseLeave}
                onClick={handleProgressClick}
              >
                {/* Hover tooltip - chophim style with preview image */}
                <div ref={hoverTooltipRef} className="absolute bottom-full left-1/2 -translate-x-1/2 opacity-0 transition-opacity duration-150 pointer-events-none mb-1 w-40">
                  <div className="relative h-[90px] w-40 overflow-hidden rounded-xl bg-black shadow-xl ring-2 ring-white">
                    {previewVisible && previewImg ? (
                      <img src={previewImg} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black" />
                    )}
                  </div>
                  <div ref={hoverTimeRef} className="mx-auto mt-2 w-fit rounded-md bg-black/90 px-2 py-1 text-xs font-medium text-white shadow-lg tabular-nums">00:00</div>
                </div>
                {/* Track */}
                <div className="relative w-full h-[5px] rounded-sm bg-white/15 group-hover/scrub:h-[6px] transition-all">
                  <div ref={bufferedBarRef} className="absolute left-0 top-0 h-full rounded-sm bg-white/25 pointer-events-none" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
                  <div ref={hoverTrackRef} className="absolute left-0 top-0 h-full rounded-sm bg-white/30 pointer-events-none" style={{ width: '0%' }} />
                  <div ref={progressBarRef} className="absolute left-0 top-0 h-full rounded-sm bg-blue-500 pointer-events-none after:absolute after:right-0 after:top-1/2 after:w-2.5 after:h-2.5 after:bg-white after:rounded-full after:-translate-y-1/2 after:translate-x-1/2 group-hover/scrub:after:w-3 group-hover/scrub:after:h-3 after:transition-all" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
                </div>
                <input
                  ref={progressInputRef}
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  defaultValue={0}
                  onMouseDown={handleSeekMouseDown}
                  onTouchStart={handleSeekMouseDown}
                  onChange={handleSeekChange}
                  onMouseUp={handleSeekMouseUp as any}
                  onTouchEnd={handleSeekMouseUp as any}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <span className="hidden sm:block shrink-0 text-[11px] font-medium text-white/80 tabular-nums">{formatTime(duration)}</span>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button onClick={() => skip(-10)} style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: 9999 }} className="shrink-0 rounded-full hover:bg-white/10 flex items-center justify-center text-white flex-none aspect-square overflow-hidden"><RotateCcw className="w-4 h-4 shrink-0" /></button>
                <button onClick={togglePlay} style={{ width: 36, height: 36, minWidth: 36, minHeight: 36, borderRadius: 9999 }} className="shrink-0 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 aspect-square overflow-hidden flex-none">
                  {isPlaying ? <Pause className="w-4 h-4 shrink-0" /> : <Play className="w-4 h-4 ml-0.5 shrink-0" />}
                </button>
                <button onClick={() => skip(10)} style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: 9999 }} className="shrink-0 rounded-full hover:bg-white/10 flex items-center justify-center text-white flex-none aspect-square overflow-hidden"><RotateCw className="w-4 h-4 shrink-0" /></button>
                <div className="hidden sm:flex items-center gap-2 ml-2">
                  <button onClick={toggleMute} style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: 9999 }} className="shrink-0 rounded-full hover:bg-white/10 flex items-center justify-center text-white flex-none aspect-square overflow-hidden">{isMuted || volume===0 ? <VolumeX className="w-4 h-4 shrink-0" /> : <Volume2 className="w-4 h-4 shrink-0" />}</button>
                  <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={handleVolume} className="w-20 accent-white h-1" />
                  <span className="text-[11px] text-white/70 tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Episode list - always visible if >1 ep */}
                {currentServer.server_data.length > 1 && (
                  <div className="relative">
                    <button onClick={() => { setShowEpisodes(!showEpisodes); setShowServerMenu(false); setShowSettings(false); }} style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: 9999 }} className="player-menu-btn shrink-0 rounded-full hover:bg-white/10 flex items-center justify-center text-white flex-none aspect-square overflow-hidden" title="Danh sách tập"><List className="w-4 h-4 shrink-0" /></button>
                    {showEpisodes && (
                      <div className="player-menu-panel absolute right-0 bottom-10 bg-[#1c1c1e] border border-white/10 rounded-xl p-3 w-72 max-h-64 overflow-auto shadow-2xl">
                        <p className="text-[11px] font-bold text-white/50 uppercase mb-2">Danh sách tập ({currentServer.server_data.length})</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {currentServer.server_data.map(ep => (
                            <button key={ep.slug} onClick={() => { onSelectEpisode(ep, currentServer); setShowEpisodes(false); }} className={`text-xs py-2 rounded-lg font-medium ${ep.slug===currentEpisode.slug ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}>{ep.name.replace(/^Tập\s*/i,'').trim().padStart(2,'0')}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Server vietsub/lt/tm */}
                <div className="relative">
                  <button onClick={() => { setShowServerMenu(!showServerMenu); setShowSettings(false); setShowEpisodes(false); }} className="player-menu-btn px-2.5 py-1.5 rounded-lg bg-transparent hover:bg-white/10 border border-transparent hover:border-white/10 text-xs text-white flex items-center gap-1 transition-colors"><Server className="w-3 h-3" /> {currentServer.server_name}</button>
                  {showServerMenu && (
                    <div className="player-menu-panel absolute right-0 bottom-10 bg-[#1c1c1e] border border-white/10 rounded-xl p-2 w-48 max-h-60 overflow-auto shadow-2xl">
                      {allServers.map(s => (
                        <button key={s.server_name} onClick={() => { const ep = s.server_data.find(e => e.slug === currentEpisode.slug) || s.server_data[0]; if (ep) onSelectEpisode(ep, s, videoRef.current?.currentTime); setShowServerMenu(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-xs ${s.server_name===currentServer.server_name ? 'bg-blue-500 text-white' : 'text-white/80 hover:bg-white/10'}`}>{s.server_name}</button>
                      ))}
                      {allServers.length===0 && <span className="text-xs text-white/40 px-3">Không có server khác</span>}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button onClick={() => { setShowSettings(!showSettings); setShowServerMenu(false); setShowEpisodes(false); }} style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: 9999 }} className="player-menu-btn shrink-0 rounded-full hover:bg-white/10 flex items-center justify-center text-white flex-none aspect-square overflow-hidden"><Settings className="w-4 h-4 shrink-0" /></button>
                  {showSettings && (
                    <div className="player-menu-panel absolute right-0 bottom-10 bg-[#1c1c1e] border border-white/10 rounded-xl p-3 w-56 shadow-2xl">
                      <div className="mb-3">
                        <p className="text-[11px] font-bold text-white/50 uppercase mb-2">Tốc độ</p>
                        <div className="grid grid-cols-4 gap-1">
                          {[0.5,1,1.25,1.5,2].map(v => (
                            <button key={v} onClick={() => { if(videoRef.current) videoRef.current.playbackRate=v; setPlaybackRate(v); }} className={`px-2 py-1.5 rounded-lg text-xs font-medium ${playbackRate===v ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}>{v}x</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-white/50 uppercase mb-2">Chất lượng</p>
                        <div className="flex flex-col gap-1 max-h-32 overflow-auto">
                          <button onClick={() => { if(hlsRef.current) hlsRef.current.currentLevel=-1; setCurrentQuality(-1); }} className={`px-3 py-1.5 rounded-lg text-xs text-left ${currentQuality===-1 ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}>Tự động</button>
                          {qualityLevels.map(lvl => (
                            <button key={lvl.level} onClick={() => { if(hlsRef.current) hlsRef.current.currentLevel=lvl.level; setCurrentQuality(lvl.level); }} className={`px-3 py-1.5 rounded-lg text-xs text-left ${currentQuality===lvl.level ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}>{lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate||0)/1000)}kbps`}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={togglePip} style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: 9999 }} className={`shrink-0 rounded-full hover:bg-white/10 flex items-center justify-center flex-none aspect-square overflow-hidden ${isPip ? 'text-blue-400' : 'text-white'}`}><PictureInPicture2 className="w-4 h-4 shrink-0" /></button>
                <button onClick={toggleFullscreen} style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: 9999 }} className="shrink-0 rounded-full hover:bg-white/10 flex items-center justify-center text-white flex-none aspect-square overflow-hidden">{isFullscreen ? <Minimize className="w-4 h-4 shrink-0" /> : <Maximize className="w-4 h-4 shrink-0" />}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
ChophimPlayer.displayName = 'ChophimPlayer';
