import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Movie } from '../types';
import { Play, Info, Plus, Check, Volume2, VolumeX, ChevronRight, ChevronLeft, Sparkles, Star } from 'lucide-react';
import { getImageUrl, getHeroImageUrl, getTmdbBackdropUrl } from '../services/movieApi';
import { motion, AnimatePresence } from 'motion/react';

const HERO_LIMIT = 10;

interface HeroBannerProps {
  movies: Movie[];
  onPlay?: (movie: Movie) => void;
  onPlayMovie?: (movie: Movie) => void;
  onOpenDetail?: (movie: Movie) => void;
  onSelectMovie?: (movie: Movie) => void;
  onToggleMyList: (movie: Movie) => void;
  isInMyList: boolean | ((slug: string) => boolean);
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  movies,
  onPlay,
  onPlayMovie,
  onOpenDetail,
  onSelectMovie,
  onToggleMyList,
  isInMyList,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tmdbBackdropMap, setTmdbBackdropMap] = useState<Record<string, string>>({});

  const heroMovies = useMemo(() => (movies || []).slice(0, HERO_LIMIT), [movies]);

  const handlePlay = onPlay || onPlayMovie || (() => {});
  const handleOpenDetail = onOpenDetail || onSelectMovie || (() => {});

  const resetInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!heroMovies || heroMovies.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % heroMovies.length);
    }, 9000);
  }, [heroMovies]);

  // Auto rotate featured hero movie every 9 seconds if not interacted
  useEffect(() => {
    resetInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resetInterval]);

  // Keep currentIndex within bounds when heroMovies length changes
  useEffect(() => {
    if (currentIndex >= heroMovies.length && heroMovies.length > 0) {
      setCurrentIndex(0);
    }
  }, [heroMovies.length, currentIndex]);

  // Fetch TMDB backdrop/poster for all hero movies (all should have TMDB)
  useEffect(() => {
    let cancelled = false;
    if (!heroMovies.length) return;
    heroMovies.forEach(async (m) => {
      const tmdbId = (m as any)?.tmdb?.id ? String((m as any).tmdb.id).trim() : '';
      if (!tmdbId || !/^\d+$/.test(tmdbId)) return;
      if (tmdbBackdropMap[m.slug]) return;
      try {
        const url = await getTmdbBackdropUrl(tmdbId);
        if (url && !cancelled) {
          setTmdbBackdropMap((prev) => (prev[m.slug] ? prev : { ...prev, [m.slug]: url }));
        }
      } catch {}
    });
    return () => { cancelled = true; };
  }, [heroMovies]);

  if (!heroMovies || heroMovies.length === 0) {
    return (
      <div className="relative w-full h-[75vh] min-h-[540px] max-h-[780px] bg-[#070b16] overflow-hidden flex items-end p-6 sm:p-12 lg:p-16">
        <div className="absolute inset-0 bg-gradient-to-t from-[#070b16] via-[#070b16]/60 to-transparent z-10" />
        <div className="relative z-20 space-y-4 max-w-2xl w-full animate-pulse">
          <div className="h-6 w-36 bg-blue-900/40 rounded-full" />
          <div className="h-12 sm:h-16 w-3/4 bg-slate-800/80 rounded-2xl" />
          <div className="h-4 w-full bg-slate-800/50 rounded-lg" />
          <div className="h-4 w-2/3 bg-slate-800/50 rounded-lg" />
          <div className="flex gap-4 pt-4">
            <div className="h-12 w-36 bg-blue-600/30 rounded-xl" />
            <div className="h-12 w-36 bg-slate-800/60 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const currentMovie = heroMovies[currentIndex] || heroMovies[0];
  const inList =
    typeof isInMyList === 'function'
      ? currentMovie
        ? isInMyList(currentMovie.slug)
        : false
      : Boolean(isInMyList);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? heroMovies.length - 1 : prev - 1));
    resetInterval();
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % heroMovies.length);
    resetInterval();
  };

  const getHeroSrc = (movie: Movie) => {
    if (!movie) return '';
    // 1. TMDB backdrop fetched via API (highest priority - original quality)
    const tmdbFetched = tmdbBackdropMap[movie.slug];
    if (tmdbFetched) return tmdbFetched;
    // 2. Direct TMDB backdrop/poster already in payload
    if (movie.backdrop_url && movie.backdrop_url.includes('image.tmdb.org')) {
      return movie.backdrop_url;
    }
    if (movie.poster_url && movie.poster_url.includes('image.tmdb.org')) {
      return movie.poster_url.replace('/w500', '/original');
    }
    // 3. backdrop_url field often contains TMDB original path proxy via server
    if (movie.backdrop_url) {
      return getHeroImageUrl(movie.backdrop_url, (movie as any).source);
    }
    // 4. Fallback to poster/thumb via optimized hero url (still works, but ideally all hero items have TMDB)
    return getHeroImageUrl(movie.poster_url || movie.thumb_url, (movie as any).source);
  };

  return (
    <div id="qtb-hero-banner" className="relative w-full h-[75vh] min-h-[540px] max-h-[780px] bg-[#0b1329] overflow-hidden select-none">
      {/* Background Image with Dynamic Fade Transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentMovie.slug || currentIndex}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute inset-0 w-full h-full"
        >
          <img
            src={getHeroSrc(currentMovie)}
            alt={currentMovie.name}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover object-top filter brightness-85"
            onError={(e) => {
              // fallback to normal poster if TMDB backdrop fails
              const fallback = getImageUrl(currentMovie.poster_url || currentMovie.thumb_url, (currentMovie as any).source);
              if ((e.target as HTMLImageElement).src !== fallback) {
                (e.target as HTMLImageElement).src = fallback;
              } else {
                (e.target as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&auto=format&fit=crop&q=80';
              }
            }}
          />
          {/* Multi-layered Gấu navy cinematic gradients */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b1329] via-[#0b1329]/80 to-transparent w-full md:w-3/4" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1329] via-[#0b1329]/30 to-transparent" />
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#070b16]/90 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Content Container */}
      <div className="relative max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-12 sm:pb-24 z-10">
        <div className="max-w-2xl space-y-3 sm:space-y-4">
          {/* Badges / Category pill */}
          <div className="flex items-center flex-wrap gap-2 text-xs font-semibold">
            <span className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2.5 py-0.5 rounded-full font-bold tracking-wide text-[11px] uppercase shadow-lg shadow-blue-600/30">
              <Sparkles className="w-3 h-3 text-sky-200" /> Gấu NỔI BẬT
            </span>
            {currentMovie.quality && (
              <span className="bg-slate-800/90 text-sky-200 border border-blue-900/60 px-2 py-0.5 rounded-md">
                {currentMovie.quality}
              </span>
            )}
            {currentMovie.lang && (
              <span className="bg-slate-800/90 text-slate-200 border border-slate-700 px-2 py-0.5 rounded-md">
                {currentMovie.lang}
              </span>
            )}
            {currentMovie.year && (
              <span className="text-slate-300 font-normal">{currentMovie.year}</span>
            )}
            {currentMovie.episode_current && (
              <span className="text-sky-400 font-semibold">{currentMovie.episode_current}</span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] line-clamp-2">
            {currentMovie.name}
          </h1>

          {/* Origin Name */}
          {currentMovie.origin_name && (
            <p className="text-xs sm:text-base text-slate-300 font-medium tracking-wide drop-shadow line-clamp-1">
              {currentMovie.origin_name}
            </p>
          )}

          {/* Description (Rich/Clean) */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-xl drop-shadow-md">
            {currentMovie.content
              ? currentMovie.content.replace(/<[^>]*>?/gm, '')
              : `Khám phá câu chuyện lôi cuốn trong siêu phẩm "${currentMovie.name}". Trải nghiệm trọn vẹn trên Gấu Cinema với chất lượng hình ảnh sắc nét, âm thanh sống động.`}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2.5 sm:gap-3 pt-1 sm:pt-2">
            <button
              id="hero-play-btn"
              onClick={() => handlePlay(currentMovie)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2 sm:px-8 sm:py-3 rounded-xl font-bold text-xs sm:text-base transition-all duration-200 shadow-xl shadow-blue-600/30 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
              <span>Xem Ngay</span>
            </button>

            <button
              id="hero-detail-btn"
              onClick={() => handleOpenDetail(currentMovie)}
              className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 hover:text-white px-4 py-2 sm:px-7 sm:py-3 rounded-xl font-semibold text-xs sm:text-base backdrop-blur-sm transition-all duration-200 border border-slate-700/80 shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
              <span>Thông Tin</span>
            </button>

            <button
              id="hero-add-list-btn"
              onClick={() => onToggleMyList(currentMovie)}
              className={`p-2 sm:p-3 rounded-full border transition-all duration-200 cursor-pointer ${
                inList
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
              }`}
              title={inList ? 'Đã thêm vào danh sách' : 'Thêm vào danh sách của tôi'}
            >
              {inList ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Plus className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Indicators & Next/Prev Controls (Positioned cleanly on Desktop & Tablet) */}
      <div className="absolute right-4 sm:right-8 bottom-4 sm:bottom-24 z-20 hidden sm:flex items-center gap-3">
        {/* Pagination Dots - 10 films */}
        <div className="flex items-center gap-1.5 mr-2 max-w-[220px] flex-wrap justify-end">
          {heroMovies.map((_, idx) => (
            <button
              key={idx}
              onClick={() => { setCurrentIndex(idx); resetInterval(); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-6 bg-blue-500' : 'w-2 bg-slate-600 hover:bg-slate-400'
              }`}
              aria-label={`Chuyển đến phim ${idx + 1}`}
            />
          ))}
        </div>

        {/* Prev / Next buttons */}
        <button
          id="hero-prev-btn"
          onClick={handlePrev}
          className="w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-800 text-slate-200 flex items-center justify-center border border-slate-700 transition-colors"
          aria-label="Phim trước"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          id="hero-next-btn"
          onClick={handleNext}
          className="w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-800 text-slate-200 flex items-center justify-center border border-slate-700 transition-colors"
          aria-label="Phim kế tiếp"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Pagination Dots (visible on <sm) - 10 films */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex sm:hidden items-center gap-1.5 bg-black/40 backdrop-blur px-3 py-2 rounded-full border border-white/10">
        {heroMovies.map((_, idx) => (
          <button
            key={idx}
            onClick={() => { setCurrentIndex(idx); resetInterval(); }}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === currentIndex ? 'w-5 bg-blue-500' : 'w-1.5 bg-white/50'
            }`}
            aria-label={`Chuyển đến phim ${idx + 1}`}
          />
        ))}
      </div>
      {/* Counter badge: 1 / 10 */}
      <div className="absolute top-4 right-4 z-20 sm:hidden bg-black/60 text-white text-[11px] font-bold px-2.5 py-1 rounded-full border border-white/10">
        {currentIndex + 1} / {heroMovies.length}
      </div>
    </div>
  );
};
