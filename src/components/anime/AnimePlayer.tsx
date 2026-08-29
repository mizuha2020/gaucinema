import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AnimeStreamSource } from '../../types/anime';
import { proxiedStreamUrl } from '../../services/animapperService';
import { Loader2, X, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';

interface AnimePlayerProps {
  source: AnimeStreamSource | null;
  title?: string;
  episodeLabel?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return '0:00';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const AnimePlayer: React.FC<AnimePlayerProps> = ({
  source,
  title,
  episodeLabel,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setError(null);
    setLoading(true);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    const video = videoRef.current;
    if (!video || !source) return;

    const referer = source.proxyHeaders?.Referer;
    const origin = source.proxyHeaders?.Origin;
    video.muted = true; // allow autoplay; user can unmute

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    if (source.type === 'EMBED') {
      setLoading(false);
      return () => cleanup();
    }

    const finalUrl = proxiedStreamUrl(source.url, referer, origin);

    if (source.type === 'HLS' && Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: false,
        xhrSetup: (xhr, url) => {
          if (url.includes('/api/proxy/animapper-stream')) {
            xhr.open('GET', url, true);
          } else {
            xhr.open('GET', proxiedStreamUrl(url, referer, origin), true);
          }
        },
      });
      hlsRef.current = hls;
      hls.loadSource(finalUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setError('Không thể phát nguồn này. Thử server khác.');
          setLoading(false);
        }
      });
    } else {
      video.src = finalUrl;
      video.addEventListener('loadedmetadata', () => {
        setLoading(false);
        video.play().catch(() => {});
      });
      video.addEventListener('error', () => {
        setError('Không thể phát nguồn này.');
        setLoading(false);
      });
    }

    return () => cleanup();
  }, [source]);

  // Media event listeners for the control bar
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setCurrent(video.currentTime);
    const onMeta = () => setDuration(video.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('durationchange', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('durationchange', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [onClose]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const seek = (val: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = val;
  };
  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else containerRef.current?.requestFullscreen().catch(() => {});
  };

  if (!source) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-12 bg-zinc-950 border-b border-yellow-500/20 shrink-0">
        <div className="min-w-0">
          <p className="text-yellow-400 font-semibold text-sm truncate">{title}</p>
          {episodeLabel && <p className="text-zinc-400 text-xs truncate">{episodeLabel}</p>}
        </div>
        <button
          onClick={onClose}
          className="ml-3 w-9 h-9 rounded-full bg-zinc-900 hover:bg-red-600 text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
          aria-label="Đóng"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Video */}
      <div className="flex-1 relative bg-black flex items-center justify-center min-h-0">
        {source.type === 'EMBED' ? (
          <iframe
            src={source.url}
            title={title}
            className="w-full h-full border-0"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full max-h-full bg-black"
            playsInline
          />
        )}

        {loading && source.type !== 'EMBED' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center px-6">
              <p className="text-red-400 font-semibold mb-3">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-yellow-400 text-black font-semibold text-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Control bar */}
      {source.type !== 'EMBED' && (
        <div className="shrink-0 bg-zinc-950 border-t border-yellow-500/20 px-3 py-2 space-y-2">
          {/* Seek */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full accent-yellow-400 cursor-pointer"
          />
          <div className="flex items-center gap-3 text-zinc-300">
            <div className="flex items-center gap-1">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Tập trước"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="w-9 h-9 flex items-center justify-center rounded bg-yellow-400 text-black hover:bg-yellow-300"
                aria-label={playing ? 'Tạm dừng' : 'Phát'}
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={onNext}
                disabled={!hasNext}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Tập sau"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs tabular-nums text-zinc-400">
              {fmt(current)} / {fmt(duration)}
            </span>

            <div className="flex items-center gap-1 ml-auto">
              <button onClick={toggleMute} className="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-800" aria-label="Âm lượng">
                {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="w-20 accent-yellow-400 cursor-pointer"
              />
              <button onClick={toggleFullscreen} className="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-800" aria-label="Toàn màn hình">
                {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
