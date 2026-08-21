import React, { useEffect, useState, useMemo, useRef } from 'react';
import { EpisodeServer, Movie, MovieEpisode } from '../types';
import { movieApi, getImageUrl } from '../services/movieApi';
import {
  Play,
  Plus,
  Check,
  Calendar,
  Clock,
  Globe,
  Tv,
  Sparkles,
  Video,
  Share2,
  Bookmark,
  Info,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MovieDetailModalProps {
  movie: Movie | null;
  onClose: () => void;
  onPlayEpisode?: (movie: Movie, episode: MovieEpisode, server: EpisodeServer) => void;
  onPlayMovie?: (movie: Movie) => void;
  onToggleMyList: (movie: Movie) => void;
  isInMyList: boolean | ((slug: string) => boolean);
  onSelectRelatedMovie?: (movie: Movie) => void;
}

// Helper to parse Trailer URL (supports YouTube watch, embed, short links, or direct videos)
function parseTrailerUrl(url?: string): { type: 'youtube' | 'direct'; videoId?: string; embedUrl?: string; directUrl?: string } | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();

  // YouTube match regex
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = trimmed.match(ytRegex);

  if (match && match[1]) {
    const videoId = match[1];
    return {
      type: 'youtube',
      videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return {
      type: 'direct',
      directUrl: trimmed,
    };
  }

  return null;
}

export const MovieDetailModal: React.FC<MovieDetailModalProps> = ({
  movie,
  onClose,
  onPlayEpisode,
  onPlayMovie,
  onToggleMyList,
  isInMyList,
  onSelectRelatedMovie,
}) => {
  const [fullMovieData, setFullMovieData] = useState<Movie | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeServer[]>([]);
  const [selectedServerIndex, setSelectedServerIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relatedMovies, setRelatedMovies] = useState<Movie[]>([]);
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [isCopiedLink, setIsCopiedLink] = useState(false);

  // Trailer states
  const [showTrailer, setShowTrailer] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Lock background scroll while modal is open to ensure only 1 scrollbar exists
  useEffect(() => {
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
    };
  }, []);

  // Close on Escape (closes trailer popup if open, else closes detail modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTrailer) {
          setShowTrailer(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTrailer, onClose]);

  // Scroll to top on mount or movie change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [movie?.slug]);

  // Fetch full details and episodes
  useEffect(() => {
    if (!movie) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setShowTrailer(false);

    const loadDetail = async () => {
      try {
        const data = await movieApi.getMovieDetail(movie.slug);
        if (isMounted) {
          setFullMovieData(data.movie);
          setEpisodes(data.episodes || []);
          setSelectedServerIndex(0);

          // Fetch related movies by category
          if (data.movie.category && data.movie.category.length > 0) {
            const firstCat = data.movie.category[0].slug;
            const relatedRes = await movieApi.getByGenre(firstCat, 1, 12);
            if (isMounted) {
              setRelatedMovies(
                (relatedRes.items || []).filter((m) => m.slug !== movie.slug).slice(0, 8)
              );
            }
          }
        }
      } catch (err: any) {
        console.error('Failed to load movie detail', err);
        if (isMounted) {
          setError(err.message || 'Không thể tải thông tin chi tiết phim');
          setFullMovieData(movie);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDetail();
    return () => {
      isMounted = false;
    };
  }, [movie]);

  const currentData = fullMovieData || movie;
  const inList =
    typeof isInMyList === 'function'
      ? currentData
        ? isInMyList(currentData.slug)
        : false
      : Boolean(isInMyList);
  const currentServer = episodes[selectedServerIndex];
  const serverEpisodes = currentServer?.server_data || [];

  // Parse trailer url from movie data
  const trailerInfo = useMemo(() => {
    return parseTrailerUrl(currentData?.trailer_url);
  }, [currentData?.trailer_url]);

  const hasTrailer = Boolean(trailerInfo);

  // Static YouTube embed URL for trailer popup modal
  const youtubeEmbedUrl = useMemo(() => {
    if (!trailerInfo || trailerInfo.type !== 'youtube') return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${trailerInfo.embedUrl}?autoplay=1&controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${origin}`;
  }, [trailerInfo]);

  // User clicks "Xem Trailer" -> Open centered popup modal
  const handleUserWatchTrailer = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowTrailer(true);
  };

  const handleCloseTrailer = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowTrailer(false);
  };

  // Copy share link
  const handleShareMovie = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setIsCopiedLink(true);
      setTimeout(() => setIsCopiedLink(false), 2500);
    }
  };

  const filteredEpisodes = episodeSearch.trim()
    ? serverEpisodes.filter(
        (ep) =>
          ep.name.toLowerCase().includes(episodeSearch.toLowerCase()) ||
          ep.slug.toLowerCase().includes(episodeSearch.toLowerCase())
      )
    : serverEpisodes;

  const handleStartPlay = async () => {
    if (!currentData) return;
    if (serverEpisodes.length > 0 && currentServer) {
      if (onPlayEpisode) {
        onPlayEpisode(currentData, serverEpisodes[0], currentServer);
      } else if (onPlayMovie) {
        onPlayMovie(currentData);
      }
      return;
    }

    try {
      setIsLoading(true);
      const data = await movieApi.getMovieDetail(currentData.slug);
      if (data.episodes && data.episodes.length > 0 && data.episodes[0].server_data.length > 0) {
        setFullMovieData(data.movie);
        setEpisodes(data.episodes);
        setSelectedServerIndex(0);
        if (onPlayEpisode) {
          onPlayEpisode(data.movie || currentData, data.episodes[0].server_data[0], data.episodes[0]);
        } else if (onPlayMovie) {
          onPlayMovie(data.movie || currentData);
        }
      } else {
        setError('Hiện chưa có luồng phát cho phim này. Vui lòng thử lại sau.');
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể tải luồng phát của phim');
    } finally {
      setIsLoading(false);
    }
  };

  if (!movie || !currentData) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        id="movie-detail-fullpage"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed inset-0 z-[60] bg-[#060a14] overflow-y-auto text-white flex flex-col selection:bg-blue-600 selection:text-white overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Top-Right Circular Close Button (Positioned safely below Mobile Status Bar / PWA Notch & Safe Area) */}
        <button
          id="detail-floating-close-btn"
          onClick={onClose}
          style={{
            top: 'max(52px, calc(env(safe-area-inset-top, 0px) + 16px))',
            right: 'max(16px, calc(env(safe-area-inset-right, 0px) + 16px))',
          }}
          className="fixed z-50 flex items-center justify-center w-11 h-11 rounded-full bg-black/85 hover:bg-rose-600/95 text-white backdrop-blur-md border border-white/25 hover:border-rose-400 shadow-2xl transition-all hover:scale-110 active:scale-95 cursor-pointer group sm:!top-6 sm:!right-6"
          title="Đóng (Esc)"
          aria-label="Đóng chi tiết phim"
        >
          <X className="w-5 h-5 transition-transform group-hover:rotate-90" />
        </button>

        {/* Full-bleed Hero Stage (Panoramic Backdrop) */}
        <section
          id="detail-hero-stage"
          className="relative w-full min-h-[480px] sm:min-h-[520px] md:min-h-[580px] lg:min-h-[640px] bg-black select-none flex flex-col justify-end"
        >
            <div className="relative w-full h-full min-h-[480px] sm:min-h-[520px] md:min-h-[580px] lg:min-h-[640px] flex flex-col justify-end pt-24 sm:pt-28 pb-8 sm:pb-12">
              <img
                src={getImageUrl(currentData.poster_url || currentData.thumb_url)}
                alt={currentData.name}
                className="absolute inset-0 w-full h-full object-cover object-top sm:object-center pointer-events-none"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&auto=format&fit=crop&q=80';
                }}
              />
              {/* Multi-layered cinematic gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#060a14] via-[#060a14]/65 to-black/30 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#060a14]/95 via-[#060a14]/50 to-transparent pointer-events-none" />

              {/* Hero Banner Content Overlay */}
              <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                <div className="max-w-3xl space-y-3 sm:space-y-4">
                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-black uppercase px-3 py-1 rounded-full shadow-lg shadow-blue-600/30">
                      Gấu Cinema HD
                    </span>
                    {currentData.quality && (
                      <span className="bg-slate-900/90 text-sky-300 border border-blue-800/80 text-xs font-semibold px-2.5 py-0.5 rounded-md">
                        {currentData.quality}
                      </span>
                    )}
                    {currentData.lang && (
                      <span className="bg-slate-900/90 text-slate-200 border border-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-md">
                        {currentData.lang}
                      </span>
                    )}
                    {currentData.year && (
                      <span className="text-slate-300 text-xs font-medium bg-slate-900/60 px-2 py-0.5 rounded">
                        {currentData.year}
                      </span>
                    )}
                  </div>

                  {/* Title & Origin Name */}
                  <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white drop-shadow-2xl tracking-tight leading-tight">
                    {currentData.name}
                  </h1>
                  {currentData.origin_name && (
                    <p className="text-xs sm:text-base md:text-lg text-slate-300 font-medium drop-shadow">
                      {currentData.origin_name}
                    </p>
                  )}

                  {/* Primary Hero Actions (Chỉ có 1 nút Xem Trailer ở đây) */}
                  <div className="flex flex-wrap items-center gap-3 pt-1 sm:pt-2">
                    <button
                      id="hero-primary-play-btn"
                      onClick={handleStartPlay}
                      className="flex items-center gap-2 bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 sm:px-8 py-2.5 sm:py-3.5 rounded-2xl font-bold text-sm sm:text-base shadow-2xl shadow-blue-600/40 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
                      <span>Xem Phim Ngay</span>
                    </button>

                    {hasTrailer && (
                      <button
                        id="hero-open-trailer-btn"
                        onClick={handleUserWatchTrailer}
                        className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl font-bold text-xs sm:text-sm shadow-xl transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                      >
                        <Video className="w-4 h-4 text-rose-400" />
                        <span>Xem Trailer</span>
                      </button>
                    )}

                    <button
                      id="hero-toggle-list-btn"
                      onClick={() => onToggleMyList(currentData)}
                      className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl font-bold text-xs sm:text-sm border transition-all cursor-pointer ${
                        inList
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-xl shadow-emerald-600/30'
                          : 'bg-slate-900/90 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {inList ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Đã lưu</span>
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-4 h-4 text-sky-400" />
                          <span>Lưu phim</span>
                        </>
                      )}
                    </button>

                    {/* Share / Copy Link Button next to Save */}
                    <button
                      id="hero-share-btn"
                      onClick={handleShareMovie}
                      className="relative flex items-center justify-center p-2.5 sm:p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xl"
                      title="Sao chép link phim"
                      aria-label="Chia sẻ phim"
                    >
                      <Share2 className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                      {isCopiedLink && (
                        <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-2xl animate-in fade-in z-30">
                          Đã sao chép link!
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

        {/* Dedicated Centered Trailer Popup Modal */}
        <AnimatePresence>
          {showTrailer && hasTrailer && trailerInfo && (
            <motion.div
              id="trailer-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 md:p-8"
              onClick={handleCloseTrailer}
            >
              <motion.div
                id="trailer-modal-card"
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="relative w-full max-w-4xl bg-[#090e1a] border border-slate-700/90 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header of Trailer Modal */}
                <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5 bg-slate-900/95 border-b border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-rose-600/20 text-rose-400 border border-rose-500/30 shrink-0">
                      <Video className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-bold text-white truncate">
                        Trailer: {currentData.name}
                      </h3>
                      {currentData.origin_name && (
                        <p className="text-xs text-slate-400 truncate hidden sm:block">
                          {currentData.origin_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    id="trailer-modal-close-btn"
                    onClick={handleCloseTrailer}
                    className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700 hover:border-rose-500 shrink-0"
                    title="Đóng trailer (Esc)"
                    aria-label="Đóng trailer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Video Stage */}
                <div className="relative w-full aspect-video bg-black flex items-center justify-center">
                  {trailerInfo.type === 'youtube' ? (
                    <iframe
                      ref={iframeRef}
                      src={youtubeEmbedUrl}
                      title={`Trailer ${currentData.name}`}
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      src={trailerInfo.directUrl}
                      autoPlay
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Body - Optimized for Desktop, Tablet, and Mobile */}
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8 sm:space-y-10 flex-1">

          {/* Details & Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Left 2 Cols on tablet/desktop: Highlights & Synopsis */}
            <div className="md:col-span-2 space-y-6">
              {/* Highlights Bar */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 p-4 rounded-2xl bg-[#0c1427] border border-slate-800/80 text-xs sm:text-sm">
                <span className="text-emerald-400 font-bold">98% Phù hợp</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />
                  <span>Năm {currentData.year || '2024'}</span>
                </span>
                {currentData.time && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
                      <span>{currentData.time}</span>
                    </span>
                  </>
                )}
                {currentData.episode_current && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-sky-300 font-bold bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded-md">
                      {currentData.episode_current}
                    </span>
                  </>
                )}
              </div>

              {/* Synopsis Section */}
              <div className="p-5 sm:p-6 rounded-2xl bg-[#0c1427] border border-slate-800/80 space-y-3">
                <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-4 h-4 text-sky-400" />
                  <span>Nội dung phim</span>
                </h3>
                <div className="text-xs sm:text-sm md:text-base text-slate-300 leading-relaxed max-h-72 overflow-y-auto pr-2">
                  {currentData.content ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: currentData.content,
                      }}
                    />
                  ) : (
                    <p>
                      Trải nghiệm bộ phim hấp dẫn với độ phân giải cao và âm thanh sống động. Bạn có thể
                      lựa chọn bất kỳ tập phim nào bên dưới để thưởng thức ngay lập tức mà không có
                      bất kỳ quảng cáo phiền toái nào.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Cast, Directors, Meta Card */}
            <div className="space-y-6">
              <div className="p-5 sm:p-6 rounded-2xl bg-[#0c1427] border border-slate-800/80 space-y-4 text-xs sm:text-sm">
                <h4 className="text-xs uppercase font-extrabold tracking-wider text-sky-400 pb-2 border-b border-slate-800">
                  Thông Tin Chi Tiết
                </h4>

                {currentData.actor && currentData.actor.length > 0 && (
                  <div>
                    <span className="text-slate-400 block mb-1 font-semibold">Diễn viên:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Array.isArray(currentData.actor) ? currentData.actor : [String(currentData.actor)]).map(
                        (act, i) => (
                          <span
                            key={i}
                            className="bg-slate-900 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-800 text-xs"
                          >
                            {act}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

                {currentData.director && currentData.director.length > 0 && (
                  <div>
                    <span className="text-slate-400 block mb-1 font-semibold">Đạo diễn:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Array.isArray(currentData.director) ? currentData.director : [String(currentData.director)]).map(
                        (dir, i) => (
                          <span
                            key={i}
                            className="bg-slate-900 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-800 text-xs"
                          >
                            {dir}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

                {currentData.category && currentData.category.length > 0 && (
                  <div>
                    <span className="text-slate-400 block mb-1 font-semibold">Thể loại:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentData.category.map((cat) => (
                        <span
                          key={cat.slug}
                          className="bg-blue-950/60 text-sky-300 px-2.5 py-1 rounded-lg border border-blue-900/60 text-xs font-medium"
                        >
                          {cat.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {currentData.country && currentData.country.length > 0 && (
                  <div>
                    <span className="text-slate-400 block mb-1 font-semibold">Quốc gia:</span>
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      <span>{currentData.country.map((c) => c.name).join(', ')}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Episode List Section */}
          <section id="detail-episodes-section" className="p-5 sm:p-8 rounded-2xl bg-[#0c1427] border border-blue-900/50 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-sky-400">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-xl font-bold text-white">
                    Danh Sách Tập Phim
                  </h3>
                  <p className="text-xs text-slate-400">
                    Tổng cộng {serverEpisodes.length} tập • Hỗ trợ phát chuẩn Full HD
                  </p>
                </div>
              </div>

              {/* Server Selector if multiple servers exist */}
              {episodes.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-xs text-slate-400 shrink-0">Chọn Nguồn / Server:</span>
                  {episodes.map((srv, idx) => (
                    <button
                      key={idx}
                      id={`select-server-tab-${idx}`}
                      onClick={() => setSelectedServerIndex(idx)}
                      className={`text-xs px-3.5 py-1.5 rounded-xl font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                        selectedServerIndex === idx
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-bold border border-blue-400'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                      }`}
                    >
                      {srv.sourceLabel && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-slate-950/80 text-sky-300 font-extrabold border border-blue-800/60">
                          {srv.sourceLabel}
                        </span>
                      )}
                      <span>{srv.server_name || `Server ${idx + 1}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Episode Search for long series */}
            {serverEpisodes.length > 15 && (
              <div className="max-w-xs">
                <input
                  type="text"
                  placeholder="Tìm nhanh tập (vd: 1, 10, tập cuối...)"
                  value={episodeSearch}
                  onChange={(e) => setEpisodeSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Episode Grid */}
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 text-sm animate-pulse">
                Đang nạp danh sách tập phim...
              </div>
            ) : filteredEpisodes.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5 sm:gap-3 max-h-96 overflow-y-auto pr-1">
                {filteredEpisodes.map((ep, idx) => (
                  <button
                    key={ep.slug || idx}
                    id={`detail-ep-btn-${ep.slug}`}
                    onClick={() => {
                      if (onPlayEpisode) {
                        onPlayEpisode(currentData, ep, currentServer);
                      } else if (onPlayMovie) {
                        onPlayMovie(currentData);
                      }
                    }}
                    className="group flex flex-col items-center justify-center p-2.5 sm:p-3 bg-slate-900 hover:bg-blue-600 border border-slate-800 hover:border-blue-500 rounded-xl transition-all text-center cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                  >
                    <span className="text-xs sm:text-sm font-bold text-white group-hover:text-white line-clamp-1">
                      {ep.name.startsWith('Tập') ? ep.name : `Tập ${ep.name}`}
                    </span>
                    <span className="text-[10px] text-sky-400 group-hover:text-sky-100 flex items-center gap-1 mt-1 font-semibold">
                      <Play className="w-2.5 h-2.5 fill-current" /> Phát HD
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 bg-slate-900/50 rounded-xl text-center text-slate-400 text-sm border border-slate-800">
                {episodeSearch
                  ? 'Không tìm thấy tập phim phù hợp.'
                  : 'Phim đang cập nhật tập mới, bạn có thể nhấn "Xem Phim Ngay" để phát nguồn chính.'}
              </div>
            )}
          </section>

          {/* Related Movies Section */}
          {relatedMovies.length > 0 && (
            <section id="detail-related-section" className="space-y-4 pt-2 sm:pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                  <span>Phim Tương Tự Cùng Thể Loại</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
                {relatedMovies.map((m) => (
                  <div
                    key={m.slug}
                    id={`detail-related-movie-${m.slug}`}
                    onClick={() => {
                      if (onSelectRelatedMovie) {
                        onSelectRelatedMovie(m);
                      }
                      if (containerRef.current) {
                        containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="group cursor-pointer bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-blue-500/80 transition-all hover:scale-105 shadow-md flex flex-col"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden relative">
                      <img
                        src={getImageUrl(m.poster_url || m.thumb_url)}
                        alt={m.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80';
                        }}
                      />
                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="p-2 bg-blue-600 rounded-full text-white shadow-lg">
                          <Play className="w-4 h-4 fill-white" />
                        </span>
                      </div>
                    </div>
                    <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between">
                      <h4 className="text-xs font-semibold text-white truncate group-hover:text-sky-300">
                        {m.name}
                      </h4>
                      <span className="text-[10px] text-slate-400 mt-1">{m.year || '2024'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bottom Footer */}
          <footer className="pt-6 pb-4 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500 text-xs">
            <p>© 2026 Gấu Cinema • Trải nghiệm điện ảnh gia đình chất lượng cao</p>
            <button
              onClick={onClose}
              className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
            >
              ← Quay lại danh sách phim
            </button>
          </footer>
        </main>
      </motion.div>
    </AnimatePresence>
  );
};
